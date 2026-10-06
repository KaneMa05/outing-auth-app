// Inserted into the local preview module by build-local-preview.py.
let reviewMode = 'pending', reviewChapterIds = null, reviewStatus = 'all', reviewRepeated = false;
let reviewSort = 'recent', reviewFromWeak = false;
let reviewFiltersOpen = false;
let reviewControlRestore = null;

function openReview(mode = 'pending', chapterId = null, fromWeak = false, collectionId = null) {
  if (chapterId && !chapters.has(chapterId)) return;
  if (collectionId && !collections.has(collectionId)) return;
  reviewMode = mode === 'history' ? 'history' : 'pending';
  reviewChapterIds = chapterId ? new Set([chapters.get(chapterId).id]) : collectionId
    ? new Set(data.chapters.filter(c => c.collection_id === collectionId).map(c => c.id)) : null;
  reviewFromWeak = fromWeak;
  reviewStatus = 'all';
  reviewRepeated = false;
  reviewFiltersOpen = false;
  route = 'review';
}

function pendingReviewItems() {
  return reviews().filter(s => ['반복 오답', '복습 필요'].includes(s.label));
}

function matchesReviewScope(s) {
  return reviewChapterIds === null || reviewChapterIds.has(chapters.get(s.q.chapter_id)?.id || s.q.chapter_id);
}

function reviewItemsForFilter() {
  return reviews().filter(s => {
    if (!matchesReviewScope(s)) return false;
    if (reviewMode !== 'history') return !note(s.q.id).mastered;
    if (reviewRepeated && s.wrong < 3) return false;
    return reviewStatus === 'all' || (reviewStatus === 'wrong' ? !s.last?.correct : !!s.last?.correct);
  }).sort((a, b) => {
    const recent = (Date.parse(b.last?.answered_at || '') || 0) - (Date.parse(a.last?.answered_at || '') || 0);
    return (reviewSort === 'wrong' ? b.wrong - a.wrong || recent : recent || b.wrong - a.wrong)
      || a.q.id.localeCompare(b.q.id, 'ko', { numeric: true });
  });
}

function setReviewFilter(name, value, checked) {
  if (name === 'chapter') {
    if (value.startsWith('collection:')) {
      const id = value.slice('collection:'.length);
      if (!collections.has(id)) return;
      reviewChapterIds = new Set(data.chapters.filter(c => c.collection_id === id).map(c => c.id));
    } else {
      if (value && !chapters.has(value)) return;
      reviewChapterIds = value ? new Set([chapters.get(value).id]) : null;
    }
  } else if (name === 'chapter-toggle' || name === 'collection-toggle') {
    const ids = name === 'chapter-toggle' ? (chapters.has(value) ? [chapters.get(value).id] : [])
      : data.chapters.filter(c => c.collection_id === value).map(c => c.id);
    if (!ids.length) return;
    if (reviewChapterIds === null) reviewChapterIds = new Set();
    ids.forEach(id => checked ? reviewChapterIds.add(id) : reviewChapterIds.delete(id));
  } else if (name === 'all-chapters') {
    reviewChapterIds = checked ? null : new Set();
  } else if (name === 'sort' && ['recent', 'wrong'].includes(value)) reviewSort = value;
}

function reviewScopeLabel() {
  if (reviewChapterIds === null) return '전체 단원';
  const selected = data.chapters.filter(c => reviewChapterIds.has(c.id));
  if (!selected.length) return '단원 선택 없음';
  if (selected.length === 1) return selected[0].display_name;
  const collection = collections.get(selected[0].collection_id);
  if (collection && selected.every(c => c.collection_id === collection.id)
    && selected.length === data.chapters.filter(c => c.collection_id === collection.id).length) return collection.name + ' 전체';
  return `${selected.length}개 단원 선택`;
}

