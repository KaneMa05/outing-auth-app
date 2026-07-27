const assert = require("node:assert/strict");
const fs = require("node:fs");

const source = fs.readFileSync("shared.js", "utf8");
const helperSource = source.match(
  /function getExamSubmissionRemoteKey\([\s\S]*?\n}\n\nasync function persistNormalizedWeeklySectionScores/
)?.[0].replace(/\n\nasync function persistNormalizedWeeklySectionScores$/, "");

assert.ok(helperSource, "submission identity-preserving helper should be available");
assert.doesNotMatch(
  helperSource.match(/function buildExamSubmissionRemoteRow\([\s\S]*?\n}/)?.[0] || "",
  /\bid\s*:/,
  "submission upsert rows must not send a client-side primary key"
);

const state = {
  submissionAnswers: [
    { id: "answer-1", submissionId: "local-submission", questionNumber: 1 },
    { id: "answer-2", submissionId: "unrelated-submission", questionNumber: 1 },
  ],
};
let receivedRows = null;
let receivedOptions = null;
let receivedSelection = null;
let upsertCount = 0;
const remoteStore = {
  from(table) {
    assert.equal(table, "exam_submissions");
    return {
      upsert(rows, options) {
        upsertCount += 1;
        receivedRows = rows;
        receivedOptions = options;
        return this;
      },
      async select(columns) {
        receivedSelection = columns;
        return {
          data: [{
            id: "server-submission",
            student_id: "18016",
            exam_section_id: "section-1",
          }],
          error: null,
        };
      },
    };
  },
};
const getHelper = new Function(
  "remoteStore",
  "state",
  `${helperSource}; return upsertExamSubmissionsPreservingRemoteIds;`
);
const upsertPreservingIds = getHelper(remoteStore, state);
const submission = {
  id: "local-submission",
  examSectionId: "section-1",
  studentId: "18016",
  studentName: "테스트 학생",
  track: "일반",
  status: "submitted",
  score: 80,
  correctCount: 8,
  submittedAt: "2026-07-27T00:00:00.000Z",
  createdAt: "2026-07-27T00:00:00.000Z",
};

(async () => {
  const result = await upsertPreservingIds([submission]);
  assert.equal(receivedRows.length, 1);
  assert.equal(Object.hasOwn(receivedRows[0], "id"), false, "primary key must be generated or preserved by Supabase");
  assert.deepEqual(receivedOptions, { onConflict: "student_id,exam_section_id" });
  assert.equal(receivedSelection, "id,student_id,exam_section_id");
  assert.equal(submission.id, "server-submission", "local submission should adopt the canonical server id");
  assert.equal(state.submissionAnswers[0].submissionId, "server-submission", "linked answers should adopt the canonical server id");
  assert.equal(state.submissionAnswers[1].submissionId, "unrelated-submission");
  assert.equal(result.idChanges.get("local-submission"), "server-submission");
  await upsertPreservingIds([submission]);
  assert.equal(upsertCount, 2, "repeated saves should use the same identity-preserving path");
  assert.equal(Object.hasOwn(receivedRows[0], "id"), false, "repeated saves must not attempt to update the primary key");
  assert.equal(submission.id, "server-submission");
  console.log("weekly submission id preservation tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
