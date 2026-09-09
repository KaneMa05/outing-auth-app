const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { test } = require("node:test");

const source = fs.readFileSync("app.js", "utf8");
function extract(name) {
  const start = source.search(new RegExp(`^(?:async )?function ${name}\\(`, "m"));
  assert.ok(start >= 0, `missing function ${name}`);
  const tail = source.slice(start);
  const next = tail.slice(1).search(/^(?:async )?function /m);
  return next < 0 ? tail : tail.slice(0, next + 1);
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function flush() {
  for (let i = 0; i < 60; i += 1) await Promise.resolve();
}

function harness({ fullscreen = false, privateSeat = false } = {}) {
  let now = 100000;
  let sequence = 0;
  const timers = new Map();
  const events = {};
  const nodes = [];
  const requests = [];
  const notices = [];
  const server = { seat: true, status: "running", subject: "해사법규" };
  const controls = { loadOk: true, roomOk: true, request: null, loadGate: null, loads: 0, studentId: "20001" };
  const seatId = privateSeat ? "private-seat-room-1" : "seat-1";
  function el(tag, attrs = {}, children = []) {
    const node = {
      tag, ...attrs, children: Array.isArray(children) ? children : [children], dataset: {},
      remove() { const index = nodes.indexOf(this); if (index >= 0) nodes.splice(index, 1); },
      focus() {},
    };
    return node;
  }
  const c = {
    APP_MODE: "student", currentRoute: "study-timer", console, AbortController,
    Date: class extends Date { static now() { return now; } },
    STUDY_CAFE_REQUEST_TIMEOUT_MS: 12000, STUDY_CAFE_AUTO_PAUSE_DELAY_MS: 30000,
    STUDY_CAFE_IDLE_RELEASE_MS: 900000, STUDY_CAFE_IDLE_RELEASE_RETRY_MS: 10000,
    studyCafePendingRequests: new Set(), studyCafeTimerActionPending: false,
    studyCafeAutoPauseRecovery: null, studyCafeAutoPauseRecoveryPromise: null,
    studyCafeAutoPauseDeadline: 0, studyCafeAutoPauseTimer: null,
    studyCafeSessionRevision: 0, studyCafeIdleReleasePending: false,
    studyCafeCountdownInterval: null, studyCafeLocalFallback: false,
    studyCafePreviewState: {
      selectedSeatId: seatId, subject: server.subject, running: true, paused: false,
      startedAt: now - 1000, subjectStartedAt: now - 1000, elapsedMs: 0,
      subjectElapsedMs: {}, idleSince: 0, timerFullscreen: fullscreen,
    },
    studyCafeRemoteState: { available: true, loading: false, requestedRefreshTimer: null },
    studyRoomState: { loading: false, room: privateSeat ? { mySeatNumber: 1 } : null },
    document: {
      visibilityState: "visible", focused: true,
      hasFocus() { return this.focused; },
      addEventListener: (name, callback) => { events[name] = callback; },
      querySelector(selector) { return nodes.find(node => (node.className || "").split(" ").includes(selector.slice(1))) || null; },
      body: { appendChild(node) { nodes.push(node); } },
    },
    window: {
      setTimeout(callback, delay) { const id = ++sequence; timers.set(id, { callback, due: now + delay }); return id; },
      clearTimeout(id) { timers.delete(id); },
      addEventListener: (name, callback) => { events[name] = callback; },
      requestAnimationFrame(callback) { callback(); },
    },
    el,
    button: (label, className, type, onclick) => el("button", { className, type, onclick, label }),
    getAuthedStudent: () => ({ id: controls.studentId }),
    getStudentProfile: () => ({ deviceToken: "test-token" }),
    isOnlineStudentExperience: () => true,
    isStudyCafeLocalPreview: () => false,
    isStandaloneStudentApp: () => false,
    navigator: { userAgent: "test" },
    confirm: () => true,
    notify: message => notices.push(message),
    renderStudyCafeStateUpdate() {}, invalidateStudyTimerStatsCache() {},
    getStudyCafeElapsedMs: () => 1000, commitCurrentStudySubjectElapsed() {},
    requestStudyCafeRemoteRefresh() {},
    closeInfoModal() {},
    openInfoModal(options) { nodes.push(el("div", { className: options.className, options })); },
    releaseStudyCafeSeat: async () => { throw new Error("unexpected idle release"); },
    async ensureStudyCafeRemoteLoaded() {
      controls.loads += 1;
      c.studyCafeRemoteState.loading = true;
      try {
        if (controls.loadGate) await controls.loadGate.promise;
        if (!controls.loadOk) return false;
        c.studyCafePreviewState.selectedSeatId = server.seat ? seatId : "";
        c.studyCafePreviewState.running = server.seat && server.status === "running";
        c.studyCafePreviewState.paused = server.seat && server.status === "paused";
        c.studyCafePreviewState.subject = server.seat ? server.subject : "";
        return true;
      } finally { c.studyCafeRemoteState.loading = false; }
    },
    async ensureStudyRoomLoaded() {
      if (!controls.roomOk) return false;
      c.studyRoomState.room = server.seat ? { mySeatNumber: 1 } : null;
      return true;
    },
    async fetch(url, options) {
      const action = JSON.parse(options.body).action;
      requests.push(action);
      if (controls.request) return controls.request(action, options, url);
      if (action === "timer_pause") server.status = "paused";
      if (action === "timer_resume" || action === "timer_start") server.status = "running";
      return { ok: true, status: 200, json: async () => action === "load" ? {
        ok: true, studyDate: "2026-09-09",
        presence: server.seat && !privateSeat ? { seatNumber: 1 } : null,
        activeSession: server.seat ? { id: "session-1", subject: server.subject, status: server.status, elapsedSeconds: 10 } : null,
        subjectTotals: {}, room: url.endsWith("rooms") && server.seat ? { id: "room-1", mySeatNumber: 1 } : null,
      } : { ok: true } };
    },
  };
  vm.createContext(c);
  const functions = [
    "withStudyCafeRequestTimeout", "expireStudyCafeRequests", "requestStudyCafeAction", "requestStudyRoomAction",
    "beginStudyCafeLocalSessionMutation", "finishStudyCafeLocalSessionMutation", "mutateStudyCafeRemote",
    "bindStudyCafeLifecycleRefresh", "reconcileStudyCafeAfterBackgroundAutoPause", "scheduleStudyCafeAutoPause",
    "clearStudyCafeAutoPauseRecovery", "requireStudyCafeTimerReconciliation", "isStudyCafeTimerRecoveryRequired",
    "showStudyCafeAutoPauseRecoveryModal", "showStudyCafeAutoPauseModal", "closeStudyCafeAutoPauseModal",
    "pauseStudyCafeTimer", "beginStudyCafeTimer", "checkStudyCafeIdleSeat", "showStudyCafeIdleAutoReleaseModal",
    "isStudyCafeIdleReleaseDue",
  ];
  vm.runInContext(functions.map(extract).join("\n"), c);
  c.bindStudyCafeLifecycleRefresh();
  return {
    c, timers, events, requests, notices, server, controls, nodes,
    installRealLoaders() {
      Object.assign(c, {
        studyTodoDeletePendingKeys: new Set(), studyTodoMutationRevision: 0, studySubjectMutationRevision: 0,
        STUDY_CAFE_PREVIEW_SEATS: [{ id: "seat-1" }],
        formatStudyBusinessDateKey: () => "2026-09-09",
        ensureStudyCafeRemoteTimers() {}, ensureStudyRoomRefresh() {},
        isStudyCafeRoute: () => true, getStudyCafeRoomIndexForSeat: () => 0,
      });
      Object.assign(c.studyCafeRemoteState, {
        studentId: "20001", studyDateKey: "2026-09-09", rankingPeriods: {},
        todosByDate: {}, subjectGoalsByDate: {},
      });
      vm.runInContext([
        "ensureStudyCafeRemoteLoaded", "waitForStudyCafeRemoteLoad", "hydrateStudyCafeSnapshot",
        "ensureStudyRoomLoaded", "resetStudyCafeLocalSeatForPrivateRoom",
      ].map(extract).join("\n"), c);
    },
    modal: () => c.document.querySelector(".study-cafe-auto-pause-modal"),
    hide() { c.document.visibilityState = "hidden"; c.document.focused = false; events.visibilitychange(); },
    visible() { c.document.visibilityState = "visible"; c.document.focused = true; },
    jump(ms) { now += ms; },
    async runDue() {
      for (let i = 0; i < 100; i += 1) {
        const due = [...timers].find(([, timer]) => timer.due <= now);
        if (!due) { await flush(); if (![...timers.values()].some(timer => timer.due <= now)) return; continue; }
        timers.delete(due[0]); due[1].callback(); await flush();
      }
      throw new Error("timer loop did not settle");
    },
  };
}

test("short absence does not pause, and duplicate blur preserves the first deadline", async () => {
  const h = harness(); h.hide(); const deadline = h.c.studyCafeAutoPauseDeadline;
  h.jump(10000); h.events.blur(); assert.equal(h.c.studyCafeAutoPauseDeadline, deadline);
  h.visible(); h.events.focus(); await h.runDue();
  assert.equal(h.c.studyCafeAutoPauseRecovery, null);
  assert.equal(h.requests.length, 0);
  assert.equal(h.modal(), null);
});

for (const fullscreen of [false, true]) {
  for (const callbackFirst of [false, true]) {
    test(`long return pauses and can resume: fullscreen=${fullscreen}, callbackFirst=${callbackFirst}`, async () => {
      const h = harness({ fullscreen }); h.hide(); h.jump(600000); h.visible();
      if (callbackFirst) await h.runDue();
      h.events.focus(); h.events.visibilitychange(); h.events.pageshow();
      await h.runDue();
      assert.equal(h.server.status, "paused");
      assert.equal(h.requests.filter(action => action === "timer_pause").length, 1);
      assert.equal(h.nodes.filter(node => node.className === "study-cafe-auto-pause-modal").length, 1);
      const resume = h.modal().children[1].children.find(node => node.label === "계속 공부하기");
      assert.ok(resume);
      await resume.onclick();
      assert.equal(h.server.status, "running");
      assert.equal(h.c.studyCafeTimerActionPending, false);
      assert.equal(h.modal(), null);
    });
  }
}

test("background pause failure keeps recovery and succeeds on return", async () => {
  const h = harness();
  h.controls.request = async () => ({ ok: false, status: 503, json: async () => ({ ok: false }) });
  h.hide(); h.jump(30000); await h.runDue();
  assert.ok(h.c.studyCafeAutoPauseDeadline > 0);
  assert.equal(h.c.studyCafePreviewState.running, true);
  h.controls.request = null; h.visible(); h.events.focus(); await h.runDue();
  assert.equal(h.server.status, "paused");
  assert.equal(h.c.studyCafeAutoPauseRecovery, null);
  assert.ok(h.modal());
});

test("frozen request expires on return, releases controls and ignores its late response", async () => {
  const h = harness({ fullscreen: true }); const request = deferred();
  h.controls.request = () => request.promise;
  h.hide(); h.jump(30000); await h.runDue();
  assert.equal(h.c.studyCafeTimerActionPending, true);
  h.jump(600000); h.visible(); h.controls.request = null; h.events.focus();
  assert.equal(h.modal().dataset.recoveryStage, "checking");
  await flush(); h.jump(50); await h.runDue();
  assert.equal(h.c.studyCafeTimerActionPending, false);
  assert.equal(h.c.studyCafePreviewState.paused, true);
  assert.equal(h.c.studyCafeAutoPauseRecovery, null);
  request.resolve({ ok: true, status: 200, json: async () => ({ ok: true }) });
  await flush();
  assert.equal(h.c.studyCafePreviewState.paused, true);
  assert.equal(h.c.studyCafePendingRequests.size, 0);
});

test("optimistic pause cannot show a saved modal until the request and a fresh load finish", async () => {
  const h = harness(); const request = deferred();
  h.controls.request = () => request.promise;
  h.hide(); h.jump(30000); await h.runDue(); h.visible(); h.events.focus();
  assert.equal(h.c.studyCafePreviewState.paused, true);
  assert.equal(h.modal().dataset.recoveryStage, "checking");
  h.server.status = "paused";
  request.resolve({ ok: true, status: 200, json: async () => ({ ok: true }) });
  await h.runDue();
  assert.equal(h.modal().dataset.recoveryStage, undefined);
  assert.equal(h.notices.length, 0);
});

test("failed fresh load never treats stale paused state as success; online event retries", async () => {
  const h = harness(); h.hide(); h.jump(30000); await h.runDue();
  h.controls.loadOk = false; h.visible(); h.events.focus(); await h.runDue();
  assert.equal(h.modal().dataset.recoveryStage, "failed");
  assert.ok(h.c.studyCafeAutoPauseRecovery);
  h.controls.loadOk = true; h.events.online(); await h.runDue();
  assert.equal(h.modal().dataset.recoveryStage, undefined);
  assert.equal(h.c.studyCafeAutoPauseRecovery, null);
});

test("lost pause response is reconciled from the committed server state", async () => {
  const h = harness();
  h.controls.request = async action => {
    assert.equal(action, "timer_pause"); h.server.status = "paused";
    return { ok: false, status: 502, json: async () => ({ ok: false }) };
  };
  h.hide(); h.jump(30000); h.visible(); h.events.focus(); await h.runDue();
  assert.equal(h.requests.length, 1);
  assert.equal(h.c.studyCafePreviewState.paused, true);
  assert.equal(h.modal().dataset.recoveryStage, undefined);
});

for (const privateSeat of [false, true]) {
  test(`expired seat shows one notice and exits fullscreen, private=${privateSeat}`, async () => {
    const h = harness({ fullscreen: true, privateSeat });
    h.hide(); h.jump(1200000); h.server.seat = false; h.visible();
    h.events.focus(); h.events.pageshow(); await h.runDue();
    assert.equal(h.modal(), null);
    assert.equal(h.c.studyCafePreviewState.timerFullscreen, false);
    assert.equal(h.c.studyCafePreviewState.selectedSeatId, "");
    assert.equal(h.nodes.filter(node => node.className === "study-cafe-idle-release-modal").length, 1);
    assert.equal(h.requests.length, 0);
  });
}

test("private room load failure does not confirm a stale seat or enable resume", async () => {
  const h = harness({ privateSeat: true }); h.hide(); h.jump(30000); await h.runDue();
  h.controls.roomOk = false; h.visible(); h.events.focus(); await h.runDue();
  assert.equal(h.modal().dataset.recoveryStage, "failed");
  assert.ok(h.c.studyCafeAutoPauseRecovery);
});

test("timer request timeout covers response body and room API", async () => {
  for (const requestName of ["requestStudyCafeAction", "requestStudyRoomAction"]) {
    const h = harness();
    h.controls.request = async () => ({ ok: true, status: 200, json: () => new Promise(() => {}) });
    const result = h.c[requestName]("load"); await flush(); h.jump(12000); await h.runDue();
    assert.equal((await result).error, "request_timeout");
    assert.equal(h.c.studyCafePendingRequests.size, 0);
  }
});

test("idle release waits for mutation completion and recovery", () => {
  const h = harness(); h.c.studyCafePreviewState.running = false;
  h.c.studyCafePreviewState.idleSince = 1; h.jump(1200000);
  h.c.studyCafeTimerActionPending = true;
  assert.equal(h.c.checkStudyCafeIdleSeat(), false);
  h.c.requireStudyCafeTimerReconciliation();
  assert.equal(h.c.checkStudyCafeIdleSeat(), false);
});

test("student change cancels obsolete recovery without sending a pause", async () => {
  const h = harness(); h.hide(); h.jump(30000); h.controls.studentId = "20002";
  h.visible(); h.events.focus(); await h.runDue();
  assert.equal(h.requests.length, 0);
  assert.equal(h.modal(), null);
  assert.equal(h.c.studyCafeAutoPauseRecovery, null);
});

test("pagehide retains failed pause for pageshow recovery", async () => {
  const h = harness();
  h.controls.request = async () => ({ ok: false, status: 503, json: async () => ({ ok: false }) });
  h.hide(); h.events.pagehide(); await h.runDue();
  assert.ok(h.c.studyCafeAutoPauseRecovery);
  h.controls.request = null; h.jump(600000); h.visible(); h.events.pageshow(); await h.runDue();
  assert.equal(h.server.status, "paused");
  assert.equal(h.modal().dataset.recoveryStage, undefined);
});

for (const privateSeat of [false, true]) {
  test(`recovery with real API wrappers and snapshot hydration, private=${privateSeat}`, async () => {
    const h = harness({ privateSeat }); h.installRealLoaders();
    h.hide(); h.jump(60000); h.visible(); h.events.focus(); await h.runDue();
    assert.equal(h.server.status, "paused");
    assert.equal(h.c.studyCafePreviewState.paused, true);
    assert.equal(h.c.studyCafePreviewState.elapsedMs, 10000);
    assert.equal(h.modal().dataset.recoveryStage, undefined);
    assert.equal(h.c.studyCafeAutoPauseRecovery, null);
  });
}

test("normal snapshot refresh also explains a lost public seat while running", async () => {
  const h = harness({ fullscreen: true }); h.installRealLoaders(); h.server.seat = false;
  assert.equal(await h.c.ensureStudyCafeRemoteLoaded({ force: true }), true);
  const notice = h.nodes.find(node => node.className === "study-cafe-idle-release-modal");
  assert.ok(notice);
  assert.match(notice.options.content.children[0].children[0], /서버에서 현재 좌석 이용이 종료/);
  assert.equal(h.c.studyCafePreviewState.timerFullscreen, false);
});

test("private room response started before a mutation cannot clear its current seat", async () => {
  const h = harness({ privateSeat: true }); h.installRealLoaders(); const response = deferred();
  h.controls.request = () => response.promise;
  const load = h.c.ensureStudyRoomLoaded({ force: true });
  h.c.beginStudyCafeLocalSessionMutation(); h.c.studyCafeTimerActionPending = true;
  response.resolve({ ok: true, status: 200, json: async () => ({ ok: true, room: null }) });
  assert.equal(await load, false);
  assert.equal(h.c.studyRoomState.room.mySeatNumber, 1);
  assert.ok(h.c.studyCafePreviewState.selectedSeatId.startsWith("private-seat-"));
  assert.equal(h.nodes.length, 0);
});

test("an intentional private seat release does not produce an automatic expiry notice", async () => {
  const h = harness({ privateSeat: true }); h.installRealLoaders();
  h.c.resetStudyCafeLocalSeatForPrivateRoom(); h.server.seat = false;
  assert.equal(await h.c.ensureStudyRoomLoaded({ force: true }), true);
  assert.equal(h.nodes.length, 0);
});

test("automatic retries are bounded and a dismissed error can be reopened by a timer action", async () => {
  const h = harness(); h.hide(); h.jump(30000); h.controls.loadOk = false;
  h.visible(); h.events.focus(); await h.runDue();
  for (let i = 0; i < 5; i += 1) { h.jump(10000); await h.runDue(); }
  assert.equal(h.controls.loads, 3);
  const dismiss = h.modal().children[1].children.find(node => node.label === "나중에 확인하기");
  dismiss.onclick(); assert.equal(h.modal(), null);
  h.controls.loadOk = true;
  assert.equal(await h.c.beginStudyCafeTimer("seat-1", "해사법규", true), false);
  await h.runDue();
  assert.equal(h.modal().dataset.recoveryStage, undefined);
  assert.equal(h.server.status, "paused");
});

test("manual start and pause timeouts release the action lock and restore usable controls", async () => {
  for (const action of ["start", "pause"]) {
    const h = harness();
    if (action === "start") {
      h.server.status = "paused";
      h.c.studyCafePreviewState.running = false;
      h.c.studyCafePreviewState.paused = true;
    }
    h.controls.request = () => new Promise(() => {});
    const result = action === "start"
      ? h.c.beginStudyCafeTimer("seat-1", "해사법규", true)
      : h.c.pauseStudyCafeTimer();
    assert.equal(h.c.studyCafeTimerActionPending, true);
    h.controls.request = null; h.jump(12000); await h.runDue();
    assert.equal(await result, false);
    assert.equal(h.c.studyCafeTimerActionPending, false);
    assert.equal(h.c.studyCafeAutoPauseRecovery, null);
    const resume = h.modal().children[1].children.find(node => node.label === "계속 공부하기");
    await resume.onclick();
    assert.equal(h.server.status, "running");
    assert.equal(h.c.studyCafeTimerActionPending, false);
  }
});

test("an already ended subject with a retained seat exits fullscreen without a resume action", async () => {
  const h = harness({ fullscreen: true }); h.hide(); h.jump(30000);
  h.server.status = "completed"; h.server.subject = ""; h.visible(); h.events.focus(); await h.runDue();
  assert.equal(h.modal(), null);
  assert.equal(h.c.studyCafePreviewState.timerFullscreen, false);
  assert.equal(h.c.studyCafePreviewState.selectedSeatId, "seat-1");
  assert.match(h.notices[0], /과목을 선택/);
  assert.equal(h.requests.length, 0);
});
