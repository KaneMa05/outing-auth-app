function start(ids, label, options = {}) {
  if (!ids.length) return;
  if (['home', 'chapters', 'bookmarks', 'review', 'weak'].includes(route)) origin = route;
  else if (route === 'chapter-complete' || (route === 'result' && options.chapterId)) origin = 'chapters';
  session = { ids: [...new Set(ids)], index: 0, answers: [], label, chapterId: options.chapterId || null,
    chapterMode: options.chapterMode || 'learn', chapterRemaining: [...(options.chapterRemaining || [])] };
  route = 'quiz';
  render();
}
