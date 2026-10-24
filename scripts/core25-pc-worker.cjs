'use strict';
const path=require('node:path');
const {setTimeout:delay}=require('node:timers/promises');
const {createProvider}=require('./core25-diagnosis-cli.cjs');
const {evaluate}=require('../lib/preassignment-diagnosis.cjs');
const {ENGINE_VERSION}=require('../lib/core25-worker-config.cjs');
function createClient({origin,token,fetchImpl=fetch,allowLocal=false}){
 const url=new URL('/api/interview-core25-worker',origin);
 if(url.username||url.password||!(url.protocol==='https:'||(allowLocal&&url.protocol==='http:'&&url.hostname==='127.0.0.1')))throw Error('invalid_origin');
 if(!/^[A-Za-z0-9_-]{43}$/.test(token||''))throw Error('invalid_worker_token');
 return async(action,body={})=>{
  const r=await fetchImpl(url,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
   body:JSON.stringify({action,...body,engineVersion:ENGINE_VERSION}),signal:AbortSignal.timeout(20000)});
  const data=await r.json();if(!r.ok||!data.ok)throw Error(['unauthorized','engine_mismatch','lease_lost','diagnosis_not_configured'].includes(data.error)?data.error:'worker_request_failed');return data;
 };
}
async function processJob(job,{request,provider,notify=()=>{},wait=delay}){
 const ref={id:job.id,lease:job.lease};let raw;
 try{
  if(job.engineVersion!==ENGINE_VERSION)throw Error('engine_mismatch');
  const remaining=Date.parse(job.expiresAt)-Date.now()-10000;
  if(!Number.isFinite(remaining)||remaining<5000)throw Error('lease_lost');
  const report=await evaluate(provider,job.snapshot,{timeoutMs:Math.min(180000,remaining)});
  raw={summary:report.summary,criteria:report.criteria.map(({index,state,quote,reason,nextQuestion})=>({index,state,quote,reason,nextQuestion}))};
 }catch{
  await request('fail',ref).catch(()=>{});notify('diagnosis_failed');return;
 }
 // Retry delivery of the same result only; never repeat model execution.
 for(let attempt=0;attempt<3;attempt++){
  try{await request('complete',{...ref,report:raw});notify('diagnosis_completed');return;}
  catch(e){if(['lease_lost','unauthorized','engine_mismatch'].includes(e.message))break;if(attempt<2)await wait(2000);}
 }
 notify('result_delivery_failed');
}
async function run({request,provider,signal,notify=()=>{},wait=delay,pollMs=15000}){
 const active=new Set();let failures=0;
 while(!signal?.aborted){
  try{
   const r=await request('poll',{capacity:3-active.size});failures=0;
   if(!Array.isArray(r.jobs)||r.jobs.length>3-active.size)throw Error('invalid_worker_response');
   for(const job of r.jobs){const task=processJob(job,{request,provider,notify,wait}).catch(()=>notify('diagnosis_failed')).finally(()=>active.delete(task));active.add(task);}
  }catch(e){
   failures++;notify(['unauthorized','engine_mismatch','diagnosis_not_configured'].includes(e.message)?e.message:'connection_unavailable');
   if(['unauthorized','engine_mismatch','diagnosis_not_configured'].includes(e.message))break;
  }
  try{await wait(Math.min(60000,pollMs*2**Math.min(failures,2)),undefined,{signal});}catch{break;}
 }
 await Promise.allSettled(active);
}
async function main(){
 const request=createClient({origin:process.env.INTERVIEW_CORE25_ORIGIN||'https://app.ronparkpass.com',token:process.env.INTERVIEW_CORE25_WORKER_TOKEN});
 const provider=createProvider({runtimeDir:path.resolve('.tmp/core25-pc-runtime')});
 const stop=new AbortController();process.once('SIGINT',()=>stop.abort());process.once('SIGTERM',()=>stop.abort());
 const notify=event=>console.log(JSON.stringify({time:new Date().toISOString(),event}));
 notify('worker_started');await run({request,provider,signal:stop.signal,notify});notify('worker_stopped');
}
if(require.main===module)main().catch(()=>{console.error('Worker configuration failed. Check origin and private token file.');process.exitCode=1;});
module.exports={createClient,processJob,run};
