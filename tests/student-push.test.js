const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const webPush = require("web-push");

const sentNotifications = [];
webPush.setVapidDetails = () => {};
webPush.sendNotification = async (subscription, payload) => {
  sentNotifications.push({ subscription, payload: JSON.parse(payload) });
};

const handler = require("../api/student-push");
const { COOKIE_NAME, createSessionToken } = require("../api/teacher-auth-utils");
const { hashDeviceToken, normalizePushPreferences, normalizePushSubscription, normalizeStudentIds } = handler._private;

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

async function invoke(method, body = {}, token = "") {
  const req = {
    method,
    body,
    headers: {
      "user-agent": "student-push-test",
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
    text: async () => payload === null ? "" : JSON.stringify(payload),
  };
}

const migration = fs.readFileSync("supabase/add-student-push-notifications.sql", "utf8");
const preferencesMigration = fs.readFileSync("supabase/add-student-push-preferences.sql", "utf8");
const appSource = fs.readFileSync("app.js", "utf8");
const teacherSource = fs.readFileSync("teacher-students.js", "utf8");
const teacherRouteSource = fs.readFileSync("teacher.js", "utf8");
const teacherHtmlSource = fs.readFileSync("teacher.html", "utf8");
const sharedSource = fs.readFileSync("shared.js", "utf8");
assert.match(migration, /create table if not exists public\.student_push_subscriptions/);
assert.match(migration, /create table if not exists public\.student_push_messages/);
assert.match(migration, /enable row level security/);
assert.match(migration, /revoke all on table public\.student_push_subscriptions from anon, authenticated/);
assert.match(preferencesMigration, /add column if not exists enabled boolean not null default true/);
assert.match(preferencesMigration, /add column if not exists notification_preferences jsonb not null/);
assert.match(appSource, /function renderStudentPushNotificationCard\(student, profile\)/);
assert.match(appSource, /function enableStudentPushNotifications\(student, profile\)/);
assert.match(appSource, /role: "switch"/);
assert.match(appSource, /className: "student-push-toggle"/);
assert.match(appSource, /중요 공지 및 알림을 받아보세요/);
assert.match(appSource, /STUDENT_PUSH_PROMPT_SNOOZE_MS = 7 \* 24 \* 60 \* 60 \* 1000/);
assert.match(appSource, /STUDENT_PUSH_PROMPT_MAX_DISMISSALS = 3/);
assert.match(appSource, /"push-settings": \(\) => requireStudentAuth\(renderStudentPushSettings\)/);
assert.match(appSource, /function renderStudentPushSettings\(\)/);
assert.match(appSource, /notifications: \(\) => requireStudentAuth\(renderStudentNotifications\)/);
assert.match(appSource, /function renderStudentNotifications\(\)/);
assert.match(appSource, /action: "inbox"/);
assert.match(appSource, /const category = getStudentCategory\(student\)/);
assert.match(appSource, /function getStudentPushPreferenceOptions\(category\)/);
assert.match(appSource, /categories: \["offline", "online_managed", "lecture"\]/);
assert.match(appSource, /key: "study_cafe"[\s\S]*?categories: \["online_managed", "lecture"\]/);
assert.match(appSource, /key: "question_board"[\s\S]*?categories: \["lecture"\]/);
assert.match(appSource, /관리자 안내/);
assert.match(appSource, /학습 알림/);
assert.match(appSource, /스터디카페/);
assert.match(appSource, /게시판/);
assert.doesNotMatch(appSource, /notify\("관리자 앱 알림을 (켰습니다|껐습니다)\."\)/);
assert.match(teacherSource, /function renderStudentPushAdminPanel\(\)/);
assert.match(teacherSource, /푸시 알림 보내기/);
assert.match(teacherHtmlSource, /data-route="student-push">학생 푸시 알림/);
assert.match(appSource, /"student-push": renderStudentPushAdmin/);
assert.match(sharedSource, /"student-push": "notices\.write"/);
assert.match(teacherRouteSource, /function renderStudentPushAdmin\(\)/);
assert.doesNotMatch(
  teacherRouteSource.match(/function renderStudentsAdmin\(\)[\s\S]*?\n}\n/)?.[0] || "",
  /renderStudentPushAdminPanel/,
  "학생 푸시 알림은 학생 등록 화면에 포함되지 않아야 합니다."
);

