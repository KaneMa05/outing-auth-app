'use strict';
const {UUID,fail}=require('./interview-ai-validation');
const BUCKET='interview-practice';
function objectKey(runId,turn){
 if(!UUID.test(runId||'')||!Number.isInteger(turn.number)||turn.number<1||turn.number>20||!/^[a-f0-9]{64}$/.test(turn.audio_hash||''))fail('invalid_request');
 const extension={'audio/mp4':'m4a','audio/webm':'webm','audio/ogg':'ogg'}[turn.audio_mime||'audio/mp4'];
 if(!extension)fail('invalid_request');
 return runId.toLowerCase()+'/'+turn.number+'-'+turn.audio_hash+'.'+extension;
}
function createStorage({url,key,fetchImpl=fetch}){
 const base=url.replace(/\/$/,'')+'/storage/v1';
 async function request(method,path,body,extra={}){
  const r=await fetchImpl(base+path,{method,redirect:'error',signal:AbortSignal.timeout(20000),headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',...extra},...(body?{body:JSON.stringify(body)}:{})});
  if(!r.ok)throw Error('recording_unavailable');return r;
 }
 function signedURL(path,upload){
  const prefix=upload?'/object/upload/sign/':'/object/sign/';
  if(typeof path!=='string'||!path.startsWith(prefix+BUCKET+'/'))throw Error('recording_unavailable');
  const result=new URL(base+path);
  if(result.origin!==new URL(base).origin)throw Error('recording_unavailable');
  return result.href;
 }
 return {
  async upload(runId,turn){
   const path=objectKey(runId,turn);
   const data=await (await request('POST','/object/upload/sign/'+BUCKET+'/'+path,{}, {'x-upsert':'true'})).json();
   return signedURL(data.url,true);
  },
  async verify(runId,turn){
   const r=await request('HEAD','/object/'+BUCKET+'/'+objectKey(runId,turn));
   if(Number(r.headers.get('content-length'))!==turn.audio_bytes)throw Error('recording_unavailable');
  },
  async signed(runId,turn){
   const data=await (await request('POST','/object/sign/'+BUCKET+'/'+objectKey(runId,turn),{expiresIn:300})).json();
   return signedURL(data.signedURL,false);
  }
 };
}
module.exports={createStorage,objectKey,BUCKET};
