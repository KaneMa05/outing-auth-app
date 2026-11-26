'use strict';
const {test} = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
test('Explicit student entry leaves interview mode for this account without deleting its login or other accounts', () => {
  const source = fs.readFileSync('interview-prep.js', 'utf8');
  const start = source.indexOf('function prepareInterviewAppEntry()'), end = source.indexOf('\nfunction ', start + 1);
  assert(start >= 0 && end > start);
  const storage = new Map([['outing-interview-web-app', '1'], ['outing-student-mode:current', 'interview'], ['outing-student-mode:other', 'interview'], ['student-auth', 'preserve']]);
  const session = new Map([['interview-app-return', '1']]); let replaced;
  const context = {APP_MODE: 'student', isStandaloneStudentApp: () => true, URL, location: {href: 'https://app.test/index.html?entry=student#home'},
    localStorage: {getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k)},
    sessionStorage: {removeItem: k => session.delete(k)}, getAuthedStudent: () => ({id: 'current'}),
    history: {replaceState: (_a, _b, url) => { replaced = url; }}, fetch: () => assert.fail('Explicit entry must not be trapped by a portal network request')};
  vm.createContext(context); vm.runInContext(source.slice(start, end), context);
  assert.equal(context.prepareInterviewAppEntry(), null); assert.equal(replaced, '/index.html#home');
  assert.equal(storage.has('outing-interview-web-app'), false); assert.equal(session.size, 0);
  assert.equal(storage.get('outing-student-mode:current'), 'standard'); assert.equal(storage.get('outing-student-mode:other'), 'interview');
  assert.equal(storage.get('student-auth'), 'preserve');
});
test('remembered social login opens the interview portal directly even when the old startup loader runs', () => {
  const source = fs.readFileSync('interview-prep.js', 'utf8'), start = source.indexOf('function prepareInterviewAppEntry()'), end = source.indexOf('\nfunction ', start + 1);
  const storage = new Map([['outing-interview-web-app', '1']]), redirects = [];
  const context = {APP_MODE: 'student', isStandaloneStudentApp: () => true, URL,
    location: {href: 'https://app.test/index.html#home', replace: url => redirects.push(url)},
    localStorage: {getItem: key => storage.get(key)}, document: {body: {classList: {add() {}}}},
    getAuthedStudent: () => assert.fail('Remembered portal users must not load written-course credentials'),
    fetch: () => assert.fail('Session expiry and network failures belong to the interview portal'),
    el: (tag, props, children) => ({tag, ...props, children})};
  vm.createContext(context); vm.runInContext(source.slice(start, end), context);
  for (let launch = 0; launch < 2; launch++) assert.equal(context.prepareInterviewAppEntry()['data-startup-pending'], 'true');
  assert.deepEqual(redirects, ['/interview?app=1']);
  assert.equal(storage.get('outing-interview-web-app'), '1');
});

test('successful OAuth callbacks remember interview entry even without an app query or return session', async () => {
  const storage = new Map(), box = {innerHTML: ''}, host = {innerHTML: '', querySelector: () => box, addEventListener() {}}, actions = {innerHTML: ''};
  const context = {URL, URLSearchParams, AbortSignal, navigator: {}, location: {search: '', href: 'https://app.test/interview'},
    localStorage: {setItem: (key, value) => storage.set(key, value)}, sessionStorage: {getItem() {}},
    window: {}, document: {referrer: '', body: {classList: {toggle() {}}}, addEventListener() {},
      querySelector: selector => selector === '#interview-portal' ? host : selector === '#portal-actions' ? actions : null},
    fetch: async () => ({ok: true, json: async () => ({ok: true, authenticated: true, available: false, member: {enabled: true}, account: {ownerId: 'social-user'}})}),
    enrollmentEnded: () => false,
  };
  vm.createContext(context); vm.runInContext(fs.readFileSync('interview-portal.js', 'utf8').replace(/^import .*\r?\n/gm, ''), context);
  await new Promise(resolve => setImmediate(resolve));
  assert(box.innerHTML.includes('면접반 운영 준비 중입니다.'));
  assert.equal(storage.get('outing-interview-web-app'), '1');
});

