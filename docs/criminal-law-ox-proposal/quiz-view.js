function quiz() {
  const q = byId.get(session.ids[session.index]);
  const display = questionPresentation(q);
  const c = chapters.get(q.chapter_id), a = session.answers[session.index], n = note(q.id);
  const pencilPath = a?.correct
    ? 'M53 13 C37 5 19 14 13 31 C6 49 17 66 34 69 C52 73 67 59 69 42 C71 26 61 13 47 11 C35 8 23 15 18 24'
    : 'M19 65 C29 52 41 41 49 30 C54 23 58 19 62 15';
  const pencilFilter = `ox-pencil-${a?.correct ? 'circle' : 'slash'}`;
  main.innerHTML = `<div class="ox-quiz">
    <div class="ox-quiz-toolbar">
      <button type="button" class="ox-quiz-tool" data-action="leave">← 나가기</button>
      <span class="ox-quiz-count"><strong>${session.index + 1}</strong> / ${session.ids.length}</span>
      <button type="button" class="ox-quiz-tool" data-action="bookmark" data-id="${q.id}" aria-pressed="${n.bookmark}">${n.bookmark ? '★ 저장됨' : '☆ 북마크'}</button>
    </div>
    ${meter((session.index + (a ? 1 : 0)) / session.ids.length * 100, '세트 진행률')}
    <section class="ox-quiz-paper${a ? ' ox-graded' : ''}" aria-label="문제와 해설">
      <header class="ox-quiz-heading">
        <h3>${esc(c.display_name)}</h3>
      </header>
      ${display.context ? `<div class="ox-context"><p>${esc(display.context)}</p></div>` : ''}
      <div class="ox-question">
      ${esc(display.prompt)}
      ${a ? `<svg class="ox-grade-mark" viewBox="0 0 80 80" aria-hidden="true" focusable="false">
        <defs>
          <filter id="${pencilFilter}" x="-15%" y="-15%" width="130%" height="130%" color-interpolation-filters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="3" seed="12" result="grain" />
            <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1.8 -.35" result="pencil-grain" />
            <feComposite in="SourceGraphic" in2="pencil-grain" operator="in" />
          </filter>
        </defs>
        <g filter="url(#${pencilFilter})">
          <path d="${pencilPath}" stroke-width="5.4" opacity=".85" />
          <path d="${pencilPath}" transform="translate(-1 .8)" stroke-width="2" opacity=".7" />
          <path d="${pencilPath}" transform="translate(1.2 -.6)" stroke-width="1.2" opacity=".65" />
        </g>
      </svg>` : ''}
      </div>
      <div class="ox-answer-grid">
        ${['O', 'X'].map(v => `<button type="button" class="ox-answer ${a && a.answer === v ? 'ox-selected' : ''}" data-action="answer" data-answer="${v}" ${a ? 'disabled' : ''} aria-label="${v}: ${v === 'O' ? '옳다' : '틀리다'}"><span class="ox-answer-symbol ox-symbol-${v.toLowerCase()}" aria-hidden="true"></span></button>`).join('')}
      </div>
      <div aria-live="polite">
        ${a ? `<section class="ox-quiz-feedback">
          <div class="ox-grade-result">
            <div class="ox-grade-copy"><h3 class="${a.correct ? 'ox-correct' : 'ox-incorrect'}">${a.correct ? '정답이에요' : '오답이에요'}</h3><span class="ox-sub">정답 ${q.correct_answer}</span></div>
          </div>
          <div class="ox-explanation">${safeHtml(q.explanation_html)}</div>
          ${questionStatsMarkup(q)}
          <details><summary>나만의 메모 ${n.text ? '· 작성됨' : ''}</summary><textarea id="ox-memo" class="ox-note" rows="3" aria-label="나만의 메모">${esc(n.text)}</textarea>${button('메모 저장', 'memo', `data-id="${q.id}"`)}<div id="ox-message" class="ox-live" role="status"></div></details>
        </section>` : '<p class="ox-quiz-hint">답을 선택하면 해설을 확인할 수 있어요.</p>'}
      </div>
    </section>
    ${a ? button(session.index === session.ids.length - 1 ? '학습 결과 보기' : '다음 문제 →', 'next', '', 'ox-primary ox-wide') : ''}
  </div>`;
}
