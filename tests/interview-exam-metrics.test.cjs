const assert=require('node:assert/strict');
const {summarize,distance,upper95}=require('../lib/interview-exam-metrics');
const sample=(id,gold,suggestion,extra={})=>({id,gold,source:'synthetic',reviewers:['human-a','human-b'],referenceTranscript:'VHF입니다.',tags:['약어'],
  report:{status:'review_required',grade:null,score:null,suggestion:suggestion?{grade:suggestion}:null,transcripts:['VHF입니다.'],audit:{audioHash:id,pipelineHash:'same'}},...extra});
assert.equal(distance(Array.from('가나다'),Array.from('가다')),1);
assert(upper95(0,3)>.5);assert.equal(upper95(0,0),null);
const rows=[sample('a','O','O'),sample('b','X','O'),sample('c','O',null),sample('d','partial','X')];
const result=summarize(rows);assert.equal(result.productionApproved,false);assert.equal(result.synthetic,true);assert.equal(result.finalAutomaticGrades,0);
assert.equal(result.overall.suggestionCoverage,.75);assert.equal(result.overall.suggestionAccuracy,1/3);assert.equal(result.overall.correctSuggestionsOverAll,.25);
assert.equal(result.overall.falseO.count,1);assert.equal(result.overall.falseO.amongSuggestedO,.5);assert.equal(result.overall.falseX.count,1);assert.equal(result.overall.characterErrorRate,0);
assert.equal(result.overall.confusion.O.held,1);assert.equal(result.slices['약어'].samples,4);
assert.throws(()=>summarize([...rows,rows[0]]),/duplicate/);
assert.throws(()=>summarize([sample('a','O','O',{reviewers:['a']})]),/unreviewed/);
const mixed=sample('z','O','O');mixed.report.audit.pipelineHash='other';assert.throws(()=>summarize([...rows,mixed]),/different/);
const noSuggestions=summarize([sample('a','X',null)]);assert.equal(noSuggestions.overall.suggestionAccuracy,null);assert.equal(noSuggestions.overall.falseO.amongSuggestedO,null);
console.log('PASS evaluation metrics: abstentions, false acceptance/rejection denominators, confidence bounds, slices and mixed-pipeline rejection. Synthetic fixtures only.');
