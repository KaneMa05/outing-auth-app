const crypto = require("crypto");
const {
  COOKIE_NAME,
  getConfig,
  hasPermission,
  readCookie,
  readSessionToken,
} = require("./teacher-auth-utils");

const STUDENT_ACTIONS = new Set([
  "subjects",
  "list",
  "detail",
  "create",
  "update",
  "delete",
  "comment_create",
  "comment_delete",
  "resolve",
  "report",
]);
const TEACHER_ACTIONS = new Set([
  "teacher_list",
  "teacher_detail",
  "teacher_comment_create",
  "teacher_post_visibility",
  "teacher_comment_visibility",
  "teacher_report_review",
]);
const FALLBACK_SUBJECTS = ["해양경찰학개론", "해사법규", "형사법", "해사영어", "항해학", "기관학", "형사법(공판)"];
const QUESTION_IMAGE_BUCKET = "question-board-images";
const QUESTION_IMAGE_LIMIT = 3;
const QUESTION_IMAGE_MAX_BYTES = 900 * 1024;
const QUESTION_REQUEST_MAX_BYTES = 4 * 1024 * 1024;

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
    if (!STUDENT_ACTIONS.has(action)) {
      res.status(400).json({ ok: false, error: "unsupported_action" });
      return;
    }

    const student = await authenticateLectureStudent(body);
    if (!student) {
      res.status(403).json({ ok: false, error: "lecture_student_only" });
      return;
    }
    await handleStudentAction(res, action, body, student);
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ ok: false, error: error.message || "question_board_error" });
  }
};

