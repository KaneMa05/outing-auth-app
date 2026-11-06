'use strict';
const {WebSocketServer,WebSocket}=require('ws');
const {transcribe}=require('./interview-local-transcriber');
function attachLocalLive(server,{authorize,recognize=transcribe,intervalMs=900}){
 const wss=new WebSocketServer({noServer:true,maxPayload:16384});
 server.on('upgrade',(req,socket,head)=>{if(req.url!=='/live'||!authorize(req)){socket.end('HTTP/1.1 401 Unauthorized\r\n\r\n');return;}wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws));});
 wss.on('connection',client=>{
 let configured=false,ending=false,busy=false,closed=false,size=0,processed=0,text='',question='',chunks=[],committed='',base=0;
 const send=value=>{if(client.readyState===WebSocket.OPEN)client.send(JSON.stringify(value));};
 const fail=()=>{send({type:'error',error:'local_transcription_failed'});client.close();};
 const finish=()=>{send({type:'finished',text,confirmed:true});client.close();};
 async function tick(){if(!configured||closed||busy)return;if(processed===size){if(ending)finish();return;}if(!ending&&size-processed<16000)return;
 busy=true;const snapshot=size;try{const pcm=Buffer.concat(chunks);const windowStart=base;
 const current=await recognize(pcm.subarray(windowStart,snapshot),question);processed=snapshot;
 text=[committed,current].filter(Boolean).join(' ');
 // Commit only at a brief pause (or a bounded 8-second window) to avoid
 // repeatedly recognizing the whole answer and delaying later sentences.
 const tail=pcm.subarray(Math.max(windowStart,snapshot-16000),snapshot);let energy=0;
 for(let i=0;i+1<tail.length;i+=2)energy+=(tail.readInt16LE(i)/32768)**2;
 const pause=tail.length>=16000&&Math.sqrt(energy/(tail.length/2))<0.008;
 if(current&&(pause||snapshot-windowStart>=256000)){committed=text;base=snapshot;}if(closed)return;send({type:'transcript',text,partial:!ending});if(ending&&processed===size)finish();}catch{if(!closed)fail();}finally{busy=false;if(ending&&!closed&&processed!==size)void tick();}}
 const interval=setInterval(tick,intervalMs),deadline=setTimeout(fail,120000),setup=setTimeout(()=>{if(!configured)fail();},10000);
 client.on('message',(data,binary)=>{if(ending)return;if(binary){if(!configured||data.length%2)return fail();size+=data.length;if(size>2880000)return fail();chunks.push(Buffer.from(data));return;}
 let command;try{command=JSON.parse(data.toString());}catch{return fail();}
 if(command.type==='configure'&&!configured){if(!['ai','job','personality'].includes(command.mode)||typeof command.question!=='string'||command.question.length>1000)return fail();configured=true;question=command.question;clearTimeout(setup);send({type:'ready'});}
 else if(command.type==='end'&&configured){ending=true;void tick();}
 });
 const cleanup=()=>{closed=true;chunks=[];clearInterval(interval);clearTimeout(deadline);clearTimeout(setup);};client.on('close',cleanup);client.on('error',cleanup);
 });return wss;
}
module.exports={attachLocalLive};
