const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
const styleSource = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const faqSource = appSource.match(/const INTERNET_STUDENT_FAQS = \[[\s\S]*?\n\];/)?.[0] || "";

assert.match(appSource, /faq: "자주 묻는 질문"/);
assert.match(appSource, /lecture: new Set\([^\n]*"faq"/);
assert.match(appSource, /const studentRoutes = \[[^\n]*"mypage", "faq"/);
assert.match(appSource, /faq: \(\) => requireStudentAuth\(renderStudentFaq\)/);
assert.match(appSource, /\["study-character", "study-shop", "push-settings", "faq", "inquiry-board"\]\.includes\(currentRoute\)/);
assert.match(appSource, /student-faq-link[\s\S]*?navigate\("faq"\)[\s\S]*?"자주 묻는 질문"/);
assert.match(appSource, /const INTERNET_STUDENT_FAQS = \[/);
assert.match(faqSource, /오늘 타이머 기록은 언제 새로 시작되나요\?/);
assert.match(faqSource, /매일 오전 4시에 새로 시작됩니다/);
assert.match(faqSource, /오전 4시가 되어도 측정 중인 타이머는 멈추지 않으며/);
assert.match(faqSource, /타이머가 자동으로 멈추는 상황은 언제인가요\?/);
assert.match(faqSource, /다른 앱이나 브라우저 탭·창으로 이동하거나 화면을 잠그는 등/);
assert.match(faqSource, /앱 안에서 다른 메뉴로 이동하는 것만으로는 멈추지 않습니다/);
assert.match(faqSource, /일시정지 상태가 15분 동안 이어지면 좌석을 계속 이용할지 묻는 10초 안내/);
assert.match(appSource, /오늘의 할 일과 커리큘럼은 어떻게 다른가요\?/);
assert.match(appSource, /이미 앉아 있는데 과목이나 좌석을 바꾸고 싶어요\./);
assert.match(appSource, /과목 종료와 자리 비우기는 무엇이 다른가요\?/);
assert.match(appSource, /앱 알림이 오지 않아요\./);
assert.match(appSource, /FAQ로 해결되지 않는 문제는 비공개 문의로 남겨주세요\./);
assert.match(appSource, /button\("문의하기", "student-faq-contact-button", "button", openStudentInquiryComposer\)/);
assert.doesNotMatch(appSource, /student-inquiry-link/);
assert.doesNotMatch(appSource.match(/const INTERNET_STUDENT_FAQS = \[[\s\S]*?\n\];/)?.[0] || "", /사무실에 문의/);
assert.match(appSource, /function renderStudentFaq\(\)/);
assert.match(appSource, /function renderStudentFaqItem\(item, index\)/);
assert.match(appSource, /let studentFaqCategory = "전체"/);
assert.match(appSource, /function renderStudentFaqFilters\(\)/);
assert.match(appSource, /\["전체", \.\.\.new Set\(INTERNET_STUDENT_FAQS\.map/);
assert.match(appSource, /className: "student-faq-filters"/);
assert.match(appSource, /`student-faq-filter\$\{isActive \? " active" : ""\}`/);
assert.match(appSource, /INTERNET_STUDENT_FAQS\.filter\(\(item\) => item\.category === studentFaqCategory\)/);
assert.match(
  appSource,
  /studentFaqCategory === "전체"[\s\S]*?item\.category === "타이머"[\s\S]*?item\.category !== "타이머"[\s\S]*?item\.category === studentFaqCategory/,
);
assert.match(appSource, /renderStudentFaqFilters\(\)/);
assert.match(appSource, /className: "student-faq-question"/);
assert.match(appSource, /"aria-expanded": String\(isOpen\)/);
assert.match(appSource, /question\.addEventListener\("click"/);
assert.match(appSource, /itemCard\.classList\.toggle\("open", nextOpen\)/);
assert.match(appSource, /className: "student-faq-answer"/);
assert.match(styleSource, /\.student-faq-item\s*\{[^}]*border-radius: 17px[^}]*background: #e9f0f2/);
assert.match(styleSource, /\.student-faq-filters\s*\{[^}]*flex-wrap: nowrap[^}]*margin: 0 0 14px[^}]*overflow-x: auto[^}]*touch-action: pan-x/);
assert.match(styleSource, /\.student-faq-filter\.active\s*\{[^}]*background: #dff2fb[^}]*color: #0f628f/);
assert.match(styleSource, /\.student-faq-contact-button\s*\{[^}]*background: #dff2fb[^}]*color: #0f628f/);
assert.match(styleSource, /\.student-faq-item\.open \.student-faq-toggle\s*\{[^}]*transform: rotate\(45deg\)/);
assert.match(styleSource, /\.student-faq-answer\s*\{[^}]*border-top: 1px solid #d3dfe3/);
assert.match(styleSource, /\.student-faq-answer\[hidden\]\s*\{ display: none; \}/);

console.log("student FAQ tests passed");
