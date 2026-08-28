const crypto = require("crypto");

const ALLOWED_ACTIONS = new Set([
  "load",
  "ranking",
  "stats",
  "save_subjects",
  "save_profile",
  "todos_load",
  "todo_month_summary",
  "todo_create",
  "todo_toggle",
  "todo_delete",
  "subject_goal_set",
  "claim_seat",
  "release_seat",
  "timer_start",
  "timer_pause",
  "timer_resume",
  "timer_stop",
  "keep_seat",
  "heartbeat",
]);
const AVATAR_TONES = new Set(["navy", "blue", "mint", "purple", "orange", "rose"]);
const PRESENCE_STALE_MS = 2 * 60 * 1000;
const PRESENCE_HEARTBEAT_GRACE_MS = 30 * 1000;
const IDLE_PRESENCE_STALE_MS = 15 * 60 * 1000 + 10 * 1000;
const STUDY_DAY_START_HOUR_KST = 4;
const MAX_SEAT_NUMBER = 96;
const MAX_TODOS_PER_DAY = 60;

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  try {
    const body = await readJson(req);
    const action = normalizeText(body.action, 40);
    if (!ALLOWED_ACTIONS.has(action)) {
      res.status(400).json({ ok: false, error: "unsupported_action" });
      return;
    }

    const studentId = normalizeText(body.studentId, 64);
    const deviceToken = normalizeText(body.deviceToken, 256);
    if (!studentId || !deviceToken) {
      res.status(400).json({ ok: false, error: "missing_required_fields" });
      return;
    }
    const student = await authenticateOnlineStudent({
      studentId,
      deviceToken,
      client: body.client,
    });
    if (!student) {
      res.status(403).json({ ok: false, error: "device_not_active" });
      return;
    }
    if (!hasStudyCafeAccess(student)) {
      res.status(403).json({ ok: false, error: "online_student_only" });
      return;
    }

    const now = new Date();
    await clearStalePresence(now);
    await rolloverActiveSessionIfNeeded(studentId, now);

    if (action === "stats") {
      const range = normalizeStatsRange(body.dateFrom, body.dateTo);
      res.status(200).json({
        ok: true,
        serverNow: now.toISOString(),
        ...(await loadStudyStats(studentId, range, now)),
      });
      return;
    }

    if (action === "ranking") {
      const period = normalizeRankingPeriod(body.period);
      res.status(200).json({
        ok: true,
        serverNow: now.toISOString(),
        ...(await loadStudyRanking(studentId, period, now)),
      });
      return;
    }

    if (action === "load") {
      res.status(200).json({ ok: true, ...(await buildStudyCafeSnapshot(student, now)) });
      return;
    }

    if (action === "save_subjects") {
      const subjects = normalizeSubjects(body.subjects);
      await requestSupabase("POST", "rpc/replace_study_cafe_subjects", {
        p_student_id: studentId,
        p_subjects: subjects,
      });
      res.status(200).json({ ok: true, subjects });
      return;
    }

    if (action === "save_profile") {
      const avatarTone = normalizeAvatarTone(body.avatarTone);
      const nickname = body.nickname === undefined ? undefined : normalizeNickname(body.nickname);
      const statusMessage = body.statusMessage === undefined
        ? undefined
        : normalizeStatusMessage(body.statusMessage);
      await upsertProfile(studentId, avatarTone, nickname, statusMessage, now);
      await requestSupabase(
        "PATCH",
        `study_cafe_presence?student_id=eq.${encodeURIComponent(studentId)}`,
        {
          avatar_tone: avatarTone,
          ...(nickname === undefined ? {} : { display_name: nickname }),
          updated_at: now.toISOString(),
        },
        { Prefer: "return=minimal" }
      );
      await broadcastStudyCafeStateChange("profile");
      res.status(200).json({
        ok: true,
        avatarTone,
        ...(nickname === undefined ? {} : { nickname }),
        ...(statusMessage === undefined ? {} : { statusMessage }),
      });
      return;
    }

    if (action === "todos_load") {
      const studyDate = normalizeTodoStudyDate(body.studyDate, now);
      const [todos, subjectGoals] = await Promise.all([
        requestSupabase(
          "GET",
          `study_cafe_todos?student_id=eq.${encodeURIComponent(studentId)}&study_date=eq.${studyDate}&select=id,study_date,subject_name,content,is_completed,completed_at,created_at&order=created_at.asc`
        ),
        requestSupabase(
          "GET",
          `study_cafe_subject_goals?student_id=eq.${encodeURIComponent(studentId)}&study_date=eq.${studyDate}&select=study_date,subject_name,target_minutes,result_status,completed_elapsed_seconds,completed_at&order=subject_name.asc`
        ),
      ]);
      res.status(200).json({
        ok: true,
        studyDate,
        todos: (Array.isArray(todos) ? todos : []).map(serializeTodo),
        subjectGoals: (Array.isArray(subjectGoals) ? subjectGoals : []).map(serializeSubjectGoal),
      });
      return;
    }

    if (action === "todo_month_summary") {
      const monthKey = normalizeTodoMonthKey(body.monthKey, now);
      const { startDate, endDate } = getTodoMonthBounds(monthKey);
      const rows = await requestSupabase(
        "GET",
        `study_cafe_todos?student_id=eq.${encodeURIComponent(studentId)}&study_date=gte.${startDate}&study_date=lt.${endDate}&select=study_date,is_completed&order=study_date.asc`
      );
      res.status(200).json({
        ok: true,
        monthKey,
        plans: summarizeTodoMonth(rows),
      });
      return;
    }

    if (action === "subject_goal_set") {
      const subject = normalizeSubject(body.subject);
      const studyDate = normalizeTodoStudyDate(body.studyDate, now);
      const targetMinutes = normalizeSubjectGoalMinutes(body.targetMinutes);
      if (!targetMinutes) {
        await requestSupabase(
          "DELETE",
          `study_cafe_subject_goals?student_id=eq.${encodeURIComponent(studentId)}&study_date=eq.${studyDate}&subject_name=eq.${encodeURIComponent(subject)}`
        );
        res.status(200).json({ ok: true, goal: null });
        return;
      }
      const rows = await requestSupabase(
        "POST",
        "study_cafe_subject_goals?on_conflict=student_id,study_date,subject_name",
        {
          student_id: studentId,
          study_date: studyDate,
          subject_name: subject,
          target_minutes: targetMinutes,
          result_status: null,
          completed_elapsed_seconds: 0,
          completed_at: null,
          updated_at: now.toISOString(),
        },
        { Prefer: "resolution=merge-duplicates,return=representation" }
      );
      res.status(200).json({ ok: true, goal: serializeSubjectGoal(rows?.[0]) });
      return;
    }

    if (action === "todo_create") {
      const subject = normalizeSubject(body.subject);
      const content = normalizeTodoContent(body.content);
      const studyDate = normalizeTodoStudyDate(body.studyDate, now);
      const existing = await requestSupabase(
        "GET",
        `study_cafe_todos?student_id=eq.${encodeURIComponent(studentId)}&study_date=eq.${studyDate}&select=id`
      );
      if (Array.isArray(existing) && existing.length >= MAX_TODOS_PER_DAY) {
        res.status(409).json({ ok: false, error: "todo_limit_reached" });
        return;
      }
      const rows = await requestSupabase(
        "POST",
        "study_cafe_todos",
        {
          student_id: studentId,
          study_date: studyDate,
          subject_name: subject,
          content,
          is_completed: false,
          updated_at: now.toISOString(),
        },
        { Prefer: "return=representation" }
      );
      res.status(200).json({ ok: true, todo: serializeTodo(rows?.[0]) });
      return;
    }

    if (action === "todo_toggle") {
      const todoId = normalizeTodoId(body.todoId);
      const studyDate = normalizeTodoStudyDate(body.studyDate, now);
      if (body.completed !== true && body.completed !== false) {
        res.status(400).json({ ok: false, error: "invalid_todo_completed" });
        return;
      }
      const rows = await requestSupabase(
        "PATCH",
        `study_cafe_todos?id=eq.${encodeURIComponent(todoId)}&student_id=eq.${encodeURIComponent(studentId)}&study_date=eq.${studyDate}`,
        {
          is_completed: body.completed,
          completed_at: body.completed ? now.toISOString() : null,
          updated_at: now.toISOString(),
        },
        { Prefer: "return=representation" }
      );
      if (!Array.isArray(rows) || !rows[0]) {
        res.status(404).json({ ok: false, error: "todo_not_found" });
        return;
      }
      res.status(200).json({ ok: true, todo: serializeTodo(rows[0]) });
      return;
    }

    if (action === "todo_delete") {
      const todoId = normalizeTodoId(body.todoId);
      const studyDate = normalizeTodoStudyDate(body.studyDate, now);
      await requestSupabase(
        "DELETE",
        `study_cafe_todos?id=eq.${encodeURIComponent(todoId)}&student_id=eq.${encodeURIComponent(studentId)}&study_date=eq.${studyDate}`
      );
      res.status(200).json({ ok: true, todoId });
      return;
    }

    if (action === "claim_seat") {
      const seatNumber = normalizeSeatNumber(body.seatNumber);
      const occupied = await requestSupabase(
        "GET",
        `study_cafe_presence?seat_number=eq.${seatNumber}&student_id=neq.${encodeURIComponent(studentId)}&select=student_id&limit=1`
      );
      if (Array.isArray(occupied) && occupied.length) {
        res.status(409).json({ ok: false, error: "seat_taken" });
        return;
      }
      await leaveOwnStudyRoom(student, now);
      const avatarTone = normalizeAvatarTone(body.avatarTone);
      const displayName = normalizeStoredNickname(body.displayName) || "온라인학생";
      const activeSession = body.preserveStudy === true
        ? await getActiveSession(studentId)
        : null;
      const presenceStatus = activeSession?.status === "running"
        ? "studying"
        : activeSession?.status === "paused"
          ? "paused"
          : "seated";
      try {
        await requestSupabase(
          "POST",
          "study_cafe_presence?on_conflict=student_id",
          {
            student_id: studentId,
            seat_number: seatNumber,
            status: presenceStatus,
            current_subject: activeSession?.subject_name || null,
            avatar_tone: avatarTone,
            display_name: displayName,
            last_heartbeat_at: now.toISOString(),
            updated_at: now.toISOString(),
          },
          { Prefer: "resolution=merge-duplicates,return=minimal" }
        );
      } catch (error) {
        if (error.storeStatus === 409) {
          res.status(409).json({ ok: false, error: "seat_taken" });
          return;
        }
        throw error;
      }
      await broadcastStudyCafeStateChange("seat", { seatNumber });
      res.status(200).json({ ok: true, seatNumber });
      return;
    }

    if (action === "release_seat") {
      await completeActiveSession(studentId, now);
      await requestSupabase(
        "DELETE",
        `study_cafe_presence?student_id=eq.${encodeURIComponent(studentId)}`
      );
      await broadcastStudyCafeStateChange("seat");
      res.status(200).json({ ok: true });
      return;
    }

    if (action === "timer_start") {
      const subject = normalizeSubject(body.subject);
      const presence = await getOwnPresence(studentId);
      const roomMembership = presence ? null : await getOwnStudyRoomMembership(studentId);
      if (!presence && !roomMembership?.seat_number) {
        res.status(409).json({ ok: false, error: "seat_required" });
        return;
      }
      await completeActiveSession(studentId, now);
      const sessions = await requestSupabase(
        "POST",
        "study_cafe_sessions",
        {
          student_id: studentId,
          subject_name: subject,
          status: "running",
          elapsed_seconds: 0,
          started_at: now.toISOString(),
          active_started_at: now.toISOString(),
          updated_at: now.toISOString(),
        },
        { Prefer: "return=representation" }
      );
      await updatePresence(studentId, {
        status: "studying",
        current_subject: subject,
        last_heartbeat_at: now.toISOString(),
        updated_at: now.toISOString(),
      });
      await broadcastStudyCafeStateChange("timer");
      res.status(200).json({ ok: true, session: serializeSession(sessions?.[0], now) });
      return;
    }

    if (action === "timer_pause") {
      const session = await getActiveSession(studentId);
      if (!session || session.status !== "running") {
        res.status(409).json({ ok: false, error: "running_session_required" });
        return;
      }
      const elapsedSeconds = getSessionElapsedSeconds(session, now);
      const rows = await requestSupabase(
        "PATCH",
        `study_cafe_sessions?id=eq.${encodeURIComponent(session.id)}`,
        {
          status: "paused",
          elapsed_seconds: elapsedSeconds,
          active_started_at: null,
          updated_at: now.toISOString(),
        },
        { Prefer: "return=representation" }
      );
      await updatePresence(studentId, {
        status: "paused",
        last_heartbeat_at: now.toISOString(),
        updated_at: now.toISOString(),
      });
      await broadcastStudyCafeStateChange("timer");
      res.status(200).json({ ok: true, session: serializeSession(rows?.[0], now) });
      return;
    }

    if (action === "timer_resume") {
      const session = await getActiveSession(studentId);
      if (!session || !["paused", "running"].includes(session.status)) {
        res.status(409).json({ ok: false, error: "paused_session_required" });
        return;
      }
      const rows = session.status === "paused"
        ? await requestSupabase(
            "PATCH",
            `study_cafe_sessions?id=eq.${encodeURIComponent(session.id)}`,
            {
              status: "running",
              active_started_at: now.toISOString(),
              updated_at: now.toISOString(),
            },
            { Prefer: "return=representation" }
          )
        : [session];
      await updatePresence(studentId, {
        status: "studying",
        current_subject: session.subject_name,
        last_heartbeat_at: now.toISOString(),
        updated_at: now.toISOString(),
      });
      await broadcastStudyCafeStateChange("timer");
      res.status(200).json({ ok: true, session: serializeSession(rows?.[0], now) });
      return;
    }

    if (action === "timer_stop") {
      const session = await completeActiveSession(studentId, now);
      const goal = body.subjectCompleted === true && session?.subject_name
        ? await completeSubjectGoal(studentId, session.subject_name, now)
        : null;
      await updatePresence(studentId, {
        status: "seated",
        current_subject: null,
        last_heartbeat_at: now.toISOString(),
        updated_at: now.toISOString(),
      });
      await broadcastStudyCafeStateChange("timer");
      res.status(200).json({ ok: true, session: serializeSession(session, now), goal: serializeSubjectGoal(goal) });
      return;
    }

    const presence = await getOwnPresence(studentId);
    const roomMembership = presence ? null : await getOwnStudyRoomMembership(studentId);
    if (!presence && !roomMembership?.seat_number) {
      res.status(409).json({ ok: false, error: "seat_required" });
      return;
    }
    if (action === "keep_seat") {
      if (presence) {
        await updatePresence(studentId, {
          last_heartbeat_at: now.toISOString(),
          updated_at: now.toISOString(),
        });
      } else {
        await requestSupabase(
          "PATCH",
          `study_cafe_room_members?student_id=eq.${encodeURIComponent(studentId)}`,
          { updated_at: now.toISOString() },
          { Prefer: "return=minimal" }
        );
      }
      res.status(200).json({ ok: true, serverNow: now.toISOString() });
      return;
    }
    if (presence) {
      await updatePresence(studentId, {
        last_heartbeat_at: now.toISOString(),
      });
    } else {
      await requestSupabase(
        "PATCH",
        `study_cafe_room_members?student_id=eq.${encodeURIComponent(studentId)}`,
        { updated_at: now.toISOString() },
        { Prefer: "return=minimal" }
      );
    }
    res.status(200).json({ ok: true, serverNow: now.toISOString() });
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ ok: false, error: error.message || "study_cafe_error" });
  }
};