async function handleStudentAction(res, action, body, student) {
  if (action === "subjects") {
    res.status(200).json({ ok: true, subjects: await loadSubjectsForTrack(student.track) });
    return;
  }
  if (action === "list") {
    res.status(200).json({ ok: true, ...(await loadPostList({ studentId: student.id, body })) });
    return;
  }
  if (action === "detail") {
    const postId = normalizeUuid(body.postId);
    if (!postId) throw httpError("invalid_post", 400);
    await requestSupabase("POST", "rpc/increment_question_view_count", { p_post_id: postId });
    const detail = await loadPostDetail(postId, { studentId: student.id });
    if (!detail) throw httpError("post_not_found", 404);
    res.status(200).json({ ok: true, ...detail });
    return;
  }
  if (action === "create") {
    await enforcePostRateLimit(student.id);
    const subject = normalizeRequired(body.subject, 40, "invalid_subject", 1);
    await requireAllowedSubject(subject, student.track);
    const title = normalizeRequired(body.title, 120, "invalid_title", 2);
    const content = normalizeRequired(body.body, 5000, "invalid_body", 2, true);
    const postId = crypto.randomUUID();
    const uploadedPaths = await uploadQuestionImages(body.images, student.id, postId);
    let rows;
    try {
      rows = await requestSupabase("POST", "question_posts", {
        id: postId,
        student_id: student.id,
        board_type: "subject",
        subject,
        title,
        body: content,
        image_paths: uploadedPaths,
        status: "open",
        updated_at: new Date().toISOString(),
      }, { Prefer: "return=representation" });
    } catch (error) {
      await deleteQuestionImages(uploadedPaths);
      throw error;
    }
    res.status(201).json({ ok: true, postId: rows?.[0]?.id || postId });
    return;
  }
  if (action === "update") {
    const post = await requireOwnedPost(body.postId, student.id);
    const subject = normalizeRequired(body.subject, 40, "invalid_subject", 1);
    await requireAllowedSubject(subject, student.track);
    const title = normalizeRequired(body.title, 120, "invalid_title", 2);
    const content = normalizeRequired(body.body, 5000, "invalid_body", 2, true);
    const currentPaths = normalizeStoredImagePaths(post.image_paths);
    const retainedPaths = normalizeRetainedImagePaths(body.retainedImagePaths, currentPaths);
    const incomingImages = normalizeQuestionImages(body.images);
    if (retainedPaths.length + incomingImages.length > QUESTION_IMAGE_LIMIT) throw httpError("too_many_images", 400);
    const uploadedPaths = await uploadQuestionImages(incomingImages, student.id, post.id, { normalized: true });
    try {
      await requestSupabase("PATCH", `question_posts?id=eq.${post.id}`, {
        subject,
        title,
        body: content,
        image_paths: [...retainedPaths, ...uploadedPaths],
        updated_at: new Date().toISOString(),
      }, { Prefer: "return=minimal" });
    } catch (error) {
      await deleteQuestionImages(uploadedPaths);
      throw error;
    }
    await deleteQuestionImages(currentPaths.filter((path) => !retainedPaths.includes(path)));
    res.status(200).json({ ok: true });
    return;
  }
  if (action === "delete") {
    const post = await requireOwnedPost(body.postId, student.id);
    await requestSupabase("PATCH", `question_posts?id=eq.${post.id}`, {
      deleted_at: new Date().toISOString(),
      deleted_by: student.id,
    }, { Prefer: "return=minimal" });
    await deleteQuestionImages(normalizeStoredImagePaths(post.image_paths));
    res.status(200).json({ ok: true });
    return;
  }
  if (action === "comment_create") {
    await enforceCommentRateLimit(student.id);
    const post = await requireVisiblePost(body.postId);
    const content = normalizeRequired(body.body, 2000, "invalid_comment", 1, true);
    const rows = await requestSupabase("POST", "question_comments", {
      post_id: post.id,
      author_type: "student",
      student_id: student.id,
      body: content,
      updated_at: new Date().toISOString(),
    }, { Prefer: "return=representation" });
    res.status(201).json({ ok: true, commentId: rows?.[0]?.id || "" });
    return;
  }
  if (action === "comment_delete") {
    const commentId = normalizeUuid(body.commentId);
    if (!commentId) throw httpError("invalid_comment", 400);
    const rows = await requestSupabase("GET", `question_comments?id=eq.${commentId}&student_id=eq.${encodeURIComponent(student.id)}&author_type=eq.student&deleted_at=is.null&select=id&limit=1`);
    if (!rows?.[0]) throw httpError("comment_not_found", 404);
    await requestSupabase("PATCH", `question_comments?id=eq.${commentId}`, {
      deleted_at: new Date().toISOString(),
      deleted_by: student.id,
    }, { Prefer: "return=minimal" });
    res.status(200).json({ ok: true });
    return;
  }
  if (action === "resolve") {
    const post = await requireOwnedPost(body.postId, student.id);
    const status = body.answered === true ? "answered" : "open";
    await requestSupabase("PATCH", `question_posts?id=eq.${post.id}`, {
      status,
      updated_at: new Date().toISOString(),
    }, { Prefer: "return=minimal" });
    res.status(200).json({ ok: true, status });
    return;
  }
  if (action === "report") {
    const targetType = body.targetType === "comment" ? "comment" : "post";
    const targetId = normalizeUuid(body.targetId);
    const reason = normalizeRequired(body.reason, 300, "invalid_report_reason", 2, true);
    if (!targetId) throw httpError("invalid_report_target", 400);
    const payload = { reporter_student_id: student.id, reason };
    payload[targetType === "post" ? "post_id" : "comment_id"] = targetId;
    try {
      await requestSupabase("POST", "question_reports", payload, { Prefer: "return=minimal" });
    } catch (error) {
      if (error.storeStatus === 409) throw httpError("already_reported", 409);
      throw error;
    }
    res.status(201).json({ ok: true });
  }
}

