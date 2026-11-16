'use strict';
// Transcript-only semantic evaluation. Never publishes grades or mutates a DB.
const {digest,rubricSnapshot,decide,VERSION,norm}=require('./interview-exam-scoring');
const {keywordRule}=require('./interview-keyword-rules.cjs');
const {validateConceptCriteria,conceptItems,aggregateConcept}=require('./interview-concept-rules.cjs');
const {upper95}=require('./interview-exam-metrics');
const reviewModel=require('./interview-exam-review-model.js');
const GRADES=['O','partial','X','held'],STATES=['accepted','partial','rejected','absent','uncertain'];
const text=(s,n)=>typeof s==='string'&&!!s.trim()&&s.length<=n;
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const hash=v=>digest(JSON.stringify(canonical(v)));
const check=(ok,code)=>{if(!ok)throw Object.assign(Error(code),{code});};
const questionHash=q=>hash({id:q.id,question:q.question,proposal:q.proposal,sources:q.sources,sourceRubricStatus:q.sourceRubricStatus});
const caseHash=(c,q)=>hash({id:c.id,questionHash:q.contentHash,transcript:c.transcript,tags:c.tags,group:c.group,split:c.split});
function makeDataset(snapshot,plan){
 check(snapshot?.readOnly===true&&Array.isArray(snapshot.questions)&&Array.isArray(plan.topics),'invalid_source_snapshot');
 const questions=plan.topics.map(topic=>{
  const source=snapshot.questions.find(q=>q.id===topic.questionId);check(source&&source.category==='job'&&Array.isArray(source.sources)&&source.sources.length,'source_question_missing');
  for(const row of topic.criteria){check(text(row.sourceQuote,2000)&&source.sources.some(s=>s.answer.includes(row.sourceQuote)),'source_quote_missing');}
  const criteria=topic.criteria.map(({criterion})=>structuredClone(criterion));
  const q={id:source.id,group:topic.group,question:{id:source.id,prompt:source.prompt,category:'job',revision:source.revision},
   proposal:{criteria,criticalErrors:structuredClone(source.critical_errors||[]),sourceQuotes:topic.criteria.map(c=>c.sourceQuote)},
   sourceRubricStatus:source.rubric_status,sourceRubricRevision:source.rubric_revision,
   sources:source.sources.map(s=>({...s,answerHash:hash(s.answer)}))};q.contentHash=questionHash(q);return q;
 });
 const cases=plan.topics.flatMap(topic=>topic.cases.map(c=>{const row={...structuredClone(c),questionId:topic.questionId,group:topic.group,split:'development'};row.contentHash=caseHash(row,questions.find(q=>q.id===row.questionId));return row;}));
 const dataset={schemaVersion:1,stage:'transcript_only',origin:'database_explanation_with_unreviewed_designer_cases',projectId:snapshot.projectId,capturedAt:snapshot.capturedAt,productionApproved:false,questions,cases};
 dataset.datasetHash=hash({questions,cases});validateDataset(dataset);return dataset;
}
function validateDataset(d){
 check(d?.schemaVersion===1&&d.stage==='transcript_only'&&d.origin==='database_explanation_with_unreviewed_designer_cases'&&d.productionApproved===false&&Array.isArray(d.questions)&&d.questions.length>0&&d.questions.length<=100&&Array.isArray(d.cases)&&d.cases.length>0&&d.cases.length<=200,'invalid_benchmark');
 const ids=new Set(),questions=new Map(),groups=new Map(),inputs=new Set();
 for(const q of d.questions){
  check(text(q.id,120)&&!questions.has(q.id)&&q.question?.id===q.id&&text(q.question.prompt,4000)&&Number.isInteger(q.question.revision)&&q.question.revision>0&&q.contentHash===questionHash(q),'invalid_question_hash');
  check(Array.isArray(q.proposal?.criteria)&&q.proposal.criteria.length>0&&q.proposal.criteria.length<=20&&Array.isArray(q.proposal.criticalErrors)&&q.proposal.criticalErrors.length>0&&q.proposal.criticalErrors.length<=20&&q.proposal.criticalErrors.every(e=>text(e,2000)),'invalid_proposal');
  for(const c of q.proposal.criteria){check(text(c.label,200)&&text(c.context,2000)&&text(c.reject_context,2000)&&c.assessment?.mode==='concept','invalid_proposal');keywordRule(c);}validateConceptCriteria(q.proposal.criteria);
  check(Array.isArray(q.sources)&&q.sources.length>0&&q.sources.every(s=>text(s.answer,20000)&&text(s.sourceHash,100)&&s.answerHash===hash(s.answer)),'invalid_source_hash');
  check(Array.isArray(q.proposal.sourceQuotes)&&q.proposal.sourceQuotes.length===q.proposal.criteria.length&&q.proposal.sourceQuotes.every(quote=>text(quote,2000)&&q.sources.some(s=>s.answer.includes(quote))),'source_quote_missing');questions.set(q.id,q);
 }
 for(const c of d.cases){
  const q=questions.get(c.questionId);check(q&&text(c.id,120)&&!ids.has(c.id)&&text(c.transcript,12000)&&text(c.group,120)&&['development','holdout'].includes(c.split)&&c.group===q.group&&Array.isArray(c.tags)&&c.tags.length>0&&c.tags.every(t=>text(t,80))&&c.contentHash===caseHash(c,q),'invalid_case');
  check(!groups.has(c.group)||groups.get(c.group)===c.split,'group_split_leakage');groups.set(c.group,c.split);
  const input=q.id+':'+hash(norm(c.transcript));check(!inputs.has(input),'duplicate_input');inputs.add(input);ids.add(c.id);
 }
 check(d.datasetHash===hash({questions:d.questions,cases:d.cases}),'invalid_dataset_hash');return d;
}
function reviewTemplate(d){
 validateDataset(d);return {schemaVersion:1,datasetHash:d.datasetHash,reviewer:'',reviewedAt:null,
  note:'사람이 출처·기준과 각 답변을 독립 검수해 입력합니다. 이름 기입은 신원 인증을 대신하지 않습니다.',
  questions:d.questions.map(q=>({id:q.id,contentHash:q.contentHash,approved:false,note:''})),
  cases:d.cases.map(c=>({id:c.id,contentHash:c.contentHash,grade:null,concepts:null,errors:null,note:''}))};
}
function selectCases(d,{split='development',caseIds}={}){
 validateDataset(d);check(['development','holdout'].includes(split),'invalid_split');
 if(caseIds)check(Array.isArray(caseIds)&&caseIds.length>0&&new Set(caseIds).size===caseIds.length&&caseIds.every(id=>d.cases.some(c=>c.id===id&&c.split===split)),'invalid_case_selection');
 const rows=d.cases.filter(c=>c.split===split&&(!caseIds||caseIds.includes(c.id)));check(rows.length>0,'empty_selection');return rows;
}
function reviewReadiness(d,reviews,cases=d.cases){
 validateDataset(d);const reasons=[],gold=new Map(),details=new Map();
 if(!Array.isArray(reviews)||reviews.length<2)return {ready:false,reasons:['two_independent_reviews_required'],gold,details};
 const seen=new Set();
 for(const r of reviews){
  const key=typeof r.reviewer==='string'?r.reviewer.normalize('NFC').trim().toLowerCase():'';
  if(!text(r.reviewer,120)||!r.reviewedAt||!Number.isFinite(Date.parse(r.reviewedAt))){reasons.push('review_incomplete');continue;}
  if(seen.has(key)){reasons.push('reviewers_not_distinct');continue;}seen.add(key);
  if(r.datasetHash!==d.datasetHash){reasons.push('review_hash_mismatch');continue;}
  if(r.reviewToolVersion!==undefined&&reviewModel.problems(d,r).length){reasons.push('review_evidence_or_rules_invalid');continue;}
  if(!Array.isArray(r.questions)||!Array.isArray(r.cases)||new Set(r.questions.map(x=>x.id)).size!==r.questions.length||new Set(r.cases.map(x=>x.id)).size!==r.cases.length){reasons.push('invalid_review_structure');continue;}
 }
 if(reasons.length)return {ready:false,reasons,gold,details};
 for(const q of d.questions.filter(q=>cases.some(c=>c.questionId===q.id))){
  const entries=reviews.map(r=>r.questions.find(x=>x.id===q.id));
  if(entries.some(r=>!r||r.contentHash!==q.contentHash||r.approved!==true||!text(r.note,1000))){reasons.push('rubric_review_required:'+q.id);continue;}
  details.set(q.id,{stale:false,question:q.question,rubric:{question_id:q.id,source_prompt:q.question.prompt,source_category:'job',revision:q.sourceRubricRevision||1,kind:'job_knowledge',status:'reviewed',criteria:q.proposal.criteria,critical_errors:q.proposal.criticalErrors,
   verification_note:'로컬 검증 세트의 검수 기록이며 운영 DB 승인이나 학생 성적 확정이 아닙니다. '+entries.map(e=>e.note.slice(0,400)).join(' / '),reviewer:'benchmark-reviews:'+hash(reviews.map(r=>r.reviewer)).slice(0,32),reviewed_at:reviews.map(r=>r.reviewedAt).sort().at(-1),score_map:{O:1,partial:0.5,X:0}}});
 }
 for(const c of cases){
  const q=d.questions.find(q=>q.id===c.questionId),count=conceptItems({criteria:q.proposal.criteria}).length;
  const entries=reviews.map(r=>r.cases.find(x=>x.id===c.id));
  if(entries.some(r=>!r||r.contentHash!==c.contentHash||!GRADES.includes(r.grade)||!Array.isArray(r.concepts)||r.concepts.length!==count||r.concepts.some(s=>!STATES.includes(s))||!Array.isArray(r.errors)||r.errors.length!==q.proposal.criticalErrors.length||r.errors.some(s=>!['present','absent','uncertain'].includes(s))||!text(r.note,1000))){reasons.push('answer_review_required:'+c.id);continue;}
  const labels=entries.map(r=>({grade:r.grade,concepts:r.concepts,errors:r.errors}));
  if(labels.some(l=>hash(l)!==hash(labels[0]))){reasons.push('review_disagreement:'+c.id);continue;}
  const items=conceptItems({criteria:q.proposal.criteria}),label=labels[0];
  if(items.some((item,i)=>label.concepts[i]==='partial'&&!item.partial.trim())){reasons.push('undefined_reference_partial:'+c.id);continue;}
  const statuses=q.proposal.criteria.map((criterion,i)=>aggregateConcept(criterion.assessment.match,items.filter(item=>item.criterionIndex===i).map(item=>({status:label.concepts[item.index]}))));
  const expected=statuses.includes('uncertain')||label.errors.includes('uncertain')?'held':label.errors.includes('present')||!statuses.some(s=>['accepted','partial'].includes(s))?'X':statuses.every(s=>s==='accepted')?'O':'partial';
  if(label.grade!=='held'&&label.grade!==expected){reasons.push('reference_rule_conflict:'+c.id);continue;}
  gold.set(c.id,label);
 }
 return {ready:reasons.length===0,reasons,gold,details};
}
function planRun(d,reviews,config,{split='development',caseIds,maxCases,maxRequests,maxOutputTokens}={}){
 const cases=selectCases(d,{split,caseIds}),review=reviewReadiness(d,reviews,cases),reasons=[...review.reasons];
 if(!Number.isInteger(maxCases)||maxCases<1||maxCases>200||cases.length>maxCases)reasons.push('explicit_case_cap_required');
 if(!Number.isInteger(maxRequests)||maxRequests<cases.length*2||maxRequests>400)reasons.push('explicit_request_cap_required');
 if(!Number.isInteger(maxOutputTokens)||maxOutputTokens<512||maxOutputTokens>12000)reasons.push('explicit_output_token_cap_required');
 if(!config?.key)reasons.push('api_key_missing');
 if(!config?.ready||!text(config.models?.judge,120)||!text(config.models?.verifier,120)||config.models.judge===config.models.verifier)reasons.push('two_distinct_judge_models_required');
 return {ready:reasons.length===0,reasons:[...new Set(reasons)],stage:'transcript_only',asrEvaluated:false,datasetHash:d.datasetHash,selectedCaseIds:cases.map(c=>c.id),questions:new Set(cases.map(c=>c.questionId)).size,plannedRequests:cases.length*2,maxCases,maxRequests,maxOutputTokens,maximumOutputTokens:cases.length*2*(maxOutputTokens||0),productionApproved:false};
}
async function runBenchmark({dataset,reviews,config,options,createProvider,checkpoint}){
 check(typeof checkpoint==='function','checkpoint_required');
 const plan=planRun(dataset,reviews,config,options);check(plan.ready,'benchmark_not_ready');
 const cases=selectCases(dataset,options),review=reviewReadiness(dataset,reviews,cases),provider=createProvider(),results=[];
 const pipelineHash=hash({version:VERSION,models:provider.models,promptHash:provider.promptHash,stage:'transcript_only',maxOutputTokens:options.maxOutputTokens});
 const report={schemaVersion:1,stage:'transcript_only',asrEvaluated:false,productionApproved:false,datasetHash:dataset.datasetHash,split:options.split||'development',caseIds:cases.map(c=>c.id),pipelineHash,models:provider.models,reviewHashes:reviews.map(hash),requestsStarted:0,results,status:'running'};
 await checkpoint(report);
 for(const c of cases){
  const entry={id:c.id,contentHash:c.contentHash,state:'processing',inputHash:hash(c.transcript),reference:review.gold.get(c.id)};results.push(entry);
  report.requestsStarted+=2;await checkpoint(report); // Persist before any possibly billable request. No automatic resume.
  const rubric=rubricSnapshot(review.details.get(c.questionId));
  const answers=await Promise.allSettled([provider.judge(c.transcript,rubric,0),provider.judge(c.transcript,rubric,1)]);
  if(answers.some(a=>a.status==='rejected')){entry.state='unknown';entry.error='provider_request_failed';report.status='stopped';await checkpoint(report);return report;}
  entry.report=decide({rubric,transcripts:[c.transcript,c.transcript],judgments:answers.map(a=>a.value),models:provider.models});
  entry.report.audit.stage='transcript_only';entry.report.audit.pipelineHash=pipelineHash;entry.report.audit.promptHash=provider.promptHash;entry.report.audit.promptVersion=provider.promptVersion;
  entry.report.rubric=rubric;entry.state='completed';await checkpoint(report);
 }
 report.status='completed';report.metrics=summarizeBenchmark(dataset,reviews,report);await checkpoint(report);return report;
}
const ratio=(n,d)=>d?n/d:null;
function summarizeBenchmark(dataset,reviews,run){
 validateDataset(dataset);check(run?.stage==='transcript_only'&&run.datasetHash===dataset.datasetHash&&run.productionApproved===false&&run.status==='completed'&&Array.isArray(run.results),'invalid_run');
 const cases=selectCases(dataset,{split:run.split,caseIds:run.caseIds}),review=reviewReadiness(dataset,reviews,cases);check(review.ready,'review_required');
 check(run.reviewHashes?.length===reviews.length&&run.reviewHashes.every((h,i)=>h===hash(reviews[i])),'review_changed');
 check(run.results.length===cases.length&&new Set(run.results.map(r=>r.id)).size===cases.length,'incomplete_run');
 for(const row of run.results){
  const c=cases.find(c=>c.id===row.id),r=row.report;check(c&&row.contentHash===c.contentHash&&row.state==='completed'&&row.inputHash===hash(c.transcript)&&r?.status==='review_required'&&r.grade===null&&r.score===null&&r.audit?.stage==='transcript_only'&&r.audit.pipelineHash===run.pipelineHash&&r.transcripts?.[0]===c.transcript&&r.transcripts?.[1]===c.transcript&&row.reference&&hash(row.reference)===hash(review.gold.get(c.id)),'invalid_result');
  const rubric=rubricSnapshot(review.details.get(c.questionId));check(r.audit.rubricHash===rubric.hash&&r.rubric?.hash===rubric.hash&&hash(r.rubric)===hash(rubric),'changed_rubric');
  const judgments=(r.judgments||[]).map(j=>({criteria:j.criteria.filter(item=>!rubric.criteria[item.index].assessment),concepts:j.concepts,errors:j.errors,uncertainties:j.uncertainties}));
  const recomputed=decide({rubric,transcripts:[c.transcript,c.transcript],judgments,models:run.models});
  check(hash(recomputed.suggestion)===hash(r.suggestion)&&hash(recomputed.conceptResults)===hash(r.conceptResults),'tampered_decision');
 }
 function group(rows){
  const confusion=Object.fromEntries(GRADES.map(g=>[g,Object.fromEntries(GRADES.map(p=>[p,0]))]));let suggested=0,correct=0,agreed=0,falseO=0,falseX=0,predO=0,predX=0,notO=0,notX=0,known=0,held=0;
  const conceptConfusion=Object.fromEntries(STATES.map(g=>[g,Object.fromEntries([...STATES,'unavailable'].map(p=>[p,0]))]));
  for(const row of rows){const gold=review.gold.get(row.id),p=row.report.suggestion?.grade||'held';check(GRADES.includes(p),'invalid_grade');confusion[gold.grade][p]++;
   if(gold.grade!=='held')known++;if(gold.grade!=='O')notO++;if(gold.grade!=='X')notX++;
   if(p==='held')held++;else{suggested++;if(p===gold.grade)correct++;}if(p===gold.grade)agreed++;
   if(p==='O'){predO++;if(gold.grade!=='O')falseO++;}if(p==='X'){predX++;if(gold.grade!=='X')falseX++;}
   const items=(row.report.conceptResults||[]).flatMap(c=>c.concepts);
   for(let i=0;i<gold.concepts.length;i++){const item=items.find(c=>c.index===i),status=item?.status||'unavailable';check([...STATES,'unavailable'].includes(status),'invalid_concept_status');conceptConfusion[gold.concepts[i]][status]++;}
  }
  return {samples:rows.length,suggestions:suggested,held,heldRate:ratio(held,rows.length),suggestionCoverage:ratio(suggested,rows.length),suggestionAccuracy:ratio(correct,suggested),correctSuggestionsOverKnownReferences:ratio(correct,known),decisionAgreementIncludingHolds:ratio(agreed,rows.length),
   falseO:{count:falseO,amongSuggestedO:ratio(falseO,predO),amongGoldNotO:ratio(falseO,notO),upper95AmongSuggestedO:upper95(falseO,predO)},falseX:{count:falseX,amongSuggestedX:ratio(falseX,predX),amongGoldNotX:ratio(falseX,notX),upper95AmongSuggestedX:upper95(falseX,predX)},confusion,conceptConfusion};
 }
 const slices=Object.fromEntries([...new Set(cases.flatMap(c=>c.tags))].sort().map(tag=>[tag,group(run.results.filter(r=>cases.find(c=>c.id===r.id).tags.includes(tag)))]));
 return {stage:'transcript_only',asrEvaluated:false,productionApproved:false,reviewIdentityVerified:false,syntheticInputs:true,split:run.split,overall:group(run.results),slices};
}
module.exports={makeDataset,validateDataset,reviewTemplate,selectCases,reviewReadiness,planRun,runBenchmark,summarizeBenchmark,hash};
