const assert = require("node:assert/strict");
const fs = require("node:fs");

const handler = require("../api/lecture-applications");
const { COOKIE_NAME, createSessionToken } = require("../api/teacher-auth-utils");
const { hashLookupToken, normalizeApplication, normalizePushSubscription, validateApplication } = handler._private;

function createResponse() {
  return {
    headers: {},
    statusCode: 200,
    payload: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

async function invoke(method, body = {}, token = "", ip = "127.0.0.1", query = {}) {
  const req = {
    method,
    body,
    query,
    headers: {
      "x-forwarded-for": ip,
      ...(token ? { cookie: `${COOKIE_NAME}=${token}` } : {}),
    },
  };
  const res = createResponse();
  await handler(req, res);
  return res;
}

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload),
  };
}

const validBody = {
  name: "홍길동",
  phone: "010-1234-5678",
  birthDate: "2000-01-02",
  gender: "남",
  track: "경찰직 - 공채(순경)",
  referralSource: "naver_cafe",
  referralSourceDetail: "",
  lectureId: "LectureUser01",
  privacyConsent: true,
};

const normalized = normalizeApplication(validBody);
assert.equal(normalized.phone_normalized, "01012345678");
assert.equal(normalized.lecture_id_normalized, "lectureuser01");
assert.equal(validateApplication(normalized), "");
assert.equal(validateApplication(normalizeApplication({ ...validBody, phone: "123" })), "invalid_phone");
assert.equal(validateApplication(normalizeApplication({ ...validBody, privacyConsent: false })), "privacy_consent_required");
assert.equal(validateApplication(normalizeApplication({ ...validBody, referralSource: "other" })), "referral_detail_required");

