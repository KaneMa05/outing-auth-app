(function(root,factory){
 'use strict';
 if(typeof module==='object'&&module.exports)module.exports=factory();else root.InterviewExamReview=factory();
})(typeof window==='undefined'?this:window,function(){
 'use strict';
 const VERSION=1,GRADES=['O','partial','X','held'],STATES=['accepted','partial','rejected','absent','uncertain'],ERRORS=['present','absent','uncertain'];
 const HOLD_REASONS={input_incomplete:'입력 누락·전사 불명확',rubric_ambiguous:'채점 기준이 모호함',answer_ambiguous:'답변의 주장이 불확실함'};
 const LABELS={O:'O · 정답',partial:'△ · 부분정답',X:'X · 오답',held:'보류',accepted:'충족',rejected:'틀린 설명',absent:'누락·없음',uncertain:'불확실',present:'핵심 오류 있음'};
 function items(q){return q.proposal.criteria.flatMap((c,criterionIndex)=>c.assessment.concepts.map((item,conceptIndex)=>({...item,criterionIndex,conceptIndex}))).map((item,index)=>({...item,index}));}
 function aggregate(match,rows){
  if(rows.includes('uncertain'))return 'uncertain';if(rows.includes('rejected'))return 'rejected';
  const accepted=rows.filter(s=>s==='accepted').length;
  if(match==='all'?accepted===rows.length:accepted>0)return 'accepted';
  return rows.some(s=>s==='accepted'||s==='partial')?'partial':'absent';
 }
 function expectedGrade(q,row){
  const concepts=items(q);
  if(!Array.isArray(row.concepts)||row.concepts.length!==concepts.length||row.concepts.some(s=>!STATES.includes(s))||!Array.isArray(row.errors)||row.errors.length!==q.proposal.criticalErrors.length||row.errors.some(s=>!ERRORS.includes(s)))return null;
  const statuses=q.proposal.criteria.map((criterion,index)=>aggregate(criterion.assessment.match,concepts.filter(item=>item.criterionIndex===index).map(item=>row.concepts[item.index])));
  return statuses.includes('uncertain')||row.errors.includes('uncertain')?'held':row.errors.includes('present')||!statuses.some(s=>s==='accepted'||s==='partial')?'X':statuses.every(s=>s==='accepted')?'O':'partial';
 }
 function createReview(d){return {schemaVersion:1,reviewToolVersion:VERSION,datasetHash:d.datasetHash,reviewer:'',reviewedAt:null,
  questions:d.questions.map(q=>({id:q.id,contentHash:q.contentHash,approved:false,note:'',decision:'pending'})),
  cases:d.cases.map(c=>{const q=d.questions.find(q=>q.id===c.questionId);return {id:c.id,contentHash:c.contentHash,grade:null,concepts:items(q).map(()=>null),errors:q.proposal.criticalErrors.map(()=>null),conceptQuotes:items(q).map(()=>''),errorQuotes:q.proposal.criticalErrors.map(()=>''),holdReason:'',note:''};})};}
 const validText=(s,n,optional=false)=>typeof s==='string'&&s.length<=n&&(optional||!!s.trim());
 function problems(d,r){
  const issues=[],add=(id,code,message)=>issues.push({id,code,message});
  if(!r||r.schemaVersion!==1||r.reviewToolVersion!==VERSION||r.datasetHash!==d.datasetHash||!Array.isArray(r.questions)||!Array.isArray(r.cases)){add('reviewer','invalid_review','검수 자료의 버전이나 문항 기준이 일치하지 않습니다.');return issues;}
  if(!validText(r.reviewer,120))add('reviewer','reviewer_required','검수자 이름을 입력해주세요.');
  if(r.questions.length!==d.questions.length||new Set(r.questions.map(q=>q?.id)).size!==d.questions.length||r.cases.length!==d.cases.length||new Set(r.cases.map(c=>c?.id)).size!==d.cases.length){add('reviewer','invalid_rows','문항·답변 검수 기록이 중복되거나 누락되었습니다.');return issues;}
  for(const q of d.questions){
   const row=r.questions.find(row=>row?.id===q.id);
   if(!row||row.contentHash!==q.contentHash||row.approved!==true||row.decision!=='approved'||!validText(row.note,1000))add(q.id,'question_review_required','출처와 개념 기준을 검토해 승인하고 근거를 입력해주세요. 수정이 필요한 기준은 승인하지 않습니다.');
  }
  for(const c of d.cases){
   const q=d.questions.find(q=>q.id===c.questionId),row=r.cases.find(row=>row?.id===c.id),concepts=items(q);
   if(!row||row.contentHash!==c.contentHash||!GRADES.includes(row.grade)||!validText(row.note,1000)||expectedGrade(q,row)===null){add(c.id,'case_review_required','전체 판정·개념별 판정·핵심 오류와 판단 이유를 모두 입력해주세요.');continue;}
   if(!Array.isArray(row.conceptQuotes)||row.conceptQuotes.length!==concepts.length||!Array.isArray(row.errorQuotes)||row.errorQuotes.length!==q.proposal.criticalErrors.length){add(c.id,'evidence_required','개념·핵심 오류의 근거 기록이 누락되었습니다.');continue;}
   for(const item of concepts){
    const status=row.concepts[item.index],quote=row.conceptQuotes[item.index],required=['accepted','partial','rejected'].includes(status);
    if(!validText(quote,12000,!required)||(quote&&!c.transcript.includes(quote)))add(c.id,'invalid_concept_quote','충족·부분정답·틀린 설명의 근거는 이 답변에서 그대로 인용해주세요.');
    if(status==='partial'&&!item.partial.trim())add(c.id,'undefined_partial','부분 인정 조건이 없는 개념에는 부분정답을 줄 수 없습니다.');
   }
   row.errors.forEach((status,index)=>{const quote=row.errorQuotes[index];if(!validText(quote,12000,status!=='present')||(quote&&!c.transcript.includes(quote)))add(c.id,'invalid_error_quote','핵심 오류가 있다면 이 답변에서 해당 문장을 그대로 인용해주세요.');});
   const expected=expectedGrade(q,row);
   if(row.grade==='held'){
    if(!Object.hasOwn(HOLD_REASONS,row.holdReason))add(c.id,'hold_reason_required','보류 사유를 선택해주세요. 단순히 모른다고 답한 경우는 오답으로 판정합니다.');
   }else if(row.grade!==expected)add(c.id,'grade_conflict','개념·핵심 오류 판정과 전체 판정이 다릅니다. 기준을 확인하거나 보류 사유를 남겨주세요.');
  }
  return issues;
 }
 function progress(d,r){const issues=problems(d,r),ids=new Set(issues.map(p=>p.id));return {questions:d.questions.filter(q=>!ids.has(q.id)).length,cases:d.cases.filter(c=>!ids.has(c.id)).length,totalCases:d.cases.length,issues};}
 function readReview(d,input,{reopen=true}={}){
  const fail=()=>{throw Error('invalid_review_file');},review=createReview(d);
  if(!input||input.schemaVersion!==1||input.reviewToolVersion!==VERSION||input.datasetHash!==d.datasetHash||!validText(input.reviewer,120,true)||!Array.isArray(input.questions)||input.questions.length!==review.questions.length||!Array.isArray(input.cases)||input.cases.length!==review.cases.length||new Set(input.questions.map(q=>q?.id)).size!==review.questions.length||new Set(input.cases.map(c=>c?.id)).size!==review.cases.length)fail();
  for(const q of review.questions){const row=input.questions.find(row=>row?.id===q.id);if(!row||row.contentHash!==q.contentHash||!['pending','approved','changes_requested'].includes(row.decision)||!validText(row.note,1000,true)||row.approved!==(row.decision==='approved'))fail();Object.assign(q,{decision:row.decision,approved:row.approved,note:row.note});}
  for(const c of review.cases){
   const row=input.cases.find(row=>row?.id===c.id);if(!row||row.contentHash!==c.contentHash||row.grade!==null&&!GRADES.includes(row.grade)||!validText(row.note,1000,true)||!validText(row.holdReason,100,true)||row.holdReason&&!Object.hasOwn(HOLD_REASONS,row.holdReason))fail();
   for(const field of ['concepts','errors','conceptQuotes','errorQuotes']){const labels=field==='concepts'?STATES:field==='errors'?ERRORS:null;if(!Array.isArray(row[field])||row[field].length!==c[field].length||row[field].some(value=>labels?value!==null&&!labels.includes(value):!validText(value,12000,true)))fail();c[field]=[...row[field]];}
   Object.assign(c,{grade:row.grade,note:row.note,holdReason:row.holdReason});
  }
  if(input.reviewedAt!==null&&(typeof input.reviewedAt!=='string'||!Number.isFinite(Date.parse(input.reviewedAt))))fail();
  review.reviewer=input.reviewer;review.reviewedAt=reopen?null:input.reviewedAt;return review;
 }
 function publicDataset(d){return {...d,cases:d.cases.map(({proposedGold,...row})=>row)};}
 return {VERSION,GRADES,STATES,ERRORS,HOLD_REASONS,LABELS,items,expectedGrade,createReview,problems,progress,readReview,publicDataset};
});
