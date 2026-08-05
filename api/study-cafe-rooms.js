const crypto = require("crypto");

const ACTIONS = new Set([
  "list",
  "load",
  "create",
  "join",
  "leave",
  "claim_seat",
  "release_seat",
  "update",
  "kick",
  "close",
  "message_send",
  "message_delete",
  "messages_read",
  "heartbeat",
]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MESSAGE_WINDOW_MS = 10 * 1000;
const MESSAGE_WINDOW_LIMIT = 8;
const ROOM_ACTIVE_STALE_MS = 2 * 60 * 1000;
const ROOM_IDLE_STALE_MS = 15 * 60 * 1000 + 10 * 1000;

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  try {
    const body = await readJson(req);
    const action = normalizeText(body.action, 40);
    if (!ACTIONS.has(action)) return sendError(res, 400, "unsupported_action");

    const studentId = normalizeText(body.studentId, 64);
    const deviceToken = normalizeText(body.deviceToken, 256);
    if (!studentId || !deviceToken) return sendError(res, 400, "missing_required_fields");
    const student = await authenticateStudent(studentId, deviceToken, body.client);
    if (!student) return sendError(res, 403, "device_not_active");
    if (!hasStudyCafeAccess(student)) return sendError(res, 403, "online_student_only");
    await clearStaleRoomSeats();

    if (action === "list") {
      res.status(200).json({ ok: true, ...(await listRooms(studentId)) });
      return;
    }
    if (action === "load") {
      res.status(200).json({ ok: true, ...(await loadOwnRoom(student)) });
      return;
    }
    if (action === "create") {
      const room = normalizeRoomInput(body);
      const passwordRecord = room.accessType === "password" ? hashRoomPassword(room.password) : null;
      const roomId = await callRpc("create_study_cafe_room", {
        p_host_student_id: studentId,
        p_name: room.name,
        p_description: room.description,
        p_capacity: room.capacity,
        p_theme: room.theme,
        p_access_type: room.accessType,
        p_password_hash: passwordRecord?.hash || null,
        p_password_salt: passwordRecord?.salt || null,
      });
      await completeActiveSession(studentId);
      await releasePublicSeat(studentId);
      await broadcastRoomChange(roomId, "room-created");
      res.status(200).json({ ok: true, roomId });
      return;
    }

    const roomId = normalizeUuid(body.roomId, "invalid_room_id");
    if (action === "join") {
      const room = await getRoom(roomId, true);
      if (!room?.is_active) return sendError(res, 404, "room_not_found");
      if (room.access_type === "password" && !verifyRoomPassword(body.password, room)) {
        return sendError(res, 403, "room_password_invalid");
      }
      await callRpc("join_study_cafe_room", {
        p_room_id: roomId,
        p_student_id: studentId,
        p_display_name: displayNameForStudent(student),
      });
      await completeActiveSession(studentId);
      await releasePublicSeat(studentId);
      await broadcastRoomChange(roomId, "member-joined");
      res.status(200).json({ ok: true, roomId });
      return;
    }

    const membership = await requireMembership(roomId, studentId);
    if (action === "claim_seat") {
      const room = await getRoom(roomId);
      const seatNumber = normalizeRoomSeat(body.seatNumber, room?.capacity);
      await callRpc("claim_study_cafe_room_seat", {
        p_room_id: roomId,
        p_student_id: studentId,
        p_seat_number: seatNumber,
      });
      await releasePublicSeat(studentId);
      await broadcastRoomChange(roomId, "seat-changed");
      res.status(200).json({ ok: true, seatNumber });
      return;
    }
    if (action === "release_seat") {
      await requestStore("PATCH", memberPath(roomId, studentId), {
        seat_number: null,
        updated_at: new Date().toISOString(),
      });
      await completeActiveSession(studentId);
      await broadcastRoomChange(roomId, "seat-released");
      res.status(200).json({ ok: true });
      return;
    }
    if (action === "heartbeat") {
      await requestStore("PATCH", memberPath(roomId, studentId), { updated_at: new Date().toISOString() });
      res.status(200).json({ ok: true, serverNow: new Date().toISOString() });
      return;
    }
    if (action === "messages_read") {
      await requestStore("PATCH", memberPath(roomId, studentId), {
        last_read_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      res.status(200).json({ ok: true });
      return;
    }
    if (action === "message_send") {
      const message = normalizeMessage(body.message);
      await enforceMessageRateLimit(roomId, studentId);
      const rows = await requestStore("POST", "study_cafe_room_messages", {
        room_id: roomId,
        student_id: studentId,
        message_type: "chat",
        message_text: message,
      }, { Prefer: "return=representation" });
      await requestStore("PATCH", memberPath(roomId, studentId), {
        last_read_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      await broadcastRoomChange(roomId, "message");
      res.status(200).json({ ok: true, message: serializeMessage(rows?.[0], studentId, new Map([[studentId, displayNameForStudent(student)]])) });
      return;
    }
    if (action === "message_delete") {
      const messageId = normalizeUuid(body.messageId, "invalid_message_id");
      const rows = await requestStore("GET", `study_cafe_room_messages?id=eq.${messageId}&room_id=eq.${roomId}&select=id,student_id,deleted_at&limit=1`);
      const message = rows?.[0];
      if (!message) return sendError(res, 404, "message_not_found");
      if (message.student_id !== studentId && membership.role !== "host") {
        return sendError(res, 403, "room_host_required");
      }
      await requestStore("PATCH", `study_cafe_room_messages?id=eq.${messageId}&room_id=eq.${roomId}`, {
        deleted_at: new Date().toISOString(),
        deleted_by_student_id: studentId,
      });
      await broadcastRoomChange(roomId, "message-deleted");
      res.status(200).json({ ok: true, messageId });
      return;
    }
    if (action === "leave") {
      await callRpc("leave_study_cafe_room", {
        p_room_id: roomId,
        p_student_id: studentId,
        p_display_name: displayNameForStudent(student),
      });
      await completeActiveSession(studentId);
      await broadcastRoomChange(roomId, "member-left");
      res.status(200).json({ ok: true });
      return;
    }

    if (membership.role !== "host") return sendError(res, 403, "room_host_required");
    if (action === "update") {
      const existing = await getRoom(roomId, true);
      const room = normalizeRoomInput(body, { passwordOptional: true, current: existing });
      const changes = {
        name: room.name,
        description: room.description,
        capacity: room.capacity,
        theme: room.theme,
        access_type: room.accessType,
        updated_at: new Date().toISOString(),
      };
      if (room.accessType === "public") {
        changes.password_hash = null;
        changes.password_salt = null;
      } else if (room.password) {
        const passwordRecord = hashRoomPassword(room.password);
        changes.password_hash = passwordRecord.hash;
        changes.password_salt = passwordRecord.salt;
      } else if (!existing?.password_hash) {
        return sendError(res, 400, "invalid_room_password");
      }
      const occupiedBeyondCapacity = await requestStore("GET", `study_cafe_room_members?room_id=eq.${roomId}&seat_number=gt.${room.capacity}&select=student_id&limit=1`);
      if (occupiedBeyondCapacity?.length) return sendError(res, 409, "room_capacity_has_seats");
      const memberRows = await requestStore("GET", `study_cafe_room_members?room_id=eq.${roomId}&select=student_id`);
      if ((memberRows || []).length > room.capacity) return sendError(res, 409, "room_capacity_has_members");
      await requestStore("PATCH", `study_cafe_rooms?id=eq.${roomId}`, changes);
      await broadcastRoomChange(roomId, "room-updated");
      res.status(200).json({ ok: true });
      return;
    }
    if (action === "kick") {
      const targetStudentId = normalizeText(body.targetStudentId, 64);
      if (!targetStudentId || targetStudentId === studentId) return sendError(res, 400, "invalid_kick_target");
      const target = await requireMembership(roomId, targetStudentId);
      if (target.role === "host") return sendError(res, 400, "invalid_kick_target");
      await requestStore("DELETE", memberPath(roomId, targetStudentId));
      await createSystemMessage(roomId, "구성원 한 명이 방에서 내보내졌습니다.");
      await completeActiveSession(targetStudentId);
      await broadcastRoomChange(roomId, "member-kicked");
      res.status(200).json({ ok: true });
      return;
    }
    if (action === "close") {
      await requestStore("PATCH", `study_cafe_rooms?id=eq.${roomId}`, {
        is_active: false,
        closed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      const memberRows = await requestStore("GET", `study_cafe_room_members?room_id=eq.${roomId}&select=student_id`);
      await requestStore("DELETE", `study_cafe_room_members?room_id=eq.${roomId}`);
      await Promise.all((memberRows || []).map((row) => completeActiveSession(row.student_id)));
      await broadcastRoomChange(roomId, "room-closed");
      res.status(200).json({ ok: true });
    }
  } catch (error) {
    console.error(error);
    const known = extractStoreError(error);
    res.status(known.status).json({ ok: false, error: known.code });
  }
};

async function listRooms(studentId) {
  const [rooms, members, ownMembership] = await Promise.all([
    requestStore("GET", "study_cafe_rooms?is_active=eq.true&select=id,name,description,capacity,theme,access_type,host_student_id,created_at,updated_at&order=updated_at.desc&limit=100"),
    requestStore("GET", "study_cafe_room_members?select=room_id,student_id,seat_number"),
    requestStore("GET", `study_cafe_room_members?student_id=eq.${encodeURIComponent(studentId)}&select=room_id,role,seat_number&limit=1`),
  ]);
  const counts = new Map();
  (members || []).forEach((member) => counts.set(member.room_id, (counts.get(member.room_id) || 0) + 1));
  return {
    rooms: (rooms || []).map((room) => ({
      id: room.id,
      name: room.name,
      description: room.description || "",
      capacity: Number(room.capacity),
      theme: room.theme || "dawn",
      memberCount: counts.get(room.id) || 0,
      locked: room.access_type === "password",
      isMine: ownMembership?.[0]?.room_id === room.id,
      full: (counts.get(room.id) || 0) >= Number(room.capacity),
    })),
    membership: ownMembership?.[0] ? {
      roomId: ownMembership[0].room_id,
      role: ownMembership[0].role,
      seatNumber: Number(ownMembership[0].seat_number) || null,
    } : null,
  };
}

async function loadOwnRoom(student) {
  const studentId = student.id;
  const ownRows = await requestStore("GET", `study_cafe_room_members?student_id=eq.${encodeURIComponent(studentId)}&select=room_id,role,seat_number,last_read_at&limit=1`);
  const own = ownRows?.[0];
  if (!own) return { room: null };
  const room = await getRoom(own.room_id);
  if (!room?.is_active) return { room: null };
  const studyBounds = getStudyRoomDayBounds();
  const [members, profiles, students, messages, sessions] = await Promise.all([
    requestStore("GET", `study_cafe_room_members?room_id=eq.${room.id}&select=student_id,role,seat_number,joined_at,updated_at&order=joined_at.asc`),
    requestStore("GET", "study_cafe_profiles?select=student_id,avatar_tone,nickname,status_message"),
    requestStore("GET", "students?id=like.2*&is_active=eq.true&select=id,name,track"),
    requestStore("GET", `study_cafe_room_messages?room_id=eq.${room.id}&select=id,student_id,message_type,message_text,created_at,deleted_at&order=created_at.desc&limit=100`),
    requestStore("GET", `study_cafe_sessions?started_at=gte.${encodeURIComponent(studyBounds.start)}&started_at=lt.${encodeURIComponent(studyBounds.end)}&select=student_id,subject_name,status,elapsed_seconds,active_started_at`),
  ]);
  const profileMap = new Map((profiles || []).map((row) => [row.student_id, row]));
  const studentMap = new Map((students || []).map((row) => [row.id, row]));
  const sessionMap = new Map((sessions || []).filter((row) => ["running", "paused"].includes(row.status)).map((row) => [row.student_id, row]));
  const totalsByStudent = new Map();
  (sessions || []).forEach((session) => {
    totalsByStudent.set(
      session.student_id,
      (totalsByStudent.get(session.student_id) || 0) + getStudyRoomSessionSeconds(session)
    );
  });
  const nameMap = new Map();
  const serializedMembers = (members || []).map((member) => {
    const source = studentMap.get(member.student_id) || {};
    const profile = profileMap.get(member.student_id) || {};
    const name = normalizeStoredNickname(profile.nickname) || maskName(source.name);
    nameMap.set(member.student_id, name);
    const session = sessionMap.get(member.student_id);
    return {
      studentId: own.role === "host" || member.student_id === studentId ? member.student_id : undefined,
      name: member.student_id === studentId ? "나" : name,
      track: summarizeTrack(source.track),
      tone: normalizeTone(profile.avatar_tone, member.student_id),
      statusMessage: normalizeText(profile.status_message, 40),
      role: member.role,
      seatNumber: Number(member.seat_number) || null,
      status: session?.status === "running" ? "studying" : session?.status === "paused" ? "paused" : "seated",
      currentSubject: member.student_id === studentId ? session?.subject_name || "" : "",
      todaySeconds: totalsByStudent.get(member.student_id) || 0,
      isMine: member.student_id === studentId,
    };
  });
  const orderedMessages = (messages || []).slice().reverse();
  return {
    room: {
      id: room.id,
      name: room.name,
      description: room.description || "",
      capacity: Number(room.capacity),
      theme: room.theme || "dawn",
      locked: room.access_type === "password",
      role: own.role,
      mySeatNumber: Number(own.seat_number) || null,
      members: serializedMembers,
      messages: orderedMessages.map((message) => serializeMessage(message, studentId, nameMap)),
      unreadCount: orderedMessages.filter((message) => new Date(message.created_at) > new Date(own.last_read_at)).length,
    },
  };
}

function normalizeRoomInput(body, options = {}) {
  const name = normalizeText(body.name ?? options.current?.name, 20).replace(/\s+/g, " ");
  const description = normalizeText(body.description ?? options.current?.description, 50).replace(/\s+/g, " ");
  const capacity = Number(body.capacity ?? options.current?.capacity);
  const theme = normalizeText(body.theme ?? options.current?.theme ?? "oak", 20);
  const accessType = normalizeText(body.accessType ?? options.current?.access_type, 20);
  const password = String(body.password || "").trim();
  if (name.length < 2 || name.length > 20) throw clientError("invalid_room_name");
  if (!Number.isInteger(capacity) || capacity < 2 || capacity > 20) throw clientError("invalid_room_capacity");
  if (!["oak", "dawn", "forest", "night", "classic"].includes(theme)) throw clientError("invalid_room_theme");
  if (!['public', 'password'].includes(accessType)) throw clientError("invalid_room_access");
  if (accessType === "password" && !options.passwordOptional && !isValidRoomPassword(password)) throw clientError("invalid_room_password");
  if (password && !isValidRoomPassword(password)) throw clientError("invalid_room_password");
  return { name, description, capacity, theme, accessType, password };
}

function isValidRoomPassword(value) {
  return /^(?:\d{4}|[A-Za-z0-9]{4,12})$/.test(String(value || ""));
}

function hashRoomPassword(value, salt = crypto.randomBytes(16).toString("hex")) {
  return { salt, hash: crypto.scryptSync(String(value), salt, 32).toString("hex") };
}

function verifyRoomPassword(value, room) {
  if (!isValidRoomPassword(value) || !room?.password_hash || !room?.password_salt) return false;
  const actual = hashRoomPassword(value, room.password_salt).hash;
  const expectedBuffer = Buffer.from(room.password_hash, "hex");
  const actualBuffer = Buffer.from(actual, "hex");
  return expectedBuffer.length === actualBuffer.length && crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

function normalizeMessage(value) {
  const message = String(value || "").trim().replace(/\r\n?/g, "\n");
  if (!message || message.length > 300) throw clientError("invalid_room_message");
  return message;
}

function normalizeRoomSeat(value, capacity) {
  const seat = Number(value);
  if (!Number.isInteger(seat) || seat < 1 || seat > Number(capacity)) throw clientError("invalid_room_seat");
  return seat;
}

function normalizeUuid(value, code) {
  const id = normalizeText(value, 64);
  if (!UUID_PATTERN.test(id)) throw clientError(code);
  return id;
}

function hasStudyCafeAccess(student) {
  const category = String(student?.student_category || "").trim();
  if (["online_managed", "lecture"].includes(category)) return true;
  return !category && String(student?.id || "").startsWith("2");
}

async function authenticateStudent(studentId, deviceToken, client) {
  const validation = await requestStore("POST", "rpc/validate_student_device", {
    p_student_id: studentId,
    p_device_token_hash: crypto.createHash("sha256").update(deviceToken).digest("hex"),
    p_client_display_mode: normalizeText(client?.displayMode, 40) || null,
    p_client_user_agent: normalizeText(client?.userAgent, 500) || null,
  });
  if (!validation?.valid) return null;
  const rows = await requestStore("GET", `students?id=eq.${encodeURIComponent(studentId)}&is_active=eq.true&select=id,name,track,student_category&limit=1`);
  return rows?.[0] || null;
}

async function getRoom(roomId, includeSecret = false) {
  const secret = includeSecret ? ",password_hash,password_salt" : "";
  const rows = await requestStore("GET", `study_cafe_rooms?id=eq.${roomId}&select=id,name,description,capacity,theme,access_type,host_student_id,is_active${secret}&limit=1`);
  return rows?.[0] || null;
}

async function requireMembership(roomId, studentId) {
  const rows = await requestStore("GET", `${memberPath(roomId, studentId)}&select=room_id,student_id,role,seat_number&limit=1`);
  if (!rows?.[0]) throw forbiddenError("room_membership_required");
  return rows[0];
}

function memberPath(roomId, studentId) {
  return `study_cafe_room_members?room_id=eq.${roomId}&student_id=eq.${encodeURIComponent(studentId)}`;
}

async function enforceMessageRateLimit(roomId, studentId) {
  const cutoff = new Date(Date.now() - MESSAGE_WINDOW_MS).toISOString();
  const rows = await requestStore("GET", `study_cafe_room_messages?room_id=eq.${roomId}&student_id=eq.${encodeURIComponent(studentId)}&message_type=eq.chat&created_at=gte.${encodeURIComponent(cutoff)}&select=id`);
  if ((rows || []).length >= MESSAGE_WINDOW_LIMIT) {
    const error = new Error("message_rate_limited");
    error.status = 429;
    throw error;
  }
}

async function releasePublicSeat(studentId) {
  await requestStore("DELETE", `study_cafe_presence?student_id=eq.${encodeURIComponent(studentId)}`);
}

async function clearStaleRoomSeats(now = new Date()) {
  const activeCutoff = new Date(now.getTime() - ROOM_ACTIVE_STALE_MS).toISOString();
  const idleCutoffMs = now.getTime() - ROOM_IDLE_STALE_MS;
  const staleMembers = await requestStore(
    "GET",
    `study_cafe_room_members?seat_number=not.is.null&updated_at=lt.${encodeURIComponent(activeCutoff)}&select=room_id,student_id,updated_at&limit=50`
  );
  for (const member of staleMembers || []) {
    const sessions = await requestStore("GET", `study_cafe_sessions?student_id=eq.${encodeURIComponent(member.student_id)}&status=in.(running,paused)&select=id,status,elapsed_seconds,active_started_at&limit=1`);
    const session = sessions?.[0];
    const updatedAt = new Date(member.updated_at).getTime();
    const shouldRelease = session?.status === "running" || !Number.isFinite(updatedAt) || updatedAt < idleCutoffMs;
    if (!shouldRelease) continue;
    await completeActiveSession(member.student_id);
    await requestStore("PATCH", memberPath(member.room_id, member.student_id), {
      seat_number: null,
      updated_at: now.toISOString(),
    });
    await createSystemMessage(member.room_id, "연결이 끊긴 구성원의 좌석이 자동으로 비워졌습니다.");
    await broadcastRoomChange(member.room_id, "seat-auto-released");
  }
}

async function completeActiveSession(studentId) {
  const rows = await requestStore("GET", `study_cafe_sessions?student_id=eq.${encodeURIComponent(studentId)}&status=in.(running,paused)&select=id,status,elapsed_seconds,active_started_at&limit=1`);
  const session = rows?.[0];
  if (!session) return;
  const activeSeconds = session.status === "running" && session.active_started_at
    ? Math.max(0, Math.floor((Date.now() - new Date(session.active_started_at).getTime()) / 1000))
    : 0;
  await requestStore("PATCH", `study_cafe_sessions?id=eq.${session.id}`, {
    status: "completed",
    elapsed_seconds: Math.max(0, Number(session.elapsed_seconds) || 0) + activeSeconds,
    active_started_at: null,
    ended_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
}

function createSystemMessage(roomId, text) {
  return requestStore("POST", "study_cafe_room_messages", {
    room_id: roomId,
    message_type: "system",
    message_text: text,
  });
}

function serializeMessage(row, ownStudentId, nameMap) {
  if (!row) return null;
  return {
    id: row.id,
    type: row.message_type,
    text: row.deleted_at ? "삭제된 메시지입니다." : row.message_text,
    deleted: Boolean(row.deleted_at),
    senderName: row.message_type === "system" ? "알림" : row.student_id === ownStudentId ? "나" : nameMap.get(row.student_id) || "구성원",
    isMine: row.student_id === ownStudentId,
    createdAt: row.created_at,
  };
}

function displayNameForStudent(student) {
  return maskName(student?.name);
}

function normalizeStoredNickname(value) {
  const name = String(value || "").trim().replace(/\s+/g, " ");
  return name.length >= 2 && name.length <= 10 ? name : "";
}

function maskName(value) {
  const name = normalizeText(value, 40);
  if (!name) return "구성원";
  if (name.length === 1) return `${name}○`;
  return `${name[0]}${"○".repeat(Math.min(2, name.length - 1))}`;
}

function summarizeTrack(value) {
  const track = normalizeText(value, 80).replace(/^(경찰직|일반직)\s*-\s*/, "");
  return track ? (track.length > 12 ? `${track.slice(0, 11)}…` : track) : "온라인 수강";
}

function getStudyRoomSessionSeconds(session, now = new Date()) {
  const saved = Math.max(0, Number(session?.elapsed_seconds) || 0);
  if (session?.status !== "running" || !session.active_started_at) return Math.floor(saved);
  return Math.floor(saved + Math.max(0, now.getTime() - new Date(session.active_started_at).getTime()) / 1000);
}

function getStudyRoomDayBounds(now = new Date()) {
  const studyDate = new Date(now.getTime() + 5 * 60 * 60 * 1000);
  const start = new Date(Date.UTC(
    studyDate.getUTCFullYear(),
    studyDate.getUTCMonth(),
    studyDate.getUTCDate(),
    -5
  ));
  return {
    start: start.toISOString(),
    end: new Date(start.getTime() + 24 * 60 * 60 * 1000).toISOString(),
  };
}

function normalizeTone(value, studentId) {
  const tones = ["navy", "blue", "mint", "purple", "orange", "rose"];
  if (tones.includes(value)) return value;
  const byte = crypto.createHash("sha256").update(String(studentId)).digest()[0];
  return tones[byte % tones.length];
}

async function callRpc(name, body) {
  return requestStore("POST", `rpc/${name}`, body);
}

async function requestStore(method, path, body, extraHeaders = {}) {
  const url = process.env.SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) {
    const error = new Error("service_role_not_configured");
    error.status = 503;
    throw error;
  }
  const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/${path}`, {
    method,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extraHeaders },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const error = new Error("study_room_store_unavailable");
    error.status = response.status === 404 ? 503 : 502;
    error.storeStatus = response.status;
    error.detail = await response.text().catch(() => "");
    throw error;
  }
  if (response.status === 204) return null;
  return response.json().catch(() => null);
}

async function broadcastRoomChange(roomId, change) {
  const url = process.env.SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) return;
  try {
    await fetch(`${url.replace(/\/$/, "")}/realtime/v1/api/broadcast/study-cafe-room-public/events/room-changed`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ roomId, change, changedAt: new Date().toISOString() }),
    });
  } catch (error) {
    console.warn("Study room realtime broadcast failed.", error);
  }
}

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function normalizeText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function clientError(code) {
  const error = new Error(code);
  error.status = 400;
  return error;
}

function forbiddenError(code) {
  const error = new Error(code);
  error.status = 403;
  return error;
}

function sendError(res, status, error) {
  res.status(status).json({ ok: false, error });
}

function extractStoreError(error) {
  const detail = String(error?.detail || "");
  const codes = ["room_membership_exists", "room_not_found", "room_full", "room_seat_taken", "invalid_room_seat", "room_membership_required"];
  const matched = codes.find((code) => detail.includes(code));
  if (matched) {
    const status = matched === "room_not_found" ? 404 : matched === "room_membership_required" ? 403 : 409;
    return { status, code: matched };
  }
  return { status: error?.status || 500, code: error?.message || "study_room_error" };
}

module.exports._private = {
  hashRoomPassword,
  isValidRoomPassword,
  normalizeMessage,
  normalizeRoomInput,
  normalizeRoomSeat,
  verifyRoomPassword,
};
