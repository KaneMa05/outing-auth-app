const crypto = require("node:crypto");
const path = require("node:path");
const { setTimeout: wait } = require("node:timers/promises");

const studyCafeHandler = require("../api/study-cafe");
const studentDevicesHandler = require("../api/student-devices");
const { loadConfig } = require("./study-cafe-preflight")._private;

const TEST_USERS = [
  {
    id: "29999001",
    name: "통합테스트학생A",
    nickname: "웃고있는기린",
    seatNumber: 49,
    subject: "영어",
    tone: "blue",
  },
  {
    id: "29999002",
    name: "통합테스트학생B",
    nickname: "집중하는여우",
    seatNumber: 50,
    subject: "국어",
    tone: "mint",
  },
].map((user) => ({
  ...user,
  passwordHash: crypto.createHash("sha256").update(`study-cafe-${user.id}-password`).digest("hex"),
  deviceToken: crypto.randomBytes(32).toString("hex"),
}));

async function main() {
  const config = loadConfig(path.join(__dirname, ".."));
  requireConfig(config);
  process.env.SUPABASE_URL = config.SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = config.SUPABASE_SERVICE_ROLE_KEY;

  let created = false;
  const report = [];
  try {
    const existing = await dbRequest(
      config,
      "GET",
      `students?id=in.(${TEST_USERS.map((user) => user.id).join(",")})&select=id,name`
    );
    assert(Array.isArray(existing) && existing.length === 0, "테스트 등록번호가 이미 사용 중입니다.");

    await dbRequest(
      config,
      "POST",
      "students",
      TEST_USERS.map((user) => ({
        id: user.id,
        name: user.name,
        class_name: "온라인 통합테스트",
        track: "통합테스트",
        password_hash: user.passwordHash,
        attendance_excluded: true,
        fitness_excluded: true,
        is_active: true,
      })),
      { Prefer: "return=representation" }
    );
    created = true;
    report.push("임시 온라인 학생 2명 생성");

    for (const user of TEST_USERS) {
      const registered = await invoke(studentDevicesHandler, {
        action: "register",
        studentId: user.id,
        passwordHash: user.passwordHash,
        deviceToken: user.deviceToken,
        deviceLabel: `Integration ${user.id}`,
        client: { displayMode: "browser", userAgent: "study-cafe-integration" },
      });
      assert(registered.statusCode === 200 && registered.payload?.ok, `${user.id} 기기 등록 실패`);

      const loaded = await studyAction(user, "load");
      assert(loaded.statusCode === 200 && loaded.payload?.ok, `${user.id} 최초 로드 실패`);

      const profile = await studyAction(user, "save_profile", {
        avatarTone: user.tone,
        nickname: user.nickname,
      });
      assert(profile.statusCode === 200 && profile.payload?.nickname === user.nickname, `${user.id} 닉네임 저장 실패`);

      const subjects = await studyAction(user, "save_subjects", {
        subjects: [user.subject, user.subject === "영어" ? "국어" : "영어"],
      });
      assert(subjects.statusCode === 200 && subjects.payload?.subjects?.length === 2, `${user.id} 과목 저장 실패`);
    }
    report.push("기기 인증·닉네임·과목 저장");

    const firstClaim = await studyAction(TEST_USERS[0], "claim_seat", {
      seatNumber: TEST_USERS[0].seatNumber,
      avatarTone: TEST_USERS[0].tone,
      displayName: TEST_USERS[0].nickname,
    });
    assert(firstClaim.statusCode === 200, "첫 번째 학생 좌석 선택 실패");

    const collision = await studyAction(TEST_USERS[1], "claim_seat", {
      seatNumber: TEST_USERS[0].seatNumber,
      avatarTone: TEST_USERS[1].tone,
      displayName: TEST_USERS[1].nickname,
    });
    assert(collision.statusCode === 409 && collision.payload?.error === "seat_taken", "좌석 중복 방지 실패");

    const secondClaim = await studyAction(TEST_USERS[1], "claim_seat", {
      seatNumber: TEST_USERS[1].seatNumber,
      avatarTone: TEST_USERS[1].tone,
      displayName: TEST_USERS[1].nickname,
    });
    assert(secondClaim.statusCode === 200, "두 번째 학생 좌석 선택 실패");
    report.push("좌석 선택·중복 방지");

    const firstStart = await studyAction(TEST_USERS[0], "timer_start", { subject: TEST_USERS[0].subject });
    assert(firstStart.statusCode === 200 && firstStart.payload?.session?.status === "running", "첫 타이머 시작 실패");
    await wait(1100);
    const firstPause = await studyAction(TEST_USERS[0], "timer_pause");
    assert(
      firstPause.statusCode === 200 &&
        firstPause.payload?.session?.status === "paused" &&
        firstPause.payload.session.elapsedSeconds >= 1,
      "타이머 일시정지 또는 경과시간 저장 실패"
    );
    const firstResume = await studyAction(TEST_USERS[0], "timer_resume");
    assert(firstResume.statusCode === 200 && firstResume.payload?.session?.status === "running", "타이머 재시작 실패");
    await wait(1100);
    const firstStop = await studyAction(TEST_USERS[0], "timer_stop");
    assert(
      firstStop.statusCode === 200 &&
        firstStop.payload?.session?.status === "completed" &&
        firstStop.payload.session.elapsedSeconds >= 2,
      "타이머 종료 또는 누적 저장 실패"
    );

    const secondStart = await studyAction(TEST_USERS[1], "timer_start", { subject: TEST_USERS[1].subject });
    assert(secondStart.statusCode === 200, "두 번째 학생 타이머 시작 실패");
    await wait(1100);
    report.push("타이머 시작·일시정지·재시작·종료");

    const liveSnapshot = await studyAction(TEST_USERS[0], "load");
    assert(liveSnapshot.statusCode === 200, "실시간 스냅샷 조회 실패");
    assert(liveSnapshot.payload?.room?.length === 2, "실시간 좌석 인원 불일치");
    assert(liveSnapshot.payload?.summary?.focusedCount === 2, "실시간 함께 공부 중 인원 불일치");
    assert(liveSnapshot.payload?.ranking?.length === 2, "실시간 랭킹 인원 불일치");
    assert(
      liveSnapshot.payload.ranking.every((row) => Number(row.totalSeconds) >= 1),
      "랭킹 순공시간 반영 실패"
    );

    const stats = await studyAction(TEST_USERS[0], "stats", {
      dateFrom: liveSnapshot.payload.studyDate,
      dateTo: liveSnapshot.payload.studyDate,
    });
    assert(stats.statusCode === 200, "일간 통계 조회 실패");
    assert(stats.payload?.summary?.totalSeconds >= 2, "일간 총 순공시간 불일치");
    assert(stats.payload?.subjectTotals?.[TEST_USERS[0].subject] >= 2, "과목별 순공시간 불일치");
    report.push("실시간 인원·랭킹·일간/과목별 통계");

    for (const user of TEST_USERS) {
      const released = await studyAction(user, "release_seat");
      assert(released.statusCode === 200, `${user.id} 좌석 비우기 실패`);
    }
    const remainingPresence = await dbRequest(
      config,
      "GET",
      `study_cafe_presence?student_id=in.(${TEST_USERS.map((user) => user.id).join(",")})&select=student_id`
    );
    assert(Array.isArray(remainingPresence) && remainingPresence.length === 0, "좌석 비우기 후 presence가 남아 있습니다.");
    report.push("좌석 비우기");

    console.log(JSON.stringify({ ok: true, checks: report }, null, 2));
  } finally {
    if (created) {
      await cleanup(config);
      await verifyCleanup(config);
      console.log("테스트 학생과 연관 데이터를 모두 정리했습니다.");
    }
  }
}

