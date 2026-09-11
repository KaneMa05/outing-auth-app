const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const vm = require("node:vm");
const crypto = require("node:crypto");

const source = fs.readFileSync("app.js", "utf8");
const start = source.indexOf("function openStudyCafeNoticeModal(");
const end = source.indexOf("\nfunction renderStudentPrivateStudyRoom", start);
assert.ok(start >= 0 && end > start);

async function flush() { for (let i = 0; i < 30; i++) await Promise.resolve(); }
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
function harness() {
  const nodes = [];
  const requests = [];
  const controls = { studentId: "student-a", modal: null, request: async () => ({ ok: true, items: [], viewerName: "공부고래", nextCursor: null }) };
  function el(tag, props = {}, children = []) {
    const node = {
      tag, ...props, isConnected: true, events: {}, children: Array.isArray(children) ? children : [children],
      addEventListener(event, fn) { this.events[event] = fn; },
      replaceChildren(...items) { this.children = items; },
    };
    nodes.push(node);
    return node;
  }
  const context = vm.createContext({
    crypto, console, el, AbortSignal, confirm: () => controls.confirm !== false, studyCafeFeedbackDrafts: new Map(), studyCafeFeedbackReplyDrafts: new Map(), STUDY_CAFE_NOTICE: { title: "의견을 듣고자 합니다." },
    teacherAuth: { user: { username: "admin-test" } }, isTeacherAdmin: () => true,
    fetch: async (url, options) => {
      const payload = JSON.parse(options.body);
      requests.push({ endpoint: url, action: payload.action, payload });
      const result = await controls.request(payload.action, payload);
      return { ok: result.ok, status: result.httpStatus || 200, json: async () => result };
    },
    getAuthedStudent: () => ({ id: controls.studentId }), isOnlineStudentExperience: () => true,
    button: (label, className, type, onclick) => el("button", { className, type, onclick }, label),
    openInfoModal: () => {
      if (controls.modal) controls.modal.isConnected = false;
      controls.modal = { isConnected: true };
      return { modal: controls.modal };
    },
    requestStudyCafeAction: (action, payload) => { requests.push({ action, payload }); return controls.request(action, payload); },
  });
  vm.runInContext(source.slice(start, end), context);
  return {
    controls, requests,
    open(options) { context.openStudyCafeNoticeModal(options); },
    replies(post, admin = false) { return context.renderStudyCafeFeedbackReplies(post, { admin }); },
    deletion(item, options) { return context.renderStudyCafeFeedbackDelete(item, options); },
    find(className) { return nodes.findLast((node) => node.className === className); },
    type(value) { const input = this.find("study-cafe-feedback-input"); input.value = value; input.events.input(); },
    submit() { return this.find("study-cafe-feedback-form").events.submit({ preventDefault() {} }); },
  };
}
function item(body = "타이머 기능을 추가해주세요.") {
  return { id: crypto.randomUUID(), body, authorName: "공부고래", createdAt: "2026-09-11T05:00:00.000Z", isOwn: true };
}

test("opening the announcement loads public opinions and enables immediate entry", async () => {
  const h = harness();
  const remote = item("<img src=x onerror=alert(1)>\n문자 그대로 표시");
  h.controls.request = async () => ({ ok: true, items: [remote], viewerName: "공부고래", nextCursor: null });
  h.open();
  await flush();
  assert.equal(h.requests[0].action, "feedback_list");
  assert.equal(h.find("study-cafe-feedback-author").textContent, "공부고래");
  assert.equal(h.find("study-cafe-feedback-submit").disabled, true);
  h.type("새로운 의견입니다.");
  assert.equal(h.find("study-cafe-feedback-submit").disabled, false);
  assert.equal(h.find("study-cafe-feedback-body").children[0], remote.body);
  assert.equal(h.find("study-cafe-feedback-body").innerHTML, undefined);
});

