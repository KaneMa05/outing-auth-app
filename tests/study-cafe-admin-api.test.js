const assert = require("node:assert/strict");

const handler = require("../api/study-cafe-admin");
const { COOKIE_NAME, createSessionToken } = require("../api/teacher-auth-utils");
const { getKstDayBounds, getKstDateKey } = handler._private;

function createResponse() {
  return {
    headers: {},
    statusCode: 200,
    payload: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
}

async function invoke(body, token = "", method = "POST") {
  const req = {
    method,
    body,
    headers: token ? { cookie: `${COOKIE_NAME}=${token}` } : {},
  };
  const res = createResponse();
  await handler(req, res);
  return res;
}

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  };
}

const originalFetch = global.fetch;
const originalEnv = {
  url: process.env.SUPABASE_URL,
  key: process.env.SUPABASE_SERVICE_ROLE_KEY,
  secret: process.env.TEACHER_SESSION_SECRET,
};

(async () => {
  assert.deepEqual(getKstDayBounds(new Date("2026-07-29T18:59:59.000Z")), {
    date: "2026-07-29",
    start: "2026-07-28T19:00:00.000Z",
    end: "2026-07-29T19:00:00.000Z",
  });
  assert.equal(getKstDateKey("2026-07-29T15:00:00.000Z"), "2026-07-29");
  assert.equal(getKstDateKey("2026-07-29T19:00:00.000Z"), "2026-07-30");

  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
  process.env.TEACHER_SESSION_SECRET = "study-cafe-admin-test-secret";

  const readToken = createSessionToken(process.env.TEACHER_SESSION_SECRET, {
    username: "viewer",
    role: "student_manager",
    permissions: ["study_cafe.read"],
  });
  const adminToken = createSessionToken(process.env.TEACHER_SESSION_SECRET, {
    username: "admin",
    role: "admin",
    permissions: ["*"],
  });

  global.fetch = async () => {
    throw new Error("fetch should not run without authentication");
  };
  const unauthorized = await invoke({ action: "dashboard" });
  assert.equal(unauthorized.statusCode, 401);

  const wrongMethod = await invoke({}, readToken, "GET");
  assert.equal(wrongMethod.statusCode, 405);
  assert.equal(wrongMethod.headers.Allow, "POST");

  const activeStartedAt = new Date(Date.now() - 5000).toISOString();
  global.fetch = async (url) => {
    if (url.includes("/students?")) {
      return jsonResponse([{ id: "20001", name: "테스트학생", track: "경찰직 - 공채(순경)" }]);
    }
    if (url.includes("/study_cafe_profiles?")) {
      return jsonResponse([{ student_id: "20001", avatar_tone: "blue" }]);
    }
    if (url.includes("/study_cafe_presence?")) {
      return jsonResponse([{
        student_id: "20001",
        seat_number: 2,
        status: "studying",
        current_subject: "형사법",
        avatar_tone: "blue",
        last_heartbeat_at: new Date().toISOString(),
      }]);
    }
    if (url.includes("status=in.(running,paused)")) {
      return jsonResponse([{
        id: "session-1",
        student_id: "20001",
        subject_name: "형사법",
        status: "running",
        elapsed_seconds: 10,
        started_at: activeStartedAt,
        active_started_at: activeStartedAt,
      }]);
    }
    if (url.includes("started_at=gte.")) {
      return jsonResponse([{
        id: "session-1",
        student_id: "20001",
        subject_name: "형사법",
        status: "running",
        elapsed_seconds: 10,
        started_at: activeStartedAt,
        active_started_at: activeStartedAt,
      }]);
    }
    throw new Error(`unexpected dashboard request: ${url}`);
  };

  const dashboard = await invoke({ action: "dashboard" }, readToken);
  assert.equal(dashboard.statusCode, 200);
  assert.equal(dashboard.payload.summary.onlineStudentCount, 1);
  assert.equal(dashboard.payload.summary.seatedCount, 1);
  assert.equal(dashboard.payload.summary.studyingCount, 1);
  assert.equal(dashboard.payload.members[0].studentId, "20001");
  assert.equal(dashboard.payload.members[0].seatNumber, 2);
  assert.equal(dashboard.payload.members[0].currentSubject, "형사법");
  assert.ok(dashboard.payload.members[0].todaySeconds >= 14);

  global.fetch = async () => {
    throw new Error("write fetch should not run without write permission");
  };
  const forbiddenWrite = await invoke({ action: "stop_session", studentId: "20001" }, readToken);
  assert.equal(forbiddenWrite.statusCode, 403);

  const requests = [];
  global.fetch = async (url, options) => {
    requests.push({ url, options });
    if (options.method === "GET" && url.includes("study_cafe_sessions?student_id=eq.20001")) {
      return jsonResponse([{
        id: "session-1",
        student_id: "20001",
        subject_name: "형사법",
        status: "running",
        elapsed_seconds: 10,
        active_started_at: activeStartedAt,
      }]);
    }
    if (options.method === "PATCH" && url.includes("study_cafe_sessions?id=eq.session-1")) {
      return jsonResponse([{ id: "session-1", status: "completed" }]);
    }
    if (options.method === "PATCH" && url.includes("study_cafe_presence?student_id=eq.20001")) {
      return jsonResponse(null, 204);
    }
    throw new Error(`unexpected stop request: ${options.method} ${url}`);
  };
  const stopped = await invoke({ action: "stop_session", studentId: "20001" }, adminToken);
  assert.equal(stopped.statusCode, 200);
  assert.equal(stopped.payload.stopped, true);
  const sessionPatch = requests.find((request) => request.url.includes("study_cafe_sessions?id=eq.session-1"));
  const sessionPayload = JSON.parse(sessionPatch.options.body);
  assert.equal(sessionPayload.status, "completed");
  assert.equal(sessionPayload.active_started_at, null);
  assert.ok(sessionPayload.elapsed_seconds >= 14);

  const releaseRequests = [];
  global.fetch = async (url, options) => {
    releaseRequests.push({ url, options });
    if (options.method === "GET" && url.includes("study_cafe_sessions?student_id=eq.20001")) {
      return jsonResponse([]);
    }
    if (options.method === "DELETE" && url.includes("study_cafe_presence?student_id=eq.20001")) {
      return jsonResponse(null, 204);
    }
    throw new Error(`unexpected release request: ${options.method} ${url}`);
  };
  const released = await invoke({ action: "release_seat", studentId: "20001" }, adminToken);
  assert.equal(released.statusCode, 200);
  assert.equal(released.payload.released, true);
  assert.equal(released.payload.stopped, false);
  assert.ok(releaseRequests.some((request) => request.options.method === "DELETE"));

  global.fetch = async () => {
    throw new Error("invalid student must be rejected before store access");
  };
  const invalidStudent = await invoke({ action: "release_seat", studentId: "18001" }, adminToken);
  assert.equal(invalidStudent.statusCode, 400);

  console.log("study-cafe-admin-api tests passed");
})()
  .finally(() => {
    global.fetch = originalFetch;
    if (originalEnv.url === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalEnv.url;
    if (originalEnv.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalEnv.key;
    if (originalEnv.secret === undefined) delete process.env.TEACHER_SESSION_SECRET;
    else process.env.TEACHER_SESSION_SECRET = originalEnv.secret;
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
