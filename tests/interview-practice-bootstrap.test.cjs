const {test}=require('node:test'),assert=require('node:assert/strict');
const {createHandler}=require('../api/interview-prep');
async function call(handler,body){let status,data;await handler({method:'POST',headers:{host:'localhost'},body},{setHeader(){},status(n){status=n;return this;},json(d){data=d;}});return {status,data};}
test('native practice uses verified portal identity and approved server questions only',async()=>{
 let allowed=true;const calls=[];
 const handler=createHandler({authenticateWeb:async()=>({id:'kakao-owner'}),read:async(method,path)=>{
  assert.equal(method,'GET');const q=new URL('https://local/'+path).searchParams;
  assert.equal(q.get('status'),'eq.published');assert.equal(q.get('category'),'eq.job');assert.match(q.get('or'),/항해/);
  return [{id:'q-approved',prompt:'질문',tracks:['항해'],category:'job',status:'published',answer:'private',
   taxonomy:{primary_field:'navigation',related_fields:[],review_status:'classified',source_prompt:'질문',source_category:'job'}}];
 },invoke:async(action,actor,body)=>{
  calls.push({action,actor,body});assert.equal(actor.id,'kakao-owner');
  if(action==='mock_status')return {allowed};
  if(action==='bootstrap')return {member:{track:'항해'}};
  throw Error(action);
 }});
 const r=await call(handler,{action:'practice_bootstrap',studentId:'forged',actor:{type:'admin'}});
 assert.equal(r.status,200);assert.equal(r.data.accountId,'kakao-owner');assert.equal(r.data.questions[0].answer,undefined);
 assert.deepEqual(r.data.fields.map(f=>({id:f.id,label:f.label})),[{id:'navigation',label:'항해학'}]);
 allowed=false;calls.length=0;assert.equal((await call(handler,{action:'practice_bootstrap'})).status,403);assert.equal(calls.length,1);
});
test('personality settings preserve the existing AI preparation path',async()=>{
 for(const mode of ['ai']){
  const handler=createHandler({authenticateWeb:async()=>({id:'owner'}),read:async()=>{throw Error('job catalog must not run');},invoke:async(action,_actor,body)=>{
   if(action==='mock_status')return {allowed:true};if(action==='bootstrap')return {member:{track:'공채'}};
   assert.equal(action,'questions');assert.deepEqual(body,{category:'personality',page:0});
   return {questions:[{id:'q',prompt:'경험 질문',category:'personality',tracks:['공채'],answer:'private'}]};
  }});
  const r=await call(handler,{action:'practice_bootstrap',mode});assert.equal(r.status,200);assert.deepEqual(r.data.fields,[]);assert.equal(r.data.questions[0].answer,undefined);
 }
});

test('personality bootstrap exposes active topic choices and the complete approved pool without student notes or answers',async()=>{
 const reads=[];
 const handler=createHandler({authenticateWeb:async()=>({id:'personality-owner'}),read:async(method,path)=>{
  assert.equal(method,'GET');reads.push(path);
  if(path.startsWith('ip_topics?'))return [{id:'failure',title:'실패·성장',active:true,tracks:[]}];
  const query=new URL('https://local/'+path).searchParams;
  assert.equal(query.get('category'),'eq.personality');assert.equal(query.get('status'),'eq.published');assert.match(query.get('or'),/공채/);
  return [{id:'p',prompt:'실패 경험을 설명해주세요.',category:'personality',status:'published',tracks:[],topic_ids:['failure'],answer:'private-answer',notes:'private-note'}];
 },invoke:async(action,actor)=>{
  assert.equal(actor.id,'personality-owner');if(action==='mock_status')return {allowed:true};if(action==='bootstrap')return {member:{track:'공채'}};throw Error('unexpected '+action);
 }});
 const result=await call(handler,{action:'practice_bootstrap',mode:'personality'});
 assert.equal(result.status,200);assert.equal(result.data.mode,'personality');assert.deepEqual(result.data.fields,[{id:'failure',label:'실패·성장'}]);assert.deepEqual(result.data.questions[0].fieldIds,['failure']);
 assert.equal(result.data.questions[0].answer,undefined);assert.equal(result.data.questions[0].notes,undefined);assert.equal(reads.length,2);
});