test("successful submission prepends the saved item, clears the editor, and blocks double clicks", async () => {
  const h = harness();
  h.open();
  await flush();
  h.type("추가 기능을 건의합니다.");
  const save = deferred();
  h.controls.request = () => save.promise;
  const pending = h.submit();
  await h.submit();
  assert.equal(h.requests.filter((request) => request.action === "feedback_create").length, 1);
  assert.equal(h.find("study-cafe-feedback-input").disabled, true);
  save.resolve({ ok: true, item: item("추가 기능을 건의합니다.") });
  await pending;
  assert.equal(h.find("study-cafe-feedback-input").value, "");
  assert.equal(h.find("study-cafe-feedback-list").children.length, 1);
  assert.match(h.find("study-cafe-feedback-message").textContent, /등록되었어요/);
});

test("a failed save preserves text and reuses the same request ID on retry", async () => {
  const h = harness();
  h.open();
  await flush();
  h.type("등록 재시도 의견입니다.");
  h.controls.request = async () => { throw new Error("network failure"); };
  await h.submit();
  assert.equal(h.find("study-cafe-feedback-input").value, "등록 재시도 의견입니다.");
  assert.equal(h.find("study-cafe-feedback-submit").disabled, false);
  const first = h.requests.at(-1).payload.requestId;
  h.controls.request = async () => ({ ok: true, item: item() });
  await h.submit();
  assert.equal(h.requests.at(-1).payload.requestId, first);
});

test("closing and reopening during a save waits for it and loads the persisted result", async () => {
  const h = harness();
  h.open();
  await flush();
  h.type("창을 닫아도 저장되는 의견");
  const save = deferred();
  h.controls.request = (action) => action === "feedback_create" ? save.promise : Promise.resolve({ ok: true, items: [item()], viewerName: "공부고래" });
  const pending = h.submit();
  h.controls.modal.isConnected = false;
  h.open();
  assert.equal(h.find("study-cafe-feedback-input").disabled, true);
  save.resolve({ ok: true, item: item() });
  await pending;
  await flush();
  assert.equal(h.find("study-cafe-feedback-input").value, "");
  assert.equal(h.find("study-cafe-feedback-input").disabled, false);
  assert.equal(h.find("study-cafe-feedback-list").children.length, 1);
});

test("list failure can be retried without discarding the draft", async () => {
  const h = harness();
  h.controls.request = async () => ({ ok: false });
  h.open();
  h.type("초안 내용입니다.");
  await flush();
  assert.match(h.find("study-cafe-feedback-message").textContent, /다시 열어주세요/);
  h.controls.request = async () => ({ ok: true, items: [], viewerName: "공부고래" });
  h.open();
  await flush();
  assert.equal(h.find("study-cafe-feedback-input").value, "초안 내용입니다.");
  assert.equal(h.find("study-cafe-feedback-submit").disabled, false);
});

test("loading additional opinions appends them without replacing the typed draft", async () => {
  const h = harness();
  const first = item();
  const second = item("두 번째 의견");
  const cursor = { id: first.id, createdAt: first.createdAt };
  h.controls.request = async (_, payload) => payload.cursor
    ? { ok: true, items: [second], viewerName: "공부고래", nextCursor: null }
    : { ok: true, items: [first], viewerName: "공부고래", nextCursor: cursor };
  h.open();
  await flush();
  h.type("작성 중인 의견");
  await h.find("study-cafe-feedback-more").onclick();
  assert.equal(h.find("study-cafe-feedback-input").value, "작성 중인 의견");
  assert.equal(h.find("study-cafe-feedback-list").children.length, 2);
  assert.equal(h.find("study-cafe-feedback-more").hidden, true);
});

