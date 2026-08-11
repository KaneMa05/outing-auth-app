const assert = require("node:assert/strict");
const fs = require("node:fs");

const teacherSource = fs.readFileSync("teacher.js", "utf8");
const gradeSource = fs.readFileSync("teacher-grades.js", "utf8");

assert.match(teacherSource, /let gradeManagementStudentQuery = "";/);
assert.match(teacherSource, /let gradeManagementSelectedStudentId = "";/);

const matchSource = gradeSource.match(
  /function getGradeManagementStudentSearchMatches\([\s\S]*?\n}/
)?.[0];
assert.ok(matchSource, "student grade search matcher should be available");

const students = [
  { id: "1002", name: "김바다", track: "경찰직 - 함정요원 항해(순경)" },
  { id: "1001", name: "박해양", track: "경찰직 - 해상교통관제(VTS)(순경)" },
  { id: "1003", name: "김항해", track: "경찰직 - 공채(순경)" },
];
const getGradeManagementStudentSearchMatches = new Function(
  "getStudentsInCohort",
  "getTeacherStudentRegisteredTrack",
  `${matchSource}; return getGradeManagementStudentSearchMatches;`
)(
  () => students,
  (student) => student.track
);

assert.deepEqual(
  getGradeManagementStudentSearchMatches("1", "김").map((student) => student.id),
  ["1002", "1003"],
  "partial name search should return matching students in number order"
);
assert.deepEqual(
  getGradeManagementStudentSearchMatches("1", "1001").map((student) => student.name),
  ["박해양"],
  "student number search should find one student"
);
assert.deepEqual(
  getGradeManagementStudentSearchMatches("1", "VTS").map((student) => student.id),
  ["1001"],
  "track text should also help identify the student"
);

assert.match(
  gradeSource,
  /selectedStudent\s*\? renderGradeManagementStudentHistory\(selectedStudent\)/,
  "selecting a student should switch to the full grade history"
);
assert.match(
  gradeSource,
  /const unloadedExams = exams\.filter\(\(exam\) => !isTeacherWeeklyGradeSummaryDataLoaded\(exam\.id\)\);[\s\S]*requestTeacherWeeklyGradeSummaryDataForExams\(unloadedExams\)/,
  "weekly summary data should load only after an individual student is selected"
);
assert.match(
  gradeSource,
  /const gradeLookup = createWeeklyGradeLookup\(\);[\s\S]*getWeeklyGradeStudentSummary\(exam, item, gradeLookup\)/,
  "weekly history should reuse one indexed lookup across all exams and students"
);
assert.match(gradeSource, /"주간평가 전체 이력"/);
assert.match(gradeSource, /"파이널 모의고사 전체 이력"/);
assert.match(
  gradeSource,
  /isSameGradeRankingGroup\(getTeacherStudentRegisteredTrack\(item\.student\), getTeacherStudentRegisteredTrack\(student\)\)/,
  "weekly history totals should use combined ranking groups"
);

console.log("grade student history tests passed");
