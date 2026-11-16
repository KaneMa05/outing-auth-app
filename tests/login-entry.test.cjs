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
