'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID}=require('node:crypto');
const {createDb}=require('./helpers/interview-db.cjs');
const {createHandler}=require('../api/interview-live');
const owner={type:'student',id:'ip-a'},other={type:'student',id:'ip-b'},server={type:'server',id:'qa'};
test('stored Live reports preserve exact records and existing access controls',async t=>{
 const {db}=await createDb();
 const invoke=async(action,actor,body={})=>(await db.query('select ip_live_service($1,$2::jsonb,$3::jsonb) result',[action,JSON.stringify(actor),JSON.stringify(body)])).rows[0].result;
 const insert=async(state,turns=[],current='첫 질문')=>(await db.query("insert into ip_live_runs(student_id,request_key,state,questions,turns,current_question,retain_until) values('ip-a',$1,$2,$3,$4,$5,now()+interval '30 days') returning id",[randomUUID(),state,JSON.stringify([{id:'q1'},{id:'q2'},{id:'q3'}]),JSON.stringify(turns),current])).rows[0].id;
 try{
  await db.exec(fs.readFileSync('supabase/migrations/20261021060740_interview_live_sessions.sql','utf8'));
  const turns=[{kind:'initial',parentQuestionId:'q1',question:'첫 질문',answer:'협업 <경험>을 말했습니다.',complete:true,transcriptSource:'live_sideband_unverified',grade:null,score:null},
   {kind:'followup',parentQuestionId:'q1',evidence:'협업',question:'그 경험의 결과는?',answer:'미완료 발언',complete:false}];
  const oldId=await insert('interrupted',turns,'그 경험의 결과는?');
  await db.exec(fs.readFileSync('supabase/migrations/20261029142215_interview_live_result_reports.sql','utf8'));
  const get=async id=>(await invoke('get',owner,{runId:id})).run;
  await t.test('backfills terminal runs with exact followup evidence, partial answer and no grades',async()=>{
   const r=(await get(oldId)).result_report;
   assert.equal(r.runId,oldId);assert.equal(r.state,'interrupted');assert.equal(r.transcriptVerified,false);assert.equal(r.grade,null);assert.equal(r.score,null);
   assert.deepEqual(r.turns,turns);assert.equal(r.pendingQuestion,null);
   assert.deepEqual(r.counts,{plannedMainQuestions:3,recordedTurns:2,mainQuestions:1,followups:1,completedAnswers:1,incompleteAnswers:1,emptyTranscripts:0});
   assert.equal(r.nextPractice.length,3);
  });
  await t.test('active and unconfirmed closure have no report; closure saves it atomically',async()=>{
   const id=await insert('active');assert.equal((await get(id)).result_report,null);
   await invoke('save',server,{runId:id,turns,currentQuestion:'다음 질문'});
   await invoke('closed',server,{runId:id,state:'unknown',recordingState:'pending'});assert.equal((await get(id)).result_report,null);
   await invoke('closed',server,{runId:id,state:'interrupted',recordingState:'ready'});
   assert.equal((await get(id)).result_report.pendingQuestion,'다음 질문');
  });
  await t.test('Storage retry and retention change do not rewrite stored report',async()=>{
   const before=(await get(oldId)).result_report;
   await invoke('closed',server,{runId:oldId,state:'interrupted',recordingState:'ready',recordingPartial:true});
   await db.query("update ip_live_runs set retain_until=retain_until+interval '1 day' where id=$1",[oldId]);
   const after=await get(oldId);assert.deepEqual(after.result_report,before);assert.equal(after.recording_partial,true);
  });
  await t.test('empty transcript is not counted as a completed answer',async()=>{
   const id=await insert('completed',[{kind:'initial',question:'첫 질문',answer:' ',complete:true}],'면접 종료');
   const r=(await get(id)).result_report;assert.equal(r.counts.completedAnswers,0);assert.equal(r.counts.emptyTranscripts,1);assert.equal(r.pendingQuestion,null);
  });
  await t.test('ownership, expiry, browser role and forged save are rejected',async()=>{
   await assert.rejects(invoke('get',other,{runId:oldId}),/not_found/);
   await assert.rejects(invoke('save',owner,{runId:oldId,turns:[]}),/forbidden/);
   await db.exec('set role authenticated');await assert.rejects(db.query('select result_report from ip_live_runs'),/permission denied/);await db.exec('reset role');
   const id=await insert('completed');await db.query("update ip_live_runs set retain_until=now()-interval '1 second' where id=$1",[id]);
   await assert.rejects(get(id),/not_found/);assert(!(await invoke('list',owner)).runs.some(r=>r.id===id));
  });
  await t.test('existing authenticated API returns saved report and signed audio without new model calls',async()=>{
   let signs=0;
   const handler=createHandler({requireMockAccess:async()=>{},config:{transport:'vercel',enabled:true},authenticateWeb:async()=>owner,invoke,storage:()=>({signed:async()=>{signs++;return {input:'/audio/input',output:'/audio/output'};}})});
   let status,body;await handler({method:'POST',headers:{host:'localhost',origin:'http://localhost'},body:{action:'get',runId:oldId}},{setHeader(){},status(c){status=c;return this;},json(d){body=d;}});
   assert.equal(status,200);assert.equal(body.run.result_report.runId,oldId);assert.equal(signs,1);assert.equal(body.recordings.input,'/audio/input');assert.equal(body.run.provider_id,undefined);assert.equal(body.run.questions,undefined);
  });
 }finally{await db.close();}
});
