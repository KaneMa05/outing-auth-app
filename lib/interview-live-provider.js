'use strict';
const {randomUUID}=require('node:crypto');
const {sessionConfig,FOLLOWUP_INSTRUCTIONS,TEST_FOLLOWUP_INSTRUCTIONS,schema,decision}=require('./interview-live-policy');
const {voiceEvent,backendEvent}=require('./interview-live-usage');
function createProvider({key,followupModel=require('./interview-openai-config.cjs').models().followup,liveModel=require('./interview-openai-config.cjs').models().live,fetchImpl=fetch,WebSocket=require('ws'),onUsage=async()=>{}}={}){
 async function post(path,body,runId,measureLatency=false){
  const startedAt=Date.now();
  const eventKey='backend:'+randomUUID();
  if(runId)await onUsage(path==='live/sessions'?voiceEvent(runId,liveModel,null):backendEvent(runId,eventKey,body.model,null));
  const r=await fetchImpl('https://api.openai.com/v1/'+path,{method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),
   headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!r.ok)throw Error('provider_unavailable');const data=await r.json();
  if(runId){const usage=path==='live/sessions'?voiceEvent(runId,liveModel,15):backendEvent(runId,eventKey,body.model,data.usage,data.id);
   if(measureLatency)usage.usage.generationMs=Date.now()-startedAt;await onUsage(usage);}
  return data;
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
 async function closeSession(id,{runId}={}){let connection;return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{connection?.destroy();reject(Error('close_unconfirmed'));},15000);
  attach(id,e=>{if(e.type==='session.closed'){clearTimeout(timer);connection?.destroy();
   if(runId&&Number.isFinite(e.usage?.seconds))onUsage(voiceEvent(runId,liveModel,e.usage.seconds,true)).then(()=>resolve(true),reject);
   else resolve(true);
  }}).then(c=>{
   connection=c;c.send({type:'session.close',event_id:randomUUID()});
  }).catch(e=>{clearTimeout(timer);if(e.gone)resolve(true);else reject(Error('close_unconfirmed'));});
 });}
 return {
  liveModel,
  async create(sdp,voice='noeul',{runId}={}){const r=await post('live/sessions',{session:sessionConfig({model:liveModel,voice}),transport:{type:'webrtc',sdp}},runId);
   if(!/^live_[A-Za-z0-9_-]+$/.test(r.session?.id||'')||typeof r.transport?.sdp!=='string')throw Error('invalid_output');
   return {id:r.session.id,sdp:r.transport.sdp};},attach,closeSession,
  async followup(context,{runId}={}){const testApp=context.testApp===true,r=await post('responses',{model:followupModel,store:false,max_output_tokens:1800,
   instructions:context.testApp===true?TEST_FOLLOWUP_INSTRUCTIONS:FOLLOWUP_INSTRUCTIONS,input:JSON.stringify(context),text:{format:{type:'json_schema',name:'interview_followup',strict:true,schema}}},runId,testApp);
   if(r.status!=='completed')throw Error('invalid_output');
   const parts=(r.output||[]).filter(x=>x.type==='message').flatMap(x=>x.content||[]);
   const output=parts.filter(x=>x.type==='output_text');if(parts.some(x=>x.type==='refusal')||output.length!==1)throw Error('invalid_output');
   return decision(JSON.parse(output[0].text),context.answer,context.asked,context.testApp===true?context.remainingFollowups:undefined);
  }
 };
}
module.exports={createProvider};