const migration = fs.readFileSync("supabase/add-lecture-applications.sql", "utf8");
const labelUpdate = fs.readFileSync("supabase/update-lecture-student-label.sql", "utf8");
const pushMigration = fs.readFileSync("supabase/add-lecture-application-push-subscriptions.sql", "utf8");
const appSource = fs.readFileSync("app.js", "utf8");
const serviceWorkerSource = fs.readFileSync("sw.js", "utf8");
const teacherStudentsSource = fs.readFileSync("teacher-students.js", "utf8");
const teacherSource = fs.readFileSync("teacher.js", "utf8");
const styleSource = fs.readFileSync("styles.css", "utf8");
const localServerSource = fs.readFileSync("local-dev-server.js", "utf8");
assert.match(migration, /create table if not exists public\.lecture_applications/);
assert.match(migration, /alter table public\.lecture_applications enable row level security/);
assert.match(migration, /grant select, insert, update on table public\.lecture_applications to service_role/);
assert.match(migration, /revoke all on table public\.lecture_applications from anon, authenticated/);
assert.match(migration, /900000 \+ nextval\('public\.lecture_student_number_seq'\)/);
assert.match(migration, /student_category,[\s\S]*?'lecture'/);
assert.match(migration, /where status in \('pending', 'approved'\)/);
assert.match(migration, /lecture_applications_approved_student_idx/);
assert.match(migration, /lookup_token_hash text/);
assert.match(migration, /lecture_applications_lookup_token_idx/);
assert.match(labelUpdate, /create or replace function public\.approve_lecture_application\(\)/);
assert.match(labelUpdate, /new\.name,\s*'수강생',\s*'lecture'/);
assert.match(labelUpdate, /update public\.students\s*set class_name = '수강생'\s*where student_category = 'lecture'\s*and class_name = '인강생'/);
assert.match(pushMigration, /create table if not exists public\.lecture_application_push_subscriptions/);
assert.match(pushMigration, /alter table public\.lecture_application_push_subscriptions enable row level security/);
assert.match(pushMigration, /revoke all on table public\.lecture_application_push_subscriptions from anon, authenticated/);
assert.match(pushMigration, /grant select, insert, update, delete on table public\.lecture_application_push_subscriptions to service_role/);
assert.match(appSource, /function openLectureApplicationModal\(\)/);
assert.match(appSource, /LECTURE_APPLICATION_RECEIPT_STORAGE_KEY/);
assert.match(appSource, /function renderLectureApplicationStatusCard\(application/);
assert.match(appSource, /action: "status"/);
assert.match(appSource, /"등록 신청 검수 중"/);
assert.match(appSource, /"등록번호 입력하기"/);
assert.match(appSource, /const approvedLectureStudent = getStudentCategory\(selectedStudent\) === "lecture"/);
assert.match(appSource, /신청 정보가 확인되었습니다\. 사용할 비밀번호만 설정해주세요\./);
assert.match(appSource, /getStudentCategory\(selectedStudent\) === "lecture"\) clearLectureApplicationReceipt\(\)/);
assert.doesNotMatch(appSource, /button\("상태 새로고침"/);
assert.doesNotMatch(appSource, /최신 검수 상태를 자동으로 확인합니다/);
assert.match(appSource, /field\("휴대전화 번호", phoneInput\)/);
assert.match(appSource, /field\("생년월일", birthDateInput\)/);
assert.match(appSource, /field\("인강 아이디"/);
assert.match(appSource, /privacyConsent: true/);
assert.match(appSource, /renderStudentBrowserInstallOnly\(\)[\s\S]*?renderLectureApplicationEntryCard\(\)/);
assert.match(appSource, /function enableLectureApplicationPush\(application\)/);
assert.match(appSource, /action: "subscribe"/);
assert.match(appSource, /Notification\.requestPermission\(\)/);
assert.match(serviceWorkerSource, /addEventListener\("push"/);
assert.match(serviceWorkerSource, /addEventListener\("notificationclick"/);
assert.match(serviceWorkerSource, /icon: "\/notification-icon\.png"/);
assert.match(serviceWorkerSource, /badge: "\/notification-badge\.png"/);
assert.ok(fs.existsSync("notification-icon.png"));
assert.ok(fs.existsSync("notification-badge.png"));
assert.match(teacherStudentsSource, /function renderLectureApplicationsAdminPanel\(\)/);
assert.match(teacherStudentsSource, /maskLectureApplicationPhone\(application\.phone\)/);
assert.match(teacherStudentsSource, /function approveLectureApplication\(application\)/);
assert.match(teacherStudentsSource, /function openRejectLectureApplicationModal\(application\)/);
assert.match(teacherSource, /renderOnlineManagedStudyCafeTogglePanel\(\)[\s\S]*?renderLectureApplicationsAdminPanel\(\)[\s\S]*?teacherStudentForm\(\)/);
assert.match(styleSource, /\.info-modal-panel\.lecture-application-modal/);
assert.match(styleSource, /\.lecture-application-status-card/);
assert.match(localServerSource, /function handleLocalLectureApplications\(req, res\)/);
assert.match(localServerSource, /localPreview: true/);

const originalFetch = global.fetch;
const originalEnv = {
  url: process.env.SUPABASE_URL,
  key: process.env.SUPABASE_SERVICE_ROLE_KEY,
  secret: process.env.TEACHER_SESSION_SECRET,
  vapidSubject: process.env.VAPID_SUBJECT,
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY,
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY,
};

(async () => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
  process.env.TEACHER_SESSION_SECRET = "lecture-application-test-secret";

  global.fetch = async () => { throw new Error("fetch should not run"); };
  const invalid = await invoke("POST", { ...validBody, birthDate: "2020-02-31" }, "", "10.0.0.1");
  assert.equal(invalid.statusCode, 400);
  assert.equal(invalid.payload.error, "invalid_birth_date");

  let insertedBody;
  global.fetch = async (_url, options) => {
    insertedBody = JSON.parse(options.body);
    return jsonResponse([{ id: "application-1" }], 201);
  };
  const created = await invoke("POST", validBody, "", "10.0.0.2");
  assert.equal(created.statusCode, 201);
  assert.equal(created.payload.applicationId, "application-1");
  assert.equal(insertedBody.phone_normalized, "01012345678");
  assert.ok(insertedBody.privacy_consent_at);
  assert.match(insertedBody.lookup_token_hash, /^[0-9a-f]{64}$/);
  assert.equal(created.payload.lookupToken.length >= 32, true);
  assert.notEqual(insertedBody.lookup_token_hash, created.payload.lookupToken);
  assert.equal(Object.hasOwn(insertedBody, "password"), false);

  const statusApplicationId = "123e4567-e89b-42d3-a456-426614174000";
  const statusLookupToken = "status-lookup-token-that-is-long-enough-123456";
  global.fetch = async (url, options) => {
    assert.equal(options.method, "GET");
    assert.match(String(url), new RegExp(`lookup_token_hash=eq\\.${hashLookupToken(statusLookupToken)}`));
    return jsonResponse([{
      id: statusApplicationId,
      status: "pending",
      rejection_reason: null,
      approved_student_id: null,
      reviewed_at: null,
      created_at: "2026-08-05T01:02:03.000Z",
      updated_at: "2026-08-05T01:02:03.000Z",
    }]);
  };
  const statusResponse = await invoke("POST", {
    action: "status",
    applicationId: statusApplicationId,
    lookupToken: statusLookupToken,
  }, "", "10.0.0.8");
  assert.equal(statusResponse.statusCode, 200);
  assert.equal(statusResponse.payload.application.status, "pending");
  assert.equal(statusResponse.payload.application.applicationId, statusApplicationId);

  assert.equal(normalizePushSubscription({ endpoint: "http://example.com", keys: { p256dh: "x".repeat(24), auth: "y".repeat(12) } }), null);
  process.env.VAPID_SUBJECT = "mailto:test@example.com";
  process.env.VAPID_PUBLIC_KEY = "test-public-key";
  process.env.VAPID_PRIVATE_KEY = "test-private-key";
  let subscriptionBody;
  let subscriptionRequestCount = 0;
  global.fetch = async (url, options) => {
    subscriptionRequestCount += 1;
    if (subscriptionRequestCount === 1) {
      assert.equal(options.method, "GET");
      assert.match(String(url), /lecture_applications\?id=eq\./);
      return jsonResponse([{ id: statusApplicationId, status: "pending" }]);
    }
    assert.equal(options.method, "POST");
    assert.match(String(url), /lecture_application_push_subscriptions\?on_conflict=application_id,endpoint/);
    subscriptionBody = JSON.parse(options.body);
    return jsonResponse(null);
  };
  const subscriptionResponse = await invoke("POST", {
    action: "subscribe",
    applicationId: statusApplicationId,
    lookupToken: statusLookupToken,
    subscription: {
      endpoint: "https://push.example.com/subscription/123",
      keys: { p256dh: "p".repeat(24), auth: "a".repeat(12) },
    },
  }, "", "10.0.0.9");
  assert.equal(subscriptionResponse.statusCode, 200);
  assert.equal(subscriptionResponse.payload.subscribed, true);
  assert.equal(subscriptionBody.application_id, statusApplicationId);
  delete process.env.VAPID_SUBJECT;
  delete process.env.VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;

  global.fetch = async () => jsonResponse({ code: "23505", message: "duplicate key" }, 409);
  const duplicate = await invoke("POST", validBody, "", "10.0.0.3");
  assert.equal(duplicate.statusCode, 409);
  assert.equal(duplicate.payload.error, "duplicate_application");

  const unauthorized = await invoke("GET", {}, "", "10.0.0.4", { status: "all" });
  assert.equal(unauthorized.statusCode, 401);

  const adminToken = createSessionToken(process.env.TEACHER_SESSION_SECRET, {
    username: "admin",
    role: "admin",
    permissions: ["*"],
  });
  global.fetch = async (url) => {
    assert.match(String(url), /lecture_applications\?select=/);
    return jsonResponse([{ id: "application-1", status: "pending" }]);
  };
  const list = await invoke("GET", {}, adminToken, "10.0.0.5", { status: "pending" });
  assert.equal(list.statusCode, 200);
  assert.equal(list.payload.applications.length, 1);

  let reviewBody;
  global.fetch = async (url, options) => {
    assert.match(String(url), /status=eq\.pending/);
    reviewBody = JSON.parse(options.body);
    return jsonResponse([{
      id: "application-1",
      name: "홍길동",
      track: validBody.track,
      gender: "남",
      status: "approved",
      approved_student_id: "900001",
    }]);
  };
  const approved = await invoke("PATCH", { id: "application-1", status: "approved" }, adminToken, "10.0.0.6");
  assert.equal(approved.statusCode, 200);
  assert.equal(approved.payload.application.approved_student_id, "900001");
  assert.equal(reviewBody.reviewed_by, "admin");

  const missingReason = await invoke("PATCH", { id: "application-1", status: "rejected" }, adminToken, "10.0.0.7");
  assert.equal(missingReason.statusCode, 400);
  assert.equal(missingReason.payload.error, "rejection_reason_required");

  console.log("lecture application tests passed");
})().finally(() => {
  global.fetch = originalFetch;
  if (originalEnv.url === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = originalEnv.url;
  if (originalEnv.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = originalEnv.key;
  if (originalEnv.secret === undefined) delete process.env.TEACHER_SESSION_SECRET;
  else process.env.TEACHER_SESSION_SECRET = originalEnv.secret;
  if (originalEnv.vapidSubject === undefined) delete process.env.VAPID_SUBJECT;
  else process.env.VAPID_SUBJECT = originalEnv.vapidSubject;
  if (originalEnv.vapidPublicKey === undefined) delete process.env.VAPID_PUBLIC_KEY;
  else process.env.VAPID_PUBLIC_KEY = originalEnv.vapidPublicKey;
  if (originalEnv.vapidPrivateKey === undefined) delete process.env.VAPID_PRIVATE_KEY;
  else process.env.VAPID_PRIVATE_KEY = originalEnv.vapidPrivateKey;
});
