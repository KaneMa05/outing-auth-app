'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {validateAnalysis,analyzeAudio,INSTRUCTIONS,VERSION}=require('../lib/interview-personality-analysis.cjs');
const {configuration,createProvider}=require('../lib/interview-personality-provider.cjs');
const {parts,transcript,question,analysis,provider}=require('./helpers/interview-personality-fixture.cjs');
const {wav}=require('./interview-exam.test.cjs');
test('four elements have exact evidence, presence and quality plus independently derived order',()=>{
 const value=validateAnalysis(analysis(),transcript);assert.equal(value.components.length,4);assert.equal(value.order.status,'expected');assert.equal(value.experienceEvidence.action.present,true);for(const c of value.components)assert.equal(transcript.slice(c.span.start,c.span.end),c.quote);
});
test('missing experience is distinguished from thin content and absent evidence is never invented',()=>{
 const value=analysis();value.components.experience={presence:'missing',quality:'not_assessable',quote:'',feedback:'본인이 한 행동과 결과를 추가해주세요.'};value.experienceEvidence={situation:'',action:'',result:''};value.connections.slice(1).forEach(c=>{c.status='uncertain';c.quote='';});
 const checked=validateAnalysis(value,[parts[0],parts[1],parts[3]].join(' '));assert.equal(checked.components[2].presence,'missing');assert.equal(checked.experienceEvidence.action.present,false);
 const thin=analysis();thin.components.experience.quality='insufficient';assert.equal(validateAnalysis(thin,transcript).components[2].quality,'insufficient');
});
test('spoken order and ambiguous repeated evidence are derived from transcript positions',()=>{
 const value=analysis();value.connections.forEach(c=>{c.status='uncertain';c.quote='';});
 const checked=validateAnalysis(value,[parts[2],parts[0],parts[1],parts[3]].join(' '));assert.equal(checked.order.status,'off_order');assert.equal(checked.order.sequence[0],'experience');
 assert.equal(validateAnalysis(analysis(),transcript+' '+parts[0]).order.status,'uncertain');
});
test('unsupported quotes, omitted fields, duplicate connections and score injection are rejected',()=>{
 for(const change of [a=>a.components.reason.quote='발화하지 않은 원문',a=>delete a.components.closing,a=>a.connections[1]=a.connections[0],a=>a.score=100,a=>a.components.conclusion.presence='missing',a=>a.experienceEvidence.action='원문에 없는 행동']){
  const value=analysis();change(value);assert.throws(()=>validateAnalysis(value,transcript),/invalid_|inconsistent_/);
 }
});
test('repetition/contradiction feedback must identify two real nonoverlapping spans',()=>{
 const value=analysis();value.issues=[{kind:'repetition',firstQuote:parts[0],secondQuote:parts[0],feedback:'같은 결론 반복을 줄여주세요.'}];const checked=validateAnalysis(value,transcript+' '+parts[0]);assert.ok(checked.issues[0].secondSpan.start>checked.issues[0].firstSpan.start);
 value.issues[0].secondQuote='없는 두 번째 문장';assert.throws(()=>validateAnalysis(value,transcript),/invalid_evidence/);
});
test('real pipeline abstains on silence, differing transcripts, bad evidence and analysis failure',async()=>{
 let calls=0;const quiet=await analyzeAudio({audio:wav(0),question,provider:provider({transcribe:async()=>{calls++;return transcript;}})});assert.equal(calls,0);assert.equal(quiet.status,'review_required');
 const disagree=await analyzeAudio({audio:wav(),question,provider:provider({transcribe:async(_,pass)=>pass?'다른 답변':transcript,analyze:async()=>{calls++;return analysis();}})});assert.equal(calls,0);assert.ok(disagree.reasons.includes('transcript_disagreement'));
 const invalid=await analyzeAudio({audio:wav(),question,provider:provider({analyze:async()=>{const a=analysis();a.components.reason.quote='없는 인용';return a;}})});assert.equal(invalid.analysis,null);assert.equal(invalid.grade,null);assert.ok(invalid.reasons.includes('invalid_evidence'));
 const failed=await analyzeAudio({audio:wav(),question,provider:provider({analyze:async()=>{throw Error('failure');}})});assert.ok(failed.reasons.includes('analysis_failed'));
 const good=await analyzeAudio({audio:wav(),question,provider:provider()});assert.equal(good.status,'practice_feedback');assert.equal(good.score,null);assert.equal(good.audit.version,VERSION);
});
test('provider uses strict Responses output, no tools and no previous transcript in ASR',async()=>{
 const config={enabled:true,ready:true,key:'server-only-test',models:{transcriber:'gpt-transcribe',analyzer:'configured-test-model'}},calls=[];
 const p=createProvider({config,fetchImpl:async(url,options)=>{calls.push({url,options});return {ok:true,text:async()=>JSON.stringify(url.endsWith('transcriptions')?{text:transcript}:{status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(analysis())}]}]})};}});
 await p.transcribe(wav(),0);await p.analyze(transcript,question);assert.equal(calls[0].options.body.get('prompt'),null);const body=JSON.parse(calls[1].options.body);assert.equal(body.store,false);assert.equal(body.text.format.strict,true);assert.equal(body.tools,undefined);assert.equal(body.text.format.schema.additionalProperties,false);assert.ok(INSTRUCTIONS.includes('합격 가능성'));
 assert.equal(configuration({}).ready,false);
});
test('provider refusal and incomplete output cause no automatic retry',async()=>{
 for(const value of [{status:'incomplete',output:[]},{status:'completed',output:[{type:'message',content:[{type:'refusal',refusal:'no'}]}]}]){
  let calls=0;const p=createProvider({config:{enabled:true,ready:true,key:'test',models:{analyzer:'test'}},fetchImpl:async()=>{calls++;return {ok:true,text:async()=>JSON.stringify(value)};}});await assert.rejects(p.analyze(transcript,question),/analysis_unavailable/);assert.equal(calls,1);
 }
});
