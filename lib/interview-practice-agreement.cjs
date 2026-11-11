'use strict';
// Ignore orthography only. Keep words, negation, signs, decimals and ranges.
function practiceTranscriptKey(value){return value.normalize('NFC').toLowerCase()
 .replace(/(?<!\p{N})[.,!?。！？]|[.,!?。！？](?!\p{N})/gu,'')
 .replace(/\s+/gu,' ').trim();}
function mergePracticeReports(reports,transcripts){
 const assessment=reports[0].assessment.map(row=>{
  const other=reports[1].assessment.find(r=>r.index===row.index);
  if(row.status==='uncertain'||!other||other.status!==row.status)return {...row,status:'uncertain',quote:'',reason:'두 음성 인식 결과의 판정이 달라 이 항목은 녹음을 확인해야 합니다.'};
  return {...row,verificationQuote:other.quote};
 });
 // Uncertain wording must never become claimed fact in the general feedback.
 const shared=key=>reports[0].analysis[key].filter(f=>practiceTranscriptKey(f.quote)&&practiceTranscriptKey(transcripts[1]).includes(practiceTranscriptKey(f.quote)));
 const confirmed=assessment.filter(r=>r.status!=='uncertain').length;
 const analysis={summary:`음성 인식 결과가 일부 달라 근거와 판정이 일치하는 ${confirmed}개 항목만 반영했습니다. 보류된 항목은 녹음을 확인해 주세요.`,
  strengths:shared('strengths'),improvements:shared('improvements'),nextPractice:shared('nextPractice')};
 return {analysis,assessment};
}
module.exports={practiceTranscriptKey,mergePracticeReports};