test("private checkbox sends private visibility and preserves it after a failed request", async () => {
  const h = harness();
  h.open();
  await flush();
  h.type("비공개로 등록할 의견입니다.");
  const checkbox = h.find("study-cafe-feedback-private-input");
  checkbox.checked = true;
  checkbox.events.change();
  assert.match(h.find("study-cafe-feedback-sharing").textContent, /작성자와 관리자만/);
  h.controls.request = async () => ({ ok: false });
  await h.submit();
  const first = h.requests.at(-1).payload;
  assert.equal(h.requests.at(-1).action, "feedback_create_private");
  assert.equal(first.isPrivate, true);
  assert.equal(checkbox.checked, true);
  h.controls.request = async () => ({ ok: true, item: { ...item(), isPrivate: true } });
  await h.submit();
  assert.equal(h.requests.at(-1).payload.requestId, first.requestId);
  assert.equal(h.find("study-cafe-feedback-private-badge").children[0], "비공개");
});

test("reply lists open by default and load on the native toggle event without a click", async () => {
  const h = harness();
  const post = item();
  const thread = h.replies(post);
  assert.equal(h.requests.length, 0);
  assert.equal(thread.open, true);
  thread.events.toggle();
  await flush();
  assert.equal(h.requests[0].action, "feedback_replies");
  assert.equal(h.requests[0].payload.postId, post.id);
  const input = h.find("study-cafe-feedback-reply-input");
  input.value = "<script>문자 그대로 보여주세요</script>";
  input.events.input();
  h.controls.request = async () => ({ ok: true, item: item(input.value) });
  await h.find("study-cafe-feedback-reply-form").events.submit({ preventDefault() {} });
  assert.equal(h.requests.at(-1).payload.postId, post.id);
  assert.equal(input.value, "");
  assert.equal(h.find("study-cafe-feedback-body").children[0], "<script>문자 그대로 보여주세요</script>");
});

test("failed reply retains draft and idempotency key; private admin reply uses the admin endpoint", async () => {
  const h = harness();
  const post = { ...item(), isPrivate: true };
  const thread = h.replies(post, true);
  assert.match(h.find("study-cafe-feedback-sharing").children[0], /작성자와 관리자만/);
  thread.open = true;
  thread.events.toggle();
  await flush();
  const input = h.find("study-cafe-feedback-reply-input");
  input.value = "관리자가 남기는 답변입니다.";
  input.events.input();
  h.controls.request = async () => ({ ok: false });
  const form = h.find("study-cafe-feedback-reply-form");
  await form.events.submit({ preventDefault() {} });
  const id = h.requests.at(-1).payload.requestId;
  assert.equal(input.value, "관리자가 남기는 답변입니다.");
  h.controls.request = async () => ({ ok: true, item: { ...item(), isAdmin: true, authorName: "관리자" } });
  await form.events.submit({ preventDefault() {} });
  assert.equal(h.requests.at(-1).endpoint, "/api/study-cafe-admin");
  assert.equal(h.requests.at(-1).payload.requestId, id);
  assert.equal(h.find("study-cafe-feedback-admin-badge").children[0], "관리자 답변");
});

test("reply save blocks double clicks and clears the draft in a rebuilt thread", async () => {
  const h = harness();
  const post = item();
  const first = h.replies(post);
  first.open = true;
  first.events.toggle();
  await flush();
  const input = h.find("study-cafe-feedback-reply-input");
  input.value = "중복 방지 답글";
  input.events.input();
  const save = deferred();
  h.controls.request = (action) => action === "feedback_reply_create" ? save.promise : Promise.resolve({ ok: true, items: [item()], nextCursor: null });
  const form = h.find("study-cafe-feedback-reply-form");
  const pending = form.events.submit({ preventDefault() {} });
  await form.events.submit({ preventDefault() {} });
  assert.equal(h.requests.filter((r) => r.action === "feedback_reply_create").length, 1);
  first.isConnected = false;
  const rebuilt = h.replies(post);
  rebuilt.open = true;
  rebuilt.events.toggle();
  save.resolve({ ok: true, item: item() });
  await pending;
  await flush();
  assert.equal(h.find("study-cafe-feedback-reply-input").value, "");
  assert.equal(h.find("study-cafe-feedback-reply-list").children.length, 1);
});


