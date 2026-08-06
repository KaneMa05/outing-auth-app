const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const appSource = read("app.js");
const sharedSource = read("shared.js");
const teacherSettingsSource = read("teacher-settings.js");
const schemaSource = read("supabase/schema.sql");
const migrationSource = read("supabase/add-notice-target-audience.sql");

for (const source of [schemaSource, migrationSource]) {
  assert.match(source, /target_audience/);
  assert.match(source, /target_audience in \('academy', 'lecture'\)/);
}

assert.match(sharedSource, /target_audience: normalizeNoticeTargetAudience\(notice\.targetAudience\)/);
assert.match(sharedSource, /targetAudience: normalizeNoticeTargetAudience\(notice\.target_audience\)/);
assert.match(sharedSource, /isMissingColumnError\(noticeResult\.error, "target_audience"\)/);
assert.match(sharedSource, /studentCategory === "lecture" \? "lecture" : "academy"/);
assert.match(sharedSource, /noticeMatchesStudentCategory\(notice, studentCategory\)/);

assert.match(teacherSettingsSource, /name: "targetAudience"/);
assert.match(teacherSettingsSource, /value: "academy"/);
assert.match(teacherSettingsSource, /value: "lecture"/);
assert.match(teacherSettingsSource, /isMissingColumnError\(result\.error, "target_audience"\)/);
assert.match(teacherSettingsSource, /const \{ target_audience, \.\.\.legacyPayload \} = payload/);
assert.match(teacherSettingsSource, /\["제목", "공지 대상", "상태", "등록일", "관리"\]/);

assert.match(appSource, /function getStudentImportantNotices\(\)/);
assert.match(appSource, /studentCategory: getStudentCategory\(student\)/);
assert.match(appSource, /getStudentImportantNoticeById\(noticeId\)/);
assert.doesNotMatch(appSource, /getImportantNoticeById\(noticeId, \{ publishedOnly: true \}\)/);

console.log("notice audience tests passed");
