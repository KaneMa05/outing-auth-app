const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { Readable } = require("node:stream");
const handler = require("../api/student-rewards");

async function apiTests() {
  const originalFetch = global.fetch;
  const oldUrl = process.env.SUPABASE_URL;
  const oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = "https://reward-test.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only-key";
  let calls = [], valid = true, unavailable = false;
  let student = { id: "21001", is_active: true, account_type: "student", class_name: "테스트반" };
  global.fetch = async (url, options) => {
    calls.push({ url, ...options, json: options.body ? JSON.parse(options.body) : undefined });
    if (unavailable) return { ok: false, status: 404 };
    let data;
    if (url.includes("validate_student_device")) data = { valid };
    else if (url.includes("/students?")) data = [student];
    else if (url.includes("sync_student_rewards")) data = { ok: true, eligible: true, balance: 100, notifications: [] };
    else data = [];
    return { ok: true, status: options.method === "PATCH" ? 204 : 200, json: async () => data };
  };
  async function call(body, method = "POST", stream = false) {
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(n) { this.code = n; return this; }, json(v) { this.body = v; return this; } };
    const req = stream ? Object.assign(Readable.from([JSON.stringify(body)]), { method }) : { method, body };
    await handler(req, res);
    return res;
  }
  const body = { action: "sync", studentId: "21001", deviceToken: "test-token", welcome: true };
  try {
    assert.equal((await call(body, "GET")).code, 405);
    assert.equal((await call({ ...body, deviceToken: "" })).code, 400);
    assert.equal((await call("not json")).code, 400);
    valid = false; calls = [];
    assert.equal((await call(body)).code, 403);
    assert.equal(calls.length, 1, "invalid devices cannot query students or rewards");
    valid = true;
    for (const patch of [{ account_type: "teacher" }, { is_active: false }, { class_name: "스터디카페 운영계정" }, { id: "0001" }]) {
      const original = student; student = { ...student, ...patch }; calls = [];
      assert.equal((await call(body)).code, 403);
      assert.equal(calls.length, 2, "nonstudents cannot execute reward RPC");
      student = original;
    }
    calls = [];
    const result = await call({ ...body, amount: 999999, seconds: 999999, challengePoints: 999999 }, "POST", true);
    assert.equal(result.code, 200);
    assert.equal(result.headers["Cache-Control"], "no-store");
    assert.deepEqual(calls.at(-1).json, { p_student_id: "21001", p_welcome: true });
    assert.notEqual(calls[0].json.p_device_token_hash, body.deviceToken);
    assert.equal((await call({ ...body, action: "acknowledge", rewardKey: "arbitrary" })).code, 400);
    await call({ ...body, action: "acknowledge", rewardKey: "welcome" });
    assert.match(calls.at(-1).url, /student_id=eq\.21001&reward_key=eq\.welcome&acknowledged_at=is.null/);
    await call({ ...body, action: "history" });
    assert.match(calls.at(-1).url, /student_id=eq\.21001.*limit=30/);
    unavailable = true;
    assert.equal((await call(body)).code, 503, "unapplied migration fails independently of login");
  } finally {
    global.fetch = originalFetch;
    if (oldUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey;
  }
}

