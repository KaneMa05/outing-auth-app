const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { test } = require("node:test");

const source = fs.readFileSync("app.js", "utf8");
function extract(name) {
  const start = source.search(new RegExp(`^(?:async )?function ${name}\\(`, "m"));
  assert.ok(start >= 0, name);
  const rest = source.slice(start);
  const end = rest.slice(1).search(/^(?:async )?function /m);
  return end < 0 ? rest : rest.slice(0, end + 1);
}

function harness() {
  let now = 100000, sequence = 0;
  const timers = new Map(), calls = [];
  const control = { student: { id: "20001" }, online: true, recovery: false, gate: null, ok: true, roomResult: undefined, renders: 0 };
  const c = {
    APP_MODE: "student", currentRoute: "study-cafe", console,
    STUDY_CAFE_REALTIME_MIN_REFRESH_INTERVAL_MS: 1000, STUDY_CAFE_ACTION_REFRESH_DELAY_MS: 120,
    studyCafeTimerActionPending: false,
    studyCafeRemoteState: { loading: false },
    studyRoomState: { room: { id: "room-1" }, loading: false },
    Date: class extends Date { static now() { return now; } },
    document: { visibilityState: "visible" },
    window: {
      setTimeout(fn, ms) { const id = ++sequence; timers.set(id, { fn, due: now + ms }); return id; },
      clearTimeout(id) { timers.delete(id); },
    },
    getAuthedStudent: () => control.student,
    isOnlineStudentExperience: student => Boolean(student) && control.online,
    isStudyCafeRoute: () => ["study-cafe", "study-timer"].includes(c.currentRoute),
    isStudyCafeLocalPreview: () => false,
    isStudyCafeTimerRecoveryRequired: () => control.recovery,
    renderStudyCafeStateUpdate: () => { control.renders++; },
  };
  async function load(kind) {
    const state = kind === "room" ? c.studyRoomState : c.studyCafeRemoteState;
    assert.equal(state.loading, false, "loads must never overlap");
    const revision = state.realtimeRevision || 0;
    state.loading = true;
    calls.push({ kind, at: now, revision });
    try {
      if (control.gate) await control.gate;
      if (!control.ok) return false;
      state.realtimeLoadedRevision = revision;
      state.lastLoadedAt = now;
      if (kind === "room" && control.roomResult !== undefined) state.room = control.roomResult;
      return true;
    } finally { state.loading = false; }
  }
  c.ensureStudyCafeRemoteLoaded = () => load("cafe");
  c.ensureStudyRoomLoaded = () => load("room");
  vm.createContext(c);
  vm.runInContext([
    "getStudyCafeRealtimeRefreshScope", "queueStudyCafeRealtimeRefresh",
    "scheduleStudyCafeRealtimeRefresh", "scheduleStudyRoomRealtimeRefresh", "requestStudyCafeRemoteRefresh",
  ].map(extract).join("\n"), c);
  const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
  return {
    c, control, calls, timers, flush,
    async advance(ms) {
      const until = now + ms;
      for (let i = 0; i < 1000; i++) {
        await flush();
        const due = [...timers].filter(([, t]) => t.due <= until).sort((a, b) => a[1].due - b[1].due)[0];
        if (!due) { now = until; await flush(); return; }
        now = due[1].due; timers.delete(due[0]); due[1].fn();
      }
      throw new Error("timer loop did not settle");
    },
    event(kind) { kind === "room" ? c.scheduleStudyRoomRealtimeRefresh({ payload: { roomId: "room-1" } }) : c.scheduleStudyCafeRealtimeRefresh(); },
  };
}

