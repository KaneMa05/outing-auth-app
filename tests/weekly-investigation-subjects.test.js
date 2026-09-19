const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const shared = fs.readFileSync("shared.js", "utf8");
const student = fs.readFileSync("student.js", "utf8");
const teacher = fs.readFileSync("teacher-grades.js", "utf8");
const state = { examSubjectSettings: [], exams: [], examSections: [], examAnswers: [] };
const context = vm.createContext({
  state,
  WEEKLY_EXAM_TRACK_ALL: "전체",
  getStudentProfile: () => null,
  getStudentCohort: (learner) => String(learner.cohort),
  getTeacherStudentRegisteredTrack: (learner) => context.normalizeCoastGuardTrack(learner.track),
  getSectionAnswers: (id) => state.examAnswers.filter((answer) => answer.examSectionId === id),
});
const extract = (source, name) => {
  const match = source.match(new RegExp(`function ${name}\\([^]*?\\n}`));
  assert.ok(match, `${name} should exist`);
  return match[0];
};
vm.runInContext(shared.slice(shared.indexOf("function normalizeCoastGuardTrack("), shared.indexOf("function getBaseTrackOptions(")), context);
for (const name of ["normalizeExamCorrectAnswers", "getExamCorrectAnswers", "hasExamCorrectAnswer"]) {
  vm.runInContext(extract(shared, name), context);
}
for (const name of ["getStudentRegisteredTrack", "getVisibleStudentExams", "isStudentWeeklyExamVisible", "getStudentExamSections", "isStudentSectionMatch", "isStudentSectionPublished", "getStudentVisibleSectionAnswers"]) {
  vm.runInContext(extract(student, name), context);
}
for (const name of ["getExamSections", "getWeeklyGradeSectionsForStudent", "isWeeklyGradeSectionVisibleForTrack", "getWeeklyGradeVisibleAnswers"]) {
  vm.runInContext(extract(teacher, name), context);
}
const plain = (value) => JSON.parse(JSON.stringify(value));
const expected = ["해양경찰학개론", "형사법", "형사법(공판)"];
assert.deepEqual(plain(context.getConfiguredWeeklySubjectsForTrack("수사특채")), expected);
assert.deepEqual(plain(context.getFinalGradeSubjectsForTrack("수사특채", ["법규", "개론", "형사", "형소법(공판)"])), ["개론", "형사", "형소법(공판)"]);

const exam = { id: "week13", cohort: "18", weekNumber: 13, isPublished: true, startAt: "2020-01-01T00:00:00Z" };
state.exams = [exam];
state.examSections = ["해사법규", ...expected, "해사영어", "항해학", "기관학"].map((subject, i) => ({
  id: `section-${i}`, examId: exam.id, track: "전체", subject, questionCount: 20, isActive: true,
}));
state.examAnswers = state.examSections.flatMap((section) => Array.from({ length: 20 }, (_, i) => ({
  examSectionId: section.id, questionNumber: i + 1, correctAnswer: 1,
  targetTracks: ["경찰직 - 공채(순경)"],
})));

for (const [track, subjects] of [
  ["수사특채", expected],
  ["경찰직 - 공채(순경)", ["해사법규", "해양경찰학개론", "형사법"]],
  ["경찰직 - 함정요원 항해(순경)", ["해사법규", "해양경찰학개론", "해사영어", "항해학"]],
  ["경찰직 - 경위 공채(해양-항해)", ["해사법규", "해양경찰학개론", "형사법", "형사법(공판)", "항해학"]],
]) {
  const learner = { id: "fixture-student", track, cohort: 18 };
  assert.deepEqual(plain(context.getStudentExamSections(exam, learner).map((section) => section.subject)), subjects, `${track}: student subjects`);
  assert.deepEqual(plain(context.getWeeklyGradeSectionsForStudent(exam, learner).map((section) => section.subject)), subjects, `${track}: teacher grade subjects`);
}

