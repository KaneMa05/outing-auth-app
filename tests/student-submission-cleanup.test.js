const assert = require("node:assert/strict");
const fs = require("node:fs");

const source = fs.readFileSync("student.js", "utf8");
const saveSource = source.match(
  /async function saveStudentExamSubmissionToRemote\([\s\S]*?\n}\n\nasync function saveStudentSubmissionAnswersToRemote/
)?.[0].replace(/\n\nasync function saveStudentSubmissionAnswersToRemote$/, "");
const cleanupSource = source.match(
  /async function cleanupFailedStudentExamSubmission\([\s\S]*?\n}\n\nasync function verifyStudentSubmissionAnswersSaved/
)?.[0].replace(/\n\nasync function verifyStudentSubmissionAnswersSaved$/, "");

assert.ok(saveSource, "student submission save helper should be available");
assert.ok(cleanupSource, "student submission cleanup helper should be available");
assert.match(saveSource, /\.insert\(row\)/, "student submissions must use insert-only semantics");
assert.doesNotMatch(saveSource, /\.upsert\(/, "student submissions must not overwrite an existing remote submission");

const conflictContext = { preserveExistingRemote: false };
const conflictStore = {
  from(table) {
    assert.equal(table, "exam_submissions");
    return {
      insert(row) {
        assert.equal(Object.hasOwn(row, "id"), false);
        return this;
      },
      select() {
        return this;
      },
      async maybeSingle() {
        return { data: null, error: { code: "23505", message: "duplicate key" } };
      },
    };
  },
};
const state = { submissionAnswers: [] };
const buildExamSubmissionRemoteRow = (submission) => ({
  exam_section_id: submission.examSectionId,
  student_id: submission.studentId,
});
const getSaveHelper = new Function(
  "remoteStore",
  "state",
  "buildExamSubmissionRemoteRow",
  `${saveSource}; return saveStudentExamSubmissionToRemote;`
);
const saveSubmission = getSaveHelper(conflictStore, state, buildExamSubmissionRemoteRow);

let deleteCalled = false;
const cleanupStore = {
  from() {
    deleteCalled = true;
    throw new Error("existing remote data must not be deleted");
  },
};
const getCleanupHelper = new Function(
  "remoteStore",
  "isMissingRelationError",
  `${cleanupSource}; return cleanupFailedStudentExamSubmission;`
);
const cleanupSubmission = getCleanupHelper(cleanupStore, () => false);

(async () => {
  await assert.rejects(
    saveSubmission({ id: "local-id", studentId: "18016", examSectionId: "section-1" }, conflictContext),
    (error) => error?.code === "23505"
  );
  assert.equal(conflictContext.preserveExistingRemote, true, "unique conflicts must preserve the existing server submission");
  await cleanupSubmission({ id: "server-id" }, conflictContext);
  assert.equal(deleteCalled, false, "cleanup must skip existing server submissions and their answers");
  console.log("student submission cleanup safety tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
