const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");

const handler = require("../api/study-cafe");
const {
  getKstDayBounds,
  getKstDateKey,
  getSessionElapsedSeconds,
  hashDeviceToken,
  maskName,
  normalizeNickname,
  normalizeSeatNumber,
  normalizeSubjects,
  normalizeStatsRange,
  rolloverActiveSessionIfNeeded,
  summarizeTrack,
} = handler._private;

const migrationSql = fs.readFileSync("supabase/add-study-cafe.sql", "utf8");
const schemaSql = fs.readFileSync("supabase/schema.sql", "utf8");
const rollbackSql = fs.readFileSync("supabase/remove-study-cafe.sql", "utf8");
const apiSource = fs.readFileSync("api/study-cafe.js", "utf8");
for (const sql of [migrationSql, schemaSql]) {
  assert.match(sql, /create table if not exists public\.study_cafe_subjects/);
  assert.match(sql, /create table if not exists public\.study_cafe_sessions/);
  assert.match(sql, /create unique index if not exists study_cafe_one_active_session_per_student/);
  assert.match(sql, /create table if not exists public\.study_cafe_presence/);
  assert.match(sql, /add column if not exists display_name text/);
  assert.match(sql, /create or replace function public\.replace_study_cafe_subjects/);
  assert.match(sql, /revoke all on public\.study_cafe_sessions from anon/);
}
assert.match(migrationSql, /alter publication supabase_realtime add table public\.study_cafe_presence/);
assert.match(rollbackSql, /alter publication supabase_realtime drop table public\.study_cafe_presence/);
assert.match(rollbackSql, /drop table if exists public\.study_cafe_presence/);
assert.match(rollbackSql, /drop table if exists public\.study_cafe_sessions/);
assert.doesNotMatch(rollbackSql, /drop table if exists public\.(students|outings|attendance)/);
assert.match(apiSource, /select=student_id,last_heartbeat_at/);
assert.match(apiSource, /lastHeartbeatAt\.getTime\(\) \+ PRESENCE_HEARTBEAT_GRACE_MS/);
assert.match(apiSource, /await rolloverActiveSessionIfNeeded\(row\.student_id, staleEndedAt\)/);
assert.match(apiSource, /await completeActiveSession\(row\.student_id, staleEndedAt\)/);
assert.match(apiSource, /rpc\/replace_study_cafe_subjects/);
assert.match(apiSource, /display_name: displayName/);
assert.match(apiSource, /displayName: normalizeStoredNickname\(row\.display_name\)/);

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

