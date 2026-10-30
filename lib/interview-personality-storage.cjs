'use strict';
const {digest}=require('./interview-exam-scoring');
const valid=id=>{if(!/^[0-9a-f-]{36}$/i.test(id||''))throw Error('invalid_request');};
function createPersonalityStorage({url,key,fetchImpl=fetch}) {
 const base=url.replace(/\/$/,'')+'/storage/v1',bucket='interview-personality';
 async function request(method,route,body,type){return fetchImpl(base+route,{method,redirect:'error',signal:AbortSignal.timeout(30000),headers:{apikey:key,Authorization:'Bearer '+key,...(type?{'Content-Type':type}:{})},body});}
 return {
  async put(id,audio){valid(id);const r=await request('POST','/object/'+bucket+'/'+id+'/answer.wav',audio,'audio/wav');
   if(r.ok)return;
   if([400,409].includes(r.status)){
    // A previous upload may have succeeded before its response was lost. Never overwrite it.
    const old=await request('GET','/object/authenticated/'+bucket+'/'+id+'/answer.wav');
    if(old.ok){const bytes=Buffer.from(await old.arrayBuffer());if(bytes.length<=3000000&&digest(bytes)===digest(audio))return;}
   }throw Error('recording_unavailable');
  },
  async signed(id,retainUntil){valid(id);const seconds=Math.min(60,Math.floor((Date.parse(retainUntil)-Date.now())/1000));if(seconds<1)throw Error('not_found');
   const r=await request('POST','/object/sign/'+bucket+'/'+id+'/answer.wav',JSON.stringify({expiresIn:seconds}),'application/json');
   if(!r.ok)throw Error('recording_unavailable');const value=await r.json();
   if(typeof value.signedURL!=='string'||!value.signedURL.startsWith('/object/sign/'))throw Error('recording_unavailable');return base+value.signedURL;
  },
  async remove(id){valid(id);const r=await request('DELETE','/object/'+bucket,JSON.stringify({prefixes:[id+'/answer.wav']}),'application/json');if(!r.ok)throw Error('recording_unavailable');}
 };
}
module.exports={createPersonalityStorage};
