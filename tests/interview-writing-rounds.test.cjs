const assert=require('node:assert/strict');
const {createDb}=require('./helpers/interview-db.cjs');
(async()=>{
 const admin={type:'admin',id:'qa'},student={type:'student',id:'ip-a'};
 const call=async(db,action,actor,body={})=>(await db.query('select ip_writing_service($1,$2::jsonb,$3::jsonb) result',[action,JSON.stringify(actor),JSON.stringify(body)])).rows[0].result;
 const {db,invoke}=await createDb({beforeWritingRounds:async db=>{
  await db.exec("insert into ip_members(student_id,track,exam_number) values('ip-a','공채','A');update ip_settings set enabled=true;");
  let r=await call(db,'writing_save',student,{kind:'introduction',itemId:'',revision:0,status:'submitted',text:'First submitted answer'});
  r=await call(db,'admin_writing_feedback',admin,{targetStudentId:'ip-a',kind:'introduction',itemId:'',revision:r.writing.revision,status:'needs_revision',feedback:'First feedback'});
  r=await call(db,'admin_writing_feedback',admin,{targetStudentId:'ip-a',kind:'introduction',itemId:'',revision:r.writing.revision,status:'approved',feedback:'Edited first feedback'});
  r=await call(db,'writing_save',student,{kind:'introduction',itemId:'',revision:r.writing.revision,status:'draft',text:'Working copy'});
  r=await call(db,'writing_save',student,{kind:'introduction',itemId:'',revision:r.writing.revision,status:'submitted',text:'Second submitted answer'});
  await call(db,'writing_save',student,{kind:'introduction',itemId:'',revision:r.writing.revision,status:'submitted',text:'Third submitted answer'});
  // A previously reviewed record without audit data must remain usable without
  // inventing a historical feedback date.
  await db.exec("insert into ip_writings(student_id,kind,item_id,prompt_snapshot,body,status,feedback,revision,submitted_body,submitted_at,submitted_revision,submission_status,feedback_revision) values('ip-a','motivation','','Legacy','Legacy answer','saved','Legacy feedback',1,'Legacy answer',now(),1,'approved',1)");
 }});
 try{
  const key={kind:'introduction',itemId:''};
  let history=await invoke('writing_history',student,key);
  assert.equal(history.total,3);
  assert.deepEqual(history.rounds.map(r=>[r.round,r.status,r.feedback]),[[3,'submitted',''],[2,'submitted',''],[1,'approved','Edited first feedback']]);
  assert(history.rounds[2].feedback_at);
  let writing=(await invoke('writing_list',student)).writings.find(w=>w.kind==='introduction');
  assert.equal(writing.submission_round,3);assert.equal(writing.feedback_round,1);
  const legacy=(await invoke('writing_history',student,{kind:'motivation',itemId:''})).rounds[0];
  assert.equal(legacy.round,1);assert.equal(legacy.feedback,'Legacy feedback');assert.equal(legacy.feedback_at,null);
  const first=history.rounds[2];
  for(let round=4;round<=13;round++)writing=(await invoke('writing_save',student,{...key,revision:writing.revision,status:'submitted',text:'Round '+round})).writing;
  assert.equal(writing.submission_round,13);assert.equal(writing.feedback_round,1);
  history=await invoke('writing_history',student,key);
  assert.equal(history.total,13);assert.equal(history.rounds.length,10);assert.equal(history.rounds[0].round,13);
  const older=await invoke('writing_history',student,{...key,page:1});
  assert.deepEqual(older.rounds.map(r=>r.round),[3,2,1]);assert.deepEqual(older.rounds[2],first);
  const repeat=await invoke('writing_save',student,{...key,revision:writing.revision,status:'submitted',text:writing.body});
  assert.equal(repeat.writing.submission_round,13);assert.equal(repeat.writing.revision,writing.revision);
  const concurrent=await Promise.allSettled([0,1].map(n=>invoke('writing_save',student,{...key,revision:writing.revision,status:'submitted',text:'Concurrent '+n})));
  assert.equal(concurrent.filter(r=>r.status==='fulfilled').length,1);
  assert.equal((await invoke('writing_history',student,key)).total,14);
  console.log('PASS rounds: historical backfill, unknown legacy dates, carried feedback attribution, immutable older rounds, pagination, idempotent repeat and concurrent submissions.');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
