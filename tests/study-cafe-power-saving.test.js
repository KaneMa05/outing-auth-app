const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('app.js', 'utf8');
function functions(names) {
  return names.map(name => {
    const start = source.indexOf(`function ${name}(`);
    assert.ok(start >= 0, name);
    const rest = source.slice(start);
    const end = rest.search(/\n(?:async )?function /);
    return end < 0 ? rest : rest.slice(0, end);
  }).join('\n');
}

function harness() {
  let now = 100000;
  let tick;
  const calls = { idle: 0, fire: 0, ranking: 0 };
  const mine = { dataset: { studyMemberTime: 'mine' }, textContent: '' };
  const other = { dataset: { studyMemberTime: 'remote', studyBaseSeconds: '10' }, textContent: '' };
  const clock = { textContent: '' };
  const classes = new Set();
  const storage = new Map();
  const c = vm.createContext({
    APP_MODE: 'student', currentRoute: 'study-cafe',
    studyCafePowerSavingPreference: null,
    studyCafePowerSavingMemberUpdatedAt: 0, studyCafePowerSavingFireUpdatedAt: 0,
    studyCafePreviewClock: null, studyCafeRankingRoomRefreshTimer: null,
    STUDY_CAFE_RANKING_ROOM_INDEX: 2, STUDY_CAFE_RANKING_REFRESH_INTERVAL_MS: 15000,
    STUDY_CAFE_PREVIEW_EPOCH: 100000,
    studyCafeRemoteState: { lastLoadedAt: 100000 },
    studyCafePreviewState: { subject: '국어', running: true, selectedSeatId: 'seat-1', activeRoomIndex: 2 },
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    Date: class extends Date { static now() { return now; } },
    window: { setInterval(fn) { tick = fn; return 1; } },
    document: {
      visibilityState: 'visible',
      body: { classList: { toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); } } },
      querySelector: selector => selector === '[data-study-cafe-clock]' ? clock : null,
      querySelectorAll: selector => selector === '[data-study-member-time]' ? [mine, other] : [],
    },
    el: (tag, props, children) => ({ ...props, children, setAttribute(key, value) { this[key] = value; } }),
    checkStudyCafeIdleSeat: () => { calls.idle++; },
    getStudySubjectElapsedMs: () => now - 100000,
    getStudySubjectTotalElapsedMs: () => now - 100000,
    formatStudyCafeElapsed: ms => String(ms / 1000),
    formatStudyCafeMemberTime: seconds => String(seconds),
    updateLectureHomeSummary() {},
    updateStudyCafeFireStages: () => { calls.fire++; },
    refreshStudyCafeRankingRoomView: () => { calls.ranking++; },
  });
  vm.runInContext(functions([
    'isStudyCafePowerSavingEnabled', 'isStudyCafePowerSavingActive',
    'syncStudyCafePowerSavingMode', 'renderStudyCafePowerSavingSwitch',
    'ensureStudyCafePreviewClock', 'ensureStudyCafeRankingRoomRefresh',
  ]), c);
  return { c, calls, mine, other, clock, classes, storage, advance(ms) { now += ms; tick(); } };
}

test('switch persists, is keyboard-native, and only applies on student cafe/timer routes', () => {
  const h = harness(), { c } = h;
  const control = c.renderStudyCafePowerSavingSwitch();
  assert.equal(control.role, 'switch');
  assert.equal(control.type, 'button');
  assert.equal(control['aria-checked'], 'false');
  control.onclick();
  assert.equal(control['aria-checked'], 'true');
  assert.equal(h.storage.get('study-cafe-power-saving'), 'true');
  c.studyCafePowerSavingPreference = null;
  assert.equal(c.isStudyCafePowerSavingEnabled(), true);
  for (const route of ['home', 'study-character', 'attendance', 'mypage']) {
    c.currentRoute = route;
    c.syncStudyCafePowerSavingMode();
    assert.equal(h.classes.size, 0);
  }
  c.currentRoute = 'study-timer';
  assert.equal(c.isStudyCafePowerSavingActive(), true);
  c.APP_MODE = 'teacher';
  assert.equal(c.isStudyCafePowerSavingActive(), false);
  c.localStorage.setItem = () => { throw new Error('storage blocked'); };
  assert.doesNotThrow(() => control.onclick());
  assert.equal(c.isStudyCafePowerSavingEnabled(), false);
});

test('saving mode keeps own seconds and idle checks, throttles peers/fire, and catches up after hidden', () => {
  const h = harness(), { c } = h;
  c.renderStudyCafePowerSavingSwitch().onclick();
  c.ensureStudyCafePreviewClock();
  h.advance(1000);
  assert.equal(h.mine.textContent, '1');
  assert.equal(h.other.textContent, '11');
  for (let i = 0; i < 29; i++) h.advance(1000);
  assert.equal(h.clock.textContent, '30');
  assert.equal(h.mine.textContent, '30');
  assert.equal(h.other.textContent, '11');
  assert.equal(h.calls.fire, 1);
  h.advance(1000);
  assert.equal(h.other.textContent, '41');
  c.document.visibilityState = 'hidden';
  h.advance(60000);
  assert.equal(h.mine.textContent, '31');
  assert.equal(h.calls.idle, 32);
  assert.equal(h.calls.fire, 1);
  c.document.visibilityState = 'visible';
  h.advance(1000);
  assert.equal(h.mine.textContent, '92');
  assert.equal(h.other.textContent, '102');
  assert.equal(h.calls.fire, 2);
  assert.equal(c.studyCafePreviewState.running, true);
  assert.equal(c.studyCafePreviewState.selectedSeatId, 'seat-1');
  c.renderStudyCafePowerSavingSwitch().onclick();
  h.advance(1000);
  assert.equal(h.other.textContent, '103');
});

test('ranking refresh uses one minute only in saving mode and never refreshes hidden', () => {
  const h = harness(), { c } = h;
  c.renderStudyCafePowerSavingSwitch().onclick();
  c.ensureStudyCafeRankingRoomRefresh();
  for (let i = 0; i < 3; i++) h.advance(15000);
  assert.equal(h.calls.ranking, 0);
  h.advance(15000);
  assert.equal(h.calls.ranking, 1);
  c.document.visibilityState = 'hidden';
  h.advance(60000);
  assert.equal(h.calls.ranking, 1);
  c.document.visibilityState = 'visible';
  c.renderStudyCafePowerSavingSwitch().onclick();
  h.advance(15000);
  assert.equal(h.calls.ranking, 2);
});
