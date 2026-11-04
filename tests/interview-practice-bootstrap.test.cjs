const {test}=require('node:test'),assert=require('node:assert/strict');
const {createHandler}=require('../api/interview-prep');
async function call(handler,body){let status,data;await handler({method:'POST',headers:{host:'localhost'},body},{setHeader(){},status(n){status=n;return this;},json(d){data=d;}});return {status,data};}
test('native practice uses verified portal identity and approved server questions only',async()=>{
 let allowed=true;const calls=[];
 const handler=createHandler({authenticateWeb:async()=>({id:'kakao-owner'}),read:async(method,path)=>{
  assert.equal(method,'GET');const q=new URL('https://local/'+path).searchParams;
  assert.equal(q.get('status'),'eq.published');assert.equal(q.get('category'),'eq.job');assert.match(q.get('or'),/항해/);
  return [{id:'q-approved',prompt:'질문',tracks:['항해'],category:'job',status:'published',answer:'private'}];
 },invoke:async(action,actor,body)=>{
  calls.push({action,actor,body});assert.equal(actor.id,'kakao-owner');
  if(action==='mock_status')return {allowed};
  if(action==='bootstrap')return {member:{track:'항해'}};
  throw Error(action);
 }});
 const r=await call(handler,{action:'practice_bootstrap',studentId:'forged',actor:{type:'admin'}});
 assert.equal(r.status,200);assert.equal(r.data.accountId,'kakao-owner');assert.equal(r.data.questions[0].answer,undefined);
 assert.equal(r.data.fields.length,12);
 allowed=false;calls.length=0;assert.equal((await call(handler,{action:'practice_bootstrap'})).status,403);assert.equal(calls.length,1);
});
test('job filter restoration preserves existing personality and AI preparation paths',async()=>{
 for(const mode of ['personality','ai']){
  const handler=createHandler({authenticateWeb:async()=>({id:'owner'}),read:async()=>{throw Error('job catalog must not run');},invoke:async(action,_actor,body)=>{
   if(action==='mock_status')return {allowed:true};if(action==='bootstrap')return {member:{track:'공채'}};
   assert.equal(action,'questions');assert.deepEqual(body,{category:'personality',page:0});
   return {questions:[{id:'q',prompt:'경험 질문',category:'personality',tracks:['공채'],answer:'private'}]};
  }});
  const r=await call(handler,{action:'practice_bootstrap',mode});assert.equal(r.status,200);assert.deepEqual(r.data.fields,[]);assert.equal(r.data.questions[0].answer,undefined);
 }
});
