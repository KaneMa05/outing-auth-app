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
const { hashDeviceToken, normalizePushSubscription, normalizeStudentIds } = handler._private;

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
const appSource = fs.readFileSync("app.js", "utf8");
const teacherSource = fs.readFileSync("teacher-students.js", "utf8");
assert.match(migration, /create table if not exists public\.student_push_subscriptions/);
assert.match(migration, /create table if not exists public\.student_push_messages/);
assert.match(migration, /enable row level security/);
assert.match(migration, /revoke all on table public\.student_push_subscriptions from anon, authenticated/);
assert.match(appSource, /function renderStudentPushNotificationCard\(student, profile\)/);
assert.match(appSource, /function enableStudentPushNotifications\(student, profile\)/);
assert.match(appSource, /안드로이드를 포함한 현재 기기/);
assert.match(teacherSource, /function renderStudentPushAdminPanel\(\)/);
assert.match(teacherSource, /푸시 알림 보내기/);

assert.equal(hashDeviceToken("device-token"), crypto.createHash("sha256").update("device-token").digest("hex"));
assert.equal(normalizePushSubscription({ endpoint: "http://invalid", keys: { p256dh: "p".repeat(24), auth: "a".repeat(12) } }), null);
assert.deepEqual(normalizeStudentIds(["18001", "18001", "", "bad id"]), ["18001"]);

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
  assert.equal(subscribeRequests[1].options.body.includes("device-token"), false);

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
