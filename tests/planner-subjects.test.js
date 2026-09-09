const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { test } = require("node:test");

const app = fs.readFileSync("app.js", "utf8");
const shared = fs.readFileSync("shared.js", "utf8");
function extract(source, name) {
  const match = source.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n}`));
  assert.ok(match, name);
  return match[0];
}
const plain = value => JSON.parse(JSON.stringify(value));
const customTracks = ["경찰직 - 구조(순경)", "경찰직 - 특공 전술(순경)", "일반직 - 해양오염방제 항해", "일반직 - 해양오염방제 기관", "기타"];

function element(tag, props = {}, children = []) {
  return {
    tag, ...props, children: Array.isArray(children) ? children.filter(Boolean) : [children],
    addEventListener(event, callback) { this[event] = callback; },
    replaceChildren(...nodes) { this.children = nodes; },
    querySelectorAll(selector) {
      return this.children.filter(node => node && typeof node === "object").flatMap(node => [
        ...(selector.split(", ").includes(node.tag) ? [node] : []), ...node.querySelectorAll(selector),
      ]);
    },
    querySelector() { return this.querySelectorAll("input").at(-1); },
    focus() {},
  };
}

function harness(track = customTracks[0], category = "lecture") {
  const student = { id: "20001", track, studentCategory: category };
  const c = {
    state: { examSubjectSettings: [] },
    studyCafePreviewState: { customSubjects: null, subject: "", subjectElapsedMs: { 기존과목: 60000 }, lastSubject: "기존과목" },
    studySubjectMutationRevision: 0,
    getStudentCategory: s => s?.studentCategory || "offline",
    getAuthedStudent: () => student,
    el: element,
    button: (label, className, type, onclick) => element("button", { label, className, type, onclick }),
    openInfoModal(options) { c.modal = options; },
    closeInfoModal() { c.closed = true; },
    render() {},
    notify(message) { c.notices.push(message); },
    notices: [], requests: [],
    async mutateStudyCafeRemote(action, payload) {
      c.requests.push({ action, payload });
      return c.save ? c.save(payload) : { ok: true };
    },
  };
  vm.createContext(c);
  const constants = shared.slice(shared.indexOf("const WEEKLY_SUBJECT_OPTIONS ="), shared.indexOf("function getWeeklySubjectOrder"));
  vm.runInContext(constants + ["normalizeCoastGuardTrack", "getWeeklySubjectOrder", "compareWeeklySubjects", "isWeeklySubjectExcludedForTrack", "getDefaultWeeklySubjectsForTrack", "getConfiguredWeeklySubjectsForTrack"].map(name => extract(shared, name)).join("\n") +
    ["canCustomizeStudySubjects", "getStudyTimerSubjects", "renderStudySubjectManagement", "openStudySubjectEditor"].map(name => extract(app, name)).join("\n"), c);
  c.student = student;
  c.subjects = () => plain(c.getStudyTimerSubjects(student));
  c.open = () => c.openStudySubjectEditor(student);
  c.click = label => c.modal.content.querySelectorAll("button").find(node => node.label === label).onclick();
  c.rename = (index, value) => {
    const input = c.modal.content.querySelectorAll("input")[index];
    assert.ok(!input.disabled);
    input.value = value;
    input.input();
  };
  return c;
}

test("both vessel corporal tracks use the matching patrol subjects only for lecture students", () => {
  for (const [field, specialization] of [["항해", "항해학"], ["기관", "기관학"]]) {
    const c = harness(`경찰직 - 함정요원 ${field}(경장)`);
    assert.deepEqual(c.subjects(), ["해사법규", "해양경찰학개론", "해사영어", specialization]);
    c.student.track = `함정 ${field}(경장)`;
    assert.deepEqual(c.subjects(), ["해사법규", "해양경찰학개론", "해사영어", specialization]);
    assert.deepEqual(plain(c.getConfiguredWeeklySubjectsForTrack(c.student.track)), []);
    for (const category of ["offline", "online_managed"]) {
      c.student.studentCategory = category;
      assert.deepEqual(c.subjects(), ["해양경찰학개론", "해사법규", "형사법"]);
    }
  }
});

test("all lecture tracks can manage subjects while other student categories retain their defaults", () => {
  for (const track of customTracks) {
    const c = harness(track);
    assert.deepEqual(c.subjects(), []);
    const empty = c.renderStudySubjectManagement(c.student);
    assert.equal(empty.className, "study-planner-subject-empty");
    assert.equal(empty.children.length, 1);
    assert.equal(empty.children.at(-1).label, "+ 과목 추가");
    c.studyCafePreviewState.customSubjects = ["해양환경공학", "환경화학"];
    assert.deepEqual(c.subjects(), ["해양환경공학", "환경화학"]);
    assert.equal(c.renderStudySubjectManagement(c.student).children[0].label, "⚙︎");
    for (const category of ["offline", "online_managed"]) {
      c.student.studentCategory = category;
      assert.equal(c.renderStudySubjectManagement(c.student), null);
      assert.deepEqual(c.subjects(), ["해양경찰학개론", "해사법규", "형사법"]);
    }
  }
  const tracks = new Function(app.match(/const COAST_GUARD_TRACK_OPTIONS = \[[^]*?\n\];/)[0] + "; return COAST_GUARD_TRACK_OPTIONS;")();
  for (const track of tracks.filter(track => !customTracks.includes(track) && !/함정요원.*경장/.test(track))) {
    const c = harness(track);
    const defaults = plain(c.getConfiguredWeeklySubjectsForTrack(track));
    assert.deepEqual(c.subjects(), defaults);
    assert.ok(c.renderStudySubjectManagement(c.student));
    c.studyCafePreviewState.customSubjects = ["개인과목"];
    assert.deepEqual(c.subjects(), ["개인과목"]);
    c.studyCafePreviewState.customSubjects = [];
    assert.deepEqual(c.subjects(), defaults);
    for (const category of ["offline", "online_managed"]) {
      c.student.studentCategory = category;
      c.studyCafePreviewState.customSubjects = ["개인과목"];
      assert.equal(c.renderStudySubjectManagement(c.student), null);
      assert.deepEqual(c.subjects(), defaults);
    }
  }
});

test("save is applied only on success, blocks duplicate submissions, and leaves historical study totals untouched", async () => {
  const c = harness();
  c.studyCafePreviewState.customSubjects = ["기존과목"];
  c.open();
  c.rename(0, "새과목");
  let finish;
  c.save = () => new Promise(resolve => { finish = resolve; });
  const saving = c.click("저장하기");
  await c.click("저장하기");
  assert.equal(c.requests.length, 1);
  assert.deepEqual(c.subjects(), ["기존과목"]);
  assert.ok(c.modal.content.querySelectorAll("input")[0].disabled);
  finish({ ok: false });
  await saving;
  assert.deepEqual(c.subjects(), ["기존과목"]);
  assert.equal(c.closed, undefined);
  assert.ok(!c.modal.content.querySelectorAll("input")[0].disabled);
  c.save = async () => ({ ok: true });
  await c.click("저장하기");
  assert.deepEqual(c.subjects(), ["새과목"]);
  assert.deepEqual(c.studyCafePreviewState.subjectElapsedMs, { 기존과목: 60000 });
  assert.equal(c.studyCafePreviewState.lastSubject, "기존과목");
  assert.equal(c.closed, true);
});

test("new subjects validate names and count, and active subjects cannot be edited", async () => {
  const c = harness();
  c.open();
  await c.click("저장하기");
  assert.equal(c.requests.length, 0);
  c.click("+ 과목 추가");
  for (const invalid of ["", " ", "기타", "가".repeat(21)]) {
    c.rename(0, invalid);
    await c.click("저장하기");
  }
  assert.equal(c.requests.length, 0);
  c.rename(0, "환경화학");
  c.click("+ 과목 추가");
  c.rename(1, "환경화학");
  await c.click("저장하기");
  assert.equal(c.requests.length, 0);
  c.rename(1, "해양환경공학");
  await c.click("저장하기");
  assert.deepEqual(c.subjects(), ["환경화학", "해양환경공학"]);
  c.studyCafePreviewState.subject = "환경화학";
  c.open();
  assert.ok(c.modal.content.querySelectorAll("input")[0].disabled);
  assert.ok(c.modal.content.querySelectorAll("button").find(node => node.label === "측정 중").disabled);
  for (let index = 0; index < 10; index += 1) c.click("+ 과목 추가");
  assert.equal(c.modal.content.querySelectorAll("input").length, 8);
});

test("a saved response cannot overwrite the next signed-in student's subjects", async () => {
  const c = harness();
  c.studyCafePreviewState.customSubjects = ["기존과목"];
  c.open();
  c.rename(0, "새과목");
  c.save = async () => { c.getAuthedStudent = () => ({ id: "20002" }); return { ok: true }; };
  await c.click("저장하기");
  assert.deepEqual(c.subjects(), ["기존과목"]);
});

test("snapshot restores saved subjects, clears an empty list, and ignores stale in-flight loads", () => {
  const c = harness();
  // Execute the real hydration path through subject restoration, before unrelated room/timer state.
  const hydration = extract(app, "hydrateStudyCafeSnapshot");
  const subjectRestore = hydration.slice(hydration.indexOf("  const subjects ="), hydration.indexOf("  if (snapshot.profile"));
  vm.runInContext(`function restore(snapshot, options = {}) { ${subjectRestore} }`, c);
  c.restore({ subjects: ["환경화학"] });
  assert.deepEqual(c.subjects(), ["환경화학"]);
  c.restore({ subjects: ["이전과목"] }, { preserveLocalSubjects: true });
  assert.deepEqual(c.subjects(), ["환경화학"]);
  c.restore({ subjects: [] });
  assert.deepEqual(c.subjects(), []);
});

test("daily and monthly planner retain existing todos after a subject is removed", () => {
  const c = harness();
  c.studyCafePreviewState.customSubjects = ["새과목"];
  const originalTodos = [{ subject: "기존과목", completed: true }];
  const rendered = [];
  Object.assign(c, {
    isOnlineStudentExperience: () => true,
    ensureStudyCafeRemoteLoaded() {},
    getSelectedStudyTodoDateKey: () => "2026-09-09",
    getStudyTodoRelativeDateLabel: () => "오늘",
    getStudyTodoDateLabel: () => "9월 9일",
    getStudyTodosForDate: () => originalTodos,
    renderStudyCafePlannerEntryGuide: () => null,
    renderStudyTodoDateNavigation: () => null,
    renderStudyTodoMonthlyCalendar: () => null,
    renderStudyTodoSubjectCard(subject, todos) { rendered.push({ subject, todos }); return null; },
    studyCafeRemoteState: {}, studyTodoCalendarOpen: false,
  });
  vm.runInContext(extract(app, "renderStudentStudyTodo"), c);
  for (const monthly of [false, true]) {
    c.studyTodoCalendarOpen = monthly;
    rendered.length = 0;
    const page = c.renderStudentStudyTodo();
    const settings = page.children.at(-1);
    assert.equal(settings.className, "study-planner-subject-management");
    assert.equal(page.children.at(-2).className, "study-todo-subject-list");
    assert.equal(settings.children[0].label, "⚙︎");
    assert.equal(settings.children[0].title, "과목 설정");
    assert.equal(settings.children[0].ariaLabel, "과목 설정");
    assert.deepEqual(rendered.map(row => row.subject), ["새과목", "기존과목"]);
    assert.deepEqual(plain(rendered[1].todos), originalTodos);
    assert.deepEqual(c.subjects(), ["새과목"]);
  }
});

test("the existing API saves personal subjects through RPC and loads them for the same student", async () => {
  const handler = require("../api/study-cafe");
  const previousFetch = global.fetch;
  const previousEnv = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
  const store = new Map();
  const response = data => ({ ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) });
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only";
  global.fetch = async (url, options) => {
    const payload = options.body ? JSON.parse(options.body) : {};
    if (url.includes("rpc/validate_student_device")) return response({ valid: true });
    if (url.includes("/students?")) return response([{ id: "20001", student_category: "lecture", is_active: true }]);
    if (url.includes("study_cafe_presence?") || url.includes("study_cafe_sessions?")) return response([]);
    if (url.includes("rpc/replace_study_cafe_subjects")) {
      store.set(payload.p_student_id, payload.p_subjects);
      return response(null);
    }
    if (url.includes("rpc/get_study_cafe_snapshot_data")) {
      return response({
        subjects: (store.get(payload.p_student_id) || []).map(name => ({ name })),
        todos: [], subjectGoals: [], profiles: [], ownPresence: [], activeSessions: [], sessions: [], presence: [], onlineStudents: [],
      });
    }
    throw new Error(`Unexpected subject test request: ${options.method} ${url}`);
  };
  try {
    const res = { status(code) { this.code = code; return this; }, json(payload) { this.payload = payload; }, setHeader() {} };
    await handler({ method: "POST", body: { action: "save_subjects", studentId: "20001", deviceToken: "test-device", subjects: ["환경화학", "해양환경공학"] } }, res);
    assert.equal(res.code, 200);
    assert.deepEqual(res.payload.subjects, ["환경화학", "해양환경공학"]);
    const saved = await handler._private.loadStudyCafeSnapshotRows("20001", new Date());
    const other = await handler._private.loadStudyCafeSnapshotRows("20002", new Date());
    assert.deepEqual(saved.subjects.map(row => row.name), res.payload.subjects);
    assert.deepEqual(other.subjects, []);
  } finally {
    global.fetch = previousFetch;
    if (previousEnv.url === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousEnv.url;
    if (previousEnv.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousEnv.key;
  }
});
