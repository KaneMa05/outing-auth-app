'use strict';
const {norm}=require('./interview-exam-scoring');
function distance(a,b){
  let prev=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){const row=[i];for(let j=1;j<=b.length;j++)row[j]=Math.min(row[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));prev=row;}
  return prev[b.length];
}
function rate(n,d){return d?n/d:null;}
function upper95(errors,total){if(!total)return null;const z=1.96,p=errors/total;return (p+z*z/(2*total)+z*Math.sqrt(p*(1-p)/total+z*z/(4*total*total)))/(1+z*z/total);}
function summarize(samples){
  if(!Array.isArray(samples)||!samples.length)throw Error('No evaluation samples');
  const ids=new Set(),audioHashes=new Set(),pipelines=new Set();
  for(const s of samples){
    if(!s||typeof s.id!=='string'||!s.id||ids.has(s.id)||!s.report?.audit?.audioHash||audioHashes.has(s.report.audit.audioHash)||
      !['O','partial','X'].includes(s.gold)||typeof s.referenceTranscript!=='string'||!s.referenceTranscript.trim()||s.referenceTranscript.length>12000 ||
      !Array.isArray(s.tags)||s.tags.some(t=>typeof t!=='string'||!t||t.length>80)||
      !Array.isArray(s.reviewers)||new Set(s.reviewers).size<2||s.reviewers.some(r=>typeof r!=='string'||!r)||
      !['human_recording','synthetic'].includes(s.source)||!s.report.audit.pipelineHash)throw Error('Invalid, duplicate or unreviewed evaluation sample');
    const suggestion=s.report.suggestion;
    if(suggestion&&!['O','partial','X'].includes(suggestion.grade))throw Error('Invalid suggestion');
    if(s.report.grade!==null||s.report.score!==null||s.report.status!=='review_required')throw Error('Unexpected final grade in validation report');
    ids.add(s.id);audioHashes.add(s.report.audit.audioHash);pipelines.add(s.report.audit.pipelineHash);
  }
  if(pipelines.size!==1)throw Error('Do not combine different scoring pipelines');
  function group(rows){
    let proposed=0,correct=0,falseO=0,falseX=0,predictedO=0,predictedX=0,goldNotO=0,goldNotX=0,chars=0,edits=0;
    const confusion={O:{O:0,partial:0,X:0,held:0},partial:{O:0,partial:0,X:0,held:0},X:{O:0,partial:0,X:0,held:0}};
    for(const s of rows){const p=s.report.suggestion?.grade||'held';confusion[s.gold][p]++;
      if(p!=='held'){proposed++;if(p===s.gold)correct++;}
      if(p==='O'){predictedO++;if(s.gold!=='O')falseO++;}if(p==='X'){predictedX++;if(s.gold!=='X')falseX++;}
      if(s.gold!=='O')goldNotO++;if(s.gold!=='X')goldNotX++;
      const ref=Array.from(norm(s.referenceTranscript)),hyp=Array.from(norm(s.report.transcripts?.[0]||''));chars+=ref.length;edits+=distance(ref,hyp);
    }
    return {samples:rows.length,suggestions:proposed,held:rows.length-proposed,suggestionCoverage:rate(proposed,rows.length),
      suggestionAccuracy:rate(correct,proposed),correctSuggestionsOverAll:rate(correct,rows.length),
      falseO:{count:falseO,amongSuggestedO:rate(falseO,predictedO),amongGoldNotO:rate(falseO,goldNotO),upper95AmongSuggestedO:upper95(falseO,predictedO)},
      falseX:{count:falseX,amongSuggestedX:rate(falseX,predictedX),amongGoldNotX:rate(falseX,goldNotX),upper95AmongSuggestedX:upper95(falseX,predictedX)},
      characterErrorRate:rate(edits,chars),confusion};
  }
  return {schemaVersion:1,mode:'validation_only',productionApproved:false,finalAutomaticGrades:0,pipelineHash:[...pipelines][0],
    synthetic:samples.some(s=>s.source==='synthetic'),overall:group(samples),
    slices:Object.fromEntries([...new Set(samples.flatMap(s=>s.tags))].sort().map(tag=>[tag,group(samples.filter(s=>s.tags.includes(tag)))]))};
}
module.exports={summarize,distance,upper95};
