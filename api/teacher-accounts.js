const crypto = require("crypto");
const {
  COOKIE_NAME,
  getConfig,
  readCookie,
  readSessionToken,
} = require("./teacher-auth-utils");

const TABLE = "students";
const MAX_ACCOUNTS = 10;

module.exports = async function handler(req, res) {
  const session = readSession(req);
  if (!session) return res.status(401).json({ ok: false, error: "unauthorized" });
  if (session.role !== "admin") return res.status(403).json({ ok: false, error: "forbidden" });

  try {
    if (req.method === "GET") {
      const accounts = await requestSupabase(
        "GET",
        `${TABLE}?account_type=eq.teacher&is_active=eq.true&select=id,name,position,is_active,created_at,app_registered_at&order=id.asc`
      );
      return res.status(200).json({ ok: true, accounts: accounts || [], limit: MAX_ACCOUNTS });
    }

    if (req.method === "POST") {
      const body = await readJson(req);
      const registrationNumber = normalizeRegistrationNumber(body.registrationNumber);
      const displayName = String(body.displayName || "").trim();
      const password = String(body.password || "");
      if (!registrationNumber) return res.status(400).json({ ok: false, error: "invalid_registration_number" });
      if (!displayName || displayName.length > 40) return res.status(400).json({ ok: false, error: "invalid_display_name" });
      if (password.length < 8 || password.length > 128) return res.status(400).json({ ok: false, error: "invalid_password" });

      const id = String(registrationNumber);
      const existingRows = await requestSupabase("GET", `${TABLE}?id=eq.${id}&select=id,account_type,created_at&limit=1`);
      const existing = existingRows?.[0] || null;
      if (existing && existing.account_type !== "teacher") {
        return res.status(409).json({ ok: false, error: "registration_number_in_use" });
      }

      const now = new Date().toISOString();
      const payload = {
        name: displayName,
        class_name: "수강생",
        student_category: "lecture",
        account_type: "teacher",
        position: "선생님",
        cohort: null,
        track: "선생님",
        gender: "미지정",
        password_hash: hashStudentPassword(password),
        device_token: null,
        app_registered_at: now,
        attendance_excluded: true,
        fitness_excluded: true,
        is_active: true,
      };
      const rows = existing
        ? await requestSupabase("PATCH", `${TABLE}?id=eq.${id}&select=id,name,position,is_active,created_at,app_registered_at`, payload, { Prefer: "return=representation" })
        : await requestSupabase("POST", `${TABLE}?select=id,name,position,is_active,created_at,app_registered_at`, { id, ...payload, created_at: now }, { Prefer: "return=representation" });

      await revokeTeacherDevices(id, session.username || "admin", "선생님 계정 정보 변경");
      return res.status(existing ? 200 : 201).json({ ok: true, account: rows?.[0] || null });
    }

    if (req.method === "DELETE") {
      const body = await readJson(req);
      const registrationNumber = normalizeRegistrationNumber(body.registrationNumber || body.id);
      if (!registrationNumber) return res.status(400).json({ ok: false, error: "invalid_registration_number" });
      const id = String(registrationNumber);
      const rows = await requestSupabase("GET", `${TABLE}?id=eq.${id}&account_type=eq.teacher&select=id&limit=1`);
      if (!rows?.[0]) return res.status(404).json({ ok: false, error: "not_found" });
      await requestSupabase("PATCH", `${TABLE}?id=eq.${id}`, { is_active: false }, { Prefer: "return=minimal" });
      await revokeTeacherDevices(id, session.username || "admin", "선생님 계정 사용 중지");
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ ok: false });
  } catch (error) {
    console.error(error);
    return res.status(error.status || 500).json({ ok: false, error: "teacher_account_store_error" });
  }
};

function normalizeRegistrationNumber(value) {
  const number = Number(String(value || "").trim());
  return Number.isInteger(number) && number >= 1 && number <= 10 ? number : 0;
}

function hashStudentPassword(password) {
  return crypto.createHash("sha256").update(String(password || ""), "utf8").digest("hex");
}

async function revokeTeacherDevices(studentId, actor, reason) {
  const now = new Date().toISOString();
  await requestSupabase("PATCH", `student_devices?student_id=eq.${studentId}&revoked_at=is.null`, {
    revoked_at: now,
    revoked_by: actor,
    revoke_reason: reason,
  }, { Prefer: "return=minimal" });
}

function readSession(req) {
  const { secret } = getConfig();
  return readSessionToken(readCookie(req, COOKIE_NAME), secret);
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function requestSupabase(method, path, body, extraHeaders = {}) {
  const supabaseUrl = process.env.SUPABASE_URL || "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!supabaseUrl || !serviceRoleKey) {
    const error = new Error("service_role_not_configured");
    error.status = 503;
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
  if (!response.ok) {
    const error = new Error(`supabase_${response.status}`);
    error.details = await response.text().catch(() => "");
    error.status = 502;
    throw error;
  }
  if (response.status === 204) return null;
  return response.json().catch(() => null);
}

module.exports._private = { hashStudentPassword, normalizeRegistrationNumber };
