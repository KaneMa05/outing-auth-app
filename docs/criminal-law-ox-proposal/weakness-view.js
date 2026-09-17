function weaknessRow(s) {
  const measured = s.rank < 5;
  const tone = s.rank < 3 ? 'weak' : s.rank === 3 ? 'caution' : s.rank === 4 ? 'good' : 'pending';
  return `<details class="ox-weak-row">
    <summary>
      <span class="ox-weak-name">${esc(s.c.display_name)}</span>
      <strong class="ox-weak-rate">${measured ? `${Math.round(s.accuracy)}%` : '—'}</strong>
      <span class="ox-weak-status ox-weak-${tone}">${measured ? s.label : '미측정'}</span>
      <span class="ox-weak-chevron" aria-hidden="true">⌄</span>
    </summary>
    <div class="ox-weak-detail">
      <p class="ox-sub">${esc(collections.get(s.c.collection_id).name)}</p>
      <p class="ox-sub">${s.solved} / ${s.c.question_count}문항 학습 · 최근 오답 ${s.wrong}문항</p>
      ${!measured ? `<p class="ox-sub">${Math.max(0, Math.min(5, s.c.question_count) - s.solved)}문항 더 풀면 취약도를 확인할 수 있어요.</p>` : ''}
      ${button('이 단원 학습하기', 'chapter', `data-id="${s.c.id}"`, 'ox-wide')}
    </div>
  </details>`;
}

function weakness() {
  const list = data.chapters.map(chapterStat).sort((a, b) => a.rank - b.rank || b.score - a.score || data.chapters.indexOf(a.c) - data.chapters.indexOf(b.c));
  const measured = list.filter(s => s.rank < 5);
  const pending = list.filter(s => s.rank === 5);
  const counts = [
    { label: '취약', count: measured.filter(s => s.rank < 3).length, tone: 'weak' },
    { label: '주의', count: measured.filter(s => s.rank === 3).length, tone: 'caution' },
    { label: '양호', count: measured.filter(s => s.rank === 4).length, tone: 'good' }
  ];
  main.innerHTML = `<div class="ox-weak-heading">
      <h2>취약단원</h2>
      <details class="ox-weak-guide">
        <summary>판정 기준</summary>
        <div class="ox-weak-guide-body">
          <h3>단원 정답률 기준</h3>
          <dl class="ox-weak-thresholds">
            <dt class="ox-weak-weak">매우 취약</dt><dd>50% 미만</dd>
            <dt class="ox-weak-weak">취약</dt><dd>50% 이상 ~ 70% 미만</dd>
            <dt class="ox-weak-caution">주의</dt><dd>70% 이상 ~ 85% 미만</dd>
            <dt class="ox-weak-good">양호</dt><dd>85% 이상</dd>
          </dl>
          <p>서로 다른 5문항부터 판정해요. 전체가 5문항 미만인 단원은 모두 풀어야 해요. 그전에는 ‘미측정’으로 표시돼요.</p>
          <p>푼 문항마다 마지막 답안을 기준으로 정답률을 계산하므로, 다시 풀면 결과가 갱신돼요.</p>
          <p class="ox-sub">상단 ‘취약’에는 ‘매우 취약’도 포함됩니다. 표시 정답률은 반올림하며, 판정은 반올림 전 수치를 기준으로 합니다.</p>
        </div>
      </details>
    </div>
    <div class="ox-weak-overview" aria-label="단원별 취약도 요약">
      ${counts.map(item => `<div><span>${item.label}</span><strong class="ox-weak-${item.tone}">${item.count}<small>단원</small></strong></div>`).join('')}
    </div>
    <section class="ox-weak-table" aria-label="취약도 측정 단원">
      <div class="ox-weak-columns" aria-hidden="true"><span>단원</span><span>정답률</span><span>상태</span><span></span></div>
      ${measured.length ? measured.map(weaknessRow).join('') : '<div class="ox-review-empty"><h3>아직 진단할 기록이 부족해요.</h3><p class="ox-sub">단원별로 5문항을 풀면 취약도를 보여드려요.<br>5문항 미만인 단원은 모두 풀면 확인할 수 있어요.</p></div>'}
    </section>
    ${pending.length ? `<details class="ox-weak-pending"><summary>미측정 ${pending.length}단원 보기</summary><div class="ox-weak-table">${pending.map(weaknessRow).join('')}</div></details>` : ''}`;
}
