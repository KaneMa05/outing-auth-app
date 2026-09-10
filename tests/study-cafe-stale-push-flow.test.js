const assert = require("node:assert/strict");

const pushCalls = [];
const pushModulePath = require.resolve("../api/study-cafe-idle-push");
require.cache[pushModulePath] = {
  id: pushModulePath,
  filename: pushModulePath,
  loaded: true,
  exports: {
    STUDY_CAFE_IDLE_PUSH_STUDENT_ID: "21001",
    sendStudyCafeIdleReleasePush: async (payload) => {
      pushCalls.push(payload);
      return { sentCount: 1 };
    },
  },
};

const { clearStalePresence } = require("../api/study-cafe")._private;
const originalFetch = global.fetch;
const originalEnv = {
  url: process.env.SUPABASE_URL,
  key: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    text: async () => payload === null ? "" : JSON.stringify(payload),
  };
}

async function runScenario(row, deletedRows = [row]) {
  const requests = [];
  global.fetch = async (url, options) => {
    const value = String(url);
    requests.push({ url: value, options });
    if (value.includes("last_heartbeat_at=lt.") && options.method === "GET") {
      return jsonResponse([row]);
    }
    if (value.includes("study_cafe_presence?") && options.method === "DELETE") {
      return options.headers.Prefer === "return=representation"
        ? jsonResponse(deletedRows)
        : jsonResponse(null, 204);
    }
    if (value.includes("study_cafe_sessions?") && options.method === "GET") {
      return jsonResponse([]);
    }
    throw new Error(`unexpected request: ${options.method} ${value}`);
  };
  await clearStalePresence(new Date("2026-09-10T03:00:00.000Z"));
  return requests;
}

(async () => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";

  const targetUnder15Minutes = await runScenario({
    student_id: "21001",
    seat_number: 3,
    status: "studying",
    last_heartbeat_at: "2026-09-10T02:46:00.000Z",
    updated_at: "2026-09-10T02:30:00.000Z",
  });
  assert.equal(targetUnder15Minutes.length, 1);
  assert.equal(targetUnder15Minutes.some((request) => request.options.method === "DELETE"), false);
  assert.equal(pushCalls.length, 0);

  const targetOver15Minutes = await runScenario({
    student_id: "21001",
    seat_number: 3,
    status: "studying",
    last_heartbeat_at: "2026-09-10T02:44:00.000Z",
    updated_at: "2026-09-10T02:30:00.000Z",
  });
  const targetDelete = targetOver15Minutes.find((request) => request.options.method === "DELETE");
  assert.ok(targetDelete);
  assert.match(targetDelete.url, /student_id=eq\.21001/);
  assert.match(targetDelete.url, /last_heartbeat_at=eq\./);
  assert.match(targetDelete.url, /updated_at=eq\./);
  assert.equal(targetDelete.options.headers.Prefer, "return=representation");
  assert.deepEqual(pushCalls, [{
    studentId: "21001",
    seatNumber: 3,
    releasedAt: "2026-09-10T02:44:00.000Z",
  }]);

  const nonTargetRequests = await runScenario({
    student_id: "21002",
    seat_number: 4,
    status: "studying",
    last_heartbeat_at: "2026-09-10T02:57:00.000Z",
    updated_at: "2026-09-10T02:30:00.000Z",
  });
  const nonTargetDelete = nonTargetRequests.find((request) => request.options.method === "DELETE");
  assert.ok(nonTargetDelete);
  assert.match(nonTargetDelete.url, /student_id=eq\.21002/);
  assert.doesNotMatch(nonTargetDelete.url, /last_heartbeat_at=eq\./);
  assert.equal(nonTargetDelete.options.headers.Prefer, undefined);
  assert.equal(pushCalls.length, 1);

  const raceRequests = await runScenario({
    student_id: "21001",
    seat_number: 3,
    status: "studying",
    last_heartbeat_at: "2026-09-10T02:44:00.000Z",
    updated_at: "2026-09-10T02:30:00.000Z",
  }, []);
  assert.equal(
    raceRequests.some((request) => request.url.includes("study_cafe_sessions?")),
    false
  );
  assert.equal(pushCalls.length, 1);

  console.log("study cafe stale push flow tests passed");
})().finally(() => {
  global.fetch = originalFetch;
  if (originalEnv.url === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = originalEnv.url;
  if (originalEnv.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = originalEnv.key;
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
