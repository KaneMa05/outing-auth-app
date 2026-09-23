let weakView = 'history';

function weaknessStats() {
  const history = new Map();
  for (const q of data.questions) {
    const s = stats(q.id);
    if (!s.wrong) continue;
    if (!history.has(q.chapter_id)) history.set(q.chapter_id, { past: 0, regained: 0, repeated: 0 });
    const item = history.get(q.chapter_id);
    item.past++;
    if (s.last?.correct) item.regained++;
    if (s.wrong >= 3) item.repeated++;
  }
  return data.chapters.map((c, index) => {
    const s = chapterStat(c), h = history.get(c.id) || { past: 0, regained: 0, repeated: 0 };
    return { ...s, ...h, index, historyRate: s.solved ? h.past / s.solved * 100 : null };
  });
}

function weaknessHistoryOrder(a, b) {
  return b.historyRate - a.historyRate || b.past - a.past || a.index - b.index;
}

function weaknessRow(s) {
  const measured = s.rank < 5, history = weakView === 'history';
  const tone = history ? (s.past ? 'weak' : 'pending') : s.rank < 3 ? 'weak' : s.rank === 3 ? 'caution' : s.rank === 4 ? 'good' : 'pending';
  const rate = history ? s.historyRate : (measured ? s.accuracy : null);
  const status = history ? (s.past ? '취약 이력' : s.solved ? '이력 없음' : '미학습') : (measured ? s.label : '미측정');
  return `<details class="ox-weak-row" data-weak-chapter="${esc(s.c.id)}">
    <summary>
      <span class="ox-weak-name">${esc(s.c.display_name)}</span>
      <strong class="ox-weak-rate">${rate === null ? '—' : `${Math.round(rate)}%`}</strong>
      <span class="ox-weak-status ox-weak-${tone}">${status}</span>
      <span class="ox-weak-chevron" aria-hidden="true">⌄</span>
      <span class="ox-weak-history-summary">${s.past ? `${s.solved}문항 중 ${s.past}문항 틀린 이력 · ${s.wrong ? `아직 틀림 ${s.wrong}문항` : '모두 다시 맞힘'}` : s.solved ? `${s.solved}문항 학습 · 틀린 이력 없음` : '아직 학습한 문항이 없어요.'}${s.solved && !measured ? ' · 학습 기록 적음' : ''}</span>
    </summary>
    <div class="ox-weak-detail">
      <p class="ox-sub">${esc(collections.get(s.c.collection_id).name)} · ${s.solved} / ${s.c.question_count}문항 학습</p>
      <p class="ox-sub">현재 정답률 ${s.accuracy === null ? '—' : `${Math.round(s.accuracy)}%`} · 다시 맞힘 ${s.regained}문항${s.repeated ? ` · 반복 오답 ${s.repeated}문항` : ''}</p>
      ${!measured ? `<p class="ox-sub">${Math.max(0, Math.min(5, s.c.question_count) - s.solved)}문항 더 풀면 단원 간 비교에 필요한 기록이 모여요.</p>` : ''}
      ${s.past && !s.wrong ? '<p class="ox-history-notice">이전 오답을 모두 다시 맞혔어요. 취약 이력은 그대로 유지됩니다.</p>' : ''}
      ${s.past ? `<div class="ox-review-actions">${button(`이전 오답 ${s.past}문항 보기`, 'history-chapter', `data-id="${esc(s.c.id)}"`, 'ox-primary')}${button('이전 오답 다시 풀기', 'history-chapter-start', `data-id="${esc(s.c.id)}"`)}</div>` : button('이 단원 학습하기', 'chapter', `data-id="${esc(s.c.id)}"`, 'ox-wide')}
    </div>
  </details>`;
}

