let activeChapterId = null;
const CHAPTER_SET_SIZES = [10, 15, 20];
let chapterSetSize = 10;

function showChapterSizePicker() {
  if (root.querySelector('.ox-set-size-dialog')) return;
  const trigger = root.querySelector('[data-action="chapter-size"]');
  const dialog = document.createElement('dialog');
  dialog.className = 'ox-set-size-dialog';
  dialog.setAttribute('aria-labelledby', 'ox-set-size-title');
  dialog.setAttribute('aria-describedby', 'ox-set-size-description');
  dialog.innerHTML = `<h2 id="ox-set-size-title">한 번에 풀 문항 수</h2>
    <p id="ox-set-size-description" class="ox-sub">단원 학습에서 풀 문항 수를 선택해주세요.</p>
    <div class="ox-set-size-options" role="group" aria-label="문항 수">
      ${CHAPTER_SET_SIZES.map(size => `<button type="button" data-chapter-size="${size}" aria-pressed="${size === chapterSetSize}" ${size === chapterSetSize ? 'autofocus' : ''}>${size}문항</button>`).join('')}
    </div>
    <button type="button" class="ox-set-size-close">닫기</button>`;
  dialog.addEventListener('click', event => {
    const option = event.target.closest('button[data-chapter-size]');
    if (option) {
      const size = Number(option.dataset.chapterSize);
      if (!CHAPTER_SET_SIZES.includes(size)) return;
      chapterSetSize = size;
      trigger.innerHTML = `한 번에 ${chapterSetSize}문항 <span aria-hidden="true">⌄</span>`;
      dialog.close();
    } else if (event.target.closest('.ox-set-size-close')) {
      dialog.close();
    } else if (event.target === dialog) {
      const bounds = dialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right
          || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
    }
  });
  dialog.addEventListener('close', () => {
    dialog.remove();
    if (trigger.isConnected) trigger.focus();
  }, { once: true });
  root.append(dialog);
  dialog.showModal();
}

function chapterQuestions(id) {
  return data.questions.filter(q => q.chapter_id === id).sort((a, b) =>
    Number(a.source_question_number) - Number(b.source_question_number)
    || String(a.source_option_label || '').localeCompare(String(b.source_option_label || ''), 'ko'));
}