function hasStudyCafeAccess(student) {
  const category = String(student?.student_category || "").trim();
  if (["online_managed", "lecture"].includes(category)) return true;
  return !category && String(student?.id || "").startsWith("2");
}

async function authenticateOnlineStudent({ studentId, deviceToken, client }) {
  const validation = await requestSupabase("POST", "rpc/validate_student_device", {
    p_student_id: studentId,
    p_device_token_hash: hashDeviceToken(deviceToken),
    p_client_display_mode: normalizeText(client?.displayMode, 40) || null,
    p_client_user_agent: normalizeText(client?.userAgent, 500) || null,
  });
  if (!validation || validation.valid !== true) return null;
  const rows = await requestSupabase(
    "GET",
    `students?id=eq.${encodeURIComponent(studentId)}&is_active=eq.true&select=id,name,track,student_category,is_active&limit=1`
  );
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function broadcastStudyCafeStateChange(change, payload = {}) {
  const supabaseUrl = process.env.SUPABASE_URL || "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!supabaseUrl || !serviceRoleKey) return;
  try {
    const response = await fetch(
      `${supabaseUrl.replace(/\/$/, "")}/realtime/v1/api/broadcast/study-cafe-room-public/events/state-changed`,
      {
        method: "POST",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          change,
          ...payload,
          changedAt: new Date().toISOString(),
        }),
      }
    );
    if (!response.ok) {
      console.warn(`Study cafe realtime broadcast failed: ${response.status}`);
    }
  } catch (error) {
    console.warn("Study cafe realtime broadcast failed.", error);
  }
}

