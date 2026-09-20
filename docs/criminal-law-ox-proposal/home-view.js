function home() {
  const due = pendingReviewItems();
  const today = attempts.filter(a => !a.seed).length;
  const completed = isSessionComplete();
  const answered = session ? session.ids.filter((id, index) => session.answers[index]).length : 0;
  const continuing = session?.ids.length && !completed;
  main.innerHTML = `<h2>오늘 학습</h2>
    <section class="ox-card ox-hero">
      <div class="ox-row"><span></span><span class="ox-sub">오늘 ${today}문항 풀이</span></div>
      <h3>${completed ? '오늘 학습 완료' : continuing ? esc(session.label) : '오늘 학습할 단원'}</h3>
      <p class="ox-sub">${completed ? `${esc(session.label)} · ${session.ids.length}문항을 모두 풀었어요.` : continuing ? `${answered} / ${session.ids.length}문항 풀이` : `선택한 단원의 안 푼 문제를 ${chapterSetSize}문항씩 풀어요.`}</p>
      ${button(completed ? '학습 결과 보기' : continuing ? '학습 이어하기 →' : '단원 선택하고 시작 →', completed ? 'session-result' : continuing ? 'resume' : 'daily', '', 'ox-primary ox-wide')}
      ${completed || continuing ? button('다른 단원 선택', 'daily', '', 'ox-wide') : ''}
    </section>
    <button type="button" class="ox-review-shortcut" data-action="review-needed" ${due.length ? '' : 'disabled'}>
      <span>복습할 오답</span><span class="ox-review-shortcut-count"><strong>${due.length}</strong> 문항${due.length ? '<span aria-hidden="true">›</span>' : ''}</span>
    </button>`;
}

function isSessionComplete() {
  return !!session?.ids.length && session.ids.every((id, index) => !!session.answers[index]);
}

function showSessionResult() {
  if (!isSessionComplete()) return;
  session.index = session.ids.length;
  route = 'result';
  render();
}
