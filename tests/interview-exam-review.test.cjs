'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const benchmark=require('../lib/interview-exam-benchmark.cjs'),model=require('../lib/interview-exam-review-model.js'),plan=require('../scripts/data/interview-concept-benchmark-plan.cjs');
const {main}=require('../scripts/benchmark-interview-exam.cjs'),{renderReview}=require('../scripts/render-interview-exam-review.cjs');
function fixture(){
 const source={readOnly:true,projectId:'fixture-review-only',capturedAt:'2026-10-30T00:00:00Z',questions:plan.topics.map(topic=>({id:topic.questionId,prompt:'합성 검수 fixture '+topic.group,category:'job',revision:1,rubric_status:'draft',rubric_revision:1,
  critical_errors:topic.cases[0].proposedGold.errors.map((_,index)=>'가상 핵심 오류 '+index),sources:[{occurrenceId:'fixture-'+topic.group,filename:'fixture.txt',sourceHash:benchmark.hash('fixture'),answer:topic.criteria.map(c=>c.sourceQuote).join(' '),year:2026,locator:'fixture'}]}))};
 const d=benchmark.makeDataset(source,plan),review=model.createReview(d);review.reviewer='fixture-reviewer-a';review.reviewedAt='2026-10-30T00:00:00Z';
 review.questions.forEach(q=>{q.decision='approved';q.approved=true;q.note='테스트 전용 가상 승인입니다.';});
 review.cases.forEach(row=>{const c=d.cases.find(c=>c.id===row.id),gold=c.proposedGold;Object.assign(row,{grade:gold.grade,concepts:gold.concepts,errors:gold.errors,note:'모의 동작 검증이며 강사의 실제 판정이 아닙니다.',holdReason:gold.grade==='held'?'answer_ambiguous':'',conceptQuotes:gold.concepts.map(s=>['accepted','partial','rejected'].includes(s)?c.transcript:''),errorQuotes:gold.errors.map(s=>s==='present'?c.transcript:'')});});
 return {d,review,source};
}
test('review starts with no approvals, labels, evidence or actual human identities',()=>{
 const {d}=fixture(),r=model.createReview(d);assert.equal(r.reviewer,'');assert.equal(r.reviewedAt,null);assert(r.questions.every(q=>!q.approved));assert(r.cases.every(c=>c.grade===null&&c.concepts.every(s=>s===null)));assert(model.problems(d,r).length>0);assert.equal(model.progress(d,r).cases,0);
});
test('all example grades, concept evidence and explicit holds round-trip into the existing evaluator',()=>{
 const {d,review}=fixture();assert.deepEqual(model.problems(d,review),[]);assert.equal(model.progress(d,review).cases,24);
 const second=structuredClone(review);second.reviewer='fixture-reviewer-b';assert(benchmark.reviewReadiness(d,[review,second]).ready);
 for(const c of d.cases){const row=review.cases.find(row=>row.id===c.id);assert.equal(model.expectedGrade(d.questions.find(q=>q.id===c.questionId),row),c.proposedGold.grade);}
});
test('quotes must be from the answer; partial and critical-error rules cannot be silently waived',()=>{
 const {d,review}=fixture();for(const [change,code] of [
  [r=>r.cases[0].conceptQuotes[0]='전사문에 없는 만들어낸 근거','invalid_concept_quote'],
  [r=>r.cases[0].conceptQuotes[0]='','invalid_concept_quote'],
  [r=>r.cases.find(c=>c.id==='radar-wrong-medium').errorQuotes[0]='','invalid_error_quote'],
  [r=>r.cases.find(c=>c.id==='ais-partial-info').concepts[1]='partial','undefined_partial'],
  [r=>r.cases.find(c=>c.id==='ais-critical-error').grade='O','grade_conflict'],
  [r=>r.cases.find(c=>c.id==='radar-ambiguous').holdReason='','hold_reason_required'],
  [r=>{r.questions[0].decision='changes_requested';r.questions[0].approved=false;},'question_review_required']
 ]){const r=structuredClone(review);change(r);assert(model.problems(d,r).some(issue=>issue.code===code),code);const second=structuredClone(r);second.reviewer='fixture-reviewer-b';assert(!benchmark.reviewReadiness(d,[r,second]).ready);}
});
test('plain lack of knowledge is X, whereas a human hold requires an explicit explanation',()=>{
 const {d,review}=fixture(),noAnswer=review.cases.find(c=>c.id==='plot-no-answer');assert.equal(noAnswer.grade,'X');const q=d.questions.find(q=>q.id===d.cases.find(c=>c.id===noAnswer.id).questionId);assert.equal(model.expectedGrade(q,noAnswer),'X');
 noAnswer.grade='held';noAnswer.holdReason='';assert(model.problems(d,review).some(p=>p.id===noAnswer.id&&p.code==='hold_reason_required'));
});
test('all and any use the same contradiction and uncertainty boundaries as the scoring engine',()=>{
 const q=structuredClone(fixture().d.questions[0]);q.proposal.criteria[0].assessment.concepts.push({...q.proposal.criteria[0].assessment.concepts[0],claim:'두 번째 개념'});
 const row={concepts:['accepted','absent'],errors:q.proposal.criticalErrors.map(()=> 'absent')};
 assert.equal(model.expectedGrade(q,row),'partial');q.proposal.criteria[0].assessment.match='any';assert.equal(model.expectedGrade(q,row),'O');
 row.concepts[1]='rejected';assert.equal(model.expectedGrade(q,row),'X');row.concepts[1]='uncertain';assert.equal(model.expectedGrade(q,row),'held');
});
test('reviewed records reopen as drafts when imported, while recovery preserves a saved completion',()=>{
 const {d,review}=fixture();assert.equal(model.readReview(d,review).reviewedAt,null);assert.equal(model.readReview(d,review,{reopen:false}).reviewedAt,review.reviewedAt);
 for(const mutate of [r=>r.datasetHash='other',r=>r.cases[0].contentHash='old',r=>r.cases[0].concepts=['invalid'],r=>r.cases[0].conceptQuotes=[null],r=>r.cases.pop(),r=>r.questions[0].approved=false,r=>r.cases[0].holdReason='made-up']){const r=structuredClone(review);mutate(r);assert.throws(()=>model.readReview(d,r),/invalid_review_file/);}
});
test('the review page removes designer gold and treats all DB content as inert data',()=>{
 const f=fixture();f.source.questions[0].prompt='</script><img src=x onerror=alert(1)>';const d=benchmark.makeDataset(f.source,plan),html=renderReview(d);
 const payload=JSON.parse(html.match(/id="review-dataset">([\s\S]*?)<\/script>/)[1]);assert(payload.cases.every(c=>!Object.hasOwn(c,'proposedGold')));assert(!html.includes('</script><img'));assert(html.includes('\\u003c/script>'));assert(html.includes("connect-src 'none'"));assert(html.includes('indexedDB.open'));assert(!html.includes('src="https://'));
});
test('HTML generation requires a new destination and never calls a provider or changes source reviews',async t=>{
 const {d}=fixture(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'exam-review-test-'));t.after(()=>fs.rmSync(dir,{force:true,recursive:true}));const dataset=path.join(dir,'dataset.json'),out=path.join(dir,'workspace.html');fs.writeFileSync(dataset,JSON.stringify(d));
 const args=['review','--dataset',dataset,'--out',out],result=await main(args,{environment:{},providerFactory:()=>{throw Error('no AI allowed');}});assert.equal(result.actualApiRequests,0);assert(fs.readFileSync(out,'utf8').includes('전체 검수 끝내기'));const original=fs.readFileSync(out);await assert.rejects(main(args,{environment:{}}),/exist/);assert.deepEqual(fs.readFileSync(out),original);
});
