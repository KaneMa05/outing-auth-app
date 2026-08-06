const crypto = require("crypto");
const webPush = require("web-push");
const {
  COOKIE_NAME,
  getConfig,
  getRequestIp,
  hasPermission,
  readCookie,
  readSessionToken,
} = require("./teacher-auth-utils");

const TABLE = "lecture_applications";
const PUSH_TABLE = "lecture_application_push_subscriptions";
const APPLICATION_COLUMNS = [
  "id",
  "name",
  "phone",
  "birth_date",
  "gender",
  "track",
  "referral_source",
  "referral_source_detail",
  "lecture_id",
  "status",
  "rejection_reason",
  "approved_student_id",
  "reviewed_at",
  "reviewed_by",
  "created_at",
  "updated_at",
].join(",");
const PUBLIC_STATUS_COLUMNS = [
  "id",
  "status",
  "rejection_reason",
  "approved_student_id",
  "reviewed_at",
  "created_at",
  "updated_at",
].join(",");
const REFERRAL_SOURCES = new Set(["naver_cafe", "referral", "youtube", "search", "other"]);
const PUBLIC_RATE_WINDOW_MS = 10 * 60 * 1000;
const PUBLIC_RATE_LIMIT = 5;
const publicAttempts = new Map();

module.exports = async function handler(req, res) {
  try {
    if (req.method === "POST") {
      const body = await readJson(req);
      if (!allowPublicApplication(getRequestIp(req))) {
        res.status(429).json({ ok: false, error: "too_many_requests" });
        return;
      }
      if (body.action === "status") {
        await handlePublicStatus(body, res);
        return;
      }
      if (body.action === "push-config") {
        handlePushConfig(res);
        return;
      }
      if (body.action === "subscribe" || body.action === "unsubscribe") {
        await handlePushSubscription(body, req, res);
        return;
      }
      const lookupToken = crypto.randomBytes(32).toString("base64url");
      const application = {
        ...normalizeApplication(body),
        lookup_token_hash: hashLookupToken(lookupToken),
      };
      const validationError = validateApplication(application);
      if (validationError) {
        res.status(400).json({ ok: false, error: validationError });
        return;
      }

      try {
        const rows = await requestSupabase("POST", TABLE, application, {
          Prefer: "return=representation",
        });
        res.status(201).json({
          ok: true,
          applicationId: rows?.[0]?.id || "",
          lookupToken,
          status: rows?.[0]?.status || "pending",
          submittedAt: rows?.[0]?.created_at || new Date().toISOString(),
        });
      } catch (error) {
        if (isDuplicateApplicationError(error)) {
          res.status(409).json({ ok: false, error: "duplicate_application" });
          return;
        }
        throw error;
      }
      return;
    }

    const session = readSession(req);
    if (!session) {
      res.status(401).json({ ok: false, error: "unauthorized" });
      return;
    }
    if (!hasPermission(session, "students.read")) {
      res.status(403).json({ ok: false, error: "forbidden" });
      return;
    }

    if (req.method === "GET") {
      const status = normalizeStatus(req.query?.status || "all");
      const statusFilter = status === "all" ? "" : `&status=eq.${encodeURIComponent(status)}`;
      const rows = await requestSupabase(
        "GET",
        `${TABLE}?select=${APPLICATION_COLUMNS}${statusFilter}&order=created_at.desc`
      );
      res.status(200).json({ ok: true, applications: rows || [] });
      return;
    }

    if (req.method === "PATCH") {
      const body = await readJson(req);
      const id = String(body.id || "").trim();
      const status = normalizeStatus(body.status);
      const rejectionReason = cleanText(body.rejectionReason, 300);
      if (!id || !["approved", "rejected"].includes(status)) {
        res.status(400).json({ ok: false, error: "invalid_review" });
        return;
      }
      if (status === "rejected" && !rejectionReason) {
        res.status(400).json({ ok: false, error: "rejection_reason_required" });
        return;
      }

      const payload = {
        status,
        rejection_reason: status === "rejected" ? rejectionReason : null,
        reviewed_by: session.username || "admin",
        reviewed_at: new Date().toISOString(),
      };
      const rows = await requestSupabase(
        "PATCH",
        `${TABLE}?id=eq.${encodeURIComponent(id)}&status=eq.pending&select=${APPLICATION_COLUMNS}`,
        payload,
        { Prefer: "return=representation" }
      );
      if (!rows?.length) {
        res.status(409).json({ ok: false, error: "application_already_reviewed" });
        return;
      }
      const notification = await sendReviewPushNotifications(rows[0]).catch((error) => {
        console.error("Failed to send lecture application review push", error);
        return { configured: true, sent: 0, failed: 1 };
      });
      res.status(200).json({ ok: true, application: rows[0], notification });
      return;
    }

    res.setHeader("Allow", "GET, POST, PATCH");
    res.status(405).json({ ok: false, error: "method_not_allowed" });
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ ok: false, error: error.publicCode || "lecture_application_store_error" });
  }
};

