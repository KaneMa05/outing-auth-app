const assert = require("node:assert/strict");
const fs = require("node:fs");

const source = fs.readFileSync("shared.js", "utf8");
const loaderSource = source.match(
  /async function loadExamAnswersFromRemote\([\s\S]*?\n}\n\nasync function loadStudentScopedRows/
)?.[0].replace(/\n\nasync function loadStudentScopedRows$/, "");

assert.ok(loaderSource, "paginated exam-answer loader should be available");
assert.match(
  loaderSource,
  /\.range\(from, from \+ 999\)/,
  "exam answers should be loaded page by page"
);
assert.match(
  source,
  /const examAnswerRequest = shouldLoadExamData\s*\? loadExamAnswersFromRemote\(examAnswerColumns\)/,
  "the main refresh must use the paginated exam-answer loader"
);
assert.doesNotMatch(
  source,
  /from\("exam_answers"\)[\s\S]{0,180}\.limit\(10000\)/,
  "exam-answer refresh must not silently truncate the answer key"
);

const remoteRows = Array.from({ length: 10003 }, (_, index) => ({ id: index + 1 }));
const requestedRanges = [];
const remoteStore = {
  from(table) {
    assert.equal(table, "exam_answers");
    return {
      select() {
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
const loadExamAnswers = new Function(
  "remoteStore",
  `${loaderSource}; return loadExamAnswersFromRemote;`
)(remoteStore);

(async () => {
  const result = await loadExamAnswers("id");
  assert.equal(result.error, null);
  assert.equal(result.data.length, remoteRows.length, "rows beyond the old 10,000 limit must be loaded");
  assert.deepEqual(requestedRanges.at(-1), [10000, 10999], "the loader should request the final partial page");
  console.log("weekly answer loading tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
