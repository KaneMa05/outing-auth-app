const assert = require("node:assert/strict");
const fs = require("node:fs");

const sharedSource = fs.readFileSync("shared.js", "utf8");
const studentSource = fs.readFileSync("student.js", "utf8");
const teacherStudentsSource = fs.readFileSync("teacher-students.js", "utf8");

assert.match(
  sharedSource,
  /async function createEarlyLeaveRequest\(student, reason\)[\s\S]*if \(getActiveOuting\(student\.id\)\) throw new Error\("active_outing_exists"\)[\s\S]*reason: "조퇴"[\s\S]*decision: "pending"[\s\S]*earlyLeaveReason[\s\S]*await saveNewOutingRequestToRemote\(outing\)/,
  "early-leave requests should share the same active-request guard, payload, and remote persistence"
);
assert.match(
  studentSource,
  /await createEarlyLeaveRequest\(student, earlyLeaveReason\)/,
  "the student form should use the shared early-leave request flow"
);
assert.match(
  teacherStudentsSource,
  /isTeacherAdmin\(\) && !activeOuting[\s\S]*openStudentPreviewEarlyLeaveModal\(student\.id\)/,
  "the student preview should expose the early-leave action only to administrators without an active request"
);
assert.match(
  teacherStudentsSource,
  /async \(event\) => \{[\s\S]*await createEarlyLeaveRequest\(student, earlyLeaveReason\)[\s\S]*notify\("조퇴 신청이 접수되었습니다\."\)/,
  "the administrator form should submit through the shared early-leave request flow"
);

console.log("student preview early-leave tests passed");