function handlePushConfig(res) {
  const publicKey = String(process.env.VAPID_PUBLIC_KEY || "").trim();
  res.status(200).json({
    ok: true,
    available: isPushConfigured(),
    publicKey: isPushConfigured() ? publicKey : "",
  });
}

async function handlePushSubscription(body, req, res) {
  const application = await findPublicApplication(body);
  if (!application) {
    res.status(404).json({ ok: false, error: "application_not_found" });
    return;
  }
  const subscription = normalizePushSubscription(body.subscription);
  if (!subscription) {
    res.status(400).json({ ok: false, error: "invalid_push_subscription" });
    return;
  }

  if (body.action === "unsubscribe") {
    await requestSupabase(
      "DELETE",
      `${PUSH_TABLE}?application_id=eq.${encodeURIComponent(application.id)}&endpoint=eq.${encodeURIComponent(subscription.endpoint)}`
    );
    res.status(200).json({ ok: true, subscribed: false });
    return;
  }
  if (!isPushConfigured()) {
    res.status(503).json({ ok: false, error: "push_not_configured" });
    return;
  }

  await requestSupabase(
    "POST",
    `${PUSH_TABLE}?on_conflict=application_id,endpoint`,
    {
      application_id: application.id,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      user_agent: cleanText(req.headers?.["user-agent"], 500) || null,
      updated_at: new Date().toISOString(),
    },
    { Prefer: "resolution=merge-duplicates,return=minimal" }
  );
  res.status(200).json({ ok: true, subscribed: true });
}

async function findPublicApplication(body) {
  const applicationId = String(body.applicationId || "").trim().toLowerCase();
  const lookupToken = String(body.lookupToken || "").trim();
  if (!isValidApplicationReceipt(applicationId, lookupToken)) return null;
  const rows = await requestSupabase(
    "GET",
    `${TABLE}?id=eq.${encodeURIComponent(applicationId)}&lookup_token_hash=eq.${encodeURIComponent(hashLookupToken(lookupToken))}&select=id,status&limit=1`
  );
  return rows?.[0] || null;
}

function normalizePushSubscription(value) {
  const endpoint = cleanText(value?.endpoint, 2048);
  const p256dh = cleanText(value?.keys?.p256dh, 512);
  const auth = cleanText(value?.keys?.auth, 512);
  if (!/^https:\/\//i.test(endpoint) || p256dh.length < 20 || auth.length < 8) return null;
  return { endpoint, keys: { p256dh, auth } };
}

function isPushConfigured() {
  return Boolean(
    String(process.env.VAPID_PUBLIC_KEY || "").trim()
    && String(process.env.VAPID_PRIVATE_KEY || "").trim()
    && String(process.env.VAPID_SUBJECT || "").trim()
  );
}

async function sendReviewPushNotifications(application) {
  if (!isPushConfigured()) return { configured: false, sent: 0, failed: 0 };
  const subscriptions = await requestSupabase(
    "GET",
    `${PUSH_TABLE}?application_id=eq.${encodeURIComponent(application.id)}&select=id,endpoint,p256dh,auth`
  );
  if (!subscriptions?.length) return { configured: true, sent: 0, failed: 0 };

  webPush.setVapidDetails(
    String(process.env.VAPID_SUBJECT).trim(),
    String(process.env.VAPID_PUBLIC_KEY).trim(),
    String(process.env.VAPID_PRIVATE_KEY).trim()
  );
  const approved = application.status === "approved";
  const payload = JSON.stringify({
    title: approved ? "인강생 등록이 승인되었습니다" : "인강생 등록 신청 결과가 도착했습니다",
    body: approved
      ? `등록번호 ${application.approved_student_id || ""}가 발급되었습니다. 앱에서 확인해주세요.`
      : "신청이 반려되었습니다. 앱에서 사유를 확인해주세요.",
    url: "/",
    tag: `lecture-application-${application.id}`,
  });
  let sent = 0;
  let failed = 0;
  await Promise.all(subscriptions.map(async (row) => {
    try {
      await webPush.sendNotification({
        endpoint: row.endpoint,
        keys: { p256dh: row.p256dh, auth: row.auth },
      }, payload, { TTL: 60 * 60 * 24 });
      sent += 1;
    } catch (error) {
      failed += 1;
      if (error?.statusCode === 404 || error?.statusCode === 410) {
        await requestSupabase("DELETE", `${PUSH_TABLE}?id=eq.${encodeURIComponent(row.id)}`).catch(() => {});
      } else {
        console.error("Lecture application push delivery failed", error?.statusCode || error?.message || error);
      }
    }
  }));
  return { configured: true, sent, failed };
}

async function handlePublicStatus(body, res) {
  const applicationId = String(body.applicationId || "").trim().toLowerCase();
  const lookupToken = String(body.lookupToken || "").trim();
  if (!isValidApplicationReceipt(applicationId, lookupToken)) {
    res.status(400).json({ ok: false, error: "invalid_application_receipt" });
    return;
  }
  const tokenHash = hashLookupToken(lookupToken);
  const rows = await requestSupabase(
    "GET",
    `${TABLE}?id=eq.${encodeURIComponent(applicationId)}&lookup_token_hash=eq.${encodeURIComponent(tokenHash)}&select=${PUBLIC_STATUS_COLUMNS}&limit=1`
  );
  if (!rows?.length) {
    res.status(404).json({ ok: false, error: "application_not_found" });
    return;
  }
  const application = rows[0];
  res.status(200).json({
    ok: true,
    application: {
      applicationId: application.id,
      status: application.status || "pending",
      rejectionReason: application.rejection_reason || "",
      approvedStudentId: application.approved_student_id || "",
      reviewedAt: application.reviewed_at || "",
      submittedAt: application.created_at || "",
      updatedAt: application.updated_at || application.created_at || "",
    },
  });
}

function isValidApplicationReceipt(applicationId, lookupToken) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(applicationId)
    && lookupToken.length >= 32;
}

