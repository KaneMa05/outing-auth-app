'use strict';
const {digest}=require('./interview-exam-scoring');
const valid=id=>{if(!/^[0-9a-f-]{36}$/i.test(id||''))throw Error('invalid_request');};
function createJobExamStorage({url,key,prefix="",fetchImpl=fetch}) {
 if(!/^(?:[a-z][a-z0-9-]*\/)?$/.test(prefix))throw Error('invalid_storage_prefix');
 const objectPath=id=>prefix+id+'/answer.wav';
 const base=url.replace(/\/$/,'')+'/storage/v1',bucket='interview-job-exam';
 async function request(method,route,body,type){return fetchImpl(base+route,{method,redirect:'error',signal:AbortSignal.timeout(30000),headers:{apikey:key,Authorization:'Bearer '+key,...(type?{'Content-Type':type}:{})},body});}
 return {
  async read(id){valid(id);const r=await request('GET','/object/authenticated/'+bucket+'/'+objectPath(id));if(!r.ok||Number(r.headers.get('content-length'))>3000000)throw Error('recording_unavailable');const audio=Buffer.from(await r.arrayBuffer());if(audio.length>3000000)throw Error('recording_unavailable');return audio;},
  async put(id,audio){valid(id);const r=await request('POST','/object/'+bucket+'/'+objectPath(id),audio,'audio/wav');
   if(r.ok)return;
   if([400,409].includes(r.status)){
    // A previous upload may have succeeded before its response was lost. Never overwrite it.
    const old=await request('GET','/object/authenticated/'+bucket+'/'+objectPath(id));
    if(old.ok){const bytes=Buffer.from(await old.arrayBuffer());if(bytes.length<=3000000&&digest(bytes)===digest(audio))return;}
   }throw Error('recording_unavailable');
  },
  async signed(id,retainUntil){valid(id);const seconds=Math.min(60,Math.floor((Date.parse(retainUntil)-Date.now())/1000));if(seconds<1)throw Error('not_found');
   const r=await request('POST','/object/sign/'+bucket+'/'+objectPath(id),JSON.stringify({expiresIn:seconds}),'application/json');
   if(!r.ok)throw Error('recording_unavailable');const value=await r.json();
   if(typeof value.signedURL!=='string'||!value.signedURL.startsWith('/object/sign/'))throw Error('recording_unavailable');return base+value.signedURL;
  },
  async remove(id){valid(id);const r=await request('DELETE','/object/'+bucket,JSON.stringify({prefixes:[objectPath(id)]}),'application/json');if(!r.ok)throw Error('recording_unavailable');}
 };
}
module.exports={createJobExamStorage};
