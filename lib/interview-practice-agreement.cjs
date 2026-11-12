'use strict';
// Ignore orthography only. Keep words, negation, signs, decimals and ranges.
function practiceTranscriptKey(value){return value.normalize('NFC').toLowerCase()
 .replace(/(?<!\p{N})[.,!?。！？]|[.,!?。！？](?!\p{N})/gu,'')
 .replace(/\s+/gu,' ').trim();}
function mergePracticeReports(reports,transcripts,{separateHolds=false}={}){
 const assessment=reports[0].assessment.map(row=>{
  const other=reports[1].assessment.find(r=>r.index===row.index);
  if(separateHolds&&(row.status==='uncertain'||!other||other.status!==row.status)){
   const holds=require('./interview-practice-hold-reasons.cjs');
   const causes=[row.holdReason,other?.holdReason];
   const cause=!other?'evidence_invalid':['evidence_invalid','recognition_uncertain','evaluation_uncertain'].find(c=>causes.includes(c))||'evaluation_disagreement';
   return {...holds.hold(row,cause,cause==='evaluation_disagreement'?'두 전사에서 기준 충족 판정이 다릅니다.': '이 항목을 확정할 근거가 충분하지 않습니다.'),holdReasons:[...new Set(causes.filter(Boolean).concat(cause))]};
  }
  if(row.status==='uncertain'||!other||other.status!==row.status)return {...row,status:'uncertain',quote:'',reason:'두 음성 인식 결과의 판정이 달라 이 항목은 녹음을 확인해야 합니다.'};
  return {...row,verificationQuote:other.quote};
 });
 // Uncertain wording must never become claimed fact in the general feedback.
 const shared=key=>reports[0].analysis[key].filter(f=>practiceTranscriptKey(f.quote)&&practiceTranscriptKey(transcripts[1]).includes(practiceTranscriptKey(f.quote)));
 const confirmed=assessment.filter(r=>r.status!=='uncertain').length;
 const summary=confirmed===assessment.length?`음성 인식에 일부 차이가 있지만 ${confirmed}개 항목 모두의 근거와 판정을 확인했습니다.`:
  `음성 인식 결과가 일부 달라 근거와 판정이 일치하는 ${confirmed}개 항목만 반영했습니다. 보류된 항목은 녹음을 확인해 주세요.`;
 const holdSummary=separateHolds&&confirmed<assessment.length?' '+[...new Set(assessment.filter(r=>r.status==='uncertain').map(r=>require('./interview-practice-hold-reasons.cjs').labels[r.holdReason]))].join(' · ')+': 해당 항목의 보류 사유를 확인해 주세요.':'';
 const analysis={summary:holdSummary?`근거와 판정이 일치하는 ${confirmed}개 항목을 반영했습니다.`+holdSummary:summary,
  strengths:shared('strengths'),improvements:shared('improvements'),nextPractice:shared('nextPractice')};
 return {analysis,assessment};
}
module.exports={practiceTranscriptKey,mergePracticeReports};
