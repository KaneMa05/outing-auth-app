const crypto = require("crypto");
const { handleStudyCafeFeatures, createRemoteFeatureStore, requireFeature } = require("./study-cafe-features");

const FEEDBACK_SUBJECT = "스터디카페 의견";
// A separate subject keeps private feedback outside older public-only queries too.
const FEEDBACK_PRIVATE_SUBJECT = "스터디카페 비공개 의견";
const PAGE_SIZE = 20;
const FEEDBACK_FILTER = `board_type=eq.free&subject=in.(${encodeURIComponent(FEEDBACK_SUBJECT)},${encodeURIComponent(FEEDBACK_PRIVATE_SUBJECT)})&is_hidden=eq.false`;

function canReadFeedback(row, studentId, admin = false) {
  return admin || row.subject !== FEEDBACK_PRIVATE_SUBJECT || row.student_id === studentId;
}

function feedbackError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function normalizeFeedbackId(value) {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw feedbackError("invalid_feedback_id");
  }
  return value.toLowerCase();
}

function normalizeFeedbackBody(value) {
  const body = typeof value === "string" ? value.replace(/\r\n/g, "\n").trim() : "";
  if (body.length < 2 || body.length > 1000) throw feedbackError("invalid_feedback_body");
  return body;
}

function normalizeFeedbackCursor(value) {
  if (value == null) return null;
  // Keep the database timestamp's full precision for stable keyset pagination.
  if (typeof value.createdAt !== "string" || !/^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2})$/.test(value.createdAt) || !Number.isFinite(Date.parse(value.createdAt))) {
    throw feedbackError("invalid_feedback_cursor");
  }
  return { id: normalizeFeedbackId(value.id), createdAt: value.createdAt };
}

function fallbackFeedbackName(studentId) {
  return `수강생 ${crypto.createHash("sha256").update(String(studentId)).digest("hex").slice(0, 6)}`;
}

function serializeFeedback(row, studentId, names) {
  return {
    id: row.id,
    body: row.deleted_at ? "삭제된 의견입니다." : row.body,
    isDeleted: Boolean(row.deleted_at),
    authorName: row.deleted_at ? "삭제된 의견" : names.get(row.student_id) || fallbackFeedbackName(row.student_id),
    isOwn: row.student_id === studentId,
    isPrivate: row.subject === FEEDBACK_PRIVATE_SUBJECT,
    createdAt: row.created_at,
    featureId: row.feature_preview_id || "",
  };
}

