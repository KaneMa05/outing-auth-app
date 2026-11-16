'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {analyzeTask}=require('../lib/interview-mock-analysis.cjs');
const {validate}=require('../lib/interview-personality-agreement.cjs');
const {transcriptionEvent}=require('../lib/interview-practice-usage.cjs');
const {wav}=require('./interview-exam.test.cjs');
const common='제가 역할을 나누고 진행 상황을 확인했습니다.';
const finding={quote:common,verificationQuote:common,feedback:'본인이 한 행동을 설명했습니다.',agreement:'supported'};
const output=(f=finding)=>({strengths:[f],improvements:[],nextPractice:[]});
const transcripts=['행사 준비를 맡았습니다. '+common,'행사 준비를 했습니다. '+common];
async function run({testApp=true,category='personality',audio=wav(),words=transcripts,result=output()}={}){
 let calls=0;const report=await analyzeTask({kind:'practice',testApp,question:{id:'q',prompt:'협업 경험은?',category},audio},{models:{analyzer:'test',transcriber:'test'},practiceReference:true,transcribe:async(_,{pass})=>words[pass],infer:async(input)=>{calls++;assert.equal(input.transcriptA,words[0]);assert.equal(input.transcriptB,words[1]);assert.equal(input.reference,undefined);return result;}});
 return {report,calls};
}
test('test personality differences produce feedback only from a shared complete sentence',async()=>{
 const {report,calls}=await run();assert.equal(calls,1);assert.equal(report.status,'practice_feedback');assert.equal(report.analysis.strengths[0].quote,common);assert.equal(report.grade,null);assert.equal(report.score,null);assert.equal(report.audit.agreementMethod,'personality-common-evidence-1');assert.equal(report.assessment.length,0);
});
test('word differences, missing evidence, negation and decimal changes cannot support findings',()=>{
 for(const f of [{...finding,verificationQuote:'보고하지 않았습니다.'},{...finding,quote:'역할을 나누고',verificationQuote:'역할을 나누고'},{...finding,agreement:'uncertain'},{...finding,quote:'1.5미터입니다.',verificationQuote:'15미터입니다.'}])assert.equal(validate(output(f),transcripts),null);
 assert.equal(validate(output({...finding,quote:'보고했습니다.',verificationQuote:'보고하지 않았습니다.'}),['보고했습니다.','보고하지 않았습니다.']),null);
});
test('no shared supported findings stays held, never becomes a fabricated grade',async()=>{
 const {report}=await run({result:{strengths:[],improvements:[],nextPractice:[]}});assert.equal(report.status,'review_required');assert.equal(report.analysis,null);assert(report.reasons.includes('common_evidence_insufficient'));
});
test('ordinary app, job mode and bad audio retain the prior hold without extra inference',async()=>{
 for(const opts of [{testApp:false},{category:'job'},{audio:wav(.0001)}]){const {report,calls}=await run(opts);assert.equal(calls,0);assert.equal(report.status,'review_required');}
});
test('transcription costs distinguish reported duration, estimate and uncertainty',()=>{
 assert.equal(transcriptionEvent('id','gpt-transcribe',{type:'duration',seconds:60},60,true).usd,.0045);
 assert.equal(transcriptionEvent('id','gpt-transcribe',null,60,true).status,'estimated');
 assert.equal(transcriptionEvent('id','gpt-transcribe',null,60).usd,null);
 assert.equal(transcriptionEvent('id','unknown',{type:'duration',seconds:60},60,true).status,'unpriced');
});
