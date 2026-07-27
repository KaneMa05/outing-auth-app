const assert = require("node:assert/strict");
const fs = require("node:fs");

const sharedSource = fs.readFileSync("shared.js", "utf8");
const gradeSource = fs.readFileSync("teacher-grades.js", "utf8");
const studentSource = fs.readFileSync("teacher-students.js", "utf8");
const loaderSource = sharedSource.match(
  /async function loadExamSubmissionsBySectionIds\([\s\S]*?\n}\n\nfunction isTeacherWeeklyGradeDataLoaded/
)?.[0].replace(/\n\nfunction isTeacherWeeklyGradeDataLoaded$/, "");

assert.ok(loaderSource, "the section-scoped submission loader should be available");
assert.match(
  sharedSource,
  /function renderDataLoadingState\([\s\S]*className: "data-loading-state"[\s\S]*className: "loading-spinner"/,
  "data reads should expose an accessible spinner state"
);
assert.match(
  gradeSource,
  /if \(isRemoteLoading && !teacherBaseDataLoaded\)[\s\S]*renderDataLoadingState\("주간평가 문제 데이터를 불러오는 중입니다\."\)/,
  "weekly problem lookup should show loading feedback during the base refresh"
);
assert.match(
  sharedSource,
  /const examSubmissionRequest = shouldLoadLegacyStudentGradeData\s*\? remoteStore\.from\("exam_submissions"\)/,
  "teacher startup must not request all weekly submissions"
);
assert.match(
  sharedSource,
  /if \(APP_MODE === "teacher"\) teacherBaseDataLoaded = true;[\s\S]*if \(!teacherBaseDataLoaded\) return;/,
  "route-scoped grade loading must wait until the base administrator refresh is complete"
);
assert.match(
  sharedSource,
  /async function loadTeacherWeeklyGradeExamData\([\s\S]*loadExamSubmissionsBySectionIds\(sectionIds,[\s\S]*loadSubmissionAnswersBySubmissionIds/,
  "teacher grade data should be loaded from the selected exam sections"
);
assert.match(
  gradeSource,
  /requestTeacherWeeklyGradeDataForExams\(\[exam\]\)[\s\S]*선택한 주차의 응시 데이터를 불러오는 중입니다/,
  "the weekly absence screen should wait for its selected exam"
);
assert.match(
  gradeSource,
  /const requiredExams = \[exam, previousExam\]\.filter\(Boolean\)[\s\S]*requestTeacherWeeklyGradeDataForExams\(requiredExams\)/,
  "weekly grades should load only the selected and previous exams"
);
assert.match(
  gradeSource,
  /ensureTeacherWeeklyGradeDataForExamIds\([\s\S]*uniqueSections\.map\(\(section\) => section\.examId\),[\s\S]*force: true, reconcile: false/,
  "answer-key changes must load fresh submissions before regrading"
);
assert.match(
  studentSource,
  /if \(exam && !isTeacherWeeklyGradeDataLoaded\(exam\.id\)\)[\s\S]*requestTeacherWeeklyGradeDataForExams\(\[exam\]\)/,
  "student preview should lazy-load the selected weekly exam"
);
assert.match(
  sharedSource,
  /function scheduleTeacherWeeklyGradeDataRefresh\([\s\S]*force: true[\s\S]*TEACHER_WEEKLY_GRADE_REFRESH_INTERVAL_MS/,
  "teacher weekly grade views should periodically force-refresh their selected exams"
);
assert.match(
  gradeSource,
  /scheduleTeacherWeeklyGradeDataRefresh\(exam \? \[exam\] : \[\]\)[\s\S]*getWeeklyAbsenceStudents/,
  "the weekly absence screen should keep its selected exam fresh"
);
assert.match(
  gradeSource,
  /scheduleTeacherWeeklyGradeDataRefresh\(requiredExams\)[\s\S]*getGradeManagementStudents/,
  "the weekly grade screen should keep its selected exams fresh"
);
assert.match(
  studentSource,
  /scheduleTeacherWeeklyGradeDataRefresh\(exam \? \[exam\] : \[\]\)[\s\S]*getTeacherPreviewWeeklySummary/,
  "student weekly grade preview should keep its selected exam fresh"
);

const remoteRows = Array.from({ length: 1003 }, (_, index) => ({ id: index + 1 }));
const requestedRanges = [];
const remoteStore = {
  from(table) {
    assert.equal(table, "exam_submissions");
    return {
      select() {
        return this;
      },
      in(column, ids) {
        assert.equal(column, "exam_section_id");
        assert.deepEqual(ids, ["section-1"]);
        return this;
      },
      order() {
        return this;
      },
      async range(from, to) {
        requestedRanges.push([from, to]);
        return { data: remoteRows.slice(from, to + 1), error: null };
      },
    };
  },
};
const chunkArray = (items, size) => {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
};
const loadExamSubmissions = new Function(
  "remoteStore",
  "chunkArray",
  `${loaderSource}; return loadExamSubmissionsBySectionIds;`
)(remoteStore, chunkArray);

(async () => {
  const result = await loadExamSubmissions(["section-1"], "id");
  assert.equal(result.error, null);
  assert.equal(result.data.length, remoteRows.length, "section submissions must not stop at the server's first 1,000 rows");
  assert.deepEqual(requestedRanges, [[0, 999], [1000, 1999]]);
  console.log("teacher weekly lazy loading tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
