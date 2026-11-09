'use strict';
const MAX=20971520,BUCKET='interview-aptitude';
function createStorage({url,key,fetchImpl=fetch}){
 const base=url.replace(/\/$/,'')+'/storage/v1';
 const valid=p=>{if(!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.pdf$/i.test(p||''))throw Error('invalid_file');return p;};
 async function call(method,route,body){const r=await fetchImpl(base+route,{method,redirect:'error',signal:AbortSignal.timeout(30000),headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json','x-upsert':'false'},...(body!==undefined?{body:JSON.stringify(body)}:{})});if(!r.ok)throw Error('file_unavailable');return r;}
 return {
  async uploadUrl(p){const value=await(await call('POST','/object/upload/sign/'+BUCKET+'/'+valid(p),{})).json();
   if(typeof value.url!=='string'||!value.url.startsWith('/object/upload/sign/'+BUCKET+'/'))throw Error('file_unavailable');return base+value.url;},
  async read(p){const r=await call('GET','/object/authenticated/'+BUCKET+'/'+valid(p));if(Number(r.headers.get('content-length'))>MAX)throw Error('invalid_file');
   let length=0;const chunks=[];for await(const chunk of r.body){length+=chunk.length;if(length>MAX)throw Error('invalid_file');chunks.push(chunk);}return Buffer.concat(chunks);},
  async signed(p){const v=await(await call('POST','/object/sign/'+BUCKET+'/'+valid(p),{expiresIn:60})).json();if(typeof v.signedURL!=='string'||!v.signedURL.startsWith('/object/sign/'+BUCKET+'/'))throw Error('file_unavailable');return base+v.signedURL;},
  async remove(p){await call('DELETE','/object/'+BUCKET,{prefixes:[valid(p)]});}
 };
}
function validatePdf(bytes,expected){if(bytes.length!==expected||bytes.length>MAX||bytes.length<10||bytes.subarray(0,5).toString('ascii')!=='%PDF-'||!bytes.subarray(-2048).includes(Buffer.from('%%EOF')))throw Error('invalid_file');}
module.exports={createStorage,validatePdf,MAX};
