const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createDb}=require('./helpers/interview-db.cjs');
const {createHandler,_private}=require('../api/interview-auth');
const prep=require('../api/interview-prep'),webAuth=require('../lib/interview-web-auth'),teacherAuth=require('../api/teacher-auth-utils');
const cfg={enabled:true,origin:'https://app.test',clientId:'test-kakao-app',clientSecret:'test-client-secret'};
const hash=webAuth.hash,server={type:'server'},admin={type:'admin',id:'qa'};
(async()=>{
 const {db,invoke}=await createDb({beforePortal:async db=>{
  await db.exec("insert into ip_members(student_id,track,exam_number) values('ip-a','공채','old-number'); insert into ip_notes(student_id,topic_id,fields) values('ip-a','self','{\"situation\":\"기존 작성 내용\"}'); insert into ip_history(student_id,entity,entity_id,actor_id,snapshot) values('ip-a','note','ip-a:self','ip-a','{\"preserved\":true}')");
 }});
 try{
  await db.query("update students set password_hash=$1 where id in ('ip-a','ip-b')",[hash('ExistingPassword!')]);
  await invoke('admin_enabled',admin,{enabled:true});
  const rpc=(action,body)=>invoke(action,server,body);
  let exchanges=0;
  const handler=createHandler({getConfig:()=>cfg,invoke:rpc,exchange:async code=>{exchanges++;if(code==='bad')throw Error('kakao_login_failed');return code==='new'?'20001':code==='other'?'20002':'10001';}});
  const request=async(method,body,jar={},query='',headers={})=>{
   const out={status:0,headers:{},data:null};
   const req={method,url:'/api/interview-auth'+query,body,headers:{host:'app.test',origin:cfg.origin,cookie:Object.entries(jar).map(([k,v])=>k+'='+v).join('; '),...headers},socket:{remoteAddress:'test-loopback'}};
   const res={setHeader(k,v){out.headers[k]=v;},get statusCode(){return out.status;},set statusCode(v){out.status=v;},status(n){out.status=n;return this;},json(d){out.data=d;},end(){}};
   await handler(req,res);
   for(const cookie of [].concat(out.headers['Set-Cookie']||[])){const [pair]=cookie.split(';'),i=pair.indexOf('=');if(pair.slice(i+1))jar[pair.slice(0,i)]=pair.slice(i+1);else delete jar[pair.slice(0,i)];}
   return out;
  };
  const post=(body,jar,headers)=>request('POST',body,jar,'',headers);
  const session=jar=>request('GET',undefined,jar,'?action=session');
  const start=async(jar,intent='login')=>{
   const out=await post({action:'kakao_start',intent},jar);assert.equal(out.status,200);
   const url=new URL(out.data.url);assert.equal(url.origin,'https://kauth.kakao.com');
   assert.equal(url.searchParams.get('redirect_uri'),cfg.origin+'/api/interview-auth?action=callback');
   assert(out.headers['Set-Cookie'].includes('HttpOnly'));assert(out.headers['Set-Cookie'].includes('Secure'));
   return url.searchParams.get('state');
  };
  const callback=(jar,state,code)=>request('GET',undefined,jar,'?action=callback&state='+encodeURIComponent(state)+'&code='+encodeURIComponent(code));
  const login=async(jar,code)=>{const state=await start(jar);const r=await callback(jar,state,code);assert.equal(r.headers.Location,'/interview');return r;};
  assert.equal((await session({})).data.authenticated,false);
  assert.equal((await post({action:'legacy_login',studentId:'ip-a',password:'ExistingPassword!',intent:'login'},{},{origin:'https://evil.test'})).status,403);
  assert.equal((await post({action:'legacy_login',studentId:'ip-c',password:'claim-null-password',intent:'login'},{})).status,401);
  // state is both browser-bound and single-use; hostile callback never exchanges.
  const stateJar={},state=await start(stateJar);
  assert((await callback({},state,'new')).headers.Location.includes('oauth_state_invalid'));assert.equal(exchanges,0);
  const stateCookie={...stateJar};
  await callback(stateJar,state,'new');assert.equal(exchanges,1);
  assert((await callback(stateCookie,state,'new')).headers.Location.includes('oauth_state_invalid'));assert.equal(exchanges,1);
  const newcomer=stateJar,unlinked=(await session(newcomer)).data;
  assert.equal(unlinked.authenticated,true);assert.equal(unlinked.account.ownerId,null);assert.equal(unlinked.available,false);
  // Client-chosen owner/actor cannot bind a fresh identity to an existing student.
  let application=(await post({action:'apply',name:'신규 면접학생',track:'기관',examNumber:'N-001',revision:0,ownerId:'ip-a',actor:admin},newcomer)).data.application;
  assert(application.owner_id.startsWith('iw_'));assert.notEqual(application.owner_id,'ip-a');
  assert.equal(Number((await db.query("select count(*) n from students")).rows[0].n),3,'No new row in ordinary student roster');
  const newId=application.owner_id;
  await assert.rejects(invoke('bootstrap',{type:'student',id:newId}),/not_enrolled/);
  assert.equal((await session(newcomer)).data.available,false);
  await assert.rejects(invoke('admin_application_decide',admin,{id:application.id,revision:0,status:'approved',reviewNote:''}),/revision_conflict/);
  await assert.rejects(invoke('admin_application_decide',admin,{id:application.id,revision:1,status:'rejected',reviewNote:''}),/review_note_required/);
  await invoke('admin_application_decide',admin,{id:application.id,revision:1,status:'rejected',reviewNote:'수험번호 확인 필요'});
  for(let i=0;i<2;i++){
   const rejected=(await session(newcomer)).data;
   assert.equal(rejected.application.review_note,'수험번호 확인 필요');
   assert.equal(rejected.application.status,'rejected','Reading status never reapplies');
   assert.equal(rejected.application.revision,2);
   assert.equal(rejected.available,false);
  }
  assert(!(await invoke('admin_applications',admin,{status:'pending'})).applications.some(a=>a.id===application.id));
  application=(await post({action:'apply',name:'신규 면접학생',track:'기관',examNumber:'N-002',revision:2},newcomer)).data.application;
  assert.equal(application.status,'pending');
  assert.equal(application.review_note,'');
  assert((await invoke('admin_applications',admin,{status:'pending'})).applications.some(a=>a.id===application.id));
  await invoke('admin_application_decide',admin,{id:application.id,revision:3,status:'approved',reviewNote:'수강 확인',expiresOn:'2099-12-31'});
  assert.equal((await session(newcomer)).data.available,true);
  const boot=await invoke('bootstrap',{type:'student',id:newId});assert.equal(boot.member.exam_number,'N-002');
  // Real prep boundary accepts only server-resolved web identity, not body IDs.
  const authenticateWeb=req=>webAuth.authenticatePortal(req,{getConfig:()=>cfg,call:rpc});
  const prepHandler=prep.createHandler({invoke,authenticateWeb,previewAllowed:()=>false});
  const callPrep=async(body,jar,origin=cfg.origin,teacherCookie='')=>{
   let status,data;
   await prepHandler({method:'POST',headers:{host:'app.test',origin,cookie:[...Object.entries(jar).map(([k,v])=>k+'='+v),teacherCookie].join('; ')},body},
    {setHeader(){},status(n){status=n;return this;},json(d){data=d;}});
   return{status,data};
  };
  let r=await callPrep({action:'bootstrap',studentId:'ip-a',actor:admin},newcomer);
  assert.equal(r.status,200);assert.equal(r.data.member.student_id,newId);assert.equal(r.data.notes.length,0);
  assert.equal((await callPrep({action:'bootstrap'},newcomer,'https://evil.test')).status,403);
  assert.equal((await callPrep({action:'admin_applications'},newcomer)).status,401);
  // Existing password links preserve IDs, notes and migration backfill.
  const existing={};r=await post({action:'legacy_login',studentId:'ip-a',password:'ExistingPassword!',intent:'login'},existing);
  assert.equal(r.status,200);assert.equal((await session(existing)).data.account.ownerId,'ip-a');
  assert.equal((await callPrep({action:'bootstrap'},existing)).data.notes[0].fields.situation,'기존 작성 내용');
  const beforeLinkCookie={...existing},linkState=await start(existing,'link');await callback(existing,linkState,'existing');
  assert.equal((await session(existing)).data.account.ownerId,'ip-a');assert.equal((await session(existing)).data.account.linked,true);
  assert.equal((await session(beforeLinkCookie)).data.authenticated,false,'Old session rotated');
  const passwordAgain={};
  assert.equal((await post({action:'legacy_login',studentId:'ip-a',password:'ExistingPassword!',intent:'login'},passwordAgain)).status,200);
  assert.equal((await session(passwordAgain)).data.account.linked,true,'Password login remembers the existing Kakao connection');
  const duplicate={};await login(duplicate,'other');
  assert.equal((await post({action:'legacy_login',intent:'link',studentId:'ip-a',password:'ExistingPassword!'},duplicate)).data.error,'account_already_linked');
  assert.equal((await session(duplicate)).data.account.ownerId,null);
  // State changed between linking and callback cannot link to another browser session.
  const lost={...existing},lostState=await start(lost,'link');delete lost[webAuth.COOKIE];
  assert((await callback(lost,lostState,'other')).headers.Location.includes('oauth_state_invalid'));
  // Login rate limits persist even though authentication transactions reject.
  for(let i=0;i<10;i++)assert.equal((await post({action:'legacy_login',studentId:'ip-b',password:'wrong',intent:'login'},{})).status,401);
  assert.equal((await post({action:'legacy_login',studentId:'ip-b',password:'ExistingPassword!',intent:'login'},{})).status,429);
  // Admin review requires write permission, not simply a teacher or read-only cookie.
  process.env.TEACHER_SESSION_SECRET='interview-auth-qa-secret';
  const readCookie=teacherAuth.COOKIE_NAME+'='+teacherAuth.createSessionToken(process.env.TEACHER_SESSION_SECRET,{username:'qa',role:'admin',permissions:['interview.read']});
  assert.equal((await callPrep({action:'admin_applications'},{},cfg.origin,readCookie)).status,200);
  assert.equal((await callPrep({action:'admin_application_decide',id:application.id,revision:4,status:'approved',reviewNote:''},{},cfg.origin,readCookie)).status,403);
  // Revocation and expiry are checked on each request; no long-lived signed bypass.
  const oldSession={...newcomer};await post({action:'logout'},newcomer);
  assert.equal((await session(oldSession)).data.authenticated,false);
  assert.equal((await callPrep({action:'bootstrap'},oldSession)).status,403);
  const expiring={};await login(expiring,'new');await db.query("update ip_web_sessions set expires_at=now()-interval '1 second' where token_hash=$1",[hash(expiring[webAuth.COOKIE])]);
  assert.equal((await session(expiring)).data.authenticated,false);
  await invoke('admin_member_save',admin,{targetStudentId:newId,track:'기관',examNumber:'N-002',enabled:false});
  const blocked={};await login(blocked,'new');assert.equal((await session(blocked)).data.available,false);
  for(const role of ['anon','authenticated']){
   await db.exec('set role '+role);
   for(const t of ['ip_owners','ip_web_identities','ip_web_sessions','ip_oauth_states','ip_login_limits','ip_applications','ip_student_directory'])
    await assert.rejects(db.query('select * from '+t),/permission denied/);
   await assert.rejects(rpc('session',{sessionHash:hash(existing[webAuth.COOKIE])}),/permission denied/);
   await db.exec('reset role');
  }
  await db.exec('set role service_role');assert.equal((await rpc('session',{sessionHash:hash(existing[webAuth.COOKIE])})).authenticated,true);await db.exec('reset role');
  await db.query("delete from students where id='ip-a'");
  assert.equal((await session(existing)).data.authenticated,false);
  assert.equal(Number((await db.query("select count(*) n from ip_notes where student_id='ip-a'")).rows[0].n),0);
  // Exercise actual Kakao HTTP request construction without contacting Kakao.
  const calls=[];const subject=await _private.kakaoUser('test-code',cfg,async(url,options)=>{
   calls.push({url,options});return{ok:true,json:async()=>calls.length===1?{access_token:'test-token',refresh_token:'never-save'}:{id:333}};
  });
  assert.equal(subject,'333');assert(new URLSearchParams(calls[0].options.body).get('client_secret')===cfg.clientSecret);
  assert.equal(calls[1].options.headers.Authorization,'Bearer test-token');
  assert.equal(calls[1].url,'https://kapi.kakao.com/v2/user/me');
  console.log('PASS portal auth: migration preserves existing notes; OAuth state binding/replay, password linking, isolated new accounts, approval/rejection/resubmission, CSRF, forged actors, rate limits, session rotation/revocation/expiry, grants and roster isolation.');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
