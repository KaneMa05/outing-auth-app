const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');

test('leaving OX disposes its observers and listeners; rerenders keep the active learner', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const start = source.indexOf('function render() {');
  const end = source.indexOf('  if (window.StudyRecordShare', start);
  assert.ok(start >= 0 && end > start);
  const accessSource = fs.readFileSync('criminal-law-ox-access.js', 'utf8')
    .replace(/^import .*;\r?\n/m, '').replace('export function', 'function');
  const listeners = new Set(), observers = new Set();
  let authed = true;
  const context = {
    location: { hash: '#criminal-law-ox' }, currentRoute: 'home',
    APP_MODE: 'student', isStandaloneStudentApp: () => true,
    defaultRoute: () => 'home', normalizeRoute: route => route,
    getAuthedStudent: () => authed ? { id: 'fixture' } : null,
    renderCriminalLawOxLocalPreview: () => {},
    document: {
      body: { classList: { toggle() {} } }, hidden: false,
      addEventListener: (type, handler) => { assert.equal(type, 'visibilitychange'); listeners.add(handler); },
      removeEventListener: (type, handler) => listeners.delete(handler),
    },
    MutationObserver: class {
      observe() { observers.add(this); }
      disconnect() { observers.delete(this); }
    },
    clearTimeout() {},
  };
  vm.createContext(context);
  vm.runInContext(accessSource + '\n' + source.slice(start, end) + '\n}', context);
  for (let i = 0; i < 20; i++) {
    const host = { isConnected: true, innerHTML: '' };
    // Keep entry pending to also exercise cleanup before the request finishes.
    context.renderCriminalLawOxLocalPreview.view = {
      controller: context.mountAccess(host, { request: () => new Promise(() => {}) }),
    };
    const view = context.renderCriminalLawOxLocalPreview.view;
    context.location.hash = '#criminal-law-ox';
    context.render();
    assert.equal(context.renderCriminalLawOxLocalPreview.view, view);
    assert.equal(listeners.size, 1);
    assert.equal(observers.size, 1);
    if (i % 2) authed = false;
    else context.location.hash = '#home';
    context.render();
    assert.equal(context.renderCriminalLawOxLocalPreview.view, null);
    assert.equal(listeners.size, 0, 'no document listeners may accumulate after leaving/logout');
    assert.equal(observers.size, 0, 'no body observers may accumulate after leaving/logout');
    context.render();
    authed = true;
  }
});