async function handleStudyCafeFeedback({ action, body, student, store, admin = false, now = new Date() }) {
  if (action.startsWith("feature_")) return handleStudyCafeFeatures({ action, body, store, admin, now });
  if (action === "feedback_delete") {
    const postId = normalizeFeedbackId(body.postId);
    const post = await store.find(postId, true);
    if (!post || !canReadFeedback(post, student.id, admin)) throw feedbackError("feedback_not_found", 404);
    if (!admin && post.student_id !== student.id) throw feedbackError("forbidden", 403);
    if (post.feature_preview_id) await requireFeature(store, post.feature_preview_id, admin);
    // Always retry the cascade, even if an earlier request deleted only the parent.
    await store.deletePost(postId, now.toISOString());
    return { ok: true, keepThread: false };
  }
  if (["feedback_replies", "feedback_reply_create", "feedback_reply_delete"].includes(action)) {
    const postId = normalizeFeedbackId(body.postId);
    const post = await store.find(postId, true);
    // Check the parent before every reply read/write, including retries.
    if (!post || post.deleted_at || !canReadFeedback(post, student.id, admin)) throw feedbackError("feedback_not_found", 404);
    if (post.feature_preview_id) await requireFeature(store, post.feature_preview_id, admin);
    if (action === "feedback_reply_delete") {
      const replyId = normalizeFeedbackId(body.replyId);
      const reply = await store.findReply(replyId, true);
      if (!reply || reply.post_id !== postId) throw feedbackError("feedback_not_found", 404);
      if (!admin && (reply.author_type !== "student" || reply.student_id !== student.id)) throw feedbackError("forbidden", 403);
      if (!reply.deleted_at) await store.deleteReply(replyId, postId, now.toISOString());
      return { ok: true, threadEmpty: Boolean(post.deleted_at) && (await store.listReplies(postId, null)).length === 0 };
    }
    if (action === "feedback_replies") {
      const rows = await store.listReplies(postId, normalizeFeedbackCursor(body.cursor));
      const page = rows.slice(0, PAGE_SIZE);
      const names = await store.names([...new Set(page.map((row) => row.student_id).filter(Boolean))]);
      const last = page[page.length - 1];
      return {
        ok: true,
        postDeleted: Boolean(post.deleted_at),
        items: page.map((row) => serializeFeedbackReply(row, student.id, names)),
        nextCursor: rows.length > PAGE_SIZE ? { id: last.id, createdAt: last.created_at } : null,
      };
    }
    if (post.deleted_at) throw feedbackError("feedback_deleted", 409);
    const id = normalizeFeedbackId(body.requestId);
    const content = normalizeFeedbackBody(body.body);
    let reply = await store.findReply(id, true);
    if (!reply) {
      if (await store.recentReplyCount(student.id, admin, new Date(now.getTime() - 60000).toISOString()) >= 5) {
        throw feedbackError("feedback_rate_limited", 429);
      }
      await store.insertReply({
        id, post_id: postId, author_type: admin ? "teacher" : "student",
        student_id: admin ? null : student.id, teacher_name: admin ? "관리자" : null,
        body: content, created_at: now.toISOString(), updated_at: now.toISOString(),
      });
      reply = await store.findReply(id);
    }
    // A reply submitted concurrently with deleting its parent must not survive.
    const currentPost = await store.find(postId, true);
    if (!currentPost || currentPost.deleted_at) {
      if (reply?.post_id === postId) await store.deleteReply(id, postId, now.toISOString());
      throw feedbackError("feedback_not_found", 404);
    }
    if (!reply || reply.deleted_at || reply.post_id !== postId || reply.body !== content ||
      (admin ? reply.author_type !== "teacher" || reply.teacher_name !== "관리자" : reply.author_type !== "student" || reply.student_id !== student.id)) {
      throw feedbackError("feedback_request_conflict", 409);
    }
    const names = await store.names(admin ? [] : [student.id]);
    return { ok: true, item: serializeFeedbackReply(reply, student.id, names) };
  }
  if (action === "feedback_list") {
    const featureId = body.featureId ? normalizeFeedbackId(body.featureId) : "";
    if (featureId) await requireFeature(store, featureId, admin);
    const rows = (await store.list(normalizeFeedbackCursor(body.cursor), { studentId: student.id, admin, featureId }))
      .filter((row) => !row.deleted_at && canReadFeedback(row, student.id, admin));
    const page = rows.slice(0, PAGE_SIZE);
    const names = await store.names([...new Set([student.id, ...page.map((row) => row.student_id)])]);
    const last = page[page.length - 1];
    return {
      ok: true,
      items: page.map((row) => serializeFeedback(row, student.id, names)),
      viewerName: names.get(student.id) || fallbackFeedbackName(student.id),
      nextCursor: rows.length > PAGE_SIZE ? { id: last.id, createdAt: last.created_at } : null,
    };
  }
  if (!["feedback_create", "feedback_create_private"].includes(action)) throw feedbackError("unsupported_action");
  const id = normalizeFeedbackId(body.requestId);
  const content = normalizeFeedbackBody(body.body);
  if (body.isPrivate !== undefined && typeof body.isPrivate !== "boolean") throw feedbackError("invalid_feedback_visibility");
  const isPrivate = action === "feedback_create_private" || body.isPrivate === true;
  const featureId = body.featureId ? normalizeFeedbackId(body.featureId) : "";
  if (featureId) await requireFeature(store, featureId, admin);
  const existing = await store.find(id, true);
  let row = existing;
  if (!existing) {
    if (await store.recentCount(student.id, new Date(now.getTime() - 60 * 1000).toISOString()) >= 5) {
      throw feedbackError("feedback_rate_limited", 429);
    }
    await store.insert({
      id, student_id: student.id, board_type: "free", subject: isPrivate ? FEEDBACK_PRIVATE_SUBJECT : FEEDBACK_SUBJECT,
      title: FEEDBACK_SUBJECT, body: content, created_at: now.toISOString(), updated_at: now.toISOString(),
      feature_preview_id: featureId || null,
    });
    row = await store.find(id);
  }
  // Retrying a timed-out save must not duplicate it or expose another author's post.
  if (!row || row.deleted_at || row.student_id !== student.id || row.body !== content || (row.feature_preview_id || "") !== featureId || (row.subject === FEEDBACK_PRIVATE_SUBJECT) !== isPrivate) throw feedbackError("feedback_request_conflict", 409);
  const names = await store.names([student.id]);
  return { ok: true, item: serializeFeedback(row, student.id, names) };
}

function serializeFeedbackReply(row, studentId, names) {
  return {
    id: row.id, body: row.body, createdAt: row.created_at,
    authorName: row.author_type === "teacher" ? "관리자" : names.get(row.student_id) || fallbackFeedbackName(row.student_id),
    isAdmin: row.author_type === "teacher",
    isOwn: row.author_type === "student" && row.student_id === studentId,
  };
}

