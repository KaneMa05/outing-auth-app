const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter,once}=require('node:events');
const http=require('node:http');
const {WebSocket}=require('ws');
const {attachLive,setup}=require('../lib/interview-free-live');
const {recognitionHints,LiveTranscript,sourceQuestionCount}=require('../lib/interview-transcription');

test('interim words are replaced by final words and sentences keep their spacing',()=>{
 const text=new LiveTranscript();assert.equal(text.update('해양 경창',true),'해양 경창');
 assert.equal(text.update('해양경찰입니다.',false),'해양경찰입니다.');
 assert.equal(text.update('협업',true),'해양경찰입니다. 협업');
 assert.equal(text.update('협업했습니다.',false),'해양경찰입니다. 협업했습니다.');
});
test('hints come from existing question and answer material, capped at 100',()=>{
 assert(sourceQuestionCount>100);
 const hints=recognitionHints('페스카마호 사건을 보호주의와 연관하여 설명해보세요.','job');
 assert(hints.includes('보호주의'));assert(hints.includes('속인주의'));assert(hints.length<=100);
 assert(hints.every(t=>t.length<=80&&!t.includes('\n')));
 const config=setup({question:'협업 중 의견 차이를 해결한 경험을 말씀해주세요.',mode:'personality'}).setup;
 assert.equal(config.realtimeInputConfig.automaticActivityDetection.disabled,false);
 assert.equal(config.inputAudioTranscription.mode,'VERBATIM');
 assert.deepEqual(config.inputAudioTranscription.languageCodes,['ko-KR']);
 assert(config.inputAudioTranscription.customVocabulary.includes('협업'));
});
class FakeUpstream extends EventEmitter {
 constructor(){super();this.readyState=WebSocket.OPEN;this.sent=[];setImmediate(()=>this.emit('open'));}
 send(raw){const data=JSON.parse(raw);this.sent.push(data);if(data.setup)setImmediate(()=>this.emit('message',JSON.stringify({setupComplete:{}})));}
 message(serverContent){this.emit('message',JSON.stringify({serverContent}));}
 close(){if(this.readyState===WebSocket.CLOSED)return;this.readyState=WebSocket.CLOSED;this.emit('close');}
 terminate(){this.close();}
}
async function bridge(t){
 const server=http.createServer();let upstream,consumed=0;
 const wss=attachLive(server,{key:'test',authorize:()=>true,consume:()=>consumed++,createUpstream:()=>upstream=new FakeUpstream(),finishTimeoutMs:80});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const client=new WebSocket('ws://127.0.0.1:'+server.address().port+'/live'),events=[];
 const bus=new EventEmitter();client.on('message',raw=>{const e=JSON.parse(raw);events.push(e);bus.emit(e.type,e);});
 t.after(async()=>{client.terminate();for(const socket of wss.clients)socket.terminate();wss.close();await new Promise(resolve=>server.close(resolve));});
 await once(client,'open');const ready=once(bus,'ready');client.send(JSON.stringify({type:'configure',question:'협업 경험을 말씀해주세요.',mode:'personality'}));await ready;
 return {client,upstream,events,bus,consumed:()=>consumed};
}
test('sentence finals keep the stream open; the last final drains before finish',async t=>{
 const b=await bridge(t);assert.equal(b.consumed(),1);
 b.upstream.message({interimInputTranscription:{text:'협업해습니다'}});
 b.upstream.message({inputTranscription:{text:'협업했습니다.'},turnComplete:true});
 await once(b.bus,'turn_complete');assert.equal(b.client.readyState,WebSocket.OPEN);
 b.client.send(Buffer.alloc(3200));b.upstream.message({interimInputTranscription:{text:'배운점'}});
 const finished=once(b.bus,'finished');b.client.send(JSON.stringify({type:'end'}));
 await new Promise(resolve=>setTimeout(resolve,15));
 assert(b.upstream.sent.some(x=>x.realtimeInput?.audioStreamEnd));
 b.upstream.message({inputTranscription:{text:'배운 점을 설명하겠습니다.'}});
 const [result]=await finished;assert.equal(result.confirmed,true);assert.equal(result.text,'협업했습니다. 배운 점을 설명하겠습니다.');
 assert(!result.text.includes('협업해습니다'));assert(!result.text.includes('배운점'));
});
test('a missing final has a bounded wait and preserves a provisional transcript',async t=>{
 const b=await bridge(t);b.upstream.message({interimInputTranscription:{text:'역할을 분담했습니다'}});
 const finished=once(b.bus,'finished');b.client.send(JSON.stringify({type:'end'}));
 const [result]=await finished;assert.equal(result.confirmed,false);assert.equal(result.text,'역할을 분담했습니다');
});