async function uiTests() {
  let student = { id: "21001", className: "테스트반" }, modalOpen = false, shown = [], requests = [], failed = false;
  const toasts = [];
  const saved = new Map();
  const reward = { key: "welcome", amount: 100, awardedAt: "2026-09-11T00:00:00Z" };
  let payload = { ok: true, eligible: true, balance: 100, welcomePoints: 100, challengePoints: 300, notifications: [reward] };
  const context = vm.createContext({
    APP_MODE: "student", currentRoute: "home", AbortController, console,
    getAuthedStudent: () => student, isTeacherAppAccount: (s) => s.accountType === "teacher",
    getStudentProfile: () => ({ deviceToken: "test-token" }), isStudyCafeLocalPreview: () => false,
    isStandaloneStudentApp: () => false, navigator: { userAgent: "test" },
    document: { visibilityState: "visible", activeElement: { isConnected: true, focus() {} }, addEventListener() {}, removeEventListener() {} },
    window: { setInterval() { return 1; }, setTimeout() {}, clearTimeout() {} },
    localStorage: { getItem: (k) => saved.get(k), setItem: (k, v) => saved.set(k, v) },
    hasOpenAppModal: () => modalOpen,
    notify: (message) => toasts.push(message),
    closeInfoModal: () => { modalOpen = false; }, render() {},
    el: (tag, attrs, children) => ({ tag, attrs, children }),
    openInfoModal: (options) => {
      shown.push(options); modalOpen = true;
      return { modal: { isConnected: true, setAttribute() {}, querySelector: () => ({ addEventListener() {} }), remove() { modalOpen = false; } }, confirmButton: { focus() {} } };
    },
    fetch: async (url, options) => {
      const body = JSON.parse(options.body); requests.push(body);
      if (failed) throw new Error("network");
      return { ok: true, json: async () => body.action === "sync" ? payload : { ok: true } };
    },
  });
  vm.runInContext(fs.readFileSync("student-rewards.js", "utf8"), context);
  await vm.runInContext("syncStudentRewards()", context);
  assert.equal(requests[0].welcome, true);
  assert.equal(shown.length, 1);
  assert.match(shown[0].title, /가입을 환영/);
  assert.match(JSON.stringify(shown[0].content), /300P/);
  shown[0].onConfirm();
  await Promise.resolve(); await Promise.resolve();
  assert(requests.some((request) => request.action === "acknowledge" && request.rewardKey === "welcome"));
  await vm.runInContext("syncStudentRewards({force:true})", context);
  assert.equal(shown.length, 1, "seen reward never opens repeatedly after response retry");

  payload = { ...payload, completed: true, balance: 400, notifications: [{ key: "routine3", amount: 300, awardedAt: reward.awardedAt }] };
  context.studyCafePreviewState = { running: true };
  await vm.runInContext("syncStudentRewards({force:true})", context);
  assert.equal(shown.length, 1, "active study only receives a small toast");
  assert.equal(toasts.length, 1);
  assert.match(toasts[0], /\+300P/);
  assert(!requests.some((request) => request.action === "acknowledge" && request.rewardKey === "routine3"), "toast must leave the server celebration pending");
  await vm.runInContext("syncStudentRewards({force:true})", context);
  assert.equal(toasts.length, 1, "repeated sync does not repeat the earned toast");
  context.studyCafePreviewState.running = false;
  context.studyCafeTimerActionPending = true;
  vm.runInContext("showPendingStudentReward()", context);
  assert.equal(shown.length, 1, "optimistic pause must wait for timer confirmation");
  context.studyCafeTimerActionPending = false;
  modalOpen = true;
  await vm.runInContext("syncStudentRewards({force:true})", context);
  assert.equal(shown.length, 1, "does not replace an existing dialog");
  modalOpen = false;
  vm.runInContext("showPendingStudentReward()", context);
  assert.equal(shown.length, 2);
  assert.match(shown[1].title, /챌린지 달성/);
  shown[1].onConfirm();

  student = { id: "21002", className: "테스트반" };
  context.currentRoute = "mypage";
  payload = { ...payload, completed: false, notifications: [] };
  await vm.runInContext("syncStudentRewards()", context);
  assert.equal(requests.at(-1).welcome, false);
  context.currentRoute = "home";
  await vm.runInContext("syncStudentRewards()", context);
  assert.equal(requests.at(-1).welcome, true, "first home bypasses preceding mypage throttle");
  failed = true;
  await vm.runInContext("syncStudentRewards({force:true})", context);
  assert.equal(shown.length, 2, "failed grant must not show success");
  const count = requests.length;
  student = { ...student, accountType: "teacher" };
  await vm.runInContext("syncStudentRewards({force:true})", context);
  assert.equal(requests.length, count, "teacher app accounts excluded in UI");

  student = { id: "21002", className: "테스트반" };
  const jobs = [], syncs = [];
  context.window.setTimeout = (fn) => { jobs.push(fn); return jobs.length; };
  context.syncStudentRewards = (options) => syncs.push(options);
  vm.runInContext("scheduleStudentRewardsSync(); scheduleStudentRewardsSync({force:true});", context);
  assert.equal(jobs.length, 1);
  jobs.shift()();
  assert.equal(syncs[0].force, true, "pause/stop forced sync is preserved when a render already queued one");
}

