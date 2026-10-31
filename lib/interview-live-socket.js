'use strict';
const {WebSocketServer}=require('ws');
const {read}=require('./interview-live-ticket');
const {validate,configuration}=require('../api/interview-live');
const {LiveEngine}=require('./interview-live-engine');
const {createProvider}=require('./interview-live-provider');
const {createCloudStorage,createCloudRecorder}=require('./interview-live-cloud-storage');
const {LIMITS}=require('./interview-live-policy');
const SAFE=new Set(['unauthorized','forbidden','invalid_request','not_enrolled','session_expired','unsafe_retry','admission_busy','daily_limit','queue_full','questions_unavailable']);
function runtime(env=process.env){
 const invoke=(action,actor,body)=>require('../api/curriculum')._private.requestSupabase('POST','rpc/ip_live_service',{p_action:action,p_actor:actor,p_body:body});
 const cloud=createCloudStorage({url:env.SUPABASE_URL,key:env.SUPABASE_SERVICE_ROLE_KEY}),recorders=new Map();
 const engine=new LiveEngine({invoke,provider:createProvider({key:env.OPENAI_API_KEY,followupModel:env.INTERVIEW_LIVE_FOLLOWUP_MODEL}),
  spool:'',recorder:(_root,id)=>{const rec=createCloudRecorder(cloud,id);recorders.set(id,rec);return rec;},cleanup:(_root,id)=>recorders.delete(id),
  storage:{signed:cloud.signed,upload:async id=>{const rec=recorders.get(id);if(!rec)throw Error('recording_unavailable');await rec.finalize();}}});
 return {engine,recorders};
}
function bindSocket(ws,{secret,createRuntime=runtime,requireMockAccess=require('./interview-mock-access').requireMockAccess,now=Date.now}={}){
 let rt,actor,runId,starting=false,closed=false,processing=false,finishPromise,windowStart=now(),messages=0,lastFlush=0;
 const send=data=>{if(ws.readyState===1)ws.send(JSON.stringify(data));};
 let resolveDone;const done=new Promise(r=>{resolveDone=r;});
 const authTimer=setTimeout(()=>void finish(),10000);
 const hardTimer=setTimeout(()=>void finish(),700000);
 const timer=setInterval(()=>void pulse(),1000);
 async function finish(){
  if(finishPromise)return finishPromise;
  closed=true;clearTimeout(authTimer);clearTimeout(hardTimer);clearInterval(timer);
  finishPromise=(async()=>{
   // If the network closes during paid create, start's finally calls finish again.
   if(starting)return;
   try{if(rt)await Promise.allSettled([...rt.engine.sessions.values()].map(l=>rt.engine.finish(l,l.completed?'completed':'interrupted')));}
   finally{rt?.recorders.clear();if(ws.readyState===1)ws.close(1000);resolveDone();}
  })();await finishPromise;if(starting)finishPromise=null;
 }
 let pulsing=false;
 async function pulse(){if(pulsing||closed||!rt||starting)return;pulsing=true;
  try{for(const live of rt.engine.sessions.values()){
   if(live.ending||now()-live.heartbeat>LIMITS.heartbeatMs||now()>Date.parse(live.run.deadline)){await rt.engine.finish(live,live.completed?'completed':'interrupted');continue;}
   if(now()-lastFlush>=10000){await live.recorder.flush();
    if(!live.ending&&!live.processing&&!live.completed&&live.answer.trim())await rt.engine.save(live,[...live.turns,rt.engine.snapshot(live,false)]);
    lastFlush=now();}
  }
  }catch{await finish();}finally{pulsing=false;}
 }
 ws.on('message',async(raw,binary)=>{
  let id;
  try{
   if(closed||binary||raw.length>68000)throw Error('invalid_request');
   const message=JSON.parse(String(raw));id=message.id;
   if(!Number.isInteger(id)||id<1||Object.keys(message).some(k=>!['id','ticket','body'].includes(k)))throw Error('invalid_request');
   const body=message.body;validate(body);
   if(now()-windowStart>1000){windowStart=now();messages=0;}
   if(processing||++messages>20)throw Error('invalid_request');processing=true;
   if(!actor){
    if(body.action!=='start')throw Error('unauthorized');
    const ticket=read(message.ticket,body.sdp,secret,now());
    if(ticket.requestKey!==body.requestKey)throw Error('unauthorized');actor=ticket.actor;
    await requireMockAccess(actor.id);if(closed)return;
    clearTimeout(authTimer);rt=createRuntime();rt.engine.onQuestion=(_id,question)=>send({event:{type:'interview.question',question}});starting=true;
    try{const result=await rt.engine.command(actor,body);runId=result.runId;send({id,result});}
    finally{starting=false;if(closed)await finish();}
   }else{
    if(!['begin','heartbeat','answer_done','finish'].includes(body.action)||body.runId!==runId||message.ticket)throw Error('forbidden');
    await requireMockAccess(actor.id);if(closed)return;
    const result=await rt.engine.command(actor,body);send({id,result});if(body.action==='finish')await finish();
   }
  }catch(e){send({id,error:SAFE.has(e.message)?e.message:'automation_unavailable'});await finish();}
  finally{processing=false;}
 });
 ws.on('close',()=>void finish());ws.on('error',()=>void finish());
 return {done,finish};
}
function attach(server,{env=process.env,createRuntime=runtime,requireMockAccess=require('./interview-mock-access').requireMockAccess,waitUntil=()=>{}}={}){
 const wss=new WebSocketServer({noServer:true,maxPayload:68000,perMessageDeflate:false});
 server.on('upgrade',(req,socket,head)=>{
  let allowed=false;try{const origin=new URL(req.headers.origin);allowed=origin.host===req.headers.host&&(origin.protocol==='https:'||origin.protocol==='http:'&&['localhost','127.0.0.1'].includes(origin.hostname));}catch{}
  if(req.url!=='/api/interview-live-socket'||!allowed||env.INTERVIEW_LIVE_TRANSPORT!=='vercel'||!configuration(env).enabled){socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');socket.destroy();return;}
  // Register in the request context so disconnect cleanup can outlive the socket.
  let resolve;const lifetime=new Promise(r=>{resolve=r;});waitUntil(lifetime);
  wss.handleUpgrade(req,socket,head,ws=>{const session=bindSocket(ws,{secret:env.INTERVIEW_LIVE_WORKER_SECRET,createRuntime,requireMockAccess});session.done.finally(resolve);});
 });return wss;
}
module.exports={attach,bindSocket,runtime};
