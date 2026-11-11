'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID}=require('node:crypto');
const {createDb}=require('./helpers/interview-db.cjs');
const {createHandler}=require('../api/interview-native');
const auth=require('../lib/interview-native-auth');
const migration='supabase/migrations/20261111021049_interview_native_portal_launch.sql';
const admin={type:'admin',id:'qa'},server={type:'server',id:'native',testApp:true},portal={type:'student',id:'portal-only',testApp:true};
async function call(handler,body,token){let status,data;await handler({method:'POST',headers:{host:'localhost','x-interview-test-app':'1',...(token?{authorization:'Bearer '+token}:{})},body},
 {setHeader(){},status(n){status=n;return this;},json(value){data=value;}});return {status,data};}
(async()=>{
 const {db,invoke:prep}=await createDb();
 const invoke=(name,action,actor,body={})=>db.query('select '+name+'($1,$2::jsonb,$3::jsonb) result',[action,JSON.stringify(actor),JSON.stringify(body)]).then(r=>r.rows[0].result);
 const native=(...args)=>invoke('ip_native_launch_service',...args),live=(...args)=>invoke('ip_live_service',...args);
 const mock=(...args)=>invoke('ip_mock_access_service',...args);
 const issue=()=>native('issue',portal,{codeHash:'a'.repeat(64)});
 try{
  for(const name of ['20261021060740_interview_live_sessions.sql','20261021085929_interview_native_launch.sql','20261030140517_interview_mock_test_access.sql','20261031052127_fix_mock_access_portal_accounts.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+name,'utf8'));
  await db.exec("insert into ip_owners(id,name) values('portal-only','면접반 전용 계정')");
  const member={targetStudentId:portal.id,track:'공채',examNumber:'QA',enabled:true,mockTestEnabled:true,expiresOn:''};
  await mock('admin_member_save',admin,member);await prep('admin_enabled',admin,{enabled:true});
  await db.exec("insert into ip_questions(id,prompt,category,status) values('n1','협업 경험은?','personality','published'),('n2','지원 동기는?','personality','published'),('n3','갈등 해결은?','personality','published')");
  assert.equal((await mock('mock_status',portal)).allowed,true);
  await assert.rejects(issue(),/not_enrolled/,'reproduce launch failure for an allowed portal account');
  await assert.rejects(live('ready',portal),/forbidden/,'reproduce the second blocker after native handoff');
  await db.exec(fs.readFileSync(migration,'utf8'));
  await assert.rejects(native('issue',{type:'student',id:portal.id},{codeHash:'e'.repeat(64)}),/not_enrolled/,'ordinary launch keeps its previous enrollment policy');
  await assert.rejects(live('ready',{type:'student',id:portal.id}),/forbidden/,'ordinary Live keeps its previous enrollment policy');
  await db.exec('set role service_role');
  const requireMockAccess=async id=>{if(!(await mock('mock_status',{type:'student',id})).allowed)throw Error('forbidden');};
  const secret='n'.repeat(64),handler=createHandler({enabled:true,secret,invoke:native,readTrack:async()=> '공채',requireMockAccess,
   live:{authenticateWeb:async()=>portal,config:{enabled:true,configured:true,transport:'vercel',secret},invoke:live}});
  const launched=await call(handler,{action:'launch'});assert.equal(launched.status,200);
  const exchange=await call(handler,{action:'exchange',code:launched.data.code});assert.equal(exchange.status,200);assert.equal(auth.read(exchange.data.token,secret).id,portal.id);
  assert.equal((await call(handler,{action:'exchange',code:launched.data.code})).status,401);
  assert.equal((await call(handler,{action:'command',command:{action:'ready'}},exchange.data.token)).data.ready,true);
  const start=await call(handler,{action:'command',command:{action:'start',requestKey:randomUUID(),sdp:'v=0 test'}},exchange.data.token);
  assert.equal(start.status,200);assert.equal(start.data.transport,'websocket');assert(start.data.ticket);
  const run=(await live('reserve',portal,{requestKey:randomUUID()})).run;
  const retention=Date.parse(run.retain_until)-Date.now();assert(retention>30*86400000&&retention<=31*86400000,'open-ended enrollment has bounded audio retention');
  await live('closed',server,{runId:run.id,state:'completed',recordingState:'missing'});
  await db.exec('reset role');
  // Dated enrollment keeps the original end-date-based retention rule.
  await mock('admin_member_save',admin,{...member,expiresOn:'2099-12-01'});
  const dated=(await live('reserve',portal,{requestKey:randomUUID()})).run;
  assert.equal(Date.parse(dated.retain_until),Date.parse('2100-01-01T00:00:00+09:00'));
  await live('closed',server,{runId:dated.id,state:'completed',recordingState:'missing'});
  for(const change of [{expiresOn:'2000-01-01'},{enabled:false}]){
   await mock('admin_member_save',admin,{...member,...change});await assert.rejects(issue(),/not_enrolled/);assert.equal((await live('ready',portal)).ready,false);
  }
  await mock('admin_member_save',admin,member);
  await db.exec("update ip_owners set active=false where id='portal-only'");await assert.rejects(issue(),/not_enrolled/);await assert.rejects(live('ready',portal),/forbidden/);
  await db.exec("update ip_owners set active=true where id='portal-only'");
  await prep('admin_enabled',admin,{enabled:false});await assert.rejects(issue(),/not_enrolled/);await prep('admin_enabled',admin,{enabled:true});
  await native('issue',portal,{codeHash:'b'.repeat(64)});await db.exec("update ip_members set enabled=false where student_id='portal-only'");
  await assert.rejects(native('consume',server,{codeHash:'b'.repeat(64)}),/not_enrolled/);
  await mock('admin_member_save',admin,{...member,mockTestEnabled:false});assert.equal((await call(handler,{action:'launch'})).status,403);
  await assert.rejects(native('issue',server,{codeHash:'c'.repeat(64)}),/forbidden/);
  await db.exec('set role anon');await assert.rejects(issue(),/permission denied/);await assert.rejects(db.query('select * from ip_native_launch_codes'),/permission denied/);await db.exec('reset role');
  // Existing student accounts can still launch, including open-ended enrollment.
  await mock('admin_member_save',admin,{...member,targetStudentId:'ip-a'});
  await native('issue',{type:'student',id:'ip-a',testApp:true},{codeHash:'d'.repeat(64)});
  assert.equal((await native('consume',server,{codeHash:'d'.repeat(64)})).studentId,'ip-a');
  console.log('PASS portal native launch, token exchange, Live readiness/admission, finite retention, legacy enrollment, revoked access and RLS. No paid calls.');
 }finally{await db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
