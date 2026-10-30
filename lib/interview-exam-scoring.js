'use strict';
// The model supplies evidence; only this module computes a suggested grade.
// No production-grade release switch exists until real speech validation is complete.
const crypto = require('node:crypto');
const VERSION = 'exam-evidence-3';
const {keywordRule,keywordCoverage}=require('./interview-keyword-rules.cjs');
const {conceptRule,validateConceptCriteria,conceptItems,aggregateConcept}=require('./interview-concept-rules.cjs');
const norm = s => s.normalize('NFC').toLowerCase().replace(/\s+/gu, ' ').trim();
const digest = v => crypto.createHash('sha256').update(typeof v === 'string' || Buffer.isBuffer(v) ? v : JSON.stringify(v)).digest('hex');
const text = (s, max = 2000) => typeof s === 'string' && s.trim().length > 0 && s.length <= max;
const fail = code => { throw Object.assign(new Error(code), {code}); };
// Only grammatical particles/copulas are tolerated. No fuzzy matching, synonyms,
// space deletion, acronym expansion, stemming or numeric/unit conversion.
const suffix = /^(?:은|는|이|가|을|를|의|에|에서|에게|로|으로|와|과|도|만|부터|까지|보다|라고|이라고|란|이란|입니다|이다|이며|이고)?(?![\p{L}\p{N}_])/u;
function occurrences(answer, term) {
  const a = norm(answer), t = norm(term), hits = [];
  if (!t) return hits;
  let at = a.indexOf(t);
  while (at !== -1) {
    const left = Array.from(a.slice(0, at)).pop() || '';
    const before=a.slice(0,at),after=a.slice(at+t.length);
    // A decimal/comma/sign is not a word boundary inside a number.
    const numericFragment=(/^\d/u.test(t)&&(/[+\-−]$/u.test(before)||/\d[.,/:]$/u.test(before))) ||
      (/\d$/u.test(t)&&(/^[.,/:]\d/u.test(after)||/^[%‰]/u.test(after)));
    if (!/[\p{L}\p{N}_]/u.test(left) && !numericFragment && suffix.test(after)) hits.push({start: at, end: at + t.length, term});
    at = a.indexOf(t, at + 1);
  }
  return hits;
}
function rubricSnapshot(detail) {
  const q = detail?.question, r = detail?.rubric;
  if (!q || !r || detail.stale || r.status !== 'reviewed' || r.kind !== 'job_knowledge' ||
      r.source_prompt !== q.prompt || r.source_category !== q.category || r.question_id !== q.id ||
      !Number.isInteger(q.revision) || !Number.isInteger(r.revision) || q.revision < 1 || r.revision < 1 ||
      !text(r.verification_note, 4000) || !text(r.reviewer, 120) || !r.reviewed_at) fail('rubric_not_ready');
  if (!Array.isArray(r.criteria) || !r.criteria.length || r.criteria.length > 20 ||
      !Array.isArray(r.critical_errors) || !r.critical_errors.length || r.critical_errors.length > 20) fail('rubric_not_ready');
  for (const c of r.criteria) if (!c || !text(c.label, 200) || !text(c.context) || !text(c.reject_context) ||
      !Array.isArray(c.terms) || !c.terms.length || c.terms.length > 30 || c.terms.some(t => !text(t, 120))) fail('rubric_not_ready');
  try { r.criteria.forEach(keywordRule);validateConceptCriteria(r.criteria); } catch { fail('rubric_not_ready'); }
  if (r.critical_errors.some(e => !text(e))) fail('rubric_not_ready');
  const s = r.score_map;
  if (!s || !['O','partial','X'].every(k => Number.isFinite(s[k])) || !(s.O > s.partial && s.partial > s.X && s.X >= 0 && s.O <= 10000)) fail('rubric_not_ready');
  const snapshot = {questionId: q.id, questionRevision: q.revision, rubricRevision: r.revision,
    question: q.prompt, criteria: r.criteria.map(c => ({label:c.label, terms:[...c.terms], ...keywordRule(c), context:c.context, reject_context:c.reject_context,...(conceptRule(c)?{assessment:conceptRule(c)}:{})})),
    criticalErrors:[...r.critical_errors], scoreMap:{O:s.O, partial:s.partial, X:s.X},
    verificationNote:r.verification_note, reviewer:r.reviewer, reviewedAt:r.reviewed_at};
  return {...snapshot, hash:digest(snapshot)};
}
function strictKeys(value, names) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === names.length && names.every(n => Object.hasOwn(value,n));
}
function validateJudgment(j, transcript, rubric) {
  const items=conceptItems(rubric),termIndexes=rubric.criteria.flatMap((c,i)=>conceptRule(c)?[]:[i]);
  if (!strictKeys(j,items.length?['criteria','errors','uncertainties','concepts']:['criteria','errors','uncertainties']) || !Array.isArray(j.criteria) || j.criteria.length !== termIndexes.length ||
      !Array.isArray(j.errors) || j.errors.length !== rubric.criticalErrors.length || !Array.isArray(j.uncertainties) ||
      j.uncertainties.length > 10 || j.uncertainties.some(s => !text(s,500))) fail('invalid_judgment');
  function checkRows(rows, indexes, statuses, isCriterion) {
    const seen = new Set();
    for (const row of rows) {
      if (!strictKeys(row,['index','status','quote','reason']) || !Number.isInteger(row.index) || !indexes.includes(row.index) || seen.has(row.index) ||
          !statuses.includes(row.status) || typeof row.quote !== 'string' || row.quote.length > 4000 || !text(row.reason,1000)) fail('invalid_judgment');
      seen.add(row.index);
      // Evidence must be copied exactly from the unedited transcript, not the prompt or answer key.
      const needsQuote = ['accepted','partial','rejected','present'].includes(row.status);
      if ((needsQuote && !row.quote.trim()) || (row.quote && !transcript.includes(row.quote))) fail('invalid_evidence');
      if (isCriterion) {
        const terms = rubric.criteria[row.index].terms;
        if (row.status === 'accepted' && (!keywordCoverage(rubric.criteria[row.index],row.quote,occurrences).literalSatisfied || !keywordCoverage(rubric.criteria[row.index],transcript,occurrences).literalSatisfied)) fail('missing_literal_term');
        if (row.status === 'absent' && terms.some(t => occurrences(transcript,t).length)) fail('inconsistent_judgment');
      }
    }
    if(rows.length!==indexes.length)fail('invalid_judgment');
    return [...rows].sort((a,b)=>a.index-b.index);
  }
  const criteria=checkRows(j.criteria,termIndexes,['accepted','rejected','absent','uncertain'],true),
    errors=checkRows(j.errors,rubric.criticalErrors.map((_,i)=>i),['present','absent','uncertain'],false);
  if(!items.length)return {criteria,errors,uncertainties:j.uncertainties};
  if(!Array.isArray(j.concepts))fail('invalid_judgment');
  const concepts=checkRows(j.concepts,items.map(c=>c.index),['accepted','partial','rejected','absent','uncertain'],false);
  for(const row of concepts)if(row.status==='partial'&&!items[row.index].partial.trim())fail('undefined_partial_credit');
  for(const [index,c] of rubric.criteria.entries())if(conceptRule(c)){
    const rows=concepts.filter(r=>items[r.index].criterionIndex===index);
    criteria.push({index,status:aggregateConcept(c.assessment.match,rows),quote:'',reason:'등록된 개념별 근거와 충족 조건으로 서버에서 산출했습니다.'});
  }
  return {criteria:criteria.sort((a,b)=>a.index-b.index),errors,concepts,uncertainties:j.uncertainties};
}
function decide({rubric,transcripts,judgments,qualityReasons=[],audioHash,models}) {
  const reasons = [...qualityReasons], audit = {version:VERSION,audioHash,rubricHash:rubric.hash,
    questionId:rubric.questionId,questionRevision:rubric.questionRevision,rubricRevision:rubric.rubricRevision,models};
  const keywordResults=Array.isArray(transcripts)&&typeof transcripts[0]==='string'?rubric.criteria.map((c,index)=>({index,label:c.label,...keywordCoverage(c,transcripts[0],occurrences)})):[];
  const result = {keywordResults,conceptResults:[],status:'review_required',grade:null,score:null,suggestion:null,reasons,transcripts,judgments:[],audit};
  if (!Array.isArray(transcripts) || transcripts.length !== 2 || transcripts.some(t => !text(t,12000))) reasons.push('empty_or_invalid_transcript');
  else if (norm(transcripts[0]) !== norm(transcripts[1])) reasons.push('transcript_disagreement');
  if (reasons.length) return result;
  try {
    if (!Array.isArray(judgments) || judgments.length !== 2) fail('missing_judgment');
    result.judgments = judgments.map(j => validateJudgment(j,transcripts[0],rubric));
  } catch(e) { reasons.push(e.code || 'invalid_judgment'); return result; }
  const [a,b] = result.judgments;
  const items=conceptItems(rubric);
  result.conceptResults=rubric.criteria.flatMap((c,index)=>!conceptRule(c)?[]:[{index,label:c.label,match:c.assessment.match,
    status:a.criteria[index].status===b.criteria[index].status&&items.filter(item=>item.criterionIndex===index).every(item=>a.concepts[item.index].status===b.concepts[item.index].status)?a.criteria[index].status:'uncertain',
    concepts:items.filter(item=>item.criterionIndex===index).map(item=>({...item,
      status:a.concepts[item.index].status===b.concepts[item.index].status?a.concepts[item.index].status:'uncertain',
      evidence:[a,b].map((j,judge)=>({judge:judge+1,...j.concepts[item.index]}))}))}]);
  if (a.uncertainties.length || b.uncertainties.length || [...a.criteria,...a.errors,...b.criteria,...b.errors].some(r=>r.status==='uncertain')) reasons.push('context_uncertain');
  if (['criteria','errors'].some(k=>a[k].some((r,i)=>r.status!==b[k][i].status))) reasons.push('judgment_disagreement');
  if(items.length&&a.concepts.some((r,i)=>r.status!==b.concepts[i].status)&&!reasons.includes('judgment_disagreement'))reasons.push('judgment_disagreement');
  if (reasons.length) return result;
  const accepted = a.criteria.filter(c=>c.status==='accepted').length;
  const partial=a.criteria.filter(c=>c.status==='partial').length;
  const grade = a.errors.some(e=>e.status==='present') || accepted+partial===0 ? 'X' : accepted===rubric.criteria.length ? 'O' : 'partial';
  result.suggestion = {grade,score:rubric.scoreMap[grade],accepted,total:rubric.criteria.length};
  // Agreement is not calibrated accuracy. Review remains mandatory, even for O.
  reasons.push('human_validation_required');
  return result;
}
module.exports = {VERSION,norm,digest,occurrences,rubricSnapshot,validateJudgment,decide};