function hashLookupToken(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function readSession(req) {
  const { secret } = getConfig();
  return readSessionToken(readCookie(req, COOKIE_NAME), secret);
}

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16 * 1024) {
      const error = new Error("payload_too_large");
      error.status = 413;
      error.publicCode = "payload_too_large";
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    const error = new Error("invalid_json");
    error.status = 400;
    error.publicCode = "invalid_json";
    throw error;
  }
}

function normalizeApplication(body) {
  const phone = cleanText(body.phone, 20);
  const lectureId = cleanText(body.lectureId, 80);
  return {
    name: cleanText(body.name, 40),
    phone,
    phone_normalized: phone.replace(/\D/g, ""),
    birth_date: cleanText(body.birthDate, 10),
    gender: cleanText(body.gender, 2),
    track: cleanText(body.track, 100),
    referral_source: cleanText(body.referralSource, 30),
    referral_source_detail: cleanText(body.referralSourceDetail, 100) || null,
    lecture_id: lectureId,
    lecture_id_normalized: lectureId.normalize("NFKC").toLowerCase().replace(/\s+/g, ""),
    privacy_consent_at: body.privacyConsent === true ? new Date().toISOString() : null,
  };
}

function validateApplication(application) {
  if (application.name.length < 2) return "invalid_name";
  if (!/^01[0-9]{8,9}$/.test(application.phone_normalized)) return "invalid_phone";
  if (!isValidBirthDate(application.birth_date)) return "invalid_birth_date";
  if (!["남", "여"].includes(application.gender)) return "invalid_gender";
  if (!application.track) return "invalid_track";
  if (!REFERRAL_SOURCES.has(application.referral_source)) return "invalid_referral_source";
  if (application.referral_source === "other" && !application.referral_source_detail) return "referral_detail_required";
  if (application.lecture_id_normalized.length < 2) return "invalid_lecture_id";
  if (!application.privacy_consent_at) return "privacy_consent_required";
  return "";
}

function isValidBirthDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value && value >= "1900-01-01" && value <= new Date().toISOString().slice(0, 10);
}

function normalizeStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  return ["all", "pending", "approved", "rejected", "cancelled"].includes(status) ? status : "all";
}

function cleanText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function allowPublicApplication(ip) {
  const key = String(ip || "unknown");
  const now = Date.now();
  const recent = (publicAttempts.get(key) || []).filter((time) => now - time < PUBLIC_RATE_WINDOW_MS);
  if (recent.length >= PUBLIC_RATE_LIMIT) return false;
  recent.push(now);
  publicAttempts.set(key, recent);
  return true;
}

function isDuplicateApplicationError(error) {
  const details = `${error?.message || ""} ${error?.details || ""}`;
  return details.includes("23505") || details.includes("lecture_applications_active_phone_idx") || details.includes("lecture_applications_active_lecture_id_idx");
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
    error.details = details;
    error.status = 502;
    throw error;
  }
  if (!details) return null;
  return JSON.parse(details);
}

module.exports._private = {
  hashLookupToken,
  isPushConfigured,
  isValidBirthDate,
  normalizePushSubscription,
  normalizeApplication,
  normalizeStatus,
  validateApplication,
};
