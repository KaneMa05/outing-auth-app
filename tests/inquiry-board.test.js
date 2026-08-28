const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const appSource = read("app.js");
const sharedSource = read("shared.js");
const inquirySource = read("inquiry-board.js");
const inquiryApiSource = read("api/inquiries.js");
const boardSource = read("question-board.js");
const boardApiSource = read("api/question-board.js");
const teacherAuthSource = read("api/teacher-auth-utils.js");
const indexSource = read("index.html");
const teacherSource = read("teacher.html");
const migrationSource = read("supabase/add-inquiry-board.sql");
const questionMigrationSource = read("supabase/add-question-board.sql");
const schemaSource = read("supabase/schema.sql");
const styleSource = read("styles.css");
const serviceWorkerSource = read("sw.js");
const handler = require("../api/inquiries");

assert.match(appSource, /"inquiry-board": "문의하기"/);
assert.match(appSource, /"inquiry-board-admin": "문의 관리"/);
assert.match(appSource, /"inquiry-board": \(\) => requireStudentAuth\(renderStudentInquiryBoard\)/);
assert.match(appSource, /"inquiry-board-admin": renderInquiryAdmin/);
assert.match(sharedSource, /"inquiry-board-admin": "inquiries\.read"/);
assert.match(teacherAuthSource, /"inquiries\.read"/);
assert.match(teacherAuthSource, /"inquiries\.write"/);

assert.match(appSource, /FAQ로 해결되지 않는 문제는 비공개 문의로 남겨주세요\./);
assert.match(appSource, /button\("문의하기", "student-faq-contact-button", "button", openStudentInquiryComposer\)/);
assert.doesNotMatch(appSource, /student-inquiry-link/);
assert.match(indexSource, /<script src="\.\/inquiry-board\.js\?v=[^"]+" defer><\/script>/);
assert.match(teacherSource, /data-route="inquiry-board-admin">문의 관리/);
assert.match(teacherSource, /<script src="\.\/inquiry-board\.js\?v=[^"]+" defer><\/script>/);
assert.match(serviceWorkerSource, /"\/inquiry-board\.js"/);

assert.match(inquirySource, /function renderStudentInquiryBoard\(\)/);
assert.match(inquirySource, /function openStudentInquiryComposer\(\)[\s\S]*?studentInquiryState\.mode = "form";[\s\S]*?navigate\("inquiry-board"\)/);
assert.match(inquirySource, /function renderInquiryAdmin\(\)/);
assert.match(inquirySource, /fetch\("\/api\/inquiries"/);
assert.match(inquirySource, /button\("← 자주 묻는 질문"[\s\S]*?navigate\("faq"\)/);
assert.match(inquirySource, /문의 내용은 본인과 선생님만 확인할 수 있으며 자유 게시판에는 표시되지 않습니다\./);
const studentListSource = inquirySource.match(/function renderStudentInquiryList\(\)[\s\S]*?\n\}/)?.[0] || "";
const studentFormSource = inquirySource.match(/function renderStudentInquiryForm\(\)[\s\S]*?\n\}/)?.[0] || "";
assert.doesNotMatch(studentListSource, /inquiry-search|renderInquiryCategoryFilters|renderInquiryStatusFilters|내 문의를 검색/);
assert.doesNotMatch(studentFormSource, /categorySelect|field\("카테고리"/);
assert.match(studentFormSource, /category: editing\?\.category \|\| INQUIRY_CATEGORIES\[0\]/);
assert.match(inquirySource, /className: "inquiry-filter-scroll"/);
assert.match(styleSource, /\.inquiry-filter-scroll,[\s\S]*?overflow-x: auto/);
assert.match(styleSource, /\.inquiry-page\s*\{[^}]*width: 100%[^}]*min-width: 0[^}]*max-width: 100%[^}]*overflow-x: hidden[^}]*overflow-x: clip/);
assert.match(styleSource, /\.inquiry-page > \*\s*\{[^}]*min-width: 0[^}]*max-width: 100%/);
assert.match(styleSource, /\.inquiry-compose-button\s*\{[^}]*bottom: calc\(var\(--student-footer-bottom\) \+ 80px\)/);

assert.match(inquiryApiSource, /student_inquiries/);
assert.match(inquiryApiSource, /student_inquiry_messages/);
assert.match(inquiryApiSource, /student_id=eq\.\$\{encodeURIComponent\(studentId\)\}/);
assert.match(inquiryApiSource, /validate_student_device/);
assert.match(inquiryApiSource, /const permission = action === "teacher_reply" \? "inquiries\.write" : "inquiries\.read"/);
assert.match(inquiryApiSource, /status: "answered"/);
assert.doesNotMatch(inquiryApiSource, /question_posts|question_comments|question_reports|\/api\/question-board/);
assert.doesNotMatch(boardSource, /student_inquiries|student_inquiry_messages|INQUIRY_CATEGORIES|boardType/);
assert.doesNotMatch(boardApiSource, /student_inquiries|student_inquiry_messages|INQUIRY_CATEGORIES|boardType/);
assert.doesNotMatch(questionMigrationSource, /student_inquiries|student_inquiry_messages|\binquiry\b/i);

for (const table of ["student_inquiries", "student_inquiry_messages"]) {
  assert.match(migrationSource, new RegExp(`create table if not exists public\\.${table}`));
  assert.match(migrationSource, new RegExp(`alter table public\\.${table} enable row level security`));
  assert.match(migrationSource, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`));
  assert.match(schemaSource, new RegExp(`create table if not exists public\\.${table}`));
}
assert.doesNotMatch(migrationSource, /question_posts|question_comments|question_reports/);
assert.match(migrationSource, /student_inquiry_messages_student_created_idx[\s\S]*?student_id, created_at desc/);

assert.deepEqual(handler._private.INQUIRY_CATEGORIES, ["이용 문의", "플래너", "스터디카페", "타이머", "커리큘럼", "게시판", "알림", "계정·기기"]);
assert.equal(handler._private.normalizeUuid("550e8400-e29b-41d4-a716-446655440000"), "550e8400-e29b-41d4-a716-446655440000");
assert.equal(handler._private.normalizeUuid("not-an-id"), "");
assert.throws(() => handler._private.normalizeCategory("없는 카테고리"), /invalid_category/);

console.log("independent inquiry tests passed");