// Reproduce week 13: only the trial-procedure answer key has been entered.
const trial = state.examSections.find((section) => section.subject === "형사법(공판)");
state.examAnswers = state.examAnswers.filter((answer) => answer.examSectionId === trial.id);
const learner = { id: "fixture-student", track: "수사특채", cohort: 18 };
assert.equal(context.getVisibleStudentExams(learner).length, 1, "week 13 must appear for investigation students");
assert.deepEqual(plain(context.getStudentExamSections(exam, learner).map((section) => section.subject)), ["형사법(공판)"]);
assert.equal(context.getStudentVisibleSectionAnswers(trial, learner).length, 20);
assert.equal(context.getWeeklyGradeSectionsForStudent(exam, learner).length, 1);
assert.equal(context.getVisibleStudentExams({ ...learner, track: "경찰직 - 공채(순경)" }).length, 0, "public recruitment must not gain the trial subject");

state.examAnswers = [];
assert.equal(context.getVisibleStudentExams(learner).length, 0, "unregistered answers must remain hidden");
// Management must include the track even when older saved dropdown options omit it.
const findNodes = (node, predicate) => [
  ...(node && predicate(node) ? [node] : []),
  ...(node?.children || []).flatMap((child) => findNodes(child, predicate)),
];
context.el = (tag, props = {}, children = []) => ({
  tag, ...props, children: Array.isArray(children) ? children : [children], handlers: {},
  addEventListener(event, handler) { this.handlers[event] = handler; },
  querySelector(selector) {
    const name = selector.match(/^input\[name="(.*)"\]$/)?.[1];
    return findNodes(this, (node) => node.tag === "input" && node.name === name)[0] || null;
  },
});
context.table = (headers, rows) => context.el("table", {}, rows);
context.panel = (title, children) => context.el("section", {}, children);
context.button = (label, className, type, onClick) => context.el("button", { label, className, type, onClick });
context.hasTeacherPermission = () => true;
context.renderForbidden = () => { throw new Error("Unexpected forbidden view"); };
context.getCoastGuardTrackOptions = () => ["경찰직 - 공채(순경)", "기타"];
context.CSS = { escape: (value) => value };
context.createId = (() => { let id = 0; return () => `setting-${++id}`; })();
context.saveState = context.render = context.notify = () => {};
let savedSettings;
context.saveExamSubjectSettingsToRemote = async (settings) => { savedSettings = plain(settings); };
for (const name of ["renderTrackSubjectManagement", "resetTrackSubjectDefaults"]) {
  vm.runInContext(extract(teacher, name), context);
}
const getForm = () => findNodes(context.renderTrackSubjectManagement(), (node) => node.tag === "form")[0];
const inputs = (form, track) => findNodes(form, (node) => node.tag === "input" && node.name.startsWith(`${track}|||`));
const checkedSubjects = (form, track) => inputs(form, track).filter((node) => node.checked).map((node) => node.name.split("|||")[1]);

(async () => {
  const form = getForm();
  assert.equal(inputs(form, "수사특채").length, 7, "missing saved track still gets a management row");
  assert.deepEqual(checkedSubjects(form, "수사특채"), expected);
  const previousPublicSubjects = checkedSubjects(form, "경찰직 - 공채(순경)");
  await form.handlers.submit({ preventDefault() {} });
  assert.deepEqual(savedSettings.filter((row) => row.track === "수사특채" && row.isActive).map((row) => row.subject), expected);
  assert.deepEqual(checkedSubjects(getForm(), "수사특채"), expected, "saved subjects survive rendering again");
  assert.deepEqual(checkedSubjects(getForm(), "경찰직 - 공채(순경)"), previousPublicSubjects);

  const savedForm = getForm();
  inputs(savedForm, "수사특채").find((node) => node.name.endsWith("|||형사법(공판)")).checked = false;
  await savedForm.handlers.submit({ preventDefault() {} });
  assert.deepEqual(checkedSubjects(getForm(), "수사특채"), ["해양경찰학개론", "형사법"], "management changes persist");
  const resetForm = getForm();
  context.resetTrackSubjectDefaults(resetForm, ["수사특채"]);
  assert.deepEqual(checkedSubjects(resetForm, "수사특채"), expected, "reset restores all three subjects");
  context.getCoastGuardTrackOptions = () => ["경찰직 - 공채(순경)", "수사특채", "기타"];
  assert.equal(inputs(getForm(), "수사특채").length, 7, "a saved track must not create duplicate rows");
  console.log("weekly investigation subject and management tests passed");
})().catch((error) => { console.error(error); process.exit(1); });
