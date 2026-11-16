'use strict';
// Prepare SQL locally. This script never connects to a database.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
function prepare(payload){
 const {roundId,answerKey,records,sourceFilename,sourceSha256}=payload;
 assert.match(roundId,/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
 assert.match(sourceSha256,/^[0-9a-f]{64}$/);assert.equal(typeof sourceFilename,'string');
 assert([75,150].includes(answerKey.length));assert(answerKey.every(v=>Number.isInteger(v)&&v>=1&&v<=5));assert(records.length>0);
 const seen=new Set();
 const rows=records.map(r=>{
  for(const field of ['sourceId','cohort','name'])assert(typeof r[field]==='string'&&r[field].length>0&&r[field].length<=120,field);
  const identity=JSON.stringify([r.cohort,r.sourceId]);assert(!seen.has(identity),'duplicate source identity');seen.add(identity);
  assert.equal(r.answers.length,answerKey.length);assert(r.answers.every(v=>Number.isInteger(v)&&v>=0&&v<=5));
  assert.equal(r.correctCount,r.answers.filter((a,i)=>a===answerKey[i]).length);assert(Number.isInteger(r.sourceRow)&&r.sourceRow>1);
  assert.match(r.submittedAt,/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?[+]09:00$/);assert(Number.isFinite(Date.parse(r.submittedAt)));
  return {source_id:r.sourceId,cohort:r.cohort,display_name:r.name,submitted_at:r.submittedAt,answers:r.answers,source_correct_count:r.correctCount,source_row:r.sourceRow};
 });
 const sqlString=s=>"'"+s.replaceAll("'","''")+"'";
 const tag='$history_'+sourceSha256.slice(0,16)+'$';const json=JSON.stringify(rows);assert(!json.includes(tag));
 return `begin;
set local lock_timeout='3s';
set local statement_timeout='15s';
create temporary table aptitude_history_import on commit drop as
 select * from jsonb_to_recordset(${tag}${json}${tag}::jsonb)
 as x(source_id text,cohort text,display_name text,submitted_at timestamptz,answers jsonb,source_correct_count integer,source_row integer);
do $import$
declare
 r public.ip_aptitude_rounds;
 inserted_count integer;
begin
 select * into r from public.ip_aptitude_rounds where id='${roundId}'::uuid for update;
 if not found or r.kind<>${sqlString(answerKey.length===75?'half':'full')} or r.answer_key<>'${JSON.stringify(answerKey)}'::jsonb then
  raise exception 'historical_import_round_or_answer_key_mismatch';
 end if;
 if (select count(*) from aptitude_history_import)<>${records.length}
  or exists(select 1 from aptitude_history_import x where jsonb_array_length(x.answers)<>${answerKey.length} or public.ip_aptitude_score(x.answers,r.answer_key)<>x.source_correct_count)
  then raise exception 'historical_import_score_mismatch'; end if;
 insert into public.ip_aptitude_historical_attempts(round_id,source_id,cohort,display_name,submitted_at,answers,correct_count,source_correct_count,scored_key_revision,source_filename,source_sha256,source_row)
 select r.id,x.source_id,x.cohort,x.display_name,x.submitted_at,x.answers,public.ip_aptitude_score(x.answers,r.answer_key),x.source_correct_count,r.key_revision,
  ${sqlString(sourceFilename)},'${sourceSha256}',x.source_row from aptitude_history_import x
 on conflict(round_id,cohort,source_id) do nothing;
 get diagnostics inserted_count=row_count;
 if exists(select 1 from aptitude_history_import x
  left join public.ip_aptitude_historical_attempts h on h.round_id=r.id and h.cohort=x.cohort and h.source_id=x.source_id
  where h.id is null or h.display_name is distinct from x.display_name or h.submitted_at is distinct from x.submitted_at
   or h.answers is distinct from x.answers or h.source_correct_count is distinct from x.source_correct_count
   or h.correct_count is distinct from public.ip_aptitude_score(x.answers,r.answer_key) or h.scored_key_revision is distinct from r.key_revision
   or h.source_filename is distinct from ${sqlString(sourceFilename)} or h.source_sha256 is distinct from '${sourceSha256}' or h.source_row is distinct from x.source_row)
  then raise exception 'historical_import_existing_record_mismatch'; end if;
 if inserted_count>0 then
  insert into public.ip_aptitude_audit(round_id,actor_id,reason,after_value)
  values(r.id,'codex:approved-historical-import','이전 기수 성적 등록 및 전체 등수 합산',jsonb_build_object('historicalImported',inserted_count,'sourceSha256','${sourceSha256}','cohorts',(select jsonb_agg(distinct cohort) from aptitude_history_import)));
 end if;
end
$import$;
commit;
`;
}
if(require.main===module){
 const [input,output]=process.argv.slice(2);assert(input&&output,'Usage: node scripts/prepare-aptitude-history-import.cjs payload.json apply.sql');
 const payload=JSON.parse(fs.readFileSync(input,'utf8'));fs.mkdirSync(path.dirname(path.resolve(output)),{recursive:true});fs.writeFileSync(output,prepare(payload));
 console.log(JSON.stringify({prepared:true,records:payload.records.length,roundId:payload.roundId}));
}
module.exports={prepare};
