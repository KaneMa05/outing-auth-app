// Reviewed presentation of the 10 derived questions included in this preview.
// Original question IDs, context, answers and explanations remain untouched.
const standaloneDerivedIds = new Set([
  'criminal-law-001-choice-1', 'criminal-law-001-choice-2',
  'criminal-law-001-choice-3', 'criminal-law-001-choice-4',
  'criminal-law-228-choice-1', 'criminal-law-1337-choice-1'
]);
const derivedStatements = new Map([
  ['criminal-law-084-item-1', '사자명예훼손죄는 형법상 친고죄이다.'],
  ['criminal-procedure-investigation-evidence-213-choice-1', '구속 전 피의자심문은 사후적 구제제도이다.'],
  ['criminal-procedure-investigation-evidence-437-choice-1', '협의의 불기소 결정 중 공소권없음은 고소·고발사건의 사안의 경중, 분쟁의 종국적 해결여부 등을 고려할 때 수사 또는 소추에 관한 공공의 이익이 없거나 극히 적은 경우로서 수사를 개시·진행할 필요성이 인정되지 않는 경우에 해당한다.'],
  ['criminal-procedure-trial-018-choice-1', '비상상고제도는 실체적 진실주의의 제도적 표현이다.']
]);

function questionPresentation(q) {
  const original = { prompt: q.prompt, context: q.context };
  if (q.origin_type !== 'derived_mcq') return original;
  let prompt = derivedStatements.get(q.id);
  if (!prompt && standaloneDerivedIds.has(q.id)) {
    prompt = q.prompt.replace(/^다음 선택지의 내용은 옳다\.\s*/, '');
  }
  // Unknown items may require a fact pattern: never discard their context.
  if (!prompt) return original;
  if ((q.context || '').includes('다툼이 있는 경우 판례에 의함')) {
    prompt += ' (다툼이 있는 경우 판례에 의함)';
  }
  return { prompt, context: '' };
}
