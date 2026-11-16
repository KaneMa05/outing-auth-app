'use strict';
const {bodyOf} = require('./interview-ai-http');
// Host must provide real authentication and server-side enrollment/retention policy.
function createAttemptHandler({storage,authenticate,authorize,origin}) {
 if(!authenticate||!authorize||!origin)throw Error('authentication_configuration_required');
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  try {
   if(req.method!=='POST')throw Error('method_not_allowed');
   if(req.headers.origin!==origin || req.headers.host!==new URL(origin).host)throw Error('forbidden');
   const actor=await authenticate(req);if(!actor?.id)throw Error('unauthorized');
   const b=await bodyOf(req,750000);
   const fields={create:['attempt'],put:['id','index','data'],finalize:['id'],get:['id'],audio:['id']};
   if(!fields[b.action]||Object.keys(b).some(k=>!['action',...fields[b.action]].includes(k)))throw Error('invalid_request');
   let result;
   if(b.action==='create')result=await storage.create(actor.id,b.attempt,await authorize(actor,b.attempt));
   else if(b.action==='put') {
    if(typeof b.data!=='string'||!b.data.length||b.data.length>699052||b.data.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(b.data))throw Error('invalid_chunk');
    const data=Buffer.from(b.data,'base64');if(data.toString('base64')!==b.data)throw Error('invalid_chunk');
    result=await storage.put(actor.id,b.id,b.index,data);
   } else if(b.action==='audio') {
    const {record,data}=await storage.audio(actor.id,b.id);
    res.writeHead(200,{'Content-Type':record.mimeType,'Content-Length':data.length,'X-Content-Type-Options':'nosniff'});return res.end(data);
   } else result=await storage[b.action](actor.id,b.id);
   res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true,result}));
  } catch(e) {
   const codes={method_not_allowed:405,forbidden:403,unauthorized:401,not_enrolled:403,not_found:404,expired:410,invalid_request:400,invalid_chunk:400,request_too_large:413,idempotency_conflict:409,attempt_closed:409,upload_incomplete:409,checksum_mismatch:422};
   const status=codes[e.message]||503;
   res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:false,error:codes[e.message]?e.message:'storage_unavailable'}));
  }
 };
}
module.exports={createAttemptHandler};
