const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const character = require('../study-character');
const fire = character.fire;

test('daily study fire changes exactly at 3, 5, 7, 9 and 10 hours and caps at the last stage', () => {
  [3, 5, 7, 9, 10].forEach((hours, i) => {
    assert.equal(fire.getStage(hours * 3600 - 1), i);
    assert.equal(fire.getStage(hours * 3600), i + 1);
    assert.equal(fire.getStage(hours * 3600 + 1), i + 1);
  });
  assert.equal(fire.getStage(30 * 3600), 5);
  for (const invalid of [undefined, null, -1, NaN, Infinity, 'invalid']) assert.equal(fire.getStage(invalid), 0);
});

test('a running snapshot advances, pause and clock rollback do not add time, and old study days are excluded', () => {
  const source = { baseSeconds: 10799, sampledAt: 100000, now: 101000, running: true, dateKey: '2026-09-11', todayKey: '2026-09-11' };
  assert.equal(fire.getStage(fire.getSeconds(source)), 1);
  assert.equal(fire.getSeconds({ ...source, running: false }), 10799);
  assert.equal(fire.getSeconds({ ...source, now: 99000 }), 10799);
  assert.equal(fire.getSeconds({ ...source, todayKey: '2026-09-12' }), 0);
  assert.equal(fire.getSeconds({ ...source, baseSeconds: 5, running: false }), 5, 'corrected server totals are used without retaining an obsolete level');
});

function appFunctions(names) {
  const source = fs.readFileSync('app.js', 'utf8');
  return names.map(name => {
    const start = source.indexOf(`function ${name}(`);
    assert.ok(start >= 0, name);
    const rest = source.slice(start);
    const end = rest.search(/\n(?:async )?function /);
    return end < 0 ? rest : rest.slice(0, end);
  }).join('\n');
}

test('actual app updater preserves DOM and levels through pause, uses own total, limits the feature to lecture, and resets at KST 04:00', () => {
  let now = Date.parse('2026-09-11T18:59:59Z'); // KST 03:59:59, study day Sep 11.
  let total = 9 * 3600000;
  let category = 'lecture';
  const context = vm.createContext({
    StudyCharacterStyles: character,
    Date: class extends Date { static now() { return now; } },
    getStudentCategory: () => category,
    getAuthedStudent: () => ({ student_category: category }),
    getStudySubjectTotalElapsedMs: () => total,
    studyCafeRemoteState: { studyDateKey: '2026-09-11' },
    studyCafePreviewState: { running: true },
    document: { visibilityState: 'visible' },
  });
  vm.runInContext(appFunctions(['formatStudyBusinessDateKey','isStudyCafeFireEnabled','getStudyCafeFireSeconds','updateStudyCafeFireNode']), context);
  const active = new Set();
  let titleWrites = 0;
  const node = { dataset: { studyFireMode: 'mine' }, classList: { toggle(name, value) { value ? active.add(name) : active.delete(name); } }, set title(v) { titleWrites++; this.label = v; } };
  context.updateStudyCafeFireNode(node);
  assert.equal(node.dataset.studyFireStage, '4');
  assert.equal(active.has('is-running'), true);
  context.updateStudyCafeFireNode(node);
  assert.equal(titleWrites, 1, 'no stage mutation on an unchanged tick');
  context.studyCafePreviewState.running = false;
  context.updateStudyCafeFireNode(node);
  assert.equal(node.dataset.studyFireStage, '4');
  assert.equal(active.has('is-running'), false);
  total = 10 * 3600000;
  context.studyCafePreviewState.running = true;
  context.updateStudyCafeFireNode(node);
  assert.equal(node.dataset.studyFireStage, '5');
  now += 1000; // 04:00, pending new-day snapshot must not reuse yesterday's 10h.
  context.updateStudyCafeFireNode(node);
  assert.equal(node.dataset.studyFireStage, '0');
  context.studyCafeRemoteState.studyDateKey = '2026-09-12';
  total = 3 * 3600000;
  context.updateStudyCafeFireNode(node);
  assert.equal(node.dataset.studyFireStage, '1');
  for (const value of ['offline', 'online_managed', '', 'teacher']) {
    category = value;
    assert.equal(context.isStudyCafeFireEnabled(), false);
  }
  category = 'lecture';
  assert.equal(context.isStudyCafeFireEnabled(), true);
});