async function localPreviewTests() {
  const saved = new Map();
  const initialWallet = { pointGrantVersion: 4, balance: 1234, inventory: [{ itemId: "desk_sprout" }],
    equipment: { desk: ["desk_sprout"] }, history: [], awardedStudyPoints: 0 };
  saved.set("ronpark-study-cafe-shop:21001", JSON.stringify(initialWallet));
  let student = { id: "21001", className: "미리보기반" };
  let shown = [], modalOpen = false, requests = 0;
  function harness() {
    const context = vm.createContext({
      APP_MODE: "student", currentRoute: "home", console,
      getAuthedStudent: () => student, isTeacherAppAccount: (s) => s.accountType === "teacher",
      getStudentProfile: () => ({}), isStudyCafeLocalPreview: () => true,
      getStudySubjectTotalElapsedMs: () => 0, notify() {},
      window: { setInterval() { return 1; }, setTimeout() {}, clearTimeout() {} },
      document: { visibilityState: "visible", activeElement: null, addEventListener() {}, removeEventListener() {} },
      localStorage: { getItem: (k) => saved.get(k) || null, setItem: (k, v) => saved.set(k, v), removeItem: (k) => saved.delete(k) },
      hasOpenAppModal: () => modalOpen, closeInfoModal: () => { modalOpen = false; }, render() {},
      el: (tag, attrs, children) => ({ tag, attrs, children }),
      button: (label) => ({ label }),
      openInfoModal: (options) => {
        shown.push(options); modalOpen = true;
        return { modal: { isConnected: true, setAttribute() {}, querySelector: () => ({ addEventListener() {} }), remove() {} }, confirmButton: { focus() {} } };
      },
      fetch: async () => { requests++; throw new Error("Preview must not contact production"); },
    });
    vm.runInContext(fs.readFileSync("study-shop.js", "utf8"), context);
    vm.runInContext(fs.readFileSync("student-rewards.js", "utf8"), context);
    return context;
  }
  let context = harness();
  await vm.runInContext("syncStudentRewards()", context);
  assert.equal(shown.length, 1, "local home shows welcome with no device token");
  assert.match(JSON.stringify(shown[0].content), /100P/);
  assert.match(JSON.stringify(shown[0].content), /300P/);
  assert.equal(JSON.parse(saved.get("ronpark-study-cafe-shop:21001")).balance, 1334);
  shown[0].onConfirm();
  await Promise.resolve();
  context = harness();
  await vm.runInContext("syncStudentRewards()", context);
  assert.equal(shown.length, 1, "reload preserves acknowledged welcome");
  let result = await vm.runInContext('requestStudentRewards("preview", {rewardKey:"routine3"})', context);
  assert.equal(result.balance, 1634);
  assert.equal(result.completed, true);
  context.studyCafePreviewState = { running: true };
  await vm.runInContext("syncStudentRewards({force:true})", context);
  assert.equal(shown.length, 1, "local preview defers the challenge animation while studying");
  assert.equal(JSON.parse(saved.get("ronpark-student-rewards-local:v1:21001")).receipts.routine3.acknowledged, false);
  context = harness();
  await vm.runInContext("syncStudentRewards()", context);
  assert.equal(shown.length, 2, "next app session restores the pending challenge modal");
  assert.match(shown.at(-1).title, /챌린지 달성/);
  shown.at(-1).onConfirm();
  result = await vm.runInContext('requestStudentRewards("preview", {rewardKey:"routine3"})', context);
  assert.equal(result.balance, 1634, "replaying challenge never duplicates 300P");
  await vm.runInContext('requestStudentRewards("preview", {rewardKey:"welcome"})', context);
  await vm.runInContext("syncStudentRewards({force:true})", context);
  assert.match(shown.at(-1).title, /가입을 환영/);
  const wallet = JSON.parse(saved.get("ronpark-study-cafe-shop:21001"));
  assert.equal(wallet.balance, 1634);
  assert.deepEqual(wallet.inventory, initialWallet.inventory);
  assert.deepEqual(wallet.equipment.desk, initialWallet.equipment.desk);
  const history = await vm.runInContext('requestStudentRewards("history")', context);
  assert.deepEqual(Array.from(history.history, (row) => row.amount), [300, 100]);
  assert.equal(requests, 0);
  shown.at(-1).onConfirm();
  student = { id: "21002", className: "미리보기반" };
  await vm.runInContext("syncStudentRewards()", context);
  assert.equal(JSON.parse(saved.get("ronpark-study-cafe-shop:21002")).balance, 20100);
  assert.equal(JSON.parse(saved.get("ronpark-study-cafe-shop:21001")).balance, 1634, "account wallets stay separate");
  student.accountType = "teacher";
  assert.equal((await vm.runInContext('requestStudentRewards("sync", {welcome:true})', context)).ok, false);
  assert.equal(vm.runInContext("renderLocalStudentRewardControls()", context), null);
}

