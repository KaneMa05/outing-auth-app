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
const splitMigrationSource = read("supabase/split-notice-target-audiences.sql");

for (const source of [schemaSource, migrationSource, splitMigrationSource]) {
  assert.match(source, /target_audience/);
  for (const audience of [
    "'academy'",
    "'offline'",
    "'online_managed'",
    "'lecture'",
    "'offline,online_managed'",
    "'offline,lecture'",
    "'online_managed,lecture'",
    "'offline,online_managed,lecture'",
  ]) assert.match(source, new RegExp(audience));
}

assert.match(sharedSource, /target_audience: normalizeNoticeTargetAudience\(notice\.targetAudience\)/);
assert.match(sharedSource, /targetAudience: normalizeNoticeTargetAudience\(notice\.target_audience\)/);
assert.match(sharedSource, /isMissingColumnError\(noticeResult\.error, "target_audience"\)/);
assert.match(sharedSource, /function getNoticeTargetAudienceValues\(value\)/);
assert.match(sharedSource, /\.includes\(studentCategory\)/);
assert.match(sharedSource, /noticeMatchesStudentCategory\(notice, studentCategory\)/);

assert.match(teacherSettingsSource, /className: "notice-target-options"/);
assert.match(teacherSettingsSource, /type: "checkbox"/);
assert.match(teacherSettingsSource, /value: "offline"/);
assert.match(teacherSettingsSource, /value: "online_managed"/);
assert.match(teacherSettingsSource, /value: "lecture"/);
assert.match(teacherSettingsSource, /오프라인 수강생/);
assert.match(teacherSettingsSource, /온라인 관리반/);
assert.match(teacherSettingsSource, /인터넷 수강생/);
assert.match(teacherSettingsSource, /filter\(\(option\) => option\.input\.checked\)/);
assert.match(teacherSettingsSource, /공지 대상을 1개 이상 선택해주세요/);
assert.match(teacherSettingsSource, /targetAudience: normalizeNoticeTargetAudience\(notice\.targetAudience\)/);
assert.match(teacherSettingsSource, /action: "save"/);
assert.match(teacherSettingsSource, /\["제목", "공지 대상", "상태", "등록일", "관리"\]/);

assert.match(appSource, /function getStudentImportantNotices\(\)/);
assert.match(appSource, /studentCategory: getStudentCategory\(student\)/);
assert.match(appSource, /getStudentImportantNoticeById\(noticeId\)/);
assert.doesNotMatch(appSource, /getImportantNoticeById\(noticeId, \{ publishedOnly: true \}\)/);
assert.match(appSource, /renderStudentNoticeRow\(notice, true\)/);
assert.match(appSource, /"student-notice-title student-notice-row"/);

const styleSource = read("styles.css");
assert.match(styleSource, /\.student-notice-row\s*\{[^}]*border: 0[^}]*border-bottom: 1px solid/);
assert.match(styleSource, /\.student-notices-panel\s*\{[^}]*padding: 0[^}]*background: transparent/);

console.log("notice audience tests passed");
