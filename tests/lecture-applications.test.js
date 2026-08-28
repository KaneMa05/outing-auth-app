const assert = require("node:assert/strict");
const fs = require("node:fs");

const handler = require("../api/lecture-applications");
const { COOKIE_NAME, createSessionToken } = require("../api/teacher-auth-utils");
const {
  hashLookupToken,
  isRegistrationNumberForCohort,
  isValidCohort,
  normalizeApplication,
  normalizePushSubscription,
  validateApplication,
} = handler._private;

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
  courseType: "lecture",
  referralSource: "naver_cafe",
  referralSourceDetail: "",
  lectureId: "LectureUser01",
  privacyConsent: true,
  termsConsent: true,
};

const normalized = normalizeApplication(validBody);
assert.equal(normalized.phone_normalized, "01012345678");
assert.equal(normalized.lecture_id_normalized, "lectureuser01");
assert.equal(validateApplication(normalized), "");
assert.equal(validateApplication(normalizeApplication({ ...validBody, phone: "123" })), "invalid_phone");
assert.equal(validateApplication(normalizeApplication({ ...validBody, privacyConsent: false })), "privacy_consent_required");
assert.equal(validateApplication(normalizeApplication({ ...validBody, termsConsent: false })), "terms_consent_required");
assert.equal(validateApplication(normalizeApplication({ ...validBody, referralSource: "other" })), "referral_detail_required");
assert.equal(validateApplication(normalizeApplication({ ...validBody, courseType: "offline", lectureId: "" })), "");
assert.equal(validateApplication(normalizeApplication({ ...validBody, courseType: "online_managed", lectureId: "" })), "");
assert.equal(validateApplication(normalizeApplication({ ...validBody, courseType: "invalid" })), "invalid_course_type");
assert.equal(isValidCohort("18"), true);
assert.equal(isValidCohort("0"), false);
assert.equal(isRegistrationNumberForCohort("18009", "18"), true);
assert.equal(isRegistrationNumberForCohort("19009", "18"), false);
assert.equal(isRegistrationNumberForCohort("18000", "18"), false);

