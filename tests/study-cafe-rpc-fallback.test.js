const assert = require("node:assert/strict");

const studyCafeHandler = require("../api/study-cafe");
const studyRoomHandler = require("../api/study-cafe-rooms");
const { loadStudyCafeSnapshotRows } = studyCafeHandler._private;
const { loadOwnRoom } = studyRoomHandler._private;

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  };
}

const originalFetch = global.fetch;
const originalWarn = console.warn;
const originalUrl = process.env.SUPABASE_URL;
const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const originalNow = Date.now;
let clock = originalNow();
Date.now = () => clock;

(async () => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
  console.warn = () => {};

  let studyCafeRpcCalls = 0;
  global.fetch = async (url) => {
    if (url.endsWith("/rpc/get_study_cafe_snapshot_data")) {
      studyCafeRpcCalls += 1;
      return jsonResponse({ code: "42501", message: "permission denied" }, 403);
    }
    if (url.includes("/study_cafe_subjects?")) {
      return jsonResponse([{ name: "fallback-law", sort_order: 0 }]);
    }
    return jsonResponse([]);
  };

  const now = new Date("2026-09-08T03:00:00.000Z");
  const firstStudyCafeLoad = await loadStudyCafeSnapshotRows("20001", now);
  const secondStudyCafeLoad = await loadStudyCafeSnapshotRows("20001", now);
  assert.deepEqual(firstStudyCafeLoad.subjects, [{ name: "fallback-law", sort_order: 0 }]);
  assert.deepEqual(secondStudyCafeLoad.subjects, [{ name: "fallback-law", sort_order: 0 }]);
  assert.equal(studyCafeRpcCalls, 1, "failed study cafe RPC cools down instead of retrying every request");

  let studyRoomRpcCalls = 0;
  global.fetch = async (url) => {
    if (url.endsWith("/rpc/get_study_cafe_room_snapshot")) {
      studyRoomRpcCalls += 1;
      return jsonResponse({ code: "P0001", message: "snapshot failed" }, 500);
    }
    if (url.includes("/study_cafe_room_members?student_id=eq.")) return jsonResponse([]);
    throw new Error(`unexpected study room fallback request: ${url}`);
  };

  const student = { id: "20001", name: "tester" };
  const firstRoomLoad = await loadOwnRoom(student);
  const secondRoomLoad = await loadOwnRoom(student);
  assert.deepEqual(firstRoomLoad, { room: null });
  assert.deepEqual(secondRoomLoad, { room: null });
  assert.equal(studyRoomRpcCalls, 1, "failed room RPC cools down");

  clock += 60000;
  let resolveProbe;
  global.fetch = async (url) => {
    if (url.endsWith("/rpc/get_study_cafe_snapshot_data")) {
      studyCafeRpcCalls++;
      return new Promise(resolve => { resolveProbe = resolve; });
    }
    return jsonResponse([]);
  };
  const recovering = loadStudyCafeSnapshotRows("20001", now);
  await Promise.resolve();
  await loadStudyCafeSnapshotRows("20002", now);
  assert.equal(studyCafeRpcCalls, 2, "only one recovery probe per instance is in flight");
  const validCafe = Object.fromEntries(["subjects", "todos", "subjectGoals", "profiles", "ownPresence", "activeSessions", "sessions", "presence", "onlineStudents"].map(key => [key, []]));
  resolveProbe(jsonResponse({ ...validCafe, subjects: [{ name: "recovered" }] }));
  assert.equal((await recovering).subjects[0].name, "recovered");
  let normalCalls = 0;
  global.fetch = async (url) => {
    normalCalls++;
    if (url.endsWith("/rpc/get_study_cafe_snapshot_data")) return jsonResponse(validCafe);
    if (url.endsWith("/rpc/get_study_cafe_room_snapshot")) return jsonResponse({ membership: null, room: null, members: [], profiles: [], students: [], messages: [], sessions: [] });
    throw new Error(`legacy query after recovery: ${url}`);
  };
  await loadStudyCafeSnapshotRows("20001", now);
  assert.deepEqual(await loadOwnRoom(student), { room: null });
  assert.equal(normalCalls, 2, "both APIs return to one snapshot request after recovery");

  const { createRpcRetryState } = require("../supabase-rpc-retry");
  const retry = createRpcRetryState();
  for (const delay of [60000, 120000, 240000, 300000, 300000]) {
    assert.equal(retry.begin(), true);
    retry.failed();
    clock += delay - 1;
    assert.equal(retry.begin(), false);
    clock += 1;
  }
  assert.equal(retry.begin(), true);
  assert.equal(retry.begin(), false, "bounded half-open probe");
  retry.succeeded();
  assert.equal(retry.begin(), true);
  retry.failed();
  clock += 60000;
  assert.equal(retry.begin(), true, "success resets the backoff");

  console.log("study cafe RPC fallback tests passed");
})()
  .finally(() => {
    global.fetch = originalFetch;
    Date.now = originalNow;
    console.warn = originalWarn;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
