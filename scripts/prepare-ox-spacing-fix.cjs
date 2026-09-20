const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert/strict');
const { readBank } = require('./ox-import-data.cjs');

const auditFile = process.argv.find(arg => arg.startsWith('--audit='))?.slice(8);
const audit = auditFile ? JSON.parse(fs.readFileSync(auditFile, 'utf8')) : require('../docs/criminal-law-ox-spacing-audit-20260920.json');
const actor = audit.actor || 'spacing-correction-20260920';
const md5 = value => crypto.createHash('md5').update(value).digest('hex');
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const remove = (value, positions) => [...value].filter((_, index) => !positions.includes(index + 1)).join('');
const literal = value => "'" + value.replace(/'/g, "''") + "'";

// Retain original HTML bytes and underline boundaries; remove only mapped spaces.
function htmlMap(html) {
  let plain = '';
  const offsets = [];
  for (const match of html.matchAll(/<\/?u>|&(?:amp|lt|gt|quot|#39|#x27);|[^]/gu)) {
    if (match[0].startsWith('<')) continue;
    const decoded = ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&#x27;': "'" })[match[0]] || match[0];
    for (let index = 0; index < decoded.length; index++) offsets.push(match.index);
    plain += decoded;
  }
  return { plain, offsets };
}

function loadBank(review) {
  assert.equal(sha256(fs.readFileSync(review.source)), review.source_sha256, 'Audit source changed');
  const bank = readBank(review.source);
  if (review.baseline_audit_file) {
    const baseline = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', review.baseline_audit_file), 'utf8'));
    const questions = new Map(bank.questions.map(q => [q.id, q]));
    for (const patch of buildPatches(baseline)) for (const field of patch.fields) {
      const q = questions.get(patch.id);
      assert.equal(q[field.field], field.before);
      q[field.field] = field.after;
    }
  }
  return bank;
}

function buildPatches(review = audit) {
  const bank = loadBank(review);
  const questions = new Map(bank.questions.map(q => [q.id, q]));
  const grouped = new Map();
  for (const finding of review.findings.filter(f => f.classification === 'reviewed_broken_form')) {
    const q = questions.get(finding.question_id);
    assert.equal(q[finding.field].slice(finding.offset, finding.offset + finding.before.length), finding.before);
    assert.equal(finding.suggestion, finding.before.replace(/ /g, ''));
    if (!grouped.has(q.id)) grouped.set(q.id, {});
    const fields = grouped.get(q.id);
    for (const space of finding.before.matchAll(/ /g)) (fields[finding.field] ||= new Set()).add(finding.offset + space.index);
  }
  return [...grouped].sort(([a], [b]) => a.localeCompare(b)).map(([id, edits]) => {
    const q = questions.get(id);
    if (edits.explanation) {
      const mapped = htmlMap(q.explanation_html);
      assert.equal(mapped.plain, q.explanation, id + ': HTML mismatch');
      edits.explanation_html = new Set([...edits.explanation].map(offset => mapped.offsets[offset]));
    }
    const fields = Object.entries(edits).map(([field, offsets]) => {
      const before = q[field];
      for (const offset of offsets) assert.equal(before[offset], ' ');
      const positions = [...offsets].map(offset => [...before.slice(0, offset)].length + 1).sort((a, b) => b - a);
      const after = remove(before, positions);
      assert.notEqual(before, after);
      assert.equal(before.replace(/ /g, ''), after.replace(/ /g, ''));
      return { field, before_md5: md5(before), after_md5: md5(after), positions, before, after };
    });
    const explanation = fields.find(f => f.field === 'explanation');
    if (explanation) {
      const html = fields.find(f => f.field === 'explanation_html');
      assert.equal(htmlMap(html.after).plain, explanation.after);
      assert.deepEqual(html.before.match(/<\/?u>/g), html.after.match(/<\/?u>/g));
    }
    return { id, fields };
  });
}

function payload(patches) {
  return patches.map(q => ({ id: q.id, fields: q.fields.map(({ before, after, ...field }) => field) }));
}

function preflightSql(patches) {
  return `with patches as (select * from jsonb_array_elements(${literal(JSON.stringify(payload(patches)))}::jsonb)),
  checks as (select p.value->>'id' id, f.value->>'field' field, q.id is not null found,
    md5(q.entry->>(f.value->>'field')) = f.value->>'before_md5' original,
    md5(q.entry->>(f.value->>'field')) = f.value->>'after_md5' corrected
    from patches p cross join lateral jsonb_array_elements(p.value->'fields') f
    left join public.ox_questions q on q.id=p.value->>'id')
  select count(distinct id) questions,count(*) fields,
    count(*) filter(where original) original_fields,
    count(*) filter(where corrected) already_corrected_fields,
    coalesce(jsonb_agg(jsonb_build_object('id',id,'field',field)) filter(where not found or not coalesce(original or corrected,false)),'[]'::jsonb) conflicts from checks;`;
}

function applySql(patches) {
  return `begin;
set local lock_timeout='2s';
set local statement_timeout='15s';
do $spacing_fix$
declare
  patch jsonb; edit jsonb; saved public.ox_questions; changed public.ox_questions;
  replacement jsonb; original text; corrected text; position integer;
begin
  for patch in select value from jsonb_array_elements(${literal(JSON.stringify(payload(patches)))}::jsonb) order by value->>'id' loop
    perform pg_advisory_xact_lock(hashtextextended('ox-question:'||(patch->>'id'),0));
    select * into strict saved from public.ox_questions where id=patch->>'id' for update;
    replacement:=saved.entry;
    for edit in select value from jsonb_array_elements(patch->'fields') loop
      if edit->>'field' not in ('prompt','context','explanation','explanation_html') then raise exception 'Unexpected field'; end if;
      original:=saved.entry->>(edit->>'field');
      if md5(original)=edit->>'after_md5' then continue; end if;
      if md5(original) is distinct from edit->>'before_md5' then raise exception 'Concurrent content change: % %',saved.id,edit->>'field'; end if;
      corrected:=original;
      for position in select value::integer from jsonb_array_elements_text(edit->'positions') order by value::integer desc loop
        if substring(corrected from position for 1) <> ' ' then raise exception 'Expected a space: %',saved.id; end if;
        corrected:=overlay(corrected placing '' from position for 1);
      end loop;
      if md5(corrected) is distinct from edit->>'after_md5' or replace(original,' ','')<>replace(corrected,' ','') then raise exception 'Invalid correction: %',saved.id; end if;
      replacement:=jsonb_set(replacement,array[edit->>'field'],to_jsonb(corrected));
    end loop;
    if replacement=saved.entry then continue; end if;
    update public.ox_questions set entry=replacement,revision=revision+1,updated_at=now()
      where id=saved.id returning * into changed;
    if (changed.content_version,changed.chapter_id,changed.status,changed.reviewed) is distinct from
      (saved.content_version,saved.chapter_id,saved.status,saved.reviewed) then raise exception 'Metadata changed'; end if;
    insert into public.ox_question_history(question_id,actor,before_value,after_value)
      values(saved.id,${literal(actor)},to_jsonb(saved),to_jsonb(changed));
  end loop;
end $spacing_fix$;
commit;
select count(*) corrected_questions from public.ox_question_history where actor=${literal(actor)};`;
}

async function verify(patches) {
  const { PGlite } = require(process.env.OX_PGLITE_MODULE || 'C:/Users/Public/Documents/ESTsoft/CreatorTemp/ox-db-tools/node_modules/@electric-sql/pglite');
  const db = new PGlite();
  try {
    await db.exec(`create table ox_questions(id text primary key,chapter_id text,entry jsonb,status text,reviewed boolean,content_version integer,revision integer,updated_at timestamptz);
      create table ox_question_history(question_id text,actor text,before_value jsonb,after_value jsonb);`);
    const bank = loadBank(audit);
    const ids = new Set(patches.map(q => q.id));
    const rows = bank.questions.filter(q => ids.has(q.id));
    await db.query(`insert into ox_questions select q->>'id',q->>'chapter_id',q,q->>'status',true,3,7,now() from jsonb_array_elements($1::jsonb) q`, [JSON.stringify(rows)]);
    const batches = [];
    for (let index = 0; index < patches.length; index += 150) batches.push(patches.slice(index, index + 150));
    for (const batch of batches) await db.exec(applySql(batch));
    for (const batch of batches) await db.exec(applySql(batch));
    const result = await db.query('select * from ox_questions');
    for (const row of result.rows) {
      const patch = patches.find(p => p.id === row.id);
      for (const field of patch.fields) assert.equal(row.entry[field.field], field.after);
      assert.equal(row.content_version, 3);
      assert.equal(row.revision, 8);
      const before = rows.find(q => q.id === row.id);
      for (const key of Object.keys(before).filter(key => !patch.fields.some(f => f.field === key))) assert.deepEqual(row.entry[key], before[key]);
    }
    assert.equal((await db.query('select count(*)::integer n from ox_question_history')).rows[0].n, patches.length);
    // A changed second row must roll back an otherwise valid first-row correction.
    await db.query('update ox_questions set entry=jsonb_set(entry,$1::text[],to_jsonb($2::text)) where id=$3', [[patches[0].fields[0].field],patches[0].fields[0].before,patches[0].id]);
    await db.query('update ox_questions set entry=jsonb_set(entry,$1::text[],to_jsonb($2::text)) where id=$3', [[patches[1].fields[0].field],'Changed by administrator',patches[1].id]);
    await assert.rejects(db.exec(applySql(patches.slice(0, 2))), /Concurrent content change/);
    await db.exec('rollback');
    const rollback = await db.query('select entry from ox_questions where id=$1', [patches[0].id]);
    assert.equal(rollback.rows[0].entry[patches[0].fields[0].field], patches[0].fields[0].before);
    console.log('PASS: all corrections, unchanged metadata, HTML underlines, repeat execution, and conflict rollback');
  } finally { await db.close(); }
}

async function main() {
  const patches = buildPatches();
  if (process.argv.includes('--verify')) await verify(patches);
  const directory = path.join(__dirname, '..', '.tmp', audit.output_directory || 'ox-spacing-fix-20260920');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'patches.json'), JSON.stringify(patches, null, 2));
  const files = [];
  for (let index = 0; index < patches.length; index += 150) {
    const batch = patches.slice(index, index + 150);
    const name = String(files.length + 1).padStart(2, '0');
    fs.writeFileSync(path.join(directory, name + '-preflight.sql'), preflightSql(batch));
    fs.writeFileSync(path.join(directory, name + '-apply.sql'), applySql(batch));
    files.push({ batch: name, questions: batch.length });
  }
  fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify({ actor, questions: patches.length,
    occurrences: patches.flatMap(q => q.fields.filter(f => f.field !== 'explanation_html')).reduce((sum, f) => sum + f.positions.length, 0), batches: files }, null, 2));
  console.log(JSON.stringify({ directory, questions: patches.length, batches: files }, null, 2));
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { loadBank, buildPatches };
