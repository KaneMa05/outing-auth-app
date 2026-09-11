const assert = require("node:assert/strict");
const fs = require("node:fs");

const appSource = fs.readFileSync("app.js", "utf8");
const sharedSource = fs.readFileSync("shared.js", "utf8");
const teacherSource = fs.readFileSync("teacher.js", "utf8");
const localServerSource = fs.readFileSync("local-dev-server.js", "utf8");

assert.match(sharedSource, /studyRoomListEnabled: false/);
assert.match(sharedSource, /studyCafeRoomTabsEnabled: false/);
assert.match(sharedSource, /state\.settings\.studyRoomListEnabled = settings\.studyRoomListEnabled === true/);
assert.match(sharedSource, /state\.settings\.studyCafeRoomTabsEnabled = settings\.studyCafeRoomTabsEnabled === true/);

assert.match(
  appSource,
  /state\.settings\.studyRoomListEnabled === true[\s\S]*?ariaLabel: "스터디방 목록 열기"/
);
assert.match(
  appSource,
  /state\.settings\.studyCafeRoomTabsEnabled === true[\s\S]*?renderStudyCafeRoomTabs\(student\)/
);

assert.match(teacherSource, /function renderStudyCafeVisibilitySettingsPanel\(\)/);
assert.match(teacherSource, /key: "studyRoomListEnabled"[\s\S]*?title: "스터디방 목록 버튼"/);
assert.match(teacherSource, /key: "studyCafeRoomTabsEnabled"[\s\S]*?title: "랭킹룸 · 자유석 버튼"/);
assert.match(teacherSource, /saveAppSettingsToRemote\(\{ \[option\.key\]: nextEnabled \}\)/);
assert.match(localServerSource, /studyRoomListEnabled: false/);
assert.match(localServerSource, /studyCafeRoomTabsEnabled: false/);

console.log("study cafe visibility settings tests passed");
