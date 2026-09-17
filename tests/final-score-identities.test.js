const assert = require('node:assert/strict');
const handler = require('../api/final-score-identities');
const { createSessionToken, COOKIE_NAME } = require('../api/teacher-auth-utils');
const { normalizeEntries, planMatches } = handler._private;
const track = '경찰직 - 함정요원 항해(순경)';
const offline = { id: '18001', name: '동명이인', track, cohort: 18, student_category: 'offline' };
const entries = normalizeEntries([
  { lectureId: 'off_01', name: '동명이인', track },
  { lectureId: 'online_02', name: '동명이인', track },
]);
const applications = [{ lecture_id_normalized: 'online_02', approved_student_id: '900001' }];
const originalFetch = global.fetch;
const keys = ['TEACHER_SESSION_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
const originalEnv = Object.fromEntries(keys.map(key => [key, process.env[key]]));

async function invoke(body, token = '', method = 'POST') {
  const req = { method, body, headers: { cookie: `${COOKIE_NAME}=${token}` } };
  const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(n) { this.statusCode = n; return this; }, json(value) { this.body = value; return this; } };
  await handler(req, res);
  return res;
}
function response(value, status = 200) {
  return { status, ok: status < 400, json: async () => value };
}

(async () => {
  assert.equal(normalizeEntries([{ lectureId: ' AbC ', name: '학생', track }])[0].lectureId, 'abc');
  assert.throws(() => normalizeEntries([{ lectureId: 'abc', name: 'A' }, { lectureId: 'ABC', name: 'B' }]), /duplicate_lecture_id/);
  assert.throws(() => normalizeEntries([{ lectureId: '', name: 'A' }]), /invalid_identity/);
  assert.throws(() => normalizeEntries([{ lectureId: 'has space', name: 'A' }]), /invalid_identity/);
  const distinct = planMatches(entries, [offline], applications, [], '18');
  assert.deepEqual(distinct.issues, []);
  assert.equal(distinct.students[0].id, '18001');
  assert.equal(distinct.students[1].isExternalFinalScore, true);
  assert.notEqual(distinct.students[0].id, distinct.students[1].id);
  assert.ok(!JSON.stringify(distinct).includes('online_02'), 'public participant IDs must not embed the raw lecture ID');
  assert.deepEqual(planMatches(entries, [offline], [], [], '18').issues, [0, 1], 'unverified same-name matches require explicit choice');

  process.env.TEACHER_SESSION_SECRET = 'test-final-identities';
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role';
  const token = createSessionToken(process.env.TEACHER_SESSION_SECRET, { username: 'admin', role: 'admin', permissions: ['*'] });
  const deniedToken = createSessionToken(process.env.TEACHER_SESSION_SECRET, { username: 'manager', role: 'student_manager', permissions: [] });
  global.fetch = async () => { throw new Error('must not reach database'); };
  assert.equal((await invoke({})).statusCode, 401);
  assert.equal((await invoke({}, deniedToken)).statusCode, 403);
  assert.equal((await invoke({}, token, 'GET')).statusCode, 405);
  assert.equal((await invoke({ cohort: 'wrong', entries }, token)).statusCode, 400);
  assert.equal((await invoke({ cohort: '18', entries: [entries[0], entries[0]] }, token)).body.error, 'duplicate_lecture_id');

  const stored = new Map();
  let inserts = 0;
  global.fetch = async (url, options) => {
    assert.equal(options.headers.Authorization, 'Bearer test-service-role');
    if (url.includes('/students?')) return response([offline]);
    if (url.includes('/lecture_applications?')) return response(applications);
    assert.ok(url.includes('/final_score_identities?'));
    if (options.method === 'POST') {
      inserts++;
      const rows = JSON.parse(options.body);
      assert.equal(new Set(rows.map(row => row.participant_id)).size, rows.length);
      assert.equal(options.headers.Prefer, 'resolution=ignore-duplicates,return=minimal');
      rows.forEach(row => { if (!stored.has(row.lecture_id_normalized)) stored.set(row.lecture_id_normalized, row); });
      return response(null, 204);
    }
    return response([...stored.values()]);
  };
  const first = await invoke({ cohort: '18', entries }, token);
  assert.equal(first.statusCode, 200);
  assert.equal(first.headers['Cache-Control'], 'no-store');
  assert.equal(first.body.students[0].id, '18001');
  assert.equal(first.body.students[1].isExternalFinalScore, true);
  assert.equal(stored.size, 2);
  const retried = await invoke({ cohort: '18', entries }, token);
  assert.deepEqual(retried.body.students, first.body.students, 'reimports and other rounds reuse persistent identity mappings');
  assert.equal(inserts, 1);
  for (const id of ['off_01', 'online_02']) assert.ok(!JSON.stringify(first.body).includes(id));

  const conflicting = await invoke({ cohort: '18', entries: [{ lectureId: 'different', name: offline.name, track }] }, token);
  assert.deepEqual(conflicting.body.issues, [0], 'another lecture ID cannot silently claim an already linked student');
  assert.equal(inserts, 1, 'unresolved imports must not partially create mappings');
  global.fetch = async () => response({}, 404);
  const missing = await invoke({ cohort: '18', entries }, token);
  assert.equal(missing.body.error, 'identity_table_unavailable');
  console.log('final score identity API tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  global.fetch = originalFetch;
  keys.forEach(key => originalEnv[key] === undefined ? delete process.env[key] : process.env[key] = originalEnv[key]);
});
