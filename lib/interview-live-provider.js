'use strict';
const {randomUUID}=require('node:crypto');
const {sessionConfig,FOLLOWUP_INSTRUCTIONS,schema,decision}=require('./interview-live-policy');
function createProvider({key,followupModel,fetchImpl=fetch,WebSocket=require('ws')}={}){
 async function post(path,body){
  const r=await fetchImpl('https://api.openai.com/v1/'+path,{method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),
   headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!r.ok)throw Error('provider_unavailable');return r.json();
 }
 function attach(id,onEvent){return new Promise((resolve,reject)=>{
  if(!/^live_[A-Za-z0-9_-]+$/.test(id))return reject(Error('invalid_output'));
  const ws=new WebSocket('wss://api.openai.com/v1/live/sessions/'+id+'/attach',{
   headers:{Authorization:'Bearer '+key},handshakeTimeout:12000,maxPayload:2000000,perMessageDeflate:false});
  let opened=false;
  ws.on('unexpected-response',(request,response)=>{
   response.resume();const error=Error('provider_unavailable');error.gone=[404,410].includes(response.statusCode);reject(error);ws.terminate();
  });
  ws.on('open',()=>{opened=true;resolve({send:event=>ws.send(JSON.stringify(event)),destroy:()=>ws.close()});});
  ws.on('error',()=>{if(!opened)reject(Error('provider_unavailable'));else onEvent({type:'transport.error'});});
  ws.on('close',()=>onEvent({type:'transport.closed'}));
  ws.on('message',data=>{try{onEvent(JSON.parse(String(data)));}catch{onEvent({type:'transport.error'});}});
 });}
 async function closeSession(id){let connection;return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{connection?.destroy();reject(Error('close_unconfirmed'));},15000);
  attach(id,e=>{if(e.type==='session.closed'){clearTimeout(timer);connection?.destroy();resolve(true);}}).then(c=>{
   connection=c;c.send({type:'session.close',event_id:randomUUID()});
  }).catch(e=>{clearTimeout(timer);if(e.gone)resolve(true);else reject(Error('close_unconfirmed'));});
 });}
 return {
  async create(sdp){const r=await post('live/sessions',{session:sessionConfig(),transport:{type:'webrtc',sdp}});
   if(!/^live_[A-Za-z0-9_-]+$/.test(r.session?.id||'')||typeof r.transport?.sdp!=='string')throw Error('invalid_output');
   return {id:r.session.id,sdp:r.transport.sdp};},attach,closeSession,
  async followup(context){const r=await post('responses',{model:followupModel,store:false,max_output_tokens:1800,
   instructions:FOLLOWUP_INSTRUCTIONS,input:JSON.stringify(context),text:{format:{type:'json_schema',name:'interview_followup',strict:true,schema}}});
   if(r.status!=='completed')throw Error('invalid_output');
   const parts=(r.output||[]).filter(x=>x.type==='message').flatMap(x=>x.content||[]);
   const output=parts.filter(x=>x.type==='output_text');if(parts.some(x=>x.type==='refusal')||output.length!==1)throw Error('invalid_output');
   return decision(JSON.parse(output[0].text),context.answer,context.asked);
  }
 };
}
module.exports={createProvider};
