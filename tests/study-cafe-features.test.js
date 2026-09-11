const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { randomUUID } = require("node:crypto");
const { handleLocalStudyCafeFeedback } = require("../local-study-cafe-feedback");
const { createRemoteFeedbackStore } = require("../api/study-cafe-feedback");

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "feature-hub-test-"));
  t.after(() => {
    for (const name of ["feedback.json", "feedback-features.json"]) {
      const file = path.join(dir, name);
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
    fs.rmdirSync(dir);
  });
  const call = (action, body = {}, actor = "admin") => handleLocalStudyCafeFeedback({
    body: { action, ...body }, student: { id: actor }, admin: actor === "admin", filePath: path.join(dir, "feedback.json"),
  });
  call.readRows = () => JSON.parse(fs.readFileSync(path.join(dir, "feedback.json"), "utf8"));
  return call;
}
const draft = () => ({ featureId: randomUUID(), title: "새 플래너", description: "계획을 한눈에 보는 기능입니다.", question: "어떤 정보가 더 필요할까요?", isPublished: false, images: [], retainedImagePaths: [] });
const photo = { contentType: "image/png", data: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1ZkAAAAASUVORK5CYII=" };

test("drafts stay admin-only; photos persist; publication and announcement selection are reflected", async (t) => {
  const call = fixture(t), feature = { ...draft(), images: [photo] };
  assert.equal((await call("feature_save", feature, "student-a")).status, 403);
  let saved = await call("feature_save", feature);
  assert.equal(saved.status, 200);
  assert.equal(saved.payload.feature.images[0].url, photo.data);
  const retainedImagePaths = saved.payload.feature.images.map((i) => i.path);
  assert.equal((await call("feature_list", {}, "student-a")).payload.items.length, 0);
  assert.equal((await call("feature_detail", feature, "student-a")).status, 404);
  assert.equal((await call("feature_highlight", feature)).status, 400);
  saved = await call("feature_save", { ...feature, images: [], retainedImagePaths, isPublished: true });
  assert.equal(saved.payload.feature.images[0].url, photo.data);
  saved = await call("feature_save", { ...feature, images: [photo], retainedImagePaths, isPublished: true });
  assert.equal(saved.payload.feature.images.length, 2);
  assert.equal(saved.payload.feature.images[1].url, photo.data);
  await call("feature_highlight", feature);
  assert.equal((await call("feature_list", {}, "student-a")).payload.activeId, feature.featureId);
  const other = { ...draft(), isPublished: true };
  await call("feature_save", other);
  await call("feature_highlight", other);
  assert.equal((await call("feature_list", {}, "student-a")).payload.activeId, other.featureId);
  await call("feature_save", { ...other, isPublished: false });
  assert.equal((await call("feature_list", {}, "student-a")).payload.activeId, feature.featureId);
});

test("free and feature opinions remain separate and private replies survive publication changes", async (t) => {
  const call = fixture(t), feature = { ...draft(), isPublished: true };
  await call("feature_save", feature);
  const general = await call("feedback_create", { requestId: randomUUID(), body: "새로운 자유 건의입니다." }, "student-a");
  const specific = await call("feedback_create_private", { requestId: randomUUID(), featureId: feature.featureId, body: "이 기능에 대한 비공개 의견입니다." }, "student-a");
  assert.equal(general.status, 200);
  assert.equal(specific.status, 200);
  assert.deepEqual((await call("feedback_list", {}, "student-a")).payload.items.map((i) => i.id), [general.payload.item.id]);
  assert.equal((await call("feedback_list", feature, "student-b")).payload.items.length, 0);
  assert.equal((await call("feedback_list", feature)).payload.items[0].id, specific.payload.item.id);
  const reply = { postId: specific.payload.item.id, requestId: randomUUID(), body: "의견 감사합니다. 반영을 검토하겠습니다." };
  assert.equal((await call("feedback_reply_create", reply)).status, 200);
  assert.equal((await call("feedback_replies", reply, "student-b")).status, 404);
  assert.equal((await call("feedback_replies", reply, "student-a")).payload.items[0].isAdmin, true);
  await call("feature_save", { ...feature, isPublished: false });
  assert.equal((await call("feedback_replies", reply, "student-a")).status, 404);
  assert.equal((await call("feedback_list", feature, "student-a")).status, 404);
  assert.equal((await call("feedback_replies", reply)).payload.items.length, 1);
  await call("feature_save", feature);
  assert.equal((await call("feedback_replies", reply, "student-a")).payload.items.length, 1);
});

test("feature saves reject forged image paths, oversized galleries and invalid content without replacing saved data", async (t) => {
  const call = fixture(t), feature = draft();
  await call("feature_save", feature);
  for (const change of [{ retainedImagePaths: ["another/photo.jpg"] }, { images: [photo, photo, photo, photo] }, { images: [{ data: "<script>", contentType: "image/png" }] }, { title: "x" }, { isPublished: "true" }]) {
    assert.equal((await call("feature_save", { ...feature, ...change })).status, 400);
  }
  assert.equal((await call("feature_detail", feature)).payload.feature.title, feature.title);
  assert.equal((await call("feature_list", { offset: -1 })).status, 400);
  assert.equal((await call("feature_detail", { featureId: "x&is_published=eq.true" })).status, 400);
});

test("remote lists filter feature and visibility before pagination", async () => {
  const queries = [], id = randomUUID();
  const store = createRemoteFeedbackStore(async (method, query) => { queries.push(query); return []; });
  await store.list(null, { studentId: "12345" });
  await store.list(null, { studentId: "12345", featureId: id });
  await store.listFeatures(false, 20);
  assert.match(queries[0], /feature_preview_id=is.null/);
  assert.ok(queries[1].includes(`feature_preview_id=eq.${id}`));
  assert.match(queries[2], /limit=21&offset=20&is_published=eq.true/);
});

test("only authors and admins can delete; deletions are retryable and never resurrect on create retry", async (t) => {
  const call = fixture(t);
  const original = { requestId: randomUUID(), body: "삭제할 개인 의견" };
  await call("feedback_create", original, "student-a");
  const payload = { postId: original.requestId };
  assert.equal((await call("feedback_delete", payload, "student-b")).status, 403);
  assert.equal((await call("feedback_delete", payload, "student-a")).payload.keepThread, false);
  assert.equal((await call("feedback_delete", payload, "student-a")).status, 200);
  assert.equal((await call("feedback_list", {}, "student-a")).payload.items.length, 0);
  assert.equal((await call("feedback_create", original, "student-a")).status, 409);
  const another = { requestId: randomUUID(), body: "관리자가 삭제할 의견" };
  await call("feedback_create", another, "student-a");
  assert.equal((await call("feedback_delete", { postId: another.requestId })).status, 200);
});

test("deleting an opinion deletes every reply and blocks all later reads and writes", async (t) => {
  const call = fixture(t), postId = randomUUID(), replyId = randomUUID();
  await call("feedback_create_private", { requestId: postId, body: "삭제 전 비공개 본문" }, "student-a");
  await call("feedback_reply_create", { postId, requestId: replyId, body: "관리자 답글 보관" });
  await call("feedback_reply_create", { postId, requestId: randomUUID(), body: "작성자 답글" }, "student-a");
  assert.equal((await call("feedback_delete", { postId }, "student-a")).payload.keepThread, false);
  const stored = call.readRows().find((row) => row.id === postId);
  assert.equal(stored.replies.length, 2);
  assert.ok(stored.replies.every((reply) => reply.deleted_at && reply.body === "삭제된 답글입니다."));
  assert.equal((await call("feedback_list", {}, "student-a")).payload.items.length, 0);
  assert.equal((await call("feedback_list", {}, "student-b")).payload.items.length, 0);
  assert.equal((await call("feedback_replies", { postId }, "student-b")).status, 404);
  assert.equal((await call("feedback_replies", { postId }, "student-a")).status, 404);
  assert.equal((await call("feedback_replies", { postId })).status, 404);
  assert.equal((await call("feedback_reply_create", { postId, requestId: randomUUID(), body: "새 답글 금지" }, "student-a")).status, 404);
  assert.equal((await call("feedback_delete", { postId }, "student-a")).status, 200);
  assert.equal((await call("feedback_list")).payload.items.length, 0);
});

test("remote cascade targets every reply and can retry after a partial deletion failure", async () => {
  const requests = [], postId = randomUUID();
  let failReplies = true;
  const store = createRemoteFeedbackStore(async (method, query, body) => {
    requests.push({ method, query, body });
    if (query.startsWith("question_comments?") && failReplies) { failReplies = false; throw new Error("temporary_failure"); }
    return [];
  });
  await assert.rejects(store.deletePost(postId, "2026-09-11T00:00:00Z"), /temporary_failure/);
  await store.deletePost(postId, "2026-09-11T00:01:00Z");
  assert.equal(requests.length, 4);
  for (const request of [requests[1], requests[3]]) {
    assert.equal(request.method, "PATCH");
    assert.equal(request.query, `question_comments?post_id=eq.${postId}&deleted_at=is.null`);
    assert.equal(request.body.body, "삭제된 답글입니다.");
  }
});

test("reply authors can delete their reply but cannot delete others' replies or forge a parent", async (t) => {
  const call = fixture(t), postId = randomUUID(), otherPost = randomUUID(), replyId = randomUUID();
  await call("feedback_create", { requestId: postId, body: "공개 의견" }, "student-a");
  await call("feedback_create", { requestId: otherPost, body: "다른 공개 의견" }, "student-a");
  const reply = { postId, requestId: replyId, body: "다른 수강생의 답글" };
  await call("feedback_reply_create", reply, "student-b");
  assert.equal((await call("feedback_reply_delete", { postId, replyId }, "student-a")).status, 403);
  assert.equal((await call("feedback_reply_delete", { postId: otherPost, replyId }, "student-b")).status, 404);
  assert.equal((await call("feedback_reply_delete", { postId, replyId }, "student-b")).status, 200);
  assert.equal((await call("feedback_replies", { postId }, "student-a")).payload.items.length, 0);
  assert.equal((await call("feedback_reply_create", reply, "student-b")).status, 409);
});
