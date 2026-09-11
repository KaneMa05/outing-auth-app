const assert = require("node:assert/strict");
const { test } = require("node:test");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const handler = require("../api/study-cafe");
const { handleStudyCafeFeedback, createRemoteFeedbackStore, canReadFeedback, FEEDBACK_SUBJECT, FEEDBACK_PRIVATE_SUBJECT } = require("../api/study-cafe-feedback");
const { handleLocalStudyCafeFeedback } = require("../local-study-cafe-feedback");

function memoryStore(rows = []) {
  const replies = [];
  return {
    rows, replies,
    async list(cursor, { studentId, admin }) {
      return rows.filter((row) => canReadFeedback(row, studentId, admin))
        .filter((row) => !cursor || row.created_at < cursor.createdAt || (row.created_at === cursor.createdAt && row.id < cursor.id))
        .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)).slice(0, 21);
    },
    async find(id) { return rows.find((row) => row.id === id && !row.is_hidden && !row.deleted_at); },
    async recentCount(studentId, since) { return rows.filter((row) => row.student_id === studentId && row.created_at >= since).length; },
    async insert(row) { if (!rows.some((item) => item.id === row.id)) rows.push(row); },
    async names() { return new Map([["student-a", "공부하는 고래"]]); },
    async listReplies(postId, cursor) {
      return replies.filter((row) => row.post_id === postId && !row.is_hidden && !row.deleted_at)
        .filter((row) => !cursor || row.created_at < cursor.createdAt || (row.created_at === cursor.createdAt && row.id < cursor.id))
        .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)).slice(0, 21);
    },
    async findReply(id) { return replies.find((row) => row.id === id && !row.is_hidden && !row.deleted_at); },
    async insertReply(row) { if (!replies.some((item) => item.id === row.id)) replies.push(row); },
    async recentReplyCount(id, admin, since) {
      return replies.filter((row) => row.created_at >= since && (admin ? row.author_type === "teacher" : row.student_id === id)).length;
    },
  };
}
const now = new Date("2026-09-11T05:00:00.000Z");
function call(store, action, body = {}, studentId = "student-a") {
  return handleStudyCafeFeedback({ store, action, body, student: { id: studentId }, now });
}

test("opinions persist across readers; author IDs and private student names are not exposed", async () => {
  const store = memoryStore();
  const body = { requestId: crypto.randomUUID(), body: "알림 기능을 추가해주세요.\n감사합니다!", nickname: "다른 사람" };
  const saved = await call(store, "feedback_create", body);
  assert.equal(saved.item.authorName, "공부하는 고래");
  assert.equal(store.rows[0].board_type, "free");
  assert.equal(store.rows[0].subject, FEEDBACK_SUBJECT);
  const other = await call(store, "feedback_list", {}, "student-b");
  assert.equal(other.items[0].body, body.body);
  assert.equal(other.items[0].isOwn, false);
  assert.equal(other.items[0].student_id, undefined);
  assert.match(other.viewerName, /^수강생 [a-f0-9]{6}$/);
});

test("retrying a committed save is idempotent, including concurrent retries", async () => {
  const store = memoryStore();
  const body = { requestId: crypto.randomUUID(), body: "동일한 의견입니다." };
  await Promise.all([call(store, "feedback_create", body), call(store, "feedback_create", body)]);
  assert.equal(store.rows.length, 1);
  await assert.rejects(call(store, "feedback_create", body, "student-b"), /feedback_request_conflict/);
  await assert.rejects(call(store, "feedback_create", { ...body, body: "변경된 의견" }), /feedback_request_conflict/);
});

test("blank, excessive, malformed submissions and cursor injection are rejected", async () => {
  const store = memoryStore();
  for (const body of [" ", "가", "a".repeat(1001), {}]) {
    await assert.rejects(call(store, "feedback_create", { requestId: crypto.randomUUID(), body }), /invalid_feedback_body/);
  }
  await assert.rejects(call(store, "feedback_create", { requestId: "x&student_id=eq.other", body: "테스트" }), /invalid_feedback_id/);
  await assert.rejects(call(store, "feedback_list", { cursor: { id: crypto.randomUUID(), createdAt: "now),id.gt.0" } }), /invalid_feedback_cursor/);
  assert.equal(store.rows.length, 0);
});

test("rate limit blocks new posts but allows recovery of an already committed save", async () => {
  const store = memoryStore();
  const bodies = Array.from({ length: 5 }, () => ({ requestId: crypto.randomUUID(), body: "새로운 의견입니다." }));
  for (const body of bodies) await call(store, "feedback_create", body);
  await assert.rejects(call(store, "feedback_create", { requestId: crypto.randomUUID(), body: "여섯 번째" }), { message: "feedback_rate_limited", status: 429 });
  assert.equal((await call(store, "feedback_create", bodies[0])).ok, true);
});

