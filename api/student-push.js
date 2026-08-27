const crypto = require("crypto");
const webPush = require("web-push");
const {
  COOKIE_NAME,
  getConfig,
  hasPermission,
  readCookie,
  readSessionToken,
} = require("./teacher-auth-utils");

const SUBSCRIPTIONS_TABLE = "student_push_subscriptions";
const MESSAGES_TABLE = "student_push_messages";
const MAX_TARGET_STUDENTS = 1000;
const SEND_BATCH_SIZE = 50;
const PUSH_PREFERENCE_KEYS = ["admin", "study", "study_cafe", "question_board"];
const DEFAULT_PUSH_PREFERENCES = Object.freeze(Object.fromEntries(PUSH_PREFERENCE_KEYS.map((key) => [key, true])));

module.exports = async function handler(req, res) {
  try {
    if (req.method === "POST") {
      const body = await readJson(req);
      const action = normalizeText(body.action, 30);
      if (action === "config") return handleConfig(res);
      if (action === "inbox") {
        await handleStudentInbox(body, req, res);
        return;
      }
      if (["status", "subscribe", "unsubscribe", "preferences"].includes(action)) {
        await handleStudentSubscription(action, body, req, res);
        return;
      }
      if (action === "send") {
        await handleAdminSend(body, req, res);
        return;
      }
      res.status(400).json({ ok: false, error: "unsupported_action" });
      return;
    }

    if (req.method === "GET") {
      const session = requirePushAdmin(req, res);
      if (!session) return;
      const [messages, subscriptions, activeDevices] = await Promise.all([
        requestSupabase("GET", `${MESSAGES_TABLE}?select=id,title,body,target_type,target_category,target_student_ids,target_count,subscribed_count,sent_count,failed_count,created_by,created_at&order=created_at.desc&limit=20`),
        requestSupabase("GET", `${SUBSCRIPTIONS_TABLE}?select=student_id,device_token_hash,enabled,notification_preferences`),
        requestSupabase("GET", "student_devices?revoked_at=is.null&select=student_id,device_token_hash"),
      ]);
      const activeDeviceKeys = new Set((activeDevices || []).map((row) => `${row.student_id}:${row.device_token_hash}`));
      const subscribedStudentIds = [...new Set((subscriptions || [])
        .filter((row) => row.enabled !== false && normalizePushPreferences(row.notification_preferences).admin && activeDeviceKeys.has(`${row.student_id}:${row.device_token_hash}`))
        .map((row) => String(row.student_id || ""))
        .filter(Boolean))];
      res.status(200).json({ ok: true, messages: messages || [], subscribedStudentIds });
      return;
    }

    res.setHeader("Allow", "GET, POST");
    res.status(405).json({ ok: false, error: "method_not_allowed" });
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ ok: false, error: error.publicCode || "student_push_error" });
  }
};

function handleConfig(res) {
  res.status(200).json({
    ok: true,
    available: isPushConfigured(),
    publicKey: isPushConfigured() ? String(process.env.VAPID_PUBLIC_KEY || "").trim() : "",
  });
}

async function handleStudentInbox(body, req, res) {
  const studentId = normalizeText(body.studentId, 64);
  const deviceToken = normalizeText(body.deviceToken, 256);
  if (!studentId || !deviceToken) {
    res.status(400).json({ ok: false, error: "missing_required_fields" });
    return;
  }
  const validation = await validateStudentDevice(studentId, hashDeviceToken(deviceToken), req);
  if (validation?.error || validation?.valid !== true) {
    res.status(403).json({ ok: false, error: "device_not_active" });
    return;
  }
  const students = await requestSupabase(
    "GET",
    `students?id=eq.${encodeURIComponent(studentId)}&is_active=eq.true&select=id,student_category&limit=1`
  );
  const student = students?.[0];
  if (!student) {
    res.status(404).json({ ok: false, error: "student_not_found" });
    return;
  }
  const rows = await requestSupabase(
    "GET",
    `${MESSAGES_TABLE}?select=id,title,body,target_type,target_category,target_student_ids,created_at&order=created_at.desc&limit=100`
  );
  const messages = (rows || [])
    .filter((message) => isMessageForStudent(message, studentId, student.student_category))
    .slice(0, 50)
    .map((message) => ({
      id: message.id,
      title: message.title || "알림",
      body: message.body || "",
      createdAt: message.created_at,
    }));
  res.status(200).json({ ok: true, messages });
}

