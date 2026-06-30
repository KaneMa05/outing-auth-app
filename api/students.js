const {
  COOKIE_NAME,
  getConfig,
  hasPermission,
  readCookie,
  readSessionToken,
} = require("./teacher-auth-utils");

const TABLE = "students";

module.exports = async function handler(req, res) {
  const session = readSession(req);
  if (!session) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }

  try {
    if (req.method === "POST") {
      if (session.role !== "admin" || !hasPermission(session, "students.read")) {
        res.status(403).json({ ok: false, error: "forbidden" });
        return;
      }

      const body = await readJson(req);
      const students = Array.isArray(body.students) ? body.students : [];
      const rows = students.map(normalizeStudentRow).filter(Boolean);
      if (!rows.length) {
        res.status(400).json({ ok: false, error: "missing_students" });
        return;
      }

      for (const row of rows) {
        await upsertStudent(row);
      }
      res.status(200).json({ ok: true });
      return;
    }

    if (req.method === "DELETE") {
      if (session.role !== "admin" || !hasPermission(session, "students.read")) {
        res.status(403).json({ ok: false, error: "forbidden" });
        return;
      }

      const body = await readJson(req);
      const id = String(body.id || "").trim();
      if (!id) {
        res.status(400).json({ ok: false, error: "missing_id" });
        return;
      }

      await requestSupabase("PATCH", `${TABLE}?id=eq.${encodeURIComponent(id)}`, { is_active: false }, {
        Prefer: "return=minimal",
      });
      res.status(200).json({ ok: true });
      return;
    }

    res.setHeader("Allow", "POST, DELETE");
    res.status(405).json({ ok: false });
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ ok: false, error: error.message || "student_store_error" });
  }
};

function readSession(req) {
  const { secret } = getConfig();
  return readSessionToken(readCookie(req, COOKIE_NAME), secret);
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function normalizeStudentRow(student) {
  const id = String(student.id || "").trim();
  const name = String(student.name || "").trim();
  if (!id || !name) return null;
  const className = String(student.class_name || student.className || "오프라인반").trim() || "오프라인반";
  return {
    id,
    name,
    class_name: className,
    track: String(student.track || "").trim() || null,
    attendance_excluded: student.attendance_excluded === true || student.attendanceExcluded === true || isOnlineClassName(className),
    created_at: student.created_at || student.createdAt || new Date().toISOString(),
  };
}

function isOnlineClassName(className) {
  return String(className || "").includes("온라인");
}

async function upsertStudent(row) {
  const existingRows = await requestSupabase(
    "GET",
    `${TABLE}?id=eq.${encodeURIComponent(row.id)}&select=id,is_active`,
    null
  ) || [];
  const existing = existingRows[0];

  if (!existing) {
    await requestSupabase("POST", TABLE, { ...row, is_active: true }, {
      Prefer: "return=minimal",
    });
    return;
  }

  const payload = {
    name: row.name,
    class_name: row.class_name,
    track: row.track,
    attendance_excluded: row.attendance_excluded,
    is_active: true,
  };

  if (existing.is_active === false) {
    payload.gender = null;
    payload.password_hash = null;
    payload.device_token = null;
    payload.app_registered_at = null;
  }

  await requestSupabase("PATCH", `${TABLE}?id=eq.${encodeURIComponent(row.id)}`, payload, {
    Prefer: "return=minimal",
  });
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
    error.status = 502;
    throw error;
  }

  if (response.status === 204) return null;
  return response.json().catch(() => null);
}
