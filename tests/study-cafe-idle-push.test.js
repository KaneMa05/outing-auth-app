const assert = require("node:assert/strict");
const webPush = require("web-push");

const sentNotifications = [];
webPush.setVapidDetails = () => {};
webPush.sendNotification = async (subscription, payload) => {
  sentNotifications.push({ subscription, payload: JSON.parse(payload) });
};

const { sendStudyCafeIdleReleasePush } = require("../api/study-cafe-idle-push");

const originalFetch = global.fetch;
const originalEnv = {
  url: process.env.SUPABASE_URL,
  key: process.env.SUPABASE_SERVICE_ROLE_KEY,
  subject: process.env.VAPID_SUBJECT,
  publicKey: process.env.VAPID_PUBLIC_KEY,
  privateKey: process.env.VAPID_PRIVATE_KEY,
};

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}

(async () => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
  process.env.VAPID_SUBJECT = "https://example.com";
  process.env.VAPID_PUBLIC_KEY = "public-key";
  process.env.VAPID_PRIVATE_KEY = "private-key";

  let requestCount = 0;
  global.fetch = async () => {
    requestCount += 1;
    throw new Error("missing student id must not query push delivery data");
  };
  const blocked = await sendStudyCafeIdleReleasePush({
    studentId: "",
    seatNumber: 7,
    releasedAt: "2026-09-09T06:15:00.000Z",
  });
  assert.deepEqual(blocked, { sentCount: 0, skipped: "missing_student_id" });
  assert.equal(requestCount, 0);
  assert.equal(sentNotifications.length, 0);

  const requests = [];
  global.fetch = async (url, options) => {
    requests.push({ url: String(url), options });
    if (String(url).includes("student_push_subscriptions?student_id=eq.21002")) {
      return jsonResponse([
        {
          id: "enabled-subscription",
          student_id: "21002",
          device_token_hash: "active-device",
          endpoint: "https://push.example.com/active",
          p256dh: "p".repeat(24),
          auth: "a".repeat(12),
          enabled: true,
          notification_preferences: { study_cafe: true },
        },
        {
          id: "other-student-subscription",
          student_id: "21001",
          device_token_hash: "active-device",
          endpoint: "https://push.example.com/other-student",
          p256dh: "p".repeat(24),
          auth: "a".repeat(12),
          enabled: true,
          notification_preferences: { study_cafe: true },
        },
        {
          id: "disabled-preference",
          student_id: "21002",
          device_token_hash: "active-device",
          endpoint: "https://push.example.com/disabled-preference",
          p256dh: "p".repeat(24),
          auth: "a".repeat(12),
          enabled: true,
          notification_preferences: { study_cafe: false },
        },
      ]);
    }
    if (String(url).includes("student_devices?student_id=eq.21002")) {
      return jsonResponse([{ student_id: "21002", device_token_hash: "active-device" }]);
    }
    throw new Error(`unexpected request: ${options.method} ${url}`);
  };

  const delivered = await sendStudyCafeIdleReleasePush({
    studentId: "21002",
    seatNumber: 3,
    releasedAt: "2026-09-09T06:15:00.000Z",
  });
  assert.deepEqual(delivered, { sentCount: 1 });
  assert.equal(requests.length, 2);
  assert.equal(sentNotifications.length, 1);
  assert.equal(sentNotifications[0].subscription.endpoint, "https://push.example.com/active");
  assert.equal(sentNotifications[0].payload.title, "좌석이 자동으로 비워졌습니다");
  assert.equal(sentNotifications[0].payload.body, "타이머가 15분 동안 정지되어 좌석 이용이 종료되었습니다.");
  assert.equal(sentNotifications[0].payload.url, "/#study-cafe");

  console.log("study cafe idle push tests passed");
})().finally(() => {
  global.fetch = originalFetch;
  for (const [key, value] of Object.entries({
    SUPABASE_URL: originalEnv.url,
    SUPABASE_SERVICE_ROLE_KEY: originalEnv.key,
    VAPID_SUBJECT: originalEnv.subject,
    VAPID_PUBLIC_KEY: originalEnv.publicKey,
    VAPID_PRIVATE_KEY: originalEnv.privateKey,
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
