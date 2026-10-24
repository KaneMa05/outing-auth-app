'use strict';
const {randomUUID}=require('node:crypto');
const path=require('node:path');
const {LIMITS}=require('./interview-live-policy');
const {createRecorder,removeSpool,recoverSpool}=require('./interview-live-storage');
const SERVER={type:'server',id:'live-worker'};
class LiveEngine {
 constructor({invoke,provider,storage,spool,recorder=createRecorder,cleanup=removeSpool,now=Date.now}){
  Object.assign(this,{invoke,provider,storage,spool,recorder,cleanup,now});this.sessions=new Map();this.sweeping=false;
 }
 async command(actor,b){
  if(b.action==='start')return this.start(actor,b);
  if(['ready','list','admin_list'].includes(b.action))return this.invoke(b.action,actor,{page:b.page||0});
  const result=await this.invoke(b.action==='admin_get'?'admin_get':b.action==='heartbeat'?'heartbeat':'get',actor,{runId:b.runId});
  const live=this.sessions.get(b.runId);
  if(b.action==='begin'){
   if(!live||live.ending)throw Error('session_expired');
   if(!live.started){live.started=true;this.say(live,'AI 모의면접을 시작합니다. 한 번에 한 질문씩 진행합니다. 첫 질문: '+live.current.question);}
   return {ok:true};
  }
  if(b.action==='heartbeat'&&live)live.heartbeat=this.now();
  if(b.action==='answer_done'){
   if(!live||live.ending)throw Error('session_expired');
   if(!live.answer.trim())return {ok:true,waiting:true};
   this.schedule(live,null,true);return {ok:true};
  }
  if(b.action==='finish'){
   if(live)await this.finish(live,live.completed?'completed':'interrupted');
   return {ok:true};
  }
  if(live?.lastError)result.notice=live.lastError;
  if(result.run.recording_state==='ready')result.recordings=await this.storage.signed(b.runId,Math.floor((Date.parse(result.run.retain_until)-this.now())/1000));
  return result;
 }
 async start(actor,b){
  if(this.sessions.size>=5)throw Error('queue_full');
  const {run}=await this.invoke('reserve',actor,{requestKey:b.requestKey});
  const live={run,actor,turns:[],index:0,followups:0,answer:'',spoken:'',version:0,seen:new Set(),
   heartbeat:this.now(),lastInput:0,ending:false,started:false,processing:false,closed:false,calls:0,lastAttemptVersion:-1,lastAttemptAt:0,
   current:{question:run.questions[0].prompt,kind:'initial',parentQuestionId:run.questions[0].id},inputStart:0};
  this.sessions.set(run.id,live);
  try{
   live.recorder=this.recorder(this.spool,run.id);
   // No retry on an uncertain paid create. A reserved slot stays blocked.
   const created=await this.provider.create(b.sdp);live.providerId=created.id;
   await this.invoke('activate',SERVER,{runId:run.id,providerId:created.id});
   live.connection=await this.provider.attach(created.id,event=>this.event(live,event));
   return {ok:true,runId:run.id,sdp:created.sdp,deadline:run.deadline,question:live.current.question};
  }catch(e){await this.finish(live,'interrupted');throw e;}
 }
 send(live,event){if(live.connection&&!live.closed)live.connection.send({event_id:randomUUID(),...event});}
 say(live,text,delegationId=null){this.send(live,{type:'session.commentary.append',delegation_id:delegationId,content:text});}
 event(live,e){
  if(e.event_id){if(live.seen.has(e.event_id))return;live.seen.add(e.event_id);if(live.seen.size>20000)return void this.finish(live,'interrupted').catch(()=>{});}
  try{
   if(e.type==='session.closed'){live.closed=true;live.resolveClosed?.();if(!live.ending)void this.finish(live,live.completed?'completed':'interrupted').catch(()=>{});return;}
   if(live.ending)return;
   if(['transport.error','transport.closed','error'].includes(e.type)){void this.finish(live,'interrupted').catch(()=>{});return;}
   if(e.type==='session.input_audio.append'&&typeof e.audio==='string'){
    live.recorder.append('input',e.audio);
    const pcm=Buffer.from(e.audio,'base64');let energy=0;
    for(let i=0;i+1<pcm.length;i+=2)energy+=(pcm.readInt16LE(i)/32768)**2;
    if(pcm.length&&Math.sqrt(energy/(pcm.length/2))>0.015)live.lastVoice=this.now();
   }
   if(e.type==='session.output_audio.delta'&&typeof e.delta==='string')live.recorder.append('output',e.delta,e.start_ms);
   if(e.type==='session.input_transcript.delta'&&typeof e.delta==='string'){
    if(live.answer.length+e.delta.length>12000)throw Error('answer_limit');
    live.answer+=e.delta;live.version++;live.lastInput=this.now();
    if(live.pending)this.schedule(live,live.pending.id,live.pending.manual);
   }
   if(e.type==='session.output_transcript.delta'&&typeof e.delta==='string')live.spoken=(live.spoken+e.delta).slice(0,12000);
   if(e.type==='session.delegation.created'&&e.delegation?.target==='client'&&!live.seen.has('delegation:'+e.delegation.id)){
    live.seen.add('delegation:'+e.delegation.id);this.schedule(live,e.delegation.id,false);
   }
  }catch{void this.finish(live,'interrupted').catch(()=>{});}
 }
 schedule(live,id,manual){
  if(live.ending||live.processing)return;
  // A transcript fragment is never itself a completed answer. Wait for explicit
  // delegation/user completion AND a quiet window, then verify with the backend.
  live.pending={id,manual};clearTimeout(live.timer);
  live.timer=setTimeout(()=>{live.pending=null;void this.advance(live,id,manual).catch(()=>this.finish(live,'interrupted').catch(()=>{}));},LIMITS.quietMs);
 }
 snapshot(live,complete=false){return {...live.current,answer:live.answer,spokenQuestion:live.spoken,
  transcriptSource:'live_sideband_unverified',complete,audioStartBytes:live.inputStart,
  audioEndBytes:live.recorder?.sizes.input||0,grade:null,score:null};}
 async save(live,turns=live.turns,currentQuestion=live.current.question){
  // Checkpoints cannot overtake a saved question boundary or the final answer.
  live.writeQueue=(live.writeQueue||Promise.resolve()).catch(()=>{}).then(()=>this.invoke('save',SERVER,{runId:live.run.id,turns,currentQuestion}));
  await live.writeQueue;
 }
 async advance(live,delegationId,manual=false){
  if(live.ending||live.processing||live.completed||!live.answer.trim())return;
  if((!manual&&live.lastAttemptVersion===live.version)||this.now()-live.lastAttemptAt<5000)return;
  if(live.calls>=12)return this.finish(live,'interrupted');
  if(!manual&&this.now()-Math.max(live.lastInput,live.lastVoice||0)<LIMITS.quietMs)return this.schedule(live,delegationId,false);
  live.processing=true;const version=live.version;
  live.calls++;live.lastAttemptVersion=version;live.lastAttemptAt=this.now();
  try{
   const result=await this.provider.followup({question:live.current.question,originalQuestion:live.run.questions[live.index].prompt,
    answer:live.answer,asked:[...live.turns.filter(t=>t.parentQuestionId===live.current.parentQuestionId).map(t=>t.question),live.current.question],
    remainingFollowups:LIMITS.followups-live.followups});
   // Speech resumed during generation: discard the proposed follow-up.
   if(live.ending||version!==live.version)return;
   if(!manual&&!result.turnComplete){this.say(live,'아직 답변 중입니다. 새 질문을 하지 말고 계속 경청하세요.',delegationId);return;}
   const completed=this.snapshot(live,true);let next,index=live.index,followups=live.followups;
   if(result.ask&&followups<LIMITS.followups){followups++;next={question:result.question,kind:'followup',parentQuestionId:completed.parentQuestionId,evidence:result.evidence};}
   else{index++;followups=0;if(index<live.run.questions.length)next={question:live.run.questions[index].prompt,kind:'initial',parentQuestionId:live.run.questions[index].id};}
   const turns=[...live.turns,completed];
   // Persist the boundary before a next question can provide any extra context.
   await this.save(live,turns,next?.question||'면접 종료');
   if(live.ending)return;
   if(version!==live.version){await this.save(live,[...live.turns,this.snapshot(live,false)]);return;}
   live.lastError=null;
   live.turns=turns;live.answer='';live.spoken='';live.inputStart=live.recorder.sizes.input;live.index=index;live.followups=followups;
   if(!next){live.completed=true;this.say(live,'모의면접을 마쳤습니다. 수고하셨습니다. 기록을 저장하겠습니다.',delegationId);
    live.timer=setTimeout(()=>void this.finish(live,'completed').catch(()=>{}),6500);return;}
   live.current=next;this.onQuestion?.(live.run.id,next.question);this.say(live,'다음 질문만 자연스럽게 말하고 답변을 기다리세요. 정답·힌트·평가를 덧붙이지 마세요. 질문: '+next.question,delegationId);
  }catch(e){
   // Keep the original answer on backend failure. No fabricated fallback question.
   live.lastError='followup_unavailable';this.say(live,'추가 질문을 준비하지 못했습니다. 잠시 후 답변 완료 버튼으로 다시 진행해 주세요.',delegationId);
  }finally{live.processing=false;}
 }
 async finish(live,state){
  if(live.finishPromise)return live.finishPromise;
  live.ending=true;clearTimeout(live.timer);
  live.finishPromise=(async()=>{
   let confirmed=live.closed;
   if(!confirmed&&live.connection){
    const ack=new Promise(resolve=>{live.resolveClosed=()=>resolve(true);});
    try{this.send(live,{type:'session.close'});confirmed=await Promise.race([ack,new Promise(r=>{live.closeTimer=setTimeout(()=>r(false),5000);})]);}catch{}
    clearTimeout(live.closeTimer);
   }
   if(!confirmed&&live.providerId)try{confirmed=await this.provider.closeSession(live.providerId);}catch{}
   live.closed=confirmed;live.connection?.destroy();
   if(live.answer.trim())try{await this.save(live,[...live.turns,this.snapshot(live,false)]);}catch{}
   let recordingState='missing';live.recorder?.close();
   if(live.recorder?.sizes.input>0){recordingState='pending';try{await this.storage.upload(live.run.id,live.recorder.dir);recordingState='ready';}catch{}}
   // Failed upload stays in the private spool for the maintenance retry.
   await this.invoke('closed',SERVER,{runId:live.run.id,state:confirmed?state:'unknown',recordingState});
   if(recordingState==='ready'||!live.recorder?.sizes.input)this.cleanup(this.spool,live.run.id);
   this.sessions.delete(live.run.id);
  })();
  try{return await live.finishPromise;}catch(e){live.finishPromise=null;throw e;}
 }
 async tick(){
  if(this.sweeping)return;this.sweeping=true;
  try{
   for(const live of this.sessions.values()){
    if(live.ending||this.now()-live.heartbeat>LIMITS.heartbeatMs||this.now()>Date.parse(live.run.deadline))try{await this.finish(live,live.completed?'completed':'interrupted');}catch{this.maintenanceFailed=true;}
   }
   const {runs}=await this.invoke('sweep',SERVER,{});
   for(const run of runs){try{
    if(this.sessions.has(run.id))continue;
    if(['starting','active','closing','unknown'].includes(run.state)){
     // An unknown create without a provider ID requires operator reconciliation.
     if(!run.provider_id&&Date.parse(run.retain_until)>this.now())continue;
     if(run.provider_id){
     try{await this.provider.closeSession(run.provider_id);await this.invoke('closed',SERVER,{runId:run.id,state:'interrupted',recordingState:run.recording_state});}catch{continue;}
     run.state='interrupted';
     }
    }
    if(Date.parse(run.retain_until)<=this.now()){
     await this.storage.remove(run.id);removeSpool(this.spool,run.id);await this.invoke('purge',SERVER,{runId:run.id});
    }else if(run.recording_state==='pending'){
     if(recoverSpool(this.spool,run.id)){
      try{await this.storage.upload(run.id,path.join(this.spool,run.id));await this.invoke('closed',SERVER,{runId:run.id,state:run.state,recordingState:'ready'});removeSpool(this.spool,run.id);}catch{this.maintenanceFailed=true;}
     }else await this.invoke('closed',SERVER,{runId:run.id,state:run.state,recordingState:'missing'});
    }
   }catch{this.maintenanceFailed=true;}}
  }finally{this.sweeping=false;}
 }
}
module.exports={LiveEngine,SERVER};
