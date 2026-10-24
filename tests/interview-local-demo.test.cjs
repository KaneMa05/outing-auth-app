// No model calls: verify the opt-in preview uses complete records and the user's 25+5 policy.
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const {db,invoke}=await require('./helpers/interview-db.cjs').createDb();
 try{
  for(const file of ['supabase/migrations/20261020063234_interview_ai_pipeline.sql','supabase/migrations/20261020073140_interview_ai_readiness.sql','supabase/migrations/20261020074446_interview_ai_load_protection.sql','supabase/migrations/20261020081526_interview_ai_single_question.sql','supabase/migrations/20261021063447_interview_experience_year_age.sql','supabase/migrations/20261021065038_interview_life_satisfaction.sql','supabase/migrations/20261021071011_interview_experience_age_only.sql','supabase/migrations/20261021082149_interview_basic_fields_followup.sql','supabase/seeds/interview-corpus.sql','supabase/seeds/interview-core30.sql'])
   await db.exec(fs.readFileSync(file,'utf8'));
  const admin={type:'admin',id:'local-test'},student={type:'student',id:'ip-a'};
  await invoke('admin_enabled',admin,{enabled:true});
  await invoke('admin_member_save',admin,{targetStudentId:'ip-a',track:'공채',examNumber:'local-test',enabled:true});
  const aiInvoke=async(action,actor,body={})=>(await db.query('select ip_ai_service($1,$2::jsonb,$3::jsonb) result',[action,JSON.stringify(actor),JSON.stringify(body)])).rows[0].result;
  const config=await require('../scripts/interview-local-demo.cjs')({db,invoke,aiInvoke,admin,studentId:'ip-a',bundleHash:'b'.repeat(64),token:'local-fixture-token'});
  assert.equal(config.appendixPositions.length,5);assert.equal(new Set(config.appendixPositions).size,5);
  assert.equal((await db.query('select count(*) n from ip_ai_jobs')).rows[0].n,0,'Populating the demo never auto-generates');
  const questions=(await invoke('core_questions',student)).questions;
  assert.equal(questions.length,30);assert.equal(questions.filter(q=>q.kind==='main').length,25);
  assert.equal(questions.filter(q=>q.kind==='appendix').length,5);
  const prep=await aiInvoke('prepare',student,{kind:'core30'});
  assert.equal(prep.questions.length,30);assert.equal(prep.coreConfigured,true);
  await assert.rejects(aiInvoke('generate',student,{kind:'core30',sourceHash:prep.sourceHash,requestKey:'no-question-id'}),/invalid_request/);
  await assert.rejects(aiInvoke('generate',student,{kind:'core30',questionId:'unconfigured',sourceHash:prep.sourceHash,requestKey:'forged-question'}),/invalid_request/);
  const questionId=questions[0].id;
  const result=await aiInvoke('generate',student,{kind:'core30',questionId,sourceHash:prep.sourceHash,requestKey:'test-local-core30'});
  const status=await aiInvoke('status',student,{requestId:result.requestId});
  assert.equal(status.items.length,1);assert.equal(status.items[0].key,questionId);
  assert.equal((await db.query('select count(*) n from ip_ai_jobs')).rows[0].n,1,'One click creates exactly one job');
  const again=await aiInvoke('status',student,{requestId:result.requestId});
  assert.deepEqual(again.items.map(i=>i.key),status.items.map(i=>i.key),'Reload does not redraw appendix questions');
  const reuse=await aiInvoke('generate',student,{kind:'core30',questionId,sourceHash:prep.sourceHash,requestKey:'same-question-click'});
  assert.equal(reuse.requestId,result.requestId);
  const another=await aiInvoke('generate',student,{kind:'core30',questionId:questions[1].id,sourceHash:prep.sourceHash,requestKey:'another-question'});
  assert.notEqual(another.requestId,result.requestId);
  const history=(await aiInvoke('requests',student)).requests;
  assert(history.some(r=>r.id===result.requestId&&r.questionId===questionId));
  assert.equal((await db.query('select count(*) n from ip_ai_jobs')).rows[0].n,2);
  const profile=(await invoke('life_get',student)).profile.content;
  assert.equal(profile.experiences.length,6);assert(profile.qualifications.some(q=>q.type==='어학'));
  console.log('PASS complete local demo, 25+5 catalog, one selected question/job per click, missing/forged question rejected, idempotence and per-question history.');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
