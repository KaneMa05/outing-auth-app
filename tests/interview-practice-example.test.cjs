'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {practiceExample}=require('../lib/interview-practice-example.cjs'),scope=require('../lib/interview-test-question-scope.json');
const {createHandler}=require('../api/interview-prep');
const q=scope.questions.find(q=>q.category==='job');
function fixture(){let reads=[];return {reads,read:async(method,route)=>{reads.push({method,route});assert.equal(method,'GET');if(route.startsWith('ip_questions?'))return [{...q,status:'published',tracks:['공채'],occurrences:[]}];if(route.startsWith('ip_occurrences?'))return [{id:'example',answer:'선박의 위치와 식별 정보를 확인하여 입출항 및 긴급 대응에 활용합니다.'}];throw Error('unexpected '+route);}};}
test('test practice reference uses authorized published pool and read-only source queries, never a provider',async()=>{
 const f=fixture(),actor={type:'student',id:'fixture-owner',testApp:true};
 const result=await practiceExample(f.read,{actor,track:'공채',mode:'job',questionId:q.id,questionPrompt:q.prompt});assert.equal(result.accountId,actor.id);assert(result.referenceAnswer);assert(f.reads.some(r=>r.route.startsWith('ip_occurrences?')));
 for(const change of [{actor:{...actor,testApp:false}},{mode:'ai'},{questionId:'foreign-question'},{questionPrompt:'변경된 질문'}]){
  const denied=fixture();await assert.rejects(practiceExample(denied.read,{actor,track:'공채',mode:'job',questionId:q.id,questionPrompt:q.prompt,...change}),/forbidden|invalid_request|question_unavailable/);assert(!denied.reads.some(r=>r.route.startsWith('ip_occurrences?')));
 }
});
test('reference API requires actual login, test marker, practice access and rejects extra identity fields',async()=>{
 let auth=true,allowed=true;const f=fixture();const handler=createHandler({authenticateWeb:async()=>auth?{id:'fixture-owner'}:null,previewAllowed:()=>false,read:f.read,invoke:async(action)=>{if(action==='mock_status')return {allowed};if(action==='bootstrap')return {member:{track:'공채'}};throw Error('unexpected '+action);}});
 async function call(body,marker=true){let result;await handler({method:'POST',headers:{host:'local',origin:'https://local',...(marker?{'x-interview-test-app':'1'}:{})},body},{setHeader(){},status(code){this.code=code;return this;},json(data){result={code:this.code,data};}});return result;}
 const body={action:'practice_reference',mode:'job',questionId:q.id,questionPrompt:q.prompt};
 assert.equal((await call(body,false)).code,403);auth=false;assert.equal((await call(body)).code,403);auth=true;allowed=false;assert.equal((await call(body)).code,403);allowed=true;
 assert.equal((await call({...body,accountId:'foreign'})).code,400);const result=await call(body);assert.equal(result.code,200);assert.equal(result.data.accountId,'fixture-owner');
});
test('personality examples retain topic authorization and can fall back to the same published question source',async()=>{
 const row=scope.questions.find(q=>q.category==='personality');let occurrences=0;
 const result=await practiceExample(async(method,route)=>{
  assert.equal(method,'GET');
  if(route.startsWith('ip_topics?'))return [{id:'teamwork',title:'협동심',active:true,tracks:[]}];
  if(route.startsWith('ip_questions?'))return [{...row,status:'published',tracks:[],topic_ids:['teamwork']}];
  if(route.startsWith('ip_occurrences?')){occurrences++;return occurrences===1?[]:[{answer:'팀원의 상황을 듣고 역할을 조정한 뒤 함께 진행 상황을 공유했습니다.'}];}
  throw Error('unexpected '+route);
 },{actor:{type:'student',id:'fixture-owner',testApp:true},track:'공채',mode:'personality',questionId:row.id,questionPrompt:row.prompt});
 assert.equal(occurrences,2);assert(result.referenceAnswer.includes('팀원'));
});
