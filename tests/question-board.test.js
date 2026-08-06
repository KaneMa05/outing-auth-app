const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const appSource = read("app.js");
const indexSource = read("index.html");
const teacherSource = read("teacher.html");
const boardSource = read("question-board.js");
const apiSource = read("api/question-board.js");
const schemaSource = read("supabase/add-question-board.sql");
const styleSource = read("styles.css");
const handler = require("../api/question-board");

const lectureFooter = indexSource.match(/<footer class="student-footer-menu study-cafe-footer-menu"[\s\S]*?<\/footer>/)?.[0] || "";
const footerRoutes = [...lectureFooter.matchAll(/data-route="([^"]+)"/g)]
  .map((match) => match[1])
  .filter((route) => route !== "study-character");
assert.deepEqual(footerRoutes, ["home", "study-todo", "study-cafe", "mypage"]);
assert.match(appSource, /"question-board": \(\) => requireStudentAuth\(renderQuestionBoard\)/);
assert.match(appSource, /lecture: new Set\(\[[^\]]*"question-board"/);
assert.match(appSource, /renderLectureHomeShortcut\("question-board"/);
assert.doesNotMatch(appSource, /visibleLectureTabs = new Set\(\[[^\]]*"question-board"/);
assert.match(styleSource, /body\.student-study-mode \.study-cafe-footer-menu\s*\{[^}]*repeat\(4/);
assert.match(styleSource, /\.footer-icon-question-board::after\s*\{[^}]*box-shadow:\s*0 4px 0 currentColor, 0 8px 0 currentColor/);
assert.doesNotMatch(styleSource, /\.footer-icon-question-board::after\s*\{[^}]*background:\s*white/);

assert.match(boardSource, /className: "question-board-head compact"/);
assert.match(boardSource, /"게시글을 검색해보세요"/);
assert.match(boardSource, /className: "question-board-search-button"/);
assert.match(boardSource, /searchInput\.addEventListener\("input"/);
assert.match(boardSource, /window\.setTimeout\([\s\S]*?refreshQuestionBoardList\(\)[\s\S]*?450/);
assert.match(boardSource, /button\("\+ 글쓰기"/);
assert.match(boardSource, /accept: "image\/jpeg,image\/png,image\/webp,image\/heic,image\/heif"/);
assert.match(boardSource, /QUESTION_IMAGE_MAX_SOURCE_BYTES = 15 \* 1024 \* 1024/);
assert.match(boardSource, /QUESTION_IMAGE_MAX_SOURCE_PIXELS = 50 \* 1000 \* 1000/);
assert.match(boardSource, /QUESTION_IMAGE_MAX_OUTPUT_BYTES = 900 \* 1024/);
assert.match(boardSource, /const available = 3 - questionBoardState\.retainedImagePaths\.length - questionBoardState\.draftImages\.length/);
assert.match(boardSource, /prepareQuestionImage\(file\)/);
assert.match(boardSource, /renderQuestionPostImages\(post\.images \|\| \[\], post\.title\)/);
assert.match(boardSource, /writeButton\.id = "question-board-write-button"/);
assert.match(boardSource, /document\.body\.appendChild\(writeButton\)/);
assert.match(appSource, /typeof syncQuestionWriteButton === "function"/);
assert.match(boardSource, /questionBoardState\.mode === "subject-picker"/);
assert.match(boardSource, /function renderQuestionSubjectPicker\(\)/);
assert.match(boardSource, /openQuestionSubjectPicker\("list"\)/);
assert.match(boardSource, /questionBoardState\.draftSubject = subject;\s*questionBoardState\.mode = "form"/);
assert.match(boardSource, /"question-write-subject-button"/);
assert.match(boardSource, /className: "question-board-empty question-board-list-empty"/);
assert.match(boardSource, /const QUESTION_BOARD_DEFAULT_SUBJECTS/);
assert.match(boardSource, /const QUESTION_BOARD_DEFAULT_SUBJECTS = \[\s*"자유"/);
assert.match(apiSource, /const FALLBACK_SUBJECTS = \["자유"/);
assert.match(apiSource, /new Set\(\["자유", \.\.\.configured, \.\.\.FALLBACK_SUBJECTS\]\)/);
assert.match(boardSource, /function renderQuestionBoardEmptyState\(searching = false\)/);
assert.match(boardSource, /function renderQuestionBoardGuide\(\)/);
assert.match(boardSource, /questionBoardState\.loading = false;\s*questionBoardState\.loaded = true;/);
assert.match(boardSource, /questionBoardAdminState\.loading = false;\s*questionBoardAdminState\.loaded = true;/);
assert.match(styleSource, /\.question-board-list-empty\s*\{[^}]*min-height: 0[^}]*border-style: solid/);
assert.match(styleSource, /\.question-write-button\s*\{[^}]*z-index: 35[^}]*pointer-events: auto[^}]*touch-action: manipulation/);
assert.match(styleSource, /\.question-write-button\s*\{[^}]*bottom: 100px;[^}]*env\(safe-area-inset-bottom, 0px\)/);
assert.match(styleSource, /\.question-subject-picker-overlay\s*\{[^}]*position: fixed[^}]*z-index: 120/);
assert.match(styleSource, /\.question-subject-picker-sheet\s*\{[^}]*align-items: flex-end|\.question-subject-picker-overlay\s*\{[^}]*align-items: flex-end/);
assert.doesNotMatch(styleSource, /question-skeleton-shimmer/);
assert.match(boardSource, /renderQuestionSubjectTabs\(questionBoardState, false\)/);
const subjectTabsSource = boardSource.match(/function renderQuestionSubjectTabs\([\s\S]*?\n\}/)?.[0] || "";
assert.doesNotMatch(subjectTabsSource, /questionFilterButton\("전체"/);
assert.doesNotMatch(
  boardSource.match(/function renderQuestionPostList\(\)[\s\S]*?\n\}/)?.[0] || "",
  /renderQuestionStatusTabs/
);

assert.match(teacherSource, /data-route="question-board-admin">게시판 관리/);
assert.match(appSource, /"question-board-admin": renderQuestionBoardAdmin/);
assert.match(apiSource, /student_category=eq\.lecture/);
assert.match(apiSource, /validate_student_device/);
assert.match(apiSource, /author_type: "teacher"/);
assert.match(apiSource, /teacher_comment_create/);
assert.match(apiSource, /question_reports/);
assert.match(apiSource, /const QUESTION_IMAGE_BUCKET = "question-board-images"/);
assert.match(apiSource, /const QUESTION_IMAGE_MAX_BYTES = 900 \* 1024/);
assert.match(apiSource, /const QUESTION_REQUEST_MAX_BYTES = 4 \* 1024 \* 1024/);
assert.match(apiSource, /throw httpError\("payload_too_large", 413\)/);
assert.match(apiSource, /object\/sign\/\$\{QUESTION_IMAGE_BUCKET\}/);
assert.match(apiSource, /image_paths: \[\.\.\.retainedPaths, \.\.\.uploadedPaths\]/);

for (const table of ["question_posts", "question_comments", "question_reports"]) {
  assert.match(schemaSource, new RegExp(`alter table public\\.${table} enable row level security`));
  assert.match(schemaSource, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`));
}
assert.match(schemaSource, /grant execute on function public\.increment_question_view_count\(uuid\) to service_role/);
assert.match(schemaSource, /board_type in \('subject', 'notice', 'free'\)/);
assert.match(schemaSource, /question-board-images/);
assert.match(schemaSource, /image_paths text\[\]/);
assert.match(schemaSource, /cardinality\(image_paths\).*<= 3/);
assert.match(apiSource, /board_type=eq\.subject/);

const { maskName, normalizeRequired, normalizeUuid } = handler._private;
assert.equal(maskName("홍길동"), "홍○○");
assert.equal(normalizeRequired("  줄 1\r\n줄 2  ", 100, "invalid", 1, true), "줄 1\n줄 2");
assert.equal(normalizeUuid("not-an-id"), "");
assert.equal(normalizeUuid("ed793dab-9a22-4ead-b088-1f0761959168"), "ed793dab-9a22-4ead-b088-1f0761959168");
const tinyJpeg = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString("base64")}`;
assert.equal(handler._private.normalizeQuestionImages([{ contentType: "image/jpeg", data: tinyJpeg }]).length, 1);
assert.throws(() => handler._private.normalizeQuestionImages(new Array(4).fill({ contentType: "image/jpeg", data: tinyJpeg })), /too_many_images/);
const oversizedJpeg = `data:image/jpeg;base64,${Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(900 * 1024)]).toString("base64")}`;
assert.throws(() => handler._private.normalizeQuestionImages([{ contentType: "image/jpeg", data: oversizedJpeg }]), /image_too_large/);

console.log("question board tests passed");
require("./local-question-board.test");
