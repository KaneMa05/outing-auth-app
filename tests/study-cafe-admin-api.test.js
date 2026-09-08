const assert = require("node:assert/strict");

const handler = require("../api/study-cafe-admin");
const { COOKIE_NAME, createSessionToken } = require("../api/teacher-auth-utils");
const {
  buildStudyHistoryDetail,
  buildStudyHistorySummary,
  getKstDayBounds,
  getKstDateKey,
  mergeStudyHistoryPhones,
  normalizeStudyHistoryRange,
} = handler._private;

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
  assert.deepEqual(normalizeStudyHistoryRange("2026-07-29", "2026-07-30"), {
    startDate: "2026-07-29",
    endDate: "2026-07-30",
    start: "2026-07-28T19:00:00.000Z",
    end: "2026-07-30T19:00:00.000Z",
  });
  assert.equal(normalizeStudyHistoryRange("2026-07-31", "2026-07-30"), null);
  assert.equal(normalizeStudyHistoryRange("2026-02-30", "2026-03-01"), null);
  assert.equal(normalizeStudyHistoryRange("2025-01-01", "2026-01-02"), null);

  const reportNow = new Date("2026-07-29T10:00:00.000Z");
  const historyStudents = [
    { id: "20001", name: "김학생", phone: "01012345678", account_type: "student", is_active: true },
    { id: "20002", name: "이학생", phone: "010-9999-8888", account_type: "student", is_active: false },
    { id: "20003", name: "박학생", phone: "", account_type: "student", is_active: false },
    { id: "10001", name: "김선생", account_type: "teacher", is_active: true },
    { id: "29999701", name: "운영계정", account_type: "student", class_name: "스터디카페 운영계정", is_active: true },
  ];
  const historySessions = [
    {
      id: "session-1",
      student_id: "20001",
      subject_name: "형사법",
      status: "completed",
      elapsed_seconds: 3600,
      started_at: "2026-07-28T20:00:00.000Z",
      active_started_at: null,
      ended_at: "2026-07-28T21:15:00.000Z",
    },
    {
      id: "session-2",
      student_id: "20002",
      subject_name: "해양경찰학",
      status: "completed",
      elapsed_seconds: 1800,
      started_at: "2026-07-29T19:30:00.000Z",
      active_started_at: null,
      ended_at: "2026-07-29T20:00:00.000Z",
    },
  ];
  const historySummary = buildStudyHistorySummary(historyStudents, historySessions, reportNow);
  assert.equal(historySummary.length, 2);
  assert.equal(historySummary[0].studentId, "20001");
  assert.equal(historySummary[0].phone, "01012345678");
  assert.equal(historySummary[0].totalSeconds, 3600);
  assert.equal("days" in historySummary[0], false);
  assert.equal(historySummary[1].studentId, "20002");
  assert.ok(!historySummary.some((student) => student.studentId === "10001"));
  assert.ok(!historySummary.some((student) => student.studentId === "29999701"));

  const historyDetail = buildStudyHistoryDetail(historyStudents[0], historySessions.slice(0, 1), reportNow);
  assert.equal(historyDetail.studentId, "20001");
  assert.equal(historyDetail.days[0].date, "2026-07-29");
  assert.equal(historyDetail.days[0].sessions[0].endedAt, "2026-07-28T21:15:00.000Z");
  assert.equal(historyDetail.days[0].sessions[0].endedStudyDate, "2026-07-29");
  const studentsWithApplicationPhones = mergeStudyHistoryPhones(
    [{ id: "20001", phone: "" }, { id: "20002", phone: "01011112222" }],
    [{ approved_student_id: "20001", phone: "010-3333-4444" }, { approved_student_id: "20002", phone: "010-9999-0000" }]
  );
  assert.equal(studentsWithApplicationPhones[0].phone, "010-3333-4444");
  assert.equal(studentsWithApplicationPhones[1].phone, "01011112222");

  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
  process.env.TEACHER_SESSION_SECRET = "study-cafe-admin-test-secret";

  const readToken = createSessionToken(process.env.TEACHER_SESSION_SECRET, {
    username: "viewer",
    role: "admin",
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

  const invalidHistory = await invoke({ action: "history", startDate: "2026-08-01", endDate: "2026-07-01" }, readToken);
  assert.equal(invalidHistory.statusCode, 400);
  assert.equal(invalidHistory.payload.error, "invalid_date_range");

  const activeStartedAt = new Date(Date.now() - 5000).toISOString();
  global.fetch = async (url) => {
    if (url.includes("/students?")) {
      if (url.includes("select=id,name,phone")) assert.match(url, /account_type=eq\.student/);
      return jsonResponse([{ id: "20001", name: "테스트학생", phone: "", track: "경찰직 - 공채(순경)" }]);
    }
    if (url.includes("/lecture_applications?")) {
      assert.match(url, /status=eq\.approved/);
      return jsonResponse([{ approved_student_id: "20001", phone: "01012345678" }]);
    }
    if (url.includes("/study_cafe_profiles?")) {
      return jsonResponse([{ student_id: "20001", avatar_tone: "blue" }]);
    }
    if (url.includes("/study_cafe_presence?")) {
      return jsonResponse([
        {
          student_id: "20001",
          seat_number: 2,
          status: "studying",
          current_subject: "형사법",
          avatar_tone: "blue",
          last_heartbeat_at: new Date().toISOString(),
        },
        {
          student_id: "20002",
          seat_number: 3,
          status: "seated",
          current_subject: null,
          avatar_tone: "mint",
          last_heartbeat_at: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
        },
      ]);
    }
    if (url.includes("/study_cafe_rooms?")) {
      return jsonResponse([{
        id: "room-1",
        name: "형사법 집중방",
        description: "매일 순공",
        capacity: 4,
        theme: "forest",
        access_type: "public",
        host_student_id: "20001",
      }]);
    }
    if (url.includes("/study_cafe_room_members?")) {
      return jsonResponse([]);
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
  assert.equal(dashboard.payload.summary.seatedCount, 2);
  assert.equal(dashboard.payload.summary.connectedSeatedCount, 1);
  assert.equal(dashboard.payload.summary.disconnectedSeatedCount, 1);
  assert.equal(dashboard.payload.summary.studyingCount, 1);
  assert.equal(dashboard.payload.members[0].studentId, "20001");
  assert.equal(dashboard.payload.members[0].seatNumber, 2);
  assert.equal(dashboard.payload.members[0].locationType, "public");
  assert.equal(dashboard.payload.privateRooms[0].name, "형사법 집중방");
  assert.equal(dashboard.payload.privateRooms[0].capacity, 4);
  assert.equal(dashboard.payload.members[0].currentSubject, "형사법");
  assert.ok(dashboard.payload.members[0].todaySeconds >= 14);

  const historyDate = getKstDayBounds(new Date()).date;
  const history = await invoke({ action: "history", startDate: historyDate, endDate: historyDate }, readToken);
  assert.equal(history.statusCode, 200);
  assert.equal(history.payload.startDate, historyDate);
  assert.equal(history.payload.students[0].studentId, "20001");
  assert.equal(history.payload.students[0].phone, "01012345678");
  assert.equal("days" in history.payload.students[0], false);
  assert.ok(history.payload.students[0].totalSeconds >= 14);

  const historyDetailResponse = await invoke({
    action: "history_detail",
    studentId: "20001",
    startDate: historyDate,
    endDate: historyDate,
  }, readToken);
  assert.equal(historyDetailResponse.statusCode, 200);
  assert.equal(historyDetailResponse.payload.student.studentId, "20001");
  assert.equal(historyDetailResponse.payload.student.days[0].date, historyDate);

  global.fetch = async () => {
    throw new Error("write fetch should not run without write permission");
  };
  const forbiddenWrite = await invoke({ action: "stop_session", studentId: "20001" }, readToken);
  assert.equal(forbiddenWrite.statusCode, 403);

  const requests = [];
  global.fetch = async (url, options) => {
    requests.push({ url, options });
    if (url.includes("/realtime/v1/api/broadcast/")) return jsonResponse({});
    if (options.method === "GET" && url.includes("study_cafe_presence?student_id=eq.20001")) {
      return jsonResponse([{ student_id: "20001", seat_number: 2 }]);
    }
    if (options.method === "GET" && url.includes("study_cafe_room_members?student_id=eq.20001")) {
      return jsonResponse([]);
    }
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

  const privateStopRequests = [];
  global.fetch = async (url, options) => {
    privateStopRequests.push({ url, options });
    if (url.includes("/realtime/v1/api/broadcast/")) return jsonResponse({});
    if (options.method === "GET" && url.includes("study_cafe_presence?student_id=eq.20001")) {
      return jsonResponse([]);
    }
    if (options.method === "GET" && url.includes("study_cafe_room_members?student_id=eq.20001")) {
      return jsonResponse([{ room_id: "room-1", student_id: "20001", seat_number: 3 }]);
    }
    if (options.method === "GET" && url.includes("study_cafe_sessions?student_id=eq.20001")) {
      return jsonResponse([{
        id: "session-private",
        student_id: "20001",
        status: "running",
        elapsed_seconds: 5,
        active_started_at: activeStartedAt,
      }]);
    }
    if (options.method === "PATCH" && url.includes("study_cafe_sessions?id=eq.session-private")) {
      return jsonResponse([{ id: "session-private", status: "completed" }]);
    }
    throw new Error(`unexpected private stop request: ${options.method} ${url}`);
  };
  const privateStopped = await invoke({ action: "stop_session", studentId: "20001" }, adminToken);
  assert.equal(privateStopped.statusCode, 200);
  assert.ok(!privateStopRequests.some((request) => request.options.method === "PATCH" && request.url.includes("study_cafe_presence")));

  global.fetch = async (url, options) => {
    if (options.method === "GET" && url.includes("study_cafe_presence?")) return jsonResponse([{ student_id: "20001", seat_number: 2 }]);
    if (options.method === "GET" && url.includes("study_cafe_room_members?")) return jsonResponse([]);
    if (options.method === "GET" && url.includes("study_cafe_sessions?")) return jsonResponse([]);
    throw new Error(`missing session should not mutate data: ${options.method} ${url}`);
  };
  const missingSession = await invoke({ action: "stop_session", studentId: "20001" }, adminToken);
  assert.equal(missingSession.statusCode, 409);
  assert.equal(missingSession.payload.error, "active_session_not_found");

  const releaseRequests = [];
  global.fetch = async (url, options) => {
    releaseRequests.push({ url, options });
    if (url.includes("/realtime/v1/api/broadcast/")) return jsonResponse({});
    if (options.method === "GET" && url.includes("study_cafe_presence?student_id=eq.20001")) {
      return jsonResponse([{ student_id: "20001", seat_number: 2 }]);
    }
    if (options.method === "GET" && url.includes("study_cafe_room_members?student_id=eq.20001")) {
      return jsonResponse([]);
    }
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
  assert.ok(!releaseRequests.some((request) => request.options.method === "PATCH" && request.url.includes("study_cafe_room_members")));
  assert.ok(releaseRequests.some((request) => request.url.includes("events/state-changed")));
  assert.ok(!releaseRequests.some((request) => request.url.includes("events/room-changed")));

  const privateReleaseRequests = [];
  global.fetch = async (url, options) => {
    privateReleaseRequests.push({ url, options });
    if (url.includes("/realtime/v1/api/broadcast/")) return jsonResponse({});
    if (options.method === "GET" && url.includes("study_cafe_presence?student_id=eq.20001")) {
      return jsonResponse([]);
    }
    if (options.method === "GET" && url.includes("study_cafe_room_members?student_id=eq.20001")) {
      return jsonResponse([{ room_id: "room-1", student_id: "20001", seat_number: 3 }]);
    }
    if (options.method === "GET" && url.includes("study_cafe_sessions?student_id=eq.20001")) {
      return jsonResponse([]);
    }
    if (options.method === "PATCH" && url.includes("study_cafe_room_members?student_id=eq.20001")) {
      return jsonResponse(null, 204);
    }
    throw new Error(`unexpected private release request: ${options.method} ${url}`);
  };
  const privateReleased = await invoke({ action: "release_seat", studentId: "20001" }, adminToken);
  assert.equal(privateReleased.statusCode, 200);
  assert.ok(!privateReleaseRequests.some((request) => request.options.method === "DELETE"));
  assert.ok(privateReleaseRequests.some((request) => request.url.includes("events/state-changed")));
  assert.ok(privateReleaseRequests.some((request) => request.url.includes("events/room-changed")));
  const roomSeatPatch = privateReleaseRequests.find((request) => request.options.method === "PATCH");
  assert.equal(JSON.parse(roomSeatPatch.options.body).seat_number, null);

  global.fetch = async (url, options) => {
    if (options.method === "GET" && url.includes("study_cafe_presence?")) return jsonResponse([]);
    if (options.method === "GET" && url.includes("study_cafe_room_members?")) return jsonResponse([]);
    throw new Error(`stale action should not mutate data: ${options.method} ${url}`);
  };
  const missingSeat = await invoke({ action: "release_seat", studentId: "20001" }, adminToken);
  assert.equal(missingSeat.statusCode, 409);
  assert.equal(missingSeat.payload.error, "seat_not_found");

  global.fetch = async () => {
    throw new Error("invalid student must be rejected before store access");
  };
  const invalidStudent = await invoke({ action: "release_seat", studentId: "invalid-id" }, adminToken);
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
