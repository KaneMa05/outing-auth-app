// Local design fixtures only. These are NOT student records or server aggregates.
const exampleQuestionStats = new Map([
  ['criminal-law-001-choice-1', { answered: 200, wrong: 68 }],
  ['criminal-law-003', { answered: 200, wrong: 124 }],
  ['criminal-law-004', { answered: 9, wrong: 4 }]
]);

function questionStatsMarkup(q) {
  const sample = exampleQuestionStats.get(q.id);
  const ready = sample && sample.answered >= 10;
  const value = ready ? `${Math.round(sample.wrong / sample.answered * 100)}%` : '집계 중';
  return `<div class="ox-question-stats" aria-label="전체 수강생 오답률 예시 통계" title="시안용 예시 수치입니다.">
    <div class="ox-question-stats-heading"><span>전체 수강생 오답률</span><strong>${value}</strong></div>
  </div>`;
}
