const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { test } = require('node:test');
const { createHandler } = require('../api/interview-prep');
const { isPreviewStudent, getPreviewHashes } = require('../lib/interview-preview-access');
const auth = require('../api/teacher-auth-utils');

async function call(handler, body, headers = {}) {
  let status, data;
  await handler({ method: 'POST', headers: { host: 'localhost', ...headers }, body }, {
    setHeader() {}, status(value) { status = value; return this; }, json(value) { data = value; },
  });
  return { status, data };
}

test('only the explicitly selected test account is a preview candidate', () => {
  assert.equal(isPreviewStudent('18120'), true);
  for (const id of [undefined, '', '*', '1812', '181200', '18121', ' 18120', 18120]) {
    assert.equal(isPreviewStudent(id), false);
  }
  const config = require('../interview-preview-config.json');
  const previous = config.studentIdHashes;
  try {
    for (const value of [undefined, [], ['*'], [123], '18120']) {
      config.studentIdHashes = value;
      assert.equal(isPreviewStudent('18120'), false);
    }
  } finally { config.studentIdHashes = previous; }
});

test('ordinary students cannot read/write interview data or cause DB work', async () => {
  const handler = createHandler({
    authenticate: async () => assert.fail('Non-test accounts must not cause device queries'),
    invoke: async () => assert.fail('Non-test accounts must not invoke interview DB'),
  });
  assert.deepEqual(await call(handler, { action: 'status', studentId: '18121', deviceToken: 'valid' }),
    { status: 200, data: { ok: true, enabled: false } });
  for (const body of [
    { action: 'bootstrap' }, { action: 'questions' }, { action: 'question_detail', id: 'q1' },
    { action: 'history', topicId: 'teamwork', targetStudentId: '18120' },
    { action: 'note_save', topicId: 'teamwork', topicRevision: 1, revision: 0, fields: {}, status: 'draft' },
  ]) {
    const result = await call(handler, { ...body, studentId: '18121', deviceToken: 'valid',
      actor: { type: 'admin', id: 'qa' }, interviewPreviewStudentHashes: getPreviewHashes() });
    assert.equal(result.status, 403);
    assert.equal(result.data.error, 'forbidden');
  }
});

test('test account still needs a valid device and active enrollment; DB failure stays closed', async () => {
  let invokeCalls = 0;
  const handler = createHandler({
    authenticate: async body => body.deviceToken === 'valid' ? { id: '18120' } : null,
    invoke: async () => { invokeCalls++; return { ok: true, enabled: true }; },
  });
  assert.equal((await call(handler, { action: 'bootstrap', studentId: '18120', deviceToken: 'forged' })).status, 401);
  assert.equal(invokeCalls, 0);
  assert.equal((await call(handler, { action: 'status', studentId: '18120', deviceToken: 'valid' })).data.enabled, true);
  assert.equal(invokeCalls, 1);
  for (const [error, status] of [['not_enrolled', 403], ['database_down', 503]]) {
    const denied = createHandler({ authenticate: async () => ({ id: '18120' }), invoke: async () => { throw Error(error); } });
    assert.equal((await call(denied, { action: 'bootstrap', studentId: '18120', deviceToken: 'valid' })).status, status);
  }
  const mismatched = createHandler({ authenticate: async () => ({ id: '18121' }), invoke: async () => assert.fail('Wrong identity') });
  assert.equal((await call(mismatched, { action: 'bootstrap', studentId: '18120', deviceToken: 'valid' })).status, 403);
});

test('teacher authorization remains independent and requires existing interview permissions', async () => {
  const previous = process.env.TEACHER_SESSION_SECRET;
  process.env.TEACHER_SESSION_SECRET = 'preview-test-secret';
  try {
    const handler = createHandler({ invoke: async () => ({ ok: true }) });
    for (const [role, permissions, expected] of [
      ['manager', ['*'], 403], ['admin', ['students.read'], 403],
      ['admin', ['interview.read'], 200], ['admin', ['*'], 200],
    ]) {
      const cookie = auth.COOKIE_NAME + '=' + auth.createSessionToken(process.env.TEACHER_SESSION_SECRET,
        { username: 'qa', role, permissions });
      assert.equal((await call(handler, { action: 'admin_catalog' }, { cookie })).status, expected);
      if (permissions[0] === 'interview.read')
        assert.equal((await call(handler, { action: 'admin_enabled', enabled: true }, { cookie })).status, 403);
    }
  } finally {
    if (previous === undefined) delete process.env.TEACHER_SESSION_SECRET;
    else process.env.TEACHER_SESSION_SECRET = previous;
  }
});

