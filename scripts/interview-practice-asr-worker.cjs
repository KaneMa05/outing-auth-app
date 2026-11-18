'use strict';
// PC-only queue consumer. This file never uses a paid ASR or grading API.
const fs=require('node:fs/promises'),path=require('node:path'),{createHash}=require('node:crypto');
const {objectKey,BUCKET}=require('../lib/interview-practice-storage');
const {createTranscriber}=require('../lib/interview-practice-transcriber.cjs');
const {UUID}=require('../lib/interview-ai-validation');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function identity(job){return {runId:job.runId,number:job.number,audioHash:job.audioHash,leaseId:job.leaseId};}
function validJob(job){
 if(!job||!UUID.test(job.runId||'')||!UUID.test(job.leaseId||'')||!Number.isInteger(job.number)||job.number<1||job.number>20||
  !/^[a-f0-9]{64}$/.test(job.audioHash||'')||!Number.isInteger(job.audioBytes)||job.audioBytes<45||job.audioBytes>16777216||!['audio/mp4','audio/webm','audio/ogg'].includes(job.audioMime||'audio/mp4'))throw Error('invalid_job');
}
function validResult(result){
 if(result?.model!=='Whisper large-v3'||!/^[a-f0-9]{40}$/.test(result.modelRevision||'')||!/^[a-zA-Z0-9.+_-]{1,40}$/.test(result.engineVersion||'')||
  typeof result.transcript!=='string'||result.transcript.length>30000||!Array.isArray(result.segments)||result.segments.length>2000||
  !Number.isFinite(result.decodedSeconds)||result.decodedSeconds<0||result.decodedSeconds>3610||!Number.isFinite(result.processingSeconds)||result.processingSeconds<0||result.processingSeconds>86400||
  result.segments.some(s=>typeof s.text!=='string'||s.text.length>4000||!Number.isFinite(s.start)||!Number.isFinite(s.end)||s.start<0||s.end<s.start||s.end>result.decodedSeconds+10))throw Error('transcription_failed');
 return result;
}
async function runOnce({rpc,download,transcribe,cacheDir,claim={},heartbeatMs=60000}){
 const {job}=await rpc('claim',claim);if(!job)return {worked:false};validJob(job);
 await fs.mkdir(cacheDir,{recursive:true});const directory=await fs.mkdtemp(path.join(path.resolve(cacheDir),'job-'));
 const extension={'audio/mp4':'m4a','audio/webm':'webm','audio/ogg':'ogg'}[job.audioMime||'audio/mp4'];
 const file=path.join(directory,'answer.'+extension);let timer,leaseLost=false,beating=false;
 try{
  timer=setInterval(async()=>{if(beating)return;beating=true;try{await rpc('heartbeat',identity(job));}catch(e){if(e.message==='lease_lost')leaseLost=true;}finally{beating=false;}},heartbeatMs);
  const bytes=await download(job);
  if(!Buffer.isBuffer(bytes)||bytes.length!==job.audioBytes||createHash('sha256').update(bytes).digest('hex')!==job.audioHash)throw Error('audio_mismatch');
  await fs.writeFile(file,bytes,{mode:0o600,flag:'wx'});
  const result=validResult(await transcribe(file,job));if(leaseLost)throw Error('lease_lost');
  await rpc('heartbeat',identity(job));
  // A late result can never overwrite a result from a newer lease or a human review.
  await rpc('complete',{...identity(job),...result});
  return {worked:true,completed:true,runId:job.runId,number:job.number};
 }catch(error){
  if(error.message==='lease_lost')return {worked:true,completed:false,error:'lease_lost'};
  const code=['audio_unavailable','audio_mismatch','runtime_unavailable'].includes(error.message)?error.message:'transcription_failed';
  try{await rpc('fail',{...identity(job),errorCode:code});}catch{/* An uncertain commit is recovered through the durable lease, not an unsafe overwrite. */}
  return {worked:true,completed:false,error:code};
 }finally{clearInterval(timer);await fs.unlink(file).catch(e=>{if(e.code!=='ENOENT')throw e;});await fs.rmdir(directory);}
}
function createRemote({url,key,fetchImpl=fetch}){
 const base=new URL(url);if(base.protocol!=='https:'||base.username||base.password||!key)throw Error('runtime_unavailable');
 const headers={apikey:key,Authorization:'Bearer '+key};
 return {
  async rpc(action,body={}){
   const response=await fetchImpl(new URL('/rest/v1/rpc/ip_practice_transcription_service',base),{method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({p_action:action,p_actor:{type:'worker',id:'practice-asr-pc'},p_body:body})});
   const data=await response.json();if(!response.ok||!data.ok)throw Error(data.message==='lease_lost'?'lease_lost':'queue_unavailable');return data;
  },
  async download(job){
   const keyPath=objectKey(job.runId,{number:job.number,audio_hash:job.audioHash,audio_mime:job.audioMime||'audio/mp4'});
   const response=await fetchImpl(new URL('/storage/v1/object/authenticated/'+BUCKET+'/'+keyPath,base),{redirect:'error',signal:AbortSignal.timeout(60000),headers});
   if(!response.ok)throw Error('audio_unavailable');const chunks=[];let size=0;
   for await(const chunk of response.body){size+=chunk.length;if(size>job.audioBytes)throw Error('audio_mismatch');chunks.push(chunk);}
   return Buffer.concat(chunks);
  }
 };
}
async function importResults(file,options){
 const data=JSON.parse((await fs.readFile(file,'utf8')).replace(/^\uFEFF/,''));
 if(data.model!=='Whisper large-v3'||data.engine!=='faster-whisper'||!Array.isArray(data.samples))throw Error('invalid_import');
 const outcomes=[];
 for(const row of data.samples.filter(s=>s.status==='transcribed')){
  const result=validResult({model:data.model,modelRevision:data.modelSource.revision,engineVersion:data.engineVersion,transcript:row.transcript,
   segments:row.segments.map(({start,end,text})=>({start,end,text})),decodedSeconds:row.decodedSeconds,processingSeconds:row.processingSeconds});
  const outcome=await runOnce({...options,claim:{runId:row.run_id,number:row.number,audioHash:row.audio_hash},transcribe:async(_file,job)=>{if(job.audioBytes!==row.audio_bytes||job.audioHash!==row.audio_hash)throw Error('audio_mismatch');return result;}});
  outcomes.push(outcome);
 }
 return outcomes;
}
async function main(){
 const remote=createRemote({url:process.env.SUPABASE_URL||'',key:process.env.SUPABASE_SERVICE_ROLE_KEY||''});
 const runtime=path.resolve(__dirname,'../.tmp/practice-asr');await fs.mkdir(runtime,{recursive:true});
 const lockFile=path.join(runtime,'worker.lock');
 let lock;
 try{lock=await fs.open(lockFile,'wx',0o600);}catch(error){
  if(error.code!=='EEXIST')throw error;
  const prior=(await fs.readFile(lockFile,'utf8')).trim();
  if(!/^[1-9][0-9]*$/.test(prior))throw error;
  try{process.kill(Number(prior),0);throw error;}catch(probe){if(probe.code!=='ESRCH')throw probe;}
  if((await fs.readFile(lockFile,'utf8')).trim()!==prior)throw error;
  await fs.unlink(lockFile);lock=await fs.open(lockFile,'wx',0o600);
 }
 await lock.writeFile(String(process.pid));
 let adapter,stopping=false;const stop=()=>{stopping=true;};process.once('SIGINT',stop);process.once('SIGTERM',stop);
 try{
  const options={...remote,cacheDir:path.join(runtime,'audio')};
  const importIndex=process.argv.indexOf('--import');
  if(importIndex>=0){const results=await importResults(process.argv[importIndex+1],options);console.log(JSON.stringify({event:'import_finished',completed:results.filter(r=>r.completed).length,skipped:results.filter(r=>!r.worked).length,failed:results.filter(r=>r.worked&&!r.completed).length}));return;}
  const configFile=path.resolve(process.env.INTERVIEW_PRACTICE_ASR_CONFIG||path.join(runtime,'config.json'));
  const config=JSON.parse((await fs.readFile(configFile,'utf8')).replace(/^\uFEFF/,''));
  if(config.model!=='Whisper large-v3'||!/^[a-f0-9]{40}$/.test(config.modelRevision||'')||!path.isAbsolute(config.python)||!path.isAbsolute(config.modelDirectory))throw Error('runtime_unavailable');
  adapter=createTranscriber(configFile,config);let idle=30000;
  while(!stopping){
   try{const result=await runOnce({...options,transcribe:file=>adapter.transcribe(file)});if(result.worked)console.log(JSON.stringify({event:'transcription',completed:result.completed,error:result.error}));
    if(process.argv.includes('--once'))break;
    if(!result.worked){await sleep(idle);idle=Math.min(idle*2,300000);}else idle=30000;
   }catch{console.error('queue_unavailable');if(process.argv.includes('--once')){process.exitCode=1;break;}await sleep(30000);}
  }
 }finally{adapter?.close();await lock.close();await fs.unlink(lockFile);}
}
if(require.main===module)main().catch(error=>{console.error(error.code==='EEXIST'?'worker_lock_exists':'practice_worker_unavailable');process.exitCode=1;});
module.exports={runOnce,validResult,createRemote,importResults};
