'use strict';
// Run with PGLITE_MODULE pointing to an available @electric-sql/pglite install.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const root=path.resolve(__dirname,'..');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const manifest=read('scripts/data/interview-answer-patch-20261117.json');
const patches=manifest.patches;
const apply=fs.readFileSync(path.join(root,'supabase/reviews/interview-answer-corrections-20261117.sql'),'utf8');
const rollback=fs.readFileSync(path.join(root,'supabase/reviews/interview-answer-corrections-20261117-rollback.sql'),'utf8');
async function fixture(){
 const db=new PGlite();
 await db.exec(`create table ip_questions(id text primary key,prompt text,category text,status text,revision integer);
 create table ip_occurrences(id text primary key,question_id text references ip_questions(id),answer text);
 create table ip_question_rubrics(question_id text primary key,status text,reviewer text,reviewed_at timestamptz,
 revision integer,updated_at timestamptz,verification_note text,source_draft jsonb,criteria jsonb);
 create table saved_attempts(id text,answer text,reference jsonb);
 insert into saved_attempts values('saved','학생 답변','{"answer":"과거 참조"}');
 insert into ip_questions values('personality','인성 질문','personality','published',1);
 insert into ip_occurrences values('personality-o','personality','인성 해설');`);
 const qs=[...new Map(patches.map(p=>[p.question_id,p])).values()];
 for(const p of qs){
  await db.query('insert into ip_questions values($1,$2,$3,$4,$5)',[p.question_id,p.prompt,'job',p.status,p.revision]);
  await db.query(`insert into ip_question_rubrics values($1,'reviewed','관리자',now(),7,now(),'기존 검토',
   '{"flags":[],"source_answers":[{"text":"기존 초안"}]}','[{"authored":"보존"}]')`,[p.question_id]);
 }
 for(const p of patches)await db.query('insert into ip_occurrences values($1,$2,$3)',[p.occurrence_id,p.question_id,p.before]);
 return db;
}
async function answers(db){return (await db.query('select id,answer from ip_occurrences order by id')).rows;}
(async()=>{
 const db=await fixture();
 try{
  const original=await answers(db);
  const questions=(await db.query('select * from ip_questions order by id')).rows;
  await db.exec(apply);
  for(const p of patches)assert.equal((await db.query('select answer from ip_occurrences where id=$1',[p.occurrence_id])).rows[0].answer,p.after);
  assert.deepEqual((await db.query('select * from ip_questions order by id')).rows,questions);
  assert.equal((await db.query('select answer from ip_occurrences where id=$1',['personality-o'])).rows[0].answer,'인성 해설');
  assert.deepEqual((await db.query('select * from saved_attempts')).rows,[{id:'saved',answer:'학생 답변',reference:{answer:'과거 참조'}}]);
  const rubrics=(await db.query('select * from ip_question_rubrics order by question_id')).rows;
  assert(rubrics.every(r=>r.status==='draft'&&r.revision===8&&r.criteria[0].authored==='보존'&&r.source_draft.flags.includes('source_answer_changed')));
  await db.exec(apply);
  assert.deepEqual((await db.query('select * from ip_question_rubrics order by question_id')).rows,rubrics,'Idempotent replay must not increment rubric revisions');
  await db.exec(rollback);
  assert.deepEqual(await answers(db),original,'Rollback restores every exact original answer');
 }finally{await db.close();}
 for(const conflict of ['answer','category','prompt','revision','status','missing']){
  const db=await fixture();
  try{
   const p=patches[patches.length-1];
   if(conflict==='answer')await db.query('update ip_occurrences set answer=$1 where id=$2',['관리자가 새로 수정',p.occurrence_id]);
   else if(conflict==='missing')await db.query('delete from ip_occurrences where id=$1',[p.occurrence_id]);
   else if(conflict==='revision')await db.query('update ip_questions set revision=revision+1 where id=$1',[p.question_id]);
   else await db.query(`update ip_questions set ${conflict}=$1 where id=$2`,[conflict==='category'?'personality':'변경됨',p.question_id]);
   const before=await answers(db);
   await assert.rejects(db.exec(apply),/answer_review_conflict/);
   await db.exec('rollback;');
   assert.deepEqual(await answers(db),before,conflict+': partial writes forbidden');
  }finally{await db.close();}
 }
 // Independently compare seeds with HEAD: only scoped answer fields may change.
 const original=JSON.parse(execFileSync('git',['show','HEAD:supabase/seeds/interview-corpus.json'],{cwd:root,encoding:'utf8',maxBuffer:20*1024*1024}));
 const current=read('supabase/seeds/interview-corpus.json');
 assert.deepEqual(current.questions,original.questions);
 assert.deepEqual(current.sources,original.sources);
 const byId=new Map(patches.map(p=>[p.occurrence_id,p]));
 for(let i=0;i<original.occurrences.length;i++){
  const o=original.occurrences[i],p=byId.get(o.id);
  assert.deepEqual(current.occurrences[i],p?{...o,answer:p.after}:o);
 }
 const sql=fs.readFileSync(path.join(root,'supabase/seeds/interview-corpus.sql'),'utf8');
 const regex=/insert into public\.ip_occurrences select \* from jsonb_populate_recordset\(null::public\.ip_occurrences, '((?:''|[^'])*)'::jsonb\) on conflict \(id\) do nothing;/g;
 const sqlRows=[...sql.matchAll(regex)].flatMap(m=>JSON.parse(m[1].replace(/''/g,"'")));
 assert.deepEqual(sqlRows,current.occurrences,'JSON and SQL seeds agree');
 console.log(`PASS: ${patches.length} answer updates, replay, rollback, 6 conflict guards, unrelated data and seed consistency`);
})().catch(e=>{console.error(e);process.exitCode=1;});
