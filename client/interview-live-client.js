// Browser owns microphone/playback only; question commands are server-only.
export async function connectLive({request,audio,onEvent,onFailure,signal,mediaDevices=navigator.mediaDevices,Peer=RTCPeerConnection,Socket=globalThis.WebSocket}){
 let stream,peer,channel,runId,control,controlRequest=request,closed=false,begun=false,beginPromise,started=false,disconnectTimer,deadlineTimer;
 const release=()=>{closed=true;signal?.removeEventListener('abort',release);clearTimeout(disconnectTimer);clearTimeout(deadlineTimer);stream?.getTracks().forEach(t=>t.stop());channel?.close();peer?.close();control?.close();audio.pause();audio.srcObject=null;};
 signal?.addEventListener('abort',release,{once:true});
 const begin=()=>{if(started&&runId&&!begun&&!closed){begun=true;beginPromise=controlRequest('begin',{runId});}return beginPromise||Promise.resolve();};
 try{
  stream=await mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
  if(closed||signal?.aborted)throw Error('cancelled');
  peer=new Peer();stream.getTracks().forEach(track=>peer.addTrack(track,stream));
  peer.ontrack=e=>{audio.srcObject=e.streams[0];audio.play().catch(()=>onEvent({type:'playback.blocked'}));};
  peer.onconnectionstatechange=()=>{
   clearTimeout(disconnectTimer);
   if(!closed&&peer.connectionState==='failed')onFailure();
   if(!closed&&peer.connectionState==='disconnected')disconnectTimer=setTimeout(()=>{if(!closed)onFailure();},5000);
  };
  channel=peer.createDataChannel('oai-events');
  channel.onmessage=e=>{try{const event=JSON.parse(e.data);
   if(event.type==='session.started'){started=true;begin().catch(onFailure);}
   onEvent(event);
  }catch{onFailure();}};
  channel.onerror=()=>{if(!closed)onFailure();};
  await peer.setLocalDescription(await peer.createOffer());
  if(peer.iceGatheringState!=='complete')await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{peer.removeEventListener('icegatheringstatechange',changed);reject(Error('connection_timeout'));},10000);
   function changed(){if(peer.iceGatheringState==='complete'){clearTimeout(timer);peer.removeEventListener('icegatheringstatechange',changed);resolve();}}
   peer.addEventListener('icegatheringstatechange',changed);changed();
  });
  if(closed)throw Error('cancelled');
  const payload={requestKey:crypto.randomUUID(),sdp:peer.localDescription.sdp};let result=await request('start',payload);
  if(result.transport==='websocket'){
   control=await openLiveControl(result,Socket,signal,()=>{if(!closed)onFailure();},onEvent);controlRequest=control.request;
   result=await control.start(payload);
  }
  runId=result.runId;
  if(closed)throw Error('cancelled');
  await peer.setRemoteDescription({type:'answer',sdp:result.sdp});await begin();
  deadlineTimer=setTimeout(onFailure,Math.max(0,Date.parse(result.deadline)-Date.now()));
  return {runId,question:result.question,release,request:controlRequest,setMuted(value){if(!closed)stream.getAudioTracks().forEach(track=>{track.enabled=!value;});},async stop(){
   // Stop capturing immediately, but let the server await provider close acknowledgement.
   stream.getTracks().forEach(t=>t.stop());
   if(channel.readyState==='open')channel.send(JSON.stringify({type:'session.close',event_id:crypto.randomUUID()}));
   try{await controlRequest('finish',{runId});}finally{release();}
  }};
 }catch(e){if(runId)await controlRequest('finish',{runId}).catch(()=>{});release();throw e;}
}
function openLiveControl(config,Socket,signal,onFailure,onEvent){return new Promise((resolve,reject)=>{
 if(config.url!=='/api/interview-live-socket'||typeof config.ticket!=='string')return reject(Error('invalid_output'));
 const url=new URL(config.url,location.origin);url.protocol=url.protocol==='https:'?'wss:':'ws:';
 const ws=new Socket(url.href),pending=new Map();let counter=0,closing=false,opened=false;
 function cancel(){closing=true;signal?.removeEventListener('abort',cancel);clearTimeout(openTimer);ws.close();for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('connection_closed'));}pending.clear();if(!opened)reject(Error('cancelled'));}
 const openTimer=setTimeout(()=>{cancel();reject(Error('connection_timeout'));},10000);
 signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted){cancel();return;}
 function send(action,payload,ticket){return new Promise((yes,no)=>{
  if(closing||ws.readyState!==1)return no(Error('connection_closed'));
  const id=++counter,timer=setTimeout(()=>{pending.delete(id);no(Error('connection_timeout'));cancel();onFailure();},55000);
  pending.set(id,{resolve:yes,reject:no,timer});try{ws.send(JSON.stringify({id,...(ticket?{ticket}:{}),body:{...payload,action}}));}catch{pending.delete(id);clearTimeout(timer);no(Error('connection_closed'));}
 });}
 ws.onopen=()=>{opened=true;clearTimeout(openTimer);resolve({start:payload=>send('start',payload,config.ticket),request:(action,payload)=>send(action,payload),close:cancel});};
 ws.onmessage=e=>{try{const data=JSON.parse(e.data);if(data.event?.type==='interview.question'){onEvent(data.event);return;}const p=pending.get(data.id);if(!p)return;pending.delete(data.id);clearTimeout(p.timer);if(data.error)p.reject(Object.assign(Error(data.error),{code:data.error}));else if(data.result?.ok)p.resolve(data.result);else p.reject(Error('invalid_output'));}catch{cancel();onFailure();}};
 ws.onclose=()=>{const notify=!closing;cancel();if(notify)onFailure();};ws.onerror=()=>{cancel();onFailure();};
 });}