function isMessageForStudent(message, studentId, studentCategory) {
  if (message?.target_type === "all") return true;
  if (message?.target_type === "category") return message.target_category === studentCategory;
  if (message?.target_type !== "students") return false;
  return Array.isArray(message.target_student_ids)
    && message.target_student_ids.map(String).includes(String(studentId));
}

async function handleStudentSubscription(action, body, req, res) {
  const studentId = normalizeText(body.studentId, 64);
  const deviceToken = normalizeText(body.deviceToken, 256);
  if (!studentId || !deviceToken) {
    res.status(400).json({ ok: false, error: "missing_required_fields" });
    return;
  }
  const deviceTokenHash = hashDeviceToken(deviceToken);
  const validation = await validateStudentDevice(studentId, deviceTokenHash, req);
  if (validation?.error || validation?.valid !== true) {
    res.status(403).json({ ok: false, error: "device_not_active" });
    return;
  }
  const subscription = normalizePushSubscription(body.subscription);
  if (!subscription) {
    res.status(400).json({ ok: false, error: "invalid_push_subscription" });
    return;
  }

  if (action === "status") {
    const rows = await requestSupabase(
      "GET",
      `${SUBSCRIPTIONS_TABLE}?student_id=eq.${encodeURIComponent(studentId)}&device_token_hash=eq.${deviceTokenHash}&endpoint=eq.${encodeURIComponent(subscription.endpoint)}&select=id,enabled,notification_preferences&limit=1`
    );
    res.status(200).json({
      ok: true,
      subscribed: Boolean(rows?.length && rows[0].enabled !== false),
      preferences: normalizePushPreferences(rows?.[0]?.notification_preferences),
    });
    return;
  }
  if (action === "unsubscribe") {
    await requestSupabase(
      "PATCH",
      `${SUBSCRIPTIONS_TABLE}?student_id=eq.${encodeURIComponent(studentId)}&device_token_hash=eq.${deviceTokenHash}&endpoint=eq.${encodeURIComponent(subscription.endpoint)}`,
      { enabled: false, updated_at: new Date().toISOString() },
      { Prefer: "return=minimal" }
    );
    res.status(200).json({ ok: true, subscribed: false });
    return;
  }
  if (action === "preferences") {
    const preferences = normalizePushPreferences(body.preferences);
    await requestSupabase(
      "PATCH",
      `${SUBSCRIPTIONS_TABLE}?student_id=eq.${encodeURIComponent(studentId)}&device_token_hash=eq.${deviceTokenHash}&endpoint=eq.${encodeURIComponent(subscription.endpoint)}`,
      { notification_preferences: preferences, updated_at: new Date().toISOString() },
      { Prefer: "return=minimal" }
    );
    res.status(200).json({ ok: true, preferences });
    return;
  }
  if (!isPushConfigured()) {
    res.status(503).json({ ok: false, error: "push_not_configured" });
    return;
  }

  await requestSupabase(
    "POST",
    `${SUBSCRIPTIONS_TABLE}?on_conflict=student_id,endpoint`,
    {
      student_id: studentId,
      device_token_hash: deviceTokenHash,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      enabled: true,
      notification_preferences: normalizePushPreferences(body.preferences),
      user_agent: normalizeText(req.headers?.["user-agent"], 500) || null,
      updated_at: new Date().toISOString(),
    },
    { Prefer: "resolution=merge-duplicates,return=minimal" }
  );
  res.status(200).json({ ok: true, subscribed: true, preferences: normalizePushPreferences(body.preferences) });
}

