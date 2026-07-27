const assert = require("node:assert/strict");
const fs = require("node:fs");

const source = fs.readFileSync("student.js", "utf8");

assert.match(
  source,
  /function renderStudentExamAnswerEntry\([\s\S]*?canRepairMissingAnswers[\s\S]*?!hasStudentStoredSubmissionAnswers\(submitted, section, student\)[\s\S]*?if \(submitted && !canRepairMissingAnswers\)/,
  "a submitted record without stored answers should be allowed back into answer entry"
);

assert.match(
  source,
  /async function submitStudentSectionAnswers\([\s\S]*?existingSubmission\?\.status === "submitted"[\s\S]*?!hasStudentStoredSubmissionAnswers\(existingSubmission, section, student\)[\s\S]*?existingSubmission\.status === "draft" \|\| canRepairMissingAnswers[\s\S]*?id: canReuseExistingSubmission \? existingSubmission\.id : createId\(\)/,
  "draft completion and answer repair should reuse the existing submission identity"
);

assert.match(
  source,
  /async function saveStudentExamSubmissionToRemote\([\s\S]*?if \(saveContext\.updateExistingRemote\)[\s\S]*?\.update\(row\)[\s\S]*?\.eq\("id", submission\.id\)[\s\S]*?request = request\.insert\(row\)/,
  "answer repair should update the existing remote submission while normal submissions still insert"
);

assert.match(
  source,
  /const remoteSubmissionSaveContext = \{[\s\S]*?preserveExistingRemote: canReuseExistingSubmission,[\s\S]*?updateExistingRemote: canReuseExistingSubmission/,
  "failed draft completion or answer repair must preserve the existing remote submission"
);

assert.match(
  source,
  /async function ensureStudentSubmissionAnswersLoaded\([\s\S]*?if \(error\)[\s\S]*?return false;[\s\S]*?async function startStudentSectionAnswer\([\s\S]*?if \(!answersVerified\)/,
  "answer reentry should stop when the server answer check fails"
);

assert.match(
  source,
  /verifyStudentSubmissionAnswersSaved\([\s\S]*?visibleAnswers\.map\(\(answer\) => Number\(answer\.questionNumber\)\)[\s\S]*?requiredQuestions\.some/,
  "draft completion should verify the exact visible question numbers and tolerate irrelevant stale rows"
);

const remoteSaveSource = source.match(
  /async function saveStudentExamSubmissionToRemote\([\s\S]*?\n}\n\nasync function saveStudentSubmissionAnswersToRemote/
)?.[0].replace(/\n\nasync function saveStudentSubmissionAnswersToRemote$/, "");
assert.ok(remoteSaveSource, "student submission remote save function should be available");

const operations = [];
const state = { submissionAnswers: [{ submissionId: "existing-submission", questionNumber: 1 }] };
const buildExamSubmissionRemoteRow = (submission) => ({
  exam_section_id: submission.examSectionId,
  student_id: submission.studentId,
  score: submission.score,
});
const remoteStore = {
  from(table) {
    const operation = { table, type: "", filters: [] };
    const builder = {
      insert(row) {
        operation.type = "insert";
        operation.row = row;
        return builder;
      },
      update(row) {
        operation.type = "update";
        operation.row = row;
        return builder;
      },
      eq(column, value) {
        operation.filters.push([column, value]);
        return builder;
      },
      select() {
        return builder;
      },
      async maybeSingle() {
        operations.push(operation);
        return {
          data: { id: "existing-submission", score: operation.row.score, correct_count: 20 },
          error: null,
        };
      },
    };
    return builder;
  },
};
const getRemoteSave = new Function(
  "remoteStore",
  "state",
  "buildExamSubmissionRemoteRow",
  `${remoteSaveSource}; return saveStudentExamSubmissionToRemote;`
);
const saveSubmission = getRemoteSave(remoteStore, state, buildExamSubmissionRemoteRow);
const submission = {
  id: "existing-submission",
  examSectionId: "section-1",
  studentId: "18016",
  score: 100,
  correctCount: 20,
};

(async () => {
  await saveSubmission(submission, { updateExistingRemote: true, preserveExistingRemote: true });
  assert.equal(operations[0].type, "update");
  assert.deepEqual(operations[0].filters, [
    ["id", "existing-submission"],
    ["student_id", "18016"],
    ["exam_section_id", "section-1"],
  ]);

  await saveSubmission({ ...submission, id: "new-local-submission" }, {});
  assert.equal(operations[1].type, "insert");
  console.log("weekly answer reentry tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
