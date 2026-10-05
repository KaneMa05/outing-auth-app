const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');

// Exercise the shipped mount and click handler, not a copied stats calculation.
function fixture() {
  const main = { innerHTML: '', querySelectorAll: () => [] };
  const nodes = new Map(['nav', '.ox-header', '.ox-app-nav'].map(key => [key, { style: {} }]));
  nodes.set('main', main);
  const listeners = new Map();
  const root = {
    isConnected: true,
    querySelector: selector => nodes.get(selector) || null,
    setAttribute() {}, removeAttribute() {},
    addEventListener: (type, handler) => listeners.set(type, handler),
  };
  const host = { innerHTML: '', querySelector: () => root };
  const question = { id: 'q1', chapter_id: 'c1', version: 1, prompt: '복습 문항', context: '', correct_answer: 'X' };
  let progress = { question_id: 'q1', content_version: 1, answer: 'X', correct: true, wrong_count: 3 };
  let counts = { attempts: 4, correct: 1, wrong: 3 };
  const submissions = new Map(), requests = [];
  let rejectAfterSave = false, rejectBeforeSave = false, rejectRefresh = false, release = null;
  const context = vm.createContext({
    crypto, console,
    DOMParser: class { parseFromString() { return { body: { childNodes: [] } }; } },
    document: { createElement: () => ({ dataset: {}, setAttribute() {} }) },
  });
  // Error rendering is a simple element stub; navigation/rendering still uses production code.
  main.prepend = node => nodes.set('[data-ox-error]', node);
  vm.runInContext(fs.readFileSync('criminal-law-ox.js', 'utf8').replace('export function mount', 'function mount'), context);
  context.mount(host, {
    bootstrap: {
      catalog: { collections: [{ id: 'law', name: '형법', accessible: true }],
        chapters: [{ id: 'c1', collection_id: 'law', display_name: '정범 및 공범론', question_count: 1 }],
        questions: [structuredClone(question)] },
      progress: [structuredClone(progress)], attemptCounts: { q1: structuredClone(counts) },
      notes: [], statistics: {}, todayCount: 0,
    },
    request: async (action, body) => {
      requests.push({ action, body: structuredClone(body) });
      if (action === 'bootstrap') {
        if (rejectRefresh) { rejectRefresh = false; throw Object.assign(Error('refresh failed'), { code: 'ox_unavailable' }); }
        return { progress: [structuredClone(progress)], attemptCounts: { q1: structuredClone(counts) },
          notes: [], statistics: {}, todayCount: submissions.size };
      }
      assert.equal(action, 'submit');
      if (rejectBeforeSave) { rejectBeforeSave = false; throw Object.assign(Error('not saved'), { code: 'ox_unavailable' }); }
      if (release) await new Promise(resolve => { release.resolve = resolve; });
      if (!submissions.has(body.submissionId)) {
        const correct = body.answer === question.correct_answer;
        progress = { ...progress, answer: body.answer, correct, wrong_count: progress.wrong_count + Number(!correct), answered_at: `2026-09-28T00:00:0${submissions.size}.000Z` };
        counts = { attempts: counts.attempts + 1, correct: counts.correct + Number(correct), wrong: counts.wrong + Number(!correct) };
        submissions.set(body.submissionId, structuredClone({ question, progress, attemptCounts: { q1: counts }, statistics: {} }));
      }
      if (rejectAfterSave) { rejectAfterSave = false; throw Object.assign(Error('response lost'), { code: 'ox_unavailable' }); }
      return structuredClone(submissions.get(body.submissionId));
    },
  });
  const click = (action, dataset = {}) => listeners.get('click')({
    target: { closest: () => ({ dataset: { action, ...dataset }, disabled: false }) },
  });
  return { click, requests, html: () => main.innerHTML,
    loseResponse: () => { rejectAfterSave = true; },
    failSave: () => { rejectBeforeSave = true; },
    failRefresh: () => { rejectRefresh = true; },
    defer: () => { release = {}; return () => { const resolve = release.resolve; release = null; resolve(); }; },
  };
}

test('weak chapter replay immediately updates the notebook count without reload', async () => {
  const f = fixture();
  await f.click('nav', { oxRoute: 'weak' });
  await f.click('history-chapter-start', { id: 'c1' });
  await f.click('answer', { answer: 'O' });
  assert.match(f.html(), /오답이에요/);
  await f.click('leave');
  await f.click('nav', { oxRoute: 'review' });
  assert.match(f.html(), /누적 4회 오답/);
  assert.match(f.html(), /아직 틀림/);
  assert.equal(f.requests.length, 1);
});

