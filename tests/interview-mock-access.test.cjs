'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {createDb}=require('./helpers/interview-db.cjs');
const admin={type:'admin',id:'qa'},student={type:'student',id:'ip-a'};
async function call(handler,body,headers={}){let status,data;await handler({method:'POST',headers:{host:'localhost',...headers},body},{setHeader(){},status(n){status=n;return this;},json(d){data=d;}});return {status,data};}
(async()=>{
 const {db,invoke:prep}=await createDb();
 try{
  await db.exec(fs.readFileSync('supabase/migrations/20261030140517_interview_mock_test_access.sql','utf8'));
  const invoke=async(action,actor,body={})=>(await db.query('select ip_mock_access_service($1,$2::jsonb,$3::jsonb) result',[action,JSON.stringify(actor),JSON.stringify(body)])).rows[0].result;
  const member={targetStudentId:'ip-a',track:'공채',examNumber:'QA',enabled:true,expiresOn:''};
  await prep('admin_enabled',admin,{enabled:true});
  await invoke('admin_member_save',admin,member);
  assert.equal((await invoke('mock_status',student)).allowed,false);
  await assert.rejects(invoke('admin_member_save',student,{...member,mockTestEnabled:true}),/forbidden/);
  await invoke('admin_member_save',admin,{...member,mockTestEnabled:true});
  assert.equal((await invoke('mock_status',student)).allowed,true);
  assert.equal((await invoke('admin_members',admin)).members[0].mock_test_enabled,true);
  assert.equal((await invoke('admin_members',admin,{search:'NO MATCH'})).members.length,0);
  assert.equal((await invoke('mock_status',{type:'student',id:'ip-b'},{mockTestEnabled:true,studentId:'ip-a'})).allowed,false);
  await invoke('admin_member_save',admin,member); // Old clients cannot accidentally reset access.
  assert.equal((await invoke('mock_status',student)).allowed,true);
  await invoke('admin_member_save',admin,{...member,expiresOn:'2000-01-01'});
  assert.equal((await invoke('mock_status',student)).allowed,false);
  await invoke('admin_member_save',admin,{...member,mockTestEnabled:true});
  const requireMockAccess=async id=>{if(!(await invoke('mock_status',{type:'student',id})).allowed)throw Error('forbidden');};
  const deps={requireMockAccess,authenticateWeb:async()=>student,config:{enabled:true,configured:true,transport:'vercel'},invoke:async()=>({ok:true,runs:[]})};
  const live=require('../api/interview-live').createHandler(deps);
  assert.equal((await call(live,{action:'list'})).status,200);
  const secret='x'.repeat(64),token=require('../lib/interview-native-auth').issue(student.id,secret);
  const native=require('../api/interview-native').createHandler({enabled:true,secret,requireMockAccess,live:deps,invoke:async()=>({studentId:student.id})});
  assert.equal((await call(native,{action:'command',command:{action:'list'}},{authorization:'Bearer '+token})).status,200);
  await invoke('admin_member_save',admin,{...member,mockTestEnabled:false});
  assert.equal((await call(live,{action:'list'})).status,403);
  assert.equal((await call(native,{action:'command',command:{action:'list'}},{authorization:'Bearer '+token})).status,403);
  assert.equal((await call(native,{action:'launch'})).status,403);
  assert.equal((await call(native,{action:'exchange',code:'a'.repeat(43)})).status,403);
  for(const name of ['job-exam','personality']){
   const handler=require('../api/interview-'+name).createHandler({...deps,config:()=>({enabled:true,ready:true,storageReady:true})});
   assert.equal((await call(handler,{action:'status'})).status,403,name);
  }
  assert.equal((await prep('bootstrap',student)).ok,true,'normal preparation remains available');
  const auth=require('../api/teacher-auth-utils');
  process.env.TEACHER_SESSION_SECRET='mock-access-test-only';
  const handler=require('../api/interview-prep').createHandler({authenticateWeb:async()=>student,invoke});
  const cookie=permissions=>auth.COOKIE_NAME+'='+auth.createSessionToken(process.env.TEACHER_SESSION_SECRET,{username:'qa',role:'admin',permissions});
  const save={action:'admin_member_save',...member,mockTestEnabled:true};
  assert.equal((await call(handler,save)).status,401);
  assert.equal((await call(handler,save,{cookie:cookie(['interview.read'])})).status,403);
  assert.equal((await call(handler,{...save,mockTestEnabled:'true'},{cookie:cookie(['*'])})).status,400);
  assert.equal((await call(handler,save,{cookie:cookie(['*']),origin:'https://evil.invalid'})).status,403);
  assert.equal((await call(handler,save,{cookie:cookie(['*'])})).status,200);
  assert.equal((await call(handler,{action:'mock_status',actor:{type:'admin',id:'qa'},studentId:'ip-b'})).data.allowed,true);
  await db.exec('set role anon');
  await assert.rejects(invoke('mock_status',student),/permission denied/);
  await db.exec('reset role;set role authenticated');
  await assert.rejects(db.exec("update ip_members set mock_test_enabled=true"),/permission denied/);
  await db.exec('reset role');
  console.log('mock access: default deny, grant, revoke, expiry, identity spoofing, native tokens, API gates, RLS passed');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