test('Kakao and Apple share the same interview entry; unconfigured Apple is never presented as working', () => {
  const source = fs.readFileSync('interview-login.js', 'utf8').replace('export function', 'function');
  const host = {innerHTML: '', querySelector: () => ({classList: {toggle() {}}})};
  const context = {document: {hidden: false, addEventListener() {}, removeEventListener() {}}};
  vm.createContext(context); vm.runInContext(source, context);
  context.mountInterviewLogin(host, {enabled: true, kakaoEnabled: true, appleEnabled: true});
  assert(host.innerHTML.includes('data-kakao="login"')); assert(host.innerHTML.includes('data-apple="login"'));
  assert(!/data-apple="login"[^>]*disabled/.test(host.innerHTML)); assert(host.innerHTML.includes('data-student-entry'));
  context.mountInterviewLogin(host, {enabled: true, kakaoEnabled: true, appleEnabled: false});
  assert(!host.innerHTML.includes('data-apple'));
});

test('Android hides Apple login and account linking while iOS and desktop retain server-enabled Apple actions', async () => {
  const source = fs.readFileSync('interview-portal.js', 'utf8').replace(/^import .*\r?\n/gm, '').replace('import(useApp?', 'loadModule(useApp?');
  const devices = [
    {userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) Chrome/131.0 Mobile Safari/537.36', android: true},
    {userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S921N; wv) Version/4.0 Chrome/131.0 Mobile Safari/537.36', android: true},
    {userAgent: 'Mozilla/5.0', userAgentData: {platform: 'Android'}, android: true},
    {userAgent: '', referrer: 'android-app://com.ronpark.study/', android: true},
    {userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', android: false},
    {userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)', android: false},
    {userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', android: false},
  ];
  for (const device of devices) for (const authenticated of [false, true]) for (const appleEnabled of [false, true]) {
    const session = {ok: true, authenticated, available: authenticated, appleEnabled, kakaoEnabled: true,
      account: {ownerId: 'local-student', name: '테스트', appleLinked: false, kakaoLinked: false}};
    let login, account, finished = false;
    const box = {innerHTML: ''}, host = {innerHTML: '', querySelector: () => box, addEventListener() {}}, actions = {innerHTML: ''};
    const context = {URL, URLSearchParams, AbortSignal, navigator: device, location: {search: '?app=1', href: 'https://app.test/interview?app=1'},
      sessionStorage: {getItem() {}, setItem() {}}, localStorage: {setItem() {}},
      window: {__appStartup: {finish() { finished = true; }}},
      document: {referrer: device.referrer || '', body: {classList: {toggle() {}}}, addEventListener() {},
        querySelector: selector => selector === '#interview-portal' ? host : selector === '#portal-actions' ? actions : null},
      fetch: async () => ({ok: true, json: async () => session}),
      mountInterviewLogin(_host, options) { login = options; return () => {}; },
      enrollmentEnded: () => false,
      loadModule: async () => ({mountInterviewApp: async (_box, options) => { account = options.account; return {destroy() {}}; }}),
    };
    vm.createContext(context); vm.runInContext(source, context);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(finished, true);
    const visible = appleEnabled && !device.android;
    if (authenticated) {
      assert(account, 'Authenticated app must mount successfully');
      assert.equal(account.canLinkApple, visible);
      assert.equal(account.canLinkKakao, true);
      assert.equal(actions.innerHTML.includes('data-apple="link"'), visible);
    } else {
      assert.equal(login.appleEnabled, visible);
      assert.equal(login.kakaoEnabled, true);
      const loginHost = {innerHTML: '', querySelector: () => ({classList: {toggle() {}}})};
      vm.runInContext(fs.readFileSync('interview-login.js', 'utf8').replace('export function', 'function'), context);
      context.document.removeEventListener = () => {};
      context.mountInterviewLogin(loginHost, login);
      assert.equal(loginHost.innerHTML.includes('data-apple="login"'), visible);
      assert(loginHost.innerHTML.includes('data-kakao="login"'));
      assert(loginHost.innerHTML.includes('data-student-entry'));
    }
    assert.equal(session.appleEnabled, appleEnabled, 'Device filtering must not modify the server session');
  }
});