async function invoke(body, method = "POST") {
  const req = { method, body, headers: {} };
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
const originalUrl = process.env.SUPABASE_URL;
const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

(async () => {
  assert.equal(
    hashDeviceToken("device-secret"),
    crypto.createHash("sha256").update("device-secret").digest("hex")
  );
  assert.deepEqual(normalizeSubjects(["형사법", "영어"]), ["형사법", "영어"]);
  assert.throws(() => normalizeSubjects(["형사법", "형사법"]), /invalid_subjects/);
  assert.throws(() => normalizeSubjects([]), /invalid_subjects/);
  assert.equal(normalizeNickname(" 해경 꿈나무 "), "해경 꿈나무");
  assert.throws(() => normalizeNickname("a"), /invalid_nickname/);
  assert.throws(() => normalizeNickname("닉네임!"), /invalid_nickname/);
  assert.equal(normalizeSeatNumber(1), 1);
  assert.equal(normalizeSeatNumber(50), 50);
  assert.throws(() => normalizeSeatNumber(51), /invalid_seat/);
  assert.equal(maskName("홍길동"), "홍○○");
  assert.equal(summarizeTrack("경찰직 - 해상교통관제(VTS)(순경)"), "VTS");
  assert.deepEqual(getKstDayBounds(new Date("2026-07-29T14:59:59.000Z")), {
    start: "2026-07-28T19:00:00.000Z",
    end: "2026-07-29T19:00:00.000Z",
  });
  assert.deepEqual(getKstDayBounds(new Date("2026-07-29T18:59:59.000Z")), {
    start: "2026-07-28T19:00:00.000Z",
    end: "2026-07-29T19:00:00.000Z",
  });
  assert.deepEqual(getKstDayBounds(new Date("2026-07-29T19:00:00.000Z")), {
    start: "2026-07-29T19:00:00.000Z",
    end: "2026-07-30T19:00:00.000Z",
  });
  assert.equal(getKstDateKey("2026-07-29T15:00:00.000Z"), "2026-07-29");
  assert.equal(getKstDateKey("2026-07-29T18:59:59.000Z"), "2026-07-29");
  assert.equal(getKstDateKey("2026-07-29T19:00:00.000Z"), "2026-07-30");
  assert.deepEqual(normalizeStatsRange("2026-07-01", "2026-07-03"), {
    start: "2026-06-30T19:00:00.000Z",
    end: "2026-07-03T19:00:00.000Z",
    dateKeys: ["2026-07-01", "2026-07-02", "2026-07-03"],
  });
  assert.throws(() => normalizeStatsRange("2026-07-01", "2026-09-30"), /invalid_stats_range/);
  assert.equal(
    getSessionElapsedSeconds(
      { status: "running", elapsed_seconds: 10, active_started_at: "2026-07-29T00:00:00.000Z" },
      new Date("2026-07-29T00:00:05.900Z")
    ),
    15
  );

  global.fetch = async () => {
    throw new Error("fetch should not be called");
  };
  const wrongMethod = await invoke({}, "GET");
  assert.equal(wrongMethod.statusCode, 405);
  assert.equal(wrongMethod.headers.Allow, "POST");

  const missing = await invoke({ action: "load", studentId: "20001" });
  assert.equal(missing.statusCode, 400);
  assert.equal(missing.payload.error, "missing_required_fields");

  const offline = await invoke({
    action: "load",
    studentId: "18001",
    deviceToken: "device-secret",
  });
  assert.equal(offline.statusCode, 403);
  assert.equal(offline.payload.error, "online_student_only");

  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
  const rolloverRequests = [];
  global.fetch = async (url, options) => {
    rolloverRequests.push({ url, options });
    if (options.method === "GET") {
      return jsonResponse([{
        id: "session-before-4am",
        student_id: "20001",
        subject_name: "영어",
        status: "running",
        elapsed_seconds: 0,
        started_at: "2026-07-29T18:59:50.000Z",
        active_started_at: "2026-07-29T18:59:50.000Z",
      }]);
    }
    if (options.method === "PATCH") return jsonResponse(null, 204);
    if (options.method === "POST") return jsonResponse([{ id: "session-after-4am" }]);
    throw new Error(`unexpected rollover request: ${options.method} ${url}`);
  };
  await rolloverActiveSessionIfNeeded("20001", new Date("2026-07-29T19:00:10.000Z"));
  const rolloverPatch = JSON.parse(
    rolloverRequests.find((request) => request.options.method === "PATCH").options.body
  );
  const rolloverPost = JSON.parse(
    rolloverRequests.find((request) => request.options.method === "POST").options.body
  );
  assert.equal(rolloverPatch.elapsed_seconds, 10);
  assert.equal(rolloverPatch.ended_at, "2026-07-29T19:00:00.000Z");
  assert.equal(rolloverPost.started_at, "2026-07-29T19:00:00.000Z");
  assert.equal(rolloverPost.active_started_at, "2026-07-29T19:00:00.000Z");
  assert.equal(rolloverPost.status, "running");

  const requests = [];
  global.fetch = async (url, options) => {
    requests.push({ url, options });
    if (url.endsWith("/rpc/validate_student_device")) {
      const body = JSON.parse(options.body);
      assert.equal(body.p_device_token_hash, hashDeviceToken("device-secret"));
      assert.equal(options.body.includes("device-secret"), false);
      return jsonResponse({ valid: true, device_id: "device-1", active_count: 1 });
    }
    if (url.includes("/students?")) {
      return jsonResponse([{ id: "20001", name: "홍길동", track: "경찰직 - 공채(순경)", is_active: true }]);
    }
    if (url.includes("last_heartbeat_at=lt.") && options.method === "GET") return jsonResponse([]);
    if (url.includes("last_heartbeat_at=lt.") && options.method === "DELETE") return jsonResponse(null, 204);
    if (url.includes("study_cafe_sessions?student_id=eq.20001") && url.includes("status=in.(running,paused)")) {
      return jsonResponse([]);
    }
    if (url.includes("study_cafe_presence?student_id=eq.20001") && options.method === "GET") {
      return jsonResponse([{
        student_id: "20001",
        seat_number: 2,
        status: "seated",
        current_subject: null,
        avatar_tone: "navy",
      }]);
    }
    if (url.includes("study_cafe_presence?student_id=eq.20001") && options.method === "PATCH") {
      return jsonResponse(null, 204);
    }
    throw new Error(`unexpected request: ${options.method} ${url}`);
  };

  const heartbeat = await invoke({
    action: "heartbeat",
    studentId: "20001",
    deviceToken: "device-secret",
    client: { displayMode: "browser", userAgent: "test-agent" },
  });
  assert.equal(heartbeat.statusCode, 200);
  assert.equal(heartbeat.payload.ok, true);
  assert.match(heartbeat.payload.serverNow, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(requests.length, 7);

  global.fetch = async (url, options) => {
    if (url.endsWith("/rpc/validate_student_device")) {
      return jsonResponse({ valid: true, device_id: "device-1", active_count: 1 });
    }
    if (url.includes("/students?")) {
      return jsonResponse([{ id: "20001", name: "통계학생", track: "공채", is_active: true }]);
    }
    if (url.includes("last_heartbeat_at=lt.") && options.method === "GET") return jsonResponse([]);
    if (url.includes("last_heartbeat_at=lt.") && options.method === "DELETE") return jsonResponse(null, 204);
    if (url.includes("study_cafe_sessions?student_id=eq.20001") && url.includes("status=in.(running,paused)")) {
      return jsonResponse([]);
    }
    if (url.includes("study_cafe_sessions?student_id=eq.20001") && url.includes("started_at=gte.")) {
      return jsonResponse([
        {
          id: "session-1",
          subject_name: "형사법",
          status: "completed",
          elapsed_seconds: 3600,
          started_at: "2026-07-01T00:00:00.000Z",
          active_started_at: null,
          ended_at: "2026-07-01T01:00:00.000Z",
        },
        {
          id: "session-2",
          subject_name: "영어",
          status: "completed",
          elapsed_seconds: 1800,
          started_at: "2026-07-02T02:00:00.000Z",
          active_started_at: null,
          ended_at: "2026-07-02T02:30:00.000Z",
        },
      ]);
    }
    throw new Error(`unexpected stats request: ${options.method} ${url}`);
  };
  const stats = await invoke({
    action: "stats",
    studentId: "20001",
    deviceToken: "device-secret",
    dateFrom: "2026-07-01",
    dateTo: "2026-07-03",
  });
  assert.equal(stats.statusCode, 200);
  assert.equal(stats.payload.summary.totalSeconds, 5400);
  assert.equal(stats.payload.summary.studiedDays, 2);
  assert.equal(stats.payload.summary.dailyAverageSeconds, 2700);
  assert.equal(stats.payload.subjectTotals["형사법"], 3600);
  assert.equal(stats.payload.days.length, 3);

  global.fetch = async (url) => {
    if (url.endsWith("/rpc/validate_student_device")) return jsonResponse({ valid: false });
    throw new Error("student lookup must not run after invalid device validation");
  };
  const invalidDevice = await invoke({
    action: "heartbeat",
    studentId: "20001",
    deviceToken: "revoked-device",
  });
  assert.equal(invalidDevice.statusCode, 403);
  assert.equal(invalidDevice.payload.error, "device_not_active");

  console.log("study-cafe-api tests passed");
})()
  .finally(() => {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
