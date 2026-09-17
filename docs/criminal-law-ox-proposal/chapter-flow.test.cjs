const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = name => fs.readFileSync(path.join(__dirname, name), 'utf8');
const source = read('criminal-law-ox-preview.html');
const data = JSON.parse(source.match(/<script type="application\/json" id="criminal-ox-data">([\s\S]*?)<\/script>/)[1]);
const full = JSON.parse(read('complete-chapter-questions.json'));
data.questions = full.concat(data.questions.filter(q => q.chapter_id !== full[0].chapter_id));
const context = {
  assert, data, URLSearchParams,
  location: { hostname: 'localhost', search: '?ox-preview=chapter-complete' },
  main: { innerHTML: '' },
  byId: new Map(data.questions.map(q => [q.id, q])),
  chapters: new Map(data.chapters.map(c => [c.id, c])),
  esc: value => String(value),
  button: (label, action, extra, classes) => `<button class="${classes}" data-action="${action}" ${extra}>${label}</button>`,
  render: () => {}, chapterView: () => {},
};
vm.createContext(context);
// Reuse the original attempt and latest-answer logic, not a test reimplementation.
const state = source.slice(source.indexOf('    const attempts = [];'), source.indexOf('    const meter = '));
vm.runInContext(state + '\nlet criminalLawPart="general";\n' + read('session-start.js') + '\n' + read('chapter-flow.js'), context);
vm.runInContext(`
  const first = data.chapters[0];
  assert.equal(chapterCompletion(first).complete, false);
  seedChapterCompletionPreview();
  assert.equal(chapterCompletion(first).complete, true);
  assert.equal(chapterCompletion(first).wrong.length, 3);
  assert.equal(Math.round(chapterCompletion(first).accuracy), 95);
  const memo = note('criminal-law-003').text;
  note('criminal-law-003').bookmark = true;
  const historyCount = attempts.length;
  startChapter(first.id, 'wrong');
  assert.equal(session.ids.length, 3);
  assert.equal(session.chapterId, first.id);
  assert.equal(origin, 'chapters');
  for (const id of session.ids) add(id, byId.get(id).correct_answer);
  assert.equal(chapterCompletion(first).wrong.length, 0);
  assert.equal(chapterCompletion(first).accuracy, 100);
  assert.equal(attempts.length, historyCount + 3);
  assert.equal(note('criminal-law-003').text, memo);
  assert.equal(note('criminal-law-003').bookmark, true);
  chapterCompletionView();
  assert.ok(main.innerHTML.includes('ox-primary ox-wide" data-action="chapter-next"'));
  assert.ok(!main.innerHTML.includes('data-action="chapter-wrong"'));
  startChapter(first.id, 'all');
  assert.equal(session.ids.length, 10);
  assert.equal(session.chapterRemaining.length, 45);
  assert.equal(attempts.length, historyCount + 3);
  assert.equal(chapterCompletion(first).complete, true);
  // A completed chapter being replayed must still offer the rest of this pass.
  chapterSessionResult();
  assert.ok(main.innerHTML.includes('다음 10문항 풀기'));
  assert.ok(!main.innerHTML.includes('<h2>1회독 완료</h2>'));
  assert.equal(nextChapter(first).id, data.chapters[1].id);
  const last = data.chapters.filter(c => c.collection_id === first.collection_id).sort((a,b) => a.sort_order - b.sort_order).at(-1);
  assert.equal(nextChapter(last), null);
  // Every chapter pass is split into 10/10/10/10/10/5 with no duplicates or gaps.
  attempts.length = 0;
  route = 'chapters';
  startChapter(first.id);
  const visited = [], sizes = [];
  while (true) {
    sizes.push(session.ids.length);
    visited.push(...session.ids);
    session.answers = session.ids.map(id => {
      const answer = byId.get(id).correct_answer;
      add(id, answer);
      return {id, answer, correct:true};
    });
    session.index = session.ids.length;
    route = 'result';
    chapterSessionResult();
    if (!remainingChapterIds().length) break;
    assert.equal(chapterCompletion(first).complete, false);
    if (remainingChapterIds().length === 5) assert.ok(main.innerHTML.includes('다음 5문항 풀기'));
    continueChapterSet();
  }
  assert.deepEqual(sizes, [10,10,10,10,10,5]);
  assert.equal(new Set(visited).size, 55);
  assert.equal(chapterCompletion(first).complete, true);
  assert.ok(main.innerHTML.includes('<h2>1회독 완료</h2>'));
  // Wrong-answer sessions use the same bound without losing their remaining IDs.
  for (const q of chapterQuestions(first.id).slice(0,15)) add(q.id, q.correct_answer==='O'?'X':'O');
  startChapter(first.id,'wrong');
  assert.equal(session.ids.length,10);
  assert.equal(session.chapterRemaining.length,5);
  for (const id of session.ids) add(id,byId.get(id).correct_answer);
  continueChapterSet();
  assert.equal(session.ids.length,5);
  // Repeated answers to one question must not substitute for unseen questions.
  attempts.length = 0;
  const firstQuestions = chapterQuestions(first.id);
  for (const q of firstQuestions.slice(0,-1)) add(q.id, q.correct_answer);
  for (let i=0; i<5; i++) add(firstQuestions[0].id, firstQuestions[0].correct_answer);
  assert.equal(chapterCompletion(first).complete, false);
  route = 'chapters';
  startChapter(first.id);
  assert.equal(session.ids.length, 1);
  const finalQuestion = firstQuestions.at(-1);
  add(finalQuestion.id, finalQuestion.correct_answer === 'O' ? 'X' : 'O');
  assert.equal(chapterCompletion(first).complete, true);
  assert.equal(chapterCompletion(first).wrong.length, 1);
  startChapter(first.id);
  assert.equal(route, 'chapter-complete');
  // A chapter with only its representative question loaded cannot be complete.
  const sampled = data.chapters[1];
  for (const q of chapterQuestions(sampled.id)) add(q.id, q.correct_answer);
  assert.equal(chapterCompletion(sampled).complete, false);
`, context);
console.log('PASS: 10-question sets, final short set, full coverage, replay/review continuation, latest-answer accuracy and record preservation');
