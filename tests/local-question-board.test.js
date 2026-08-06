const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { SUBJECTS, handleLocalQuestionBoard } = require("../local-question-board");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "local-question-board-"));
const filePath = path.join(tempDir, "board.json");
const student = { id: "900001", name: "수강생 미리보기", track: "해경" };
const call = (action, payload = {}) => handleLocalQuestionBoard({ body: { action, ...payload }, student, filePath });

try {
  assert.equal(SUBJECTS[0], "자유");
  assert.deepEqual(call("subjects").payload.subjects, SUBJECTS);
  const created = call("create", { subject: SUBJECTS[0], title: "첫 질문", body: "질문 내용입니다." });
  assert.equal(created.status, 201);
  assert.ok(created.payload.postId);

  const listed = call("list", { subject: SUBJECTS[0] });
  assert.equal(listed.payload.posts.length, 1);
  assert.equal(listed.payload.posts[0].isOwn, true);

  assert.equal(call("comment_create", { postId: created.payload.postId, body: "댓글 답변입니다." }).status, 201);
  const detail = call("detail", { postId: created.payload.postId });
  assert.equal(detail.payload.post.viewCount, 1);
  assert.equal(detail.payload.post.commentCount, 1);
  assert.equal(detail.payload.comments[0].isOwn, true);
  assert.equal(call("list", { search: "없는 검색어" }).payload.posts.length, 0);

  assert.equal(call("update", {
    postId: created.payload.postId,
    subject: SUBJECTS[1],
    title: "수정한 질문",
    body: "수정한 질문 내용입니다.",
  }).status, 200);
  assert.equal(call("list", { subject: SUBJECTS[1] }).payload.posts[0].title, "수정한 질문");
  assert.equal(call("delete", { postId: created.payload.postId }).status, 200);
  assert.equal(call("list").payload.posts.length, 0);

  const localServerSource = fs.readFileSync(path.resolve(__dirname, "..", "local-dev-server.js"), "utf8");
  assert.match(localServerSource, /settings\.forceLocalStudentAuth/);
  assert.match(localServerSource, /profile\.deviceToken !== deviceToken/);
  assert.match(localServerSource, /category !== "lecture"/);
  console.log("local question board tests passed");
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
