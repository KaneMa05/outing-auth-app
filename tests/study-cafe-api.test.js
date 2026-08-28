const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");

const handler = require("../api/study-cafe");
const {
  getCurrentRankingRange,
  getKstDayBounds,
  getKstDateKey,
  getSessionElapsedSeconds,
  hashDeviceToken,
  maskName,
  normalizeNickname,
  normalizeStatusMessage,
  normalizeRankingPeriod,
  normalizeSeatNumber,
  normalizeSubjects,
  normalizeStatsRange,
  normalizeTodoContent,
  normalizeTodoId,
  normalizeTodoMonthKey,
  normalizeTodoStudyDate,
  getTodoMonthBounds,
  rolloverActiveSessionIfNeeded,
  summarizeTodoMonth,
  summarizeTrack,
} = handler._private;

assert.equal(normalizeRankingPeriod("weekly"), "weekly");
assert.deepEqual(getCurrentRankingRange("weekly", new Date("2026-07-31T07:00:00.000Z")).dateKeys, [
  "2026-07-27",
  "2026-07-28",
  "2026-07-29",
  "2026-07-30",
  "2026-07-31",
]);
assert.equal(
  getCurrentRankingRange("monthly", new Date("2026-07-31T07:00:00.000Z")).dateKeys[0],
  "2026-07-01"
);

