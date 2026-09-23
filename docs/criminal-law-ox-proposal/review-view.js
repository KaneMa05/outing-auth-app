// Inserted into the local preview module by build-local-preview.py.
let reviewMode = 'pending', reviewChapterId = null, reviewStatus = 'all', reviewRepeated = false;

function openReview(mode = 'pending', chapterId = null) {
  if (chapterId && !chapters.has(chapterId)) return;
  reviewMode = mode === 'history' ? 'history' : 'pending';
  reviewChapterId = chapterId;
  reviewStatus = 'all';
  reviewRepeated = false;
  route = 'review';
}

function pendingReviewItems() {
  return reviews().filter(s => ['반복 오답', '복습 필요'].includes(s.label));
}

function reviewItemsForFilter() {
  return reviews().filter(s => {
    if (reviewChapterId && s.q.chapter_id !== reviewChapterId) return false;
    if (reviewMode !== 'history') return !note(s.q.id).mastered;
    if (reviewRepeated && s.wrong < 3) return false;
    return reviewStatus === 'all' || (reviewStatus === 'wrong' ? !s.last?.correct : !!s.last?.correct);
  });
}

function reviewItemMarkup(s) {
  const q = s.q, n = note(q.id);
  const display = questionPresentation(q);
  return `<article class="ox-review-item" data-review-question="${esc(q.id)}">
    <div class="ox-review-meta">
      <p class="ox-source">${esc(chapters.get(q.chapter_id).display_name)}</p>
      <span class="ox-sub">누적 ${s.wrong}회 오답</span>
    </div>
    <p class="ox-short-prompt">${esc(display.prompt)}</p>
    <div class="ox-history-badges"><span class="ox-badge">${s.last?.correct ? '다시 맞힘' : '아직 틀림'}</span>${s.wrong >= 3 ? '<span class="ox-badge ox-danger">반복 오답</span>' : ''}${n.mastered ? '<span class="ox-badge">복습 완료</span>' : ''}</div>
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
      ${button(n.mastered ? '완료 취소' : '복습 완료', 'master', `data-id="${q.id}"`)}
    </div>
  </article>`;
}

function review() {
  const visible = reviewItemsForFilter();
  const history = reviewMode === 'history';
  const all = reviews().filter(s => !reviewChapterId || s.q.chapter_id === reviewChapterId);
  const statusOptions = [['all', '전체 이력', all.length], ['wrong', '아직 틀림', all.filter(s => !s.last?.correct).length], ['regained', '다시 맞힘', all.filter(s => s.last?.correct).length]];
  main.innerHTML = `
    ${reviewChapterId ? button('취약단원으로', 'nav', 'data-ox-route="weak"') : ''}
    <h2>${reviewChapterId ? esc(chapters.get(reviewChapterId).display_name) : '오답노트'}</h2>
    ${reviewChapterId ? `<p class="ox-sub">이전 오답 · 복습 완료한 문항 포함</p>${button('전체 단원 이력 보기', 'review-mode', 'data-mode="history"')}` : `<div class="ox-history-tabs" role="group" aria-label="오답노트 보기"><button type="button" class="mini-btn ox-filter" data-action="review-mode" data-mode="pending" aria-pressed="${!history}">복습 목록</button><button type="button" class="mini-btn ox-filter" data-action="review-mode" data-mode="history" aria-pressed="${history}">전체 이력</button></div>`}
    ${history ? `<div class="ox-history-filters" role="group" aria-label="오답 이력 상태">${statusOptions.map(([value, label, count]) => `<button type="button" class="mini-btn ox-filter" data-action="history-status" data-status="${value}" aria-pressed="${reviewStatus === value}">${label} ${count}</button>`).join('')}<button type="button" class="mini-btn ox-filter" data-action="history-repeat" aria-pressed="${reviewRepeated}">반복 오답만</button></div>` : ''}
    <p class="ox-sub">복습 완료로 표시해도 오답 이력은 유지돼요.</p>
    <section class="ox-review-panel" aria-label="오답노트 문항">
      <header class="ox-review-head">
        <h3>${history ? '오답 이력' : '복습 목록'}<span class="ox-review-count">${visible.length}문항</span></h3>
        ${visible.length ? button('모아 풀기', 'review-all', '', 'ox-primary') : ''}
      </header>
      ${visible.length ? visible.map(reviewItemMarkup).join('') : `<div class="ox-review-empty">
        <h3>${history ? '조건에 맞는 오답 이력이 없어요.' : '복습 목록에 남은 문항이 없어요.'}</h3>
        <p class="ox-sub">${history ? '전체 이력이나 다른 조건에서 확인해 보세요.' : '복습 완료한 문항은 전체 이력에서 확인할 수 있어요.'}</p>
        ${button('단원 골라 풀기', 'nav', 'data-ox-route="chapters"', 'ox-wide')}
      </div>`}
    </section>`;
}