async function studyAction(user, action, payload = {}) {
  return invoke(studyCafeHandler, {
    action,
    studentId: user.id,
    deviceToken: user.deviceToken,
    client: { displayMode: "browser", userAgent: "study-cafe-integration" },
    ...payload,
  });
}

async function invoke(handler, body) {
  const req = { method: "POST", body, headers: {} };
  const res = {
    statusCode: 200,
    payload: null,
    setHeader() {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
  await handler(req, res);
  return res;
}

async function cleanup(config) {
  for (const user of TEST_USERS) {
    await dbRequest(
      config,
      "DELETE",
      `students?id=eq.${encodeURIComponent(user.id)}&name=eq.${encodeURIComponent(user.name)}`
    );
  }
}

async function verifyCleanup(config) {
  const ids = TEST_USERS.map((user) => user.id).join(",");
  const checks = [
    `students?id=in.(${ids})&select=id`,
    `student_devices?student_id=in.(${ids})&select=id`,
    `study_cafe_profiles?student_id=in.(${ids})&select=student_id`,
    `study_cafe_subjects?student_id=in.(${ids})&select=student_id`,
    `study_cafe_sessions?student_id=in.(${ids})&select=student_id`,
    `study_cafe_presence?student_id=in.(${ids})&select=student_id`,
  ];
  for (const query of checks) {
    const rows = await dbRequest(config, "GET", query);
    assert(Array.isArray(rows) && rows.length === 0, `테스트 데이터 정리 실패: ${query.split("?")[0]}`);
  }
}

async function dbRequest(config, method, resource, body, headers = {}) {
  const response = await fetch(
    `${config.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${resource}`,
    {
      method,
      headers: {
        apikey: config.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${config.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }
  );
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`${method} ${resource.split("?")[0]} 실패 (${response.status}): ${detail.slice(0, 300)}`);
  }
  if (response.status === 204) return null;
  return response.json().catch(() => null);
}

function requireConfig(config) {
  assert(config.SUPABASE_URL, "SUPABASE_URL이 없습니다.");
  assert(config.SUPABASE_SERVICE_ROLE_KEY, "SUPABASE_SERVICE_ROLE_KEY가 없습니다.");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