function weakness() {
  const history = weakView === 'history';
  const list = weaknessStats();
  const measured = history
    ? list.filter(s => s.past && s.rank < 5).sort(weaknessHistoryOrder)
    : list.filter(s => s.rank < 5).sort((a, b) => a.rank - b.rank || b.score - a.score || a.index - b.index);
  const pending = history ? list.filter(s => s.past && s.rank === 5).sort(weaknessHistoryOrder) : list.filter(s => s.rank === 5);
  const noHistory = history ? list.filter(s => !s.past && s.solved) : [];
  const unlearned = history ? list.filter(s => !s.solved) : [];
  const counts = history ? [
    { label: '취약 이력', count: list.filter(s => s.past).length, unit: '단원', tone: 'weak' },
    { label: '틀린 적 있음', count: list.reduce((n, s) => n + s.past, 0), unit: '문항', tone: 'weak' },
    { label: '다시 맞힘', count: list.reduce((n, s) => n + s.regained, 0), unit: '문항', tone: 'good' }
  ] : [
    { label: '취약', count: measured.filter(s => s.rank < 3).length, unit: '단원', tone: 'weak' },
    { label: '주의', count: measured.filter(s => s.rank === 3).length, unit: '단원', tone: 'caution' },
    { label: '양호', count: measured.filter(s => s.rank === 4).length, unit: '단원', tone: 'good' }
  ];
  main.innerHTML = `<div class="ox-weak-heading">
      <h2>취약단원</h2>
      <details class="ox-weak-guide">
        <summary>측정 기준</summary>
        <div class="ox-weak-guide-body">
          <h3>오답 경험률</h3>
          <p>틀린 적 있는 문항 수 ÷ 풀어본 문항 수 × 100으로 계산해요. 같은 문항은 한 번만 세며, 다시 맞히거나 복습 완료해도 취약 이력에 남아요.</p>
          <p>새 문항을 학습하거나 처음 틀린 문항이 생기면 비율이 달라질 수 있어요. 현재 이용 가능한 공개 문항의 현재 버전을 기준으로 해요.</p>
          <h3>현재 정답률</h3>
          <p>문항별 마지막 답변 기준이에요. 현재 상태는 50% 미만 매우 취약, 70% 미만 취약, 85% 미만 주의, 85% 이상 양호로 표시해요.</p>
          <p>서로 다른 5문항부터 단원을 비교해요. 전체가 5문항 미만인 단원은 모두 풀어야 해요. 기록이 적어도 이전 오답은 확인할 수 있어요.</p>
          <p class="ox-sub">비율은 반올림해 표시하며 정렬과 판정에는 반올림 전 값을 사용해요. 현재 상태의 ‘취약’에는 ‘매우 취약’도 포함돼요.</p>
        </div>
      </details>
    </div>
    <div class="ox-history-tabs" role="group" aria-label="취약단원 보기">
      <button type="button" class="mini-btn ox-filter" data-action="weak-view" data-view="history" aria-pressed="${history}">취약 이력</button>
      <button type="button" class="mini-btn ox-filter" data-action="weak-view" data-view="current" aria-pressed="${!history}">현재 상태</button>
    </div>
    <p class="ox-sub">${history ? '다시 맞혀도, 어려웠던 단원은 기록에 남아요.' : '풀어본 문항의 마지막 답변을 기준으로 보여드려요.'}</p>
    <div class="ox-weak-overview" aria-label="단원별 요약">
      ${counts.map(item => `<div><span>${item.label}</span><strong class="ox-weak-${item.tone}">${item.count}<small>${item.unit}</small></strong></div>`).join('')}
    </div>
    <p class="ox-sub">${history ? '오답 경험률 높은 순' : '현재 취약도 순'}</p>
    <section class="ox-weak-table" aria-label="${history ? '취약 이력 단원' : '현재 취약도 단원'}">
      <div class="ox-weak-columns" aria-hidden="true"><span>단원</span><span>${history ? '오답 경험률' : '정답률'}</span><span>상태</span><span></span></div>
      ${measured.length ? measured.map(weaknessRow).join('') : `<div class="ox-review-empty"><h3>${history ? pending.length ? '아래에서 이전 오답을 확인해 보세요.' : '아직 오답 이력이 없어요.' : '아직 진단할 기록이 부족해요.'}</h3><p class="ox-sub">${history ? pending.length ? '학습 기록이 적은 단원도 이력은 남아요.' : '한 번이라도 틀린 문항이 생기면 이곳에 남아요.' : '단원별로 5문항을 풀면 취약도를 보여드려요.'}</p></div>`}
    </section>
    ${pending.length ? `<details class="ox-weak-pending" ${history ? 'open' : ''}><summary>${history ? '학습 기록 적음' : '미측정'} ${pending.length}단원 보기</summary><div class="ox-weak-table">${pending.map(weaknessRow).join('')}</div></details>` : ''}
    ${noHistory.length ? `<details class="ox-weak-pending"><summary>취약 이력 없음 ${noHistory.length}단원 보기</summary><div class="ox-weak-table">${noHistory.map(weaknessRow).join('')}</div></details>` : ''}
    ${unlearned.length ? `<details class="ox-weak-pending"><summary>미학습 ${unlearned.length}단원 보기</summary><div class="ox-weak-table">${unlearned.map(weaknessRow).join('')}</div></details>` : ''}`;
}
