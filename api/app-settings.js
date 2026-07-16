const {
  COOKIE_NAME,
  getConfig,
  hasPermission,
  readCookie,
  readSessionToken,
} = require("./teacher-auth-utils");

const SETTINGS_NOTICE_ID = "__app_settings__";
const DEFAULT_ATTENDANCE_DEADLINE = "08:50";

module.exports = async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const settings = await loadSettings();
      res.status(200).json({ ok: true, settings });
      return;
    }

    if (req.method === "POST") {
      const session = readSession(req);
      if (!session) {
        res.status(401).json({ ok: false, error: "unauthorized" });
        return;
      }
      const body = await readJson(req);
      const rawSettings = body.settings || body;
      const writesAttendanceSettings =
        Object.prototype.hasOwnProperty.call(rawSettings, "attendanceDeadline") ||
        Object.prototype.hasOwnProperty.call(rawSettings, "attendanceDeadlineEnabled");
      const writesSeatAssignments = Object.prototype.hasOwnProperty.call(rawSettings, "seatAssignments");
      if (writesAttendanceSettings && !hasPermission(session, "attendance.write")) {
        res.status(403).json({ ok: false, error: "forbidden" });
        return;
      }
      if (writesSeatAssignments && !hasPermission(session, "seats.write")) {
        res.status(403).json({ ok: false, error: "forbidden" });
        return;
      }
      const currentSettings = await loadSettings();
      const settings = normalizeSettings({ ...currentSettings, ...rawSettings });
      await saveSettings(settings);
      res.status(200).json({ ok: true, settings });
      return;
    }

    res.setHeader("Allow", "GET, POST");
    res.status(405).json({ ok: false });
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ ok: false, error: error.message || "app_settings_error" });
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

async function loadSettings() {
  const rows = await requestSupabase(
    "GET",
    `notices?id=eq.${encodeURIComponent(SETTINGS_NOTICE_ID)}&select=body&limit=1`
  );
  const body = Array.isArray(rows) && rows[0]?.body ? rows[0].body : "{}";
  try {
    return normalizeSettings(JSON.parse(body));
  } catch {
    return normalizeSettings({});
  }
}

async function saveSettings(settings) {
  const now = new Date().toISOString();
  await requestSupabase(
    "POST",
    "notices?on_conflict=id",
    {
      id: SETTINGS_NOTICE_ID,
      title: SETTINGS_NOTICE_ID,
      body: JSON.stringify({ ...settings, updatedAt: now }),
      is_published: false,
      created_at: now,
      updated_at: now,
    },
    { Prefer: "resolution=merge-duplicates,return=minimal" }
  );
}

function normalizeSettings(settings) {
  const normalized = {
    attendanceDeadline: normalizeAttendanceDeadlineValue(settings.attendanceDeadline),
    attendanceDeadlineEnabled: settings.attendanceDeadlineEnabled === true,
  };
  if (Object.prototype.hasOwnProperty.call(settings || {}, "seatAssignments")) {
    normalized.seatAssignments = normalizeSeatAssignments(settings.seatAssignments);
  }
  return normalized;
}

function normalizeAttendanceDeadlineValue(value) {
  const text = String(value || "");
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(text) ? text : DEFAULT_ATTENDANCE_DEADLINE;
}

function normalizeSeatAssignments(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
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
    const text = await response.text().catch(() => "");
    const error = new Error(`supabase_${response.status}${text ? `_${text}` : ""}`);
    error.status = 502;
    throw error;
  }

  if (response.status === 204) return null;
  return response.json().catch(() => null);
}