async function handleAdminSend(body, req, res) {
  const session = requirePushAdmin(req, res);
  if (!session) return;
  if (!isPushConfigured()) {
    res.status(503).json({ ok: false, error: "push_not_configured" });
    return;
  }
  const title = normalizeText(body.title, 80);
  const messageBody = normalizeText(body.body, 300);
  const targetType = normalizeTargetType(body.targetType);
  const targetCategory = targetType === "category" ? normalizeCategory(body.targetCategory) : "";
  const requestedStudentIds = normalizeStudentIds(body.studentIds);
  if (!title || !messageBody || !targetType || (targetType === "category" && !targetCategory) || (targetType === "students" && !requestedStudentIds.length)) {
    res.status(400).json({ ok: false, error: "invalid_message" });
    return;
  }

  const students = await loadTargetStudents(targetType, targetCategory, requestedStudentIds);
  if (!students.length) {
    res.status(400).json({ ok: false, error: "no_target_students" });
    return;
  }
  if (students.length > MAX_TARGET_STUDENTS) {
    res.status(400).json({ ok: false, error: "too_many_targets" });
    return;
  }
  const studentIds = students.map((student) => student.id);
  const [subscriptions, activeDevices] = await Promise.all([
    loadRowsByStudentIds(SUBSCRIPTIONS_TABLE, "id,student_id,device_token_hash,endpoint,p256dh,auth,enabled,notification_preferences", studentIds),
    loadActiveDevicesByStudentIds(studentIds),
  ]);
  const activeDeviceKeys = new Set(activeDevices.map((row) => `${row.student_id}:${row.device_token_hash}`));
  const activeSubscriptions = (subscriptions || []).filter((row) =>
    row.enabled !== false
    && normalizePushPreferences(row.notification_preferences).admin
    && activeDeviceKeys.has(`${row.student_id}:${row.device_token_hash}`)
  );
  const subscriptionsByEndpoint = new Map();
  activeSubscriptions.forEach((row) => {
    if (row.endpoint && !subscriptionsByEndpoint.has(row.endpoint)) subscriptionsByEndpoint.set(row.endpoint, row);
  });
  const deliverySubscriptions = [...subscriptionsByEndpoint.values()];
  const subscribedStudentCount = new Set(activeSubscriptions.map((row) => row.student_id)).size;

  const inserted = await requestSupabase(
    "POST",
    MESSAGES_TABLE,
    {
      title,
      body: messageBody,
      target_type: targetType,
      target_category: targetCategory || null,
      target_student_ids: targetType === "students" ? studentIds : [],
      target_count: students.length,
      subscribed_count: subscribedStudentCount,
      sent_count: 0,
      failed_count: 0,
      created_by: session.username || "admin",
    },
    { Prefer: "return=representation" }
  );
  const messageId = inserted?.[0]?.id || crypto.randomUUID();
  const payload = JSON.stringify({
    title,
    body: messageBody,
    url: "/#home",
    tag: `student-message-${messageId}`,
  });
  configureWebPush();
  let sentCount = 0;
  let failedCount = 0;
  for (const batch of chunkArray(deliverySubscriptions, SEND_BATCH_SIZE)) {
    const results = await Promise.all(batch.map((subscription) => sendOneNotification(subscription, payload)));
    results.forEach((result) => {
      if (result.sent) sentCount += 1;
      else failedCount += 1;
    });
  }
  await requestSupabase(
    "PATCH",
    `${MESSAGES_TABLE}?id=eq.${encodeURIComponent(messageId)}`,
    { sent_count: sentCount, failed_count: failedCount },
    { Prefer: "return=minimal" }
  );
  res.status(200).json({
    ok: true,
    messageId,
    targetCount: students.length,
    subscribedStudentCount,
    sentCount,
    failedCount,
  });
}

async function sendOneNotification(subscription, payload) {
  try {
    await webPush.sendNotification({
      endpoint: subscription.endpoint,
      keys: { p256dh: subscription.p256dh, auth: subscription.auth },
    }, payload, { TTL: 60 * 60 * 24 });
    return { sent: true };
  } catch (error) {
    if (error?.statusCode === 404 || error?.statusCode === 410) {
      await requestSupabase("DELETE", `${SUBSCRIPTIONS_TABLE}?id=eq.${encodeURIComponent(subscription.id)}`).catch(() => {});
    } else {
      console.error("Student push delivery failed", error?.statusCode || error?.message || error);
    }
    return { sent: false };
  }
}

async function loadTargetStudents(targetType, targetCategory, studentIds) {
  const select = "id,name,student_category";
  if (targetType === "all") {
    return requestSupabase("GET", `students?is_active=eq.true&select=${select}&order=id.asc`);
  }
  if (targetType === "category") {
    return requestSupabase("GET", `students?is_active=eq.true&student_category=eq.${encodeURIComponent(targetCategory)}&select=${select}&order=id.asc`);
  }
  const rows = [];
  for (const batch of chunkArray(studentIds, 100)) {
    const values = batch.map(encodePostgrestValue).join(",");
    const result = await requestSupabase("GET", `students?is_active=eq.true&id=in.(${values})&select=${select}&order=id.asc`);
    rows.push(...(result || []));
  }
  return rows;
}

