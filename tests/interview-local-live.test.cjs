const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {WebSocket}=require('ws'),{attachLocalLive}=require('../lib/interview-local-live');
test('local captions update before end and finalize all received audio',async()=>{
 const server=http.createServer();let calls=0;
 const wss=attachLocalLive(server,{authorize:r=>r.headers.authorization==='Bearer test',intervalMs:20,recognize:async pcm=>{calls++;return '인식 '+pcm.length;}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const ws=new WebSocket(`ws://127.0.0.1:${server.address().port}/live`,{headers:{Authorization:'Bearer test'}});
 try{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('timeout')),3000);ws.on('error',reject);ws.on('open',()=>ws.send(JSON.stringify({type:'configure',mode:'job',question:'피항선의 의무는?'})));ws.on('message',raw=>{const m=JSON.parse(raw);if(m.type==='ready')for(let i=0;i<4;i++)ws.send(Buffer.alloc(8000, 40));if(m.type==='transcript'&&m.partial){assert.equal(m.text,'인식 32000');ws.send(Buffer.alloc(16000, 40));ws.send(JSON.stringify({type:'end'}));}if(m.type==='finished'){assert.equal(m.text,'인식 48000');assert.equal(m.confirmed,true);clearTimeout(timer);resolve();}});});assert.equal(calls,2);}finally{ws.terminate();wss.close();await new Promise(r=>server.close(r));}
});