async function handleTeacherAction(req, res, action, body) {
  const session = readTeacherSession(req);
  if (!session) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }
  const permission = action === "teacher_list" || action === "teacher_detail" ? "question_board.read" : "question_board.write";
  if (!hasPermission(session, permission)) {
    res.status(403).json({ ok: false, error: "forbidden" });
    return;
  }
  if (action === "teacher_list") {
    res.status(200).json({ ok: true, ...(await loadPostList({ studentId: "", body, teacher: true })), subjects: FALLBACK_SUBJECTS, reports: await loadPendingReports() });
    return;
  }
  if (action === "teacher_detail") {
    const postId = normalizeUuid(body.postId);
    if (!postId) throw httpError("invalid_post", 400);
    const detail = await loadPostDetail(postId, { teacher: true });
    if (!detail) throw httpError("post_not_found", 404);
    res.status(200).json({ ok: true, ...detail });
    return;
  }
  if (action === "teacher_comment_create") {
    const post = await requireExistingPost(body.postId);
    const content = normalizeRequired(body.body, 2000, "invalid_comment", 1, true);
    const rows = await requestSupabase("POST", "question_comments", {
      post_id: post.id,
      author_type: "teacher",
      teacher_name: "선생님",
      body: content,
      updated_at: new Date().toISOString(),
    }, { Prefer: "return=representation" });
    res.status(201).json({ ok: true, commentId: rows?.[0]?.id || "" });
    return;
  }
  if (action === "teacher_post_visibility") {
    const post = await requireExistingPost(body.postId);
    await requestSupabase("PATCH", `question_posts?id=eq.${post.id}`, {
      is_hidden: body.hidden === true,
      hidden_reason: body.hidden === true ? normalizeText(body.reason, 300) || "관리자 숨김" : null,
      updated_at: new Date().toISOString(),
    }, { Prefer: "return=minimal" });
    res.status(200).json({ ok: true });
    return;
  }
  if (action === "teacher_comment_visibility") {
    const commentId = normalizeUuid(body.commentId);
    if (!commentId) throw httpError("invalid_comment", 400);
    await requestSupabase("PATCH", `question_comments?id=eq.${commentId}&deleted_at=is.null`, {
      is_hidden: body.hidden === true,
      hidden_reason: body.hidden === true ? normalizeText(body.reason, 300) || "관리자 숨김" : null,
      updated_at: new Date().toISOString(),
    }, { Prefer: "return=minimal" });
    res.status(200).json({ ok: true });
    return;
  }
  if (action === "teacher_report_review") {
    const reportId = normalizeUuid(body.reportId);
    if (!reportId) throw httpError("invalid_report", 400);
    const status = body.dismissed === true ? "dismissed" : "reviewed";
    await requestSupabase("PATCH", `question_reports?id=eq.${reportId}&status=eq.pending`, {
      status,
      reviewed_at: new Date().toISOString(),
      reviewed_by: session.username || "teacher",
    }, { Prefer: "return=minimal" });
    res.status(200).json({ ok: true });
  }
}

async function loadPostList({ studentId, body, teacher = false }) {
  const rows = await requestSupabase("GET", `question_posts?board_type=eq.subject&deleted_at=is.null&select=id,student_id,subject,title,body,image_paths,status,view_count,is_hidden,hidden_reason,created_at,updated_at&order=created_at.desc&limit=200`);
  const visibleRows = teacher ? rows || [] : (rows || []).filter((row) => row.is_hidden !== true);
  const subject = normalizeText(body.subject, 40);
  const status = ["open", "answered"].includes(body.status) ? body.status : "";
  const search = normalizeText(body.search, 80).toLocaleLowerCase("ko-KR");
  const filtered = visibleRows.filter((row) => {
    if (subject && row.subject !== subject) return false;
    if (status && row.status !== status) return false;
    if (search && !`${row.title}\n${row.body}`.toLocaleLowerCase("ko-KR").includes(search)) return false;
    return true;
  });
  const page = Math.max(1, Math.min(1000, Number(body.page) || 1));
  const pageSize = 30;
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);
  const authors = await loadAuthorMap(pageRows.map((row) => row.student_id));
  const counts = await loadCommentCounts(pageRows.map((row) => row.id));
  return {
    posts: pageRows.map((row) => serializePost(row, { studentId, authors, counts, teacher })),
    page,
    hasMore: page * pageSize < filtered.length,
    total: filtered.length,
  };
}