test("pagination keeps equal timestamps distinct and excludes newly inserted rows from older pages", async () => {
  const rows = Array.from({ length: 43 }, () => ({
    id: crypto.randomUUID(), student_id: "student-a", body: "의견 내용", created_at: "2026-09-11T05:00:00.123456+00:00",
  }));
  const store = memoryStore(rows);
  const first = await call(store, "feedback_list");
  assert.equal(first.items.length, 20);
  assert.equal(first.nextCursor.createdAt, "2026-09-11T05:00:00.123456+00:00");
  rows.push({ id: crypto.randomUUID(), student_id: "student-a", body: "새 의견", created_at: "2026-09-11T06:00:00.000000+00:00" });
  const second = await call(store, "feedback_list", { cursor: first.nextCursor });
  const third = await call(store, "feedback_list", { cursor: second.nextCursor });
  assert.equal(third.items.length, 3);
  assert.equal(third.nextCursor, null);
  assert.equal(new Set([...first.items, ...second.items, ...third.items].map((item) => item.id)).size, 43);
});

test("remote queries isolate feedback, bound pages, and retain timestamp precision", async () => {
  const requests = [];
  const store = createRemoteFeedbackStore(async (...args) => { requests.push(args); return []; });
  const cursor = { id: crypto.randomUUID(), createdAt: "2026-09-11T05:00:00.123456+00:00" };
  await store.list(cursor);
  const query = new URL(`https://example.test/${requests[0][1]}`).searchParams;
  assert.equal(query.get("board_type"), "eq.free");
  assert.equal(query.get("subject"), `in.(${FEEDBACK_SUBJECT},${FEEDBACK_PRIVATE_SUBJECT})`);
  assert.equal(query.get("deleted_at"), "is.null");
  assert.equal(query.get("is_hidden"), "eq.false");
  assert.equal(query.get("limit"), "21");
  assert.ok(query.get("and").includes(cursor.createdAt));
  assert.ok(query.get("and").includes(`or(subject.eq.${FEEDBACK_SUBJECT},student_id.eq.`));
  await store.insert({ id: cursor.id });
  assert.match(requests[1][3].Prefer, /ignore-duplicates/);
});

test("API rejects inactive devices and offline users before accessing opinions or timers", async () => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = "https://example.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only-key";
  let valid = false;
  let category = "lecture";
  global.fetch = async (url) => {
    if (url.includes("validate_student_device")) return Response.json({ valid });
    if (url.includes("/students?")) return Response.json([{ id: "student-a", student_category: category, is_active: true }]);
    if (url.includes("/question_posts?") || url.includes("/study_cafe_profiles?")) return Response.json([]);
    throw new Error(`Unexpected timer or presence request: ${url}`);
  };
  async function invoke() {
    const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; }, setHeader() {} };
    await handler({ method: "POST", body: { action: "feedback_list", studentId: "student-a", deviceToken: "test-device" } }, res);
    return res;
  }
  try {
    assert.equal((await invoke()).code, 403);
    valid = true;
    category = "offline";
    assert.equal((await invoke()).code, 403);
    for (category of ["lecture", "online_managed"]) {
      const result = await invoke();
      assert.equal(result.code, 200);
      assert.deepEqual(result.body.items, []);
    }
  } finally {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  }
});

test("local shared storage survives reopening and simultaneous writers", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "study-feedback-"));
  const filePath = path.join(dir, "feedback.json");
  try {
    const results = await Promise.all(["student-a", "student-b"].map((id) => handleLocalStudyCafeFeedback({
      filePath, student: { id }, body: { action: "feedback_create", requestId: crypto.randomUUID(), body: `${id}의 의견` },
    })));
    assert.ok(results.every((result) => result.status === 200));
    const list = await handleLocalStudyCafeFeedback({ filePath, student: { id: "student-c" }, body: { action: "feedback_list" } });
    assert.equal(list.payload.items.length, 2);
    assert.ok(list.payload.items.every((item) => !item.isOwn));
  } finally {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    fs.rmdirSync(dir);
  }
});

