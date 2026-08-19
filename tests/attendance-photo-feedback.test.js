const assert = require("node:assert/strict");
const fs = require("node:fs");

const studentSource = fs.readFileSync("student.js", "utf8");
const sharedSource = fs.readFileSync("shared.js", "utf8");
const stylesSource = fs.readFileSync("styles.css", "utf8");

assert.match(
  studentSource,
  /await renderPhotoThumbnailPreview\(file, preview,[\s\S]*?await finishPhotoSelection/,
  "attendance photo feedback should stay loading until thumbnail processing finishes"
);
assert.match(studentSource, /retakeText: "사진 다시 찍기"/);
assert.match(studentSource, /사진 촬영 완료 · 아직 출석 인증 전입니다/);
assert.match(studentSource, /submitButton\.disabled = true;[\s\S]*?onSelectionReady:[\s\S]*?submitButton\.disabled = false/);
assert.match(stylesSource, /\.attendance-form \.photo-input-status\.loading/);
assert.match(
  sharedSource,
  /function getAttendancePhotoSrc\(check\) \{[\s\S]*?isTeacherReasonAttendanceCheck\(check\)\) return "";/,
  "teacher-created reason attendance must not expose its sentinel path as a photo"
);
assert.match(sharedSource, /startsWith\("teacher-reason\/"\)/);

console.log("attendance photo feedback tests passed");
