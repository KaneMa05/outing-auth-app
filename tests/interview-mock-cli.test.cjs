'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {analyzeTask,reportInput,validateReport}=require('../lib/interview-mock-analysis.cjs');
const {completion}=require('../lib/interview-mock-cli-queue.cjs');
const {runOnce}=require('../scripts/interview-mock-pc-worker.cjs');
const {detail,wav,judgment}=require('./interview-exam.test.cjs');
const p=require('./helpers/interview-personality-fixture.cjs');
const models={judge:'model-a',verifier:'model-b',analyzer:'model-c',transcriber:'local-asr'},answer='VHF를 사용하고 위치 정보를 교환합니다.';
test('CLI job inference preserves two independent evidence checks and server-side grading',async()=>{
 const calls=[];const result=await analyzeTask({kind:'job',audio:wav(),detail:detail()},{models,transcribe:async()=>answer,infer:async(input,config)=>{calls.push({input,config});return judgment();}});
 assert.equal(calls.length,2);assert.notEqual(calls[0].config.model,calls[1].config.model);assert.equal(calls[1].input.transcript,answer);assert.equal('judgments' in calls[1].input,false);
 assert.equal(result.suggestion.grade,'O');assert.equal(result.grade,null);assert.equal(result.score,null);assert.equal(result.audit.transcriptSource,'audio');
 const same=await analyzeTask({kind:'job',audio:wav(),detail:detail()},{models:{...models,verifier:models.judge},transcribe:async()=>answer,infer:async()=>judgment()});assert.equal(same.suggestion,null);assert.ok(same.reasons.includes('model_diversity_missing'));
});
test('manual transcripts are useful for review but cannot produce a verified suggested grade',async()=>{
 const result=await analyzeTask({kind:'job',detail:detail(),transcripts:[answer,answer],transcriptSource:'operator'},{models,infer:async()=>judgment()});assert.equal(result.suggestion,null);assert.equal(result.judgments.length,2);assert.ok(result.reasons.includes('transcript_unverified'));
 await assert.rejects(analyzeTask({kind:'job',detail:detail()},{models,infer:async()=>{}}),/transcription_not_configured/);
});
test('personality feedback is validated against actual transcript and revalidated on the server',async()=>{
 const audio=wav(),report=await analyzeTask({kind:'personality',audio,question:p.question},{models,transcribe:async()=>p.transcript,infer:async()=>p.analysis()});assert.equal(report.analysis.components.length,4);
 const normalized=completion({kind:'personality',snapshot:{audio_hash:report.audit.audioHash,question_id:p.question.id,question:p.question,analysis_version:p.VERSION||'personality-structure-1'}},report);assert.equal(normalized.analysis.order.status,'expected');
 const wrong=p.analysis();wrong.components.conclusion.quote='없는 인용';const held=await analyzeTask({kind:'personality',audio,question:p.question},{models,transcribe:async()=>p.transcript,infer:async()=>wrong});assert.equal(held.analysis,null);assert.ok(held.reasons.includes('invalid_evidence'));
});
test('summary evidence cannot be invented or taken from interviewer questions',async()=>{
 const input=reportInput({state:'interrupted',turns:[{question:'질문에만 있는 내용',answer:'저는 역할을 나누었습니다.',complete:true}]});
 const good={summary:'저장된 답변을 확인했습니다.',strengths:[{turnId:'1',quote:'역할을 나누었습니다.',feedback:'본인의 행동을 설명했습니다.'}],improvements:[],nextPractice:[]};assert.equal(validateReport(good,input),good);
 for(const mutate of [x=>x.strengths[0].quote='질문에만 있는 내용',x=>x.strengths[0].turnId='2',x=>x.score=100]){const value=structuredClone(good);mutate(value);assert.throws(()=>validateReport(value,input));}
 assert.throws(()=>reportInput({state:'active',turns:[]}));
});
function receipts(initial=null){let value=initial;return {read:async()=>value,write:async v=>{value=structuredClone(v);},clear:async()=>{value=null;}};}
test('worker resumes completed encrypted receipts without repeating model execution',async()=>{
 const receipt={id:'job',lease:'lease',phase:'result',report:{grade:null,score:null}},outbox=receipts(receipt),calls=[];
 await runOnce({receipts:outbox,request:async(action,body)=>{calls.push({action,body});return {ok:true};},infer:()=>{throw Error('must not run');}});assert.equal(calls.length,1);assert.equal(calls[0].action,'complete');assert.equal(await outbox.read(),null);
 await assert.rejects(runOnce({receipts:receipts({phase:'started'}),request:async()=>{throw Error('must not poll');}}),/execution_needs_review/);
});
test('workers without a transcription adapter claim only summary jobs',async()=>{
 let kinds;assert.equal(await runOnce({receipts:receipts(),request:async(action,body)=>{kinds=body.kinds;return {jobs:[]};}}),false);assert.deepEqual(kinds,['report']);
});
test('selecting PC mode without transcription readiness fails closed instead of falling back to paid API',()=>{
 const {audioConfiguration}=require('../lib/interview-mock-cli-queue.cjs');
 assert.deepEqual(audioConfiguration('job',{}),{});
 assert.deepEqual(audioConfiguration('job',{INTERVIEW_JOB_EXAM_MODE:'pc'}),{mode:'pc',ready:false});
 assert.equal(audioConfiguration('job',{INTERVIEW_JOB_EXAM_MODE:'pc',INTERVIEW_MOCK_CLI_WORKER_TOKEN:'x'.repeat(43),INTERVIEW_MOCK_CLI_AUDIO_READY:'true'}).ready,true);
});
