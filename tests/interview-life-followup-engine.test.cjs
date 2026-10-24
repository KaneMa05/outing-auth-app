const {test}=require('node:test'),assert=require('node:assert/strict');
const {generate,validate,topics}=require('../lib/interview-life-followup-engine');
const make=content=>({experience:{age:'22',title:'가상 검증 경험',content,appeal:''},questions:[],session:{answer_revision:0}});
const examples=['열심히 했다.','힘들었고 해결되지 않았다.','친구 덕분에 준비했다.','제가 직접 신청서를 제출했다.','홈페이지에서 프로그램을 알게 됐다.','비용을 중요하게 고려해서 선택했다.','실패한 뒤 원인을 확인했다.','어릴 때 동네에서 놀았다.','평범한 하루였다.','결과가 기억나지 않는다.','성장했다고 느꼈다.','팀원과 함께 의견을 조율했다.'];
test('12 representative experiences: bounded factual questions, no success assumptions, escaped UI data contract',async()=>{
 for(const content of examples){const d=make(content),r=await generate(d,'generate_questions');assert.equal(r.engine,'basic_templates');assert(r.result.questions.length>=2&&r.result.questions.length<=3);assert(!r.result.questions.some(q=>q.kind==='hypothetical'));assert(!r.result.questions.some(q=>/뛰어나|성실한|극복했죠|책임감이 강/.test(q.text)));validate(r.result,d,'generate_questions');}
});
test('saved skips are respected and hypothetical/later facts do not merge into the original',async()=>{
 const d=make('실제로 한 첫 경험');d.questions=topics.map(([topic,kind,text],i)=>({id:String(i),topic,kind,text,answer:{status:i%3===0?'unknown':i%3===1?'skipped':'answered',text:'답변 '+topic}}));
 assert.equal((await generate(d,'generate_questions')).result.questions.length,0);
 const r=(await generate(d,'summarize')).result;
 assert(!r.content.includes('hypothesis'));assert(!r.content.includes('later'));assert(!r.content.includes('choice'));assert(!r.content.includes('scene'));
});
test('valid dedicated output is labelled AI, failures/invalid evidence use honest basic fallback',async()=>{
 const d=make('원래 경험'),base=await generate(d,'summarize');
 const real=await generate(d,'summarize',{provider:async payload=>{assert(!('studentId' in payload));assert(!('profile' in payload));return {...base.result,model:'test-provider'};}});assert.equal(real.engine,'dedicated_ai');
 for(const provider of [async()=>{throw Error('offline');},async()=>({...base.result,content:'없었던 성과를 창작'}),async()=>({...base.result,facts:[{text:'가짜 사실',refs:['someone-else']} ]})])assert.equal((await generate(d,'summarize',{provider})).engine,'basic_extract');
});
test('semantic topics and facts in another answer suppress repetition',async()=>{
 const d=make('친구와 준비했다');d.questions=[{id:'q1',topic:'scene',kind:'fact',answer:{status:'answered',text:'학교 홈페이지에서 알아보고 비용을 고려해서 선택했다. 제가 직접 신청서를 제출했다.'}}];
 const r=await generate(d,'generate_questions');assert(!r.result.questions.some(q=>['scene','trigger','choice','action'].includes(q.topic)));assert(r.result.questions.some(q=>q.topic==='roles'));
});