const migration = fs.readFileSync("supabase/add-lecture-applications.sql", "utf8");
const labelUpdate = fs.readFileSync("supabase/update-lecture-student-label.sql", "utf8");
const pushMigration = fs.readFileSync("supabase/add-lecture-application-push-subscriptions.sql", "utf8");
const courseTypeMigration = fs.readFileSync("supabase/add-lecture-application-course-type.sql", "utf8");
const termsConsentMigration = fs.readFileSync("supabase/add-lecture-application-terms-consent.sql", "utf8");
const deletedStudentReleaseMigration = fs.readFileSync("supabase/release-application-identifiers-on-student-delete.sql", "utf8");
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
assert.match(migration, /student_category,[\s\S]*?new\.course_type/);
assert.match(migration, /where status in \('pending', 'approved'\)/);
assert.match(migration, /lecture_applications_approved_student_idx/);
assert.match(migration, /lookup_token_hash text/);
assert.match(migration, /lecture_applications_lookup_token_idx/);
assert.match(labelUpdate, /create or replace function public\.approve_lecture_application\(\)/);
assert.match(labelUpdate, /new\.name,\s*next_class_name,\s*new\.course_type/);
assert.match(labelUpdate, /update public\.students\s*set class_name = '수강생'\s*where student_category = 'lecture'\s*and class_name = '인강생'/);
assert.match(pushMigration, /create table if not exists public\.lecture_application_push_subscriptions/);
assert.match(pushMigration, /alter table public\.lecture_application_push_subscriptions enable row level security/);
assert.match(pushMigration, /revoke all on table public\.lecture_application_push_subscriptions from anon, authenticated/);
assert.match(pushMigration, /grant select, insert, update, delete on table public\.lecture_application_push_subscriptions to service_role/);
assert.match(courseTypeMigration, /course_type in \('offline', 'online_managed', 'lecture'\)/);
assert.match(courseTypeMigration, /new\.course_type in \('offline', 'online_managed'\)/);
assert.match(courseTypeMigration, /raise exception 'registration_number_required'/);
assert.match(courseTypeMigration, /raise exception 'registration_number_in_use'/);
assert.match(courseTypeMigration, /add column if not exists cohort smallint/);
assert.match(courseTypeMigration, /raise exception 'registration_number_cohort_mismatch'/);
assert.match(courseTypeMigration, /case when new\.course_type = 'lecture' then null else new\.cohort end/);
assert.match(courseTypeMigration, /next_attendance_excluded := new\.course_type <> 'offline'/);
assert.match(termsConsentMigration, /add column if not exists terms_consent_at timestamptz/);
assert.match(deletedStudentReleaseMigration, /new\.status = 'cancelled'[\s\S]*?is_active = false/);
assert.match(deletedStudentReleaseMigration, /security definer[\s\S]*?set search_path = ''/);
assert.match(deletedStudentReleaseMigration, /revoke all on function private\.cancel_application_for_deactivated_student\(\) from public/);
assert.match(deletedStudentReleaseMigration, /after update of is_active on public\.students/);
assert.match(deletedStudentReleaseMigration, /application\.status = 'approved'[\s\S]*?student\.is_active = false/);
assert.match(appSource, /function openLectureApplicationModal\(\)/);
assert.match(appSource, /LECTURE_APPLICATION_RECEIPT_STORAGE_KEY/);
assert.match(appSource, /function renderLectureApplicationStatusCard\(application/);
assert.match(appSource, /action: "status"/);
assert.match(appSource, /"등록 신청 검수 중"/);
assert.match(appSource, /"등록번호 입력하기"/);
assert.match(appSource, /const approvedLectureStudent = getStudentCategory\(selectedStudent\) === "lecture"/);
assert.match(appSource, /신청 정보가 확인되었습니다\. 사용할 비밀번호만 설정해주세요\./);
assert.match(appSource, /getLectureApplicationReceipt\(\)\?\.approvedStudentId === studentId\) clearLectureApplicationReceipt\(\)/);
assert.match(appSource, /approvedApplicationStudent = applicationReceipt\?\.approvedStudentId === selectedStudent\.id/);
assert.doesNotMatch(appSource, /button\("상태 새로고침"/);
assert.doesNotMatch(appSource, /최신 검수 상태를 자동으로 확인합니다/);
assert.match(appSource, /field\("휴대전화 번호", phoneInput\)/);
assert.match(appSource, /field\("생년월일", birthDateInput\)/);
assert.match(appSource, /field\("인강 아이디"/);
assert.match(appSource, /privacyConsent: true/);
assert.match(appSource, /termsConsent: true/);
assert.match(appSource, /개인정보 수집·이용 동의/);
assert.match(appSource, /수강생 등록 및 앱 이용약관/);
assert.match(appSource, /field\("수강 구분", courseTypeSelect/);
assert.match(appSource, /el\("option", \{ value: "offline" \}, "오프라인반"\)/);
assert.match(appSource, /el\("option", \{ value: "online_managed" \}, "온라인 관리반"\)/);
assert.match(appSource, /el\("option", \{ value: "lecture" \}, "인강생"\)/);
assert.match(appSource, /lectureIdField\.hidden = courseTypeSelect\.value !== "lecture"/);
assert.doesNotMatch(appSource, /선생님 번호 1~10/);
const browserInstallOnlySource = appSource.match(/function renderStudentBrowserInstallOnly\(\) \{([\s\S]*?)\n\}/)?.[1] || "";
assert.match(browserInstallOnlySource, /button\("앱으로 이용하기"/);
assert.doesNotMatch(browserInstallOnlySource, /renderLectureApplicationEntryCard\(\)/);
assert.match(appSource, /return el\("div", \{ className: "grid student-view" \}, \[form, renderLectureApplicationEntryCard\(\)/);
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
assert.match(teacherStudentsSource, /lecture-application-table-wrap/);
assert.match(teacherStudentsSource, /lecture-application-row-actions/);
assert.doesNotMatch(teacherStudentsSource, /el\("td", \{ className: "student-admin-actions" \}, \[\s*button\("상세"/);
assert.match(teacherStudentsSource, /function approveLectureApplication\(application\)/);
assert.match(teacherStudentsSource, /function openManualLectureApplicationApprovalModal\(application\)/);
assert.match(teacherStudentsSource, /el\("option", \{ value: "custom" \}, "새 기수 입력"\)/);
assert.match(teacherStudentsSource, /function suggestNextManualRegistrationNumber\(cohort\)/);
assert.match(teacherStudentsSource, /isRegistrationNumberForCohort\(registrationNumber, cohort\)/);
assert.match(teacherStudentsSource, /registrationNumber/);
assert.match(teacherStudentsSource, /function openRejectLectureApplicationModal\(application\)/);
assert.match(teacherSource, /renderOnlineManagedStudyCafeTogglePanel\(\)[\s\S]*?renderLectureApplicationsAdminPanel\(\)[\s\S]*?teacherStudentForm\(\)/);
assert.match(styleSource, /\.info-modal-panel\.lecture-application-modal/);
assert.match(styleSource, /\.lecture-application-table-wrap \.responsive-table th \{[\s\S]*?white-space: nowrap/);
assert.match(styleSource, /\.lecture-application-form input\[type="date"\][\s\S]*?min-inline-size: 0/);
assert.match(styleSource, /\.info-modal-panel\.lecture-application-modal[\s\S]*?overflow-x: hidden/);
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
  assert.equal(insertedBody.course_type, "lecture");
  assert.ok(insertedBody.privacy_consent_at);
  assert.ok(insertedBody.terms_consent_at);
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
  let reviewRequestCount = 0;
  global.fetch = async (url, options) => {
    reviewRequestCount += 1;
    if (reviewRequestCount === 1) {
      assert.equal(options.method, "GET");
      return jsonResponse([{ id: "application-1", course_type: "lecture" }]);
    }
    assert.match(String(url), /status=eq\.pending/);
    reviewBody = JSON.parse(options.body);
    return jsonResponse([{
      id: "application-1",
      name: "홍길동",
      track: validBody.track,
      gender: "남",
      course_type: "lecture",
      status: "approved",
      approved_student_id: "900001",
    }]);
  };
  const approved = await invoke("PATCH", { id: "application-1", status: "approved" }, adminToken, "10.0.0.6");
  assert.equal(approved.statusCode, 200);
  assert.equal(approved.payload.application.approved_student_id, "900001");
  assert.equal(reviewBody.reviewed_by, "admin");
  assert.equal(reviewBody.approved_student_id, null);
  assert.equal(reviewBody.cohort, null);

  global.fetch = async (_url, options) => {
    assert.equal(options.method, "GET");
    return jsonResponse([{ id: "application-2", course_type: "online_managed" }]);
  };
  const missingRegistrationNumber = await invoke("PATCH", {
    id: "application-2",
    status: "approved",
    cohort: "28",
  }, adminToken, "10.0.0.10");
  assert.equal(missingRegistrationNumber.statusCode, 400);
  assert.equal(missingRegistrationNumber.payload.error, "registration_number_required");

  let manualReviewRequestCount = 0;
  global.fetch = async (_url, options) => {
    manualReviewRequestCount += 1;
    if (manualReviewRequestCount === 1) return jsonResponse([{ id: "application-2", course_type: "online_managed" }]);
    const body = JSON.parse(options.body);
    assert.equal(body.approved_student_id, "28001");
    assert.equal(body.cohort, 28);
    return jsonResponse([{ id: "application-2", course_type: "online_managed", cohort: 28, status: "approved", approved_student_id: "28001" }]);
  };
  const manualApproved = await invoke("PATCH", {
    id: "application-2",
    status: "approved",
    registrationNumber: "28001",
    cohort: "28",
  }, adminToken, "10.0.0.11");
  assert.equal(manualApproved.statusCode, 200);
  assert.equal(manualApproved.payload.application.approved_student_id, "28001");
  assert.equal(manualApproved.payload.application.cohort, 28);

  global.fetch = async (_url, options) => {
    assert.equal(options.method, "GET");
    return jsonResponse([{ id: "application-4", course_type: "offline" }]);
  };
  const cohortMismatch = await invoke("PATCH", {
    id: "application-4",
    status: "approved",
    registrationNumber: "19009",
    cohort: "18",
  }, adminToken, "10.0.0.13");
  assert.equal(cohortMismatch.statusCode, 400);
  assert.equal(cohortMismatch.payload.error, "registration_number_cohort_mismatch");

  let duplicateRegistrationRequestCount = 0;
  global.fetch = async (_url, options) => {
    duplicateRegistrationRequestCount += 1;
    if (duplicateRegistrationRequestCount === 1) return jsonResponse([{ id: "application-3", course_type: "offline" }]);
    assert.equal(options.method, "PATCH");
    return jsonResponse({ code: "P0001", message: "registration_number_in_use" }, 409);
  };
  const duplicateRegistration = await invoke("PATCH", {
    id: "application-3",
    status: "approved",
    registrationNumber: "18001",
    cohort: "18",
  }, adminToken, "10.0.0.12");
  assert.equal(duplicateRegistration.statusCode, 409);
  assert.equal(duplicateRegistration.payload.error, "registration_number_in_use");

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