function createRemoteFeedbackStore(requestSupabase) {
  return {
    ...createRemoteFeatureStore(requestSupabase),
    list(cursor, { studentId = "", admin = false, featureId = "" } = {}) {
      const clauses = [];
      if (!admin) {
        const quotedStudentId = `"${String(studentId).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
        clauses.push(`or(subject.eq.${encodeURIComponent(FEEDBACK_SUBJECT)},student_id.eq.${encodeURIComponent(quotedStudentId)})`);
      }
      if (cursor) clauses.push(`or(created_at.lt.${encodeURIComponent(cursor.createdAt)},and(created_at.eq.${encodeURIComponent(cursor.createdAt)},id.lt.${cursor.id}))`);
      const filters = clauses.length ? `&and=(${clauses.join(",")})` : "";
      return requestSupabase("GET", `question_posts?${FEEDBACK_FILTER}&deleted_at=is.null&feature_preview_id=${featureId ? `eq.${featureId}` : "is.null"}&select=id,student_id,subject,body,created_at,feature_preview_id,deleted_at&order=created_at.desc,id.desc&limit=${PAGE_SIZE + 1}${filters}`);
    },
    async find(id, includeDeleted = false) {
      const rows = await requestSupabase("GET", `question_posts?${FEEDBACK_FILTER}${includeDeleted ? "" : "&deleted_at=is.null"}&id=eq.${id}&select=id,student_id,subject,body,created_at,feature_preview_id,deleted_at&limit=1`);
      return rows?.[0] || null;
    },
    async deletePost(id, timestamp) {
      await requestSupabase("PATCH", `question_posts?${FEEDBACK_FILTER}&id=eq.${id}&deleted_at=is.null`, { body: "삭제된 의견입니다.", deleted_at: timestamp, updated_at: timestamp }, { Prefer: "return=minimal" });
      await requestSupabase("PATCH", `question_comments?post_id=eq.${id}&deleted_at=is.null`, { body: "삭제된 답글입니다.", deleted_at: timestamp, updated_at: timestamp }, { Prefer: "return=minimal" });
    },
    deleteReply(id, postId, timestamp) {
      return requestSupabase("PATCH", `question_comments?id=eq.${id}&post_id=eq.${postId}&deleted_at=is.null`, { body: "삭제된 답글입니다.", deleted_at: timestamp, updated_at: timestamp }, { Prefer: "return=minimal" });
    },
    async recentCount(studentId, since) {
      const rows = await requestSupabase("GET", `question_posts?board_type=eq.free&subject=in.(${encodeURIComponent(FEEDBACK_SUBJECT)},${encodeURIComponent(FEEDBACK_PRIVATE_SUBJECT)})&student_id=eq.${encodeURIComponent(studentId)}&created_at=gte.${encodeURIComponent(since)}&select=id&limit=5`);
      return rows.length;
    },
    insert(row) {
      return requestSupabase("POST", "question_posts?on_conflict=id", row, { Prefer: "resolution=ignore-duplicates,return=minimal" });
    },
    async names(ids) {
      if (!ids.length) return new Map();
      const filter = ids.map((id) => `"${String(id).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",");
      const rows = await requestSupabase("GET", `study_cafe_profiles?student_id=in.${encodeURIComponent(`(${filter})`)}&select=student_id,nickname`);
      return new Map((rows || []).map((row) => [row.student_id, String(row.nickname || "").trim().slice(0, 20)]));
    },
    listReplies(postId, cursor) {
      const after = cursor ? `&or=(created_at.lt.${encodeURIComponent(cursor.createdAt)},and(created_at.eq.${encodeURIComponent(cursor.createdAt)},id.lt.${cursor.id}))` : "";
      return requestSupabase("GET", `question_comments?post_id=eq.${postId}&deleted_at=is.null&is_hidden=eq.false&select=id,post_id,student_id,author_type,body,created_at&order=created_at.desc,id.desc&limit=${PAGE_SIZE + 1}${after}`);
    },
    async findReply(id, includeDeleted = false) {
      const rows = await requestSupabase("GET", `question_comments?id=eq.${id}${includeDeleted ? "" : "&deleted_at=is.null"}&is_hidden=eq.false&select=id,post_id,student_id,author_type,teacher_name,body,created_at,deleted_at&limit=1`);
      return rows?.[0] || null;
    },
    async recentReplyCount(studentId, admin, since) {
      const author = admin ? "author_type=eq.teacher&teacher_name=eq.%EA%B4%80%EB%A6%AC%EC%9E%90" : `author_type=eq.student&student_id=eq.${encodeURIComponent(studentId)}`;
      const rows = await requestSupabase("GET", `question_comments?${author}&created_at=gte.${encodeURIComponent(since)}&select=id&limit=5`);
      return rows.length;
    },
    insertReply(row) {
      return requestSupabase("POST", "question_comments?on_conflict=id", row, { Prefer: "resolution=ignore-duplicates,return=minimal" });
    },
  };
}

module.exports = { handleStudyCafeFeedback, createRemoteFeedbackStore, canReadFeedback, FEEDBACK_SUBJECT, FEEDBACK_PRIVATE_SUBJECT, PAGE_SIZE };
