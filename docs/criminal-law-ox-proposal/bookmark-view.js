function bookmarkedQuestions() {
  return data.questions.filter(q => notes.get(q.id)?.bookmark);
}

function bookmarkView() {
  const saved = bookmarkedQuestions();
  main.innerHTML = `
    <div class="ox-page-heading"><h2>북마크</h2>${button('단원으로', 'nav', 'data-ox-route="chapters"')}</div>
    <section class="ox-review-panel" aria-label="북마크한 문제">
      <header class="ox-review-head">
        <h3>저장한 문제 <span class="ox-review-count">${saved.length}문항</span></h3>
        ${saved.length ? button('모아 풀기', 'bookmarks-all', '', 'ox-primary') : ''}
      </header>
      ${saved.length ? saved.map(q => `<article class="ox-review-item">
        <p class="ox-source">${esc(chapters.get(q.chapter_id).display_name)}</p>
        <p class="ox-short-prompt">${esc(questionPresentation(q).prompt)}</p>
        <div class="ox-review-actions">
          ${button('풀기', 'one', `data-id="${q.id}"`, 'ox-primary')}
          ${button('북마크 해제', 'bookmark', `data-id="${q.id}"`)}
        </div>
      </article>`).join('') : `<div class="ox-review-empty"><h3>북마크한 문제가 없어요.</h3><p class="ox-sub">문제 화면의 ☆ 북마크를 눌러 저장해요.</p>${button('단원 골라 풀기', 'nav', 'data-ox-route="chapters"', 'ox-wide')}</div>`}
    </section>`;
}
