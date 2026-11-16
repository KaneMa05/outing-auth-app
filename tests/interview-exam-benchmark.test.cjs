'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const b=require('../lib/interview-exam-benchmark.cjs'),plan=require('../scripts/data/interview-concept-benchmark-plan.cjs');
const {createProvider}=require('../lib/interview-exam-provider');
const {main}=require('../scripts/benchmark-interview-exam.cjs');
function fixture(){
 const source={readOnly:true,projectId:'fixture-only',capturedAt:'2026-10-30T00:00:00Z',questions:plan.topics.map(t=>({id:t.questionId,prompt:'로컬 합성 검증 질문 '+t.group,category:'job',revision:1,rubric_status:'draft',rubric_revision:1,critical_errors:t.group==='radar-reflection'?['첫 번째 가상 핵심 오류','두 번째 가상 핵심 오류']:['가상 핵심 오류'],sources:[{occurrenceId:'fixture-'+t.group,filename:'fixture.txt',sourceHash:b.hash('fixture-source'),answer:t.criteria.map(c=>c.sourceQuote).join(' '),year:2026,locator:'fixture'}]}))};
 const d=b.makeDataset(source,plan);
 // Test-only fake approvals. These never enter the real DB-derived review bundle.
 const reviews=['fixture-reviewer-a','fixture-reviewer-b'].map(reviewer=>{const r=b.reviewTemplate(d);r.reviewer=reviewer;r.reviewedAt='2026-10-30T00:00:00Z';r.questions.forEach(q=>{q.approved=true;q.note='합성 fixture 동작 검증용 기록';});r.cases.forEach(c=>{const gold=d.cases.find(x=>x.id===c.id).proposedGold;c.grade=gold.grade;c.concepts=gold.concepts;c.errors=gold.errors;c.note='모의 판정 집계 검증용이며 실제 강사 검수가 아닙니다.';});return r;});
 const config={key:'fixture-secret',ready:true,enabled:true,models:{judge:'mock-a',verifier:'mock-b',transcriber:'unused'}},options={maxCases:24,maxRequests:48,maxOutputTokens:2048,split:'development'};
 let calls=0;
 const provider=()=>({models:config.models,promptHash:'mock-prompt',promptVersion:'mock',judge:async(text,rubric)=>{calls++;const gold=d.cases.find(c=>c.transcript===text).proposedGold;return {criteria:[],concepts:gold.concepts.map((status,index)=>({index,status,quote:status==='absent'?'':text,reason:'합성 fixture의 고정 판정'})),errors:gold.errors.map((status,index)=>({index,status,quote:status==='present'?text:'',reason:'합성 fixture의 오류 상태'})),uncertainties:[]};}});
 return {source,d,reviews,config,options,provider,get calls(){return calls;}};
}
test('DB-derived preparation retains source hashes and creates no approvals or measured accuracy',()=>{
 const f=fixture();assert.equal(f.d.questions.length,3);assert.equal(f.d.cases.length,24);assert(f.d.questions.every(q=>q.sourceRubricStatus==='draft'));const r=b.reviewTemplate(f.d);assert.equal(r.reviewer,'');assert(r.questions.every(q=>!q.approved));assert(r.cases.every(c=>c.grade===null));assert(!JSON.stringify(r).includes('proposedGold'));
 assert.equal(b.reviewReadiness(f.d,[r,r]).ready,false);assert.equal(f.calls,0);
});
test('changed source, quote, rubric or case cannot reuse old approval hashes',()=>{
 const f=fixture();for(const mutate of [d=>d.questions[0].sources[0].answer+=' edited',d=>d.questions[0].proposal.criteria[0].context+=' edited',d=>d.cases[0].transcript+=' edited',d=>d.cases[0].split='holdout']){const d=structuredClone(f.d);mutate(d);assert.throws(()=>b.validateDataset(d));}
 const source=structuredClone(f.source);source.questions[0].sources[0].answer='출처 인용 없음';assert.throws(()=>b.makeDataset(source,plan),/source_quote_missing/);
 const reviews=structuredClone(f.reviews);reviews[0].datasetHash='stale';assert.equal(b.reviewReadiness(f.d,reviews).ready,false);
});
test('same question group cannot leak between development and holdout or duplicate a transcript',()=>{
 const f=fixture(),d=structuredClone(f.d),q=d.questions[0],c=d.cases[0];
 c.split='holdout';c.contentHash=b.hash({id:c.id,questionHash:q.contentHash,transcript:c.transcript,tags:c.tags,group:c.group,split:c.split});d.datasetHash=b.hash({questions:d.questions,cases:d.cases});assert.throws(()=>b.validateDataset(d),/group_split_leakage/);
 const duplicate=structuredClone(f.d);duplicate.cases.push({...duplicate.cases[0],id:'new-id'});const row=duplicate.cases.at(-1);row.contentHash=b.hash({id:row.id,questionHash:q.contentHash,transcript:row.transcript,tags:row.tags,group:row.group,split:row.split});duplicate.datasetHash=b.hash({questions:duplicate.questions,cases:duplicate.cases});assert.throws(()=>b.validateDataset(duplicate),/duplicate_input/);
});
test('two distinct independent reviews must agree on grade, concepts and critical errors',()=>{
 const f=fixture();assert.equal(b.reviewReadiness(f.d,f.reviews).ready,true);
 const same=structuredClone(f.reviews);same[1].reviewer=' FIXTURE-REVIEWER-A ';assert.equal(b.reviewReadiness(f.d,same).ready,false);
 const changed=structuredClone(f.reviews);changed[1].cases[0].grade='X';assert(b.reviewReadiness(f.d,changed).reasons.some(r=>r.startsWith('review_disagreement')));
 const inconsistent=structuredClone(f.reviews);inconsistent.forEach(r=>r.cases[0].grade='X');assert(b.reviewReadiness(f.d,inconsistent).reasons.some(r=>r.startsWith('reference_rule_conflict')));
});
test('paid execution requires settings and explicit finite case/request/output limits before any provider is created',async()=>{
 const f=fixture();for(const options of [{...f.options,maxCases:1},{...f.options,maxRequests:1},{...f.options,maxOutputTokens:undefined}]){let created=0;await assert.rejects(b.runBenchmark({dataset:f.d,reviews:f.reviews,config:f.config,options,createProvider:()=>{created++;return f.provider();},checkpoint:async()=>{}}),/benchmark_not_ready/);assert.equal(created,0);}
 assert(!b.planRun(f.d,f.reviews,{...f.config,key:null},f.options).ready);assert(!b.planRun(f.d,f.reviews,{...f.config,models:{judge:'same',verifier:'same'}},f.options).ready);
 await assert.rejects(b.runBenchmark({dataset:f.d,reviews:f.reviews,config:f.config,options:f.options,createProvider:f.provider}),/checkpoint_required/);
});
test('valid mocked execution checkpoints before requests, never calls ASR and reports coverage plus semantic slices',async()=>{
 const f=fixture(),checkpoints=[];const r=await b.runBenchmark({dataset:f.d,reviews:f.reviews,config:f.config,options:f.options,createProvider:f.provider,checkpoint:async value=>{checkpoints.push({calls:f.calls,value:structuredClone(value)});}});
 assert.equal(r.status,'completed');assert.equal(f.calls,48);assert.equal(checkpoints[1].calls,0);assert.equal(checkpoints[1].value.results[0].state,'processing');assert.equal(r.asrEvaluated,false);assert.equal(r.metrics.productionApproved,false);assert.equal(r.metrics.reviewIdentityVerified,false);
 assert.equal(r.metrics.overall.samples,24);assert.equal(r.metrics.overall.held,3);assert.equal(r.metrics.overall.suggestionCoverage,21/24);assert.equal(r.metrics.overall.falseO.count,0);assert(r.metrics.overall.falseO.upper95AmongSuggestedO>0);assert.equal(r.metrics.overall.conceptConfusion.accepted.accepted>0,true);
 assert.equal(r.results[0].report.audit.audioHash,undefined);assert.equal(r.metrics.overall.characterErrorRate,undefined);assert(r.metrics.slices['키워드 있는 오답']);
});
test('lost/failed provider response waits for both calls then stops with unknown; no retry or misleading metrics',async()=>{
 const f=fixture();let calls=0,settled=false;const result=await b.runBenchmark({dataset:f.d,reviews:f.reviews,config:f.config,options:f.options,createProvider:()=>({...f.provider(),judge:async(_t,_r,pass)=>{calls++;if(pass===0)throw Error('private-api-key-must-not-appear');await new Promise(resolve=>setImmediate(resolve));settled=true;return {};}}),checkpoint:async()=>{}});
 assert(settled);assert.equal(calls,2);assert.equal(result.status,'stopped');assert.equal(result.results[0].state,'unknown');assert.equal(result.metrics,undefined);assert(!JSON.stringify(result).includes('private-api-key'));
});
test('always abstaining has zero coverage and no suggested accuracy',async()=>{
 const f=fixture(),r=await b.runBenchmark({dataset:f.d,reviews:f.reviews,config:f.config,options:f.options,createProvider:()=>({...f.provider(),judge:async(text,rubric)=>({...await f.provider().judge(text,rubric),uncertainties:['모의 검사: 모든 답변 보류']})}),checkpoint:async()=>{}});
 assert.equal(r.metrics.overall.suggestionCoverage,0);assert.equal(r.metrics.overall.suggestionAccuracy,null);assert.equal(r.metrics.overall.correctSuggestionsOverKnownReferences,0);assert.equal(r.metrics.overall.heldRate,1);
});
test('forced acceptance counts wrong O including human holds in explicit denominators',async()=>{
 const f=fixture(),r=await b.runBenchmark({dataset:f.d,reviews:f.reviews,config:f.config,options:f.options,createProvider:()=>({...f.provider(),judge:async(text,rubric)=>({criteria:[],concepts:require('../lib/interview-concept-rules.cjs').conceptItems(rubric).map(item=>({index:item.index,status:'accepted',quote:text,reason:'모의 검사: 잘못된 전체 인정'})),errors:rubric.criticalErrors.map((_,index)=>({index,status:'absent',quote:'',reason:'모의 오류 없음'})),uncertainties:[]})}),checkpoint:async()=>{}});
 const expected=f.d.cases.filter(c=>c.proposedGold.grade!=='O').length;
 assert.equal(r.metrics.overall.falseO.count,expected);assert.equal(r.metrics.overall.falseO.amongSuggestedO,expected/24);assert.equal(r.metrics.overall.falseO.amongGoldNotO,1);assert.equal(r.metrics.overall.suggestionCoverage,1);assert.equal(r.metrics.overall.falseX.amongSuggestedX,null);
});
test('checkpoint failure before inference makes zero model calls',async()=>{
 const f=fixture();await assert.rejects(b.runBenchmark({dataset:f.d,reviews:f.reviews,config:f.config,options:f.options,createProvider:f.provider,checkpoint:async()=>{throw Error('disk_full');}}),/disk_full/);assert.equal(f.calls,0);
});
test('summary rejects edited grades, altered reviewers, source snapshots and mixed pipelines',async()=>{
 const f=fixture(),r=await b.runBenchmark({dataset:f.d,reviews:f.reviews,config:f.config,options:f.options,createProvider:f.provider,checkpoint:async()=>{}});
 for(const mutate of [v=>v.results[0].report.suggestion.grade='X',v=>v.results[0].report.audit.pipelineHash='other',v=>v.results[0].report.rubric.criteria[0].context='changed',v=>v.results.pop()]){const changed=structuredClone(r);mutate(changed);assert.throws(()=>b.summarizeBenchmark(f.d,f.reviews,changed));}
 const reviews=structuredClone(f.reviews);reviews[0].cases[0].note+=' changed';assert.throws(()=>b.summarizeBenchmark(f.d,reviews,r),/review_changed/);
});
test('CLI check is read-only, blocked run creates no output, and a completed run directory cannot be reused',async t=>{
 const f=fixture(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'exam-benchmark-cli-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 for(const [name,value] of [['dataset',f.d],['a',f.reviews[0]],['b',f.reviews[1]]])fs.writeFileSync(path.join(dir,name+'.json'),JSON.stringify(value));
 const args=['--dataset',path.join(dir,'dataset.json'),'--review-a',path.join(dir,'a.json'),'--review-b',path.join(dir,'b.json'),'--max-cases','24','--max-requests','48','--max-output-tokens','2048'];
 let created=0;const factory=()=>{created++;return f.provider();};const blocked=await main(['run',...args,'--execute','--out',path.join(dir,'blocked')],{environment:{},providerFactory:factory});assert.equal(blocked.status,'blocked');assert(!fs.existsSync(path.join(dir,'blocked')));assert.equal(created,0);
 const environment={OPENAI_API_KEY:'test-secret',INTERVIEW_EXAM_JUDGE_MODEL:'mock-a',INTERVIEW_EXAM_VERIFIER_MODEL:'mock-b'};
 const check=await main(['check',...args],{environment,providerFactory:factory});assert.equal(check.actualApiRequests,0);assert.equal(created,0);assert(!JSON.stringify(check).includes('test-secret'));
 const output=path.join(dir,'run'),done=await main(['run',...args,'--execute','--out',output],{environment,providerFactory:factory});assert.equal(done.status,'completed');assert.equal(created,1);
 await assert.rejects(main(['run',...args,'--execute','--out',output],{environment,providerFactory:factory}),/exist/);assert.equal(created,1);
 await assert.rejects(main(['run',...args,'--out',path.join(dir,'missing-execute')],{environment,providerFactory:factory}),/explicit_execute/);
});
test('provider output cap is optional for production and enforced for benchmark requests',async()=>{
 const f=fixture();assert.throws(()=>createProvider({config:f.config,maxOutputTokens:0}),/invalid_output_cap/);let cap;
 const p=createProvider({config:f.config,maxOutputTokens:1024,fetchImpl:async(_url,options)=>{cap=JSON.parse(options.body).max_output_tokens;return {ok:true,text:async()=>JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'{}'}]}]})};}});
 await p.judge('검증 문장',{question:'검증 질문',criteria:[],criticalErrors:[]},0);assert.equal(cap,1024);
});
test('review HTML escapes all database and case content',()=>{
 const f=fixture(),d=structuredClone(f.d);d.questions[0].question.prompt='<script>unsafe</script>';d.cases[0].transcript='<img src=x onerror=alert(1)>';
 const html=require('../scripts/benchmark-interview-exam.cjs').reviewHtml(d);assert(!html.includes('<script>'));assert(!html.includes('<img '));assert(html.includes('&lt;script&gt;'));
});
