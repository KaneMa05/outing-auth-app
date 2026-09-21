// Injected into the production mount closure by build-ox-learning.py.
const questionTextLoads = new Map();
let questionRenderVersion = 0;

function questionsForCurrentView() {
  if (typeof bookAccessBlocked !== 'undefined' && bookAccessBlocked) return [];
  if (route === 'quiz') {
    const start = Math.floor(session.index / 20) * 20;
    return session.ids.slice(start, start + 20).map(id => byId.get(id));
  }
  if (route === 'review') return reviewItemsForFilter().map(item => item.q);
  if (route === 'bookmarks') return bookmarkedQuestions();
  return [];
}

async function loadQuestionTexts(questions) {
  const missing = [...new Map(questions.filter(q => typeof q.prompt !== 'string').map(q => [q.id, q])).values()];
  const waiting = new Set(missing.map(q => questionTextLoads.get(q.id)).filter(Boolean));
  const fresh = missing.filter(q => !questionTextLoads.has(q.id));
  // At most 50 texts per request; large notebooks do not create a request storm.
  if (fresh.length) {
    const operation = (async () => {
      for (let offset = 0; offset < fresh.length; offset += 50) {
        const batch = fresh.slice(offset, offset + 50);
        const response = await request('questions', { questions: batch.map(q => ({id:q.id,version:q.version})) });
        const received = new Map((response.questions || []).map(q => [q.id,q]));
        // Validate the complete batch before changing any current question.
        for (const q of batch) {
          const value = received.get(q.id);
          if (!value || value.version !== q.version || typeof value.prompt !== 'string' || typeof value.context !== 'string') {
            throw Object.assign(new Error('question_changed'), {code:'question_changed'});
          }
        }
        for (const q of batch) {
          const value = received.get(q.id);
          q.prompt = value.prompt;
          q.context = value.context;
        }
      }
    })();
    const tracked = operation.finally(() => {
      for (const q of fresh) if (questionTextLoads.get(q.id) === tracked) questionTextLoads.delete(q.id);
    });
    for (const q of fresh) questionTextLoads.set(q.id, tracked);
    waiting.add(tracked);
  }
  await Promise.all(waiting);
}

function render() {
  const version = ++questionRenderVersion;
  const needed = questionsForCurrentView();
  if (!needed.some(q => typeof q.prompt !== 'string')) { renderLoadedView(); return; }
  renderNav();
  main.innerHTML = `<p class="ox-sub" role="status">문제를 불러오는 중입니다.</p>${button('돌아가기', 'nav', `data-ox-route="${origin}"`, 'ox-wide')}`;
  loadQuestionTexts(needed).then(() => {
    if (version === questionRenderVersion && root.isConnected) render();
  }).catch(error => {
    if (version !== questionRenderVersion || !root.isConnected) return;
    main.innerHTML = `${button('다시 시도', 'retry-questions', '', 'ox-primary')}${button('돌아가기', 'nav', `data-ox-route="${origin}"`)}`;
    showError(error);
  });
}
