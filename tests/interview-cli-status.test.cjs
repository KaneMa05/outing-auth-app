'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {cliStatus}=require('../lib/interview-cli-status.cjs');
const {ENGINE_VERSION}=require('../lib/core25-worker-config.cjs');
const {createHandler}=require('../api/interview-prep');
const auth=require('../api/teacher-auth-utils');
const now=Date.parse('2026-11-03T01:00:00Z'),stamp=seconds=>new Date(now+seconds*1000).toISOString();
const actor={type:'admin',id:'reader'};
const options={now:()=>now,env:{INTERVIEW_CORE25_DIAGNOSIS_ENABLED:'true',INTERVIEW_CORE25_DIAGNOSIS_MODE:'pc',INTERVIEW_CORE25_WORKER_TOKEN:'a'.repeat(43),INTERVIEW_DRAFT_QUESTIONS_ENABLED:'true'}};
function fixture(overrides={}){
 const paths=[];
 const read=async(method,path)=>{
  assert.equal(method,'GET');paths.push(path);
  const [table,search]=path.split('?'),q=new URLSearchParams(search),select=q.get('select');
  assert(select);assert(!/token|lease|student|snapshot|experience|question|report|result/.test(select),'No sensitive columns in status reads');
  assert(Number(q.get('limit'))<=1000);
  if(table in overrides)return typeof overrides[table]==='function'?overrides[table](q):overrides[table];
  if(table==='ip_pa_worker_presence'){assert.equal(q.get('engine_version'),'eq.'+ENGINE_VERSION);return [{seen_at:stamp(-15)}];}
  if(table==='ip_draft_worker_presence')return [{seen_at:stamp(-15)}];
  if(table==='ip_ai_workers'){
   assert.equal(q.get('revoked_at'),'is.null');assert.equal(q.get('expires_at'),'gt.'+stamp(0));assert.equal(q.get('order'),'last_seen_at.desc.nullslast');
   return [{last_seen_at:stamp(-75)}];
  }
  if(table==='ip_ai_settings')return [{enabled:true}];
  if(table==='ip_pa_diagnoses'){
   assert.equal(q.get('engine_version'),'eq.'+ENGINE_VERSION);assert.equal(q.get('worker_queued'),'eq.true');
   if(q.get('status')==='eq.running'){
    assert.equal(q.get('expires_at'),'gt.'+stamp(0));return Array.from({length:q.get('worker_lease')==='is.null'?2:1},()=>({status:'running'}));
   }
   return [{finished_at:stamp(-100)}];
  }
  if(table==='ip_draft_question_jobs')return select==='state'?[{state:'running'},{state:'queued'}]:[{updated_at:stamp(-100)}];
  if(table==='ip_ai_jobs'){
   if(select==='status'){assert.equal(q.get('or'),`(status.eq.QUEUED,and(status.eq.PROCESSING,lease_expires_at.gt.${stamp(0)}))`);return [{status:'PROCESSING'},{status:'QUEUED'}];}
   return [{updated_at:stamp(-100)}];
  }
  throw Error('Unexpected table '+table);
 };
 return {read,paths};
}
test('all three CLI queues report bounded metadata with the right heartbeat windows',async()=>{
 const f=fixture(),data=await cliStatus({},actor,f.read,options);
 assert.equal(f.paths.length,14);assert.equal(data.checkedAt,stamp(0));
 assert.deepEqual(data.workers.map(w=>[w.id,w.connected,w.running,w.queued]),[['core25',true,1,2],['questions',true,1,1],['answers',true,1,1]]);
 assert.deepEqual(data.workers.map(w=>w.thresholdSeconds),[60,45,120]);
 const stale=await cliStatus({},actor,fixture({ip_pa_worker_presence:[{seen_at:stamp(-61)}],ip_draft_worker_presence:[{seen_at:stamp(-46)}],ip_ai_workers:[{last_seen_at:stamp(-121)}]}).read,options);
 assert(stale.workers.every(w=>!w.connected));
 const noPresence=await cliStatus({},actor,fixture({ip_pa_worker_presence:[],ip_draft_worker_presence:[],ip_ai_workers:[]}).read,options);
 assert(noPresence.workers.every(w=>w.lastSeenAt===null&&!w.connected));
 const future=await cliStatus({},actor,fixture({ip_pa_worker_presence:[{seen_at:stamp(6)}]}).read,options);assert.equal(future.workers[0].connected,false);
});
test('disabled features still report connected workers, and one unavailable store leaves others visible',async()=>{
 const disabled=await cliStatus({},actor,fixture({ip_ai_settings:[{enabled:false}]}).read,{...options,env:{}});
 assert(disabled.workers.every(w=>w.connected&&!w.enabled));
 const partial=await cliStatus({},actor,fixture({ip_pa_worker_presence:()=>{throw Error('private DB error');}}).read,options);
 assert.deepEqual(partial.workers[0],{id:'core25',available:false});assert(partial.workers.slice(1).every(w=>w.available));assert(!JSON.stringify(partial).includes('private'));
 const limited=await cliStatus({},actor,fixture({ip_ai_jobs:q=>q.get('select')==='status'?Array.from({length:1000},()=>({status:'QUEUED'})):[]}).read,options);
 assert.equal(limited.workers[2].countsLimited,true);
 const f=fixture();await assert.rejects(cliStatus({},{type:'student',id:'a'},f.read,options),/forbidden/);assert.equal(f.paths.length,0);
});
test('the aggregate API keeps administrator read permissions and never invokes a worker',async()=>{
 const previous=process.env.TEACHER_SESSION_SECRET;process.env.TEACHER_SESSION_SECRET='cli-status-test';
 try{
  const f=fixture(),handler=createHandler({read:f.read,invoke(){throw Error('Must not invoke jobs');}});
  async function call(user){
   let status,data;const token=user?auth.createSessionToken(process.env.TEACHER_SESSION_SECRET,user):'';
   await handler({method:'POST',headers:{host:'local',origin:'http://local',cookie:auth.COOKIE_NAME+'='+token},body:{action:'admin_cli_status'}},{setHeader(){},status(n){status=n;return this;},json(d){data=d;}});
   return {status,data};
  }
  for(const user of [null,{username:'teacher',role:'teacher',permissions:['interview.read']},{username:'admin',role:'admin',permissions:[]}])assert([401,403].includes((await call(user)).status));
  assert.equal(f.paths.length,0);
  const result=await call({username:'reader',role:'admin',permissions:['interview.read']});assert.equal(result.status,200);assert.equal(result.data.workers.length,3);
 }finally{if(previous===undefined)delete process.env.TEACHER_SESSION_SECRET;else process.env.TEACHER_SESSION_SECRET=previous;}
});
let modulePromise;
const load=()=>modulePromise||=import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('interview-cli-status.js','utf8')).toString('base64'));
test('UI shows each CLI, independent failures, disabled features and escaped timestamps',async()=>{
 const {renderCLIStatus}=await load(),data=await cliStatus({},actor,fixture().read,options);
 const html=renderCLIStatus(data);for(const text of ['핵심 25제 진단 CLI','경험 질문 생성 CLI','답변 초안 생성 CLI','처리 중 1건','대기 2건','상태 새로고침'])assert(html.includes(text));
 const failed=renderCLIStatus({workers:[{id:'core25',available:false},{id:'questions',available:true,enabled:false,connected:true,lastSeenAt:stamp(-15),running:0,queued:0,lastFailedAt:'<img onerror=x>'}]});
 assert.match(failed,/상태 확인 불가/);assert.match(failed,/연결됨 · 요청 대기 중/);assert.match(failed,/꺼짐/);assert.doesNotMatch(failed,/<img/);
});
test('CLI status only refreshes on entry or request and ignores overlap and destroyed responses',async t=>{
 const {mountCLIStatus}=await load();let listeners=0,resolve,calls=0;
 t.mock.timers.enable({apis:['setTimeout','setInterval']});
 const doc={hidden:false,addEventListener(){listeners++;},removeEventListener(){}};
 const host={innerHTML:'',querySelector(){return null;}};
 const view=mountCLIStatus(host,{doc,request:async action=>{assert.equal(action,'admin_cli_status');calls++;if(calls===2)return new Promise(r=>resolve=r);return {};}});
 await view.ready;assert.equal(calls,1);assert.equal(view.canLeave(),true);
 assert.match(host.innerHTML,/조회 시점/);assert.doesNotMatch(host.innerHTML,/10초마다/);assert.equal(listeners,0);
 t.mock.timers.tick(60000);await new Promise(r=>setImmediate(r));assert.equal(calls,1,'Staying on the home never polls');
 doc.hidden=true;doc.hidden=false;await new Promise(r=>setImmediate(r));assert.equal(calls,1,'Returning to the tab never refreshes');
 host.onclick({target:{closest:()=>({})},stopPropagation(){}});await view.refresh();assert.equal(calls,2,'No overlapping manual requests');
 view.destroy();host.innerHTML='another screen';resolve({});await new Promise(r=>setImmediate(r));
 await view.refresh();t.mock.timers.tick(60000);assert.equal(calls,2);assert.equal(host.innerHTML,'another screen');assert.equal(host.onclick,null);
});
