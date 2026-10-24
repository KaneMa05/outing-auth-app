'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {setup}=require('./interview-preassignments.test.cjs');
const {createHandler:studentHandler}=require('../api/interview-preassignments');
const {createHandler:workerHandler}=require('../api/interview-core25-worker');
const {ENGINE_VERSION}=require('../lib/core25-worker-config.cjs');
const {processJob,createClient}=require('../scripts/core25-pc-worker.cjs');
const migration='supabase/migrations/20261024111313_interview_core25_pc_worker.sql';
async function send(handler,body,headers={}){const res={setHeader(){},status(n){this.statusCode=n;return this;},json(data){this.data=data;}};await handler({method:'POST',headers:{host:'app.test',...headers},body},res);return res;}
async function fixture(){
 const x=await setup();await x.db.exec(fs.readFileSync(migration,'utf8'));
 const pcInvoke=async(action,actor,body)=>(await x.db.query('select ip_pa_pc_service($1,$2::jsonb,$3::jsonb) r',[action,JSON.stringify(actor),JSON.stringify(body)])).rows[0].r;
 const workerInvoke=async(action,body)=>(await x.db.query('select ip_pa_worker_service($1,$2::jsonb) r',[action,JSON.stringify(body)])).rows[0].r;
 const token=crypto.randomBytes(32).toString('base64url');
 const worker=workerHandler({env:{INTERVIEW_CORE25_DIAGNOSIS_ENABLED:'true',INTERVIEW_CORE25_DIAGNOSIS_MODE:'pc',INTERVIEW_CORE25_WORKER_TOKEN:token},invoke:workerInvoke});
 const student=studentHandler({authenticateWeb:async()=>({id:x.a.id}),pcMode:true,pcInvoke,invoke:x.call});
 const request=async(action,body={})=>{const r=await send(worker,{action,...body,engineVersion:ENGINE_VERSION},{authorization:'Bearer '+token});if(r.statusCode!==200)throw Error(r.data.error);return r.data;};
 const settings=(await x.call('admin_list',x.admin)).settings;
 await x.call('admin_settings',x.admin,{revision:settings.revision,enabled:true,dueAt:'2099-01-01T00:00:00Z',revisionDueAt:'2099-01-02T00:00:00Z',allowLate:true});
 return {...x,pcInvoke,workerInvoke,worker,student,request,token};
}
const rawReport=s=>({summary:'답변의 구체적인 행동을 보완할 수 있습니다.',criteria:s.rubric.criteria.map((c,index)=>({index,state:'보완',quote:s.answer,reason:'경험의 구체적인 내용을 추가해주세요.',nextQuestion:c[2]}))});
async function test(){
 const x=await fixture();const {db,call,a,b,student,request,worker,token}=x;
 try{
  assert.equal((await send(worker,{action:'poll',capacity:3,engineVersion:ENGINE_VERSION})).statusCode,401);
  assert.equal((await send(worker,{action:'poll',capacity:3,engineVersion:ENGINE_VERSION},{authorization:'Bearer '+token,origin:'https://app.test'})).statusCode,403);
  assert.equal((await send(worker,{action:'poll',capacity:3,engineVersion:'wrong'},{authorization:'Bearer '+token})).statusCode,409);
  assert.equal((await send(student,{action:'bootstrap'})).data.diagnosisEnabled,false);
  await call('save',a,{unitId:'core-01',revision:0,fields:{f1:'저는 일정을 정리하고 진행 상황을 공유했습니다.'},requestId:crypto.randomUUID()});
  const command={action:'diagnose',unitId:'core-01',revision:1};
  assert.equal((await send(student,command)).data.error,'diagnosis_worker_offline');
  assert.deepEqual((await request('poll',{capacity:3})).jobs,[]);
  assert.equal((await send(student,{action:'bootstrap'})).data.diagnosisEnabled,true);
  const queued=(await send(student,command)).data;assert.equal(queued.diagnosis.status,'running');assert(!JSON.stringify(queued).includes('snapshot'));
  assert.equal((await send(student,command)).data.diagnosis.id,queued.diagnosis.id);
  const jobs=(await request('poll',{capacity:3})).jobs;assert.equal(jobs.length,1);assert(!('studentId'in jobs[0]));
  assert.deepEqual((await request('poll',{capacity:3})).jobs,[],'Never deliver a job twice');
  await assert.rejects(request('complete',{id:jobs[0].id,lease:crypto.randomUUID(),report:rawReport(jobs[0].snapshot)}),/lease_lost/);
  const wrong=rawReport(jobs[0].snapshot);wrong.criteria[0].quote='답변에 없는 조작된 근거';
  await assert.rejects(request('complete',{id:jobs[0].id,lease:jobs[0].lease,report:wrong}),/invalid_diagnosis/);
  let calls=0,deliveries=0;
  await processJob(jobs[0],{provider:async s=>{calls++;return rawReport(s);},request:async(action,body)=>{if(action==='complete'&&++deliveries===1){await request(action,body);throw Error('lost_response');}return request(action,body);},wait:async()=>{}});
  assert.equal(calls,1);assert.equal(deliveries,2);
  const result=(await send(student,{action:'diagnosis_status',unitId:'core-01'})).data.diagnosis;
  assert.equal(result.status,'completed');assert.equal(result.stale,false);assert.equal(result.report.criteria.length,4);
  assert.equal((await call('diagnosis_get',b,{unitId:'core-01'})).diagnosis,null);
  assert.equal((await send(student,command)).data.diagnosis.id,result.id,'Completed diagnosis reused');
  await call('save',a,{unitId:'core-01',revision:1,fields:{f1:'답변을 수정했습니다.'},requestId:crypto.randomUUID()});
  assert.equal((await send(student,{action:'diagnosis_status',unitId:'core-01'})).data.diagnosis.stale,true);
  const queued2=(await send(student,{...command,revision:2})).data;
  const job2=(await request('poll',{capacity:1})).jobs[0];
  await db.query("update ip_pa_diagnoses set expires_at=now()-interval '1 second' where id=$1",[job2.id]);
  await assert.rejects(request('complete',{id:job2.id,lease:job2.lease,report:rawReport(job2.snapshot)}),/lease_lost/);
  assert.equal((await send(student,{action:'diagnosis_status',unitId:'core-01'})).data.diagnosis.status,'failed');
  await db.exec("update ip_pa_worker_presence set seen_at=now()-interval '61 seconds'");
  assert.equal((await send(student,command)).data.error,'diagnosis_worker_offline');
  assert.equal((await call('detail',a,{unitId:'core-01'})).draft.fields.f1,'답변을 수정했습니다.');
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(db.query("select ip_pa_worker_service('poll','{}')"),/permission denied/);await assert.rejects(db.query('select * from ip_pa_worker_presence'),/permission denied/);await db.exec('reset role');}
  await db.exec('set role service_role');assert.equal((await request('poll',{capacity:0})).ok,true);await db.exec('reset role');
  assert.throws(()=>createClient({origin:'http://example.com',token}),/invalid_origin/);
  console.log('PASS PC worker: authenticated queue, heartbeat, single delivery, exact evidence, result-only retries, stale results, timeout, answer retention, RLS');
 }finally{await db.close();}
}
if(require.main===module)test().catch(e=>{console.error(e.message,e.stack);process.exitCode=1;});
module.exports={fixture,send,rawReport};
