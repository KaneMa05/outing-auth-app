const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const appSource = fs.readFileSync("app.js", "utf8");
const indexSource = fs.readFileSync("index.html", "utf8");

assert.match(appSource, /STUDENT_SCREEN_WAKE_LOCK_STORAGE_KEY/);
assert.match(appSource, /function renderStudentOtherSettingsCard\(\)/);
assert.match(appSource, /navigate\("other-settings"\)/);
assert.match(appSource, /"other-settings": \(\) => requireStudentAuth\(renderStudentOtherSettings\)/);
assert.match(appSource, /navigator\.wakeLock\.request\("screen"\)/);
assert.match(appSource, /function shouldKeepStudentScreenAwake\(\)/);
assert.match(appSource, /studyCafePreviewState\.timerFullscreen === true/);
assert.match(appSource, /document\.addEventListener\("visibilitychange", \(\) => \{[\s\S]*?syncStudentScreenWakeLock\(\)/);
assert.match(appSource, /await wakeLock\.release\(\)/);
assert.match(appSource, /localStorage\.setItem\(STUDENT_SCREEN_WAKE_LOCK_STORAGE_KEY/);
assert.match(appSource, /배터리 사용량이 늘어날 수 있습니다/);
assert.match(appSource, /disabled: !supported/);
assert.match(indexSource, /"other-settings": "기타 설정"/);

const wakeLockFunctions = appSource.match(
  /function isStudentScreenWakeLockSupported\(\)[\s\S]*?(?=function renderStudentOtherSettings\(\))/
)?.[0];
assert.ok(wakeLockFunctions, "wake lock lifecycle functions should be extractable");

function createWakeLockSentinel() {
  const releaseHandlers = [];
  return {
    released: false,
    addEventListener(type, handler) {
      if (type === "release") releaseHandlers.push(handler);
    },
    async release() {
      if (this.released) return;
      this.released = true;
      releaseHandlers.splice(0).forEach((handler) => handler());
    },
  };
}

function createWakeLockHarness(request) {
  const values = new Map();
  const notices = [];
  const context = {
    APP_MODE: "student",
    currentRoute: "home",
    studyCafePreviewState: { timerFullscreen: false },
    document: { visibilityState: "visible" },
    navigator: { wakeLock: { request } },
    localStorage: {
      getItem(key) { return values.has(key) ? values.get(key) : null; },
      setItem(key, value) { values.set(key, value); },
    },
    getAuthedStudent: () => ({ id: "20001" }),
    notify: (message) => notices.push(message),
    console: { warn() {} },
  };
  vm.runInNewContext(`
    const STUDENT_SCREEN_WAKE_LOCK_STORAGE_KEY = "test-wake-lock";
    let studentScreenWakeLock = null;
    let studentScreenWakeLockRequest = null;
    let studentScreenWakeLockError = "";
    ${wakeLockFunctions}
    this.wakeLockApi = {
      isEnabled: isStudentScreenWakeLockEnabled,
      shouldKeepAwake: shouldKeepStudentScreenAwake,
      setEnabled: setStudentScreenWakeLockEnabled,
      sync: syncStudentScreenWakeLock,
      getSentinel: () => studentScreenWakeLock,
      setRoute: (route) => { currentRoute = route; },
      setAuthenticated: (authenticated) => { getAuthedStudent = () => authenticated ? { id: "20001" } : null; },
      setMode: (mode) => { APP_MODE = mode; },
    };
  `, context);
  return { ...context, values, notices, api: context.wakeLockApi };
}

async function runWakeLockLifecycleTests() {
  const sentinels = [];
  let requestCount = 0;
  const harness = createWakeLockHarness(async (type) => {
    assert.equal(type, "screen");
    requestCount += 1;
    const sentinel = createWakeLockSentinel();
    sentinels.push(sentinel);
    return sentinel;
  });

  await harness.api.sync();
  assert.equal(requestCount, 0, "wake lock must remain off by default");

  await harness.api.setEnabled(true);
  assert.equal(requestCount, 1);
  assert.equal(harness.api.isEnabled(), true);
  assert.equal(sentinels[0].released, false);

  await harness.api.sync();
  assert.equal(requestCount, 1, "rendering again must not duplicate an active wake lock");

  harness.document.visibilityState = "hidden";
  await harness.api.sync();
  assert.equal(sentinels[0].released, true, "backgrounding the app must release the wake lock");

  harness.document.visibilityState = "visible";
  await harness.api.sync();
  assert.equal(requestCount, 2, "returning to the app must reacquire an enabled wake lock");

  await harness.api.setEnabled(false);
  assert.equal(sentinels[1].released, true);
  assert.equal(harness.api.isEnabled(), false);

  harness.studyCafePreviewState.timerFullscreen = true;
  await harness.api.sync();
  assert.equal(requestCount, 3, "fullscreen timer must request a wake lock even when the setting is off");
  assert.equal(harness.api.shouldKeepAwake(), true);

  harness.studyCafePreviewState.timerFullscreen = false;
  await harness.api.sync();
  assert.equal(sentinels[2].released, true, "closing fullscreen must release its wake lock when the setting is off");

  harness.api.setRoute("criminal-law-ox");
  await harness.api.sync();
  assert.equal(requestCount, 4, "OX must prevent automatic screen sleep while the global setting is off");
  assert.equal(harness.api.isEnabled(), false, "OX must not overwrite the user's global preference");
  await harness.api.sync();
  assert.equal(requestCount, 4, "OX rerenders must reuse the active wake lock");
  harness.document.visibilityState = "hidden";
  await harness.api.sync();
  assert.equal(sentinels[3].released, true);
  harness.document.visibilityState = "visible";
  await harness.api.sync();
  assert.equal(requestCount, 5, "returning to OX must reacquire the wake lock");
  harness.api.setRoute("home");
  await harness.api.sync();
  assert.equal(sentinels[4].released, true, "leaving OX must restore the default screen sleep behavior");
  harness.api.setRoute("criminal-law-ox");
  harness.api.setAuthenticated(false);
  await harness.api.sync();
  assert.equal(requestCount, 5, "unauthenticated OX must not request a wake lock");
  harness.api.setAuthenticated(true);
  harness.api.setMode("teacher");
  await harness.api.sync();
  assert.equal(requestCount, 5, "teacher screens must retain their existing wake lock behavior");

  const deniedHarness = createWakeLockHarness(async () => { throw new Error("NotAllowedError"); });
  deniedHarness.api.setRoute("criminal-law-ox");
  await deniedHarness.api.sync();
  assert.equal(deniedHarness.api.getSentinel(), null, "a rejected wake lock must not crash the OX screen");
  assert.equal(deniedHarness.notices.length, 0);

  let resolvePendingRequest;
  const pendingSentinel = createWakeLockSentinel();
  const raceHarness = createWakeLockHarness(() => new Promise((resolve) => {
    resolvePendingRequest = () => resolve(pendingSentinel);
  }));
  const enableRequest = raceHarness.api.setEnabled(true);
  await Promise.resolve();
  await raceHarness.api.setEnabled(false);
  resolvePendingRequest();
  await enableRequest;
  assert.equal(pendingSentinel.released, true, "a late request must not survive after the toggle is turned off");
  assert.equal(raceHarness.api.getSentinel(), null);

  for (const leave of [api => api.setRoute("home"), api => api.setAuthenticated(false)]) {
    let resolveRequest;
    const lateSentinel = createWakeLockSentinel();
    const lateHarness = createWakeLockHarness(() => new Promise(resolve => { resolveRequest = resolve; }));
    lateHarness.api.setRoute("criminal-law-ox");
    const pending = lateHarness.api.sync();
    leave(lateHarness.api);
    await lateHarness.api.sync();
    resolveRequest(lateSentinel);
    await pending;
    assert.equal(lateSentinel.released, true, "a late OX wake lock must be released after leaving or logout");
  }
}

runWakeLockLifecycleTests()
  .then(() => console.log("student wake lock tests passed"))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
