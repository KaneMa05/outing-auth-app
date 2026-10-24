'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const auth=require('../lib/interview-native-auth');
const {createHandler}=require('../api/interview-native');
const {createDb}=require('./helpers/interview-db.cjs');
const secret='n'.repeat(64),actor={type:'student',id:'ip-a'};
async function call(handler,body,headers={}){let status,data;await handler({method:'POST',headers:{host:'localhost',...headers},body},{setHeader(){},status(n){status=n;return this;},json(d){data=d;}});return {status,data};}
(async()=>{
 const token=auth.issue('ip-a',secret,1000);assert.equal(auth.read(token,secret,1000).id,'ip-a');
 for(const fn of [()=>auth.read(token,secret,999),()=>auth.read(token,secret,1801000),()=>auth.read(token+'x',secret,1001),()=>auth.read(token,'x'.repeat(64),1001),()=>auth.issue('ip-a','short')])assert.throws(fn,/unauthorized/);
 const {db,invoke:prep}=await createDb();
 try{
  await db.exec(fs.readFileSync('supabase/migrations/20261021085929_interview_native_launch.sql','utf8'));
  await prep('admin_member_save',{type:'admin',id:'qa'},{targetStudentId:'ip-a',track:'공채',examNumber:'QA',enabled:true,expiresOn:'2099-12-01'});
  await prep('admin_enabled',{type:'admin',id:'qa'},{enabled:true});
  const invoke=async(action,a,body)=>(await db.query('select ip_native_launch_service($1,$2::jsonb,$3::jsonb) result',[action,JSON.stringify(a),JSON.stringify(body)])).rows[0].result;
  let delegated;
  const deps={enabled:true,secret,invoke,live:{authenticateWeb:async()=>actor,previewAllowed:()=>false,
   config:{enabled:true,configured:true,transport:'vercel'},invoke:async(action,a,b)=>{delegated={action,actor:a,body:b};return {ok:true,runs:[]};}}};
  const handler=createHandler(deps);
  const launched=await call(handler,{action:'launch'});assert.equal(launched.status,200);assert.match(launched.data.code,/^[A-Za-z0-9_-]{43}$/);
  const row=(await db.query('select * from ip_native_launch_codes')).rows[0];assert.equal(row.code_hash,auth.hash(launched.data.code));assert(!JSON.stringify(row).includes(launched.data.code));
  const exchange=await call(handler,{action:'exchange',code:launched.data.code});assert.equal(exchange.status,200);assert.equal(auth.read(exchange.data.token,secret).id,'ip-a');
  assert.equal((await call(handler,{action:'exchange',code:launched.data.code})).status,401);
  const headers={authorization:'Bearer '+exchange.data.token};
  assert.equal((await call(handler,{action:'command',command:{action:'list'}},headers)).status,200);assert.equal(delegated.actor.id,'ip-a');
  for(const command of [{action:'admin_list'},{action:'list',studentId:'ip-b'},{action:'list',deviceToken:'spoof'}])assert.equal((await call(handler,{action:'command',command},headers)).status,403);
  assert.equal((await call(handler,{action:'command',command:{action:'list'}})).status,401);
  assert.equal((await call(handler,{action:'launch'},{origin:'https://wrong.example'})).status,403);
  assert.equal((await call(createHandler({...deps,enabled:false}),{action:'launch'})).status,409);
  assert.equal((await call(createHandler({...deps,live:{...deps.live,authenticateWeb:async()=>null}}),{action:'launch',studentId:'ip-a',deviceToken:'fake'})).status,403);
  const old=await call(handler,{action:'launch'}),newer=await call(handler,{action:'launch'});
  assert.equal((await call(handler,{action:'exchange',code:old.data.code})).status,401);
  await db.exec("update ip_native_launch_codes set expires_at=now()-interval '1 second'");
  assert.equal((await call(handler,{action:'exchange',code:newer.data.code})).status,401);
  const enrolled=await call(handler,{action:'launch'});await db.exec("update ip_members set enabled=false where student_id='ip-a'");
  assert.equal((await call(handler,{action:'exchange',code:enrolled.data.code})).status,403);
  await db.exec('set role anon');await assert.rejects(db.query('select * from ip_native_launch_codes'),/permission denied/);
  await assert.rejects(invoke('consume',{type:'server',id:'native'},{codeHash:'a'.repeat(64)}),/permission denied/);
  await db.exec('reset role');await db.exec("update ip_members set enabled=true where student_id='ip-a';set role service_role");
  await invoke('issue',actor,{codeHash:'b'.repeat(64)});assert.equal((await invoke('consume',{type:'server',id:'native'},{codeHash:'b'.repeat(64)})).studentId,'ip-a');
  await assert.rejects(invoke('issue',{type:'student',id:'ip-c'},{codeHash:'c'.repeat(64)}),/not_enrolled/);
  console.log('PASS native handoff: single use, replacement, expiry, enrollment, RLS, signed token and student-only delegation. No paid calls.');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
