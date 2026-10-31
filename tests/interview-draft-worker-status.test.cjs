'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {workerStatus}=require('../lib/interview-draft-worker-status.cjs');
const {withHeartbeat}=require('../lib/interview-worker-heartbeat.cjs');
const {createHandler}=require('../api/interview-prep');
const worker=require('../api/interview-draft-worker');
const auth=require('../api/teacher-auth-utils');
const now=Date.parse('2026-10-31T06:00:00Z'),stamp=offset=>new Date(now+offset).toISOString();
const options={env:{INTERVIEW_DRAFT_QUESTIONS_ENABLED:'true'},now:()=>now};
function reader(seen=stamp(-15000)){
 const calls=[];
 const read=async(method,path)=>{
  calls.push(path);assert.equal(method,'GET');assert(!/experience|student_id|questions|lease/.test(path));
  if(path.startsWith('ip_draft_worker_presence'))return seen?[{seen_at:seen}]:[];
  if(path.includes('state=in.')){assert(path.includes('expires_at=gt.'));return [{state:'running'},{state:'queued'},{state:'queued'}];}
  return [{updated_at:path.includes('eq.completed')?stamp(-60000):stamp(-3600000)}];
 };
 return {read,calls};
}
async function send(handler,body,headers={}){
 let status,data;await handler({method:'POST',body,headers},{setHeader(){},status(n){status=n;return this;},json(d){data=d;}});return {status,data};
}
test('status reads bounded metadata and distinguishes busy, stale and absent workers',async()=>{
 const fixture=reader(),actor={type:'admin',id:'qa'};
 const result=await workerStatus({},actor,fixture.read,options);
 assert.equal(result.connected,true);assert.equal(result.running,1);assert.equal(result.queued,2);
 assert.equal(result.lastCompletedAt,stamp(-60000));assert.equal(fixture.calls.length,4);
 for(const seen of [stamp(-45001),stamp(6000),null])assert.equal((await workerStatus({},actor,reader(seen).read,options)).connected,false);
 await assert.rejects(workerStatus({},{type:'student',id:'qa'},fixture.read,options),/forbidden/);
 const disabled=await workerStatus({},actor,()=>{throw Error('must not read');},{env:{},now:()=>now});
 assert.equal(disabled.enabled,false);
 await assert.rejects(workerStatus({},actor,async()=>null,options),/status_unavailable/);
});
test('admin status requires an admin session and interview.read permission',async()=>{
 const oldSecret=process.env.TEACHER_SESSION_SECRET,oldFlag=process.env.INTERVIEW_DRAFT_QUESTIONS_ENABLED;
 process.env.TEACHER_SESSION_SECRET='draft-status-test';process.env.INTERVIEW_DRAFT_QUESTIONS_ENABLED='true';
 try{
  const fixture=reader(),handler=createHandler({read:fixture.read,invoke:()=>{throw Error('must not claim jobs');}});
  const call=user=>send(handler,{action:'admin_draft_worker_status'},{host:'local',origin:'http://local',cookie:auth.COOKIE_NAME+'='+(user?auth.createSessionToken(process.env.TEACHER_SESSION_SECRET,user):'')});
  assert.equal((await call(null)).status,401);
  assert.equal((await call({username:'teacher',role:'teacher',permissions:['interview.read']})).status,403);
  assert.equal((await call({username:'admin',role:'admin',permissions:[]})).status,403);
  assert.equal(fixture.calls.length,0);
  assert.equal((await call({username:'reader',role:'admin',permissions:['interview.read']})).status,200);
  assert.equal(fixture.calls.length,4);
 }finally{
  for(const [key,value] of [['TEACHER_SESSION_SECRET',oldSecret],['INTERVIEW_DRAFT_QUESTIONS_ENABLED',oldFlag]])if(value===undefined)delete process.env[key];else process.env[key]=value;
 }
});
test('heartbeat authenticates before updating presence and never claims or extends jobs',async()=>{
 const token='a'.repeat(43),writes=[];
 const handler=worker.createHandler({env:{INTERVIEW_DRAFT_QUESTIONS_ENABLED:'true',INTERVIEW_CORE25_WORKER_TOKEN:token},now:()=>now,read:async(...args)=>writes.push(args),invoke:()=>{throw Error('must not claim');}});
 assert.equal((await send(handler,{action:'heartbeat'})).status,401);
 assert.equal((await send(handler,{action:'heartbeat',id:'extra'},{authorization:'Bearer '+token})).status,400);
 assert.equal(writes.length,0);
 assert.equal((await send(handler,{action:'heartbeat'},{authorization:'Bearer '+token})).status,200);
 assert.deepEqual(writes,[['POST','ip_draft_worker_presence?on_conflict=id',{id:true,seen_at:stamp(0)},{Prefer:'resolution=merge-duplicates,return=minimal'}]]);
});
test('long generation sends nonoverlapping heartbeats and cancels on completion or failure',async()=>{
 let tick,cancelled=0,finish,pulseDone,pulses=0;
 const timers={schedule(fn,ms){assert.equal(ms,15000);tick=fn;return 1;},cancel(){cancelled++;}};
 const result=withHeartbeat(()=>new Promise(r=>finish=r),()=>{pulses++;return new Promise(r=>pulseDone=r);},()=>{},timers);
 const pending=tick();await tick();assert.equal(pulses,1);pulseDone();await pending;
 finish('questions');assert.equal(await result,'questions');await tick();assert.equal(pulses,1);assert.equal(cancelled,1);
 await assert.rejects(withHeartbeat(async()=>{throw Error('model');},async()=>{},()=>{},timers),/model/);assert.equal(cancelled,2);
 let report=0,done;
 const unaffected=withHeartbeat(()=>new Promise(r=>done=r),async()=>{throw Error('network');},()=>report++,timers);
 await tick();assert.equal(report,1);done('ok');assert.equal(await unaffected,'ok');
});
