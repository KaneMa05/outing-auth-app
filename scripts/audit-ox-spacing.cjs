// Read-only corpus audit. Writes review artifacts, never question data or databases.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { readBank } = require('./ox-import-data.cjs');

const source = process.argv.find(arg => arg.startsWith('--source='))?.slice(9);
if (!source) throw new Error('Usage: node scripts/audit-ox-spacing.cjs --source=<questions.json>');
const raw = fs.readFileSync(source);
const bank = readBank(source);
const fields = ['prompt', 'context', 'explanation'];
// Exact broken forms reviewed as orthographic fragments, not optional compound spacing.
const brokenForms = new Set(`
규범이 다|외 적|처벌 하는|안정성 을|해당 하지|법 률|법 률로|법 률은|법 률의|법 률상의|법률 은|의미 한다
경 우|경 우에는|경 우에|경 우를|경 우는|경 우에도|경 우가|경 우라도|경 우의
또 는|있 는|하 는|있 다|없다 고|있다 고|않는다 고|하더라 도|없 는|것으 로|관 한
형사소송 법|형 사소송법|형 사소송법이|형사소 송법이|형사소 송규칙|형 사소송규칙
것 으로|피 고인이|판 례에|때에 는|이 를|때 에는|한 다|성 립한다|하 여|것 은
해당하 지|피고인 이|경우에 는|등 에|경위승 진|다 른|등 의|같 은|따라 서|사 정이|다 툼이
어렵다 고|있 다고|해당한다 고|성 립하지|피고인 의|하여 금|하더 라도|대하 여|행위 를
관하 여|따 라|것 이므로|의 하여|보아 야|따 라서|행 위는|것 을|것 이고|사안에 서|관 하여
법 원은|이러 한|의하 여|의 한|동일 한|관계 에|않 은|것 이다|아 니라|것이므 로|등 을
위 한|사정 이|하 더라도|않는 다|대 하여|수 는|아 니하는|이 에|있 고|형 법|성립한다 고
이 러한|것 이|피 해자의|피해자 의|상 해를|없다 는|한다 고|아 니고|사 례|나머 지|되 는
불 구하고|모 두|경 장승진|대 상이|것 으로서|것이라 고|피 고인|위하 여|행 위가|정 도의
피고인에 게|적 용하여|자 신의|아니하 고|아니한 다|구 체적|가하 여|성립하 지|신체 에|한다 는
보 아야|행 위|것이어 서|이유 가|물 론|하 지|아 니한|아니한다 고|것이 고|기 소된|없 으므로
하 고|판 단하여야|무 죄를|성 립하는|규 정하고|이 와|있으 므로|있 지|반 하여|경 위공채
경 찰관|효력 이|피의자 가|피 의자의|구 속기간에|검 증영장|약식명 령을|서면으 로
증 거능력이|증 거능력을|증거능 력이|증거능 력을|증거능력 을|증거능력 이|피 고인의
법정대리 인|국 선변호인의|집행유 예|구두변 론을|공소기각판 결을|공소장변 경을
`.trim().split(/[|\n]/).map(value => value.trim()).filter(Boolean));

const words = new Map();
for (const q of bank.questions) for (const field of fields) {
  for (const word of (q[field] || '').match(/[가-힣]+/g) || []) {
    words.set(word, (words.get(word) || 0) + 1);
  }
}