function rewardAnimationTests() {
  const frames = new Map();
  let id = 0, reduced = false;
  const counter = { dataset: { rewardCount: "300" }, textContent: "300" };
  const modal = { isConnected: true, querySelector: () => counter };
  const context = vm.createContext({
    window: { requestAnimationFrame(fn) { frames.set(++id, fn); return id; },
      cancelAnimationFrame(key) { frames.delete(key); }, matchMedia: () => ({ matches: reduced }) },
    document: { visibilityState: "visible" }, modal,
  });
  vm.runInContext(fs.readFileSync("student-rewards.js", "utf8"), context);
  function frame(time) {
    const [key, fn] = frames.entries().next().value;
    frames.delete(key); fn(time);
  }
  vm.runInContext("animateStudentRewardAmount(modal, 300)", context);
  assert.equal(counter.textContent, "0");
  frame(1000); frame(1450);
  assert(Number(counter.textContent) > 0 && Number(counter.textContent) < 300);
  frame(1900);
  assert.equal(counter.textContent, "300");
  assert.equal(frames.size, 0, "animation ends rather than looping");
  const stop = vm.runInContext("animateStudentRewardAmount(modal, 100)", context);
  stop();
  assert.equal(counter.textContent, "100");
  assert.equal(frames.size, 0, "closing the modal cancels pending animation work");
  reduced = true; counter.textContent = "300";
  vm.runInContext("animateStudentRewardAmount(modal, 300)", context);
  assert.equal(counter.textContent, "300");
  assert.equal(frames.size, 0, "reduced motion shows the awarded amount immediately");
  reduced = false;
  vm.runInContext("animateStudentRewardAmount(modal, 300)", context);
  context.document.visibilityState = "hidden";
  frame(2000);
  assert.equal(counter.textContent, "300");
  assert.equal(frames.size, 0, "backgrounding the app finishes animation without more work");
}

(async () => {
  await apiTests(); await uiTests(); await localPreviewTests(); rewardAnimationTests();
  console.log("student rewards API/UI: authentication, scoping, server-controlled amounts, retries, notifications and account changes passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });
