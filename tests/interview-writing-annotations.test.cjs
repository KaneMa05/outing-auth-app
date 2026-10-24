const assert=require('node:assert/strict');
const {createDb}=require('./helpers/interview-db.cjs');
const {createHandler}=require('../api/interview-prep');
const auth=require('../api/teacher-auth-utils');
(async()=>{
 const {db,invoke}=await createDb(),admin={type:'admin',id:'qa'},student={type:'student',id:'ip-a'},key={kind:'introduction',itemId:''};
 try{
  for(const id of ['ip-a','ip-b'])await invoke('admin_member_save',admin,{targetStudentId:id,track:'공채',examNumber:'EXAM-'+id,enabled:true});
  await invoke('admin_enabled',admin,{enabled:true});
  const text='안녕😀하세요.\n국민을 위해 일하겠습니다. <script>alert(1)</script>';
  let writing=(await invoke('writing_save',student,{...key,revision:0,status:'submitted',text})).writing;
  await invoke('writing_save',student,{kind:'motivation',itemId:'',revision:0,status:'draft',text:'미제출'});
  const marks=[{start:0,end:3,type:'underline',note:''},{start:2,end:7,type:'strike',note:'더 구체적으로 <img src=x onerror=alert(1)>'},{start:8,end:12,type:'bracket',note:'국민 중심의 경험을 추가하세요.'},{start:0,end:0,type:'comment',note:'처음 코멘트'},{start:12,end:12,type:'comment',note:'중간 코멘트'},{start:[...text].length,end:[...text].length,type:'comment',note:'끝 코멘트',color:'#15803d'},{start:4,end:9,type:'color',note:'',color:'#1d4ed8'}];
  const review=()=>({...key,targetStudentId:'ip-a',revision:writing.revision,status:'needs_revision',feedback:'',annotations:marks});
  await assert.rejects(invoke('admin_writing_feedback',student,review()),/forbidden/);
  for(const annotations of [[{start:1,end:2,type:'color',note:''}],[{start:1,end:2,type:'color',note:'',color:'#fff;display:none'}],[{start:1,end:1,type:'comment',note:'코멘트',color:null}],[{start:1,end:1,type:'comment',note:''}],[{start:1,end:1,type:'underline',note:'빈 범위'}],null,{},[{...marks[0],start:-1}],[{...marks[0],end:9999}],[{...marks[0],end:0}],[{...marks[0],type:'html'}],[{...marks[0],note:4}],[{...marks[0],start:1.5}],Array(101).fill(marks[0])]){
   await assert.rejects(invoke('admin_writing_feedback',admin,{...review(),annotations}),/invalid_request/);
  }
  writing=(await invoke('admin_writing_feedback',admin,review())).writing;
  assert.deepEqual(writing.annotation_marks,marks);assert.equal(writing.feedback_body,text);assert.equal(writing.body,text);assert.equal(writing.submitted_body,text);
  let history=await invoke('writing_history',student,key);assert.deepEqual(history.rounds[0].annotation_marks,marks);
  writing=(await invoke('admin_writing_feedback',admin,{...review(),annotations:[]})).writing;
  assert.deepEqual(writing.annotation_marks,[],'All saved annotations may be removed');
  writing=(await invoke('admin_writing_feedback',admin,review())).writing;
  // Current-format text-only clients must preserve annotations when updating feedback.
  const legacy=review();delete legacy.annotations;legacy.feedback='기존 화면의 텍스트 수정';
  writing=(await invoke('admin_writing_feedback',admin,legacy)).writing;assert.deepEqual(writing.annotation_marks,marks);
  const first=(await invoke('writing_history',student,key)).rounds[0];
  const revision=writing.revision;
  writing=(await invoke('writing_save',student,{...key,revision,status:'submitted',text:'새로운 답변'})).writing;
  await assert.rejects(invoke('admin_writing_feedback',admin,{...review(),revision}),/revision_conflict/);
  assert.equal(writing.feedback_body,text,'Old marks keep old source');
  assert.deepEqual((await invoke('writing_history',student,key)).rounds[0].annotation_marks,[]);
  const next=review();delete next.annotations;next.feedback='두 번째 답변 확인';next.status='approved';
  writing=(await invoke('admin_writing_feedback',admin,next)).writing;
  assert.deepEqual(writing.annotation_marks,[],'Old client review of new round clears carried marks');
  assert.equal(writing.feedback_body,'새로운 답변');assert.deepEqual((await invoke('writing_history',student,key)).rounds[1],first);
  assert.equal((await invoke('writing_list',{type:'student',id:'ip-b'},{targetStudentId:'ip-a'})).writings.length,0);
  let board=await invoke('admin_writing_board',admin);assert.equal(board.total,1);assert.equal(board.approved,1);assert.equal(board.pending,0);
  assert.equal(board.submissions[0].body,undefined);assert.equal(board.submissions[0].annotation_marks,undefined);
  assert.equal((await invoke('admin_writing_board',admin,{search:'EXAM-ip-a'})).total,1);
  assert.equal((await invoke('admin_writing_board',admin,{kind:'motivation'})).total,0);
  assert.equal((await invoke('admin_writing_board',admin,{status:'submitted'})).total,0);
  await assert.rejects(invoke('admin_writing_board',student),/forbidden/);
  await assert.rejects(invoke('admin_writing_board',admin,{status:'draft'}),/invalid_request/);
  for(let i=0;i<31;i++){
   const id='board-'+String(i).padStart(2,'0');await db.query('insert into ip_owners(id,name) values($1,$1)',[id]);
   await db.query("insert into ip_members(student_id,track,exam_number) values($1,'공채',$1)",[id]);
   await invoke('writing_save',{type:'student',id},{kind:'public_service',itemId:'',revision:0,status:'submitted',text:'국민을 위한 공직관'});
  }
  const a=await invoke('admin_writing_board',admin),b=await invoke('admin_writing_board',admin,{page:1});
  assert.equal(a.total,32);assert.equal(a.submissions.length,30);assert.equal(b.submissions.length,2);
  assert.equal(new Set([...a.submissions,...b.submissions].map(s=>s.student_id+':'+s.kind)).size,32);
  for(const role of ['anon','authenticated']){
   await db.exec('set role '+role);await assert.rejects(invoke('admin_writing_board',admin),/permission denied/);await db.exec('reset role');
  }
  await db.exec('set role service_role');assert.equal((await invoke('admin_writing_board',admin)).total,32);await db.exec('reset role');
  const previous=process.env.TEACHER_SESSION_SECRET;process.env.TEACHER_SESSION_SECRET='annotation-test-only';
  try{
   let calls=0;const handler=createHandler({invoke:async(...args)=>{calls++;return invoke(...args);}});
   const call=async(body,permissions)=>{
    const token=auth.createSessionToken(process.env.TEACHER_SESSION_SECRET,{username:'reviewer',role:'admin',permissions});let status,data;
    await handler({method:'POST',headers:{host:'local.test',origin:'http://local.test',cookie:auth.COOKIE_NAME+'='+token},body},{setHeader(){},status(n){status=n;return this;},json(v){data=v;}});return {status,data};
   };
   assert.equal((await call({action:'admin_writing_board'},['interview.read'])).status,200);
   assert.equal((await call({action:'admin_writing_feedback',...review()},['interview.read'])).status,403);
   assert.equal((await call({action:'admin_writing_feedback',...review(),annotations:[{...marks[0],start:-1}]},['interview.write'])).status,400);
   assert.equal(calls,1,'Rejected input/permissions cannot reach database');
  }finally{if(previous===undefined)delete process.env.TEACHER_SESSION_SECRET;else process.env.TEACHER_SESSION_SECRET=previous;}
  console.log('PASS annotations/board: Unicode ranges, immutable source, mark-only review, validation, old-client compatibility, resubmission, conflicts, ownership, search/status/kind filters, pagination, API permissions and DB grants.');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
