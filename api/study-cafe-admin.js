const {
  COOKIE_NAME,
  getConfig,
  hasPermission,
  readCookie,
  readSessionToken,
} = require("./teacher-auth-utils");

const ALLOWED_ACTIONS = new Set(["dashboard", "stop_session", "release_seat"]);
const PRESENCE_STALE_MS = 2 * 60 * 1000;
const STUDY_DAY_START_HOUR_KST = 4;

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  const session = readTeacherSession(req);
  if (!session) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }

  try {
    const body = await readJson(req);
    const action = String(body.action || "dashboard").trim();
    if (!ALLOWED_ACTIONS.has(action)) {
      res.status(400).json({ ok: false, error: "unsupported_action" });
      return;
    }
    const requiredPermission = action === "dashboard" ? "study_cafe.read" : "study_cafe.write";
    if (!hasPermission(session, requiredPermission)) {
      res.status(403).json({ ok: false, error: "forbidden" });
      return;
    }

    const now = new Date();
    if (action === "dashboard") {
      res.status(200).json({ ok: true, ...(await loadDashboard(now)) });
      return;
    }

    const studentId = normalizeStudentId(body.studentId);
    if (!studentId) {
      res.status(400).json({ ok: false, error: "invalid_student" });
      return;
    }

    const completedSession = await completeActiveSession(studentId, now);
    if (action === "stop_session") {
      await requestSupabase(
        "PATCH",
        `study_cafe_presence?student_id=eq.${encodeURIComponent(studentId)}`,
        {
          status: "seated",
          current_subject: null,
          updated_at: now.toISOString(),
        },
        { Prefer: "return=minimal" }
      );
      res.status(200).json({ ok: true, stopped: Boolean(completedSession) });
      return;
    }

    await requestSupabase(
      "DELETE",
      `study_cafe_presence?student_id=eq.${encodeURIComponent(studentId)}`
    );
    res.status(200).json({ ok: true, released: true, stopped: Boolean(completedSession) });
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ ok: false, error: error.message || "study_cafe_admin_error" });
  }
};

async function loadDashboard(now) {
  await rolloverActiveSessionsIfNeeded(now);
  const bounds = getKstDayBounds(now);
  const [students, profiles, presenceRows, activeSessions, todaySessions] = await Promise.all([
    requestSupabase(
      "GET",
      "students?id=like.2*&is_active=eq.true&select=id,name,track&order=id.asc"
    ),
    requestSupabase(
      "GET",
      "study_cafe_profiles?select=student_id,avatar_tone"
    ),
    requestSupabase(
      "GET",
      "study_cafe_presence?select=student_id,seat_number,status,current_subject,avatar_tone,last_heartbeat_at,updated_at&order=seat_number.asc"
    ),
    requestSupabase(
      "GET",
      "study_cafe_sessions?status=in.(running,paused)&select=id,student_id,subject_name,status,elapsed_seconds,started_at,active_started_at,ended_at"
    ),
    requestSupabase(
      "GET",
      `study_cafe_sessions?started_at=gte.${encodeURIComponent(bounds.start)}&started_at=lt.${encodeURIComponent(bounds.end)}&select=id,student_id,subject_name,status,elapsed_seconds,started_at,active_started_at,ended_at`
    ),
  ]);

  const studentRows = Array.isArray(students) ? students : [];
  const profileMap = new Map((Array.isArray(profiles) ? profiles : []).map((row) => [row.student_id, row]));
  const presenceMap = new Map((Array.isArray(presenceRows) ? presenceRows : []).map((row) => [row.student_id, row]));
  const activeMap = new Map((Array.isArray(activeSessions) ? activeSessions : []).map((row) => [row.student_id, row]));
  const totals = aggregateSessionSeconds(Array.isArray(todaySessions) ? todaySessions : [], now);
  const ids = new Set([
    ...studentRows.map((row) => row.id),
    ...presenceMap.keys(),
    ...activeMap.keys(),
    ...totals.keys(),
  ]);
  const studentMap = new Map(studentRows.map((row) => [row.id, row]));
  const staleCutoff = now.getTime() - PRESENCE_STALE_MS;
  const members = [...ids].map((studentId) => {
    const student = studentMap.get(studentId) || {};
    const profile = profileMap.get(studentId) || {};
    const presence = presenceMap.get(studentId) || null;
    const active = activeMap.get(studentId) || null;
    const lastHeartbeatAt = presence?.last_heartbeat_at || "";
    const connected = Boolean(
      presence &&
      lastHeartbeatAt &&
      new Date(lastHeartbeatAt).getTime() >= staleCutoff
    );
    return {
      studentId,
      name: student.name || "이름 미등록",
      track: student.track || "직렬 미등록",
      avatarTone: presence?.avatar_tone || profile.avatar_tone || "navy",
      seatNumber: presence ? Number(presence.seat_number) : null,
      presenceStatus: presence?.status || "offline",
      currentSubject: active?.subject_name || presence?.current_subject || "",
      sessionStatus: active?.status || "",
      sessionElapsedSeconds: active ? getSessionElapsedSeconds(active, now) : 0,
      todaySeconds: totals.get(studentId) || 0,
      lastHeartbeatAt,
      connected,
    };
  }).sort((left, right) => {
    if (left.seatNumber && !right.seatNumber) return -1;
    if (!left.seatNumber && right.seatNumber) return 1;
    if (left.seatNumber && right.seatNumber) return left.seatNumber - right.seatNumber;
    if (right.todaySeconds !== left.todaySeconds) return right.todaySeconds - left.todaySeconds;
    return left.studentId.localeCompare(right.studentId, "ko");
  });

  return {
    serverNow: now.toISOString(),
    date: bounds.date,
    summary: {
      onlineStudentCount: studentRows.length,
      seatedCount: members.filter((member) => member.seatNumber && member.connected).length,
      studyingCount: members.filter((member) => member.sessionStatus === "running" && member.connected).length,
      pausedCount: members.filter((member) => member.sessionStatus === "paused" && member.connected).length,
      totalSeconds: members.reduce((sum, member) => sum + member.todaySeconds, 0),
    },
    members,
  };
}