test("feature composers isolate drafts and include the selected feature in reads and writes", async () => {
  const h = harness(), featureId = crypto.randomUUID();
  h.open({ featureId }); await flush();
  h.type("Feature suggestion");
  h.open(); await flush();
  assert.equal(h.find("study-cafe-feedback-input").value, "");
  h.type("General suggestion");
  h.open({ featureId }); await flush();
  assert.equal(h.find("study-cafe-feedback-input").value, "Feature suggestion");
  assert.equal(h.requests.at(-1).payload.featureId, featureId);
  h.controls.request = async () => ({ ok: true, item: item() });
  await h.submit();
  assert.equal(h.requests.at(-1).payload.featureId, featureId);
  h.open(); await flush();
  assert.equal(h.find("study-cafe-feedback-input").value, "General suggestion");
});

test("deletion controls respect ownership and confirmation, and preserve content on failure", async () => {
  const h = harness();
  assert.equal(h.deletion({ ...item(), isOwn: false }), null);
  assert.equal(h.deletion({ ...item(), isDeleted: true }, { admin: true }), null);
  const own = item(); let deleted = false;
  h.deletion(own, { onDeleted: () => { deleted = true; } });
  const control = h.find("study-cafe-feedback-delete");
  h.controls.confirm = false; await control.onclick(); assert.equal(h.requests.length, 0);
  h.controls.confirm = true;
  h.controls.request = async () => ({ ok: false });
  await control.onclick(); assert.equal(deleted, false); assert.equal(control.disabled, false);
  h.controls.request = async () => ({ ok: true });
  await control.onclick(); assert.equal(deleted, true);
  assert.equal(h.requests.at(-1).action, "feedback_delete");
  assert.equal(h.requests.at(-1).payload.postId, own.id);
});

test("deletion blocks duplicate clicks and ignores responses after account changes", async () => {
  const h = harness(), pending = deferred(); let deleted = false;
  h.controls.request = () => pending.promise;
  h.deletion(item(), { onDeleted: () => { deleted = true; } });
  const control = h.find("study-cafe-feedback-delete"), task = control.onclick();
  await control.onclick(); assert.equal(h.requests.length, 1);
  h.controls.studentId = "student-b";
  pending.resolve({ ok: true }); await task;
  assert.equal(deleted, false);
});

test("deleted parents hide reply entry and admin reply deletion calls the authenticated endpoint", async () => {
  const h = harness(), parent = { ...item(), isDeleted: true };
  h.replies(parent);
  assert.equal(h.find("study-cafe-feedback-reply-form").hidden, true);
  assert.equal(h.find("study-cafe-feedback-reply-submit").disabled, true);
  const reply = { ...item(), isOwn: false };
  h.controls.request = async () => ({ ok: true });
  h.deletion(reply, { admin: true, postId: parent.id });
  await h.find("study-cafe-feedback-delete").onclick();
  const request = h.requests.at(-1);
  assert.equal(request.endpoint, "/api/study-cafe-admin");
  assert.equal(request.payload.replyId, reply.id);
  assert.equal(request.payload.postId, parent.id);
});

test("replies have no refresh button and a failed load can recover when reopened", async () => {
  const h = harness(), post = item(), thread = h.replies(post);
  thread.events.toggle();
  await flush();
  assert.equal(h.find("study-cafe-feedback-reply-head").hidden, true);
  assert.equal(h.find("study-cafe-feedback-reply-status").textContent, "");
  assert.equal(h.find("study-cafe-feedback-reply-refresh"), undefined);
  assert.equal(h.find("study-cafe-feedback-text-button"), undefined);
  h.controls.request = async () => ({ ok: false });
  h.replies(post).events.toggle();
  await flush();
  assert.match(h.find("study-cafe-feedback-reply-status").textContent, /다시 열어주세요/);
  h.controls.request = async () => ({ ok: true, items: [item()], nextCursor: null });
  h.replies(post).events.toggle();
  await flush();
  assert.equal(h.find("study-cafe-feedback-reply-list").children.length, 1);
  assert.equal(h.find("study-cafe-feedback-reply-status").textContent, "");
});