async function buildStudyCafeSnapshot(student, now) {
  const studentId = student.id;
  const [subjects, todos, subjectGoals, profiles, ownPresence, activeSessions, sessions, presence, onlineStudents] = await Promise.all([
    requestSupabase(
      "GET",
      `study_cafe_subjects?student_id=eq.${encodeURIComponent(studentId)}&select=name,sort_order&order=sort_order.asc`
    ),
    requestSupabase(
      "GET",
      `study_cafe_todos?student_id=eq.${encodeURIComponent(studentId)}&study_date=eq.${getKstDateKey(now)}&select=id,study_date,subject_name,content,is_completed,completed_at,created_at&order=created_at.asc`
    ),
    requestSupabase(
      "GET",
      `study_cafe_subject_goals?student_id=eq.${encodeURIComponent(studentId)}&study_date=eq.${getKstDateKey(now)}&select=study_date,subject_name,target_minutes,result_status,completed_elapsed_seconds,completed_at&order=subject_name.asc`
    ),
    requestSupabase(
      "GET",
      "study_cafe_profiles?select=student_id,avatar_tone,nickname,status_message"
    ),
    requestSupabase(
      "GET",
      `study_cafe_presence?student_id=eq.${encodeURIComponent(studentId)}&select=student_id,seat_number,status,current_subject,avatar_tone,display_name,last_heartbeat_at,updated_at&limit=1`
    ),
    requestSupabase(
      "GET",
      `study_cafe_sessions?student_id=eq.${encodeURIComponent(studentId)}&status=in.(running,paused)&select=id,student_id,subject_name,status,elapsed_seconds,started_at,active_started_at,ended_at&order=started_at.desc&limit=1`
    ),
    requestSupabase(
      "GET",
      `study_cafe_sessions?started_at=gte.${encodeURIComponent(getKstDayBounds(now).start)}&started_at=lt.${encodeURIComponent(getKstDayBounds(now).end)}&select=id,student_id,subject_name,status,elapsed_seconds,started_at,active_started_at,ended_at`
    ),
    requestSupabase(
      "GET",
      "study_cafe_presence?select=student_id,seat_number,status,current_subject,avatar_tone,display_name,last_heartbeat_at&order=seat_number.asc"
    ),
    requestSupabase(
      "GET",
      "students?id=like.2*&is_active=eq.true&select=id,name,track"
    ),
  ]);

  const sessionRows = Array.isArray(sessions) ? sessions : [];
  const studentMap = new Map((Array.isArray(onlineStudents) ? onlineStudents : []).map((row) => [row.id, row]));
  const profileMap = new Map((Array.isArray(profiles) ? profiles : []).map((row) => [row.student_id, row]));
  const presenceMap = new Map((Array.isArray(presence) ? presence : []).map((row) => [row.student_id, row]));
  const ownProfile = profileMap.get(studentId);
  const totalsByStudent = aggregateSessionSeconds(sessionRows, now, (row) => row.student_id);
  const ownSubjectTotals = aggregateSessionSeconds(
    sessionRows.filter((row) => row.student_id === studentId),
    now,
    (row) => row.subject_name
  );
  const ranking = [...totalsByStudent.entries()]
    .map(([id, totalSeconds]) => ({
      studentId: id === studentId ? id : undefined,
      name: id === studentId
        ? "나"
        : normalizeStoredNickname(profileMap.get(id)?.nickname) ||
          normalizeStoredNickname(presenceMap.get(id)?.display_name) ||
          maskName(studentMap.get(id)?.name),
      tone: id === studentId
        ? normalizeAvatarTone(ownProfile?.avatar_tone)
        : avatarToneForId(id),
      totalSeconds,
      isMine: id === studentId,
    }))
    .filter((row) => row.totalSeconds > 0)
    .sort((a, b) => b.totalSeconds - a.totalSeconds)
    .map((row, index, rows) => ({
      ...row,
      rank: index + 1,
      percentile: Math.max(1, Math.ceil(((index + 1) / Math.max(1, rows.length)) * 100)),
    }));

  return {
    serverNow: now.toISOString(),
    studyDate: getKstDateKey(now),
    subjects: (Array.isArray(subjects) ? subjects : []).map((row) => row.name),
    todos: (Array.isArray(todos) ? todos : []).map(serializeTodo),
    subjectGoals: (Array.isArray(subjectGoals) ? subjectGoals : []).map(serializeSubjectGoal),
    profile: {
      avatarTone: normalizeAvatarTone(ownProfile?.avatar_tone),
      nickname: normalizeStoredNickname(ownProfile?.nickname),
      statusMessage: normalizeStoredStatusMessage(ownProfile?.status_message),
    },
    presence: ownPresence?.[0] ? serializeOwnPresence(ownPresence[0]) : null,
    activeSession: activeSessions?.[0] ? serializeSession(activeSessions[0], now) : null,
    subjectTotals: Object.fromEntries(ownSubjectTotals),
    room: (Array.isArray(presence) ? presence : []).map((row) => {
      const member = studentMap.get(row.student_id);
      return {
        seatNumber: Number(row.seat_number),
        status: row.status,
        currentSubject: row.current_subject || "",
        name: row.student_id === studentId
          ? normalizeStoredNickname(row.display_name) || normalizeStoredNickname(ownProfile?.nickname) || "나"
          : normalizeStoredNickname(row.display_name) ||
            normalizeStoredNickname(profileMap.get(row.student_id)?.nickname) ||
            maskName(member?.name),
        track: summarizeTrack(member?.track),
        tone: row.student_id === studentId ? normalizeAvatarTone(row.avatar_tone) : avatarToneForId(row.student_id),
        statusMessage: normalizeStoredStatusMessage(profileMap.get(row.student_id)?.status_message),
        todaySeconds: totalsByStudent.get(row.student_id) || 0,
        isMine: row.student_id === studentId,
      };
    }),
    ranking,
    summary: {
      studiedCount: totalsByStudent.size,
      focusedCount: Array.isArray(presence) ? presence.length : 0,
    },
  };
}

async function loadStudyStats(studentId, range, now) {
  const sessions = await requestSupabase(
    "GET",
    `study_cafe_sessions?student_id=eq.${encodeURIComponent(studentId)}&started_at=gte.${encodeURIComponent(range.start)}&started_at=lt.${encodeURIComponent(range.end)}&select=id,subject_name,status,elapsed_seconds,started_at,active_started_at,ended_at,updated_at&order=started_at.asc`
  );
  const rows = Array.isArray(sessions) ? sessions : [];
  const dayMap = new Map(range.dateKeys.map((date) => [date, {
    date,
    totalSeconds: 0,
    longestSeconds: 0,
    sessionCount: 0,
    firstStartedAt: "",
    lastEndedAt: "",
    subjects: {},
  }]));
  const subjectTotals = {};

  rows.forEach((session) => {
    const dateKey = getKstDateKey(session.started_at);
    const day = dayMap.get(dateKey);
    if (!day) return;
    const seconds = getSessionElapsedSeconds(session, now);
    const subject = normalizeText(session.subject_name, 20) || "기타";
    day.totalSeconds += seconds;
    day.longestSeconds = Math.max(day.longestSeconds, seconds);
    day.sessionCount += 1;
    day.firstStartedAt = earlierIso(day.firstStartedAt, session.started_at);
    day.lastEndedAt = laterIso(
      day.lastEndedAt,
      session.ended_at ||
        (session.status === "running" ? now.toISOString() : session.updated_at || session.started_at)
    );
    day.subjects[subject] = (day.subjects[subject] || 0) + seconds;
    subjectTotals[subject] = (subjectTotals[subject] || 0) + seconds;
  });

  const days = [...dayMap.values()];
  const totalSeconds = days.reduce((sum, day) => sum + day.totalSeconds, 0);
  const studiedDays = days.filter((day) => day.totalSeconds > 0).length;
  return {
    dateFrom: range.dateKeys[0],
    dateTo: range.dateKeys[range.dateKeys.length - 1],
    days,
    subjectTotals,
    summary: {
      totalSeconds,
      studiedDays,
      dailyAverageSeconds: studiedDays ? Math.floor(totalSeconds / studiedDays) : 0,
      maxDailySeconds: days.reduce((max, day) => Math.max(max, day.totalSeconds), 0),
      sessionCount: rows.length,
    },
  };
}

