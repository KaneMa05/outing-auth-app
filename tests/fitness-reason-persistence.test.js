const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const fitnessSource = fs.readFileSync("teacher-fitness.js", "utf8");
const sharedSource = fs.readFileSync("shared.js", "utf8");
const extract = (name) => {
  const match = sharedSource.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n}`));
  assert.ok(match, name);
  return match[0];
};
let remoteRows = [];
let failSave = false;
let writable = true;
let writes = 0;
const context = vm.createContext({
  console: { error() {} },
  state: { fitnessScores: [] },
  getStudentCohort: () => "18",
  getCanonicalStudentName: (_, fallback) => fallback,
  formatStudentNumber: String,
  hasTeacherPermission: () => writable,
  notify() {}, saveState() {}, render() {},
  el(tag, props = {}, children = []) {
    return { tag, ...props, children: Array.isArray(children) ? children : [children],
      addEventListener() {}, appendChild(child) { this.children.push(child); } };
  },
  remoteStore: {
    from(table) {
      assert.equal(table, "fitness_scores");
      return { async upsert(rows, options) {
        writes++;
        assert.equal(options.onConflict, "assessment_month,student_id");
        if (failSave) return { error: new Error("save failed") };
        remoteRows = JSON.parse(JSON.stringify(rows));
        return { error: null };
      } };
    },
  },
});
vm.runInContext(`${fitnessSource}\n${extract("saveFitnessScoresToRemote")}\n${extract("mapFitnessScoreFromRemote")}`, context);
const run = (source) => vm.runInContext(source, context);

(async () => {
  run(`
    fitnessFilters.month = "2026-10";
    const student = { id: "18001", name: "테스트", gender: "male" };
    renderFitnessInputRow(student);
    fitnessInputRows[0].controls.memo.value = "  부상으로 미측정 <확인>  ";
    renderFitnessInputRow({ ...student, id: "18002" });
    fitnessInputRows[1].controls.memo.value = "   ";
  `);
  await run("saveFitnessBulkScores()");
  assert.equal(remoteRows.length, 1, "blank new rows must be skipped");
  assert.equal(remoteRows[0].memo, "부상으로 미측정 <확인>");
  assert.equal(remoteRows[0].sit_up_count, null, "reason-only records must keep scores empty");
  assert.equal(remoteRows[0].push_up_count, null);
  assert.equal(remoteRows[0].grip_strength, null);
  context.savedRow = remoteRows[0];
  run(`
    state.fitnessScores = [mapFitnessScoreFromRemote(savedRow)];
    fitnessInputRows = [];
    renderFitnessInputRow(student, state.fitnessScores[0]);
  `);
  assert.equal(run("fitnessInputRows[0].controls.memo.value"), remoteRows[0].memo, "saved reason must reload into the field");
  assert.equal(run("applyFitnessRanks(state.fitnessScores)[0].rank"), 0, "reason-only rows have no rank");

  run('fitnessInputRows[0].controls.memo.value = "병원 방문"');
  await run("saveFitnessBulkScores()");
  assert.equal(remoteRows[0].memo, "병원 방문", "editing a reason must update storage");
  run('fitnessInputRows[0].controls.memo.value = ""');
  await run("saveFitnessBulkScores()");
  assert.equal(remoteRows[0].memo, null, "clearing an existing reason must persist");

  run(`
    fitnessInputRows[0].controls.sitUpCount.value = "58";
    fitnessInputRows[0].controls.pushUpCount.value = "58";
    fitnessInputRows[0].controls.gripStrength.value = "61";
    fitnessInputRows[0].controls.memo.value = "기록 확인";
  `);
  await run("saveFitnessBulkScores()");
  assert.equal(remoteRows[0].total_score, 30, "existing score conversion must remain unchanged");
  assert.equal(remoteRows[0].memo, "기록 확인");
  const beforeFailure = JSON.stringify(context.state.fitnessScores);
  failSave = true;
  run('fitnessInputRows[0].controls.memo.value = "실패할 변경"');
  await run("saveFitnessBulkScores()");
  assert.equal(JSON.stringify(context.state.fitnessScores), beforeFailure, "failed saves must restore previous data");
  failSave = false;
  writable = false;
  const beforeDenied = writes;
  await run("saveFitnessBulkScores()");
  assert.equal(writes, beforeDenied, "read-only users cannot save reasons");
  assert.equal(run("renderFitnessInputRow(student).children.at(-1).children[0].disabled"), true);
  writable = true;
  await run(`saveFitnessStudentScore(student, {
    sitUpCount: { value: "" }, pushUpCount: { value: "" }, gripStrength: { value: "" },
    memo: { value: "개별 미측정 사유" }
  })`);
  assert.equal(remoteRows[0].memo, "개별 미측정 사유");
  console.log("fitness reason persistence tests passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });
