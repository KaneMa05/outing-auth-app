'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const auth=require('../lib/interview-native-auth');
const {createHandler}=require('../api/interview-native');
const key='p'.repeat(64);
async function call(handler,body,headers={}){
 let status,data;await handler({method:'POST',headers:{host:'localhost',...headers},body},{setHeader(){},status(n){status=n;return this;},json(d){data=d;}});
 return {status,data};
}
test('practice credentials expire, reject tampering and cannot be used as live credentials',()=>{
 const token=auth.issuePractice('student-a',key,1000);
 assert.deepEqual(auth.readPractice(token,key,1000),{id:'student-a'});
 for(const [value,secret,time] of [[token,key,999],[token,key,7201000],[token+'x',key,1001],[token,'q'.repeat(64),1001]])
  assert.throws(()=>auth.readPractice(value,secret,time),/unauthorized/);
 assert.throws(()=>auth.read(token,key,1001),/unauthorized/);
 assert.throws(()=>auth.readPractice(auth.issue('student-a',key,1000),key,1001),/unauthorized/);
});
test('practice exchange and catalog use signed identity and require the test-app header',async()=>{
 let consumed=0,received;
 const handler=createHandler({enabled:true,secret:key,readTrack:async()=> '항해',invoke:async()=>{consumed++;return {studentId:'student-a'};},
  practiceBootstrap:async(actor,mode)=>{received={actor,mode};return {ok:true,questions:[]};}});
 const body={action:'exchange',code:'a'.repeat(43),practice:true};
 assert.equal((await call(handler,body)).status,403);assert.equal(consumed,0);
 const exchange=await call(handler,body,{'x-interview-test-app':'1'});
 assert.equal(exchange.status,200);assert.equal(exchange.data.expiresIn,7200);
 assert.equal(auth.readPractice(exchange.data.token,key).id,'student-a');
 const headers={'x-interview-test-app':'1',authorization:'Bearer '+exchange.data.token};
 assert.equal((await call(handler,{action:'practice_bootstrap',mode:'job'},headers)).status,200);
 assert.deepEqual(received,{actor:{id:'student-a'},mode:'job'});
 assert.equal((await call(handler,{action:'practice_bootstrap',mode:'job',studentId:'other'},headers)).status,403);
 assert.equal((await call(handler,{action:'practice_bootstrap',mode:'job'},{authorization:headers.authorization})).status,403);
 assert.equal((await call(handler,{action:'practice_bootstrap',mode:'job'},{...headers,authorization:'Bearer '+auth.issue('student-a',key)})).status,401);
});
