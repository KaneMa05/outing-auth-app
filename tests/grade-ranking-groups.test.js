const assert = require("node:assert/strict");
const fs = require("node:fs");

const sharedSource = fs.readFileSync("shared.js", "utf8");
const teacherGradeSource = fs.readFileSync("teacher-grades.js", "utf8");
const studentSource = fs.readFileSync("student.js", "utf8");

const rankingGroupSource = sharedSource.match(
  /const GRADE_RANKING_COMBINED_TRACK_GROUPS = \[[\s\S]*?\n}\n\nfunction isSameGradeRankingGroup\([\s\S]*?\n}/
)?.[0];
assert.ok(rankingGroupSource, "combined grade ranking helpers should be available");

const normalizeCoastGuardTrack = (track) => String(track || "").trim();
const { getGradeRankingTrackKey, isSameGradeRankingGroup } = new Function(
  "normalizeCoastGuardTrack",
  "WEEKLY_POLICE_VTS_TRACK",
  `${rankingGroupSource}; return { getGradeRankingTrackKey, isSameGradeRankingGroup };`
)(normalizeCoastGuardTrack, "경찰직 - 해상교통관제(VTS)(순경)");

const shipNavigationTrack = "경찰직 - 함정요원 항해(순경)";
const policeVtsTrack = "경찰직 - 해상교통관제(VTS)(순경)";
const publicRecruitTrack = "경찰직 - 공채(순경)";

assert.equal(getGradeRankingTrackKey(shipNavigationTrack), getGradeRankingTrackKey(policeVtsTrack));
assert.equal(isSameGradeRankingGroup(shipNavigationTrack, policeVtsTrack), true);
assert.equal(isSameGradeRankingGroup(shipNavigationTrack, publicRecruitTrack), false);

function extractFunction(source, name, nextName) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf(`function ${nextName}(`, start + 1);
  return start >= 0 && end > start ? source.slice(start, end).trim() : "";
}

const weeklyRankSource = extractFunction(teacherGradeSource, "applyWeeklyGradeRanksByTrack", "applyGradeRanks");
const finalRankSource = [
  extractFunction(teacherGradeSource, "applyGradeRanks", "applyGradeRanksByTrack"),
  extractFunction(teacherGradeSource, "applyGradeRanksByTrack", "applyTeacherPreviewFinalSubjectRanks"),
].join("\n\n");
assert.ok(weeklyRankSource, "weekly rank function should be available");
assert.ok(finalRankSource, "final rank functions should be available");

const getTeacherStudentRegisteredTrack = (student) => student.track;
const calculateGradePercentile = (rank, total) => total <= 1 ? 0 : Math.round(((rank - 1) / (total - 1)) * 1000) / 10;
const applyWeeklyGradeRanksByTrack = new Function(
  "getTeacherStudentRegisteredTrack",
  "getGradeRankingTrackKey",
  "calculateGradePercentile",
  `${weeklyRankSource}; return applyWeeklyGradeRanksByTrack;`
)(getTeacherStudentRegisteredTrack, getGradeRankingTrackKey, calculateGradePercentile);
const applyGradeRanksByTrack = new Function(
  "getTeacherStudentRegisteredTrack",
  "getGradeRankingTrackKey",
  "calculateGradePercentile",
  `${finalRankSource}; return applyGradeRanksByTrack;`
)(getTeacherStudentRegisteredTrack, getGradeRankingTrackKey, calculateGradePercentile);

const weekly = applyWeeklyGradeRanksByTrack([
  { student: { id: "1", track: shipNavigationTrack }, score: 80, maxScore: 100, wrongCount: 4, submittedCount: 1 },
  { student: { id: "2", track: policeVtsTrack }, score: 90, maxScore: 100, wrongCount: 2, submittedCount: 1 },
  { student: { id: "3", track: publicRecruitTrack }, score: 70, maxScore: 100, wrongCount: 6, submittedCount: 1 },
]);
assert.equal(weekly[0].rank, 2);
assert.equal(weekly[1].rank, 1);
assert.equal(weekly[2].rank, 1, "unrelated tracks should retain their own rank pool");

const final = applyGradeRanksByTrack([
  { student: { id: "1", track: shipNavigationTrack }, score: 240, maxScore: 300, wrongCount: 12, submittedCount: 1, hasScore: true },
  { student: { id: "2", track: policeVtsTrack }, score: 180, maxScore: 200, wrongCount: 4, submittedCount: 1, hasScore: true },
  { student: { id: "3", track: publicRecruitTrack }, score: 150, maxScore: 200, wrongCount: 10, submittedCount: 1, hasScore: true },
]);
assert.equal(final[0].rank, 2, "final ranks should compare normalized scores across the combined group");
assert.equal(final[1].rank, 1);
assert.equal(final[2].rank, 1);

const reportSortSource = extractFunction(
  teacherGradeSource,
  "sortWeeklyGradeReportSummaries",
  "formatWeeklyGradeReportSubjectHeader"
);
assert.ok(reportSortSource, "weekly report sort function should be available");
const sortWeeklyGradeReportSummaries = new Function(
  "sortGradeSummariesForDisplay",
  "getTeacherStudentRegisteredTrack",
  "getGradeRankingTrackKey",
  "formatWeeklyGradeReportTrackLabel",
  `${reportSortSource}; return sortWeeklyGradeReportSummaries;`
)(
  (summaries) => [...summaries],
  getTeacherStudentRegisteredTrack,
  getGradeRankingTrackKey,
  (track) => track
);
const reportRows = sortWeeklyGradeReportSummaries([
  { student: { id: "1", track: shipNavigationTrack }, rank: 2, score: 80, wrongCount: 4 },
  { student: { id: "3", track: publicRecruitTrack }, rank: 1, score: 70, wrongCount: 6 },
  { student: { id: "2", track: policeVtsTrack }, rank: 1, score: 90, wrongCount: 2 },
], true);
const shipRowIndex = reportRows.findIndex((item) => item.student.track === shipNavigationTrack);
const policeVtsRowIndex = reportRows.findIndex((item) => item.student.track === policeVtsTrack);
assert.equal(policeVtsRowIndex + 1, shipRowIndex, "combined tracks should be adjacent and ordered by their shared rank");

assert.match(
  teacherGradeSource,
  /gradeRankingGroupKey: getGradeRankingTrackKey\(getTeacherStudentRegisteredTrack\(summary\.student\)\)/,
  "download rows should retain their combined ranking group"
);
assert.ok(
  (teacherGradeSource.match(/rows\[[^\]]+\]\?\.gradeRankingGroupKey/g) || []).length >= 4,
  "HTML and XLSX group borders should use the combined ranking group"
);

assert.equal(
  (studentSource.match(/isSameGradeRankingGroup\(getStudentRegisteredTrack\(item\), registeredTrack\)/g) || []).length,
  2,
  "weekly and final student views should both use the combined peer group"
);
assert.match(sharedSource, /isSameGradeRankingGroup\(student\.track, track\)/, "scoped refresh should load both tracks");

console.log("grade ranking group tests passed");
