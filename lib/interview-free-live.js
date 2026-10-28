'use strict';
const {WebSocket,WebSocketServer}=require('ws');
const {recognitionHints,LiveTranscript}=require('./interview-transcription');
const LIVE_MODEL='gemini-3.5-transcribe-live';
function setup({question='',mode='ai'}={}){
 return {setup:{model:'models/'+LIVE_MODEL,generationConfig:{responseModalities:['TEXT']},
  inputAudioTranscription:{languageCodes:['ko-KR'],mode:'VERBATIM',customVocabulary:recognitionHints(question,mode)},
  realtimeInputConfig:{automaticActivityDetection:{disabled:false}}}};
}
function attachLive(server,{key,authorize,consume,createUpstream=(url,options)=>new WebSocket(url,options),finishTimeoutMs=4000}){
 const wss=new WebSocketServer({noServer:true,maxPayload:16384});
 server.on('upgrade',(req,socket,head)=>{
  if(req.url!=='/live'||!authorize(req)||!key){socket.end('HTTP/1.1 401 Unauthorized\r\n\r\n');return;}
  wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws));
 });
 wss.on('connection',client=>{
  let upstream,ready=false,bytes=0,ending=false,ended=false,finishTimer,finalTimer;
  const queued=[],transcript=new LiveTranscript();
  const send=data=>{if(client.readyState===WebSocket.OPEN)client.send(JSON.stringify(data));};
  const fail=error=>{send({type:'error',error});client.close();};
  const setupTimer=setTimeout(()=>fail('live_setup_timeout'),10000);
  const timeout=setTimeout(()=>fail('live_time_limit'),600000);
  const cleanup=()=>{
   clearTimeout(setupTimer);clearTimeout(timeout);clearTimeout(finishTimer);clearTimeout(finalTimer);
   if(upstream?.readyState===WebSocket.OPEN)upstream.close();
   else if(upstream&&upstream.readyState!==WebSocket.CLOSED)upstream.terminate();
  };
  const finish=confirmed=>{
   if(ended)return;ended=true;clearTimeout(finishTimer);clearTimeout(finalTimer);
   send({type:'finished',text:transcript.text(),confirmed:confirmed&&!transcript.partial});client.close(1000,'transcription complete');
  };
  function forward(data){upstream.send(JSON.stringify({realtimeInput:{audio:{mimeType:'audio/pcm;rate=16000',data:data.toString('base64')}}}));}
  function endStream(){
   upstream.send(JSON.stringify({realtimeInput:{audioStreamEnd:true}}));
   finishTimer=setTimeout(()=>finish(!!transcript.committed&&!transcript.partial),finishTimeoutMs);
  }
  function configure(command){
   if(upstream)return;
   if(!['ai','job','personality'].includes(command.mode)||typeof command.question!=='string'||command.question.length>1000)return fail('invalid_live_context');
   try{consume();}catch{return fail('free_limit_reached');}
   upstream=createUpstream('wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent',{headers:{'x-goog-api-key':key},handshakeTimeout:10000});
   upstream.on('open',()=>upstream.send(JSON.stringify(setup(command))));
   upstream.on('message',raw=>{
    let data;try{data=JSON.parse(raw.toString());}catch{return;}
    if(data.setupComplete){ready=true;clearTimeout(setupTimer);send({type:'ready'});for(const chunk of queued)forward(chunk);queued.length=0;if(ending)endStream();}
    const content=data.serverContent||{},interim=content.interimInputTranscription,final=content.inputTranscription;
    if(interim&&typeof interim.text==='string'){clearTimeout(finalTimer);send({type:'transcript',text:transcript.update(interim.text,true),partial:true});}
    if(final&&typeof final.text==='string'){
     send({type:'transcript',text:transcript.update(final.text,false),partial:false});
     // Dedicated transcription can finalize without a conversational turnComplete event.
     if(ending){clearTimeout(finalTimer);finalTimer=setTimeout(()=>finish(true),150);}
    }
    if(content.turnComplete)send({type:'turn_complete'});
   });
   upstream.on('error',()=>fail('live_unavailable'));
   upstream.on('close',()=>{if(!ended&&client.readyState===WebSocket.OPEN){if(ending)finish(false);else fail('live_closed');}});
  }
  client.on('message',(data,binary)=>{
   if(binary){if(ending)return;bytes+=data.length;if(bytes>19200000)return client.close(1009);if(ready)forward(data);else if(queued.length<160)queued.push(data);else fail('live_queue_full');return;}
   let command;try{command=JSON.parse(data.toString());}catch{return;}
   if(command.type==='configure')configure(command);
   if(command.type==='end'&&!ending){ending=true;if(ready)endStream();}
  });
  client.on('close',cleanup);client.on('error',cleanup);
 });
 return wss;
}
module.exports={attachLive,setup,LIVE_MODEL};
