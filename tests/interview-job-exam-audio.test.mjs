import test from 'node:test';
import assert from 'node:assert/strict';
import {pcmWav,toExamWav} from '../client/interview-job-exam-audio.mjs';
import audio from '../lib/interview-exam-audio.js';
import storageModule from '../lib/interview-job-exam-storage.cjs';
const {inspectWav}=audio,{createJobExamStorage}=storageModule;
test('browser PCM encoding produces bounded canonical WAV accepted by server',async()=>{
 const samples=Float32Array.from({length:32000},(_,i)=>Math.sin(i*.2)*.1),blob=pcmWav(samples);
 assert.equal(inspectWav(Buffer.from(await blob.arrayBuffer())).durationSeconds,2);
 assert.throws(()=>pcmWav(new Float32Array(10)),/duration/);assert.throws(()=>pcmWav(new Float32Array(1440001)),/duration/);
});
test('decoder downmixes stereo and limits recording to 90 seconds',async()=>{
 class Decoder {constructor(channels,length,rate){assert.equal(rate,16000);}async decodeAudioData(){return {length:1450000,numberOfChannels:2,getChannelData:channel=>Float32Array.from({length:1450000},()=>channel?.2:0)};}}
 const blob=await toExamWav(new Blob(['encoded']),{OfflineAudioContext:Decoder});assert.equal(inspectWav(Buffer.from(await blob.arrayBuffer())).durationSeconds,90);
});
test('private storage never overwrites an existing answer and signs only short lived URLs',async()=>{
 const bytes=Buffer.from(await pcmWav(Float32Array.from({length:16000},(_,i)=>Math.sin(i*.2)*.1)).arrayBuffer()),requests=[];
 const storage=createJobExamStorage({url:'https://storage.example',key:'server-only-fixture',fetchImpl:async(url,options)=>{
  requests.push({url,options});if(url.includes('/object/sign/'))return {ok:true,json:async()=>({signedURL:'/object/sign/interview-job-exam/test?token=test'})};
  if(options.method==='POST')return {ok:false,status:409};return {ok:true,arrayBuffer:async()=>bytes};
 }});
 const id='1cc2e051-1576-45f6-965b-cee125896e18';await storage.put(id,bytes);assert.equal(requests.length,2);assert.equal(requests[0].options.headers['x-upsert'],undefined);
 const signed=await storage.signed(id,new Date(Date.now()+20000).toISOString());assert.ok(signed.startsWith('https://storage.example/storage/v1/object/sign/'));const expiration=JSON.parse(requests.at(-1).options.body).expiresIn;assert.ok(expiration>0&&expiration<=20);
 await assert.rejects(storage.signed(id,new Date(Date.now()-1).toISOString()),/not_found/);
});
