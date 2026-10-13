const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const tick = () => new Promise(resolve => setImmediate(resolve));
const shared = fs.readFileSync('shared.js', 'utf8');

test('initial reads start together without an artificial queue and preserve result order', async () => {
  const start = shared.indexOf('async function loadStateFromRemote(options = {}) {');
  const prefix = shared.slice(start, shared.indexOf('  let studentResult = remoteResults[0];', start));
  for (const mode of ['teacher', 'student']) {
    let active = 0, release;
    const pending = new Promise(resolve => { release = resolve; });
    const calls = [];
    async function read(table) {
      calls.push(table); active++;
      await pending; active--;
      return { data: [table], error: null };
    }
    const context = {
      APP_MODE: mode, attendanceHolidayRevision: 0, studentExamDataLastLoadedAt: 0,
      STUDENT_EXAM_DATA_REFRESH_INTERVAL_MS: 60000, STUDENT_SCOPED_REFRESH_ENABLED: true,
      state: { settings: { studentAuthId: 'fixture' } },
      collectStudentPendingOutingPhotoDrafts: () => [],
      loadTeacherOutingPhotosFromRemote: () => read('outing_photos'),
      loadExamAnswersFromRemote: () => read('exam_answers'),
      loadAttendanceHolidaysFromRemote: () => read('attendance_holidays'),
      remoteStore: { from(table) {
        return { select() { return this; }, order() { return this; }, eq() { return this; }, limit() { return this; },
          then(resolve, reject) { return read(table).then(resolve, reject); } };
      } },
    };
    vm.createContext(context);
    vm.runInContext(prefix + 'return remoteResults;\n}', context);
    const loading = context.loadStateFromRemote();
    await tick();
    // No response has completed: independent tables must already be loading.
    const expected = ['students','outings','attendance_checks','penalties','notices','track_options',
      'attendance_holidays','exams','exam_sections','exam_answers','exam_files','exam_subject_settings','final_exam_scores'];
    if(mode === 'teacher')expected.push('outing_photos','student_registration_events');
    assert.deepEqual([...calls].sort(),expected.sort());
    assert.equal(active,expected.length);
    release();
    const result = await loading;
    assert.equal(result.length, 19);
    assert.equal(result[0].data[0], 'students');
    assert.equal(result[8].data[0], 'attendance_holidays');
    assert.equal(result[11].data[0], 'exam_answers');
    assert.equal(result[16].data[0], 'final_exam_scores');
    assert.equal(calls.filter(name => name === 'exam_answers').length, 1);
    assert.equal(calls.includes('outing_photos'), mode === 'teacher');
    assert.equal(active, 0);
  }
});

async function accessHarness() {
  const source = fs.readFileSync('criminal-law-ox-access.js', 'utf8')
    .replace(/^import .*;\r?\n/m, '').replace('export function', 'function');
  const listeners = {}, timers = new Map(), calls = [];
  let learning, resolveActive, active = 0, peak = 0, timerId = 0;
  const host = { isConnected: true, innerHTML: '', querySelector: () => ({}) };
  const context = {
    document: { hidden: false, body: {}, addEventListener: (name, fn) => listeners[name] = fn, removeEventListener() {} },
    MutationObserver: class { observe() {} disconnect() {} },
    setTimeout(fn) { timers.set(++timerId, fn); return timerId; }, clearTimeout(id) { timers.delete(id); },
    mountLearning(_, options) { learning = options.request; return {}; },
  };
  vm.createContext(context); vm.runInContext(source, context);
  const control = context.mountAccess(host, { request: async (action, body) => {
    calls.push({ action, body }); active++; peak = Math.max(peak, active);
    try {
      if (action === 'device_start') return { sessionId: 'fixture-session', bootstrap: {} };
      return await new Promise((resolve, reject) => { resolveActive = { resolve, reject }; });
    } finally { active--; }
  } });
  await tick();
  return { context, calls, timers, control, listeners, request: (...args) => learning(...args),
    mounted: () => typeof learning === 'function',
    settle: value => resolveActive.resolve(value), reject: error => resolveActive.reject(error), peak: () => peak };
}

test('OX enters with one summary request without waiting for a timer or full catalog', async () => {
  const h = await accessHarness();
  assert.equal(h.calls.length,1);
  assert.equal(h.calls[0].action,'device_start');
  assert.equal(h.calls[0].body.includeBootstrap,true);
  assert.equal(h.calls[0].body.homeOnly,true);
  assert.equal(h.mounted(),true,'Learning is mounted before any timer fires');
  h.control.destroy();
});

test('OX queues reads and writes without replaying them and renews the heartbeat after activity', async () => {
  const h = await accessHarness();
  const first = h.request('questions', { questions: ['q'] });
  const second = h.request('submit', { submissionId: 'unique-answer' });
  await tick();
  assert.deepEqual(h.calls.map(c => c.action), ['device_start', 'questions']);
  h.settle({ questions: [] }); await first; await tick();
  assert.equal(h.calls[2].action, 'submit');
  assert.equal(h.calls[2].body.submissionId, 'unique-answer');
  h.settle({ ok: true }); await second;
  assert.equal(h.peak(), 1);
  assert.equal(h.timers.size, 1);
  h.control.destroy();
});

test('OX discards queued calls after hiding/logout and does not send an old answer on resume', async () => {
  const h = await accessHarness();
  const first = h.request('questions').catch(error => error.code);
  const second = h.request('submit', { submissionId: 'stale' }).catch(error => error.code);
  await tick();
  h.context.document.hidden = true; h.listeners.visibilitychange();
  h.context.document.hidden = false; h.listeners.visibilitychange();
  await tick();
  assert.equal(h.calls.length, 2, 'entry waits for the previous transaction to finish');
  h.settle({ questions: [] });
  assert.equal(await first, 'device_session_changed');
  assert.equal(await second, 'device_session_changed');
  await tick();
  assert.deepEqual(h.calls.map(c => c.action), ['device_start', 'questions', 'device_start']);
  assert.equal(h.peak(), 1);
  h.control.destroy();
});

test('OX never retries a failed write; an invalidated session cancels queued requests', async () => {
  const h = await accessHarness();
  const failed = h.request('submit', { submissionId: 'once' }).catch(error => error.message);
  const queued = h.request('detail').catch(error => error.code);
  await tick(); h.reject(Error('network failure'));
  assert.equal(await failed, 'network failure');
  assert.equal(await queued, 'device_session_changed');
  assert.deepEqual(h.calls.map(c => c.action), ['device_start', 'submit']);
  h.control.destroy();
});
