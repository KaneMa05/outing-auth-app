'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {createPublicationFixture}=require('./helpers/interview-publication-fixture.cjs');
const {createHandler}=require('../api/interview-prep');
const auth=require('../api/teacher-auth-utils');
(async()=>{
 const f=await createPublicationFixture(),{db,invoke,admin,student,publication,question}=f;
 try{
  const visible=async category=>(await invoke('questions',student,{category})).questions.map(q=>q.id);
  assert.deepEqual(await visible('job'),[]);
  assert.deepEqual(await visible('personality'),['publication-existing'],'Existing approvals survive migration');
  assert.equal((await invoke('core_questions',student)).questions.length,0);
  await assert.rejects(invoke('question_detail',student,{id:'publication-personality'}),/question_unavailable/);
  await assert.rejects(publication('publication-personality',1,true,student),/forbidden/);
  await assert.rejects(publication('publication-personality',99,true),/revision_conflict/);
  await assert.rejects(publication('publication-archived',1,true),/question_unavailable/);
  await assert.rejects(publication('does-not-exist',1,true),/question_unavailable/);
  let q=(await publication('publication-personality',1,true)).question;
  assert.equal(q.status,'published');assert.equal(q.revision,2);
  assert((await visible('personality')).includes(q.id));
  assert.equal((await invoke('core_questions',student)).questions[0].id,q.id);
  assert.equal((await invoke('question_detail',student,{id:q.id})).question.status,'published');
  assert.equal((await publication(q.id,q.revision,true)).question.revision,q.revision,'Already approved is a no-op');
  await db.exec("insert into ip_notes(student_id,topic_id,fields) values('ip-a','teamwork','{\"action\":\"saved student answer\"}');");
  const notes=(await db.query('select * from ip_notes')).rows;
  q=(await publication(q.id,q.revision,false)).question;
  assert.equal(q.status,'draft');assert(!(await visible('personality')).includes(q.id));
  assert.equal((await invoke('core_questions',student)).questions.length,0);
  await assert.rejects(invoke('question_detail',student,{id:q.id}),/question_unavailable/);
  assert.deepEqual((await db.query('select * from ip_notes')).rows,notes);
  // Editing and approving in the same legacy request cannot silently keep approval.
  q=(await publication(q.id,q.revision,true)).question;
  const before=q.revision;
  await invoke('admin_question_save',admin,{id:q.id,revision:q.revision,prompt:q.prompt+' 변경',category:q.category,topicIds:q.topic_ids,tracks:q.tracks,status:'published'});
  q=await question(q.id);assert.equal(q.status,'draft');assert.equal(q.revision,before+1);
  await assert.rejects(publication(q.id,before,true),/revision_conflict/);
  assert(!(await visible('personality')).includes(q.id));
  // Any content, classification, notebook mapping or audience change invalidates approval.
  for(const update of ["category='job',topic_ids='{}'","category='personality',topic_ids=array['self']","topic_ids=array['public']","tracks=array['기관']"]){
   q=(await publication(q.id,q.revision,true)).question;
   const revision=q.revision;
   await db.query('update ip_questions set '+update+' where id=$1',[q.id]);
   q=await question(q.id);assert.equal(q.status,'draft');assert.equal(q.revision,revision+1);
  }
  // Withdrawal cannot get stuck behind a now-inactive notebook topic.
  await db.query("update ip_questions set tracks=array['공채'] where id=$1",[q.id]);q=await question(q.id);
  q=(await publication(q.id,q.revision,true)).question;
  await db.exec("update ip_topics set active=false where id='public';");
  q=(await publication(q.id,q.revision,false)).question;assert.equal(q.status,'draft');
  await db.exec("update ip_topics set active=true where id='public';");
  let job=(await publication('publication-job',1,true)).question;
  assert.deepEqual(await visible('job'),[job.id]);
  // Actual job/personality practice pools inherit the same status gate.
  for(const suffix of ['_interview_keyword_rules_reports.sql','_interview_student_job_exam.sql','_interview_student_personality.sql']){
   const name=fs.readdirSync('supabase/migrations').find(n=>n.endsWith(suffix));await db.exec(fs.readFileSync('supabase/migrations/'+name,'utf8'));
  }
  for(const [entry,kind] of [[job,'job_knowledge'],[q,'personality_experience']])await db.query(
   "insert into ip_question_rubrics(question_id,source_prompt,source_category,kind,rationale,status,reviewed_at,criteria,score_map) values($1,$2,$3,$4,'publication test','reviewed',now(),'[{\"label\":\"safety\",\"terms\":[\"safe\"]}]','{\"O\":2,\"partial\":1,\"X\":0}')",
   [entry.id,entry.prompt,entry.category,kind]);
  const pool=async service=>(await db.query(`select ${service}('questions',$1::jsonb,'{}') result`,[JSON.stringify(student)])).rows[0].result.questions;
  assert.equal((await pool('ip_job_exam_service')).length,1);
  assert.equal((await pool('ip_personality_service')).length,0);
  q=(await publication(q.id,q.revision,true)).question;assert.equal((await pool('ip_personality_service')).length,1);
  await publication(job.id,job.revision,false);assert.equal((await pool('ip_job_exam_service')).length,0);
  await publication(q.id,q.revision,false);assert.equal((await pool('ip_personality_service')).length,0);
  assert.deepEqual((await db.query('select * from ip_notes')).rows,notes);
  const history=(await db.query("select * from ip_history where entity='question' order by id")).rows;
  assert(history.some(h=>h.snapshot.status==='published'&&h.actor_id===admin.id));
  assert(history.some(h=>h.snapshot.status==='draft'&&h.actor_id===admin.id));
  for(const role of ['anon','authenticated']){
   await db.exec('set role '+role);
   await assert.rejects(publication(q.id,q.revision,true),/permission denied/);
   await db.exec('reset role');
  }
  await db.exec('set role service_role');
  const current=await question(q.id);await publication(q.id,current.revision,true);
  await db.exec('reset role');
  // HTTP boundary: only signed admins with interview.write may mutate approval.
  process.env.TEACHER_SESSION_SECRET='publication-test-only';
  const handler=createHandler({invoke,authenticateWeb:async()=>({id:'ip-a'})});
  const cookie=permissions=>auth.COOKIE_NAME+'='+auth.createSessionToken(process.env.TEACHER_SESSION_SECRET,{username:'publication-qa',role:'admin',permissions});
  const call=async(body,permissions)=>{let status;await handler({method:'POST',headers:{host:'localhost',...(permissions?{cookie:cookie(permissions)}:{})},body},{setHeader(){},status(v){status=v;return this;},json(){}});return status;};
  const payload={action:'admin_question_publication',id:'publication-existing',revision:1,approved:false};
  assert.equal(await call({...payload,actor:admin}),401);
  assert.equal(await call(payload,['interview.read']),403);
  assert.equal(await call({...payload,approved:'false'},['interview.write']),400);
  assert.equal(await call({...payload,revision:0},['interview.write']),400);
  assert.equal(await call({...payload,approved:undefined},['interview.write']),400);
  assert.equal(await call(payload,['interview.write']),200);
  assert.equal((await question(payload.id)).status,'draft');
  console.log('PASS question publication: admin-only approval/withdrawal, stale conflicts, core and job/personality student pools, edit invalidation including direct SQL, existing approvals and student answers preserved, audit history and HTTP/RLS permissions.');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
