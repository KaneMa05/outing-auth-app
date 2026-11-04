'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{spawn,spawnSync}=require('node:child_process'),{setTimeout:wait}=require('node:timers/promises');
const {digest}=require('../lib/interview-exam-scoring');
const {analyzeTask}=require('../lib/interview-mock-analysis.cjs');
const {createInference,createTranscriber}=require('./interview-mock-cli.cjs');
const {MODEL}=require('../lib/core25-worker-config.cjs');
const {createHealthProbe}=require('./interview-mock-health.cjs');
function createReceipts(root,{python=process.env.INTERVIEW_PYTHON||path.join(process.env.USERPROFILE||'','.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe')}={}){
 const file=path.join(root,'receipt.dpapi');
 const crypt=(operation,input)=>new Promise((resolve,reject)=>{
  const p=spawn(python,[path.join(__dirname,'mock-cli-protect.py'),operation],{windowsHide:true,stdio:['pipe','pipe','ignore']});let bytes=[];let length=0;
  p.stdout.on('data',b=>{length+=b.length;if(length>2000000){p.kill();return reject(Error('receipt_unavailable'));}bytes.push(b);});p.on('error',()=>reject(Error('receipt_unavailable')));p.stdin.on('error',()=>{});
  p.on('close',code=>code?reject(Error('receipt_unavailable')):resolve(Buffer.concat(bytes)));p.stdin.end(input);
 });
 return {async read(){try{return JSON.parse((await crypt('open',await fs.readFile(file))).toString('utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}},
  async write(value){const bytes=await crypt('seal',Buffer.from(JSON.stringify(value))),temp=file+'.tmp';await fs.writeFile(temp,bytes,{mode:0o600});await fs.rename(temp,file);},
  async clear(){await fs.rm(file,{force:true});}};
}
async function deliver(receipt,request,receipts){
 for(let attempt=0;attempt<3;attempt++)try{await request('complete',{id:receipt.id,lease:receipt.lease,report:receipt.report});await receipts.clear();return true;}catch(e){if(['lease_lost','forbidden','idempotency_conflict','not_found'].includes(e.message))throw e;if(attempt===2)throw Error('delivery_pending');await wait(1000);}
}
async function runOnce({request,receipts,infer,transcribe,models,heartbeatMs=15000}){
 const receipt=await receipts.read();
 if(receipt){if(receipt.phase!=='result')throw Error('execution_needs_review');await deliver(receipt,request,receipts);return true;}
 const {jobs}=await request('poll',{kinds:transcribe?['job','personality','report','practice']:['report']});if(!jobs.length)return false;
 const job=jobs[0],ref={id:job.id,lease:job.lease};await receipts.write({...ref,phase:'started'});
 const signal=new AbortController();let beating=false;
 const beat=setInterval(async()=>{if(beating)return;beating=true;try{await request('heartbeat',ref);}catch{signal.abort();}finally{beating=false;}},heartbeatMs);
 try{
  await request('heartbeat',ref);
  const src=job.snapshot,task=job.kind==='report'?{kind:'report',run:src}:{kind:job.kind,audio:Buffer.from(job.audioBase64,'base64'),...(job.kind==='job'?{detail:src.rubric_detail}:{question:src.question})};
  if(task.audio&&digest(task.audio)!==src.audio_hash)throw Error('source_changed');
  const report=await analyzeTask(task,{infer,transcribe,models,signal:signal.signal});if(signal.signal.aborted)throw Error('lease_lost');
  const result={...ref,phase:'result',report};await receipts.write(result);await deliver(result,request,receipts);return true;
 }catch(e){
  const saved=await receipts.read();if(saved?.phase==='result')throw e;
  // Unknown execution remains blocked until explicitly reviewed; never rerun it automatically.
  await request('fail',ref).catch(()=>{});throw e;
 }finally{clearInterval(beat);}
}
async function canRetryIdle(error,receipts){return error.transient===true&&await receipts.read()===null;}
async function main(){
 const origin=process.env.INTERVIEW_MOCK_CLI_ORIGIN,token=process.env.INTERVIEW_MOCK_CLI_WORKER_TOKEN;
 const url=new URL(origin);if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash||!/^[A-Za-z0-9_-]{43}$/.test(token||''))throw Error('configuration');
 const root=path.resolve(process.env.INTERVIEW_MOCK_CLI_RUNTIME||'.tmp/interview-mock-cli-runtime',digest(origin).slice(0,16));await fs.mkdir(root,{recursive:true,mode:0o700});
 const lock=await fs.open(path.join(root,'worker.lock'),'wx',0o600);await lock.writeFile(String(process.pid));
 try{
  let healthProbe,healthTimer,reportedHealth;
  const request=async(action,body={})=>{
   const current=['heartbeat','poll'].includes(action)?healthProbe?.read():null,health=current?.checkedAt!==reportedHealth?current:null;let status;
   try{const r=await fetch(new URL('/api/interview-mock-worker',url),{method:'POST',redirect:'error',signal:AbortSignal.timeout(45000),headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action,...body,...(health?{health}:{})})});status=r.status;const data=await r.json();if(!r.ok||!data.ok)throw Error(data.error||'connection_unavailable');if(health&&data.healthRecorded===true)reportedHealth=health.checkedAt;return data;}
   catch(e){e.transient=status>=500||status===429||e instanceof TypeError||['AbortError','TimeoutError'].includes(e.name);throw e;}
  };
  const infer=createInference({runtimeDir:root}),receipts=createReceipts(root),models={judge:process.env.INTERVIEW_MOCK_CLI_JUDGE_MODEL||MODEL,verifier:process.env.INTERVIEW_MOCK_CLI_VERIFIER_MODEL||MODEL,analyzer:process.env.INTERVIEW_MOCK_CLI_ANALYSIS_MODEL||MODEL};
  const transcriptionConfig=process.env.INTERVIEW_MOCK_TRANSCRIBER_CONFIG?JSON.parse(await fs.readFile(process.env.INTERVIEW_MOCK_TRANSCRIBER_CONFIG,'utf8')):null;
  const transcribe=transcriptionConfig?createTranscriber(transcriptionConfig,{runtimeDir:root}):null;
  let transcriptionConfigured=false;if(transcribe){
   await fs.access(transcriptionConfig.executable);
   if(!Array.isArray(transcriptionConfig.healthArgs)||transcriptionConfig.healthArgs.some(a=>typeof a!=='string'))throw Error('transcription_check_required');
   const check=spawnSync(transcriptionConfig.executable,transcriptionConfig.healthArgs,{windowsHide:true,encoding:'utf8',timeout:120000,maxBuffer:2000000});
   if(check.status!==0||JSON.parse(check.stdout).ok!==true)throw Error('transcription_check_failed');transcriptionConfigured=true;
  }
  healthProbe=createHealthProbe({executable:process.env.INTERVIEW_CODEX||'codex',models,transcriptionConfigured});await healthProbe.check();
  healthTimer=setInterval(()=>void healthProbe.check().catch(()=>{}),60000);
  console.log(JSON.stringify({event:'worker_started',audioProcessing:!!transcribe}));
  let lastCleanup=0;
  try{for(;;){try{
   if(!healthProbe.read()?.cliReady){await request('heartbeat');await wait(30000);continue;}
   if(Date.now()-lastCleanup>3600000){await request('cleanup');lastCleanup=Date.now();}
   const worked=await runOnce({request,receipts,infer,transcribe,models});if(!worked)await wait(30000);
  }catch(e){
   if(await canRetryIdle(e,receipts)){console.error(JSON.stringify({event:'worker_connection_delayed'}));await wait(30000);continue;}
   const reason=['execution_needs_review','delivery_pending','lease_lost'].includes(e.message)?e.message:'processing_unavailable';
   const current=healthProbe.read();if(current){current.blockedReason=reason;current.checkedAt=new Date().toISOString();await request('heartbeat').catch(()=>{});}
   console.error(JSON.stringify({event:'worker_paused',reason}));process.exitCode=1;return;}}}finally{clearInterval(healthTimer);}
 }finally{await lock.close();await fs.rm(path.join(root,'worker.lock'),{force:true});}
}
if(require.main===module)main().catch(()=>{console.error('Worker configuration or receipt requires review.');process.exitCode=1;});
module.exports={runOnce,createReceipts,deliver,canRetryIdle};