function browserContext(id, hashes = getPreviewHashes(), response = { ok: true, enabled: true }) {
  const nodes = [], calls = [],storage=new Map(),classes=new Set();
  let student = { id }, token = 'device';
  const node = (tag, props = {}, children = []) => {
    const value = { tag, ...props, children, style: {}, removeAttribute(name) { delete this[name]; }, replaceChildren(...items) { this.children = items; } };
    nodes.push(value); return value;
  };
  const context = vm.createContext({
    APP_MODE: 'student', window: { OUTING_APP_CONFIG: { interviewPreviewStudentHashes: hashes } },
    crypto: crypto.webcrypto, TextEncoder, Uint8Array, Date,
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},render(){},
    getAuthedStudent: () => student, getStudentProfile: () => ({ deviceToken: token }),
    el: node, button: label => node('button', {}, [label]), navigate() {},
    isStandaloneStudentApp: () => true, navigator: { userAgent: 'test' },
    document: { body:{classList:{add:value=>classes.add(value)}},querySelector: () => null, head: { appendChild: () => assert.fail('Denied users must not load styles') } },
    fetch: async (...args) => { calls.push(args); return { ok: true, json: async () => response }; },
  });
  vm.runInContext(fs.readFileSync('interview-prep.js', 'utf8'), context);
  return { context, nodes, calls,storage, switchStudent(nextId) { student = { id: nextId }; token = 'new-device'; } };
}
async function settle(context) {
  await vm.runInContext('renderInterviewPrepEntry.cache?.promise?.catch(() => {})', context);
  await new Promise(resolve => setTimeout(resolve, 20));
}

test('all ordinary student categories have an invisible entry and zero interview requests', async () => {
  // Audience selection depends only on ID, never on the student category.
  for (const category of ['offline', 'online_managed', 'lecture']) {
    const { context, calls } = browserContext('18121');
    context.category = category;
    const entry = vm.runInContext('renderInterviewPrepEntry()', context);
    await settle(context);
    assert.equal(entry.hidden, true);
    assert.equal(entry.children.length, 0);
    assert.equal(calls.length, 0);
    const view = vm.runInContext('renderInterviewPrep()', context);
    await settle(context);
    assert.equal(view.children[0].children, '면접반 이용 상태를 확인하지 못했습니다.');
    assert.equal(calls.length, 0);
  }
});

test('app mode restores only after enrollment confirmation and is isolated per account',async()=>{
 for(const enabled of [true,false]){
  const b=browserContext('18120',getPreviewHashes(),{ok:true,enabled});
  b.storage.set('outing-student-mode:18120','interview');
  assert(vm.runInContext('prepareInterviewAppEntry()',b.context));
  assert.equal(vm.runInContext('isInterviewStudentMode()',b.context),false);
  await settle(b.context);
  assert.equal(vm.runInContext('isInterviewStudentMode()',b.context),enabled);
  assert.equal(b.calls[0][1].credentials,'omit','Device session must not reuse another portal account cookie');
  b.switchStudent('18121');
  assert.equal(vm.runInContext('isInterviewStudentMode()',b.context),false);
  assert.equal(vm.runInContext('prepareInterviewAppEntry()',b.context),null);
 }
 const failed=browserContext('18120');failed.storage.set('outing-student-mode:18120','interview');
 failed.context.fetch=async()=>{throw Error('offline');};
 vm.runInContext('prepareInterviewAppEntry()',failed.context);await settle(failed.context);
 assert.equal(vm.runInContext('prepareInterviewAppEntry.cache.state',failed.context),'error');
 assert.equal(vm.runInContext('isInterviewStudentMode()',failed.context),false);
});

test('allowed entry requires server permission, handles missing config and ignores account switches', async () => {
  for (const enabled of [true, false]) {
    const { context, calls } = browserContext('18120', getPreviewHashes(), { ok: true, enabled });
    const entry = vm.runInContext('renderInterviewPrepEntry()', context);
    await settle(context);
    assert.equal(calls.length, 1);
    assert.equal(entry.hidden, !enabled);
    assert.equal(entry.children.length, enabled ? 1 : 0);
  }
  const missing = browserContext('18120', []);
  assert.equal(vm.runInContext('renderInterviewPrepEntry()', missing.context), null);
  assert.equal(missing.calls.length, 0);
  const switched = browserContext('18120');
  const entry = vm.runInContext('renderInterviewPrepEntry()', switched.context);
  switched.switchStudent('18121');
  await settle(switched.context);
  assert.equal(entry.hidden, true);
  assert.equal(switched.calls.length, 0);
});

test('interview content is not precached and missing optional module cannot break normal routes', () => {
  const sw = fs.readFileSync('sw.js', 'utf8');
  for (const path of ['/interview.html', '/interview-prep-ui.js', '/interview-prep.css'])
    assert.equal(sw.includes('"' + path), false);
  const app = fs.readFileSync('app.js', 'utf8');
  assert.match(app, /typeof renderInterviewPrep === "function" \? requireStudentAuth/);
  assert.match(app, /typeof renderInterviewPrepAdmin === "function" \? renderInterviewPrepAdmin/);
});


test('student mypage does not expose the interview entry, including pilot accounts', () => {
  const app = fs.readFileSync('app.js', 'utf8');
  const mypage = app.slice(app.indexOf('function renderStudentMypage()'), app.indexOf('function openStudentAccountDeletion()'));
  assert.ok(mypage.includes('renderStudentDeviceRegistrationCard'));
  assert.doesNotMatch(mypage, /renderInterviewPrepEntry/);
});