test("private opinions are only listed to their author and authenticated admin context", async () => {
  const store = memoryStore();
  const privateBody = { requestId: crypto.randomUUID(), body: "비공개로 전달하는 의견입니다.", isPrivate: true };
  const publicBody = { requestId: crypto.randomUUID(), body: "공개 의견입니다." };
  await call(store, "feedback_create", privateBody);
  await call(store, "feedback_create", publicBody);
  const owner = await call(store, "feedback_list");
  assert.equal(owner.items.length, 2);
  assert.equal(owner.items.find((item) => item.id === privateBody.requestId).isPrivate, true);
  const other = await call(store, "feedback_list", { admin: true, studentId: "student-a" }, "student-b");
  assert.deepEqual(other.items.map((item) => item.id), [publicBody.requestId]);
  const admin = await handleStudyCafeFeedback({ store, action: "feedback_list", body: {}, student: { id: "" }, admin: true });
  assert.equal(admin.items.length, 2);
  await assert.rejects(call(store, "feedback_create", { ...privateBody, isPrivate: false }), /feedback_request_conflict/);
  await assert.rejects(call(store, "feedback_create", { ...privateBody, isPrivate: "true" }), /invalid_feedback_visibility/);
});

test("private opinions do not consume other students' pagination slots", async () => {
  const store = memoryStore(Array.from({ length: 30 }, () => ({
    id: crypto.randomUUID(), student_id: "student-a", subject: FEEDBACK_PRIVATE_SUBJECT,
    body: "비공개", created_at: "2026-09-11T06:00:00.000Z",
  })));
  store.rows.push({ id: crypto.randomUUID(), student_id: "student-a", subject: FEEDBACK_SUBJECT, body: "공개", created_at: "2026-09-11T05:00:00.000Z" });
  const result = await call(store, "feedback_list", {}, "student-b");
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].body, "공개");
  assert.equal(result.nextCursor, null);
});

