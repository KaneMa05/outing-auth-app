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
        Object.prototype.hasOwnProperty.call(rawSettings, "attendanceDeadlineEnabled") ||
        Object.prototype.hasOwnProperty.call(rawSettings, "attendanceDateOverride") ||
        Object.prototype.hasOwnProperty.call(rawSettings, "attendanceDateDeadlines");
      const writesSeatAssignments = Object.prototype.hasOwnProperty.call(rawSettings, "seatAssignments");
      const writesOnlineManagedStudyCafe = Object.prototype.hasOwnProperty.call(
        rawSettings,
        "onlineManagedStudyCafeEnabled"
      );
      const writesStudyCafeVisibility =
        Object.prototype.hasOwnProperty.call(rawSettings, "studyRoomListEnabled") ||
        Object.prototype.hasOwnProperty.call(rawSettings, "studyCafeRoomTabsEnabled");
      const writesCurriculumQuest = Object.prototype.hasOwnProperty.call(
        rawSettings,
        "curriculumQuestEnabled"
      );
      const writesPhoneVerification = Object.prototype.hasOwnProperty.call(
        rawSettings,
        "phoneVerificationEnabled"
      );
      const writesStudentDday = Object.prototype.hasOwnProperty.call(rawSettings, "studentDday");
      if (writesAttendanceSettings && !hasPermission(session, "attendance.write")) {
        res.status(403).json({ ok: false, error: "forbidden" });
        return;
      }
      if (Object.prototype.hasOwnProperty.call(rawSettings, "attendanceDateDeadlines")) {
        res.status(400).json({ ok: false, error: "use_attendance_date_override" });
        return;
      }
      const writesDateOverride = Object.prototype.hasOwnProperty.call(rawSettings, "attendanceDateOverride");
      const dateOverride = rawSettings.attendanceDateOverride;
      if (writesDateOverride && (!isValidDateKey(dateOverride?.dateKey) ||
        (dateOverride.deadline !== null && !isValidAttendanceTime(dateOverride.deadline)))) {
        res.status(400).json({ ok: false, error: "invalid_attendance_date_override" });
        return;
      }
      if (writesSeatAssignments && !hasPermission(session, "seats.write")) {
        res.status(403).json({ ok: false, error: "forbidden" });
        return;
      }
      if (writesOnlineManagedStudyCafe && !hasPermission(session, "students.read")) {
        res.status(403).json({ ok: false, error: "forbidden" });
        return;
      }
      if (writesStudyCafeVisibility && !hasPermission(session, "study_cafe.write")) {
        res.status(403).json({ ok: false, error: "forbidden" });
        return;
      }
      if (writesCurriculumQuest && !hasPermission(session, "curriculum.write")) {
        res.status(403).json({ ok: false, error: "forbidden" });
        return;
      }
      if (writesPhoneVerification && session.role !== "admin") {
        res.status(403).json({ ok: false, error: "forbidden" });
        return;
      }
      if (writesStudentDday && !hasPermission(session, "notices.write")) {
        res.status(403).json({ ok: false, error: "forbidden" });
        return;
      }
      const currentSettings = await loadSettings();
      const settings = normalizeSettings({ ...currentSettings, ...rawSettings });
      if (writesDateOverride) {
        if (dateOverride.deadline === null) delete settings.attendanceDateDeadlines[dateOverride.dateKey];
        else settings.attendanceDateDeadlines[dateOverride.dateKey] = dateOverride.deadline;
      }
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
    attendanceDateDeadlines: normalizeAttendanceDateDeadlines(settings.attendanceDateDeadlines),
    onlineManagedStudyCafeEnabled: settings.onlineManagedStudyCafeEnabled === true,
    studyRoomListEnabled: settings.studyRoomListEnabled === true,
    studyCafeRoomTabsEnabled: settings.studyCafeRoomTabsEnabled === true,
    curriculumQuestEnabled: settings.curriculumQuestEnabled === true,
    phoneVerificationEnabled: settings.phoneVerificationEnabled === true,
    studentDday: normalizeStudentDday(settings.studentDday),
  };
  if (Object.prototype.hasOwnProperty.call(settings || {}, "seatAssignments")) {
    normalized.seatAssignments = normalizeSeatAssignments(settings.seatAssignments);
  }
  return normalized;
}

function normalizeStudentDday(value) {
  if (!value || typeof value !== "object") return null;
  const date = String(value.date || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(`${date}T00:00:00`).getTime())) return null;
  return {
    label: String(value.label || "관리자 지정 일정").trim().slice(0, 40) || "관리자 지정 일정",
    date,
  };
}

function normalizeAttendanceDeadlineValue(value) {
  const text = String(value || "");
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(text) ? text : DEFAULT_ATTENDANCE_DEADLINE;
}

function isValidAttendanceTime(value) {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function isValidDateKey(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function normalizeAttendanceDateDeadlines(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([dateKey, time]) =>
    isValidDateKey(dateKey) && isValidAttendanceTime(time)
  ));
}

module.exports._private = { isValidDateKey, isValidAttendanceTime, normalizeAttendanceDateDeadlines };

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
