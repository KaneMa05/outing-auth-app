const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const source = fs.readFileSync('app.js', 'utf8');
function extract(name) {
  const start = source.search(new RegExp(`^(?:async )?function ${name}\\(`, 'm'));
  assert.ok(start >= 0, name);
  const tail = source.slice(start);
  return tail.slice(0, tail.indexOf('\n}') + 2);
}
function harness() {
  const calls = [], views = [];
  const c = {
    currentRoute: 'study-cafe', console: { error() {} },
    studyCafeRemoteState: { studentId: '20000', loading: false, loaded: false, room: null, error: '', lastAttemptAt: 0 },
    studyCafePreviewState: {}, studyCafeSessionRevision: 0, studyTodoMutationRevision: 0,
    studySubjectMutationRevision: 0, studyCafeTimerActionPending: false,
    studyCafeCountdownInterval: null, studyTodoDeletePendingKeys: new Set(),
    getAuthedStudent: () => ({ id: '20000' }), isOnlineStudentExperience: () => true,
    isStudyCafeLocalPreview: () => false, isLocalStudentPreview: () => false,
    isStudyCafeRoute: () => true, ensureStudyCafeRemoteTimers() {},
    requestStudyCafeAction: async action => { calls.push(action); return { ok: true, room: [{ seatNumber: 1 }] }; },
    hydrateStudyCafeSnapshot: snapshot => { if (snapshot.scope !== 'personal') c.studyCafeRemoteState.room = snapshot.room; },
    renderStudyCafeStateUpdate: () => views.push(c.renderStudyCafeRoomSeatNodes(0, {})),
    el: (tag, props = {}, children = []) => ({ tag, ...props, children }),
    button: (label, className, type, onclick) => ({ tag: 'button', label, onclick }),
    renderStudyCafeSeatedVisual: (tone, mine, options) => ({ tag: 'character', studying: options.studying }),
    STUDY_CAFE_RANKING_ROOM_INDEX: 0, STUDY_CAFE_ROOMS: [{}],
    getStudyCafeRankingRoomEntries: () => [{ seat: {}, physicalSeatNumber: 1 }],
    renderStudyCafeSeat: () => ({ tag: 'seat' }),
  };
  vm.createContext(c);
  vm.runInContext(['ensureStudyCafeRemoteLoaded', 'renderStudyCafeSeatLoading', 'renderStudyCafeRoomSeatNodes'].map(extract).join('\n'), c);
  return { c, calls, views };
}
test('first read shows the studying character, then replaces it with seats', async () => {
  const { c, views } = harness(); let finish;
  c.requestStudyCafeAction = () => new Promise(resolve => { finish = resolve; });
  const pending = c.ensureStudyCafeRemoteLoaded();
  const loading = c.renderStudyCafeRoomSeatNodes(0, {})[0];
  assert.equal(loading.role, 'status');
  assert.equal(loading.children[0].children[0].studying, true);
  assert.equal(loading.children.some(child => child?.tag === 'button'), false);
  finish({ ok: true, room: [{ seatNumber: 1 }] }); await pending;
  assert.equal(views.at(-1)[0].tag, 'seat');
});
test('known empty rooms and cached rooms stay visible during refresh', () => {
  const { c } = harness();
  for (const room of [[], [{ seatNumber: 1 }]]) {
    c.studyCafeRemoteState.room = room;
    c.studyCafeRemoteState.loading = true;
    assert.equal(c.renderStudyCafeRoomSeatNodes(0, {})[0].tag, 'seat');
  }
  c.studyCafeRemoteState.room = null;
  c.isStudyCafeLocalPreview = () => true;
  assert.equal(c.renderStudyCafeRoomSeatNodes(0, {})[0].tag, 'seat');
});
test('failed initial read stops the animation and manual retry recovers', async () => {
  const { c, views } = harness(); let attempts = 0;
  c.requestStudyCafeAction = async () => ++attempts === 1 ? { ok: false, httpStatus: 503 } : { ok: true, room: [] };
  await c.ensureStudyCafeRemoteLoaded();
  const failed = views.at(-1)[0];
  assert.equal(failed.children[0].children[0].studying, false);
  assert.equal(attempts, 1);
  failed.children.find(child => child?.tag === 'button').onclick();
  for (let i = 0; i < 10; i++) await Promise.resolve();
  assert.equal(attempts, 2);
  assert.equal(views.at(-1)[0].tag, 'seat');
});
test('a failed home request with render disabled still replaces the visible cafe loading state', async () => {
  const { c, views } = harness();
  c.requestStudyCafeAction = async () => { throw new Error('timeout'); };
  await c.ensureStudyCafeRemoteLoaded({ render: false });
  assert.equal(views.length, 1);
  assert.ok(views[0][0].className.includes('has-error'));
  c.currentRoute = 'home';
  await c.ensureStudyCafeRemoteLoaded({ force: true, render: false });
  assert.equal(views.length, 1, 'other screens are not rerendered');
});
test('slow home summary is awaited before exactly one full cafe read', async () => {
  const { c, calls } = harness(); let waits = 0;
  c.studyCafeRemoteState.loading = true;
  c.waitForStudyCafeRemoteLoad = async () => {
    if (++waits === 2) Object.assign(c.studyCafeRemoteState, { loading: false, loaded: true, loadedScope: 'personal' });
  };
  await c.ensureStudyCafeRemoteLoaded();
  assert.equal(waits, 2);
  assert.deepEqual(calls, ['load']);
  assert.equal(c.studyCafeRemoteState.loadedScope, 'full');
});
test('failed personal refresh does not automatically start another full read', async () => {
  const { c, calls } = harness();
  Object.assign(c.studyCafeRemoteState, { loading: true, loadedScope: 'personal' });
  c.waitForStudyCafeRemoteLoad = async () => Object.assign(c.studyCafeRemoteState, { loading: false, error: 'network_error' });
  await c.ensureStudyCafeRemoteLoaded();
  assert.equal(calls.length, 0);
});
