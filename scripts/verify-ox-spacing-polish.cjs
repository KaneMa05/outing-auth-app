const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { loadBank, buildPatches } = require('./prepare-ox-spacing-fix.cjs');
const audit = require('../docs/criminal-law-ox-spacing-followup-20260920.json');

async function main() {
  const { PGlite } = require(process.env.OX_PGLITE_MODULE || 'C:/Users/Public/Documents/ESTsoft/CreatorTemp/ox-db-tools/node_modules/@electric-sql/pglite');
  const bank = loadBank(audit);
  const questions = new Map(bank.questions.map(q => [q.id, q]));
  for (const patch of buildPatches(audit)) for (const field of patch.fields) questions.get(patch.id)[field.field] = field.after;
  const db = new PGlite();
  try {
    await db.exec(`create table ox_questions(id text primary key,chapter_id text,entry jsonb,status text,reviewed boolean,content_version integer,revision integer,updated_at timestamptz);
      create table ox_question_history(question_id text,actor text,before_value jsonb,after_value jsonb);`);
    await db.query(`insert into ox_questions select q->>'id',q->>'chapter_id',q,q->>'status',true,3,7,now() from jsonb_array_elements($1::jsonb) q`, [JSON.stringify(bank.questions)]);
    const sql = fs.readFileSync(path.join(__dirname, 'ox-spacing-polish-20260920.sql'), 'utf8');
    await db.exec(sql);
    const count = (await db.query('select count(*)::integer n from ox_question_history')).rows[0].n;
    assert.equal(count, 348);
    await db.exec(sql);
    assert.equal((await db.query('select count(*)::integer n from ox_question_history')).rows[0].n, count);
    for (const row of (await db.query('select * from ox_questions')).rows) {
      assert.equal(row.content_version, 3);
      assert.deepEqual(row.entry.correct_answer, questions.get(row.id).correct_answer);
      assert.deepEqual(row.entry.explanation_html.match(/<\/?u>/g), questions.get(row.id).explanation_html.match(/<\/?u>/g));
      for (const field of ['prompt', 'context', 'explanation', 'explanation_html']) {
        assert.equal((row.entry[field] || '').replace(/ /g, ''), (questions.get(row.id)[field] || '').replace(/ /g, ''));
      }
    }
    console.log('PASS: 348 corrections, HTML/text equality, space-only edits, stable answers/versions/underlines, idempotency');
  } finally { await db.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
