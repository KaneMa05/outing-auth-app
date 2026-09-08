const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const appSource = read("app.js");
const apiSource = read("api/curriculum-progress.js");
const indexSource = read("index.html");
const localServerSource = read("local-dev-server.js");
const styleSource = read("styles.css");
const serviceWorkerSource = read("sw.js");
const dataSource = read("final-scope-data.js");

const context = { window: {} };
vm.runInNewContext(dataSource, context);
const plan = context.window.FINAL_SCOPE_PLAN;

assert.equal(plan.title, "26년 3차 해양경찰");
assert.equal(plan.rounds.length, 12);
assert.deepEqual(Array.from(plan.rounds, (item) => item.round), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
assert.equal(plan.rounds[0].subjects["형사법"].length, 4);
assert.equal(plan.rounds[9].code, "전 범위");
assert.equal(plan.appSubjectByScopeSubject["형사소송법·공판"], "형사법(공판)");

assert.match(appSource, /function canUseFinalScopePlan[\s\S]*?\["online_managed", "lecture"\]/);
assert.match(appSource, /function renderStudentHome[\s\S]*?finalScopeAvailable \? renderFinalScopeHomeEntry\(\) : null/);
assert.match(appSource, /function renderLectureStudentHome[\s\S]*?renderFinalScopeHomeEntry\(\)/);
assert.match(appSource, /\{ id: "final-scope", label: "회독 플랜" \}/);
assert.match(appSource, /activeView === "final-scope"[\s\S]*?renderFinalScopePlan\(\)/);
assert.match(appSource, /function getFinalScopeSubjects[\s\S]*?getConfiguredWeeklySubjectsForTrack\(track\)/);
assert.match(appSource, /category === "online_managed"[\s\S]*?STUDENT_CATEGORY_ROUTES\.offline, "study-todo"/);

assert.match(apiSource, /student_category=in\.\(online_managed,lecture\)/);
assert.match(apiSource, /curriculum_student_only/);
assert.match(localServerSource, /function getLocalCurriculumStudent\(body\) \{[\s\S]*?\["online_managed", "lecture"\]/);
assert.match(indexSource, /final-scope-data\.js[\s\S]*?app\.js/);
assert.match(styleSource, /\.student-planner-view-switch\.three-options/);
assert.match(styleSource, /\.final-scope-round-button\.active/);
assert.match(serviceWorkerSource, /"\/final-scope-data\.js"/);

console.log("final scope plan tests passed");
