const assert=require('node:assert/strict'),fs=require('node:fs');
const {createDb}=require('./helpers/interview-db.cjs');
const {createHandler}=require('../api/interview-prep');
(async()=>{
 const {db,invoke}=await createDb(),admin={type:'admin',id:'qa'},student={type:'student',id:'ip-a'};
 try{
  await invoke('admin_member_save',admin,{targetStudentId:student.id,track:'공채',examNumber:'A',enabled:true});
  await invoke('admin_enabled',admin,{enabled:true});
  for(const seed of ['interview-corpus.sql','interview-personality-analysis.sql','interview-core30.sql'])await db.exec(fs.readFileSync('supabase/seeds/'+seed,'utf8'));
  const core=(await invoke('admin_core_questions',admin,{coreKind:'main'})).questions[0];
  await invoke('admin_question_publish',admin,{items:[{id:core.id,revision:core.revision}]});
  for(const kind of ['introduction','motivation','public_service','core']){
   const key={kind,itemId:kind==='core'?core.id:''};
   let row=(await invoke('writing_save',student,{...key,revision:0,status:'submitted',text:kind+' 첫 제출'})).writing;
   assert.equal(row.awaiting_feedback,true);
   const first=row,history=await invoke('writing_history',student,key);
   await assert.rejects(invoke('writing_save',student,{...key,revision:row.revision,status:'submitted',text:'피드백 전 변경 제출',awaiting_feedback:false,submission_status:'approved'}),/feedback_pending/);
   assert.deepEqual((await invoke('writing_list',student)).writings.find(w=>w.kind===kind),row);
   assert.deepEqual(await invoke('writing_history',student,key),history);
   const repeat=(await invoke('writing_save',student,{...key,revision:row.revision,status:'submitted',text:row.body})).writing;
   assert.equal(repeat.revision,row.revision);assert.equal(repeat.submission_round,1);
   for(const status of ['draft','saved'])row=(await invoke('writing_save',student,{...key,revision:row.revision,status,text:'교사 확인 중에도 편집한 답변'})).writing;
   assert.equal(row.awaiting_feedback,true);assert.equal(row.submitted_body,first.submitted_body);assert.equal(row.submission_round,1);
   await assert.rejects(invoke('writing_save',student,{...key,revision:row.revision,status:'submitted',text:row.body}),/feedback_pending/);
   const parallel=await Promise.allSettled([0,1].map(i=>invoke('writing_save',student,{...key,revision:row.revision,status:'submitted',text:'동시 재제출 '+i})));
   assert.equal(parallel.filter(r=>r.status==='rejected'&&r.reason.message.includes('feedback_pending')).length,2);
   for(const status of ['needs_revision','approved']){
    row=(await invoke('admin_writing_feedback',admin,{...key,targetStudentId:student.id,revision:row.revision,status,feedback:'현재 제출에 대한 '+status+' 피드백'})).writing;
    assert.equal(row.awaiting_feedback,false);assert.equal(row.feedback_revision,row.submitted_revision);
    const previousRound=row.submission_round;
    row=(await invoke('writing_save',student,{...key,revision:row.revision,status:'submitted',text:'피드백을 반영한 '+status+' 답변'})).writing;
    assert.equal(row.submission_round,previousRound+1);assert.equal(row.awaiting_feedback,true);
    assert(row.feedback);assert.notEqual(row.feedback_revision,row.submitted_revision,'Prior feedback never unlocks a newer submitted round');
    await assert.rejects(invoke('writing_save',student,{...key,revision:row.revision,status:'submitted',text:'이전 피드백으로 재제출 시도'}),/feedback_pending/);
   }
   if(kind!=='core'){
    const beforeRemoval=row;
    await invoke('admin_writing_delete',admin,{...key,targetStudentId:student.id,revision:row.revision});
    row=(await invoke('writing_list',student)).writings.find(w=>w.kind===kind);
    assert.equal(row.awaiting_feedback,false);assert.equal(row.body,beforeRemoval.body);
    row=(await invoke('writing_save',student,{...key,revision:row.revision,status:'draft',text:row.body})).writing;
    assert.equal(row.awaiting_feedback,false,'Saving a hidden answer keeps the administrative exception');
    row=(await invoke('writing_save',student,{...key,revision:row.revision,status:'submitted',text:row.body})).writing;
    assert.equal(row.submission_round,beforeRemoval.submission_round+1);assert.equal(row.awaiting_feedback,true);
    await assert.rejects(invoke('writing_save',student,{...key,revision:row.revision,status:'submitted',text:'과거 삭제 이력으로 재제출 시도'}),/feedback_pending/);
   }
  }
  const row=(await invoke('writing_list',student)).writings.find(w=>w.kind==='introduction');
  const handler=createHandler({now:()=>Date.parse('2026-11-23T00:00:00+09:00'),authenticateWeb:async()=>({id:student.id}),invoke});
  let code,data;await handler({method:'POST',headers:{host:'local.test',origin:'http://local.test'},body:{action:'writing_save',kind:'introduction',itemId:'',revision:row.revision,status:'submitted',text:'직접 API 재제출'}},{setHeader(){},status(n){code=n;return this;},json(v){data=v;}});
  assert.equal(code,409);assert.equal(data.error,'feedback_pending');
  const security=(await db.query("select prosecdef,proconfig from pg_proc where oid='public.ip_writing_awaiting_feedback(public.ip_writings)'::regprocedure")).rows[0];assert.equal(security.prosecdef,false);assert(security.proconfig.includes('search_path=""'));
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(db.query('select public.ip_writing_awaiting_feedback(null::public.ip_writings)'),/permission denied/);await db.exec('reset role');}
  await db.exec('set role service_role');assert.equal((await invoke('writing_list',student)).writings.length,4);await db.exec('reset role');
  console.log('PASS feedback gate: per-answer waiting, drafts/saves, both review outcomes, carried feedback, immutable rounds, duplicate/concurrent requests, administrator-removal exception, API 409 and service-only grants.');
 }finally{await db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
