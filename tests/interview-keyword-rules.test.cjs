'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {detail,judgment,answer}=require('./interview-exam.test.cjs');
const {rubricSnapshot,decide}=require('../lib/interview-exam-scoring');
const {keywordRule}=require('../lib/interview-keyword-rules.cjs');
function grouped(match='all'){
 const d=detail();d.rubric.criteria=[{label:'통신과 보고',match,keywords:[{term:'VHF',aliases:['브이에이치에프']},{term:'상황실',aliases:['상황센터']}],terms:['VHF','브이에이치에프','상황실','상황센터'],context:'VHF로 상황실에 보고한다.',reject_context:'통신 수단이나 보고 대상을 부정함'}];return d;
}
function result(d,text,status){const j=judgment([status],'absent',text);return decide({rubric:rubricSnapshot(d),transcripts:[text,text],judgments:[j,j],audioHash:'test',models:{}});}
test('all requires every keyword but only one approved alias per keyword',()=>{
 const text='브이에이치에프로 상황센터에 보고합니다.',r=result(grouped(),text,'accepted');assert.equal(r.suggestion.grade,'O');assert.equal(r.keywordResults[0].keywords[0].matched[0],'브이에이치에프');
 const missing=result(grouped(),'VHF를 사용합니다.','accepted');assert.equal(missing.suggestion,null);assert.ok(missing.reasons.includes('missing_literal_term'));assert.equal(missing.keywordResults[0].keywords[1].missing,true);
 assert.equal(result(grouped(),'VHF를 사용합니다.','rejected').suggestion.grade,'X');
});
test('any accepts one group; legacy alternatives retain OR behavior',()=>{
 assert.equal(result(grouped('any'),'VHF를 사용합니다.','accepted').suggestion.grade,'O');
 const d=detail(),j=judgment();assert.equal(decide({rubric:rubricSnapshot(d),transcripts:[answer,answer],judgments:[j,j],models:{}}).suggestion.grade,'O');
});
test('negation, exact evidence, unregistered synonyms and mixed judge decisions remain guarded',()=>{
 assert.equal(result(grouped(),'VHF로 상황실에 보고하지 않습니다.','rejected').suggestion.grade,'X');
 assert.equal(result(grouped(),'무전기로 상황실에 보고합니다.','accepted').suggestion,null);
 const d=grouped(),text='VHF로 상황실에 보고합니다.',j=judgment(['accepted'],'absent','상황실에 보고합니다.');
 assert.ok(decide({rubric:rubricSnapshot(d),transcripts:[text,text],judgments:[j,j],models:{}}).reasons.includes('missing_literal_term'));
});
test('invalid modes, inconsistent flattening and overlapping aliases cannot be approved',()=>{
 for(const change of [c=>c.match='some',c=>c.terms.pop(),c=>c.keywords[1].aliases.push('vhf'),c=>c.keywords[0].aliases.push(''),c=>c.keywords=[]]){
  const d=grouped();change(d.rubric.criteria[0]);assert.throws(()=>rubricSnapshot(d),/rubric_not_ready/);
 }
 const c=grouped().rubric.criteria[0];assert.equal(keywordRule(c).match,'all');
});
module.exports={grouped};
