const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const vm = require("node:vm");
const crypto = require("node:crypto");
const source = fs.readFileSync("feedback-hub.js", "utf8");
async function flush() { for (let i = 0; i < 40; i++) await Promise.resolve(); }
function harness(admin = false) {
  const nodes = [], requests = [], boards = [];
  const state = { id: "student-a", request: async () => ({ ok: true, items: [], nextOffset: null }) };
  function el(tag, props = {}, children = []) {
    const node = { tag, ...props, children: Array.isArray(children) ? children.filter(Boolean) : [children], events: {}, isConnected: true,
      append(...items) { this.children.push(...items); }, appendChild(item) { this.children.push(item); },
      replaceChildren(...items) { this.children = items; }, setAttribute(k, v) { this[k] = v; },
      addEventListener(k, fn) { this.events[k] = fn; },
    };
    nodes.push(node); return node;
  }
  const context = vm.createContext({ el, crypto, queueMicrotask, AbortSignal,
    teacherAuth: { user: { username: "admin" } }, isTeacherAdmin: () => admin,
    getAuthedStudent: () => ({ id: state.id }),
    button: (label, className, type, onclick) => el("button", { className, type, onclick }, label),
    openStudyCafeNoticeModal: (options) => boards.push(options),
    openStudyCafeFeedbackAdminModal: (options) => boards.push(options),
    requestStudyCafeAction: (action, payload) => { requests.push({ action, payload }); return state.request(action, payload); },
    fetch: async (url, options) => { const payload = JSON.parse(options.body); requests.push(payload); return { ok: true, json: () => state.request(payload.action, payload) }; },
    prepareQuestionImage: async () => ({ data: "photo-data", contentType: "image/jpeg" }),
    openPhotoModal: (photo) => { state.photo = photo; },
  });
  vm.runInContext(source, context);
  return { state, requests, boards, nodes, start() { this.hub = context.createFeedbackHub(admin); this.hub.start(); },
    button(label) { return nodes.findLast((n) => n.tag === "button" && (n.textContent || n.children[0]) === label); },
    node(className) { return nodes.findLast((n) => n.className === className); },
  };
}
const feature = { id: crypto.randomUUID(), title: "새 기능", description: "기능 설명", question: "의견을 알려주세요.", isPublished: true, images: [{ path: "photo.jpg", url: "https://example.com/photo.jpg" }] };

test("announcement opens the selected preview with expandable photo and its own board; free suggestions stay separate", async () => {
  const h = harness();
  h.state.request = async (action) => action === "feature_list" ? { ok: true, items: [feature], activeId: feature.id } : { ok: true, feature };
  h.start(); await flush();
  assert.equal(h.boards[0].featureId, feature.id);
  h.nodes.find((n) => n.ariaLabel === "소개 사진 1 확대").onclick();
  assert.equal(h.state.photo.photoUrl, feature.images[0].url);
  h.button("자유 건의").onclick();
  assert.equal(h.boards.at(-1).featureId, "");
  h.button("새 기능 미리보기").onclick(); await flush();
  assert.equal(h.boards.at(-1).featureId, feature.id);
});

test("late feature responses cannot replace a switched tab or another student's screen", async () => {
  const h = harness(); let resolve;
  h.state.request = () => new Promise((done) => { resolve = done; });
  h.start(); h.button("자유 건의").onclick();
  resolve({ ok: true, items: [feature], activeId: feature.id }); await flush();
  assert.equal(h.requests.length, 1);
  assert.equal(h.boards.length, 1);
  h.button("새 기능 미리보기").onclick();
  h.state.id = "student-b";
  resolve({ ok: true, items: [feature], activeId: feature.id }); await flush();
  assert.equal(h.requests.length, 2);
  assert.equal(h.boards.length, 1);
});

test("failed feature list can retry and still leaves free suggestions accessible", async () => {
  const h = harness(); h.state.request = async () => { throw new Error("network"); };
  h.start(); await flush();
  assert.equal(h.button("다시 시도").hidden, false);
  h.state.request = async () => ({ ok: true, items: [feature], nextOffset: null });
  h.button("다시 시도").onclick(); await flush();
  assert.equal(h.node("feedback-hub-cards").children.length, 1);
  h.button("자유 건의").onclick(); assert.equal(h.boards[0].featureId, "");
});

test("admin editor uploads photos, explicitly publishes, prevents duplicate saves and opens targeted opinions", async () => {
  const h = harness(true); h.start(); await flush();
  h.button("+ 새 기능 소개 작성").onclick();
  const file = h.nodes.findLast((n) => n.type === "file");
  file.files = [{}]; await file.events.change();
  const title = h.nodes.findLast((n) => n.type === "text"); title.value = feature.title;
  const description = h.nodes.findLast((n) => n.rows === 5); description.value = feature.description;
  const published = h.nodes.findLast((n) => n.type === "checkbox");
  assert.equal(published.checked, false); published.checked = true;
  let resolve;
  h.state.request = (action) => action === "feature_save" ? new Promise((done) => { resolve = done; }) : Promise.resolve({ ok: true, feature });
  const form = h.node("feedback-hub-editor");
  const pending = form.events.submit({ preventDefault() {} });
  await form.events.submit({ preventDefault() {} });
  const saves = h.requests.filter((r) => r.action === "feature_save");
  assert.equal(saves.length, 1); assert.equal(saves[0].images.length, 1); assert.equal(saves[0].isPublished, true);
  assert.equal(h.button("자유 건의").disabled, true);
  resolve({ ok: true, feature }); await pending;
  assert.equal(h.boards.at(-1).featureId, feature.id);
  assert.equal(h.button("자유 건의").disabled, false);
});
