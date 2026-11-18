'use strict';
const assert=require('node:assert/strict'),{test}=require('node:test'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{randomUUID,createHash}=require('node:crypto');
const {runOnce,createRemote,validResult}=require('../scripts/interview-practice-asr-worker.cjs');
const bytes=Buffer.alloc(100,3),hash=createHash('sha256').update(bytes).digest('hex');
const job={runId:randomUUID(),number:1,audioHash:hash,audioBytes:bytes.length,leaseId:randomUUID()};
const result={model:'Whisper large-v3',modelRevision:'e'.repeat(40),engineVersion:'1.2.1',transcript:'아니다.',segments:[{start:0,end:1,text:'아니다.'}],decodedSeconds:2,processingSeconds:1};
async function fixture(fn){const directory=await fs.mkdtemp(path.join(os.tmpdir(),'practice-asr-test-'));try{await fn(directory);}finally{await fs.rm(directory,{recursive:true,force:true});}}
test('worker verifies exact source bytes, uses a lease, saves timestamps and cleans temporary audio',()=>fixture(async cacheDir=>{
 const calls=[];const r=await runOnce({cacheDir,rpc:async(a,b)=>{calls.push({a,b});return a==='claim'?{job}:{ok:true};},download:async()=>bytes,transcribe:async file=>{assert.deepEqual(await fs.readFile(file),bytes);return result;}});
 assert.equal(r.completed,true);assert.deepEqual(calls.map(c=>c.a),['claim','heartbeat','complete']);assert.equal(calls[2].b.audioHash,hash);assert.equal(calls[2].b.leaseId,job.leaseId);assert.deepEqual(await fs.readdir(cacheDir),[]);
}));
test('mismatched source never reaches ASR and a lost lease never writes a result',()=>fixture(async cacheDir=>{
 const actions=[];let transcribed=false;
 let r=await runOnce({cacheDir,rpc:async(a,b)=>{actions.push({a,b});return a==='claim'?{job}:{ok:true};},download:async()=>Buffer.alloc(100,4),transcribe:async()=>{transcribed=true;return result;}});
 assert.equal(r.error,'audio_mismatch');assert.equal(transcribed,false);assert.equal(actions.at(-1).b.errorCode,'audio_mismatch');
 actions.length=0;
 r=await runOnce({cacheDir,rpc:async a=>{actions.push(a);if(a==='heartbeat')throw Error('lease_lost');return a==='claim'?{job}:{ok:true};},download:async()=>bytes,transcribe:async()=>result});
 assert.equal(r.error,'lease_lost');assert.deepEqual(actions,['claim','heartbeat']);assert.deepEqual(await fs.readdir(cacheDir),[]);
}));
test('only the pinned large-v3 output is accepted, with bounded valid timestamps',()=>{
 for(const bad of [{model:'turbo'},{modelRevision:'bad'},{decodedSeconds:NaN},{segments:[{start:2,end:1,text:'x'}]},{transcript:'x'.repeat(30001)}])assert.throws(()=>validResult({...result,...bad}),/transcription_failed/);
});
test('remote worker uses server credentials only for fixed private storage and queue routes',async()=>{
 const calls=[];const remote=createRemote({url:'https://project.supabase.co',key:'server-only',fetchImpl:async(url,o)=>{calls.push({url:String(url),o});return {ok:true,json:async()=>({ok:true,job:null}),body:(async function*(){yield bytes;})()};}});
 await remote.rpc('claim');await remote.download(job);
 assert.equal(calls[0].url,'https://project.supabase.co/rest/v1/rpc/ip_practice_transcription_service');assert.equal(JSON.parse(calls[0].o.body).p_actor.type,'worker');
 assert.match(calls[1].url,/storage\/v1\/object\/authenticated\/interview-practice\//);assert.equal(calls[1].o.redirect,'error');assert.throws(()=>createRemote({url:'http://evil.test',key:'x'}),/runtime_unavailable/);
});
