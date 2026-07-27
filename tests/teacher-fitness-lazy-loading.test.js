const assert = require("node:assert/strict");
const fs = require("node:fs");

const sharedSource = fs.readFileSync("shared.js", "utf8");
const fitnessSource = fs.readFileSync("teacher-fitness.js", "utf8");
const loaderSource = sharedSource.match(
  /async function loadTeacherFitnessScoresByStudentIds\([\s\S]*?\n}\n\nasync function loadTeacherFitnessData/
)?.[0].replace(/\n\nasync function loadTeacherFitnessData$/, "");

assert.ok(loaderSource, "the scoped fitness loader should be available");
assert.match(
  sharedSource,
  /const fitnessScoreRequest = shouldLoadLegacyStudentGradeData\s*\? remoteStore\.from\("fitness_scores"\)/,
  "teacher startup must not request every fitness score"
);
assert.match(
  sharedSource,
  /loadTeacherFitnessScoresByStudentIds\(studentIds, normalizedMonths, columns\)/,
  "teacher fitness data should be limited to the selected roster and months"
);
assert.match(
  fitnessSource,
  /const requiredMonths = \[fitnessFilters\.month, getPreviousFitnessMonth\(fitnessFilters\.month\)\]/,
  "fitness management should include the previous month needed by its report"
);
assert.match(
  fitnessSource,
  /requestTeacherFitnessData\(selected\.value, requiredMonths\)[\s\S]*renderDataLoadingState\("선택한 기수의 체력평가 데이터를 불러오는 중입니다\."\)/,
  "fitness management should show a loading indicator while scoped data is requested"
);

const remoteRows = Array.from({ length: 1002 }, (_, index) => ({ id: index + 1 }));
const requestedRanges = [];
const remoteStore = {
  from(table) {
    assert.equal(table, "fitness_scores");
    return {
      select() {
        return this;
      },
      in(column, values) {
        if (column === "student_id") assert.deepEqual(values, ["18001"]);
        if (column === "assessment_month") assert.deepEqual(values, ["2026-07", "2026-06"]);
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
const loadFitnessScores = new Function(
  "remoteStore",
  "chunkArray",
  `${loaderSource}; return loadTeacherFitnessScoresByStudentIds;`
)(remoteStore, chunkArray);

(async () => {
  const result = await loadFitnessScores(["18001"], ["2026-07", "2026-06"], "id");
  assert.equal(result.error, null);
  assert.equal(result.data.length, remoteRows.length, "fitness rows beyond 1,000 must not be truncated");
  assert.deepEqual(requestedRanges, [[0, 999], [1000, 1999]]);
  console.log("teacher fitness lazy loading tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
