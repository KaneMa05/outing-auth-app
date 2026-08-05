const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const appSource = read("app.js");
const sharedSource = read("shared.js");
const indexSource = read("index.html");
const teacherStudentsSource = read("teacher-students.js");
const studentsApiSource = read("api/students.js");
const studyCafeApiSource = read("api/study-cafe.js");
const roomsApiSource = read("api/study-cafe-rooms.js");
const schemaSource = read("supabase/schema.sql");
const migrationSource = read("supabase/add-student-categories.sql");
const studyCafeAccessMigrationSource = read("supabase/expand-study-cafe-category-access.sql");

for (const category of ["offline", "online_managed", "lecture"]) {
  assert.match(schemaSource, new RegExp(`'${category}'`));
  assert.match(migrationSource, new RegExp(`'${category}'`));
}
assert.match(schemaSource, /add column if not exists student_category text/);
assert.match(schemaSource, /add column if not exists cohort smallint/);
assert.match(migrationSource, /when id like '2%' then 'lecture'/);
assert.match(migrationSource, /when class_name like '%온라인%' then 'online_managed'/);
assert.match(migrationSource, /alter column student_category set not null/);

assert.match(sharedSource, /function getStudentCategory\(student\)/);
assert.match(sharedSource, /if \(id\.startsWith\("2"\) \|\| \/\^9\\d\{5\}\$\/\.test\(id\)\) return "lecture"/);
assert.match(sharedSource, /return \["online_managed", "lecture"\]\.includes\(getStudentCategory\(student\)\)/);
assert.match(sharedSource, /student_category: getStudentCategory\(student\)/);

assert.match(appSource, /offline: new Set\(\["home", "student", "student-verify", "student-return", "student-done", "attendance", "grades", "mypage", "notices"\]\)/);
assert.match(appSource, /online_managed: new Set\(\["home", "study-cafe", "grades", "mypage", "notices"\]\)/);
assert.match(appSource, /lecture: new Set\(\["study-todo", "study-cafe", "study-ranking", "study-timer", "study-character", "mypage", "notices"\]\)/);
assert.match(appSource, /category === "online_managed" && !isOnlineManagedStudyCafeEnabled\(\)/);
assert.match(appSource, /return category === "lecture" \? "study-todo" : "home"/);
assert.match(appSource, /visibleLectureTabs = new Set\(\["study-todo", "study-cafe", "study-ranking", "study-timer", "mypage"\]\)/);
assert.match(appSource, /category === "online_managed" && isOnlineManagedStudyCafeEnabled\(\)/);
assert.match(appSource, /const onlineMode = lectureMode \|\| onlineManagedMode/);
assert.match(appSource, /classList\.toggle\("student-online-managed-mode", onlineManagedMode\)/);

const studyFooter = indexSource.match(/<footer class="student-footer-menu study-cafe-footer-menu"[\s\S]*?<\/footer>/)?.[0] || "";
for (const route of ["study-todo", "study-cafe", "study-ranking", "study-timer", "mypage"]) {
  assert.match(studyFooter, new RegExp(`data-route="${route}"`));
}
assert.match(studyFooter, /data-study-cafe-back[\s\S]*?hidden/);
assert.match(studyFooter, /data-route="study-character" hidden/);

assert.match(teacherStudentsSource, /studentCategory === "online_managed" \? 200 : 1/);
assert.match(teacherStudentsSource, /studentCategory === "online_managed" \? 999 : 199/);
assert.match(teacherStudentsSource, /openStudentCategoryEditModal/);
assert.match(studentsApiSource, /student_category: studentCategory/);
assert.match(studyCafeApiSource, /\["online_managed", "lecture"\]\.includes\(category\)/);
assert.match(roomsApiSource, /\["online_managed", "lecture"\]\.includes\(category\)/);
assert.match(studyCafeAccessMigrationSource, /drop constraint if exists study_cafe_profiles_student_id_check/);
assert.match(studyCafeAccessMigrationSource, /student_category in \('online_managed', 'lecture'\)/);
assert.doesNotMatch(studyCafeAccessMigrationSource, /p_student_id not like '2%'/);

console.log("student category tests passed");
