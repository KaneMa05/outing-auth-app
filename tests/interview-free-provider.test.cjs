const assert=require('node:assert/strict');
const {createFreeProvider,validate,MODEL}=require('../lib/interview-free-provider');
const {wav}=require('./interview-exam.test.cjs');
const {test}=require('node:test');
const result={transcript:'역할을 나누어 협업했습니다.',summary:'협업 경험을 설명했습니다.',strength:'본인 행동을 설명했습니다.',improvement:'결과를 구체적으로 설명해주세요.',evidence:'역할을 나누어',followup:'그 결과는 어땠나요?'};
test('feedback requires real transcript evidence and never produces final grades',()=>{
 assert.throws(()=>validate({...result,evidence:'하지 않은 말'}),/unsupported_evidence/);
 const value=validate(result);assert.equal(value.grade,null);assert.equal(value.score,null);assert.equal(value.provisional,true);
});
test('free provider uses one fixed model and no paid fallback or automatic retries',async()=>{
 let calls=0;const p=createFreeProvider({key:'test',fetchImpl:async(url,options)=>{calls++;assert(url.includes(MODEL));assert.equal(options.headers['x-goog-api-key'],'test');return {status:429,ok:false};}});
 await assert.rejects(p.analyze({audio:wav(),question:'질문',mode:'ai'}),/free_limit_reached/);assert.equal(calls,1);
});
test('silence never calls an API or invents a transcript',async()=>{
 const p=createFreeProvider({key:'test',fetchImpl:()=>{throw Error('must not call');}});
 const value=await p.analyze({audio:wav(0),question:'질문',mode:'personality'});assert.equal(value.transcript,'');assert.equal(value.followup,'');
});
