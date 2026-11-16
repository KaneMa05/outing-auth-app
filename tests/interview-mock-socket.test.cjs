const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter,once}=require('node:events');
const {randomUUID}=require('node:crypto');
const {bindSocket}=require('../lib/interview-live-socket'),{issue}=require('../lib/interview-live-ticket');
test('a valid socket ticket cannot bypass revoked pilot access',async()=>{
 const ws=new EventEmitter();ws.readyState=1;const sent=[];ws.send=s=>sent.push(JSON.parse(s));ws.close=()=>{ws.readyState=3;};
 const secret='s'.repeat(64),body={action:'start',sdp:'v=0 test',requestKey:randomUUID()};let runtimeCreated=false;
 const session=bindSocket(ws,{secret,requireMockAccess:async()=>{throw Error('forbidden');},createRuntime:()=>{runtimeCreated=true;throw Error('must not run');}});
 ws.emit('message',JSON.stringify({id:1,body,ticket:issue({type:'student',id:'ip-a'},body.requestKey,body.sdp,secret)}),false);
 await session.done;assert.equal(runtimeCreated,false);assert.equal(sent[0].error,'forbidden');
});
