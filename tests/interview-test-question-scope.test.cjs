'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID}=require('node:crypto');
const {fixture}=require('./helpers/interview-mock-cli-fixture.cjs');
const bank=require('../lib/interview-test-question-scope.json');
const {questionsFor,allows}=require('../lib/interview-test-question-scope.cjs');
const {practiceCatalog}=require('../lib/interview-practice-catalog.cjs');
const actor={type:'student',id:'ip-a',testApp:true},admin={type:'admin',id:'qa'};
const migration='supabase/migrations/20261111021951_interview_mock_test_question_scope.sql';
test('marked test-app catalog uses the exact server test set while enforcing source prompt, status and enrollment track',async()=>{
 const seen=[];const rows=bank.questions.map(q=>({...q,status:'published',tracks:[],topic_ids:[]}));
 const read=async(_method,path)=>{seen.push(path);if(path.startsWith('ip_topics?'))return [];return [...rows,{id:'outside',prompt:'범위 밖',category:'job',status:'published',tracks:[]}];};
 for(const mode of ['job','personality','ai']){
  const result=await practiceCatalog(read,{mode,track:'공채',testOnly:true});assert.deepEqual(result.questions.map(q=>q.id),questionsFor(mode).map(q=>q.id));
  assert(new URL('https://local/'+seen.at(-1)).searchParams.get('id').startsWith('in.('));
 }
 const ordinary=await practiceCatalog(read,{mode:'job',track:'공채'});assert(ordinary.questions.some(q=>q.id==='outside'),'ordinary requests keep the original catalog');
 assert(!allows('job',{...questionsFor('job')[0],prompt:'변경됨'}));assert(!allows('personality',questionsFor('job')[0]));
 const blocked=await practiceCatalog(async()=>[{...rows[0],tracks:['기관']},{...rows[1],status:'draft'},{...rows[2],prompt:'변경됨'}],{mode:'job',track:'공채',testOnly:true});
 assert.deepEqual(blocked.questions,[]);
});
test('DB allowlist blocks forged questions across every mock path, preserves source data and orders Live main questions',async t=>{
 const f=await fixture();t.after(()=>f.db.close());
 for(const file of ['20261031052127_fix_mock_access_portal_accounts.sql','20261103062648_interview_mock_operations_monitor.sql','20261104053835_iphone_practice_cli.sql','20261104060123_iphone_practice_unlimited_retention.sql','20261106075735_interview_portal_practice_access.sql','20261106083856_interview_practice_reference_assessment.sql','20261106084214_interview_practice_result_reference_answer.sql'])await f.db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
 for(const q of bank.questions){
  await f.db.query("insert into ip_questions(id,prompt,category,status,tracks) values($1,$2,$3,'published',array['공채'])",[q.id,q.prompt,q.category]);
  await f.rpc('ip_rubric_service')('admin_rubric_save',admin,{id:q.id,revision:0,questionRevision:1,kind:q.category==='job'?'job_knowledge':'personality_experience',rationale:'로컬 범위 제한만 확인하는 가상 기준입니다.',criteria:q.category==='job'?f.detail.rubric.criteria:[],criticalErrors:q.category==='job'?f.detail.rubric.critical_errors:[],verificationNote:'유료 채점 없이 테스트합니다.',scoreMap:q.category==='job'?f.detail.rubric.score_map:null,status:'reviewed'});
 }
 const snapshot=(await f.db.query('select id,prompt,status from ip_questions order by id')).rows;
 const openai=f.rpc('ip_openai_practice_service'),outside=f.detail.question;
 const oldId=randomUUID();await openai('create',actor,{id:oldId,mode:'job',questionId:outside.id,questionPrompt:outside.prompt,audioHash:'a'.repeat(64)});
 await f.db.exec(fs.readFileSync(migration,'utf8'));
 assert.deepEqual((await f.db.query('select id,prompt,status from ip_questions order by id')).rows,snapshot);
 assert.equal((await openai('get',actor,{id:oldId})).id,oldId,'saved non-test attempts remain readable');
 const ordinary={type:'student',id:'ip-a'};
 assert.equal((await openai('create',ordinary,{id:randomUUID(),mode:'job',questionId:outside.id,questionPrompt:outside.prompt,audioHash:'e'.repeat(64)})).ok,true,'ordinary published questions remain valid');
 for(const name of ['ip_openai_practice_service','ip_practice_cli_service']){
  const rpc=f.rpc(name);
  await assert.rejects(rpc('create',actor,{id:randomUUID(),mode:'job',questionId:outside.id,questionPrompt:outside.prompt,audioHash:'b'.repeat(64)}),/question_unavailable/);
  for(const mode of ['job','personality']){
   const q=questionsFor(mode)[0];assert.equal((await rpc('create',actor,{id:randomUUID(),mode,questionId:q.id,questionPrompt:q.prompt,audioHash:'c'.repeat(64)})).ok,true);
   await assert.rejects(rpc('create',actor,{id:randomUUID(),mode,questionId:q.id,questionPrompt:'위조',audioHash:'d'.repeat(64)}),/question_unavailable/);
  }
 }
 for(const [name,mode] of [['ip_job_exam_service','job'],['ip_personality_service','personality']]){
  const rpc=f.rpc(name),listed=await rpc('questions',actor,{});
  const ordinaryList=await rpc('questions',ordinary,{});assert(ordinaryList.questions.some(q=>q.id===(mode==='job'?outside.id:f.personality.question.id)),'ordinary exam catalog is preserved');
  assert.deepEqual(new Set(listed.questions.map(q=>q.id)),new Set(questionsFor(mode).map(q=>q.id)));
  const other=mode==='job'?outside:f.personality.question;
  await assert.rejects(rpc('start',actor,{requestKey:randomUUID(),questionId:other.id}),/questions_unavailable/);
  const start=await rpc('start',actor,{requestKey:randomUUID(),questionId:questionsFor(mode)[0].id});assert.equal(start.ok,true);
 }
 const live=f.rpc('ip_live_service');assert.equal((await live('ready',actor)).ready,true);
 const {run}=await live('reserve',actor,{requestKey:randomUUID()});assert.deepEqual(run.questions.map(q=>q.id),questionsFor('ai').map(q=>q.id));
 const rows=(await f.db.query('select mode,question_id,prompt,position from ip_mock_test_question_scope order by mode,position')).rows;
 assert.equal(rows.length,9);for(const row of rows)assert(questionsFor(row.mode).some(q=>q.id===row.question_id&&q.prompt===row.prompt&&q.order===row.position));
 await f.db.exec('set role anon');await assert.rejects(f.db.query('select * from ip_mock_test_question_scope'),/permission denied/);await f.db.exec('reset role');
 await f.db.exec('set role service_role');await assert.rejects(f.db.exec("delete from ip_mock_test_question_scope"),/permission denied/);await f.db.exec('reset role');
});
