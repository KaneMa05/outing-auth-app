// Home is an authoritative server summary. Load the catalog only when navigating
// into learning, and cumulative counts only when opening the weakness view.
let learningDataLoaded = bootstrap.homeOnly !== true;
let attemptCountsLoaded = bootstrap.statisticsDeferred !== true;
let learningDataPending = null, attemptCountsPending = null, learningWriteVersion = 0;

async function ensureLearningData() {
  if (learningDataLoaded) return;
  if (!learningDataPending) learningDataPending = (async () => {
    const saved = await request('bootstrap', {summaryOnly:true,deferStatistics:true});
    if (!root.isConnected || bookAccessBlocked) return;
    Object.assign(data, saved.catalog);
    byId.clear();data.questions.forEach(q => byId.set(q.id,q));
    chapters.clear();data.chapters.forEach(c => chapters.set(c.id,c));
    collections.clear();data.collections.forEach(c => collections.set(c.id,c));
    collection = data.collections.find(c => c.accessible !== false)?.id || 'criminal-law';
    progress.clear();saved.progress.forEach(p => progress.set(p.question_id,p));
    attempts.splice(0,attempts.length,...saved.progress.map(p => ({id:p.question_id,answer:p.answer,correct:p.correct,seed:true})));
    notes.clear();saved.notes.forEach(updateNote);
    statistics.clear();Object.entries(saved.statistics || {}).forEach(([id,value]) => statistics.set(id,value));
    attemptCounts.clear();Object.entries(saved.attemptCounts || {}).forEach(([id,value]) => attemptCounts.set(id,value));
    todayCount = saved.todayCount;
    attemptCountsLoaded = saved.statisticsDeferred !== true;
    learningDataLoaded = true;
  })().finally(() => {learningDataPending = null;});
  return learningDataPending;
}

async function ensureAttemptCounts() {
  if (attemptCountsLoaded) return;
  if (!attemptCountsPending) attemptCountsPending = (async () => {
    const revision = learningWriteVersion;
    const saved = await request('attempt_counts');
    if (!root.isConnected || bookAccessBlocked || revision !== learningWriteVersion) return;
    attemptCounts.clear();Object.entries(saved.attemptCounts || {}).forEach(([id,value]) => attemptCounts.set(id,value));
    attemptCountsLoaded = true;
  })().finally(() => {attemptCountsPending = null;});
  return attemptCountsPending;
}

function renderDeferredLearning(version) {
  if (bookAccessBlocked || ['home','entry'].includes(route)
    || (learningDataLoaded && (route !== 'weak' || attemptCountsLoaded))) return false;
  renderNav();
  main.innerHTML = `<p class="ox-sub" role="status">${learningDataLoaded ? '학습 통계를 확인하고 있습니다.' : '학습 목록을 불러오는 중입니다.'}</p>${button('오늘 화면으로','nav','data-ox-route="home"','ox-wide')}`;
  (async () => {
    await ensureLearningData();
    if (version !== questionRenderVersion || !root.isConnected || bookAccessBlocked) return;
    if (route === 'weak') await ensureAttemptCounts();
    if (version === questionRenderVersion && root.isConnected && !bookAccessBlocked) render();
  })().catch(error => {
    if (version !== questionRenderVersion || !root.isConnected) return;
    main.innerHTML = `${button('다시 시도','retry-questions','','ox-primary')}${button('오늘 화면으로','nav','data-ox-route="home"')}`;
    showError(error);
  });
  return true;
}
