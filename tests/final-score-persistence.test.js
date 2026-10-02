const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const shared = fs.readFileSync("shared.js", "utf8");
const grades = fs.readFileSync("teacher-grades.js", "utf8");
const extract = (source, name) => {
  const match = source.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n}`));
  assert.ok(match, name);
  return match[0];
};

async function main() {
  const existing = { id: "final-2-other", student_id: "other", score: 90 };
  const database = new Map([[existing.id, existing]]);
  const calls = [];
  let failure = null;
  const context = vm.createContext({
    state: { finalExamScores: [] },
    normalizeCoastGuardTrack: (value) => value,
    remoteStore: {
      from(table) {
        assert.equal(table, "final_exam_scores");
        return {
          async upsert(rows) {
            calls.push(["upsert", rows]);
            if (failure) return { error: failure };
            rows.forEach((row) => database.set(row.id, row));
            return { error: null };
          },
          delete() {
            return {
              async in(column, ids) {
                assert.equal(column, "id");
                calls.push(["delete", ids]);
                if (failure) return { error: failure };
                ids.forEach((id) => database.delete(id));
                return { error: null };
              },
            };
          },
        };
      },
    },
    loadSupabaseSdk: async () => {},
    createRemoteStore: () => null,
    console: { error() {} },
    notify: (message) => calls.push(["notify", message]),
  });
  for (const name of ["saveFinalExamScoresToRemote", "deleteFinalExamScoresFromRemote"]) {
    vm.runInContext(extract(shared, name), context);
  }
  vm.runInContext(extract(grades, "persistFinalExamScoresToRemote"), context);
  assert.doesNotMatch(extract(shared, "saveStateToRemote"), /saveFinalExamScoresToRemote\s*\(/,
    "unrelated administrator saves must not replay a stale final-score snapshot");

  await context.saveFinalExamScoresToRemote();
  assert.equal(calls.length, 0, "empty browser state must not delete remote grades");
  const changed = { id: "final-1-edited", studentId: "edited", round: 1, score: 80 };
  await context.saveFinalExamScoresToRemote([changed]);
  assert.equal(database.get(existing.id), existing, "other rounds/students remain untouched");
  assert.equal(database.get(changed.id).score, 80);
  failure = new Error("network failed");
  assert.equal(await context.persistFinalExamScoresToRemote([{ ...changed, score: 70 }]), false);
  assert.equal(database.get(changed.id).score, 80, "failed saves preserve existing grades");
  failure = new Error("relation final_exam_scores does not exist");
  await assert.rejects(context.saveFinalExamScoresToRemote([changed]), /does not exist/);
  failure = null;
  await context.deleteFinalExamScoresFromRemote([changed.id]);
  assert.equal(database.has(changed.id), false);
  assert.equal(database.get(existing.id), existing, "explicit deletion is limited to selected IDs");
  const beforeEmptyDelete = calls.length;
  await context.deleteFinalExamScoresFromRemote([]);
  assert.equal(calls.length, beforeEmptyDelete);

  const original = { id: "final-1-a", studentId: "a", round: 1, score: 75 };
  context.state.finalExamScores = [original];
  context.gradeManagementTrackFilter = "";
  context.confirm = () => true;
  context.saveState = () => calls.push(["local-save"]);
  context.render = () => calls.push(["render"]);
  vm.runInContext(extract(grades, "deleteFinalBulkScores"), context);
  failure = new Error("delete rejected");
  await context.deleteFinalBulkScores(1, [{ id: "a" }]);
  assert.equal(context.state.finalExamScores[0], original, "failed deletion preserves visible grades");
  assert.ok(!calls.some(([kind]) => kind === "local-save"));

  context.getGradeSubjectHeaders = () => ["법규"];
  context.parseFinalBulkScoreRows = () => ({ rows: [{ id: "a", name: "Student", subjectScores: { 법규: 80 }, wrongCount: "" }] });
  context.matchFinalBulkStudent = () => ({ id: "a", name: "Student" });
  context.getTeacherStudentRegisteredTrack = () => "";
  context.calculateFinalSubjectTotalsForTrack = () => ({ score: 80, maxScore: 100, submittedCount: 1, wrongCount: 4 });
  context.selectedStudentCohort = "18";
  vm.runInContext(extract(grades, "planFinalBulkStudentMatches"), context);
  vm.runInContext(extract(grades, "saveFinalBulkScoreInput"), context);
  const beforeFailedSave = calls.length;
  await context.saveFinalBulkScoreInput(1, [{ id: "a", name: "Student" }], "input", "18");
  assert.equal(context.state.finalExamScores[0], original, "failed bulk saves preserve local grades and input");
  assert.ok(!calls.slice(beforeFailedSave).some(([kind, message]) =>
    kind === "render" || kind === "local-save" || (kind === "notify" && message.includes("저장했습니다"))));
  failure = null;
  await context.saveFinalBulkScoreInput(1, [{ id: "a", name: "Student" }], "input", "18");
  assert.equal(context.state.finalExamScores[0].score, 80);
  assert.equal(database.get("final-1-a").score, 80);
  assert.equal(database.get(existing.id), existing);

  const firstRound = database.get("final-1-a");
  await context.saveFinalBulkScoreInput(2, [{ id: "a", name: "Student" }], "input", "18");
  assert.equal(database.get("final-1-a"), firstRound,
    "saving round 2 for the same student must preserve round 1");
  assert.equal(database.get("final-2-a").score, 80);
  assert.ok(context.state.finalExamScores.some((record) => record.id === "final-1-a"));

  // A newly opened/stale browser may not have loaded round 1 at all.
  context.state.finalExamScores = [];
  await context.saveFinalBulkScoreInput(2, [{ id: "a", name: "Student" }], "input", "18");
  assert.equal(database.get("final-1-a"), firstRound,
    "round 2 save must preserve server round 1 even when absent from browser state");
  const secondRound = database.get("final-2-a");
  failure = new Error("round 2 save rejected");
  await context.saveFinalBulkScoreInput(2, [{ id: "a", name: "Student" }], "input", "18");
  assert.equal(database.get("final-1-a"), firstRound);
  assert.equal(database.get("final-2-a"), secondRound,
    "a failed round 2 save must preserve both rounds on the server");
  failure = null;

  vm.runInContext(extract(grades, "getFinalMockScoreRecords"), context);
  vm.runInContext(extract(grades, "deleteFinalScore"), context);
  context.normalizeFinalMockSubjectScores = (record) => record.subjectScores || {};
  const deleteTarget = { id: "final-4-a", studentId: "a", studentName: "테스트 학생", round: 4, score: 80 };
  const otherStudent = { ...deleteTarget, id: "final-4-b", studentId: "b" };
  const otherRound = { ...deleteTarget, id: "final-3-a", round: 3 };
  const external = { ...deleteTarget, id: "final-4-external", studentId: "external", isExternalFinalScore: true };
  const originals = [deleteTarget, otherStudent, otherRound, external];
  context.state.finalExamScores = [...originals];
  originals.forEach((record) => database.set(record.id, record));
  const normalizedTarget = context.getFinalMockScoreRecords(4).find((record) => record.studentId === "a");
  assert.equal(normalizedTarget.id, deleteTarget.id, "displayed scores must retain their deletion ID");
  let confirmation = "";
  context.confirm = (message) => { confirmation = message; return false; };
  const beforeCancelledDelete = calls.length;
  await context.deleteFinalScore(4, { name: "테스트 학생" }, normalizedTarget);
  assert.match(confirmation, /테스트 학생.*4회차/);
  assert.equal(calls.length, beforeCancelledDelete, "cancelling must not delete, save, or render");
  assert.equal(context.state.finalExamScores.length, 4);

  context.confirm = () => true;
  failure = new Error("single delete rejected");
  const beforeRejectedDelete = calls.length;
  await context.deleteFinalScore(4, { name: "테스트 학생" }, normalizedTarget);
  assert.equal(context.state.finalExamScores[0], deleteTarget);
  assert.equal(database.get(deleteTarget.id), deleteTarget);
  assert.ok(!calls.slice(beforeRejectedDelete).some(([kind]) => kind === "local-save" || kind === "render"));

  failure = null;
  context.saveState = (options) => {
    assert.equal(options.skipRemote, true, "deletion must not replay other local state to the server");
    calls.push(["local-save"]);
  };
  const beforeSingleDelete = calls.length;
  await context.deleteFinalScore(4, { name: "테스트 학생" }, normalizedTarget);
  assert.equal(database.has(deleteTarget.id), false);
  assert.deepEqual(Array.from(context.state.finalExamScores), [otherStudent, otherRound, external]);
  for (const record of [otherStudent, otherRound, external]) assert.equal(database.get(record.id), record);
  assert.deepEqual(Array.from(calls.slice(beforeSingleDelete).find(([kind]) => kind === "delete")[1]), [deleteTarget.id]);
  assert.ok(calls.slice(beforeSingleDelete).some(([kind]) => kind === "render"), "refresh rankings after deletion");

  const beforeMissingDelete = calls.filter(([kind]) => kind === "delete").length;
  await context.deleteFinalScore(4, { name: "테스트 학생" }, normalizedTarget);
  await context.deleteFinalScore(4, { name: "테스트 학생" }, null);
  assert.equal(calls.filter(([kind]) => kind === "delete").length, beforeMissingDelete);
  await context.deleteFinalScore(4, { name: "외부 응시자" }, external);
  assert.equal(database.has(external.id), false, "external participant scores can also be deleted individually");
  assert.deepEqual(Array.from(context.state.finalExamScores), [otherStudent, otherRound]);

  context.remoteStore = null;
  await assert.rejects(context.saveFinalExamScoresToRemote([changed]), /remote_store_unavailable/);
  console.log("final score persistence tests passed");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