async function loadStudyRanking(studentId, period, now) {
  const range = getCurrentRankingRange(period, now);
  const [sessions, profiles, presence, onlineStudents] = await Promise.all([
    requestSupabase(
      "GET",
      `study_cafe_sessions?started_at=gte.${encodeURIComponent(range.start)}&started_at=lt.${encodeURIComponent(range.end)}&select=id,student_id,status,elapsed_seconds,started_at,active_started_at,ended_at`
    ),
    requestSupabase("GET", "study_cafe_profiles?select=student_id,avatar_tone,nickname"),
    requestSupabase("GET", "study_cafe_presence?select=student_id,display_name"),
    requestSupabase("GET", "students?id=like.2*&is_active=eq.true&select=id,name"),
  ]);
  const profileMap = new Map((Array.isArray(profiles) ? profiles : []).map((row) => [row.student_id, row]));
  const presenceMap = new Map((Array.isArray(presence) ? presence : []).map((row) => [row.student_id, row]));
  const studentMap = new Map((Array.isArray(onlineStudents) ? onlineStudents : []).map((row) => [row.id, row]));
  const totals = aggregateSessionSeconds(Array.isArray(sessions) ? sessions : [], now, (row) => row.student_id);
  const ranking = [...totals.entries()]
    .map(([id, totalSeconds]) => ({
      studentId: id === studentId ? id : undefined,
      name: id === studentId
        ? "나"
        : normalizeStoredNickname(profileMap.get(id)?.nickname) ||
          normalizeStoredNickname(presenceMap.get(id)?.display_name) ||
          maskName(studentMap.get(id)?.name),
      tone: id === studentId
        ? normalizeAvatarTone(profileMap.get(id)?.avatar_tone)
        : avatarToneForId(id),
      totalSeconds,
      isMine: id === studentId,
    }))
    .filter((row) => row.totalSeconds > 0)
    .sort((a, b) => b.totalSeconds - a.totalSeconds)
    .map((row, index, rows) => ({
      ...row,
      rank: index + 1,
      percentile: Math.max(1, Math.ceil(((index + 1) / Math.max(1, rows.length)) * 100)),
    }));
  return {
    period,
    dateFrom: range.dateKeys[0],
    dateTo: range.dateKeys[range.dateKeys.length - 1],
    ranking,
    summary: {
      studiedCount: totals.size,
      focusedCount: Array.isArray(presence) ? presence.length : 0,
    },
  };
}

async function clearStalePresence(now) {
  const cutoff = new Date(now.getTime() - PRESENCE_STALE_MS).toISOString();
  const staleRows = await requestSupabase(
    "GET",
    `study_cafe_presence?last_heartbeat_at=lt.${encodeURIComponent(cutoff)}&select=student_id,status,last_heartbeat_at,updated_at`
  );
  for (const row of Array.isArray(staleRows) ? staleRows : []) {
    const idleActivityAt = new Date(row.updated_at);
    const isIdle = row.status === "seated" || row.status === "paused";
    if (
      isIdle &&
      !Number.isNaN(idleActivityAt.getTime()) &&
      now.getTime() - idleActivityAt.getTime() < IDLE_PRESENCE_STALE_MS
    ) {
      continue;
    }
    const lastHeartbeatAt = new Date(row.last_heartbeat_at);
    const staleEndedAt = Number.isNaN(lastHeartbeatAt.getTime())
      ? now
      : new Date(Math.min(now.getTime(), lastHeartbeatAt.getTime() + PRESENCE_HEARTBEAT_GRACE_MS));
    await rolloverActiveSessionIfNeeded(row.student_id, staleEndedAt);
    await completeActiveSession(row.student_id, staleEndedAt);
    await requestSupabase(
      "DELETE",
      `study_cafe_presence?student_id=eq.${encodeURIComponent(row.student_id)}`
    );
  }
}

