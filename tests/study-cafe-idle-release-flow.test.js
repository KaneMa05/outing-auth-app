const assert = require("node:assert/strict");

const pushCalls = [];
const pushModulePath = require.resolve("../api/study-cafe-idle-push");
require.cache[pushModulePath] = {
  id: pushModulePath,
  filename: pushModulePath,
  loaded: true,
  exports: {
    sendStudyCafeIdleReleasePush: async (payload) => {
      pushCalls.push(payload);
      return { sentCount: 1 };
    },
  },
};

const handler = require("../api/study-cafe");
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

function createResponse() {
  return {
    statusCode: 200,
    payload: null,
    setHeader() {},
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

async function invoke(studentId) {
  const response = createResponse();
  await handler({
    method: "POST",
    headers: {},
    body: {
      action: "release_seat",
      studentId,
      deviceToken: "device-token",
      idleAutoRelease: true,
    },
  }, response);
  return response;
}

(async () => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";

  const requests = [];
  global.fetch = async (url, options) => {
    const value = String(url);
    requests.push({ url: value, options });
    if (value.endsWith("/rpc/validate_student_device")) return jsonResponse({ valid: true });
    if (value.includes("/students?")) {
      const studentId = value.includes("id=eq.21001") ? "21001" : "21002";
      return jsonResponse([{ id: studentId, name: "테스트", student_category: "lecture", is_active: true }]);
    }
    if (value.includes("last_heartbeat_at=lt.")) return jsonResponse([]);
    if (value.includes("study_cafe_sessions?") && value.includes("status=in.(running,paused)")) {
      return jsonResponse([]);
    }
    if (value.includes("study_cafe_presence?student_id=eq.") && options.method === "GET") {
      const studentId = value.includes("student_id=eq.21001") ? "21001" : "21002";
      return jsonResponse([{
        student_id: studentId,
        seat_number: studentId === "21001" ? 3 : 4,
        status: "paused",
        updated_at: "2026-09-09T06:15:00.000Z",
      }]);
    }
    if (value.includes("study_cafe_presence?student_id=eq.21001") && options.method === "DELETE") {
      assert.match(value, /updated_at=eq\./);
      assert.equal(options.headers.Prefer, "return=representation");
      return jsonResponse([{ student_id: "21001", seat_number: 3 }]);
    }
    if (value.includes("study_cafe_presence?student_id=eq.21002") && options.method === "DELETE") {
      assert.match(value, /updated_at=eq\./);
      assert.equal(options.headers.Prefer, "return=representation");
      return jsonResponse([{ student_id: "21002", seat_number: 4 }]);
    }
    if (value.includes("/realtime/v1/api/broadcast/")) return jsonResponse({});
    throw new Error(`unexpected request: ${options.method} ${value}`);
  };

  const targetResponse = await invoke("21001");
  assert.equal(targetResponse.statusCode, 200);
  assert.equal(targetResponse.payload.ok, true);
  assert.deepEqual(pushCalls, [{
    studentId: "21001",
    seatNumber: 3,
    releasedAt: "2026-09-09T06:15:00.000Z",
  }]);

  const nonTargetRequestStart = requests.length;
  const otherResponse = await invoke("21002");
  assert.equal(otherResponse.statusCode, 200);
  assert.equal(otherResponse.payload.ok, true);
  assert.deepEqual(pushCalls[1], {
    studentId: "21002",
    seatNumber: 4,
    releasedAt: "2026-09-09T06:15:00.000Z",
  });
  const otherRequests = requests.slice(nonTargetRequestStart);
  assert.equal(
    otherRequests.some((request) => request.url.includes("study_cafe_presence?student_id=eq.21002") && request.options.method === "GET"),
    true
  );

  console.log("study cafe idle release flow tests passed");
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
