const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const model = require('../final-scope-model');
const handler = require('../api/app-settings');
const { COOKIE_NAME, createSessionToken } = require('../api/teacher-auth-utils');
const dataContext = { window: {} };
vm.runInNewContext(fs.readFileSync('final-scope-data.js', 'utf8'), dataContext);
const defaults = JSON.parse(JSON.stringify(dataContext.window.FINAL_SCOPE_PLAN));
const copy = () => structuredClone(defaults);

test('editable plan preserves all default rounds and derives the guide from changed schedules', () => {
  const plan = model.normalize(defaults);
  assert.equal(plan.rounds.length, 12);
  assert.deepEqual(model.guideRows(plan), [
    ['1~3회차', '12일 동안 1회독'], ['4~6회차', '9일 동안 1회독'],
    ['7~9회차', '6일 동안 1회독'], ['10~12회차', '전범위 모의고사'],
  ]);
  plan.rounds[0].code = '15-1 ~ 15-5';
  assert.deepEqual(model.guideRows(plan)[0], ['1회차', '15일 동안 1회독']);
  plan.rounds = [plan.rounds[4], plan.rounds[0]];
  assert.deepEqual(model.normalize(plan).rounds.map(r => r.round), [1, 5]);
  const normalized = model.normalize({ ...defaults, title: '  새 시험 대비  ', extra: 'discard', subjectOrder: ['injected'] });
  assert.equal(normalized.title, '새 시험 대비');
  assert.equal(normalized.extra, undefined);
  assert.equal(normalized.subjectOrder, undefined);
});

test('invalid or incomplete edits cannot replace the current plan', () => {
  for (const change of [
    p => p.title = '', p => p.rounds = [], p => p.rounds.push(p.rounds[0]),
    p => p.rounds[0].round = 1.5, p => p.rounds[0].date = '',
    p => p.rounds[0].subjects['형사법'] = [],
    p => p.rounds[0].subjects['형사법'][0].text = ' ',
    p => p.rounds[0].subjects['형사법'][0].text = '가'.repeat(2001),
    p => delete p.rounds[0].subjects['기관'],
  ]) {
    const plan = copy(); change(plan);
    assert.throws(() => model.normalize(plan), { code: 'invalid_final_scope_plan' });
    assert.equal(model.normalizeOrNull(plan), null);
  }
  assert.equal(model.normalizeOrNull(null), null);
});

test('settings API enforces permissions, persists edits, and preserves other settings and plans', async () => {
  const oldFetch = global.fetch;
  const env = { ...process.env };
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only';
  process.env.TEACHER_SESSION_SECRET = 'final-scope-test';
  let stored = { attendanceDeadline: '09:10', seatAssignments: { A1: { studentId: 'a' } }, studentDday: { label: '시험', date: '2026-10-24' } };
  let writes = 0;
  global.fetch = async (url, options) => {
    assert.match(url, /\/rest\/v1\/notices/);
    if (options.method === 'GET') return { ok: true, status: 200, json: async () => [{ body: JSON.stringify(stored) }] };
    const row = JSON.parse(options.body);
    assert.equal(row.id, '__app_settings__');
    assert.equal(row.is_published, false);
    stored = JSON.parse(row.body); writes++;
    return { ok: true, status: 204 };
  };
  const call = async (method, patch, permissions = null) => {
    const token = permissions && createSessionToken(process.env.TEACHER_SESSION_SECRET, { username: 'test', role: 'teacher', permissions });
    const req = { method, headers: token ? { cookie: `${COOKIE_NAME}=${token}` } : {},
      async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify({ settings: patch })); } };
    const res = { statusCode: 200, headers: {}, status(n) { this.statusCode = n; return this; },
      json(p) { this.payload = p; }, setHeader(k,v) { this.headers[k] = v; } };
    await handler(req, res); return res;
  };
  try {
    const plan = model.normalize(copy()); plan.title = '수정된 플랜'; plan.rounds[0].date = '9월 25일';
    plan.rounds[0].subjects['형사법'][0].text = '수정된 시험 범위';
    assert.equal((await call('POST', { finalScopePlan: plan })).statusCode, 401);
    assert.equal((await call('POST', { finalScopePlan: plan }, ['curriculum.read'])).statusCode, 403);
    assert.equal((await call('POST', { finalScopePlan: null }, ['curriculum.write'])).statusCode, 400);
    assert.equal(writes, 0);
    const saved = await call('POST', { finalScopePlan: plan }, ['curriculum.write']);
    assert.equal(saved.statusCode, 200); assert.deepEqual(saved.payload.settings.finalScopePlan, plan);
    assert.equal(stored.attendanceDeadline, '09:10'); assert.equal(stored.seatAssignments.A1.studentId, 'a');
    assert.equal(stored.studentDday.label, '시험');
    const loaded = await call('GET');
    assert.equal(loaded.headers['Cache-Control'], 'no-store');
    assert.deepEqual(loaded.payload.settings.finalScopePlan, plan);
    assert.equal((await call('POST', { attendanceDeadline: '09:20' }, ['attendance.write'])).statusCode, 200);
    assert.deepEqual(stored.finalScopePlan, plan);
    assert.equal(stored.attendanceDeadline, '09:20');
    const before = JSON.stringify(stored);
    const invalid = copy(); invalid.rounds[1].round = 1;
    assert.equal((await call('POST', { finalScopePlan: invalid }, ['curriculum.write'])).statusCode, 400);
    assert.equal(JSON.stringify(stored), before);
  } finally {
    global.fetch = oldFetch;
    for (const key of ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','TEACHER_SESSION_SECRET']) {
      if (env[key] === undefined) delete process.env[key]; else process.env[key] = env[key];
    }
  }
});

test('student views prefer saved data and retain fixed subject mapping and audience restrictions', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const extract = name => source.match(new RegExp(`^function ${name}\\([^]*?^}`, 'm'))[0];
  const plan = model.normalize(defaults); plan.title = '새 플랜'; plan.rounds[0].date = '9월 30일';
  const ctx = vm.createContext({ window: { FINAL_SCOPE_PLAN: defaults }, state: { settings: { finalScopePlan: plan } },
    getAuthedStudent: () => null, getStudentCategory: s => s?.category });
  vm.runInContext(extract('getFinalScopePlanData') + '\n' + extract('canUseFinalScopePlan') + '\n' + extract('formatFinalScopeRoundCode'), ctx);
  assert.equal(ctx.formatFinalScopeRoundCode('12-1 ~ 12-4'), '12일 1회독 · 1~4일차');
  assert.equal(ctx.formatFinalScopeRoundCode('12-1~4'), '12일 1회독 · 1~4일차');
  assert.equal(ctx.formatFinalScopeRoundCode('12-1'), '12일 1회독 · 1일차');
  assert.equal(ctx.formatFinalScopeRoundCode('전범위'), '전범위');
  assert.equal(ctx.formatFinalScopeRoundCode('취약 단원 복습'), '취약 단원 복습');
  assert.equal(ctx.getFinalScopePlanData().title, '새 플랜');
  assert.equal(ctx.getFinalScopePlanData().rounds[0].date, '9월 30일');
  assert.deepEqual(ctx.getFinalScopePlanData().appSubjectByScopeSubject, defaults.appSubjectByScopeSubject);
  for (const category of ['online_managed','lecture']) assert.equal(ctx.canUseFinalScopePlan({ category }), true);
  assert.equal(ctx.canUseFinalScopePlan({ category: 'offline' }), false);
  ctx.state.settings.finalScopePlan = null;
  assert.equal(ctx.getFinalScopePlanData(), defaults);
});