function reviewControls() {
  return `<div class="ox-review-controls">
    <fieldset class="ox-review-chapter-picker"><legend>과목 · 단원 <span>여러 개 선택 가능</span></legend>
      <p class="ox-sub ox-review-selection">${esc(reviewScopeLabel())}</p>
      <label class="ox-review-choice"><input type="checkbox" data-review-filter="all-chapters" value="all" ${reviewChapterIds === null ? 'checked' : ''}><span>전체 단원</span></label>
      <div class="ox-review-chapter-list">${data.collections.map(collection => {
        const options = data.chapters.filter(c => c.collection_id === collection.id).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
        const selected = options.filter(c => reviewChapterIds?.has(c.id)).length;
        return options.length ? `<fieldset class="ox-review-chapter-group"><legend>${esc(collection.name)}</legend>
          <label class="ox-review-choice ox-review-collection"><input type="checkbox" data-review-filter="collection-toggle" value="${esc(collection.id)}" ${selected === options.length ? 'checked' : ''} ${selected > 0 && selected < options.length ? 'data-review-mixed' : ''}><span>${esc(collection.name)} 전체</span></label>
          ${options.map(c => `<label class="ox-review-choice"><input type="checkbox" data-review-filter="chapter-toggle" value="${esc(c.id)}" ${reviewChapterIds?.has(c.id) ? 'checked' : ''}><span>${esc(c.display_name)}</span></label>`).join('')}
        </fieldset>` : '';
      }).join('')}</div>
    </fieldset>
    <label>정렬<select data-review-filter="sort"><option value="recent" ${reviewSort === 'recent' ? 'selected' : ''}>최신순</option><option value="wrong" ${reviewSort === 'wrong' ? 'selected' : ''}>누적 오답 횟수순</option></select></label>
  </div>`;
}

function reviewFilterSummary() {
  const scope = reviewScopeLabel();
  const values = [scope, reviewSort === 'recent' ? '최신순' : '누적 오답 횟수순'];
  if (reviewMode === 'history' && reviewStatus !== 'all') values.push(reviewStatus === 'wrong' ? '아직 틀림' : '다시 맞힘');
  if (reviewMode === 'history' && reviewRepeated) values.push('반복 오답만');
  return values.join(' · ');
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
  const all = reviews().filter(matchesReviewScope);
  const filterSummary = reviewFilterSummary();
  const statusOptions = [['all', '전체 이력', all.length], ['wrong', '아직 틀림', all.filter(s => !s.last?.correct).length], ['regained', '다시 맞힘', all.filter(s => s.last?.correct).length]];
  main.innerHTML = `
    ${reviewFromWeak ? button('취약단원으로', 'nav', 'data-ox-route="weak"') : ''}
    <h2>${reviewChapterIds === null ? '오답노트' : esc(reviewScopeLabel()) + ' · 오답노트'}</h2>
    <div class="ox-review-toolbar">
      <div class="ox-history-tabs" role="group" aria-label="오답노트 보기"><button type="button" class="mini-btn ox-filter" data-action="review-mode" data-mode="pending" aria-pressed="${!history}">복습 목록</button><button type="button" class="mini-btn ox-filter" data-action="review-mode" data-mode="history" aria-pressed="${history}">전체 이력</button></div>
      <button type="button" class="mini-btn ox-review-filter-toggle" data-action="review-filters-toggle" aria-expanded="${reviewFiltersOpen}" aria-controls="ox-review-filter-panel" title="${esc(filterSummary)}"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 5h14M3 10h14M3 15h14M7 3v4M13 8v4M8 13v4" /></svg>필터</button>
    </div>
    <section id="ox-review-filter-panel" class="ox-review-filter-panel" aria-label="오답노트 필터" ${reviewFiltersOpen ? '' : 'hidden'}>
      ${reviewControls()}
      ${history ? `<div class="ox-history-filters" role="group" aria-label="오답 이력 상태">${statusOptions.map(([value, label, count]) => `<button type="button" class="mini-btn ox-filter" data-action="history-status" data-status="${value}" aria-pressed="${reviewStatus === value}">${label} ${count}</button>`).join('')}<button type="button" class="mini-btn ox-filter" data-action="history-repeat" aria-pressed="${reviewRepeated}">반복 오답만</button></div>` : ''}
      <p class="ox-sub ox-review-filter-note">복습 완료로 표시해도 오답 이력은 유지돼요.</p>
      <div class="ox-review-filter-actions">${button('초기화', 'review-filters-reset', '', 'ox-plain')}${button('닫기', 'review-filters-close', '', 'ox-primary')}</div>
    </section>
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
  main.querySelectorAll('[data-review-mixed]').forEach(input => { input.indeterminate = true; });
  if (reviewControlRestore) {
    const { name, value, scrollTop } = reviewControlRestore;
    const list = main.querySelector('.ox-review-chapter-list');
    if (list) list.scrollTop = scrollTop;
    Array.from(main.querySelectorAll('[data-review-filter]')).find(input => input.dataset.reviewFilter === name && input.value === value)?.focus({preventScroll:true});
    reviewControlRestore = null;
  }
}
