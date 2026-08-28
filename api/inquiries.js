const crypto = require("crypto");
const {
  COOKIE_NAME,
  getConfig,
  hasPermission,
  readCookie,
  readSessionToken,
} = require("./teacher-auth-utils");

const INQUIRY_CATEGORIES = ["이용 문의", "플래너", "스터디카페", "타이머", "커리큘럼", "게시판", "알림", "계정·기기"];
const STUDENT_ACTIONS = new Set(["list", "detail", "create", "update", "delete", "message_create"]);
const TEACHER_ACTIONS = new Set(["teacher_list", "teacher_detail", "teacher_reply"]);
const REQUEST_MAX_BYTES = 32 * 1024;

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  try {
    const body = await readJson(req);
    const action = normalizeText(body.action, 40);
    if (TEACHER_ACTIONS.has(action)) {
      await handleTeacherAction(req, res, action, body);
      return;
    }
    if (!STUDENT_ACTIONS.has(action)) throw httpError("unsupported_action", 400);
    const student = await authenticateLectureStudent(body);
    if (!student) throw httpError("lecture_student_only", 403);
    await handleStudentAction(res, action, body, student);
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ ok: false, error: error.message || "inquiry_error" });
  }
};

async function handleStudentAction(res, action, body, student) {
  if (action === "list") {
    const rows = await loadInquiryRows({ studentId: student.id, body });
    res.status(200).json({ ok: true, inquiries: rows.map((row) => serializeInquiry(row, student.id)) });
    return;
  }
  if (action === "detail") {
    const inquiry = await requireStudentInquiry(body.inquiryId, student.id);
    const messages = await loadInquiryMessages(inquiry.id);
    res.status(200).json({
      ok: true,
      inquiry: serializeInquiry(inquiry, student.id),
      messages: messages.map((row) => serializeMessage(row, student.id)),
    });
    return;
  }
  if (action === "create") {
    await enforceInquiryRateLimit(student.id);
    const category = normalizeCategory(body.category);
    const title = normalizeRequired(body.title, 120, "invalid_title", 2);
    const content = normalizeRequired(body.body, 5000, "invalid_body", 2, true);
    const rows = await requestSupabase("POST", "student_inquiries", {
      student_id: student.id,
      category,
      title,
      body: content,
      status: "open",
      updated_at: new Date().toISOString(),
    }, { Prefer: "return=representation" });
    res.status(201).json({ ok: true, inquiryId: rows?.[0]?.id || "" });
    return;
  }
  if (action === "update") {
    const inquiry = await requireStudentInquiry(body.inquiryId, student.id);
    const category = normalizeCategory(body.category);
    const title = normalizeRequired(body.title, 120, "invalid_title", 2);
    const content = normalizeRequired(body.body, 5000, "invalid_body", 2, true);
    await requestSupabase("PATCH", `student_inquiries?id=eq.${inquiry.id}&student_id=eq.${encodeURIComponent(student.id)}`, {
      category,
      title,
      body: content,
      status: "open",
      updated_at: new Date().toISOString(),
    }, { Prefer: "return=minimal" });
    res.status(200).json({ ok: true });
    return;
  }
  if (action === "delete") {
    const inquiry = await requireStudentInquiry(body.inquiryId, student.id);
    await requestSupabase("PATCH", `student_inquiries?id=eq.${inquiry.id}&student_id=eq.${encodeURIComponent(student.id)}`, {
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { Prefer: "return=minimal" });
    res.status(200).json({ ok: true });
    return;
  }
  if (action === "message_create") {
    const inquiry = await requireStudentInquiry(body.inquiryId, student.id);
    const content = normalizeRequired(body.body, 2000, "invalid_message", 1, true);
    await enforceMessageRateLimit(student.id);
    await requestSupabase("POST", "student_inquiry_messages", {
      inquiry_id: inquiry.id,
      author_type: "student",
      student_id: student.id,
      body: content,
    }, { Prefer: "return=minimal" });
    await requestSupabase("PATCH", `student_inquiries?id=eq.${inquiry.id}&student_id=eq.${encodeURIComponent(student.id)}`, {
      status: "open",
      updated_at: new Date().toISOString(),
    }, { Prefer: "return=minimal" });
    res.status(201).json({ ok: true });
  }
}

async function handleTeacherAction(req, res, action, body) {
  const session = readTeacherSession(req);
  if (!session) throw httpError("unauthorized", 401);
  const permission = action === "teacher_reply" ? "inquiries.write" : "inquiries.read";
  if (!hasPermission(session, permission)) throw httpError("forbidden", 403);

  if (action === "teacher_list") {
    const rows = await loadInquiryRows({ body, teacher: true });
    const names = await loadStudentNames(rows.map((row) => row.student_id));
    res.status(200).json({ ok: true, inquiries: rows.map((row) => ({ ...serializeInquiry(row), studentName: names.get(row.student_id) || "수강생" })) });
    return;
  }
  if (action === "teacher_detail") {
    const inquiry = await requireTeacherInquiry(body.inquiryId);
    const messages = await loadInquiryMessages(inquiry.id);
    const names = await loadStudentNames([inquiry.student_id]);
    res.status(200).json({
      ok: true,
      inquiry: { ...serializeInquiry(inquiry), studentName: names.get(inquiry.student_id) || "수강생" },
      messages: messages.map((row) => serializeMessage(row, "")),
    });
    return;
  }
  if (action === "teacher_reply") {
    const inquiry = await requireTeacherInquiry(body.inquiryId);
    const content = normalizeRequired(body.body, 2000, "invalid_message", 1, true);
    await requestSupabase("POST", "student_inquiry_messages", {
      inquiry_id: inquiry.id,
      author_type: "teacher",
      teacher_name: "선생님",
      body: content,
    }, { Prefer: "return=minimal" });
    await requestSupabase("PATCH", `student_inquiries?id=eq.${inquiry.id}`, {
      status: "answered",
      updated_at: new Date().toISOString(),
    }, { Prefer: "return=minimal" });
    res.status(201).json({ ok: true });
  }
}

async function loadInquiryRows({ studentId = "", body, teacher = false }) {
  const category = INQUIRY_CATEGORIES.includes(body.category) ? body.category : "";
  const status = ["open", "answered"].includes(body.status) ? body.status : "";
  const search = normalizeText(body.search, 80).toLocaleLowerCase("ko-KR");
  const filters = [
    "deleted_at=is.null",
    teacher ? "" : `student_id=eq.${encodeURIComponent(studentId)}`,
    category ? `category=eq.${encodeURIComponent(category)}` : "",
    status ? `status=eq.${status}` : "",
  ].filter(Boolean);
  const rows = await requestSupabase("GET", `student_inquiries?${filters.join("&")}&select=id,student_id,category,title,body,status,created_at,updated_at&order=updated_at.desc&limit=200`);
  return search
    ? (rows || []).filter((row) => `${row.title}\n${row.body}`.toLocaleLowerCase("ko-KR").includes(search))
    : rows || [];
}

async function requireStudentInquiry(value, studentId) {
  const inquiryId = normalizeUuid(value);
  if (!inquiryId) throw httpError("invalid_inquiry", 400);
  const rows = await requestSupabase("GET", `student_inquiries?id=eq.${inquiryId}&student_id=eq.${encodeURIComponent(studentId)}&deleted_at=is.null&select=id,student_id,category,title,body,status,created_at,updated_at&limit=1`);
  if (!rows?.[0]) throw httpError("inquiry_not_found", 404);
  return rows[0];
}

async function requireTeacherInquiry(value) {
  const inquiryId = normalizeUuid(value);
  if (!inquiryId) throw httpError("invalid_inquiry", 400);
  const rows = await requestSupabase("GET", `student_inquiries?id=eq.${inquiryId}&deleted_at=is.null&select=id,student_id,category,title,body,status,created_at,updated_at&limit=1`);
  if (!rows?.[0]) throw httpError("inquiry_not_found", 404);
  return rows[0];
}

async function loadInquiryMessages(inquiryId) {
  return requestSupabase("GET", `student_inquiry_messages?inquiry_id=eq.${inquiryId}&deleted_at=is.null&select=id,inquiry_id,author_type,student_id,teacher_name,body,created_at&order=created_at.asc`);
}

async function loadStudentNames(studentIds) {
  const ids = [...new Set(studentIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const filter = ids.map((id) => `"${String(id).replaceAll('"', '')}"`).join(",");
  const rows = await requestSupabase("GET", `students?id=in.(${encodeURIComponent(filter)})&select=id,name`);
  return new Map((rows || []).map((row) => [row.id, normalizeText(row.name, 60) || "수강생"]));
}

function serializeInquiry(row, studentId = "") {
  return {
    id: row.id,
    studentId: row.student_id,
    category: row.category,
    title: row.title,
    body: row.body,
    status: row.status,
    isOwn: Boolean(studentId && row.student_id === studentId),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeMessage(row, studentId) {
  return {
    id: row.id,
    authorType: row.author_type,
    authorName: row.author_type === "teacher" ? row.teacher_name || "선생님" : studentId && row.student_id === studentId ? "나" : "수강생",
    body: row.body,
    createdAt: row.created_at,
  };
}

async function authenticateLectureStudent(body) {
  const studentId = normalizeText(body.studentId, 64);
  const deviceToken = normalizeText(body.deviceToken, 256);
  if (!studentId || !deviceToken) return null;
  const validation = await requestSupabase("POST", "rpc/validate_student_device", {
    p_student_id: studentId,
    p_device_token_hash: hashDeviceToken(deviceToken),
    p_client_display_mode: normalizeText(body.client?.displayMode, 40) || null,
    p_client_user_agent: normalizeText(body.client?.userAgent, 500) || null,
  });
  if (!validation || validation.valid !== true) return null;
  const rows = await requestSupabase("GET", `students?id=eq.${encodeURIComponent(studentId)}&student_category=eq.lecture&is_active=eq.true&select=id,name&limit=1`);
  return rows?.[0] || null;
}

async function enforceInquiryRateLimit(studentId) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const rows = await requestSupabase("GET", `student_inquiries?student_id=eq.${encodeURIComponent(studentId)}&created_at=gte.${encodeURIComponent(since)}&deleted_at=is.null&select=id&limit=11`);
  if ((rows || []).length >= 10) throw httpError("inquiry_rate_limited", 429);
}

async function enforceMessageRateLimit(studentId) {
  const since = new Date(Date.now() - 60 * 1000).toISOString();
  const rows = await requestSupabase("GET", `student_inquiry_messages?student_id=eq.${encodeURIComponent(studentId)}&created_at=gte.${encodeURIComponent(since)}&deleted_at=is.null&select=id&limit=6`);
  if ((rows || []).length >= 5) throw httpError("message_rate_limited", 429);
}

function readTeacherSession(req) {
  const { secret } = getConfig();
  return readSessionToken(readCookie(req, COOKIE_NAME), secret);
}

async function requestSupabase(method, path, body, extraHeaders = {}) {
  const supabaseUrl = process.env.SUPABASE_URL || "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!supabaseUrl || !serviceRoleKey) throw httpError("service_role_not_configured", 503);
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
  if (!response.ok) throw httpError("inquiry_store_unavailable", response.status === 404 ? 503 : 502);
  if (response.status === 204) return null;
  return response.json().catch(() => null);
}

async function readJson(req) {
  if (req.body && typeof req.body === "object") {
    if (Buffer.byteLength(JSON.stringify(req.body), "utf8") > REQUEST_MAX_BYTES) throw httpError("payload_too_large", 413);
    return req.body;
  }
  const chunks = [];
  let byteLength = 0;
  for await (const chunk of req) {
    byteLength += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk, "utf8");
    if (byteLength > REQUEST_MAX_BYTES) throw httpError("payload_too_large", 413);
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function normalizeCategory(value) {
  const category = normalizeText(value, 40);
  if (!INQUIRY_CATEGORIES.includes(category)) throw httpError("invalid_category", 400);
  return category;
}

function normalizeText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeRequired(value, maxLength, code, minLength = 1, preserveLines = false) {
  const text = String(value || "").replace(/\r\n/g, "\n").trim().slice(0, maxLength);
  const normalized = preserveLines ? text : text.replace(/\s+/g, " ");
  if (normalized.length < minLength) throw httpError(code, 400);
  return normalized;
}

function normalizeUuid(value) {
  const id = normalizeText(value, 64);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) ? id : "";
}

function hashDeviceToken(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function httpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

module.exports._private = { INQUIRY_CATEGORIES, normalizeCategory, normalizeRequired, normalizeUuid };
