const assert = require("node:assert/strict");
const fs = require("node:fs");

const appSource = fs.readFileSync("app.js", "utf8");
const sharedSource = fs.readFileSync("shared.js", "utf8");
const teacherSource = fs.readFileSync("teacher.js", "utf8");
const teacherHtml = fs.readFileSync("teacher.html", "utf8");
const styleSource = fs.readFileSync("styles.css", "utf8");
const authSource = fs.readFileSync("api/teacher-auth-utils.js", "utf8");

require("node:test")("dashboard failure stops render retries and leaves both admin dialogs usable", async () => {
  const vm = require("node:vm");
  const extract = (source, name) => {
    const match = source.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n}`));
    assert.ok(match, name);
    return match[0];
  };
  const nodes = [];
  const dialogs = [];
  let requests = 0;
  let retrySucceeds = false;
  const dashboard = { loading: false, loaded: false, error: "", data: null };
  const context = vm.createContext({
    studyCafeAdminState: dashboard,
    currentRoute: "study-cafe-admin",
    teacherAuth: { user: { username: "admin" } },
    isTeacherAdmin: () => true,
    hasTeacherPermission: () => true,
    ensureStudyCafeAdminRefresh() {},
    renderStudyCafeVisibilitySettingsPanel: () => null,
    renderDataLoadingState: () => null,
    console: { error() {} },
    AbortSignal,
    el(tag, props = {}, children = []) {
      const node = { tag, ...props, children, isConnected: true,
        append(...items) { this.children = items; },
        appendChild(item) { this.children.push(item); },
        replaceChildren(...items) { this.children = items; },
        setAttribute() {},
        addEventListener(type, listener) { this[type] = listener; },
      };
      nodes.push(node);
      return node;
    },
    openInfoModal(options) { dialogs.push(options); },
    async fetch(url, options) {
      const action = JSON.parse(options.body).action;
      if (action === "dashboard") {
        requests++;
        // Bound the pre-fix failure loop so the regression test can report it.
        if (requests > 3) return new Promise(() => {});
        return { ok: retrySucceeds, json: async () => retrySucceeds
          ? { ok: true } : { ok: false, error: "unsupported_local_action" } };
      }
      return { ok: true, json: async () => ({ ok: true, items: [], bots: [] }) };
    },
  });
  vm.runInContext([
    extract(sharedSource, "button"),
    ...["requestStudyCafeAdminDashboard", "loadStudyCafeAdminDashboard", "renderStudyCafeAdmin", "renderStudyCafeFeedbackAdminEntry"].map(name => extract(teacherSource, name)),
    fs.readFileSync("feedback-hub.js", "utf8"),
    fs.readFileSync("study-cafe-bot-admin.js", "utf8"),
    "function render() { renderStudyCafeAdmin(); }",
  ].join("\n"), context);
  context.render();
  for (let i = 0; i < 40; i++) await Promise.resolve();
  assert.equal(requests, 1, "a failed dashboard must not automatically request again on render");
  assert.equal(dashboard.loading, false);
  assert.ok(dashboard.error);
  const click = label => {
    const node = nodes.findLast(n => n.tag === "button" && n.children === label);
    assert.ok(node, label);
    return node.click();
  };
  click("의견 · 새 기능 관리");
  click("봇 관리 열기");
  for (let i = 0; i < 40; i++) await Promise.resolve();
  assert.deepEqual(dialogs.map(dialog => dialog.title), ["의견 · 새 기능 관리", "스터디카페 봇 관리"]);
  assert.equal(requests, 1, "opening dialogs must not restart dashboard requests");
  retrySucceeds = true;
  // The successful dashboard layout is covered separately; retain the real retry button.
  context.render = () => context.requestStudyCafeAdminDashboard();
  await click("다시 불러오기");
  assert.equal(requests, 2, "explicit retry remains available");
  assert.equal(dashboard.loaded, true);
  assert.equal(dashboard.error, "");
});

assert.match(teacherHtml, /data-route="study-cafe-admin">온라인 스터디카페/);
assert.match(teacherHtml, /data-route="study-cafe-history">순공시간 조회/);
assert.match(appSource, /"study-cafe-admin": "온라인 스터디카페"/);
assert.match(appSource, /"study-cafe-history": "순공시간 조회"/);
assert.match(appSource, /"study-cafe-admin": renderStudyCafeAdmin/);
assert.match(appSource, /"study-cafe-history": renderStudyCafeAdminHistoryPage/);
assert.match(appSource, /hasTeacherPermission\("study_cafe\.read"\) \? moduleCard\("온라인 스터디카페"/);
assert.match(sharedSource, /"study-cafe-admin": "study_cafe\.read"/);
assert.match(sharedSource, /"study-cafe-history": "study_cafe\.read"/);
const managerPermissions = authSource.match(/const STUDENT_MANAGER_PERMISSIONS = \[([\s\S]*?)\];/)?.[1] || "";
assert.doesNotMatch(managerPermissions, /study_cafe\.(?:read|write)/);
assert.match(teacherSource, /function renderStudyCafeAdmin\(\)/);
assert.match(teacherSource, /fetch\("\/api\/study-cafe-admin"/);
assert.match(teacherSource, /renderStudyCafeAdminActionButton\("타이머 종료", "mini-btn", "stop_session", member\)/);
assert.match(teacherSource, /renderStudyCafeAdminActionButton\("좌석 비우기", "mini-btn danger", "release_seat", member\)/);
assert.match(teacherSource, /function renderStudyCafeAdminActionButton\(label, className, action, member\)/);
assert.match(teacherSource, /active_session_not_found/);
assert.match(teacherSource, /seat_not_found/);
assert.match(teacherSource, /studyCafeAdminState\.refreshTimer = window\.setInterval/);
assert.match(teacherSource, /STUDY_CAFE_ADMIN_SAFETY_REFRESH_INTERVAL_MS = 60 \* 1000/);
assert.match(teacherSource, /document\.visibilityState !== "hidden"/);
assert.match(teacherSource, /document\.addEventListener\("visibilitychange", refreshWhenActive\)/);
assert.match(teacherSource, /\.on\("broadcast", \{ event: "state-changed" \}, scheduleStudyCafeAdminRealtimeRefresh\)/);
assert.match(teacherSource, /\.on\("broadcast", \{ event: "room-changed" \}, scheduleStudyCafeAdminRealtimeRefresh\)/);
assert.doesNotMatch(teacherSource, /\["랭킹 열람실", "A 열람실", "B 열람실", "C 열람실"\]/);
assert.match(teacherSource, /ariaLabel: "스터디카페 열람실 선택"/);
assert.match(teacherSource, /activeRoomIndex: 0/);
assert.match(teacherSource, /STUDY_CAFE_ROOMS\.length - 1/);
assert.match(teacherSource, /STUDY_CAFE_ROOMS\.map\(\(room, roomIndex\)/);
assert.match(teacherSource, /room\.endSeat - room\.startSeat \+ 1/);
assert.match(teacherSource, /className: "study-cafe-admin-room-tabs"/);
assert.match(teacherSource, /function buildStudyCafeAdminPublicRoomEntries\(roomIndex, members\)/);
assert.match(teacherSource, /rankedMembers = \[\.\.\.roomMembers\]\.sort\(sortStudyCafeAdminRankingMembers\)/);
assert.match(teacherSource, /Number\(right\.todaySeconds\)[\s\S]*?Number\(left\.seatNumber\) - Number\(right\.seatNumber\)/);
assert.match(teacherSource, /displaySeatLabel: String\(index \+ 1\)/);
assert.match(teacherSource, /data-study-cafe-physical-seat-number/);
assert.match(teacherSource, /return rank \? `\$\{room\.label\} \$\{rank\}위` : room\.label/);
assert.match(teacherSource, /지원 종료 좌석/);
assert.match(teacherSource, /renderStudyCafeAdminStat\("좌석 배정"/);
assert.match(teacherSource, /summary\.connectedSeatedCount/);
assert.match(teacherSource, /summary\.disconnectedSeatedCount/);
assert.match(teacherSource, /function renderStudyCafeAdminPrivateRooms\(rooms, members, canWrite\)/);
assert.match(teacherSource, /activePrivateRoomId: ""/);
assert.match(teacherSource, /className: "study-cafe-admin-private-room-tabs"/);
assert.match(teacherSource, /formatStudyCafeAdminMemberLocation\(member\)/);
assert.match(teacherSource, /role: "tablist"/);
assert.match(teacherSource, /role: "tabpanel"/);
assert.match(styleSource, /\.study-cafe-admin-seat-grid\s*\{[^}]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
assert.match(styleSource, /\.study-cafe-admin-seat-grid/);
assert.match(styleSource, /\.study-cafe-admin-room-tabs/);
assert.match(styleSource, /\.study-cafe-admin-room-tab\.active/);
assert.match(styleSource, /\.study-cafe-admin-private-room-tabs/);
assert.match(styleSource, /\.study-cafe-admin-seat-grid\.private/);
assert.match(styleSource, /\.study-cafe-admin-member-list/);
assert.match(styleSource, /\.study-cafe-admin-status\.running/);
assert.match(teacherSource, /function renderStudyCafeAdminHistory\(\)/);
assert.match(teacherSource, /function renderStudyCafeAdminHistoryPage\(\)/);
assert.match(teacherSource, /currentRoute === "study-cafe-history"/);
const studyCafeDashboardRenderer = teacherSource.match(/function renderStudyCafeAdmin\(\) \{([\s\S]*?)\n\}/)?.[1] || "";
assert.doesNotMatch(studyCafeDashboardRenderer, /requestStudyCafeAdminHistory|renderStudyCafeAdminHistory/);
assert.match(teacherSource, /action: "history"/);
assert.match(teacherSource, /const startDate = history\.startDate/);
assert.match(teacherSource, /const endDate = history\.endDate/);
assert.match(teacherSource, /function renderStudyCafeAdminHistoryDetail\(student\)/);
assert.match(teacherSource, /students\.flatMap\(\(student\) =>/);
assert.match(teacherSource, /className: "study-cafe-admin-history-inline-detail"/);
assert.doesNotMatch(teacherSource, /selectedStudent \? renderStudyCafeAdminHistorySelection\(selectedStudent\) : null/);
assert.match(teacherSource, /formatStudyCafeAdminHistoryTime\(session\.startedAt\)/);
assert.match(teacherSource, /formatStudyCafeAdminHistoryEnd\(session, day\.date\)/);
assert.match(teacherSource, /action: "history_detail"/);
assert.match(teacherSource, /function loadStudyCafeAdminHistoryDetail\(student\)/);
assert.match(teacherSource, /history\.data = null/);
assert.match(teacherSource, /history\.loaded = true/);
assert.match(teacherSource, /await resetStudyCafeAdminStateAfterLogout\(\)/);
assert.match(teacherSource, /function resetStudyCafeAdminStateAfterLogout\(\)/);
assert.match(teacherSource, /teacherAuth\.authenticated && currentRoute === "study-cafe-admin"/);
assert.match(teacherSource, /function downloadStudyCafeAdminHistoryWorkbook\(\)/);
assert.match(teacherSource, /return String\(value \|\| ""\)\.trim\(\) \|\| "미등록"/);
assert.match(teacherSource, /createStudentCohortWorkbookBlob\("순공시간 조회", rows\)/);
assert.match(styleSource, /\.study-cafe-admin-history-filters/);
assert.match(styleSource, /\.study-cafe-admin-history-row/);
assert.match(styleSource, /\.study-cafe-admin-history-inline-detail/);
assert.match(styleSource, /\.study-cafe-admin-history-detail/);

console.log("study-cafe-admin-ui tests passed");
