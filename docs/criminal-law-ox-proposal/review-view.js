// Inserted into the local preview module by build-local-preview.py.
function pendingReviewItems() {
  return reviews().filter(s => ['반복 오답', '복습 필요'].includes(s.label));
}

function reviewItemsForFilter() {
  return reviews().filter(s => !note(s.q.id).mastered);
}

function reviewItemMarkup(s) {
  const q = s.q, n = note(q.id);
  const display = questionPresentation(q);
  return `<article class="ox-review-item">
    <div class="ox-review-meta">
      <p class="ox-source">${esc(chapters.get(q.chapter_id).display_name)}</p>
      <span class="ox-sub">누적 ${s.wrong}회 오답</span>
    </div>
    <p class="ox-short-prompt">${esc(display.prompt)}</p>
    <details data-question-detail="${q.id}">
      <summary>정답 · 해설 · 메모 보기</summary>
      <p class="ox-sub">정답 ${q.correct_answer}</p>
      ${display.context ? `<div class="ox-context">${esc(display.context)}</div>` : ''}
      <div class="ox-explanation">${safeHtml(q.explanation_html)}</div>
      ${questionStatsMarkup(q)}
      <p class="ox-sub">메모: ${esc(n.text) || '작성한 메모가 없어요.'}</p>
      <p class="ox-sub">북마크: ${n.bookmark ? '저장됨' : '저장하지 않음'}</p>
    </details>
    <div class="ox-review-actions">
      ${button('다시 풀기', 'one', `data-id="${q.id}"`, 'ox-primary')}
      ${button('오답 삭제', 'master', `data-id="${q.id}"`)}
    </div>
  </article>`;
}

function review() {
  const visible = reviewItemsForFilter();
  main.innerHTML = `
    <h2>오답노트</h2>
    <section class="ox-review-panel" aria-label="오답노트 문항">
      <header class="ox-review-head">
        <h3>오답<span class="ox-review-count">${visible.length}문항</span></h3>
        ${visible.length ? button('모아 풀기', 'review-all', '', 'ox-primary') : ''}
      </header>
      ${visible.length ? visible.map(reviewItemMarkup).join('') : `<div class="ox-review-empty">
        <h3>저장된 오답이 없어요.</h3>
        <p class="ox-sub">학습을 이어가면 기록이 여기에 모입니다.</p>
        ${button('단원 골라 풀기', 'nav', 'data-ox-route="chapters"', 'ox-wide')}
      </div>`}
    </section>`;
}