async function loadPostDetail(postId, { studentId = "", teacher = false } = {}) {
  const rows = await requestSupabase("GET", `question_posts?id=eq.${postId}&board_type=eq.subject&deleted_at=is.null&select=id,student_id,subject,title,body,image_paths,status,view_count,is_hidden,hidden_reason,created_at,updated_at&limit=1`);
  const post = rows?.[0];
  if (!post || (!teacher && post.is_hidden)) return null;
  const comments = await requestSupabase("GET", `question_comments?post_id=eq.${postId}&deleted_at=is.null&select=id,post_id,author_type,student_id,teacher_name,body,is_hidden,hidden_reason,created_at,updated_at&order=created_at.asc`);
  const studentIds = [post.student_id, ...(comments || []).map((row) => row.student_id)].filter(Boolean);
  const authors = await loadAuthorMap(studentIds);
  const serializedPost = serializePost(post, { studentId, authors, counts: new Map([[post.id, (comments || []).filter((row) => teacher || !row.is_hidden).length]]), teacher });
  serializedPost.images = await signQuestionImages(normalizeStoredImagePaths(post.image_paths));
  return {
    post: serializedPost,
    comments: (comments || [])
      .filter((row) => teacher || !row.is_hidden)
      .map((row) => serializeComment(row, { studentId, authors, teacher })),
  };
}

async function loadSubjectsForTrack(track) {
  let configured = [];
  try {
    const rows = await requestSupabase("GET", `exam_subject_settings?track=eq.${encodeURIComponent(track || "")}&is_active=eq.true&select=subject,sort_order&order=sort_order.asc`);
    configured = (rows || []).map((row) => normalizeText(row.subject, 40)).filter(Boolean);
  } catch (error) {
    if (error.storeStatus !== 404) console.warn("Question subjects fallback used.", error.message);
  }
  return [...new Set([...configured, ...FALLBACK_SUBJECTS])];
}

async function requireAllowedSubject(subject, track) {
  const allowed = await loadSubjectsForTrack(track);
  if (!allowed.includes(subject)) throw httpError("invalid_subject", 400);
}

