function weaknessStats() {
  const history = new Map();
  for (const q of data.questions) {
    const s = stats(q.id);
    if (!history.has(q.chapter_id)) history.set(q.chapter_id, { past: 0, regained: 0, repeated: 0, totalAttempts: 0, totalCorrect: 0, totalWrong: 0 });
    const item = history.get(q.chapter_id);
    const counts = questionAttemptCounts(q.id);
    item.totalAttempts += counts.attempts;
    item.totalCorrect += counts.correct;
    item.totalWrong += counts.wrong;
    if (!s.wrong) continue;
    item.past++;
    if (s.last?.correct) item.regained++;
    if (s.wrong >= 3) item.repeated++;
  }
  return data.chapters.map((c, index) => {
    const s = chapterStat(c), h = history.get(c.id) || { past: 0, regained: 0, repeated: 0, totalAttempts: 0, totalCorrect: 0, totalWrong: 0 };
    return { ...s, ...h, index, cumulativeAccuracy: h.totalAttempts ? h.totalCorrect / h.totalAttempts * 100 : null };
  });
}

function weaknessHistoryOrder(a, b) {
  return (a.cumulativeAccuracy ?? Infinity) - (b.cumulativeAccuracy ?? Infinity) || b.totalWrong - a.totalWrong || a.index - b.index;
}

function questionAttemptCounts(id) {
  const list = effective().filter(a => a.id === id);
  const correct = list.filter(a => a.correct).length;
  return { attempts: list.length, correct, wrong: list.length - correct };
}

function cumulativeAccuracyLabel(s) {
  if (s.cumulativeAccuracy === null) return '—';
  // Never round a record containing a wrong answer up to a perfect score.
  const rate = Math.min(s.totalWrong ? 99.9 : 100, Math.round(s.cumulativeAccuracy * 10) / 10);
  return `${rate}%`;
}

function weaknessRow(s) {
  const tone = s.past ? (s.wrong ? 'weak' : 'good') : 'pending';
  const status = s.past ? (s.wrong ? '복습 필요' : '다시 맞힘') : s.solved ? '오답 없음' : '미학습';
  return `<details class="ox-weak-row" data-weak-chapter="${esc(s.c.id)}">
    <summary>
      <span class="ox-weak-name">${esc(s.c.display_name)}</span>
      <strong class="ox-weak-rate">${cumulativeAccuracyLabel(s)}</strong>
      <span class="ox-weak-status ox-weak-${tone}">${status}</span>
      <span class="ox-weak-chevron" aria-hidden="true">⌄</span>
      <span class="ox-weak-history-summary">${s.past ? `이전 오답 ${s.past}문항 · 남은 오답 ${s.wrong}문항` : s.solved ? `${s.solved}문항 학습 · 틀린 문항 없음` : '아직 학습한 문항이 없어요.'}</span>
    </summary>
    <div class="ox-weak-detail">
      <p class="ox-sub">${esc(collections.get(s.c.collection_id).name)} · ${s.solved} / ${s.c.question_count}문항 학습</p>
      <p class="ox-sub">누적 ${s.totalAttempts}회 풀이 · 정답 ${s.totalCorrect}회 · 오답 ${s.totalWrong}회</p>
      <p class="ox-sub">${s.solved}문항 중 ${s.past}문항을 틀린 적이 있어요.${s.past ? ` 다시 맞힌 문항은 ${s.regained}문항이에요.` : ''}${s.repeated ? ` 반복해서 틀린 문항 ${s.repeated}문항.` : ''}</p>
      ${s.solved && s.rank === 5 ? '<p class="ox-sub">아직 풀어본 문항이 적어요. 더 학습하면 누적 정답률이 달라질 수 있어요.</p>' : ''}
      ${s.past && !s.wrong ? '<p class="ox-history-notice">이전 오답을 모두 다시 맞혔어요. 어려웠던 단원을 다시 복습할 수 있도록 목록에 남겨두었어요.</p>' : ''}
      ${s.past ? `<div class="ox-review-actions">${button(`이전 오답 ${s.past}문항 보기`, 'history-chapter', `data-id="${esc(s.c.id)}"`, 'ox-primary')}${button('이전 오답 다시 풀기', 'history-chapter-start', `data-id="${esc(s.c.id)}"`)}</div>` : button('이 단원 학습하기', 'chapter', `data-id="${esc(s.c.id)}"`, 'ox-wide')}
    </div>
  </details>`;
}

