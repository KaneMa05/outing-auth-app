'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {analyzeTask}=require('../lib/interview-mock-analysis.cjs');
const {practiceTranscriptKey}=require('../lib/interview-practice-agreement.cjs');
const {wav}=require('./interview-exam.test.cjs');
const models={analyzer:'fixture-model',transcriber:'fixture-asr'};
const question={id:'test-job',revision:1,category:'job',prompt:'어떻게 대응합니까?',reference:{answer:'상황을 확인합니다. 동료에게 보고합니다. 조치를 기록합니다.'}};
async function analyze(transcripts,{testApp=true,kind='practice',audio=wav(),infer}={}){
 let calls=0;
 const result=await analyzeTask({kind,testApp,question,audio},{models,transcribe:async(_audio,{pass})=>transcripts[pass],practiceReference:true,
  infer:async(input,config)=>{calls++;return infer?infer(input,config):{summary:'답변을 확인했습니다.',strengths:[],improvements:[],nextPractice:[],assessment:input.criteria.map(c=>({index:c.index,status:'O',quote:input.transcript,reason:'핵심 내용 확인'}))};}});
 return {result,calls};
}
test('test practice ignores punctuation and repeated spaces but preserves word boundaries',async()=>{
 const {result,calls}=await analyze(['상황을 확인합니다.','상황을  확인합니다!']);
 assert.equal(result.status,'practice_feedback');assert.equal(calls,1);
 for(const [a,b] of [['1.5미터','15미터'],['보고했습니다','보고하지 않았습니다'],['-5도','5도'],['1-5회','15회'],['아버지가 방에 있습니다','아버지 가방에 있습니다']])assert.notEqual(practiceTranscriptKey(a),practiceTranscriptKey(b));
});
test('test job practice keeps matching criteria when another transcription term differs',async()=>{
 const answers=['브이패스 장치로 상황을 확인하고 보고했습니다.','V-PASS 장치로 상황을 확인하고 보고했습니다.'];
 const {result,calls}=await analyze(answers,{infer:async input=>{
  const second=input.transcript===answers[1];return {summary:'전사 전체에 의존하는 요약',strengths:[{turnId:'1',quote:'상황을 확인하고 보고했습니다.',feedback:'행동을 설명했습니다.'},{turnId:'1',quote:second?'V-PASS':'브이패스',feedback:'장치 명칭'}],improvements:[],nextPractice:[],assessment:input.criteria.map(c=>({index:c.index,status:c.index===2&&second?'X':'O',quote:c.index===2&&second?'':input.transcript,reason:'해당 전사에 근거한 판정'}))};
 }});
 assert.equal(calls,2);assert.equal(result.status,'practice_feedback');assert.deepEqual(result.assessment.map(r=>r.status),['O','O','uncertain']);
 assert.equal(result.analysis.strengths.length,1);assert.notEqual(result.analysis.summary,'전사 전체에 의존하는 요약');
 assert.equal(result.assessment[0].verificationQuote,answers[1]);assert.equal(result.audit.agreementMethod,'independent-transcript-criteria-1');assert.deepEqual(result.transcripts,answers);
});
test('opposite claims and numbers remain uncertain per affected criterion',async()=>{
 for(const answers of [['보고했습니다.','보고하지 않았습니다.'],['거리는 1.5미터입니다.','거리는 15미터입니다.']]){
  const {result}=await analyze(answers,{infer:async input=>({summary:'확인',strengths:[],improvements:[],nextPractice:[],assessment:input.criteria.map(c=>({index:c.index,status:input.transcript===answers[0]?'O':'X',quote:input.transcript,reason:'실제 발화 기준'}))})});
  assert(result.assessment.every(r=>r.status==='uncertain'));assert.equal(result.grade,null);assert.equal(result.score,null);
 }
});
test('fabricated evidence cannot pass even when both model statuses match',async()=>{
 const {result}=await analyze(['장치를 확인합니다.','장비를 확인합니다.'],{infer:async input=>({summary:'확인',strengths:[],improvements:[],nextPractice:[],assessment:input.criteria.map(c=>({index:c.index,status:'O',quote:'발화하지 않은 사실',reason:'잘못된 근거'}))})});
 assert(result.assessment.every(r=>r.status==='uncertain'));
});
test('ordinary practice, bad audio and personality differences retain the existing whole-answer hold',async()=>{
 for(const options of [{testApp:false},{audio:wav(.0001)}]){
  const {result,calls}=await analyze(['보고했습니다.','보고하지 않았습니다.'],options);assert.equal(calls,0);assert.equal(result.status,'review_required');
 }
 // Personality has no reference criteria: it must not use job criterion agreement.
 const held=await analyzeTask({kind:'practice',testApp:true,question:{...question,category:'personality'},audio:wav()},{models,practiceReference:true,transcribe:async(_,{pass})=>pass?'의견을 듣지 않았습니다.':'의견을 들었습니다.',infer:()=>{throw Error('must not infer');}});
 assert.equal(held.status,'review_required');
});