test("admin endpoint denies unsigned and ordinary teacher requests even with a forged admin flag", async () => {
  const adminHandler = require("../api/study-cafe-admin");
  const { createSessionToken } = require("../api/teacher-auth-utils");
  const previous = { fetch: global.fetch, secret: process.env.TEACHER_SESSION_SECRET, url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
  process.env.TEACHER_SESSION_SECRET = "feedback-test-secret";
  process.env.SUPABASE_URL = "https://example.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only";
  let queries = 0;
  global.fetch = async (url) => {
    queries++;
    if (url.includes("question_posts?")) {
      assert.equal(new URL(url).searchParams.has("and"), false);
      return Response.json([{ id: crypto.randomUUID(), student_id: "student-a", subject: FEEDBACK_PRIVATE_SUBJECT, body: "비공개 의견", created_at: now.toISOString() }]);
    }
    if (url.includes("study_cafe_profiles?")) return Response.json([]);
    throw new Error("unexpected query");
  };
  async function invoke(role, action = "feedback_list") {
    const token = role ? createSessionToken("feedback-test-secret", { username: "test", role, permissions: ["study_cafe.read", "study_cafe.write"] }) : "";
    const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; }, setHeader() {} };
    await adminHandler({ method: "POST", headers: { cookie: `teacher_session=${token}` }, body: { action, admin: true } }, res);
    return res;
  }
  try {
    for (const action of ["feedback_list", "feedback_replies", "feedback_reply_create", "feedback_delete", "feedback_reply_delete"]) {
      assert.equal((await invoke(undefined, action)).code, 401);
      assert.equal((await invoke("teacher", action)).code, 403);
    }
    assert.equal(queries, 0);
    const admin = await invoke("admin");
    assert.equal(admin.code, 200);
    assert.equal(admin.body.items[0].isPrivate, true);
  } finally {
    global.fetch = previous.fetch;
    for (const [key, value] of [["TEACHER_SESSION_SECRET", previous.secret], ["SUPABASE_URL", previous.url], ["SUPABASE_SERVICE_ROLE_KEY", previous.key]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test("local private opinions remain private after rereading shared storage", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "private-feedback-"));
  const filePath = path.join(dir, "feedback.json");
  try {
    const created = await handleLocalStudyCafeFeedback({ filePath, student: { id: "owner" }, body: {
      action: "feedback_create", requestId: crypto.randomUUID(), body: "로컬 비공개 의견", isPrivate: true,
    } });
    assert.equal(created.payload.item.isPrivate, true);
    for (const [id, admin, count] of [["owner", false, 1], ["other", false, 0], ["", true, 1]]) {
      const result = await handleLocalStudyCafeFeedback({ filePath, student: { id }, admin, body: { action: "feedback_list" } });
      assert.equal(result.payload.items.length, count);
    }
  } finally {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    fs.rmdirSync(dir);
  }
});

test("public replies support student and admin authors without trusting client roles", async () => {
  const store = memoryStore();
  const postId = crypto.randomUUID();
  await call(store, "feedback_create", { requestId: postId, body: "공개 의견" });
  const studentReply = await call(store, "feedback_reply_create", {
    postId, requestId: crypto.randomUUID(), body: "다른 수강생의 답글", admin: true, author_type: "teacher",
  }, "student-b");
  assert.equal(studentReply.item.isAdmin, false);
  const adminReply = await handleStudyCafeFeedback({ store, action: "feedback_reply_create", student: { id: "" }, admin: true, now, body: {
    postId, requestId: crypto.randomUUID(), body: "관리자가 확인했습니다.",
  } });
  assert.equal(adminReply.item.authorName, "관리자");
  assert.equal(adminReply.item.isAdmin, true);
  assert.equal(store.replies.find((row) => row.id === adminReply.item.id).student_id, null);
  const list = await call(store, "feedback_replies", { postId });
  assert.equal(list.items.length, 2);
  assert.ok(list.items.every((row) => row.student_id === undefined));
});

test("private parent blocks both reply reads and writes before any reply lookup", async () => {
  const store = memoryStore();
  const postId = crypto.randomUUID();
  await call(store, "feedback_create_private", { requestId: postId, body: "개인 건의사항" });
  await call(store, "feedback_reply_create", { postId, requestId: crypto.randomUUID(), body: "작성자의 추가 설명" });
  for (const action of ["feedback_replies", "feedback_reply_create"]) {
    await assert.rejects(call(store, action, { postId, requestId: crypto.randomUUID(), body: "다른 사람 답글", admin: true }, "student-b"), { status: 404 });
  }
  const admin = await handleStudyCafeFeedback({ store, action: "feedback_replies", student: { id: "" }, admin: true, body: { postId } });
  assert.equal(admin.items.length, 1);
  store.rows[0].is_hidden = true;
  await assert.rejects(call(store, "feedback_replies", { postId }), { status: 404 });
  assert.equal(store.replies.length, 1);
});

test("reply retry is idempotent and rejects altered bodies or different parents", async () => {
  const store = memoryStore();
  const postId = crypto.randomUUID();
  const otherPostId = crypto.randomUUID();
  for (const id of [postId, otherPostId]) await call(store, "feedback_create", { requestId: id, body: "건의사항" });
  const body = { postId, requestId: crypto.randomUUID(), body: "답글 내용" };
  await Promise.all([call(store, "feedback_reply_create", body), call(store, "feedback_reply_create", body)]);
  assert.equal(store.replies.length, 1);
  await assert.rejects(call(store, "feedback_reply_create", { ...body, postId: otherPostId }), /feedback_request_conflict/);
  await assert.rejects(call(store, "feedback_reply_create", { ...body, body: "수정된 내용" }), /feedback_request_conflict/);
  await assert.rejects(call(store, "feedback_reply_create", { ...body, requestId: crypto.randomUUID(), body: " " }), /invalid_feedback_body/);
});

test("reply pagination excludes hidden replies and preserves equal timestamp rows", async () => {
  const store = memoryStore();
  const postId = crypto.randomUUID();
  await call(store, "feedback_create", { requestId: postId, body: "건의사항" });
  store.replies.push(...Array.from({ length: 24 }, (_, index) => ({
    id: crypto.randomUUID(), post_id: postId, student_id: "student-a", author_type: "student",
    body: "답글", created_at: now.toISOString(), is_hidden: index === 0,
  })));
  const first = await call(store, "feedback_replies", { postId });
  const second = await call(store, "feedback_replies", { postId, cursor: first.nextCursor });
  assert.equal(first.items.length, 20);
  assert.equal(second.items.length, 3);
  assert.equal(new Set([...first.items, ...second.items].map((item) => item.id)).size, 23);
  await assert.rejects(call(store, "feedback_reply_create", { postId, requestId: crypto.randomUUID(), body: "너무 잦은 답글" }), { status: 429 });
});

test("local admin reply to private opinion survives a reload and remains private", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "feedback-replies-"));
  const filePath = path.join(dir, "feedback.json");
  const postId = crypto.randomUUID();
  try {
    await handleLocalStudyCafeFeedback({ filePath, student: { id: "owner" }, body: { action: "feedback_create_private", requestId: postId, body: "개인 문의" } });
    const saved = await handleLocalStudyCafeFeedback({ filePath, student: { id: "" }, admin: true, body: {
      action: "feedback_reply_create", postId, requestId: crypto.randomUUID(), body: "관리자 답변입니다.",
    } });
    assert.equal(saved.payload.item.isAdmin, true);
    const owner = await handleLocalStudyCafeFeedback({ filePath, student: { id: "owner" }, body: { action: "feedback_replies", postId } });
    assert.equal(owner.payload.items.length, 1);
    const outsider = await handleLocalStudyCafeFeedback({ filePath, student: { id: "other" }, body: { action: "feedback_replies", postId } });
    assert.equal(outsider.status, 404);
  } finally {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    fs.rmdirSync(dir);
  }
});
