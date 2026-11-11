const {test}=require('node:test'),assert=require('node:assert/strict');
const {createHandler}=require('../api/interview-prep');
const {questionsFor}=require('../lib/interview-test-question-scope.cjs');
const job=questionsFor('job')[0],personality=questionsFor('personality')[1];
async function call(handler,body){let status,data;await handler({method:'POST',headers:{host:'localhost'},body},{setHeader(){},status(n){status=n;return this;},json(d){data=d;}});return {status,data};}
test('native practice uses verified portal identity and approved server questions only',async()=>{
 let allowed=true;const calls=[];
 const handler=createHandler({authenticateWeb:async()=>({id:'kakao-owner'}),read:async(method,path)=>{
  assert.equal(method,'GET');const q=new URL('https://local/'+path).searchParams;
  assert.equal(q.get('status'),'eq.published');assert.equal(q.get('category'),'eq.job');assert.match(q.get('or'),/항해/);
  return [{id:job.id,prompt:job.prompt,tracks:['항해'],category:'job',status:'published',answer:'private',
   taxonomy:{primary_field:'navigation',related_fields:[],review_status:'classified',source_prompt:job.prompt,source_category:'job'}}];
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
test('AI native preparation uses only the fixed live test main questions and strips answers',async()=>{
 const handler=createHandler({authenticateWeb:async()=>({id:'owner'}),read:async(_method,path)=>{
  if(path.startsWith('ip_topics?'))return [];
  return [...questionsFor('ai').map(q=>({...q,tracks:[],status:'published',answer:'private'})),{id:'outside',prompt:'범위 밖',category:'personality',status:'published',tracks:[]}];
 },invoke:async action=>action==='mock_status'?{allowed:true}:{member:{track:'공채'}}});
 const r=await call(handler,{action:'practice_bootstrap',mode:'ai'});assert.equal(r.status,200);
 assert.deepEqual(r.data.questions.map(q=>q.id),questionsFor('ai').map(q=>q.id));assert(!JSON.stringify(r.data).includes('private'));
});

test('personality bootstrap exposes active topic choices and the complete approved pool without student notes or answers',async()=>{
 const reads=[];
 const handler=createHandler({authenticateWeb:async()=>({id:'personality-owner'}),read:async(method,path)=>{
  assert.equal(method,'GET');reads.push(path);
  if(path.startsWith('ip_topics?'))return [{id:'failure',title:'실패·성장',active:true,tracks:[]}];
  const query=new URL('https://local/'+path).searchParams;
  assert.equal(query.get('category'),'eq.personality');assert.equal(query.get('status'),'eq.published');assert.match(query.get('or'),/공채/);
  return [{id:personality.id,prompt:personality.prompt,category:'personality',status:'published',tracks:[],topic_ids:['failure'],answer:'private-answer',notes:'private-note'}];
 },invoke:async(action,actor)=>{
  assert.equal(actor.id,'personality-owner');if(action==='mock_status')return {allowed:true};if(action==='bootstrap')return {member:{track:'공채'}};throw Error('unexpected '+action);
 }});
 const result=await call(handler,{action:'practice_bootstrap',mode:'personality'});
 assert.equal(result.status,200);assert.equal(result.data.mode,'personality');assert.deepEqual(result.data.fields,[{id:'failure',label:'실패·성장'}]);assert.deepEqual(result.data.questions[0].fieldIds,['failure']);
 assert.equal(result.data.questions[0].answer,undefined);assert.equal(result.data.questions[0].notes,undefined);assert.equal(reads.length,2);
});