const migrationSql = fs.readFileSync("supabase/add-study-cafe.sql", "utf8");
const schemaSql = fs.readFileSync("supabase/schema.sql", "utf8");
const rollbackSql = fs.readFileSync("supabase/remove-study-cafe.sql", "utf8");
const seatExpansionSql = fs.readFileSync("supabase/expand-study-cafe-to-192-seats.sql", "utf8");
const productionMigrationSql = fs.readFileSync("supabase/prepare-study-cafe-production.sql", "utf8");
const apiSource = fs.readFileSync("api/study-cafe.js", "utf8");
assert.match(apiSource, /"ranking"/);
assert.match(apiSource, /"keep_seat"/);
assert.match(
  apiSource,
  /realtime\/v1\/api\/broadcast\/study-cafe-room-public\/events\/state-changed/
);
assert.match(apiSource, /await broadcastStudyCafeStateChange\("seat"/);
assert.match(apiSource, /await broadcastStudyCafeStateChange\("timer"\)/);
assert.match(apiSource, /await broadcastStudyCafeStateChange\("profile"\)/);
assert.match(apiSource, /async function loadStudyRanking\(studentId, period, now\)/);
assert.match(apiSource, /function getCurrentRankingRange\(period, now = new Date\(\)\)/);
assert.match(apiSource, /currentSubject: row\.current_subject \|\| ""/);
assert.match(
  apiSource,
  /study_cafe_presence\?select=student_id,seat_number,status,current_subject,avatar_tone,display_name,last_heartbeat_at&order=seat_number\.asc/
);
for (const sql of [migrationSql, schemaSql]) {
  assert.match(sql, /create table if not exists public\.study_cafe_subjects/);
  assert.match(sql, /create table if not exists public\.study_cafe_todos/);
  assert.match(sql, /create table if not exists public\.study_cafe_sessions/);
  assert.match(sql, /create unique index if not exists study_cafe_one_active_session_per_student/);
  assert.match(sql, /create table if not exists public\.study_cafe_presence/);
  assert.match(sql, /seat_number integer not null check \(seat_number between 1 and 192\)/);
  assert.match(sql, /check \(seat_number between 1 and 192\)/);
  assert.doesNotMatch(sql, /seat_number between 1 and 50/);
  assert.match(sql, /add column if not exists display_name text/);
  assert.match(sql, /add column if not exists status_message text/);
  assert.match(sql, /create or replace function public\.replace_study_cafe_subjects/);
  assert.match(sql, /revoke all on public\.study_cafe_sessions from anon/);
  assert.match(sql, /revoke all on public\.study_cafe_todos from anon/);
}
assert.match(seatExpansionSql, /^begin;/);
assert.match(seatExpansionSql, /drop constraint if exists study_cafe_presence_seat_number_check/);
assert.match(seatExpansionSql, /check \(seat_number between 1 and 192\)\s+not valid/);
assert.match(seatExpansionSql, /validate constraint study_cafe_presence_seat_number_check/);
assert.match(seatExpansionSql, /commit;/);
assert.match(productionMigrationSql, /^begin;/);
assert.match(productionMigrationSql, /add column if not exists status_message text/);
assert.match(productionMigrationSql, /create table if not exists public\.study_cafe_todos/);
assert.match(productionMigrationSql, /create index if not exists study_cafe_todos_student_date_idx/);
assert.match(productionMigrationSql, /alter table public\.study_cafe_todos enable row level security/);
assert.match(productionMigrationSql, /revoke all on public\.study_cafe_todos from anon/);
assert.match(productionMigrationSql, /drop constraint if exists study_cafe_presence_seat_number_check/);
assert.match(productionMigrationSql, /check \(seat_number between 1 and 192\)\s+not valid/);
assert.match(productionMigrationSql, /validate constraint study_cafe_presence_seat_number_check/);
assert.match(productionMigrationSql, /commit;/);
assert.match(migrationSql, /alter publication supabase_realtime add table public\.study_cafe_presence/);
assert.match(rollbackSql, /alter publication supabase_realtime drop table public\.study_cafe_presence/);
assert.match(rollbackSql, /drop table if exists public\.study_cafe_presence/);
assert.match(rollbackSql, /drop table if exists public\.study_cafe_sessions/);
assert.match(rollbackSql, /drop table if exists public\.study_cafe_todos/);
assert.doesNotMatch(rollbackSql, /drop table if exists public\.(students|outings|attendance)/);
assert.match(apiSource, /select=student_id,status,last_heartbeat_at,updated_at/);
assert.match(apiSource, /const IDLE_PRESENCE_STALE_MS = 15 \* 60 \* 1000 \+ 10 \* 1000/);
assert.match(apiSource, /row\.status === "seated" \|\| row\.status === "paused"/);
assert.match(apiSource, /study_cafe_presence\?student_id=eq\.\$\{encodeURIComponent\(row\.student_id\)\}/);
assert.match(apiSource, /lastHeartbeatAt\.getTime\(\) \+ PRESENCE_HEARTBEAT_GRACE_MS/);
assert.match(apiSource, /await rolloverActiveSessionIfNeeded\(row\.student_id, staleEndedAt\)/);
assert.match(apiSource, /await completeActiveSession\(row\.student_id, staleEndedAt\)/);
assert.match(apiSource, /rpc\/replace_study_cafe_subjects/);
assert.match(apiSource, /display_name: displayName/);
assert.match(apiSource, /body\.preserveStudy === true[\s\S]*?await getActiveSession\(studentId\)/);
assert.match(apiSource, /status: presenceStatus/);
assert.match(apiSource, /current_subject: activeSession\?\.subject_name \|\| null/);
assert.match(apiSource, /displayName: normalizeStoredNickname\(row\.display_name\)/);
assert.match(apiSource, /idleSince: row\.updated_at/);
assert.match(
  apiSource,
  /if \(action === "keep_seat"\)[\s\S]*?updated_at: now\.toISOString\(\)/
);
assert.match(
  apiSource,
  /await updatePresence\(studentId, \{\s*last_heartbeat_at: now\.toISOString\(\),\s*\}\)/
);
assert.match(apiSource, /"todo_create"/);
assert.match(apiSource, /"todos_load"/);
assert.match(apiSource, /"todo_month_summary"/);
assert.match(apiSource, /"todo_toggle"/);
assert.match(apiSource, /"todo_delete"/);
assert.match(apiSource, /"subject_goal_set"/);
assert.match(apiSource, /study_cafe_subject_goals/);
assert.equal(normalizeTodoContent("  영어 단어 30개  "), "영어 단어 30개");
assert.throws(() => normalizeTodoContent("   "), /invalid_todo_content/);
assert.equal(
  normalizeTodoId("123e4567-e89b-42d3-a456-426614174000"),
  "123e4567-e89b-42d3-a456-426614174000"
);
assert.throws(() => normalizeTodoId("not-a-uuid"), /invalid_todo_id/);
assert.equal(
  normalizeTodoStudyDate("2026-07-30", new Date("2026-07-30T03:00:00.000Z")),
  "2026-07-30"
);
assert.equal(
  normalizeTodoStudyDate("2026-08-12", new Date("2026-07-30T03:00:00.000Z")),
  "2026-08-12"
);
assert.throws(
  () => normalizeTodoStudyDate("2026-02-31", new Date("2026-07-30T03:00:00.000Z")),
  /invalid_todo_study_date/
);
assert.throws(
  () => normalizeTodoStudyDate("2019-12-31", new Date("2026-07-30T03:00:00.000Z")),
  /invalid_todo_study_date/
);
assert.equal(normalizeTodoMonthKey("2026-08"), "2026-08");
assert.throws(() => normalizeTodoMonthKey("2026-13"), /invalid_todo_month/);
assert.deepEqual(getTodoMonthBounds("2026-12"), {
  startDate: "2026-12-01",
  endDate: "2027-01-01",
});
assert.deepEqual(summarizeTodoMonth([
  { study_date: "2026-08-03", is_completed: false },
  { study_date: "2026-08-03", is_completed: true },
  { study_date: "2026-08-07", is_completed: true },
]), [
  { studyDate: "2026-08-03", total: 2, completed: 1 },
  { studyDate: "2026-08-07", total: 1, completed: 1 },
]);

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
  assert.equal(normalizeStatusMessage(" 오늘도  집중! "), "오늘도 집중!");
  assert.equal(normalizeStatusMessage("   "), "");
  assert.throws(() => normalizeStatusMessage("가".repeat(41)), /invalid_status_message/);
  assert.throws(() => normalizeNickname("닉네임!"), /invalid_nickname/);
  assert.equal(normalizeSeatNumber(1), 1);
  assert.equal(normalizeSeatNumber(96), 96);
  assert.throws(() => normalizeSeatNumber(97), /invalid_seat/);
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

  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
  global.fetch = async (url, options) => {
    if (url.includes("rpc/validate_student_device")) return jsonResponse({ valid: true });
    if (url.includes("students?")) {
      return jsonResponse([{ id: "18001", student_category: "offline", is_active: true }]);
    }
    throw new Error(`unexpected offline request: ${options.method} ${url}`);
  };
  const offline = await invoke({
    action: "load",
    studentId: "18001",
    deviceToken: "device-secret",
  });
  assert.equal(offline.statusCode, 403);
  assert.equal(offline.payload.error, "online_student_only");

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
  assert.equal(requests.length, 6);

  const resumeRequests = [];
  let activeSessionReads = 0;
  global.fetch = async (url, options) => {
    resumeRequests.push({ url, options });
    if (url.endsWith("/rpc/validate_student_device")) {
      return jsonResponse({ valid: true, device_id: "device-1", active_count: 1 });
    }
    if (url.includes("/students?")) {
      return jsonResponse([{ id: "20001", name: "재개학생", track: "공채", is_active: true }]);
    }
    if (url.includes("last_heartbeat_at=lt.") && options.method === "GET") return jsonResponse([]);
    if (url.includes("study_cafe_sessions?student_id=eq.20001") && url.includes("status=in.(running,paused)")) {
      activeSessionReads += 1;
      return jsonResponse([{
        id: "session-running",
        student_id: "20001",
        subject_name: "형사법",
        status: "running",
        elapsed_seconds: 30,
        started_at: new Date().toISOString(),
        active_started_at: new Date().toISOString(),
      }]);
    }
    if (url.includes("study_cafe_presence?student_id=eq.20001") && options.method === "PATCH") {
      const payload = JSON.parse(options.body);
      assert.equal(payload.status, "studying");
      assert.equal(payload.current_subject, "형사법");
      return jsonResponse(null, 204);
    }
    if (url.includes("/realtime/v1/api/broadcast/")) return jsonResponse({});
    throw new Error(`unexpected resume request: ${options.method} ${url}`);
  };
  const alreadyResumed = await invoke({
    action: "timer_resume",
    studentId: "20001",
    deviceToken: "device-secret",
  });
  assert.equal(alreadyResumed.statusCode, 200);
  assert.equal(alreadyResumed.payload.ok, true);
  assert.equal(alreadyResumed.payload.session.status, "running");
  assert.equal(activeSessionReads, 2);
  assert.equal(
    resumeRequests.some((request) =>
      request.options.method === "PATCH" && request.url.includes("study_cafe_sessions?id=")
    ),
    false
  );

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
