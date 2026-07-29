const assert = require("node:assert/strict");
const fs = require("node:fs");

const appSource = fs.readFileSync("app.js", "utf8");
const sharedSource = fs.readFileSync("shared.js", "utf8");
const teacherSource = fs.readFileSync("teacher.js", "utf8");
const teacherHtml = fs.readFileSync("teacher.html", "utf8");
const styleSource = fs.readFileSync("styles.css", "utf8");
const authSource = fs.readFileSync("api/teacher-auth-utils.js", "utf8");

assert.match(teacherHtml, /data-route="study-cafe-admin">온라인 스터디카페/);
assert.match(appSource, /"study-cafe-admin": "온라인 스터디카페"/);
assert.match(appSource, /"study-cafe-admin": renderStudyCafeAdmin/);
assert.match(appSource, /hasTeacherPermission\("study_cafe\.read"\) \? moduleCard\("온라인 스터디카페"/);
assert.match(sharedSource, /"study-cafe-admin": "study_cafe\.read"/);
assert.match(authSource, /"study_cafe\.read"/);
assert.match(authSource, /"study_cafe\.write"/);
assert.match(teacherSource, /function renderStudyCafeAdmin\(\)/);
assert.match(teacherSource, /fetch\("\/api\/study-cafe-admin"/);
assert.match(teacherSource, /runStudyCafeAdminAction\("stop_session"/);
assert.match(teacherSource, /runStudyCafeAdminAction\("release_seat"/);
assert.match(teacherSource, /studyCafeAdminState\.refreshTimer = window\.setInterval/);
assert.match(teacherSource, /\["A룸", "B룸", "C룸", "D룸", "E룸"\]/);
assert.match(teacherSource, /Array\.from\(\{ length: 10 \}/);
assert.match(styleSource, /\.study-cafe-admin-seat-grid/);
assert.match(styleSource, /\.study-cafe-admin-room-list/);
assert.match(styleSource, /\.study-cafe-admin-member-list/);
assert.match(styleSource, /\.study-cafe-admin-status\.running/);

console.log("study-cafe-admin-ui tests passed");
