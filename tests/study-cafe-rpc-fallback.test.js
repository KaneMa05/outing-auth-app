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
  assert.equal(studyCafeRpcCalls, 1, "failed study cafe RPC should be disabled for this server instance");

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
  assert.equal(studyRoomRpcCalls, 1, "failed room RPC should be disabled for this server instance");

  console.log("study cafe RPC fallback tests passed");
})()
  .finally(() => {
    global.fetch = originalFetch;
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