async function getActiveSession(studentId) {
  const rows = await requestSupabase(
    "GET",
    `study_cafe_sessions?student_id=eq.${encodeURIComponent(studentId)}&status=in.(running,paused)&select=id,student_id,subject_name,status,elapsed_seconds,started_at,active_started_at,ended_at&order=started_at.desc&limit=1`
  );
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function completeActiveSession(studentId, now) {
  const session = await getActiveSession(studentId);
  if (!session) return null;
  const rows = await requestSupabase(
    "PATCH",
    `study_cafe_sessions?id=eq.${encodeURIComponent(session.id)}`,
    {
      status: "completed",
      elapsed_seconds: getSessionElapsedSeconds(session, now),
      active_started_at: null,
      ended_at: now.toISOString(),
      updated_at: now.toISOString(),
    },
    { Prefer: "return=representation" }
  );
  return rows?.[0] || session;
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
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const error = new Error("study_cafe_admin_store_unavailable");
    error.status = response.status === 404 ? 503 : 502;
    error.storeStatus = response.status;
    throw error;
  }
  if (response.status === 204) return null;
  return response.json().catch(() => null);
}

function readTeacherSession(req) {
  const { secret } = getConfig();
  const request = req?.headers ? req : { ...req, headers: {} };
  return readSessionToken(readCookie(request, COOKIE_NAME), secret);
}

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function normalizeStudentId(value) {
  const studentId = String(value || "").trim().slice(0, 64);
  return studentId.startsWith("2") ? studentId : "";
}

function getSessionElapsedSeconds(session, now = new Date()) {
  const saved = Math.max(0, Number(session?.elapsed_seconds) || 0);
  if (session?.status !== "running" || !session.active_started_at) return Math.floor(saved);
  const activeMs = Math.max(0, now.getTime() - new Date(session.active_started_at).getTime());
  return Math.floor(saved + activeMs / 1000);
}

function aggregateSessionSeconds(rows, now) {
  const totals = new Map();
  rows.forEach((row) => {
    if (!row.student_id) return;
    totals.set(
      row.student_id,
      (totals.get(row.student_id) || 0) + getSessionElapsedSeconds(row, now)
    );
  });
  return totals;
}

async function rolloverActiveSessionsIfNeeded(now) {
  const activeRows = await requestSupabase(
    "GET",
    "study_cafe_sessions?status=in.(running,paused)&select=id,student_id,subject_name,status,elapsed_seconds,started_at,active_started_at,ended_at"
  );
  const currentDateKey = getKstDateKey(now);
  const boundary = kstDateKeyToUtc(currentDateKey);
  for (const session of Array.isArray(activeRows) ? activeRows : []) {
    if (!session.student_id || getKstDateKey(session.started_at) === currentDateKey) continue;
    await requestSupabase(
      "PATCH",
      `study_cafe_sessions?id=eq.${encodeURIComponent(session.id)}`,
      {
        status: "completed",
        elapsed_seconds: getSessionElapsedSeconds(session, boundary),
        active_started_at: null,
        ended_at: boundary.toISOString(),
        updated_at: boundary.toISOString(),
      },
      { Prefer: "return=minimal" }
    );
    try {
      await requestSupabase(
        "POST",
        "study_cafe_sessions",
        {
          student_id: session.student_id,
          subject_name: session.subject_name,
          status: session.status,
          elapsed_seconds: 0,
          started_at: boundary.toISOString(),
          active_started_at: session.status === "running" ? boundary.toISOString() : null,
          updated_at: now.toISOString(),
        },
        { Prefer: "return=minimal" }
      );
    } catch (error) {
      if (error.storeStatus !== 409) throw error;
    }
  }
}

function getKstDayBounds(now = new Date()) {
  const studyDate = new Date(
    now.getTime() + (9 - STUDY_DAY_START_HOUR_KST) * 60 * 60 * 1000
  );
  const year = studyDate.getUTCFullYear();
  const month = studyDate.getUTCMonth();
  const day = studyDate.getUTCDate();
  return {
    date: `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    start: new Date(Date.UTC(year, month, day, STUDY_DAY_START_HOUR_KST - 9)).toISOString(),
    end: new Date(Date.UTC(year, month, day + 1, STUDY_DAY_START_HOUR_KST - 9)).toISOString(),
  };
}

function getKstDateKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const studyDate = new Date(
    date.getTime() + (9 - STUDY_DAY_START_HOUR_KST) * 60 * 60 * 1000
  );
  return [
    studyDate.getUTCFullYear(),
    String(studyDate.getUTCMonth() + 1).padStart(2, "0"),
    String(studyDate.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function kstDateKeyToUtc(dateKey) {
  const [year, month, day] = String(dateKey || "").split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, STUDY_DAY_START_HOUR_KST - 9));
}

module.exports._private = {
  aggregateSessionSeconds,
  getKstDayBounds,
  getKstDateKey,
  getSessionElapsedSeconds,
  normalizeStudentId,
};