function shuffleQuestionIds(ids) {
  const shuffled = [...ids];
  // Shuffle the entire eligible chapter before splitting it into study sets.
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function chapterCompletion(c) {
  const s = chapterStat(c);
  const questions = chapterQuestions(c.id);
  const wrong = questions.filter(q => {
    const last = stats(q.id).last;
    return last && !last.correct;
  });
  return { ...s, questions, wrong, complete: c.question_count > 0 && questions.length === c.question_count && s.solved === c.question_count };
}

function nextChapter(c) {
  const ordered = data.chapters.filter(item => item.collection_id === c.collection_id).sort((a, b) => a.sort_order - b.sort_order);
  return ordered[ordered.findIndex(item => item.id === c.id) + 1] || null;
}

function selectChapterScope(c) {
  collection = c.collection_id;
  if (collection === 'criminal-law') criminalLawPart = String(c.part_title).replace(/\s/g, '').startsWith('형법각론') ? 'specific' : 'general';
}

function startChapter(id, mode = 'learn') {
  const c = chapters.get(id);
  if (!c) return;
  activeChapterId = id;
  selectChapterScope(c);
  const s = chapterCompletion(c);
  if (mode === 'learn' && s.complete) {
    route = 'chapter-complete';
    render();
    return;
  }
  const questions = mode === 'wrong' ? s.wrong : mode === 'all' ? s.questions : s.questions.filter(q => !stats(q.id).last);
  // A sampled chapter may have no unseen items; it is still not fully completed.
  const selected = questions.length || mode === 'wrong' ? questions : s.questions;
  startChapterSet(c, shuffleQuestionIds(selected.map(q => q.id)), mode);
}

function startChapterSet(c, ids, mode) {
  start(ids.slice(0, chapterSetSize), c.display_name, {
    chapterId: c.id, chapterMode: mode, chapterRemaining: ids.slice(chapterSetSize),
  });
}

function remainingChapterIds() {
  return session.chapterRemaining.filter(id => byId.has(id)
    && (session.chapterMode === 'all' || (session.chapterMode === 'wrong'
      ? stats(id).last && !stats(id).last.correct : !stats(id).last)));
}

function continueChapterSet() {
  const c = chapters.get(session?.chapterId);
  if (!c) return;
  startChapterSet(c, remainingChapterIds(), session.chapterMode);
}

function chapterSessionResult() {
  const c = chapters.get(session.chapterId);
  if (!c) { chapterView(); return; }
  const s = chapterCompletion(c);
  const remaining = remainingChapterIds();
  if (!remaining.length && s.complete) {
    activeChapterId = c.id;
    chapterCompletionView();
    return;
  }
  const right = session.answers.filter(a => a.correct).length;
  main.innerHTML = `<section class="ox-completion">
    <p class="ox-sub">${esc(c.display_name)}</p>
    <h2>${session.ids.length}문항 학습 완료</h2>
    <div class="ox-completion-score"><span>이번 학습 정답</span><strong>${right}<small> / ${session.ids.length}</small></strong></div>
    <p class="ox-sub">단원 진도 ${s.solved} / ${c.question_count}문항</p>
    <div class="ox-completion-actions">
      ${remaining.length ? button(`다음 ${Math.min(chapterSetSize, remaining.length)}문항 풀기`, 'chapter-continue', '', 'ox-primary ox-wide')
        : button('이어서 학습하기', 'chapter', `data-id="${c.id}"`, 'ox-primary ox-wide')}
      ${button('단원 목록으로', 'nav', 'data-ox-route="chapters"', 'ox-wide')}
    </div>
  </section>`;
}

function chapterCompletionView() {
  const c = chapters.get(activeChapterId);
  if (!c) { chapterView(); return; }
  const s = chapterCompletion(c);
  if (!s.complete) { chapterView(); return; }
  const next = nextChapter(c);
  const nextButton = (primary) => next
    ? button('다음 단원 학습하기', 'chapter-next', `data-id="${next.id}"`, `${primary ? 'ox-primary ' : ''}ox-wide`)
    : button('다른 단원 선택하기', 'nav', 'data-ox-route="chapters"', `${primary ? 'ox-primary ' : ''}ox-wide`);
  main.innerHTML = `<section class="ox-completion">
    <p class="ox-sub">${esc(c.display_name)}</p>
    <h2>1회독 완료</h2>
    <p class="ox-sub">${s.solved} / ${c.question_count}문항 학습</p>
    <div class="ox-completion-score"><span>정답률</span><strong>${Math.round(s.accuracy)}<small>%</small></strong></div>
    <div class="ox-completion-wrong"><span>남은 오답</span><strong>${s.wrong.length}문항</strong></div>
    <div class="ox-completion-actions">
      ${s.wrong.length ? button('오답만 다시 풀기', 'chapter-wrong', `data-id="${c.id}"`, 'ox-primary ox-wide') : ''}
      ${nextButton(!s.wrong.length)}
      ${button(`${chapterSetSize}문항씩 다시 풀기`, 'chapter-restart', `data-id="${c.id}"`, 'ox-wide')}
    </div>
    ${next ? `<p class="ox-completion-next">다음 · ${esc(next.display_name)}</p>` : ''}
  </section>
  ${button('단원 목록으로', 'nav', 'data-ox-route="chapters"', 'ox-wide')}`;
}

function seedChapterCompletionPreview() {
  // Explicit local demo URL only. No server or persistent user records are written.
  if (!['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)
      || new URLSearchParams(location.search).get('ox-preview') !== 'chapter-complete') return;
  const c = data.chapters[0];
  for (const q of chapterQuestions(c.id)) {
    if (!stats(q.id).last) add(q.id, q.correct_answer, true);
  }
  activeChapterId = c.id;
  selectChapterScope(c);
  route = 'chapter-complete';
}