async function getOwnPresence(studentId) {
  const rows = await requestSupabase(
    "GET",
    `study_cafe_presence?student_id=eq.${encodeURIComponent(studentId)}&select=student_id,seat_number,status,current_subject,avatar_tone,display_name,last_heartbeat_at,updated_at&limit=1`
  );
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function getOwnStudyRoomMembership(studentId) {
  const rows = await requestSupabase(
    "GET",
    `study_cafe_room_members?student_id=eq.${encodeURIComponent(studentId)}&select=room_id,student_id,role,seat_number&limit=1`
  );
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function leaveOwnStudyRoom(student, now) {
  const membership = await getOwnStudyRoomMembership(student.id);
  if (!membership) return;
  await requestSupabase("POST", "rpc/leave_study_cafe_room", {
    p_room_id: membership.room_id,
    p_student_id: student.id,
    p_display_name: maskName(student.name),
  });
  await broadcastStudyCafeStateChange("room", {
    roomId: membership.room_id,
    changedAt: now.toISOString(),
  });
}

async function getActiveSession(studentId) {
  const rows = await requestSupabase(
    "GET",
    `study_cafe_sessions?student_id=eq.${encodeURIComponent(studentId)}&status=in.(running,paused)&select=id,student_id,subject_name,status,elapsed_seconds,started_at,active_started_at,ended_at&order=started_at.desc&limit=1`
  );
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function rolloverActiveSessionIfNeeded(studentId, now) {
  const session = await getActiveSession(studentId);
  if (!session || getKstDateKey(session.started_at) === getKstDateKey(now)) return session;

  const boundary = kstDateKeyToUtc(getKstDateKey(now));
  const elapsedSeconds = getSessionElapsedSeconds(session, boundary);
  await requestSupabase(
    "PATCH",
    `study_cafe_sessions?id=eq.${encodeURIComponent(session.id)}`,
    {
      status: "completed",
      elapsed_seconds: elapsedSeconds,
      active_started_at: null,
      ended_at: boundary.toISOString(),
      updated_at: boundary.toISOString(),
    },
    { Prefer: "return=minimal" }
  );

  try {
    const continuedRows = await requestSupabase(
      "POST",
      "study_cafe_sessions",
      {
        student_id: studentId,
        subject_name: session.subject_name,
        status: session.status,
        elapsed_seconds: 0,
        started_at: boundary.toISOString(),
        active_started_at: session.status === "running" ? boundary.toISOString() : null,
        updated_at: now.toISOString(),
      },
      { Prefer: "return=representation" }
    );
    return continuedRows?.[0] || null;
  } catch (error) {
    if (error.storeStatus === 409) return getActiveSession(studentId);
    throw error;
  }
}

async function completeActiveSession(studentId, now) {
  const session = await getActiveSession(studentId);
  if (!session) return null;
  const elapsedSeconds = getSessionElapsedSeconds(session, now);
  const rows = await requestSupabase(
    "PATCH",
    `study_cafe_sessions?id=eq.${encodeURIComponent(session.id)}`,
    {
      status: "completed",
      elapsed_seconds: elapsedSeconds,
      active_started_at: null,
      ended_at: now.toISOString(),
      updated_at: now.toISOString(),
    },
    { Prefer: "return=representation" }
  );
  return rows?.[0] || { ...session, status: "completed", elapsed_seconds: elapsedSeconds, ended_at: now.toISOString() };
}

async function completeSubjectGoal(studentId, subject, now) {
  const studyDate = getKstDateKey(now);
  const goals = await requestSupabase(
    "GET",
    `study_cafe_subject_goals?student_id=eq.${encodeURIComponent(studentId)}&study_date=eq.${studyDate}&subject_name=eq.${encodeURIComponent(subject)}&select=study_date,subject_name,target_minutes,result_status,completed_elapsed_seconds,completed_at&limit=1`
  );
  const goal = Array.isArray(goals) ? goals[0] : null;
  if (!goal) return null;
  const bounds = getKstDayBounds(now);
  const sessions = await requestSupabase(
    "GET",
    `study_cafe_sessions?student_id=eq.${encodeURIComponent(studentId)}&subject_name=eq.${encodeURIComponent(subject)}&started_at=gte.${encodeURIComponent(bounds.start)}&started_at=lt.${encodeURIComponent(bounds.end)}&select=status,elapsed_seconds,active_started_at`
  );
  const completedElapsedSeconds = (Array.isArray(sessions) ? sessions : []).reduce(
    (total, row) => total + getSessionElapsedSeconds(row, now),
    0
  );
  const resultStatus = completedElapsedSeconds <= Number(goal.target_minutes) * 60
    ? "on_time"
    : "overtime";
  const rows = await requestSupabase(
    "PATCH",
    `study_cafe_subject_goals?student_id=eq.${encodeURIComponent(studentId)}&study_date=eq.${studyDate}&subject_name=eq.${encodeURIComponent(subject)}`,
    {
      result_status: resultStatus,
      completed_elapsed_seconds: completedElapsedSeconds,
      completed_at: now.toISOString(),
      updated_at: now.toISOString(),
    },
    { Prefer: "return=representation" }
  );
  return rows?.[0] || null;
}

function updatePresence(studentId, changes) {
  return requestSupabase(
    "PATCH",
    `study_cafe_presence?student_id=eq.${encodeURIComponent(studentId)}`,
    changes,
    { Prefer: "return=minimal" }
  );
}

function upsertProfile(studentId, avatarTone, nickname, statusMessage, now) {
  const profile = { student_id: studentId, avatar_tone: avatarTone, updated_at: now.toISOString() };
  if (nickname !== undefined) profile.nickname = nickname;
  if (statusMessage !== undefined) profile.status_message = statusMessage || null;
  return requestSupabase(
    "POST",
    "study_cafe_profiles?on_conflict=student_id",
    profile,
    { Prefer: "resolution=merge-duplicates,return=minimal" }
  );
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
    const error = new Error("study_cafe_store_unavailable");
    error.status = response.status === 404 ? 503 : 502;
    error.storeStatus = response.status;
    error.detail = await response.text().catch(() => "");
    throw error;
  }
  if (response.status === 204) return null;
  return response.json().catch(() => null);
}

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function hashDeviceToken(deviceToken) {
  return crypto.createHash("sha256").update(deviceToken).digest("hex");
}

function normalizeText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeSubject(value) {
  const subject = normalizeText(value, 20);
  if (!subject) {
    const error = new Error("invalid_subject");
    error.status = 400;
    throw error;
  }
  return subject;
}

function normalizeSubjects(value) {
  if (!Array.isArray(value)) {
    const error = new Error("invalid_subjects");
    error.status = 400;
    throw error;
  }
  const subjects = value.map(normalizeSubject);
  if (!subjects.length || subjects.length > 8 || new Set(subjects).size !== subjects.length) {
    const error = new Error("invalid_subjects");
    error.status = 400;
    throw error;
  }
  return subjects;
}

function normalizeTodoContent(value) {
  const content = normalizeText(value, 80);
  if (!content) {
    const error = new Error("invalid_todo_content");
    error.status = 400;
    throw error;
  }
  return content;
}

function normalizeTodoId(value) {
  const todoId = normalizeText(value, 64);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(todoId)) {
    const error = new Error("invalid_todo_id");
    error.status = 400;
    throw error;
  }
  return todoId;
}

function normalizeTodoStudyDate(value, now = new Date()) {
  const today = getKstDateKey(now);
  const studyDate = normalizeText(value, 10) || today;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(studyDate);
  const year = Number(match?.[1]);
  const month = Number(match?.[2]);
  const day = Number(match?.[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  const isValid =
    Boolean(match) &&
    year >= 2020 &&
    year <= 2100 &&
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day;
  if (!isValid) {
    const error = new Error("invalid_todo_study_date");
    error.status = 400;
    throw error;
  }
  return studyDate;
}

function normalizeTodoMonthKey(value, now = new Date()) {
  const currentMonth = getKstDateKey(now).slice(0, 7);
  const monthKey = normalizeText(value, 7) || currentMonth;
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  const year = Number(match?.[1]);
  const month = Number(match?.[2]);
  if (!match || year < 2020 || year > 2100 || month < 1 || month > 12) {
    const error = new Error("invalid_todo_month");
    error.status = 400;
    throw error;
  }
  return monthKey;
}

function getTodoMonthBounds(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  const nextMonth = new Date(Date.UTC(year, month, 1));
  return {
    startDate: `${monthKey}-01`,
    endDate: `${nextMonth.getUTCFullYear()}-${String(nextMonth.getUTCMonth() + 1).padStart(2, "0")}-01`,
  };
}

function summarizeTodoMonth(rows) {
  const summaries = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const studyDate = normalizeDateKey(row?.study_date);
    if (!studyDate) return;
    const summary = summaries.get(studyDate) || { studyDate, total: 0, completed: 0 };
    summary.total += 1;
    if (row.is_completed === true) summary.completed += 1;
    summaries.set(studyDate, summary);
  });
  return [...summaries.values()];
}

function normalizeSubjectGoalMinutes(value) {
  const minutes = Number(value);
  if (minutes === 0) return 0;
  if (!Number.isInteger(minutes) || minutes < 60 || minutes > 600 || minutes % 60 !== 0) {
    const error = new Error("invalid_subject_goal_minutes");
    error.status = 400;
    throw error;
  }
  return minutes;
}

function normalizeSeatNumber(value) {
  const seatNumber = Number(value);
  if (!Number.isInteger(seatNumber) || seatNumber < 1 || seatNumber > MAX_SEAT_NUMBER) {
    const error = new Error("invalid_seat");
    error.status = 400;
    throw error;
  }
  return seatNumber;
}

function normalizeAvatarTone(value) {
  const tone = normalizeText(value, 20);
  return AVATAR_TONES.has(tone) ? tone : "navy";
}

function normalizeNickname(value) {
  const nickname = String(value || "").trim().replace(/\s+/g, " ");
  if (
    nickname.length < 2 ||
    nickname.length > 10 ||
    !/^[가-힣A-Za-z0-9 ]+$/.test(nickname)
  ) {
    const error = new Error("invalid_nickname");
    error.status = 400;
    throw error;
  }
  return nickname;
}

function normalizeStoredNickname(value) {
  const nickname = String(value || "").trim().replace(/\s+/g, " ");
  return nickname.length >= 2 && nickname.length <= 10 && /^[가-힣A-Za-z0-9 ]+$/.test(nickname)
    ? nickname
    : "";
}

function normalizeStatusMessage(value) {
  const statusMessage = String(value || "").trim().replace(/\s+/g, " ");
  if (statusMessage.length > 40) {
    const error = new Error("invalid_status_message");
    error.status = 400;
    throw error;
  }
  return statusMessage;
}

function normalizeStoredStatusMessage(value) {
  const statusMessage = String(value || "").trim().replace(/\s+/g, " ");
  return statusMessage.length <= 40 ? statusMessage : "";
}

function getSessionElapsedSeconds(session, now = new Date()) {
  const saved = Math.max(0, Number(session?.elapsed_seconds) || 0);
  if (session?.status !== "running" || !session.active_started_at) return Math.floor(saved);
  const activeMs = Math.max(0, now.getTime() - new Date(session.active_started_at).getTime());
  return Math.floor(saved + activeMs / 1000);
}

function serializeSession(session, now) {
  if (!session) return null;
  return {
    id: session.id,
    subject: session.subject_name,
    status: session.status,
    elapsedSeconds: getSessionElapsedSeconds(session, now),
    startedAt: session.started_at,
    activeStartedAt: session.active_started_at,
    endedAt: session.ended_at,
  };
}

function serializeTodo(todo) {
  if (!todo) return null;
  return {
    id: todo.id,
    studyDate: todo.study_date,
    subject: todo.subject_name,
    content: todo.content,
    completed: todo.is_completed === true,
    completedAt: todo.completed_at || null,
    createdAt: todo.created_at,
  };
}

function serializeSubjectGoal(goal) {
  if (!goal) return null;
  return {
    studyDate: goal.study_date,
    subject: goal.subject_name,
    targetMinutes: Number(goal.target_minutes) || 0,
    resultStatus: goal.result_status || null,
    completedElapsedSeconds: Math.max(0, Number(goal.completed_elapsed_seconds) || 0),
    completedAt: goal.completed_at || null,
  };
}

function serializeOwnPresence(row) {
  return {
    seatNumber: Number(row.seat_number),
    status: row.status,
    currentSubject: row.current_subject || "",
    avatarTone: normalizeAvatarTone(row.avatar_tone),
    displayName: normalizeStoredNickname(row.display_name),
    lastHeartbeatAt: row.last_heartbeat_at,
    idleSince: row.updated_at,
  };
}

function aggregateSessionSeconds(rows, now, keyFn) {
  const totals = new Map();
  rows.forEach((row) => {
    const key = keyFn(row);
    if (!key) return;
    totals.set(key, (totals.get(key) || 0) + getSessionElapsedSeconds(row, now));
  });
  return totals;
}

function getKstDayBounds(now = new Date()) {
  const studyDate = new Date(
    now.getTime() + (9 - STUDY_DAY_START_HOUR_KST) * 60 * 60 * 1000
  );
  const year = studyDate.getUTCFullYear();
  const month = studyDate.getUTCMonth();
  const day = studyDate.getUTCDate();
  return {
    start: new Date(Date.UTC(year, month, day, STUDY_DAY_START_HOUR_KST - 9)).toISOString(),
    end: new Date(Date.UTC(year, month, day + 1, STUDY_DAY_START_HOUR_KST - 9)).toISOString(),
  };
}

function normalizeRankingPeriod(value) {
  const period = normalizeText(value, 10);
  if (!["daily", "weekly", "monthly"].includes(period)) {
    const error = new Error("invalid_ranking_period");
    error.status = 400;
    throw error;
  }
  return period;
}

function getCurrentRankingRange(period, now = new Date()) {
  const currentDateKey = getKstDateKey(now);
  const [year, month, day] = currentDateKey.split("-").map(Number);
  const current = new Date(Date.UTC(year, month - 1, day));
  const from = new Date(current);
  if (period === "weekly") {
    const weekday = from.getUTCDay() || 7;
    from.setUTCDate(from.getUTCDate() - weekday + 1);
  } else if (period === "monthly") {
    from.setUTCDate(1);
  }
  const fromKey = [
    from.getUTCFullYear(),
    String(from.getUTCMonth() + 1).padStart(2, "0"),
    String(from.getUTCDate()).padStart(2, "0"),
  ].join("-");
  return normalizeStatsRange(fromKey, currentDateKey);
}

function normalizeStatsRange(dateFrom, dateTo) {
  const from = normalizeDateKey(dateFrom);
  const to = normalizeDateKey(dateTo);
  if (!from || !to) {
    const error = new Error("invalid_stats_range");
    error.status = 400;
    throw error;
  }
  const fromStart = kstDateKeyToUtc(from);
  const toStart = kstDateKeyToUtc(to);
  const dayCount = Math.floor((toStart.getTime() - fromStart.getTime()) / 86400000) + 1;
  if (dayCount < 1 || dayCount > 62) {
    const error = new Error("invalid_stats_range");
    error.status = 400;
    throw error;
  }
  const dateKeys = Array.from({ length: dayCount }, (_, index) =>
    getKstDateKey(new Date(fromStart.getTime() + index * 86400000))
  );
  return {
    start: fromStart.toISOString(),
    end: new Date(toStart.getTime() + 86400000).toISOString(),
    dateKeys,
  };
}

function normalizeDateKey(value) {
  const dateKey = normalizeText(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return "";
  const date = kstDateKeyToUtc(dateKey);
  return getKstDateKey(date) === dateKey ? dateKey : "";
}

function kstDateKeyToUtc(dateKey) {
  const [year, month, day] = String(dateKey || "").split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, STUDY_DAY_START_HOUR_KST - 9));
}

function getKstDateKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const kst = new Date(
    date.getTime() + (9 - STUDY_DAY_START_HOUR_KST) * 60 * 60 * 1000
  );
  return [
    kst.getUTCFullYear(),
    String(kst.getUTCMonth() + 1).padStart(2, "0"),
    String(kst.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function earlierIso(current, candidate) {
  if (!candidate) return current || "";
  if (!current) return candidate;
  return new Date(candidate).getTime() < new Date(current).getTime() ? candidate : current;
}

function laterIso(current, candidate) {
  if (!candidate) return current || "";
  if (!current) return candidate;
  return new Date(candidate).getTime() > new Date(current).getTime() ? candidate : current;
}

function maskName(value) {
  const name = normalizeText(value, 40);
  if (!name) return "익명";
  if (name === "나" || name.includes("○")) return name;
  if (name.length === 1) return `${name}○`;
  return `${name[0]}${"○".repeat(Math.min(2, name.length - 1))}`;
}

function summarizeTrack(value) {
  const track = normalizeText(value, 80)
    .replace(/^(경찰직|일반직)\s*-\s*/, "")
    .replace(/\s+/g, " ");
  const rules = [
    [/해상교통관제|선박교통관제/, "VTS"],
    [/해경학과\s*항해/, "학과·항해"],
    [/해경학과\s*기관/, "학과·기관"],
    [/함정요원\s*항해/, "함정·항해"],
    [/함정요원\s*기관/, "함정·기관"],
    [/정보통신\s*전산/, "전산"],
    [/정보통신\s*통신/, "통신"],
    [/공채/, "공채"],
    [/구조/, "구조"],
    [/구급/, "구급"],
  ];
  const match = rules.find(([pattern]) => pattern.test(track));
  if (match) return match[1];
  return track ? (track.length > 10 ? `${track.slice(0, 9)}…` : track) : "온라인 수강";
}

function avatarToneForId(studentId) {
  const tones = [...AVATAR_TONES];
  const hash = crypto.createHash("sha256").update(String(studentId || "")).digest();
  return tones[hash[0] % tones.length];
}

module.exports._private = {
  aggregateSessionSeconds,
  getCurrentRankingRange,
  getKstDayBounds,
  getKstDateKey,
  getSessionElapsedSeconds,
  hashDeviceToken,
  maskName,
  normalizeAvatarTone,
  normalizeNickname,
  normalizeStatusMessage,
  normalizeRankingPeriod,
  normalizeSeatNumber,
  normalizeStatsRange,
  normalizeTodoContent,
  normalizeTodoId,
  normalizeTodoMonthKey,
  normalizeTodoStudyDate,
  rolloverActiveSessionIfNeeded,
  normalizeSubject,
  normalizeSubjects,
  getTodoMonthBounds,
  summarizeTodoMonth,
  summarizeTrack,
};