function weakness() {
  const list = weaknessStats();
  const weak = list.filter(s => s.past).sort(weaknessHistoryOrder);
  const noHistory = list.filter(s => !s.past && s.solved);
  const unlearned = list.filter(s => !s.solved);
  const counts = [
    { label: '취약 단원', count: weak.length, unit: '단원', tone: 'weak' },
    { label: '남은 오답', count: list.reduce((n, s) => n + s.wrong, 0), unit: '문항', tone: 'weak' },
    { label: '다시 맞힘', count: list.reduce((n, s) => n + s.regained, 0), unit: '문항', tone: 'good' }
  ];
  main.innerHTML = `<div class="ox-weak-heading">
      <h2>취약단원</h2>
      <details class="ox-weak-guide">
        <summary>계산 기준</summary>
        <div class="ox-weak-guide-body">
          <h3>누적 정답률은 어떻게 계산하나요?</h3>
          <p>정답 횟수 ÷ 전체 풀이 횟수 × 100이에요. 같은 문항을 다시 푼 횟수도 모두 포함해요.</p>
          <p>20회 풀어 8회 틀린 뒤 그 8문항을 모두 맞히면, 총 28회 중 20회 정답으로 71.4%가 돼요.</p>
          <p>이전 오답은 틀린 적 있는 문항 수예요. 같은 문항은 한 번만 세며, 다시 맞히거나 복습 완료해도 남아요. 남은 오답은 마지막 답변이 오답인 문항 수예요.</p>
          <p>현재 이용 가능한 공개 문항의 현재 버전으로 계산해요. 누적 정답률이 낮은 단원부터 보여드려요.</p>
          <p class="ox-sub">소수 첫째 자리까지 반올림해요. 오답 기록이 있으면 100%로 표시하지 않으며, 정렬에는 반올림 전 값을 사용해요.</p>
        </div>
      </details>
    </div>
    <p class="ox-sub">틀렸던 문항이 있는 단원이에요. 모두 다시 맞혀도 복습할 수 있도록 남겨두어요.</p>
    <div class="ox-weak-overview" aria-label="단원별 요약">
      ${counts.map(item => `<div><span>${item.label}</span><strong class="ox-weak-${item.tone}">${item.count}<small>${item.unit}</small></strong></div>`).join('')}
    </div>
    <p class="ox-sub">누적 정답률 낮은 순 · 단원을 누르면 이전 오답을 볼 수 있어요.</p>
    <section class="ox-weak-table" aria-label="취약 단원">
      <div class="ox-weak-columns" aria-hidden="true"><span>단원</span><span>누적 정답률</span><span>복습 상태</span><span></span></div>
      ${weak.length ? weak.map(weaknessRow).join('') : '<div class="ox-review-empty"><h3>아직 틀렸던 문항이 없어요.</h3><p class="ox-sub">한 번이라도 틀린 문항이 생기면 해당 단원을 여기에 보여드려요.</p></div>'}
    </section>
    ${noHistory.length ? `<details class="ox-weak-pending"><summary>오답 없는 단원 ${noHistory.length}개 보기</summary><div class="ox-weak-table">${noHistory.map(weaknessRow).join('')}</div></details>` : ''}
    ${unlearned.length ? `<details class="ox-weak-pending"><summary>미학습 ${unlearned.length}단원 보기</summary><div class="ox-weak-table">${unlearned.map(weaknessRow).join('')}</div></details>` : ''}`;
}
