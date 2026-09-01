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
const PHONE_VERIFICATION_TABLE = "phone_verification_challenges";
const SETTINGS_NOTICE_ID = "__app_settings__";
const APPLICATION_COLUMNS = [
  "id",
  "name",
  "phone",
  "birth_date",
  "gender",
  "track",
  "course_type",
  "cohort",
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
const COURSE_TYPES = new Set(["offline", "online_managed", "lecture"]);
const MANUAL_REGISTRATION_COURSE_TYPES = new Set(["offline", "online_managed"]);
const PUBLIC_RATE_WINDOW_MS = 10 * 60 * 1000;
const PUBLIC_RATE_LIMIT = 5;
const PHONE_VERIFICATION_REQUEST_LIMIT = 5;
const PHONE_VERIFICATION_CHECK_LIMIT = 10;
const PHONE_VERIFICATION_TOKEN_TTL_MS = 10 * 60 * 1000;
const PHONE_VERIFICATION_CODE_TTL_SECONDS = 3 * 60;
const PHONE_VERIFICATION_MAX_ATTEMPTS = 5;
const publicAttempts = new Map();

module.exports = async function handler(req, res) {
  try {
    if (req.method === "POST") {
      const body = await readJson(req);
      const requestIp = getRequestIp(req);
      if (body.action === "request-phone-verification") {
        if (!allowPublicRequest(`phone-request:${requestIp}`, PHONE_VERIFICATION_REQUEST_LIMIT)) {
          res.status(429).json({ ok: false, error: "too_many_requests" });
          return;
        }
        if (!await isPhoneVerificationEnabled()) {
          res.status(403).json({ ok: false, error: "phone_verification_disabled" });
          return;
        }
        await handlePhoneVerificationRequest(body, res);
        return;
      }
      if (body.action === "verify-phone") {
        if (!allowPublicRequest(`phone-check:${requestIp}`, PHONE_VERIFICATION_CHECK_LIMIT)) {
          res.status(429).json({ ok: false, error: "too_many_verification_attempts" });
          return;
        }
        if (!await isPhoneVerificationEnabled()) {
          res.status(403).json({ ok: false, error: "phone_verification_disabled" });
          return;
        }
        await handlePhoneVerificationCheck(body, res);
        return;
      }
      if (!allowPublicRequest(`application:${requestIp}`, PUBLIC_RATE_LIMIT)) {
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
      const phoneVerificationRequired = await isPhoneVerificationEnabled();
      if (phoneVerificationRequired && !validatePhoneVerificationToken(body.phoneVerificationToken, application.phone_normalized)) {
        res.status(400).json({ ok: false, error: "phone_verification_required" });
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
      const registrationNumber = cleanText(body.registrationNumber, 30);
      const cohort = cleanText(body.cohort, 3);
      if (!id || !["approved", "rejected"].includes(status)) {
        res.status(400).json({ ok: false, error: "invalid_review" });
        return;
      }
      if (status === "rejected" && !rejectionReason) {
        res.status(400).json({ ok: false, error: "rejection_reason_required" });
        return;
      }

      let pendingApplication = null;
      if (status === "approved") {
        const pendingRows = await requestSupabase(
          "GET",
          `${TABLE}?id=eq.${encodeURIComponent(id)}&status=eq.pending&select=id,course_type&limit=1`
        );
        pendingApplication = pendingRows?.[0] || null;
        if (!pendingApplication) {
          res.status(409).json({ ok: false, error: "application_already_reviewed" });
          return;
        }
        if (MANUAL_REGISTRATION_COURSE_TYPES.has(pendingApplication.course_type)) {
          if (!isValidCohort(cohort)) {
            res.status(400).json({ ok: false, error: "invalid_cohort" });
            return;
          }
          if (!registrationNumber) {
            res.status(400).json({ ok: false, error: "registration_number_required" });
            return;
          }
          if (!isRegistrationNumberForCohort(registrationNumber, cohort)) {
            res.status(400).json({ ok: false, error: "registration_number_cohort_mismatch" });
            return;
          }
        }
      }

      const payload = {
        status,
        rejection_reason: status === "rejected" ? rejectionReason : null,
        approved_student_id: status === "approved" && MANUAL_REGISTRATION_COURSE_TYPES.has(pendingApplication?.course_type)
          ? registrationNumber
          : null,
        cohort: status === "approved" && MANUAL_REGISTRATION_COURSE_TYPES.has(pendingApplication?.course_type)
          ? Number(cohort)
          : null,
        reviewed_by: session.username || "admin",
        reviewed_at: new Date().toISOString(),
      };
      let rows;
      try {
        rows = await requestSupabase(
          "PATCH",
          `${TABLE}?id=eq.${encodeURIComponent(id)}&status=eq.pending&select=${APPLICATION_COLUMNS}`,
          payload,
          { Prefer: "return=representation" }
        );
      } catch (error) {
        if (isRegistrationNumberInUseError(error)) {
          res.status(409).json({ ok: false, error: "registration_number_in_use" });
          return;
        }
        throw error;
      }
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
    title: approved ? "수강생 등록이 승인되었습니다" : "수강생 등록 신청 결과가 도착했습니다",
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
    course_type: cleanText(body.courseType || "lecture", 30),
    referral_source: cleanText(body.referralSource, 30),
    referral_source_detail: cleanText(body.referralSourceDetail, 100) || null,
    lecture_id: lectureId || null,
    lecture_id_normalized: lectureId ? lectureId.normalize("NFKC").toLowerCase().replace(/\s+/g, "") : null,
    privacy_consent_at: body.privacyConsent === true ? new Date().toISOString() : null,
    terms_consent_at: body.termsConsent === true ? new Date().toISOString() : null,
  };
}

function validateApplication(application) {
  if (application.name.length < 2) return "invalid_name";
  if (!/^01[0-9]{8,9}$/.test(application.phone_normalized)) return "invalid_phone";
  if (!isValidBirthDate(application.birth_date)) return "invalid_birth_date";
  if (!["남", "여"].includes(application.gender)) return "invalid_gender";
  if (!application.track) return "invalid_track";
  if (!COURSE_TYPES.has(application.course_type)) return "invalid_course_type";
  if (!REFERRAL_SOURCES.has(application.referral_source)) return "invalid_referral_source";
  if (application.referral_source === "other" && !application.referral_source_detail) return "referral_detail_required";
  if (application.course_type === "lecture" && String(application.lecture_id_normalized || "").length < 2) return "invalid_lecture_id";
  if (!application.privacy_consent_at) return "privacy_consent_required";
  if (!application.terms_consent_at) return "terms_consent_required";
  return "";
}

function isValidBirthDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value && value >= "1900-01-01" && value <= new Date().toISOString().slice(0, 10);
}

function isValidCohort(value) {
  return /^\d{1,2}$/.test(String(value || "").trim())
    && Number(value) >= 1
    && Number(value) <= 99;
}

function isRegistrationNumberForCohort(registrationNumber, cohort) {
  const normalizedCohort = String(cohort || "").trim();
  const value = String(registrationNumber || "").trim();
  if (!isValidCohort(normalizedCohort) || !value.startsWith(normalizedCohort)) return false;
  const suffix = value.slice(normalizedCohort.length);
  return /^\d{3}$/.test(suffix) && Number(suffix) >= 1;
}

function normalizeStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  return ["all", "pending", "approved", "rejected", "cancelled"].includes(status) ? status : "all";
}

function cleanText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function allowPublicRequest(identifier, limit, windowMs = PUBLIC_RATE_WINDOW_MS) {
  const key = String(identifier || "unknown");
  const now = Date.now();
  const recent = (publicAttempts.get(key) || []).filter((time) => now - time < windowMs);
  if (recent.length >= limit) return false;
  recent.push(now);
  publicAttempts.set(key, recent);
  return true;
}

async function isPhoneVerificationEnabled() {
  const rows = await requestSupabase(
    "GET",
    `notices?id=eq.${encodeURIComponent(SETTINGS_NOTICE_ID)}&select=body&limit=1`
  );
  const body = Array.isArray(rows) && rows[0]?.body ? rows[0].body : "{}";
  try {
    return JSON.parse(body).phoneVerificationEnabled === true;
  } catch {
    return false;
  }
}

async function handlePhoneVerificationRequest(body, res) {
  const phone = normalizePhone(body.phone);
  if (!isValidPhone(phone)) {
    res.status(400).json({ ok: false, error: "invalid_phone" });
    return;
  }
  const phoneHash = hashPhoneVerificationValue("phone", phone);
  const recentSince = new Date(Date.now() - PUBLIC_RATE_WINDOW_MS).toISOString();
  const recentRows = await requestSupabase(
    "GET",
    `${PHONE_VERIFICATION_TABLE}?phone_hash=eq.${phoneHash}&created_at=gte.${encodeURIComponent(recentSince)}&select=id&order=created_at.desc&limit=${PHONE_VERIFICATION_REQUEST_LIMIT}`
  );
  if (Array.isArray(recentRows) && recentRows.length >= PHONE_VERIFICATION_REQUEST_LIMIT) {
    res.status(429).json({ ok: false, error: "too_many_requests" });
    return;
  }

  const requestId = crypto.randomUUID();
  const authNumber = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  const expiresAt = new Date(Date.now() + PHONE_VERIFICATION_CODE_TTL_SECONDS * 1000).toISOString();
  await requestSupabase("POST", PHONE_VERIFICATION_TABLE, {
    id: requestId,
    phone_hash: phoneHash,
    code_hash: hashPhoneVerificationValue("code", requestId, phone, authNumber),
    expires_at: expiresAt,
    max_attempts: PHONE_VERIFICATION_MAX_ATTEMPTS,
  });
  try {
    await sendSolapiVerificationMessage(phone, authNumber);
  } catch (error) {
    await requestSupabase("DELETE", `${PHONE_VERIFICATION_TABLE}?id=eq.${encodeURIComponent(requestId)}`).catch(() => {});
    throw error;
  }
  res.status(200).json({
    ok: true,
    requestId,
    expiresInSeconds: PHONE_VERIFICATION_CODE_TTL_SECONDS,
  });
}

async function handlePhoneVerificationCheck(body, res) {
  const phone = normalizePhone(body.phone);
  const requestId = cleanText(body.requestId, 100);
  const authNumber = cleanText(body.authNumber, 6);
  if (!isValidPhone(phone)) {
    res.status(400).json({ ok: false, error: "invalid_phone" });
    return;
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId) || !/^\d{6}$/.test(authNumber)) {
    res.status(400).json({ ok: false, error: "invalid_verification_code" });
    return;
  }
  const rows = await requestSupabase(
    "GET",
    `${PHONE_VERIFICATION_TABLE}?id=eq.${encodeURIComponent(requestId)}&select=id,phone_hash,code_hash,expires_at,attempts,max_attempts,verified_at&limit=1`
  );
  const challenge = Array.isArray(rows) ? rows[0] : null;
  const attempts = Number(challenge?.attempts || 0);
  const maxAttempts = Number(challenge?.max_attempts || PHONE_VERIFICATION_MAX_ATTEMPTS);
  const validChallenge = challenge
    && challenge.phone_hash === hashPhoneVerificationValue("phone", phone)
    && !challenge.verified_at
    && new Date(challenge.expires_at).getTime() > Date.now();
  if (!validChallenge) {
    res.status(400).json({ ok: false, error: "invalid_or_expired_verification_code" });
    return;
  }
  if (attempts >= maxAttempts) {
    res.status(429).json({ ok: false, error: "too_many_verification_attempts" });
    return;
  }

  const submittedHash = hashPhoneVerificationValue("code", requestId, phone, authNumber);
  if (!safeEqualText(submittedHash, challenge.code_hash)) {
    const updatedAttempts = attempts + 1;
    await requestSupabase(
      "PATCH",
      `${PHONE_VERIFICATION_TABLE}?id=eq.${encodeURIComponent(requestId)}&attempts=eq.${attempts}&verified_at=is.null`,
      { attempts: updatedAttempts, updated_at: new Date().toISOString() }
    );
    res.status(updatedAttempts >= maxAttempts ? 429 : 400).json({
      ok: false,
      error: updatedAttempts >= maxAttempts
        ? "too_many_verification_attempts"
        : "invalid_or_expired_verification_code",
    });
    return;
  }

  const verifiedRows = await requestSupabase(
    "PATCH",
    `${PHONE_VERIFICATION_TABLE}?id=eq.${encodeURIComponent(requestId)}&attempts=eq.${attempts}&verified_at=is.null`,
    { verified_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { Prefer: "return=representation" }
  );
  if (!Array.isArray(verifiedRows) || !verifiedRows.length) {
    res.status(400).json({ ok: false, error: "invalid_or_expired_verification_code" });
    return;
  }
  res.status(200).json({
    ok: true,
    phoneVerificationToken: createPhoneVerificationToken(phone, requestId),
    expiresInSeconds: Math.floor(PHONE_VERIFICATION_TOKEN_TTL_MS / 1000),
  });
}

async function sendSolapiVerificationMessage(phone, authNumber) {
  const apiKey = String(process.env.SOLAPI_API_KEY || "").trim();
  const apiSecret = String(process.env.SOLAPI_API_SECRET || "").trim();
  const pfId = String(process.env.SOLAPI_KAKAO_PF_ID || "").trim();
  const templateId = String(process.env.SOLAPI_KAKAO_TEMPLATE_ID || "").trim();
  const senderNumber = normalizePhone(process.env.SOLAPI_SENDER_NUMBER);
  const baseUrl = String(process.env.SOLAPI_API_BASE_URL || "https://api.solapi.com").trim().replace(/\/$/, "");
  if (!apiKey || !apiSecret || !pfId || !templateId || !/^\d{8,11}$/.test(senderNumber)) {
    const error = new Error("solapi_not_configured");
    error.status = 503;
    error.publicCode = "phone_verification_not_configured";
    throw error;
  }
  const date = new Date().toISOString();
  const salt = crypto.randomBytes(16).toString("hex");
  const signature = crypto.createHmac("sha256", apiSecret).update(`${date}${salt}`).digest("hex");
  const authorization = `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
  const response = await fetch(`${baseUrl}/messages/v4/send-many/detail`, {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages: [{
        to: phone,
        from: senderNumber,
        kakaoOptions: {
          pfId,
          templateId,
          disableSms: false,
          variables: {
            "#{인증번호}": authNumber,
            "#{유효시간}": String(PHONE_VERIFICATION_CODE_TTL_SECONDS / 60),
          },
        },
      }],
      showMessageList: true,
    }),
  });
  const text = await response.text().catch(() => "");
  let result = {};
  try {
    result = text ? JSON.parse(text) : {};
  } catch {
    result = {};
  }
  if (!response.ok) {
    const error = new Error(`solapi_${response.status}`);
    error.status = 502;
    error.publicCode = "phone_verification_provider_error";
    throw error;
  }
  const resultList = Array.isArray(result?.resultList) ? result.resultList : [];
  if (Number(result?.errorCount || 0) > 0 || !resultList.length || resultList.some((item) => String(item?.statusCode || "") !== "2000")) {
    const error = new Error("solapi_message_rejected");
    error.status = 502;
    error.publicCode = "phone_verification_provider_error";
    throw error;
  }
  return result;
}

function normalizePhone(value) {
  return cleanText(value, 20).replace(/\D/g, "");
}

function isValidPhone(value) {
  return /^01[0-9]{8,9}$/.test(String(value || ""));
}

function getPhoneVerificationSecret(secretOverride) {
  const secret = String(secretOverride || process.env.PHONE_VERIFICATION_TOKEN_SECRET || "").trim();
  if (secret.length < 32) {
    const error = new Error("phone_verification_secret_not_configured");
    error.status = 503;
    error.publicCode = "phone_verification_not_configured";
    throw error;
  }
  return secret;
}

function hashPhoneVerificationValue(kind, ...values) {
  return crypto.createHmac("sha256", getPhoneVerificationSecret())
    .update([String(kind), ...values.map((value) => String(value))].join("\u001f"))
    .digest("hex");
}

function safeEqualText(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function createPhoneVerificationToken(phone, requestId, secretOverride, now = Date.now()) {
  const normalizedPhone = normalizePhone(phone);
  if (!isValidPhone(normalizedPhone) || !String(requestId || "").trim()) return "";
  const payload = Buffer.from(JSON.stringify({
    phone: normalizedPhone,
    requestId: String(requestId).trim(),
    verifiedAt: now,
    expiresAt: now + PHONE_VERIFICATION_TOKEN_TTL_MS,
  })).toString("base64url");
  const signature = crypto.createHmac("sha256", getPhoneVerificationSecret(secretOverride)).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function validatePhoneVerificationToken(token, phone, secretOverride, now = Date.now()) {
  const [payload, signature, extra] = String(token || "").split(".");
  if (!payload || !signature || extra) return false;
  let expected;
  try {
    expected = crypto.createHmac("sha256", getPhoneVerificationSecret(secretOverride)).update(payload).digest("base64url");
  } catch {
    return false;
  }
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return data.phone === normalizePhone(phone)
      && Number.isFinite(data.verifiedAt)
      && Number.isFinite(data.expiresAt)
      && data.expiresAt > now
      && data.verifiedAt <= now + 60 * 1000;
  } catch {
    return false;
  }
}

function isDuplicateApplicationError(error) {
  const details = `${error?.message || ""} ${error?.details || ""}`;
  return details.includes("23505") || details.includes("lecture_applications_active_phone_idx") || details.includes("lecture_applications_active_lecture_id_idx");
}

function isRegistrationNumberInUseError(error) {
  const details = `${error?.message || ""} ${error?.details || ""}`;
  return details.includes("registration_number_in_use")
    || details.includes("students_pkey")
    || details.includes("duplicate key value violates unique constraint");
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
  createPhoneVerificationToken,
  hashPhoneVerificationValue,
  hashLookupToken,
  isPushConfigured,
  isRegistrationNumberForCohort,
  isValidCohort,
  isValidBirthDate,
  isValidPhone,
  normalizePhone,
  normalizePushSubscription,
  normalizeApplication,
  normalizeStatus,
  validatePhoneVerificationToken,
  validateApplication,
};
