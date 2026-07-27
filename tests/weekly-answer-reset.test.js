const assert = require("node:assert/strict");
const fs = require("node:fs");

const source = fs.readFileSync("teacher-grades.js", "utf8");
const targetSource = source.match(
  /function getWeeklyExamAnswerResetTarget\([\s\S]*?\n}\n\nfunction openWeeklyExamAnswerResetModal/
)?.[0].replace(/\n\nfunction openWeeklyExamAnswerResetModal$/, "");

assert.ok(targetSource, "weekly answer reset target resolver should be available");
assert.match(
  source,
  /button\("답안지 초기화", "mini-btn danger", "button", \(\) => openWeeklyExamAnswerResetModal\(exam, cohort, gradeLookup\)\)/,
  "grade management should expose the answer-sheet reset button"
);
assert.match(
  source,
  /input\("studentId", "text", "예: 18016"\)/,
  "the reset modal should request a student number"
);
assert.match(
  source,
  /select\("subject", \["", \.\.\.subjects\]\)/,
  "the reset modal should provide a subject selector"
);
assert.match(
  source,
  /await resetWeeklyExamSubjectSubmission\(target\.section, target\.submission, target\.student\)/,
  "the reset modal should reuse the scoped subject reset operation"
);

const students = [
  { id: "18016", name: "테스트학생", track: "일반" },
  { id: "19001", name: "다른기수", track: "일반" },
];
const sections = [
  { id: "law", subject: "해사법규" },
  { id: "english", subject: "영어" },
];
const state = {
  examSubmissions: [
    { id: "submission-law", studentId: "18016", examSectionId: "law", status: "submitted" },
    { id: "cancelled-english", studentId: "18016", examSectionId: "english", status: "cancelled" },
  ],
};
const getStudentsInCohort = (cohort) => students.filter((student) => student.id.startsWith(String(cohort)));
const getWeeklyGradeSectionsForStudent = () => sections;
const getTarget = new Function(
  "state",
  "getStudentsInCohort",
  "getWeeklyGradeSectionsForStudent",
  `${targetSource}; return getWeeklyExamAnswerResetTarget;`
)(state, getStudentsInCohort, getWeeklyGradeSectionsForStudent);

const exam = { id: "exam-5", weekNumber: 5 };
const target = getTarget(exam, "18", " 18016 ", "해사법규");
assert.equal(target.student.id, "18016");
assert.equal(target.section.id, "law");
assert.equal(target.submission.id, "submission-law");
assert.equal(getTarget(exam, "18", "", "해사법규").error, "student_id_required");
assert.equal(getTarget(exam, "18", "18016", "").error, "subject_required");
assert.equal(getTarget(exam, "18", "19001", "해사법규").error, "student_not_found");
assert.equal(getTarget(exam, "18", "18016", "형법").error, "subject_not_available");
assert.equal(getTarget(exam, "18", "18016", "영어").error, "submission_not_found");

console.log("weekly answer reset tests passed");