const findings = [];
const htmlMismatches = [];
function decodeHtml(value) {
  return value.replace(/<\/?u>/g, '').replace(/&(amp|lt|gt|quot|#39|#x27);/g,
    (_, entity) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", '#x27': "'" })[entity]);
}
for (const q of bank.questions) {
  if (decodeHtml(q.explanation_html) !== q.explanation) htmlMismatches.push(q.id);
  for (const field of fields) {
    const value = q[field] || '';
    // Lookahead includes overlapping pairs; skip suffixes of the left token.
    for (const match of value.matchAll(/(?=([가-힣]+) ([가-힣]+))/g)) {
      if (match.index > 0 && /[가-힣]/.test(value[match.index - 1])) continue;
      const before = match[1] + ' ' + match[2];
      const after = match[1] + match[2];
      const priority = brokenForms.has(before);
      const candidate = (words.get(after) || 0) >= 3 &&
        (match[1].length === 1 || match[2].length === 1 ||
          (words.get(match[1]) || 0) < 10 || (words.get(match[2]) || 0) < 10);
      if (!priority && !candidate) continue;
      findings.push({
        question_id: q.id, chapter_id: q.chapter_id, source_page: q.source_page,
        import_status: q.status, field, offset: match.index,
        classification: priority ? 'reviewed_broken_form' : 'context_review_required',
        before, suggestion: after,
        excerpt: value.slice(Math.max(0, match.index - 35), match.index) +
          '[' + before + ']' + value.slice(match.index + before.length, match.index + before.length + 35)
      });
    }
    for (const match of value.matchAll(/[가-힣]*(?:할수|될수|볼수|수있|수없|하지않)[가-힣]*/g)) {
      if (match[0] === '수없이') continue;
      findings.push({ question_id: q.id, chapter_id: q.chapter_id, source_page: q.source_page,
        import_status: q.status, field, offset: match.index,
        classification: 'missing_space_review_required', before: match[0], suggestion: null,
        excerpt: value.slice(Math.max(0, match.index - 35), match.index + match[0].length + 35) });
    }
  }
}

const priority = findings.filter(f => f.classification === 'reviewed_broken_form');
const countQuestions = rows => new Set(rows.map(row => row.question_id)).size;
const summary = {
  questions: bank.questions.length, chapters: bank.chapters.length,
  published_at_import: bank.questions.filter(q => q.status === 'published').length,
  draft_at_import: bank.questions.filter(q => q.status === 'draft').length,
  priority_questions: countQuestions(priority), priority_occurrences: priority.length,
  priority_published_questions: countQuestions(priority.filter(f => f.import_status === 'published')),
  priority_by_field: Object.fromEntries(fields.map(field => [field, priority.filter(f => f.field === field).length])),
  priority_chapters: new Set(priority.map(f => f.chapter_id)).size,
  candidate_questions: countQuestions(findings), candidate_occurrences: findings.length,
  html_text_mismatches: htmlMismatches.length
};
const byGroup = ['총론', '각론', '수사·증거', '공판'].map(name => {
  const ids = new Set(bank.chapters.filter(c =>
    (c.law_part || (c.collection_id.endsWith('trial') ? '공판' : '수사·증거')) === name).map(c => c.id));
  const rows = priority.filter(f => ids.has(f.chapter_id));
  return { name, questions: bank.questions.filter(q => ids.has(q.chapter_id)).length,
    priority_questions: countQuestions(rows), priority_occurrences: rows.length };
});
const totals = new Map();
for (const row of priority) totals.set(row.before, (totals.get(row.before) || 0) + 1);
const ranked = [...totals].sort((a, b) => b[1] - a[1]);
const root = path.join(__dirname, '..', 'docs');
const basename = 'criminal-law-ox-spacing-audit-20260920';
const artifact = { source: path.resolve(source), source_sha256: crypto.createHash('sha256').update(raw).digest('hex'),
  scope: 'Local source after readBank presentation; production database not queried.',
  method: 'Reviewed exact broken forms plus heuristic candidates; not complete manual proofreading. No automatic corrections.',
  summary, by_group: byGroup, html_mismatches: htmlMismatches, findings };
fs.writeFileSync(path.join(root, basename + '.json'), JSON.stringify(artifact, null, 2) + '\n');
const lines = [
  '# 형사법 OX 띄어쓰기 검토', '',
  '검토일: 2026-09-20', '',
  '## 범위와 집계 기준', '',
  '- 로컬 원본 `C:/Users/W11/Documents/형사법 오엑스/database/questions.json`의 2,960문항, 65개 단원을 전수 패턴 검사했다.',
  '- 앱 가져오기 함수 `readBank()`를 거친 지문·상황문·해설을 검사했다. 정답이나 법률적 판단의 타당성을 검토한 것은 아니다.',
  '- `우선 교정`은 검토한 명백한 단절 형태와 정확히 일치하는 항목이다. 모든 문장을 사람이 하나씩 교열한 결과나 전체 오류 수는 아니다.',
  '- `추가 후보`는 붙인 형태가 같은 말뭉치에서 반복되는 경우 등으로 추린 것이다. `만 원`, `다음 날`, `하는 데`처럼 정상 표현도 포함되므로 일괄 교정하면 안 된다.',
  '- 일반 해설과 HTML 해설은 중복 집계하지 않았다. 같은 문구가 서로 다른 문항·필드에 있으면 각각 집계했다.',
  '- published/draft는 현재 로컬 가져오기 규칙의 결과다. 운영 DB의 현재 문항·관리자 수정 내용은 조회하지 않았다.', '',
  `전체 ${summary.questions}문항 중 우선 교정 패턴이 있는 문항은 **${summary.priority_questions}개**, 해당 위치는 **${summary.priority_occurrences}곳**이다. 이 중 가져오기 시 공개 대상 문항은 ${summary.priority_published_questions}개다.`, '',
  `발견 범위는 ${summary.priority_chapters}개 단원 전체이며, 지문 ${summary.priority_by_field.prompt}곳·상황문 ${summary.priority_by_field.context}곳·해설 ${summary.priority_by_field.explanation}곳이다.`, '',
  `추가 후보를 포함하면 ${summary.candidate_questions}문항, ${summary.candidate_occurrences}곳이다. 이 숫자를 확정 오류 수로 해석하면 안 된다.`, '',
  '| 범위 | 전체 문항 | 우선 교정 문항 | 우선 교정 위치 |', '|---|---:|---:|---:|',
  ...byGroup.map(g => `| ${g.name} | ${g.questions} | ${g.priority_questions} | ${g.priority_occurrences} |`), '',
  '## 주요 원인', '',
  '- 원본 생성기 `database/build_database.py:206`의 `normalize_text()`가 모든 줄바꿈을 공백으로 변환한다. 단어 중간 줄바꿈도 그대로 공백이 된다.',
  '- 형법 PDF 8쪽을 실제 렌더링해 확인했다. 해설의 `규범이 / 다`, `외 / 적`, `법 / 률로`가 줄 경계에 있으며 JSON에서는 `규범이 다`, `외 적`, `법 률로`로 저장되어 있다.',
  '- 앱 `criminal-law-ox.js:295`는 지문을 이스케이프해 표시하고 `:319`는 HTML 해설을 표시한다. 이 경로가 새 공백을 삽입하는 것은 아니다.',
  '- `scripts/ox-import-data.cjs`도 띄어쓰기 복원 없이 해설을 가져온다. 미리보기 JSON만 고쳐서는 운영 문항이 교정되지 않는다.', '',
  '## 반복되는 우선 교정 패턴', '',
  '| 원문 | 교정안 | 위치 수 |', '|---|---|---:|',
  ...ranked.slice(0, 45).map(([before, count]) => `| ${before} | ${before.replace(/ /g, '')} | ${count} |`), '',
  '## 위치 확인 예시', '',
  '| 문항 ID | PDF 쪽 | 필드 | 문맥 | 교정안 |', '|---|---:|---|---|---|',
  ...byGroup.flatMap(g => {
    const ids = new Set(bank.chapters.filter(c => (c.law_part || (c.collection_id.endsWith('trial') ? '공판' : '수사·증거')) === g.name).map(c => c.id));
    return priority.filter(f => ids.has(f.chapter_id)).slice(0, 8).map(f =>
      `| ${f.question_id} | ${f.source_page} | ${f.field} | ${f.excerpt.replace(/\|/g, '\\|')} | ${f.suggestion} |`);
  }), '',
  '## 단원별 결과', '',
  '| 단원 | 전체 문항 | 우선 교정 문항 | 우선 교정 위치 |', '|---|---:|---:|---:|',
  ...bank.chapters.map(c => {
    const rows = priority.filter(f => f.chapter_id === c.id);
    return `| ${c.law_part || bank.collections.find(item => item.id === c.collection_id).scope} · ${c.display_name} | ${c.question_count} | ${countQuestions(rows)} | ${rows.length} |`;
  }), '',
  '## 교정 시 지켜야 할 사항', '',
  '- 단어 중간 줄바꿈을 복원하는 과정과 원래 띄어쓰기를 구분해야 한다. 모든 공백 제거·모든 줄바꿈 연결·일반 맞춤법 검사기의 일괄 적용은 적절하지 않다.',
  '- `explanation`과 `explanation_html`을 함께 교정하고, 밑줄 구간은 원문에 대응하도록 보존해야 한다.',
  '- 예를 들어 `criminal-law-003`의 HTML에는 `의미</u> 한다`가 있어 밑줄 경계 밖 공백도 고려해야 한다. 태그를 무시한 단순 문자열 치환만으로는 모든 교정을 반영할 수 없다.',
  `- 현재 HTML 밑줄 제거·엔티티 복원 후 일반 해설과 불일치한 문항: ${htmlMismatches.length}개. 기존 두 표현 사이의 일관성은 유지되어 있다.`,
  '- 문항 ID·정답·단원·순서와 학생 풀이·오답노트 기록을 유지해야 한다. 운영 적용 전에는 최신 관리자 수정 내용과 충돌 여부를 대조해야 한다.',
  '- 이번 작업은 검토와 결과 파일 생성만 수행했다. 앱·원본 JSON·DB 수정, 푸시, 배포는 하지 않았다.', '',
  `전체 검출 위치와 문맥: [${basename}.json](./${basename}.json)`, '',
  '재현 명령:', '', '```powershell',
  'node scripts/audit-ox-spacing.cjs --source="C:/Users/W11/Documents/형사법 오엑스/database/questions.json"',
  '```', ''
];
fs.writeFileSync(path.join(root, basename + '.md'), lines.join('\n'));
console.log(JSON.stringify({ ...summary, by_group: byGroup, artifacts: [basename + '.md', basename + '.json'] }, null, 2));
