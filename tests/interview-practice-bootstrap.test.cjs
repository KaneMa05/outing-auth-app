const {test}=require('node:test'),assert=require('node:assert/strict');
const {createHandler}=require('../api/interview-prep');
async function call(handler,body){let status,data;await handler({method:'POST',headers:{host:'localhost'},body},{setHeader(){},status(n){status=n;return this;},json(d){data=d;}});return {status,data};}
test('native practice uses verified portal identity and approved server questions only',async()=>{
 let allowed=true;const calls=[];
 const handler=createHandler({authenticateWeb:async()=>({id:'kakao-owner'}),invoke:async(action,actor,body)=>{
  calls.push({action,actor,body});assert.equal(actor.id,'kakao-owner');
  if(action==='mock_status')return {allowed};
  if(action==='bootstrap')return {member:{track:'항해'}};
  if(action==='questions'){assert.deepEqual(body,{category:'job',page:0});return {questions:[{id:'q-approved',prompt:'질문',tracks:['항해'],category:'job',answer:'private'}]};}
  throw Error(action);
 }});
 const r=await call(handler,{action:'practice_bootstrap',studentId:'forged',actor:{type:'admin'}});
 assert.equal(r.status,200);assert.equal(r.data.accountId,'kakao-owner');assert.equal(r.data.questions[0].answer,undefined);
 allowed=false;calls.length=0;assert.equal((await call(handler,{action:'practice_bootstrap'})).status,403);assert.equal(calls.length,1);
});
