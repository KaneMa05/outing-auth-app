const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const crypto=require('node:crypto');
const {createHandler}=require('../api/student-content-safety');
const safety=require('../lib/student-content-safety');
const token='test-safety-device',hash=crypto.createHash('sha256').update(token).digest('hex');
const target='550e8400-e29b-41d4-a716-446655440000',room='550e8400-e29b-41d4-a716-446655440001';
function fixture({valid=true,member=true,privatePost=false,category='lecture'}={}){
 const blocks=[],reports=[],calls=[];
 const request=async(method,path,body)=>{
  calls.push({method,path,body});
  if(path==='rpc/validate_student_device')return{valid:valid&&body.p_student_id==='18001'&&body.p_device_token_hash===hash};
  if(path.startsWith('students?'))return[{id:'18001',student_category:category}];
  if(path.startsWith('student_content_blocks')){
   if(method==='GET')return blocks;
   if(method==='POST'){blocks.push({...body,created_at:'2026-10-28T01:00:00Z'});return null;}
   if(method==='DELETE'){blocks.length=0;return null;}
  }
  if(path.startsWith('student_content_reports')){
   if(method==='POST'){reports.push(body);return null;}
   return [];
  }
  if(path.startsWith('question_posts?'))return[{id:target,student_id:'18002',board_type:privatePost?'free':'subject',subject:privatePost?'스터디카페 비공개 의견':'자유',body:'검토할 내용'}];
  if(path.startsWith('question_comments?'))return[{id:target,post_id:target,student_id:'18002',author_type:'student',body:'댓글'}];
  if(path.startsWith('study_cafe_room_messages?'))return[{id:target,room_id:room,student_id:'18002',message_type:'chat',message_text:'채팅'}];
  if(path.startsWith('study_cafe_room_members?'))return member?[{student_id:'18001'}]:[];
  if(path.startsWith('study_cafe_presence?'))return[{student_id:'18002'}];
  if(path.startsWith('study_cafe_profiles?'))return[{nickname:'사용자',status_message:'상태'}];
  assert.fail('Unexpected '+method+' '+path);
 };
 const handler=createHandler({request,enabled:true});
 const invoke=async(body={},headers={})=>{
  const res={code:200,setHeader(){},status(code){this.code=code;return this;},json(data){this.data=data;return this;}};
  await handler({method:'POST',headers,body:{action:'list',studentId:'18001',deviceToken:token,...body}},res);return res;
 };
 return {invoke,blocks,reports,calls};
}
test('blocking persists per authenticated account; lists use opaque refs and unblock cannot target another record',async()=>{
 const f=fixture();
 assert.equal((await f.invoke({action:'block',surface:'post',targetId:target})).code,200);
 assert.equal(f.blocks[0].student_id,'18001');assert.equal(f.blocks[0].blocked_student_id,'18002');
 const list=(await f.invoke()).data.blocks;
 assert.equal(list[0].authorRef,safety.contentRef('18002'));
 assert.ok(!JSON.stringify(list).includes('18002'));
 assert.equal((await f.invoke({action:'unblock',authorRef:'wrong'})).code,404);assert.equal(f.blocks.length,1);
 assert.equal((await f.invoke({action:'unblock',authorRef:list[0].authorRef})).code,200);assert.equal(f.blocks.length,0);
});
test('reporting captures server-resolved content and author; forged snapshots/identities are ignored',async()=>{
 const f=fixture();
 const r=await f.invoke({action:'report',surface:'comment',targetId:target,reason:'부적절한 댓글',snapshot:'forged',reported_student_id:'18003'});
 assert.equal(r.code,201);assert.equal(f.reports[0].snapshot,'\n댓글');assert.equal(f.reports[0].reported_student_id,'18002');
 assert.equal((await f.invoke({action:'report',surface:'post',targetId:target,reason:'x'})).code,400);
});
test('auth, category, origin, private feedback and room membership checks prevent access to unseen content',async()=>{
 assert.equal((await fixture({valid:false}).invoke()).code,401);
 assert.equal((await fixture({category:'offline'}).invoke()).code,403);
 assert.equal((await fixture().invoke({studentId:'18002'})).code,401);
 assert.equal((await fixture().invoke({}, {origin:'https://bad.test',host:'app.test'})).code,403);
 const privateFixture=fixture({privatePost:true});
 assert.equal((await privateFixture.invoke({action:'block',surface:'feedback',targetId:target})).code,404);
 assert.equal(privateFixture.blocks.length,0);
 const roomFixture=fixture({member:false});
 assert.equal((await roomFixture.invoke({action:'report',surface:'message',targetId:target,reason:'신고 사유'})).code,404);
 assert.equal(roomFixture.reports.length,0);
 const normal=fixture();
 assert.equal((await normal.invoke({action:'report',surface:'message',targetId:target,reason:'신고 사유'})).code,201);
 assert.equal((await normal.invoke({action:'block',surface:'profile',targetId:'2',authorRef:'stale'})).code,409);
 assert.equal((await normal.invoke({action:'admin_list'})).code,401);
});
test('server scopes isolate simultaneous viewers; blocked authors are excluded before pagination and snapshot chat serialization',async()=>{
 const previous=process.env.STUDENT_CONTENT_SAFETY_ENABLED;process.env.STUDENT_CONTENT_SAFETY_ENABLED='true';
 try{
  const request=async(method,path)=>path.includes('18001')?[{blocked_student_id:'18002'}]:[];
  const [blocked,other]=await Promise.all(['18001','18003'].map(id=>safety.withStudentContentSafety(id,request,async()=>{
   await new Promise(resolve=>setTimeout(resolve,5));
   return {path:safety.contentSafePath('GET','question_posts?select=id&and=(or(subject.eq.test,student_id.eq.18001))'),data:safety.contentSafeResult({profiles:[{student_id:'18002',nickname:'숨길 닉네임',status_message:'숨길 상태'}],messages:[{id:'m1',student_id:'18002',message_type:'chat',message_text:'숨길 채팅'},{id:'system',message_type:'system',message_text:'안내'}]})};
  })));
  assert.ok(blocked.path.includes('student_id.not.in.'));assert.ok(blocked.path.includes('subject.eq.test'));
  assert.equal(blocked.data.profiles[0].nickname,null);assert.equal(blocked.data.profiles[0].status_message,null);
  assert.deepEqual(blocked.data.messages.map(m=>m.id),['system']);
  assert.ok(!other.path.includes('student_id.not.in.'));assert.equal(other.data.messages.length,2);
  assert.equal(safety.contentSafePath('GET','question_posts?select=id'),'question_posts?select=id','Scope must not leak into another request');
 }finally{if(previous===undefined)delete process.env.STUDENT_CONTENT_SAFETY_ENABLED;else process.env.STUDENT_CONTENT_SAFETY_ENABLED=previous;}
});
test('enabled question-board API enforces persisted blocks on list and direct-detail reads',async()=>{
 const handler=require('../api/question-board');
 const saved={fetch:global.fetch,url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY,flag:process.env.STUDENT_CONTENT_SAFETY_ENABLED,error:console.error};
 const reads=[];
 try{
  process.env.SUPABASE_URL='https://safety-test.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='test-only-key';process.env.STUDENT_CONTENT_SAFETY_ENABLED='true';
  console.error=()=>{};
  global.fetch=async(url)=>{
   const path=new URL(url).pathname;reads.push(decodeURIComponent(url));
   let value=[];
   if(path.endsWith('/validate_student_device'))value={valid:true};
   else if(path.endsWith('/students'))value=[{id:'18001',track:'공채',student_category:'lecture'}];
   else if(path.endsWith('/student_content_blocks'))value=[{blocked_student_id:'18002'}];
   else if(path.endsWith('/question_posts')){
    assert.ok(decodeURIComponent(url).includes('student_id.not.in.("18002")'));
    value=[];
   }
   return{ok:true,status:200,json:async()=>value,text:async()=>''};
  };
  async function invoke(action){const res={setHeader(){},status(code){this.code=code;return this;},json(data){this.data=data;}};await handler({method:'POST',headers:{},body:{action,studentId:'18001',deviceToken:token,postId:target}},res);return res;}
  const list=await invoke('list');assert.equal(list.code,200);assert.deepEqual(list.data.posts,[]);
  assert.equal((await invoke('detail')).code,404);
  assert.equal(reads.filter(path=>path.includes('/student_content_blocks?')).length,2);
 }finally{
  global.fetch=saved.fetch;console.error=saved.error;
  for(const [name,value] of [['SUPABASE_URL',saved.url],['SUPABASE_SERVICE_ROLE_KEY',saved.key],['STUDENT_CONTENT_SAFETY_ENABLED',saved.flag]])if(value===undefined)delete process.env[name];else process.env[name]=value;
 }
});
test('text filter rejects targeted abuse while allowing examination subject terminology',()=>{
 assert.throws(()=>safety.assertAcceptableText('씨\u200b발'),/inappropriate_content/);
 assert.throws(()=>safety.assertAcceptableText('kill you'),/inappropriate_content/);
 assert.doesNotThrow(()=>safety.assertAcceptableText('강간죄의 구성요건과 형사법 판례', '시발점에 대해 설명합니다.'));
});
test('enabled room snapshot API removes blocked chat and masks profiles without releasing seats or exposing member IDs',async()=>{
 const handler=require('../api/study-cafe-rooms');
 const saved={fetch:global.fetch,url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY,flag:process.env.STUDENT_CONTENT_SAFETY_ENABLED};
 const snapshot={membership:{room_id:room,role:'member',seat_number:1,last_read_at:'2026-10-28T00:00:00Z'},room:{id:room,name:'기존 스터디룸',description:'소개',capacity:8,host_student_id:'18002',is_active:true},members:[{student_id:'18001',role:'member',seat_number:1},{student_id:'18002',role:'host',seat_number:2}],profiles:[{student_id:'18002',nickname:'숨길 닉네임',status_message:'숨길 상태'}],students:[{id:'18001',name:'본인'},{id:'18002',name:'상대 이름'}],messages:[{id:target,student_id:'18002',message_type:'chat',message_text:'숨길 메시지',created_at:'2026-10-28T01:00:00Z'},{id:'system',message_type:'system',message_text:'안내',created_at:'2026-10-28T01:00:01Z'}],sessions:[]};
 try{
  process.env.SUPABASE_URL='https://safety-test.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='test-only-key';process.env.STUDENT_CONTENT_SAFETY_ENABLED='true';
  global.fetch=async(url,options)=>{
   const path=new URL(url).pathname;
   let value;
   if(path.endsWith('/validate_student_device'))value={valid:true};
   else if(path.endsWith('/students'))value=[{id:'18001',name:'본인',student_category:'lecture'}];
   else if(path.endsWith('/student_content_blocks'))value=[{blocked_student_id:'18002'}];
   else if(path.endsWith('/get_study_cafe_room_snapshot'))value=snapshot;
   else if(path.endsWith('/study_cafe_room_members')&&options.method==='GET')value=[];
   else assert.fail('Unexpected request '+options.method+' '+path);
   return{ok:true,status:200,json:async()=>value,text:async()=>''};
  };
  const res={setHeader(){},status(code){this.code=code;return this;},json(data){this.data=data;}};
  await handler({method:'POST',headers:{},body:{action:'load',studentId:'18001',deviceToken:token}},res);
  assert.equal(res.code,200);assert.equal(res.data.room.mySeatNumber,1);assert.equal(res.data.room.members[1].seatNumber,2);
  assert.deepEqual(res.data.room.messages.map(m=>m.id),['system']);
  assert.equal(res.data.room.members[1].studentId,undefined);assert.ok(res.data.room.members[1].safetyRef);
  assert.ok(!JSON.stringify(res.data).includes('숨길'));
 }finally{
  global.fetch=saved.fetch;
  for(const [name,value] of [['SUPABASE_URL',saved.url],['SUPABASE_SERVICE_ROLE_KEY',saved.key],['STUDENT_CONTENT_SAFETY_ENABLED',saved.flag]])if(value===undefined)delete process.env[name];else process.env[name]=value;
 }
});
test('moderation requires the signed operator permission and hides content before marking the report resolved',async()=>{
 const auth=require('../api/teacher-auth-utils'),previous=process.env.TEACHER_SESSION_SECRET;
 process.env.TEACHER_SESSION_SECRET='safety-test-session-secret';
 const writes=[];
 const request=async(method,path,body)=>{
  if(method==='GET')return[{id:target,surface:'profile',target_id:'2',reported_student_id:'18002'}];
  writes.push({path,body});return null;
 };
 const handler=createHandler({request,enabled:true});
 async function invoke(permissions){
  const cookie=auth.COOKIE_NAME+'='+auth.createSessionToken(process.env.TEACHER_SESSION_SECRET,{username:'test-moderator',role:'admin',permissions});
  const res={setHeader(){},status(code){this.code=code;return this;},json(data){this.data=data;}};
  await handler({method:'POST',headers:{cookie},body:{action:'admin_review',reportId:target,status:'removed'}},res);return res;
 }
 try{
  assert.equal((await invoke(['inquiries.read'])).code,403);assert.equal(writes.length,0);
  assert.equal((await invoke(['inquiries.write'])).code,200);
  assert.ok(writes[0].path.startsWith('study_cafe_profiles?'));assert.equal(writes[0].body.nickname,null);
  assert.ok(writes[1].path.startsWith('study_cafe_presence?'));assert.equal(writes[1].body.display_name,null);
  assert.ok(writes[2].path.startsWith('student_content_reports?'));assert.equal(writes[2].body.status,'removed');
 }finally{if(previous===undefined)delete process.env.TEACHER_SESSION_SECRET;else process.env.TEACHER_SESSION_SECRET=previous;}
});
test('new user controls require confirmation, send the authenticated identity and preserve recoverable errors',async()=>{
 const vm=require('node:vm');let modal,lastBody,currentStudent='18001',rendered=0;
 function el(tag,props={},children=[]){return{tag,...props,children:Array.isArray(children)?children:[children],isConnected:true,disabled:false,textContent:'',value:'',replaceChildren(...nodes){this.children=nodes;}};}
 const box={
  getAuthedStudent:()=>({id:currentStudent}),getStudentProfile:()=>({deviceToken:token}),
  el,button:(text,className,type,onclick)=>({...el('button',{className,type}),text,onclick}),
  openInfoModal:options=>{modal=options;return{confirmButton:el('button')};},closeInfoModal(){},notify(){},
  currentRoute:'feedback',render(){rendered++;},AbortSignal,
  studyRoomState:{loaded:true,room:{mySeatNumber:1,messages:[{type:'chat',safetyRef:'blocked-ref',text:'숨길 채팅'}],members:[{seatNumber:2,safetyRef:'blocked-ref',name:'숨길 닉네임',statusMessage:'숨길 상태'}]}},
  fetch:async(url,options)=>{lastBody=JSON.parse(options.body);return{ok:true,json:async()=>({ok:true,authorRef:'blocked-ref'})};},
 };
 vm.createContext(box);vm.runInContext(fs.readFileSync('student-content-safety.js','utf8'),box);
 const actions=box.renderStudentSafetyActions({surface:'post',targetId:target});
 actions.children[0].onclick();
 await modal.onConfirm();assert.equal(lastBody,undefined,'Empty report must not be sent');
 const reason=modal.content.children.find(node=>node.tag==='textarea');reason.value='신고 사유';
 await modal.onConfirm();assert.equal(lastBody.action,'report');assert.equal(lastBody.studentId,'18001');
 lastBody=undefined;actions.children[1].onclick();currentStudent='18003';await modal.onConfirm();assert.equal(lastBody,undefined,'A stale dialog must not act as a new signed-in user');
 currentStudent='18001';actions.children[1].onclick();await modal.onConfirm();assert.equal(lastBody.action,'block');assert.equal(rendered,1);
  assert.equal(box.studyRoomState.room.messages.length,0);assert.equal(box.studyRoomState.room.mySeatNumber,1);
  assert.equal(box.studyRoomState.room.members[0].name,'차단한 사용자');assert.equal(box.studyRoomState.room.members[0].seatNumber,2);
});
test('migration preserves existing learners and protects new tables from direct clients',async()=>{
 const {PGlite}=require(process.env.PGLITE_MODULE||'C:/Users/Public/Documents/ESTsoft/CreatorTemp/ox-db-tools/node_modules/@electric-sql/pglite');
 const db=new PGlite();
 try{
  await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create table public.students(id text primary key,name text);insert into students values('18001','원래 학생'),('18002','다른 학생');");
  await db.exec(fs.readFileSync('supabase/migrations/20261028025133_student_content_safety.sql','utf8'));
  assert.equal((await db.query('select count(*)::int n from students')).rows[0].n,2);
  assert.equal((await db.query("select count(*)::int n from pg_class where relname in ('student_content_blocks','student_content_reports') and relrowsecurity")).rows[0].n,2);
  await db.exec("set role service_role;insert into student_content_blocks(student_id,blocked_student_id) values('18001','18002');");
  await assert.rejects(db.query("insert into student_content_blocks(student_id,blocked_student_id) values('18001','18001')"),/check constraint/);
  await db.query('insert into student_content_reports(reporter_student_id,reported_student_id,surface,target_id,snapshot,reason) values($1,$2,$3,$4,$5,$6)',['18001','18002','post',target,'本文','신고 사유']);
  for(const role of ['anon','authenticated']){
   await db.exec('reset role;set role '+role);
   for(const table of ['student_content_blocks','student_content_reports'])await assert.rejects(db.query('select * from '+table),/permission denied/);
  }
 }finally{await db.close();}
});