async function loadRowsByStudentIds(table, select, studentIds, extra = "") {
  const rows = [];
  for (const batch of chunkArray(studentIds, 100)) {
    const values = batch.map(encodePostgrestValue).join(",");
    const result = await requestSupabase("GET", `${table}?student_id=in.(${values})${extra}&select=${select}`);
    rows.push(...(result || []));
  }
  return rows;
}

function loadActiveDevicesByStudentIds(studentIds) {
  return loadRowsByStudentIds("student_devices", "student_id,device_token_hash", studentIds, "&revoked_at=is.null");
}

async function validateStudentDevice(studentId, deviceTokenHash, req) {
  return requestSupabase("POST", "rpc/validate_student_device", {
    p_student_id: studentId,
    p_device_token_hash: deviceTokenHash,
    p_client_display_mode: normalizeText(req.headers?.["sec-ch-ua-mobile"], 40) || null,
    p_client_user_agent: normalizeText(req.headers?.["user-agent"], 500) || null,
  });
}

function requirePushAdmin(req, res) {
  const { secret } = getConfig();
  const session = readSessionToken(readCookie(req, COOKIE_NAME), secret);
  if (!session) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return null;
  }
  if (!hasPermission(session, "notices.write")) {
    res.status(403).json({ ok: false, error: "forbidden" });
    return null;
  }
  return session;
}

function normalizePushSubscription(value) {
  const endpoint = normalizeText(value?.endpoint, 2048);
  const p256dh = normalizeText(value?.keys?.p256dh, 512);
  const auth = normalizeText(value?.keys?.auth, 512);
  if (!/^https:\/\//i.test(endpoint) || p256dh.length < 20 || auth.length < 8) return null;
  return { endpoint, keys: { p256dh, auth } };
}

function normalizeTargetType(value) {
  const type = normalizeText(value, 20);
  return ["all", "category", "students"].includes(type) ? type : "";
}

function normalizeCategory(value) {
  const category = normalizeText(value, 30);
  return ["offline", "online_managed", "lecture"].includes(category) ? category : "";
}

function normalizeStudentIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => normalizeText(item, 64)).filter((item) => /^[0-9A-Za-z_-]{1,64}$/.test(item)))].slice(0, MAX_TARGET_STUDENTS);
}

function normalizePushPreferences(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return Object.fromEntries(PUSH_PREFERENCE_KEYS.map((key) => [key, source[key] !== false]));
}

function normalizeText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function hashDeviceToken(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function isPushConfigured() {
  return Boolean(process.env.VAPID_SUBJECT && process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

function configureWebPush() {
  webPush.setVapidDetails(
    String(process.env.VAPID_SUBJECT).trim(),
    String(process.env.VAPID_PUBLIC_KEY).trim(),
    String(process.env.VAPID_PRIVATE_KEY).trim()
  );
}

function chunkArray(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

function encodePostgrestValue(value) {
  return encodeURIComponent(String(value).replace(/[^0-9A-Za-z_-]/g, ""));
}

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 64 * 1024) {
      const error = new Error("payload_too_large");
      error.status = 413;
      error.publicCode = "payload_too_large";
      throw error;
    }
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function requestSupabase(method, path, body, extraHeaders = {}) {
  const supabaseUrl = process.env.SUPABASE_URL || "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!supabaseUrl || !serviceRoleKey) {
    const error = new Error("service_role_not_configured");
    error.status = 503;
    error.publicCode = "service_role_not_configured";
    throw error;
  }
  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const details = await response.text().catch(() => "");
  if (!response.ok) {
    const error = new Error(`supabase_${response.status}${details ? `: ${details}` : ""}`);
    error.status = 502;
    throw error;
  }
  return details ? JSON.parse(details) : null;
}

module.exports._private = {
  hashDeviceToken,
  normalizeCategory,
  normalizePushSubscription,
  normalizeStudentIds,
  normalizeTargetType,
  normalizePushPreferences,
};
