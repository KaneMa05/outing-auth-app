const assert=require('node:assert/strict');
const {test}=require('node:test');
const {createDb}=require('./helpers/interview-db.cjs');
const {createHandler}=require('../api/interview-prep');
const auth=require('../api/teacher-auth-utils');

test('teachers can save a first review with only a status, preserving answers and review history',async()=>{
 const {db,invoke}=await createDb(),admin={type:'admin',id:'reviewer'},student={type:'student',id:'ip-a'};
 const previousSecret=process.env.TEACHER_SESSION_SECRET;
 process.env.TEACHER_SESSION_SECRET='optional-feedback-local-test';
 try{
  await invoke('admin_member_save',admin,{targetStudentId:student.id,track:'공채',examNumber:'OPTIONAL',enabled:true});
  await invoke('admin_enabled',admin,{enabled:true});
  const handler=createHandler({invoke});
  const send=async(body,permissions=['interview.write'])=>{
   const cookie=auth.COOKIE_NAME+'='+auth.createSessionToken(process.env.TEACHER_SESSION_SECRET,{username:admin.id,role:'admin',permissions});
   let status,data;
   await handler({method:'POST',headers:{host:'local.test',origin:'http://local.test',cookie},body},
    {setHeader(){},status(n){status=n;return this;},json(v){data=v;}});
   return {status,data};
  };
  for(const [kind,status] of [['introduction','approved'],['motivation','needs_revision']]){
   const key={kind,itemId:''},text=kind+' 학생의 제출 답변';
   let writing=(await invoke('writing_save',student,{...key,revision:0,status:'submitted',text})).writing;
   const original=writing;
   // Feedback must remain attached to the submitted answer, including after a student draft edit.
   writing=(await invoke('writing_save',student,{...key,revision:writing.revision,status:'saved',text:'제출 후 수정한 답변'})).writing;
   const payload={action:'admin_writing_feedback',...key,targetStudentId:student.id,revision:writing.revision,status,feedback:'',annotations:[]};
   assert.equal((await send(payload,['interview.read'])).status,403);
   const saved=await send(payload);
   assert.equal(saved.status,200);
   writing=saved.data.writing;
   assert.equal(writing.feedback,'');assert.deepEqual(writing.annotation_marks,[]);
   assert.equal(writing.submission_status,status);assert.equal(writing.feedback_revision,original.submitted_revision);
   assert.equal(writing.feedback_body,text);assert.equal(writing.submitted_body,text);assert.equal(writing.body,'제출 후 수정한 답변');
   assert.equal(writing.submission_round,1);assert.ok(writing.feedback_at);
   assert.equal(writing.awaiting_feedback,false);
   assert.equal((await send(payload)).data.error,'revision_conflict');
   const reloaded=(await invoke('writing_list',student)).writings.find(w=>w.kind===kind);
   assert.deepEqual(reloaded,writing);
   const history=await invoke('writing_history',student,key);
   assert.equal(history.total,1);assert.equal(history.rounds[0].status,status);
   assert.equal(history.rounds[0].feedback,'');assert.deepEqual(history.rounds[0].annotation_marks,[]);
   for(const invalid of [{feedback:null},{feedback:'x'.repeat(8001)},{status:'draft'},{annotations:Array(101).fill({start:0,end:1,type:'underline',note:''})}]){
    assert.equal((await send({...payload,revision:writing.revision,...invalid})).status,400);
   }
   const next=(await invoke('writing_save',student,{...key,revision:writing.revision,status:'submitted',text:'교사 상태 확인 후 다시 제출'})).writing;
   assert.equal(next.submission_round,2);assert.equal(next.awaiting_feedback,true);
  }
  const key={kind:'public_service',itemId:''};
  await invoke('writing_save',student,{...key,revision:0,status:'draft',text:'아직 제출하지 않음'});
  await assert.rejects(invoke('admin_writing_feedback',admin,{...key,targetStudentId:student.id,revision:1,status:'approved',feedback:'',annotations:[]}),/not_submitted/);
  await assert.rejects(invoke('writing_save',student,{...key,revision:1,status:'saved',text:''}),/invalid_request/);
  const grants=(await db.query("select prosecdef,has_function_privilege('anon',oid,'EXECUTE') anon,has_function_privilege('authenticated',oid,'EXECUTE') authenticated,has_function_privilege('service_role',oid,'EXECUTE') service from pg_proc where oid='public.ip_writing_service(text,jsonb,jsonb)'::regprocedure")).rows[0];
  assert.deepEqual(grants,{prosecdef:false,anon:false,authenticated:false,service:true});
 }finally{
  if(previousSecret===undefined)delete process.env.TEACHER_SESSION_SECRET;else process.env.TEACHER_SESSION_SECRET=previousSecret;
  await db.close();
 }
});