test('chapter history replay and result navigation retain the updated notebook count', async () => {
  const f = fixture();
  await f.click('nav', { oxRoute: 'weak' });
  await f.click('history-chapter', { id: 'c1' });
  assert.match(f.html(), /누적 3회 오답/);
  await f.click('review-all');
  await f.click('answer', { answer: 'O' });
  await f.click('next');
  await f.click('nav', { oxRoute: 'review' });
  assert.match(f.html(), /누적 4회 오답/);
  await f.click('one', { id: 'q1' });
  await f.click('answer', { answer: 'X' });
  await f.click('leave');
  assert.match(f.html(), /누적 4회 오답/);
  assert.match(f.html(), /다시 맞힘/);
});

test('navigation while saving waits for the answer before displaying the new count', async () => {
  const f = fixture();
  await f.click('nav', { oxRoute: 'weak' });
  await f.click('history-chapter-start', { id: 'c1' });
  const release = f.defer();
  const answer = f.click('answer', { answer: 'O' });
  await f.click('leave');
  assert.match(f.html(), /ox-quiz/);
  release();
  await answer;
  await f.click('leave');
  await f.click('nav', { oxRoute: 'review' });
  assert.match(f.html(), /누적 4회 오답/);
});

test('retrying a lost save response updates the notebook exactly once', async () => {
  const f = fixture();
  await f.click('nav', { oxRoute: 'weak' });
  await f.click('history-chapter-start', { id: 'c1' });
  f.loseResponse();
  await f.click('answer', { answer: 'O' });
  await f.click('answer', { answer: 'O' });
  assert.equal(f.requests[0].body.submissionId, f.requests[1].body.submissionId);
  await f.click('leave');
  await f.click('nav', { oxRoute: 'review' });
  assert.match(f.html(), /누적 4회 오답/);
});

test('a committed answer with a lost response is reconciled before entering the notebook', async () => {
  const f = fixture();
  await f.click('nav', { oxRoute: 'weak' });
  await f.click('history-chapter-start', { id: 'c1' });
  f.loseResponse();
  await f.click('answer', { answer: 'O' });
  await f.click('leave');
  await f.click('nav', { oxRoute: 'review' });
  assert.match(f.html(), /누적 4회 오답/);
  assert.equal(f.requests.filter(r => r.action === 'submit').length, 1, 'Reading records must not resubmit an answer');
  assert.equal(f.requests.filter(r => r.action === 'bootstrap').length, 1, 'Only the uncertain save requires a refresh');
});

test('an answer that never committed does not acquire a false wrong count during recovery', async () => {
  const f = fixture();
  await f.click('nav', { oxRoute: 'weak' });
  await f.click('history-chapter-start', { id: 'c1' });
  f.failSave();
  await f.click('answer', { answer: 'O' });
  await f.click('leave');
  await f.click('nav', { oxRoute: 'review' });
  assert.match(f.html(), /누적 3회 오답/);
  assert.match(f.html(), /다시 맞힘/);
});

test('failed recovery keeps navigation pending until persisted records can be read', async () => {
  const f = fixture();
  await f.click('nav', { oxRoute: 'weak' });
  await f.click('history-chapter-start', { id: 'c1' });
  f.loseResponse();
  await f.click('answer', { answer: 'O' });
  f.failRefresh();
  await f.click('leave');
  assert.match(f.html(), /ox-quiz/);
  await f.click('leave');
  await f.click('nav', { oxRoute: 'review' });
  assert.match(f.html(), /누적 4회 오답/);
  assert.equal(f.requests.filter(r => r.action === 'bootstrap').length, 2);
});

test('resuming an uncertain answer after recovery does not count its saved attempt twice', async () => {
  const f = fixture();
  await f.click('nav', { oxRoute: 'weak' });
  await f.click('history-chapter-start', { id: 'c1' });
  f.loseResponse();
  await f.click('answer', { answer: 'O' });
  await f.click('leave');
  await f.click('resume');
  await f.click('answer', { answer: 'O' });
  const submitted = f.requests.filter(r => r.action === 'submit');
  assert.equal(submitted[0].body.submissionId, submitted[1].body.submissionId);
  await f.click('leave');
  assert.match(f.html(), /누적 5회 풀이 · 정답 1회 · 오답 4회/);
  await f.click('nav', { oxRoute: 'review' });
  assert.match(f.html(), /누적 4회 오답/);
});
