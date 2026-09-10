const webPush = require("web-push");

const SUBSCRIPTIONS_TABLE = "student_push_subscriptions";

async function sendStudyCafeIdleReleasePush({ studentId, releasedAt } = {}) {
  const normalizedStudentId = String(studentId || "").trim();
  if (!normalizedStudentId) return { sentCount: 0, skipped: "missing_student_id" };
  if (!isPushConfigured()) {
    return { sentCount: 0, skipped: "push_not_configured" };
  }

  try {
    const [subscriptions, activeDevices] = await Promise.all([
      requestSupabase(
        "GET",
        `${SUBSCRIPTIONS_TABLE}?student_id=eq.${encodeURIComponent(normalizedStudentId)}&select=id,student_id,device_token_hash,endpoint,p256dh,auth,enabled,notification_preferences`
      ),
      requestSupabase(
        "GET",
        `student_devices?student_id=eq.${encodeURIComponent(normalizedStudentId)}&revoked_at=is.null&select=student_id,device_token_hash`
      ),
    ]);
    const activeDeviceHashes = new Set(
      (Array.isArray(activeDevices) ? activeDevices : []).map((row) => row.device_token_hash)
    );
    const subscriptionsByEndpoint = new Map();
    (Array.isArray(subscriptions) ? subscriptions : []).forEach((subscription) => {
      if (
        subscription.student_id === normalizedStudentId
        && subscription.enabled !== false
        && subscription.notification_preferences?.study_cafe !== false
        && activeDeviceHashes.has(subscription.device_token_hash)
        && subscription.endpoint
        && !subscriptionsByEndpoint.has(subscription.endpoint)
      ) {
        subscriptionsByEndpoint.set(subscription.endpoint, subscription);
      }
    });

    const deliverySubscriptions = [...subscriptionsByEndpoint.values()];
    if (!deliverySubscriptions.length) {
      return { sentCount: 0, skipped: "no_active_subscription" };
    }

    configureWebPush();
    const notificationTargetKey = normalizedStudentId.replace(/[^0-9A-Za-z_-]/g, "").slice(0, 64);
    const releaseKey = String(releasedAt || new Date().toISOString()).replace(/[^0-9A-Za-z]/g, "").slice(0, 32);
    const payload = JSON.stringify({
      title: "좌석이 자동으로 비워졌습니다",
      body: "타이머가 15분 동안 정지되어 좌석 이용이 종료되었습니다.",
      url: "/#study-cafe",
      tag: `study-cafe-idle-release-${notificationTargetKey}-${releaseKey}`,
    });
    const results = await Promise.all(
      deliverySubscriptions.map((subscription) => sendOneNotification(subscription, payload))
    );
    return { sentCount: results.filter((result) => result.sent).length };
  } catch (error) {
    console.warn("Study cafe idle release push failed.", error?.message || error);
    return { sentCount: 0, skipped: "delivery_failed" };
  }
}

async function sendOneNotification(subscription, payload) {
  try {
    await webPush.sendNotification({
      endpoint: subscription.endpoint,
      keys: { p256dh: subscription.p256dh, auth: subscription.auth },
    }, payload, { TTL: 60 * 60 });
    return { sent: true };
  } catch (error) {
    if (error?.statusCode === 404 || error?.statusCode === 410) {
      await requestSupabase(
        "DELETE",
        `${SUBSCRIPTIONS_TABLE}?id=eq.${encodeURIComponent(subscription.id)}`
      ).catch(() => {});
    } else {
      console.warn("Study cafe idle release push delivery failed.", error?.statusCode || error?.message || error);
    }
    return { sent: false };
  }
}

function isPushConfigured() {
  return Boolean(
    process.env.VAPID_SUBJECT
    && process.env.VAPID_PUBLIC_KEY
    && process.env.VAPID_PRIVATE_KEY
  );
}

function configureWebPush() {
  webPush.setVapidDetails(
    String(process.env.VAPID_SUBJECT).trim(),
    String(process.env.VAPID_PUBLIC_KEY).trim(),
    String(process.env.VAPID_PRIVATE_KEY).trim()
  );
}

async function requestSupabase(method, path) {
  const supabaseUrl = process.env.SUPABASE_URL || "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!supabaseUrl || !serviceRoleKey) throw new Error("service_role_not_configured");
  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) throw new Error(`supabase_${response.status}`);
  if (response.status === 204) return null;
  return response.json().catch(() => null);
}

module.exports = {
  sendStudyCafeIdleReleasePush,
};
