'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {LiveEngine}=require('../lib/interview-live-engine');
const {createProvider}=require('../lib/interview-live-provider');
const {decision,FOLLOWUP_INSTRUCTIONS}=require('../lib/interview-live-policy');
const complete={turnComplete:true,ask:false,question:'',evidence:''};
async function fixture(generate){
 let event,clock=Date.now();const sent=[],saved=[],contexts=[];
 const run={id:randomUUID(),questions:[0,1,2].map(i=>({id:'main-'+i,prompt:'메인 질문 '+i})),deadline:new Date(clock+600000).toISOString()};
 const backend=createProvider({key:'synthetic-test-key',followupModel:'test-model',fetchImpl:async(url,options)=>{
  assert.equal(url,'https://api.openai.com/v1/responses');const body=JSON.parse(options.body);
  assert.equal(body.store,false);assert.equal(body.instructions,FOLLOWUP_INSTRUCTIONS);assert(body.text.format.strict);
  const context=JSON.parse(body.input);contexts.push(context);
  const result=await generate(context,contexts.length-1);
  return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(result)}]}]});
 }});
 const engine=new LiveEngine({invoke:async(action,actor,body)=>{
  if(action==='reserve')return {run};if(action==='save')saved.push(body);return {ok:true};
 },provider:{create:async()=>({id:'live_test',sdp:'answer'}),attach:async(id,callback)=>{event=callback;return {send:e=>{sent.push(e);if(e.type==='session.close')event({type:'session.closed'});},destroy(){}};},closeSession:async()=>true,followup:backend.followup},
 storage:{upload:async()=>{}},recorder:()=>({sizes:{input:0},append(){},close(){}}),cleanup(){},now:()=>clock});
 await engine.start({type:'student',id:'test'},{requestKey:randomUUID(),sdp:'v=0 test'});
 const live=engine.sessions.get(run.id);
 return {engine,live,sent,saved,contexts,event:e=>event(e),async answer(text,manual=true){clock+=6000;event({type:'session.input_transcript.delta',delta:text});if(!manual)clock+=2000;await engine.advance(live,'delegation-'+contexts.length,manual);},stop:()=>engine.finish(live,live.completed?'completed':'interrupted')};
}
test('Live answers create two fresh followups in sequence for each of three main questions',async()=>{
 const f=await fixture((context,i)=>context.remainingFollowups===0?complete:{turnComplete:true,ask:true,question:'새 꼬리질문 '+i+'에서 어떤 행동을 했나요?',evidence:'답변 '+i});
 try{
  for(let i=0;i<9;i++){
   assert.equal(f.live.current.kind,i%3===0?'initial':'followup');
   await f.answer('실제 답변 '+i+'에서 저는 의견을 조율했습니다.');
   const context=f.contexts[i];assert.equal(context.answer,'실제 답변 '+i+'에서 저는 의견을 조율했습니다.');
   assert.equal(context.originalQuestion,'메인 질문 '+Math.floor(i/3));assert.equal(context.remainingFollowups,2-i%3);
   assert.equal(context.history.length,i%3);assert.equal(context.asked.length,i%3+1);
   if(i%3===2){assert.equal(context.history[0].answer,'실제 답변 '+(i-2)+'에서 저는 의견을 조율했습니다.');assert.equal(context.history[1].answer,'실제 답변 '+(i-1)+'에서 저는 의견을 조율했습니다.');}
  }
  assert(f.live.completed);assert.equal(f.live.turns.length,9);
  for(let i=0;i<3;i++){
   const group=f.live.turns.filter(t=>t.parentQuestionId==='main-'+i);
   assert.deepEqual(group.map(t=>t.kind),['initial','followup','followup']);
   assert.equal(group[1].evidence,'답변 '+i*3);assert.equal(group[2].evidence,'답변 '+(i*3+1));
   assert.notEqual(group[1].question,group[2].question);
  }
  assert.equal(f.saved.at(-1).turns.length,9);
 }finally{await f.stop();}
});
test('a skipped or invalid followup preserves the answer and cannot jump to another main question',async()=>{
 for(const result of [complete,{turnComplete:true,ask:true,question:'답변에 없는 사실은 무엇인가요?',evidence:'없는 근거'}]){
  const f=await fixture(()=>result);
  try{await f.answer('직접 업무를 나눴습니다.');assert.equal(f.live.turns.length,0);assert.equal(f.live.index,0);assert.equal(f.live.followups,0);assert.equal(f.live.answer,'직접 업무를 나눴습니다.');assert.equal(f.live.lastError,'followup_unavailable');}
  finally{await f.stop();}
 }
});
test('incomplete speech and repeat requests cannot skip a required question even with answer-done',async()=>{
 const f=await fixture(()=>({turnComplete:false,ask:false,question:'',evidence:''}));
 try{await f.answer('질문을 다시 말해주세요.');assert.equal(f.live.turns.length,0);assert.equal(f.live.index,0);assert.equal(f.live.followups,0);assert.equal(f.live.lastError,undefined);}
 finally{await f.stop();}
});
test('followup two cannot cite the main answer or repeat the first followup',()=>{
 const previous='팀워크를 통해 해결했습니다.',latest='제가 직접 연락했습니다.',question='직접 연락한 이유는 무엇인가요?';
 assert.throws(()=>decision({turnComplete:true,ask:true,question,evidence:previous},latest,[],1),/invalid_evidence/);
 assert.throws(()=>decision({turnComplete:true,ask:true,question,evidence:'직접 연락'},latest,[question],1),/invalid_evidence/);
 assert.throws(()=>decision(complete,latest,[],1),/followup_required/);
 assert.equal(decision(complete,latest,[],0).ask,false);
});
