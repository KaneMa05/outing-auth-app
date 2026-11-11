'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),{once}=require('node:events');
const {createHandler}=require('../api/interview-native'),auth=require('../lib/interview-native-auth');
test('real IncomingMessage headers survive native-to-Live delegation and keep test-app scope',async()=>{
 const secret='n'.repeat(64),actors=[];
 const handler=createHandler({enabled:true,secret,requireMockAccess:async()=>{},
  live:{config:{enabled:true,configured:true,transport:'vercel',secret},invoke:async(action,actor)=>{actors.push(actor);return {ok:true,ready:true};}}});
 const server=http.createServer((req,res)=>{res.status=n=>{res.statusCode=n;return res;};res.json=value=>res.end(JSON.stringify(value));void handler(req,res);});
 server.listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port;
 try{
  for(const testApp of [false,true]){
   const r=await fetch(origin,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Authorization:'Bearer '+auth.issue('test-owner',secret),...(testApp?{'X-Interview-Test-App':'1'}:{})},body:JSON.stringify({action:'command',command:{action:'ready'}})});
   const body=await r.json();assert.equal(r.status,200,JSON.stringify(body));assert.equal(body.ready,true);assert.equal(actors.at(-1).testApp,testApp?true:undefined);
  }
  const denied=await fetch(origin,{method:'POST',headers:{Origin:'https://wrong.example','Content-Type':'application/json',Authorization:'Bearer '+auth.issue('test-owner',secret)},body:JSON.stringify({action:'command',command:{action:'ready'}})});assert.equal(denied.status,403);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
