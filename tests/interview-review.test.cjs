const assert=require('node:assert/strict');
const {createDb}=require('./helpers/interview-db.cjs');
const {createHandler}=require('../api/interview-prep');
const auth=require('../api/teacher-auth-utils');
(async()=>{
 const {db,invoke}=await createDb(),admin={type:'admin',id:'review-test'};
 try{
  for(const id of ['ip-a','ip-b','ip-c'])await invoke('admin_member_save',admin,{targetStudentId:id,track:'공채',examNumber:'EXAM-'+id,enabled:true});
  await invoke('admin_enabled',admin,{enabled:true});
  await invoke('note_save',{type:'student',id:'ip-a'},{topicId:'teamwork',topicRevision:1,revision:0,status:'draft',fields:{situation:'임시저장한 개인 경험',help:'도움이 필요한 내용'}});
  await invoke('writing_save',{type:'student',id:'ip-a'},{kind:'introduction',itemId:'',revision:0,status:'submitted',text:'기존 수강생의 자기소개 <script>alert(1)</script>'});
  await invoke('writing_save',{type:'student',id:'ip-a'},{kind:'public_service',itemId:'',revision:0,status:'draft',text:'공직관 임시저장'});
  await db.query("insert into ip_life_profiles(student_id,content,status) values($1,$2,'submitted')",['ip-a',JSON.stringify({background:'주요 이력',qualifications:[],affiliations:[],awards:[],experiences:[],none:[]})]);
  await db.exec("update ip_topics set active=false where id='teamwork'; update students set is_active=false where id='ip-a'; update ip_members set enabled=false,expires_on='2020-01-01' where student_id='ip-a'");
  await db.query("insert into ip_owners(id,name) values('iw-review',$1)",['신규 면접 전용 학생']);
  await db.exec("insert into ip_members(student_id,track,exam_number,enabled) values('iw-review','항해','NEW-123',true)");
  await invoke('writing_save',{type:'student',id:'iw-review'},{kind:'motivation',itemId:'',revision:0,status:'submitted',text:'신규 학생의 지원동기'});
  await invoke('admin_writing_feedback',admin,{targetStudentId:'iw-review',kind:'motivation',itemId:'',revision:1,status:'needs_revision',feedback:'보완해주세요'});
  let r=await invoke('admin_review_students',admin);
  assert.equal(r.total,4);assert.equal(r.pendingStudents,1);assert.equal(r.revisionStudents,1);
  const a=r.students.find(s=>s.id==='ip-a');
  assert.equal(a.is_active,false);assert.equal(a.enabled,false);assert.equal(a.writing_count,2);assert.equal(a.note_count,1);assert.equal(a.life_count,1);assert.equal(a.pending_count,2);assert.equal(a.draft_count,2);
  assert.equal((await invoke('admin_review_students',admin,{search:'EXAM-ip-a'})).students[0].id,'ip-a');
  assert.equal((await invoke('admin_review_students',admin,{search:'신규',track:'항해'})).total,1);
  for(const [status,total] of [['pending',1],['revision',1],['draft',1],['empty',2]])assert.equal((await invoke('admin_review_students',admin,{status})).total,total,status);
  assert.equal((await invoke('admin_review_students',admin,{search:'does-not-exist'})).total,0);
  const historyBefore=(await db.query('select count(*)::int n from ip_history')).rows[0].n;
  r=await invoke('admin_review_detail',admin,{targetStudentId:'ip-a'});
  assert.equal(r.profile.content.background,'주요 이력');assert.equal(r.notes[0].topic.active,false);assert.equal(r.notes[0].fields.help,'도움이 필요한 내용');
  assert.equal(r.writings.find(w=>w.kind==='public_service').body,'공직관 임시저장');
  assert(r.writings.find(w=>w.kind==='introduction').body.includes('<script>'));
  assert.equal((await invoke('admin_review_detail',admin,{targetStudentId:'iw-review'})).writings.length,1);
  await assert.rejects(invoke('admin_review_detail',admin,{targetStudentId:'missing'}),/student_unavailable/);
  await assert.rejects(invoke('admin_review_students',{type:'student',id:'ip-a'}),/forbidden/);
  await assert.rejects(invoke('admin_review_detail',{id:'fake'},{targetStudentId:'ip-a'}),/forbidden/);
  await assert.rejects(invoke('admin_review_students',admin,{status:'invalid'}),/invalid_request/);
  assert.equal((await db.query('select count(*)::int n from ip_history')).rows[0].n,historyBefore,'Review is read-only');
  for(let i=0;i<32;i++){
   const id='page-'+String(i).padStart(2,'0');
   await db.query("insert into ip_owners(id,name) values($1,$1)",[id]);
   await db.query("insert into ip_members(student_id,track,exam_number) values($1,'공채',$1)",[id]);
  }
  const first=await invoke('admin_review_students',admin,{page:0}),second=await invoke('admin_review_students',admin,{page:1});
  assert.equal(first.total,36);assert.equal(first.students.length,30);assert.equal(second.students.length,6);
  assert.equal(new Set([...first.students,...second.students].map(s=>s.id)).size,36);
  const proc=(await db.query("select prosecdef,provolatile,has_function_privilege('anon',oid,'EXECUTE') anon,has_function_privilege('authenticated',oid,'EXECUTE') authenticated,has_function_privilege('service_role',oid,'EXECUTE') service from pg_proc where proname='ip_review_service'")).rows[0];
  assert.deepEqual(proc,{prosecdef:false,provolatile:'s',anon:false,authenticated:false,service:true});
  await db.exec('set role service_role');
  assert.equal((await invoke('admin_review_students',admin)).total,36);
  await db.exec('reset role');
  const previousSecret=process.env.TEACHER_SESSION_SECRET;process.env.TEACHER_SESSION_SECRET='review-api-test-only';
  try{
   let calls=0;
   const handler=createHandler({invoke:async(...args)=>{calls++;return invoke(...args);}});
   const call=async(body,user)=>{
    const token=user?auth.createSessionToken(process.env.TEACHER_SESSION_SECRET,user):'';
    let status,data;
    await handler({method:'POST',body,headers:{host:'local.test',origin:'http://local.test',cookie:auth.COOKIE_NAME+'='+token}},
     {setHeader(){},status(n){status=n;return this;},json(v){data=v;}});
    return {status,data};
   };
   for(const user of [null,{username:'teacher',role:'teacher',permissions:['interview.read']},{username:'no-access',role:'admin',permissions:[]}]){
    assert([401,403].includes((await call({action:'admin_review_detail',targetStudentId:'ip-a',actor:admin},user)).status));
   }
   assert.equal(calls,0,'Unauthorized callers must never reach DB');
   const reader={username:'reader',role:'admin',permissions:['interview.read']};
   assert.equal((await call({action:'admin_review_students'},reader)).data.total,36);
   assert.equal((await call({action:'admin_review_detail',targetStudentId:'ip-a'},reader)).data.student.id,'ip-a');
   assert.equal((await call({action:'admin_review_detail'},reader)).status,400);
   assert.equal((await call({action:'admin_enabled',enabled:false},reader)).status,403);
  }finally{if(previousSecret===undefined)delete process.env.TEACHER_SESSION_SECRET;else process.env.TEACHER_SESSION_SECRET=previousSecret;}
  console.log('PASS review: all members, drafts, inactive/expired and new accounts, search, filters, pagination, detail isolation, read-only role grants and API authorization.');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