async function loadAuthorMap(studentIds) {
  const ids = [...new Set(studentIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const filter = ids.map((id) => encodeURIComponent(id)).join(",");
  const [students, profiles] = await Promise.all([
    requestSupabase("GET", `students?id=in.(${filter})&select=id,name`),
    requestSupabase("GET", `study_cafe_profiles?student_id=in.(${filter})&select=student_id,nickname`),
  ]);
  const profileMap = new Map((profiles || []).map((row) => [row.student_id, normalizeText(row.nickname, 20)]));
  return new Map((students || []).map((row) => [row.id, profileMap.get(row.id) || maskName(row.name)]));
}

async function loadCommentCounts(postIds) {
  const ids = [...new Set(postIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const rows = await requestSupabase("GET", `question_comments?post_id=in.(${ids.join(",")})&deleted_at=is.null&is_hidden=eq.false&select=post_id`);
  return (rows || []).reduce((map, row) => map.set(row.post_id, (map.get(row.post_id) || 0) + 1), new Map());
}

async function loadPendingReports() {
  const rows = await requestSupabase("GET", "question_reports?status=eq.pending&select=id,post_id,comment_id,reason,created_at&order=created_at.asc&limit=100");
  const commentIds = (rows || []).map((row) => row.comment_id).filter(Boolean);
  let commentPostMap = new Map();
  if (commentIds.length) {
    const comments = await requestSupabase("GET", `question_comments?id=in.(${commentIds.join(",")})&select=id,post_id`);
    commentPostMap = new Map((comments || []).map((row) => [row.id, row.post_id]));
  }
  return (rows || []).map((row) => ({
    ...row,
    target_post_id: row.post_id || commentPostMap.get(row.comment_id) || "",
  }));
}

function serializePost(row, { studentId, authors, counts, teacher }) {
  return {
    id: row.id,
    subject: row.subject,
    title: row.title,
    body: row.body,
    imageCount: normalizeStoredImagePaths(row.image_paths).length,
    status: row.status,
    viewCount: Number(row.view_count) || 0,
    commentCount: counts.get(row.id) || 0,
    authorName: authors.get(row.student_id) || "인강생",
    isOwn: Boolean(studentId && row.student_id === studentId),
    isHidden: teacher && row.is_hidden === true,
    hiddenReason: teacher ? row.hidden_reason || "" : "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeComment(row, { studentId, authors, teacher }) {
  return {
    id: row.id,
    authorType: row.author_type,
    authorName: row.author_type === "teacher" ? row.teacher_name || "선생님" : authors.get(row.student_id) || "인강생",
    body: row.body,
    isOwn: row.author_type === "student" && Boolean(studentId && row.student_id === studentId),
    isHidden: teacher && row.is_hidden === true,
    hiddenReason: teacher ? row.hidden_reason || "" : "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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
  const rows = await requestSupabase("GET", `students?id=eq.${encodeURIComponent(studentId)}&student_category=eq.lecture&is_active=eq.true&select=id,name,track,student_category&limit=1`);
  return rows?.[0] || null;
}

async function requireOwnedPost(value, studentId) {
  const postId = normalizeUuid(value);
  if (!postId) throw httpError("invalid_post", 400);
  const rows = await requestSupabase("GET", `question_posts?id=eq.${postId}&board_type=eq.subject&student_id=eq.${encodeURIComponent(studentId)}&deleted_at=is.null&select=id,image_paths&limit=1`);
  if (!rows?.[0]) throw httpError("post_not_found", 404);
  return rows[0];
}

async function requireVisiblePost(value) {
  const postId = normalizeUuid(value);
  if (!postId) throw httpError("invalid_post", 400);
  const rows = await requestSupabase("GET", `question_posts?id=eq.${postId}&board_type=eq.subject&deleted_at=is.null&is_hidden=eq.false&select=id&limit=1`);
  if (!rows?.[0]) throw httpError("post_not_found", 404);
  return rows[0];
}

async function requireExistingPost(value) {
  const postId = normalizeUuid(value);
  if (!postId) throw httpError("invalid_post", 400);
  const rows = await requestSupabase("GET", `question_posts?id=eq.${postId}&board_type=eq.subject&deleted_at=is.null&select=id&limit=1`);
  if (!rows?.[0]) throw httpError("post_not_found", 404);
  return rows[0];
}

async function enforcePostRateLimit(studentId) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const rows = await requestSupabase("GET", `question_posts?board_type=eq.subject&student_id=eq.${encodeURIComponent(studentId)}&created_at=gte.${encodeURIComponent(since)}&deleted_at=is.null&select=id&limit=21`);
  if ((rows || []).length >= 20) throw httpError("post_rate_limited", 429);
}

async function enforceCommentRateLimit(studentId) {
  const since = new Date(Date.now() - 60 * 1000).toISOString();
  const rows = await requestSupabase("GET", `question_comments?student_id=eq.${encodeURIComponent(studentId)}&created_at=gte.${encodeURIComponent(since)}&deleted_at=is.null&select=id&limit=6`);
  if ((rows || []).length >= 5) throw httpError("comment_rate_limited", 429);
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
  if (!response.ok) {
    const error = httpError("question_board_store_unavailable", response.status === 404 ? 503 : 502);
    error.storeStatus = response.status;
    error.detail = await response.text().catch(() => "");
    throw error;
  }
  if (response.status === 204) return null;
  return response.json().catch(() => null);
}

function normalizeQuestionImages(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > QUESTION_IMAGE_LIMIT) throw httpError("too_many_images", 400);
  return value.map((image) => {
    const contentType = normalizeText(image?.contentType, 40).toLowerCase();
    const match = String(image?.data || "").match(/^data:(image\/(?:jpeg|png|webp));base64,([a-z0-9+/=]+)$/i);
    if (!match || match[1].toLowerCase() !== contentType) throw httpError("invalid_image", 400);
    const buffer = Buffer.from(match[2], "base64");
    if (!buffer.length || buffer.length > QUESTION_IMAGE_MAX_BYTES || !hasValidImageSignature(buffer, contentType)) {
      throw httpError(buffer.length > QUESTION_IMAGE_MAX_BYTES ? "image_too_large" : "invalid_image", 400);
    }
    return { contentType, buffer };
  });
}

function hasValidImageSignature(buffer, contentType) {
  if (contentType === "image/jpeg") return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (contentType === "image/png") return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (contentType === "image/webp") return buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  return false;
}

function normalizeStoredImagePaths(value) {
  return Array.isArray(value)
    ? value.map((path) => normalizeText(path, 500)).filter((path) => /^[a-zA-Z0-9/_-]+\.(?:jpg|png|webp)$/.test(path)).slice(0, QUESTION_IMAGE_LIMIT)
    : [];
}

function normalizeRetainedImagePaths(value, currentPaths) {
  if (!Array.isArray(value)) return currentPaths;
  const requested = [...new Set(value.map((path) => normalizeText(path, 500)))];
  if (requested.some((path) => !currentPaths.includes(path))) throw httpError("invalid_image", 400);
  return currentPaths.filter((path) => requested.includes(path));
}

async function uploadQuestionImages(value, studentId, postId, options = {}) {
  const images = options.normalized ? value : normalizeQuestionImages(value);
  const uploaded = [];
  try {
    for (const image of images) {
      const extension = image.contentType === "image/png" ? "png" : image.contentType === "image/webp" ? "webp" : "jpg";
      const safeStudentId = String(studentId).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
      const path = `${safeStudentId}/${postId}/${crypto.randomUUID()}.${extension}`;
      await requestStorage("POST", `object/${QUESTION_IMAGE_BUCKET}/${path}`, image.buffer, {
        "Content-Type": image.contentType,
        "Cache-Control": "3600",
        "x-upsert": "false",
      });
      uploaded.push(path);
    }
    return uploaded;
  } catch (error) {
    await deleteQuestionImages(uploaded);
    throw error;
  }
}

async function signQuestionImages(paths) {
  return Promise.all(paths.map(async (path) => {
    const data = await requestStorage("POST", `object/sign/${QUESTION_IMAGE_BUCKET}/${path}`, JSON.stringify({ expiresIn: 3600 }), { "Content-Type": "application/json" });
    const signedPath = data?.signedURL || data?.signedUrl || "";
    const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
    return { path, url: signedPath.startsWith("http") ? signedPath : `${supabaseUrl}/storage/v1${signedPath}` };
  }));
}

async function deleteQuestionImages(paths) {
  for (const path of normalizeStoredImagePaths(paths)) {
    try {
      await requestStorage("DELETE", `object/${QUESTION_IMAGE_BUCKET}`, JSON.stringify({ prefixes: [path] }), { "Content-Type": "application/json" });
    } catch (error) {
      console.warn("Question image cleanup failed.", path, error.message);
    }
  }
}

async function requestStorage(method, path, body, extraHeaders = {}) {
  const supabaseUrl = process.env.SUPABASE_URL || "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!supabaseUrl || !serviceRoleKey) throw httpError("service_role_not_configured", 503);
  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/storage/v1/${path}`, {
    method,
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, ...extraHeaders },
    body,
  });
  if (!response.ok) {
    const error = httpError("question_image_store_unavailable", response.status === 404 ? 503 : 502);
    error.storeStatus = response.status;
    error.detail = await response.text().catch(() => "");
    throw error;
  }
  if (response.status === 204) return null;
  return response.json().catch(() => null);
}

async function readJson(req) {
  if (req.body && typeof req.body === "object") {
    if (Buffer.byteLength(JSON.stringify(req.body), "utf8") > QUESTION_REQUEST_MAX_BYTES) throw httpError("payload_too_large", 413);
    return req.body;
  }
  const chunks = [];
  let byteLength = 0;
  for await (const chunk of req) {
    byteLength += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk, "utf8");
    if (byteLength > QUESTION_REQUEST_MAX_BYTES) throw httpError("payload_too_large", 413);
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
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

function maskName(value) {
  const name = normalizeText(value, 40);
  if (!name) return "인강생";
  if (name.length === 1) return `${name}○`;
  return `${name[0]}${"○".repeat(Math.min(2, name.length - 1))}`;
}

function httpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

module.exports._private = {
  FALLBACK_SUBJECTS,
  maskName,
  normalizeRequired,
  normalizeUuid,
  normalizeQuestionImages,
};
