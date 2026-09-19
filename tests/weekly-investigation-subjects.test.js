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
console.log("weekly investigation subject tests passed");