assert.equal(hashDeviceToken("device-token"), crypto.createHash("sha256").update("device-token").digest("hex"));
assert.equal(normalizePushSubscription({ endpoint: "http://invalid", keys: { p256dh: "p".repeat(24), auth: "a".repeat(12) } }), null);
assert.deepEqual(normalizeStudentIds(["18001", "18001", "", "bad id"]), ["18001"]);
assert.deepEqual(normalizePushPreferences({ admin: false, study: true }), {
  admin: false,
  study: true,
  study_cafe: true,
  question_board: true,
});

const originalFetch = global.fetch;
const originalEnv = {
  url: process.env.SUPABASE_URL,
  key: process.env.SUPABASE_SERVICE_ROLE_KEY,
  secret: process.env.TEACHER_SESSION_SECRET,
  subject: process.env.VAPID_SUBJECT,
  publicKey: process.env.VAPID_PUBLIC_KEY,
  privateKey: process.env.VAPID_PRIVATE_KEY,
};

(async () => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
  process.env.TEACHER_SESSION_SECRET = "student-push-test-secret";
  process.env.VAPID_SUBJECT = "https://example.com";
  process.env.VAPID_PUBLIC_KEY = "public-key";
  process.env.VAPID_PRIVATE_KEY = "private-key";

  const config = await invoke("POST", { action: "config" });
  assert.equal(config.statusCode, 200);
  assert.equal(config.payload.available, true);

  const subscription = {
    endpoint: "https://push.example.com/student/18001",
    keys: { p256dh: "p".repeat(24), auth: "a".repeat(12) },
  };
  const subscribeRequests = [];
  global.fetch = async (url, options) => {
    subscribeRequests.push({ url: String(url), options });
    if (String(url).includes("rpc/validate_student_device")) return jsonResponse({ valid: true });
    if (String(url).includes("student_push_subscriptions?on_conflict=")) return jsonResponse(null, 201);
    if (String(url).includes("student_push_subscriptions?") && options.method === "PATCH") return jsonResponse(null, 204);
    throw new Error(`unexpected request: ${url}`);
  };
  const subscribed = await invoke("POST", {
    action: "subscribe",
    studentId: "18001",
    deviceToken: "device-token",
    subscription,
  });
  assert.equal(subscribed.statusCode, 200);
  assert.equal(subscribed.payload.subscribed, true);
  const storedBody = JSON.parse(subscribeRequests[1].options.body);
  assert.equal(storedBody.student_id, "18001");
  assert.equal(storedBody.device_token_hash, hashDeviceToken("device-token"));
  assert.equal(storedBody.enabled, true);
  assert.deepEqual(storedBody.notification_preferences, {
    admin: true,
    study: true,
    study_cafe: true,
    question_board: true,
  });

  const preferences = await invoke("POST", {
    action: "preferences",
    studentId: "18001",
    deviceToken: "device-token",
    subscription,
    preferences: { admin: false, study: true },
  });
  assert.equal(preferences.statusCode, 200);
  assert.equal(preferences.payload.preferences.admin, false);
  const preferencesBody = JSON.parse(subscribeRequests.at(-1).options.body);
  assert.equal(preferencesBody.notification_preferences.admin, false);

  const unsubscribed = await invoke("POST", {
    action: "unsubscribe",
    studentId: "18001",
    deviceToken: "device-token",
    subscription,
  });
  assert.equal(unsubscribed.statusCode, 200);
  const unsubscribeBody = JSON.parse(subscribeRequests.at(-1).options.body);
  assert.equal(unsubscribeBody.enabled, false);
  assert.equal(subscribeRequests[1].options.body.includes("device-token"), false);

  global.fetch = async (url) => {
    const value = String(url);
    if (value.includes("rpc/validate_student_device")) return jsonResponse({ valid: true });
    if (value.includes("students?id=eq.18001")) {
      return jsonResponse([{ id: "18001", student_category: "lecture" }]);
    }
    if (value.includes("student_push_messages?select=")) {
      return jsonResponse([
        { id: "all", title: "전체", body: "전체 알림", target_type: "all", target_student_ids: [], created_at: "2026-08-27T00:00:00Z" },
        { id: "category", title: "강의반", body: "반 알림", target_type: "category", target_category: "lecture", target_student_ids: [], created_at: "2026-08-26T00:00:00Z" },
        { id: "direct", title: "개별", body: "개별 알림", target_type: "students", target_student_ids: ["18001"], created_at: "2026-08-25T00:00:00Z" },
        { id: "other", title: "다른 학생", body: "제외", target_type: "students", target_student_ids: ["18002"], created_at: "2026-08-24T00:00:00Z" },
      ]);
    }
    throw new Error(`unexpected inbox request: ${value}`);
  };
  const inbox = await invoke("POST", {
    action: "inbox",
    studentId: "18001",
    deviceToken: "device-token",
  });
  assert.equal(inbox.statusCode, 200);
  assert.deepEqual(inbox.payload.messages.map((message) => message.id), ["all", "category", "direct"]);

  const unauthorized = await invoke("GET");
  assert.equal(unauthorized.statusCode, 401);

  const adminToken = createSessionToken(process.env.TEACHER_SESSION_SECRET, {
    username: "admin",
    role: "admin",
    permissions: ["*"],
  });
  const messageId = "123e4567-e89b-42d3-a456-426614174000";
  global.fetch = async (url, options) => {
    const value = String(url);
    if (value.includes("/students?") && value.includes("id=in.")) {
      return jsonResponse([{ id: "18001", name: "테스트", student_category: "offline" }]);
    }
    if (value.includes("student_push_subscriptions?student_id=in.")) {
      return jsonResponse([{
        id: "subscription-1",
        student_id: "18001",
        device_token_hash: hashDeviceToken("device-token"),
        ...subscription,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      }]);
    }
    if (value.includes("student_devices?student_id=in.")) {
      return jsonResponse([{ student_id: "18001", device_token_hash: hashDeviceToken("device-token") }]);
    }
    if (value.endsWith("/student_push_messages") && options.method === "POST") {
      return jsonResponse([{ id: messageId }], 201);
    }
    if (value.includes(`student_push_messages?id=eq.${messageId}`) && options.method === "PATCH") {
      return jsonResponse(null, 204);
    }
    throw new Error(`unexpected request: ${value}`);
  };
  const sent = await invoke("POST", {
    action: "send",
    targetType: "students",
    studentIds: ["18001"],
    title: "테스트 알림",
    body: "테스트 메시지입니다.",
  }, adminToken);
  assert.equal(sent.statusCode, 200);
  assert.equal(sent.payload.targetCount, 1);
  assert.equal(sent.payload.subscribedStudentCount, 1);
  assert.equal(sent.payload.sentCount, 1);
  assert.equal(sentNotifications.length, 1);
  assert.equal(sentNotifications[0].payload.title, "테스트 알림");
  assert.equal(sentNotifications[0].payload.body, "테스트 메시지입니다.");
  assert.equal(sentNotifications[0].payload.from, undefined);

  console.log("student push tests passed");
})().finally(() => {
  global.fetch = originalFetch;
  for (const [key, value] of Object.entries({
    SUPABASE_URL: originalEnv.url,
    SUPABASE_SERVICE_ROLE_KEY: originalEnv.key,
    TEACHER_SESSION_SECRET: originalEnv.secret,
    VAPID_SUBJECT: originalEnv.subject,
    VAPID_PUBLIC_KEY: originalEnv.publicKey,
    VAPID_PRIVATE_KEY: originalEnv.privateKey,
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});
