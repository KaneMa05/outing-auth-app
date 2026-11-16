'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {rubricSnapshot,decide}=require('../lib/interview-exam-scoring');
const {conceptRule,aggregateConcept}=require('../lib/interview-concept-rules.cjs');
const {conceptDetail,conceptJudgment,correct,wrong,partial}=require('./helpers/interview-concept-fixture.cjs');
function score(text,j=conceptJudgment('accepted',text),d=conceptDetail(),second=j){return decide({rubric:rubricSnapshot(d),transcripts:[text,text],judgments:[j,second],audioHash:'fixture',models:{}});}
test('faithful paraphrase can satisfy a concept despite missing every reference keyword',()=>{
 const r=score(correct);assert.equal(r.suggestion.grade,'O');assert(r.keywordResults[0].keywords.every(k=>k.missing));assert.equal(r.conceptResults[0].concepts[0].evidence[0].quote,correct);assert.equal(r.grade,null);assert.equal(r.status,'review_required');
});
test('wrong relation with matching keywords is rejected; only configured critical error overrides the answer',()=>{
 const r=score(wrong,conceptJudgment('rejected',wrong,{error:'present'}));assert.equal(r.suggestion.grade,'X');assert.equal(r.keywordResults[0].literalSatisfied,true);assert.equal(r.conceptResults[0].concepts[0].status,'rejected');
});
test('reviewed partial explanation produces partial; missing partial rule abstains',()=>{
 const j=conceptJudgment('partial',partial);assert.equal(score(partial,j).suggestion.grade,'partial');
 const d=conceptDetail();d.rubric.criteria[0].assessment.concepts[0].partial='';const r=score(partial,j,d);assert.equal(r.suggestion,null);assert(r.reasons.includes('undefined_partial_credit'));
});
test('omission differs from a contradicted concept, even with reference keywords present',()=>{
 const text='면적과 압력입니다.',r=score(text,conceptJudgment('absent',text));assert.equal(r.suggestion.grade,'X');assert.equal(r.conceptResults[0].concepts[0].status,'absent');assert.equal(r.keywordResults[0].literalSatisfied,true);
});
test('all/any is server-derived and an asserted contradiction cannot be hidden by any',()=>{
 const d=conceptDetail(),a=d.rubric.criteria[0].assessment;a.concepts.push({...a.concepts[0],claim:'두 번째로 검토한 독립 개념'});
 const j=conceptJudgment('accepted',correct);j.concepts.push({index:1,status:'absent',quote:'',reason:'두 번째 설명 누락'});
 assert.equal(score(correct,j,d).suggestion.grade,'partial');a.match='any';assert.equal(score(correct,j,d).suggestion.grade,'O');
 j.concepts[1]={index:1,status:'rejected',quote:correct,reason:'가상 검증용 오류 주장'};assert.equal(score(correct,j,d).suggestion.grade,'X');
 assert.equal(aggregateConcept('any',[{status:'accepted'},{status:'uncertain'}]),'uncertain');
});
test('fake quotes, duplicated/missing indexes, invented aggregation and extra fields abstain',()=>{
 for(const mutate of [j=>j.concepts[0].quote='원문에 없는 인용',j=>j.concepts.push(j.concepts[0]),j=>j.concepts=[],j=>j.criteria.push({index:0,status:'accepted',quote:correct,reason:'모델의 임의 집계'}),j=>j.score=100]){
  const j=conceptJudgment();mutate(j);assert.equal(score(correct,j).suggestion,null);
 }
});
test('independent concept disagreement and incomplete correction require human review',()=>{
 const a=conceptJudgment(),b=conceptJudgment('partial',correct),r=score(correct,a,conceptDetail(),b);assert.equal(r.suggestion,null);assert(r.reasons.includes('judgment_disagreement'));
 const text=wrong+' 아니, '+correct,j=conceptJudgment('accepted',text);assert.equal(score(text,j).suggestion.grade,'O');
 const ambiguous=conceptJudgment('uncertain',text);assert.equal(score(text,ambiguous).suggestion,null);
});
test('same aggregate with different concept decisions still abstains',()=>{
 const d=conceptDetail(),a=d.rubric.criteria[0].assessment;a.match='any';a.concepts.push({...a.concepts[0],claim:'가상 두 번째 개념'});
 const left=conceptJudgment(),right=conceptJudgment('absent',correct);left.concepts.push({index:1,status:'absent',quote:'',reason:'두 번째 누락'});right.concepts.push({index:1,status:'accepted',quote:correct,reason:'두 번째 인정'});
 const r=score(correct,left,d,right);assert.equal(r.suggestion,null);assert(r.reasons.includes('judgment_disagreement'));assert.equal(r.conceptResults[0].status,'uncertain');
});
test('a separate required professional term is not waived by semantic acceptance',()=>{
 const d=conceptDetail();d.rubric.criteria.push({label:'전문용어 확인',terms:['압력'],context:'정확한 전문용어를 사용한다.',reject_context:'다른 용어로 혼동한다.'});
 const j=conceptJudgment();j.criteria=[{index:1,status:'absent',quote:'',reason:'필수 전문용어 미발화'}];
 assert.equal(score(correct,j,d).suggestion.grade,'partial');
 j.criteria[0]={index:1,status:'accepted',quote:correct,reason:'발화하지 않은 전문용어를 잘못 인정'};assert(score(correct,j,d).reasons.includes('missing_literal_term'));
});
test('concept shape and total limits are strict and legacy term criteria remain literal',()=>{
 for(const mutate of [a=>a.mode='freeform',a=>a.concepts[0].reject='',a=>a.concepts[0].score=1,a=>a.acceptedExamples=[''],a=>a.concepts.push({...a.concepts[0]})]){const d=conceptDetail();mutate(d.rubric.criteria[0].assessment);assert.throws(()=>rubricSnapshot(d),/rubric_not_ready/);}
 const d=conceptDetail();delete d.rubric.criteria[0].assessment;assert.equal(conceptRule(d.rubric.criteria[0]),null);
 const j={criteria:[{index:0,status:'accepted',quote:correct,reason:'키워드 없는 주장'}],errors:conceptJudgment().errors,uncertainties:[]};assert(score(correct,j,d).reasons.includes('missing_literal_term'));
});
test('concept renderer escapes rubric and evidence text and exposes both independent decisions',async()=>{
 const {renderConceptReport}=await import('../client/interview-concept-report.mjs');const r=score(correct);r.conceptResults[0].concepts[0].claim='<script>bad</script>';r.conceptResults[0].concepts[0].evidence[0].reason='<img src=x onerror=alert(1)>';
 const html=renderConceptReport(r);assert(!html.includes('<script>'));assert(!html.includes('<img '));assert(html.includes('검토 1'));assert(html.includes('검토 2'));assert(html.includes('원음'));
});