for (const kind of ["cafe", "room"]) {
  test(`${kind}: isolated event retains its existing quick response`, async () => {
    const h = harness(), delay = kind === "room" ? 250 : 350;
    h.event(kind); await h.advance(delay - 1); assert.equal(h.calls.length, 0);
    await h.advance(1); assert.equal(h.calls.length, 1);
    await h.advance(5000); assert.equal(h.calls.length, 1);
  });

  test(`${kind}: continuous events are batched without starving the final update`, async () => {
    const h = harness();
    for (let i = 0; i < 25; i++) { h.event(kind); await h.advance(400); }
    assert.ok(h.calls.length > 1, "continuous changes must remain visible");
    await h.advance(1500);
    assert.ok(h.calls.length <= 11, `25 notifications produced ${h.calls.length} loads`);
    assert.equal(h.calls.at(-1).revision, 25, "the final event must be included");
    for (let i = 1; i < h.calls.length; i++) assert.ok(h.calls[i].at - h.calls[i - 1].at >= 1000);
    assert.equal(h.timers.size, 0);
  });

  test(`${kind}: events during a slow request cause exactly one trailing load`, async () => {
    const h = harness(); let release;
    h.control.gate = new Promise(resolve => { release = resolve; });
    h.event(kind); await h.advance(400);
    for (let i = 0; i < 20; i++) h.event(kind);
    await h.advance(3000); assert.equal(h.calls.length, 1);
    h.control.gate = null; release(); await h.flush(); await h.advance(1000);
    assert.equal(h.calls.length, 2); assert.equal(h.calls[1].revision, 21);
    assert.equal(h.timers.size, 0);
  });

  test(`${kind}: an own-action load after the notification satisfies the pending refresh`, async () => {
    const h = harness(); h.event(kind);
    await (kind === "room" ? h.c.ensureStudyRoomLoaded() : h.c.ensureStudyCafeRemoteLoaded());
    await h.advance(2000); assert.equal(h.calls.length, 1);
  });

  test(`${kind}: failure alone does not create a retry loop and a later event can recover`, async () => {
    const h = harness(); h.control.ok = false; h.event(kind);
    await h.advance(10000); assert.equal(h.calls.length, 1); assert.equal(h.timers.size, 0);
    h.control.ok = true; h.event(kind); await h.advance(1000); assert.equal(h.calls.length, 2);
  });

  test(`${kind}: hidden, logged-out, changed-student, other-route and recovery states cancel queued work`, async () => {
    for (const change of [h => { h.c.document.visibilityState = "hidden"; }, h => { h.control.student = null; },
      h => { h.control.student = { id: "20002" }; }, h => { h.c.currentRoute = "attendance"; }, h => { h.control.recovery = true; }]) {
      const h = harness(); h.event(kind); change(h); await h.advance(2000); assert.equal(h.calls.length, 0);
    }
  });
}

test("own action refresh bypasses the realtime cooldown and consumes its pending duplicate", async () => {
  const h = harness(); h.event("cafe"); await h.advance(350);
  h.event("cafe"); h.c.requestStudyCafeRemoteRefresh(); await h.advance(120);
  assert.equal(h.calls.length, 2); assert.equal(h.calls[1].at - h.calls[0].at, 120);
  await h.advance(1500); assert.equal(h.calls.length, 2);
});

test("private room filtering, switching and closure remain correct", async () => {
  const h = harness(); h.c.scheduleStudyRoomRealtimeRefresh({ payload: { roomId: "other" } });
  await h.advance(1000); assert.equal(h.calls.length, 0);
  h.event("room"); h.c.studyRoomState.room = { id: "other" };
  await h.advance(1000); assert.equal(h.calls.length, 0);
  h.c.studyRoomState.room = { id: "room-1" }; h.control.roomResult = null;
  h.event("room"); await h.advance(1000); assert.equal(h.control.renders, 1);
});

test("offline students and teacher/admin mode cannot enqueue cafe reads", async () => {
  const h = harness(); h.control.online = false; h.event("cafe"); h.event("room");
  h.control.online = true; h.c.APP_MODE = "teacher"; h.event("cafe"); h.event("room");
  await h.advance(1000); assert.equal(h.calls.length, 0);
});

for (const kind of ["cafe", "room"]) {
  test(`${kind}: actual loader preserves an event received after its request started`, async () => {
    const h = harness(); let release, requests = 0;
    const gate = new Promise(resolve => { release = resolve; });
    Object.assign(h.c, {
      studyCafeSessionRevision: 0, studyTodoMutationRevision: 0, studySubjectMutationRevision: 0,
      studyCafeCountdownInterval: null, studyTodoDeletePendingKeys: new Set(), studyCafeAutoPauseRecovery: null,
      studyCafePreviewState: {},
      ensureStudyCafeRemoteTimers() {}, ensureStudyRoomRefresh() {}, hydrateStudyCafeSnapshot() {},
      isStudyCafeIdleReleaseDue: () => false,
      async requestStudyCafeAction() { requests++; if (requests === 1) await gate; return { ok: true }; },
      async requestStudyRoomAction() { requests++; if (requests === 1) await gate; return { ok: true, room: { id: "room-1" } }; },
    });
    const loader = kind === "room" ? "ensureStudyRoomLoaded" : "ensureStudyCafeRemoteLoaded";
    vm.runInContext(extract(loader), h.c);
    h.event(kind); await h.advance(400); assert.equal(requests, 1);
    h.event(kind); await h.advance(1000); assert.equal(requests, 1);
    release(); await h.flush(); await h.advance(1000);
    assert.equal(requests, 2);
    const state = kind === "room" ? h.c.studyRoomState : h.c.studyCafeRemoteState;
    assert.equal(state.realtimeLoadedRevision, 2);
    assert.equal(h.timers.size, 0);
  });
}
