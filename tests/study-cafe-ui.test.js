const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
const indexSource = fs.readFileSync(path.join(root, "index.html"), "utf8");
const styleSource = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const sharedSource = fs.readFileSync(path.join(root, "shared.js"), "utf8");

assert.match(appSource, /"study-todo": \(\) => requireStudentAuth\(renderStudentStudyTodo\)/);
assert.match(appSource, /"study-cafe": \(\) => requireStudentAuth\(renderStudentStudyCafe\)/);
assert.match(appSource, /"study-timer": \(\) => requireStudentAuth\(renderStudentStudyTimer\)/);
assert.match(appSource, /"study-ranking": \(\) => requireStudentAuth\(renderStudentStudyRanking\)/);
assert.match(appSource, /"study-character": \(\) => requireStudentAuth\(renderStudentStudyCharacter\)/);
assert.match(appSource, /fetch\("\/api\/study-cafe"/);
assert.match(appSource, /function ensureStudyCafeRemoteLoaded\(options = \{\}\)/);
assert.match(appSource, /if \(isStudyCafeLocalPreview\(\)\) return \{ ok: true, localOnly: true \}/);
assert.match(appSource, /return \{ ok: false, error: studyCafeRemoteState\.error \|\| "study_cafe_unavailable" \}/);
assert.match(appSource, /function hydrateStudyCafeSnapshot\(snapshot, options = \{\}\)/);
assert.match(
  appSource,
  /sessionRevisionAtRequest !== studyCafeSessionRevision[\s\S]*?preserveLocalSession/
);
assert.match(
  appSource,
  /if \(!options\.preserveLocalSession\) \{[\s\S]*?studyCafePreviewState\.running = active\?\.status === "running"[\s\S]*?studyCafePreviewState\.paused = active\?\.status === "paused"/
);
assert.match(
  appSource,
  /if \(!options\.preserveLocalSession\) \{\s*studyCafePreviewState\.subjectElapsedMs = totals;\s*\}/
);
assert.match(appSource, /mutateStudyCafeRemote\("claim_seat"/);
assert.match(
  sharedSource,
  /function closeInfoModal\(\) \{[\s\S]*?document\.querySelectorAll\("\.info-modal"\)\.forEach[\s\S]*?document\.activeElement\.blur\(\)[\s\S]*?modal\.remove\(\)/
);
assert.match(
  appSource,
  /if \(studyCafePreviewState\.selectedSeatId\) \{[\s\S]*?openStudyCafeSeatMoveModal\(seat\.id, seatNumber, \{[\s\S]*?preserveStudy: Boolean\(studyCafePreviewState\.subject\)/
);
assert.match(appSource, /"좌석을 변경하시겠어요\?"/);
assert.match(appSource, /function openStudyCafeSeatMoveModal\(seatId, seatNumber, options = \{\}\)/);
assert.match(appSource, /const preserveStudy = options\.preserveStudy === true/);
assert.match(appSource, /claimStudyCafeSeat\(seatNumber, \{ preserveStudy \}\)/);
assert.match(styleSource, /\.study-cafe-seat-move-actions/);
assert.match(
  appSource,
  /openStudyCafeSubjectModal\(seat\.id, student, \{[\s\S]*?beforeSelect: async \(\) => \{[\s\S]*?claimStudyCafeSeat\(seatNumber\)/
);
assert.match(appSource, /optionButton\.textContent = "좌석 확인 중…"/);
assert.match(styleSource, /\.study-cafe-seat\.empty\.loading/);
assert.match(appSource, /mutateStudyCafeRemote\("timer_pause", \{\}, \{ refresh: false \}\)/);
assert.match(appSource, /mutateStudyCafeRemote\("timer_stop", \{\}, \{ refresh: false \}\)/);
assert.match(appSource, /function renderStudyCafeFloatingActions\(student\)/);
assert.match(appSource, /className: "study-cafe-floating-menu-button"/);
assert.match(appSource, /className: "study-cafe-floating-action-menu"/);
assert.match(appSource, /ariaLabel: "공부 메뉴 열기"/);
assert.match(styleSource, /\.study-cafe-floating-controls/);
assert.match(styleSource, /\.study-cafe-floating-menu-button/);
assert.match(styleSource, /\.study-cafe-floating-action-menu/);
assert.doesNotMatch(
  styleSource,
  /\.study-cafe-floating-controls\.open \.study-cafe-floating-menu-button\s*\{[^}]*rotate\(90deg\)/
);
assert.match(
  styleSource,
  /@media \(min-width: 768px\)[\s\S]*?\.study-cafe-my-seat-subject-button\s*\{[^}]*width: auto[^}]*min-width: 136px/
);
assert.match(
  styleSource,
  /@media \(min-width: 768px\)[\s\S]*?\.study-cafe-floating-menu-button\s*\{[^}]*min-width: 112px[^}]*display: inline-flex/
);
assert.match(
  styleSource,
  /@media \(min-width: 1200px\)[\s\S]*?\.study-cafe-floating-menu-button\s*\{[^}]*bottom: calc\(var\(--student-footer-bottom\) \+ 15px\)/
);
assert.match(appSource, /mutateStudyCafeRemote\("release_seat", \{\}, \{ refresh: false \}\)/);
assert.match(appSource, /mutateStudyCafeRemote\("save_subjects"/);
assert.match(appSource, /mutateStudyCafeRemote\("save_profile"/);
assert.match(appSource, /mutateStudyCafeRemote\(\s*"todo_create"/);
assert.match(
  appSource,
  /const optimisticTodo = \{[\s\S]*?pending: true[\s\S]*?setStudyTodosForDate\([\s\S]*?renderStudyCafeStateUpdate\(\)[\s\S]*?await mutateStudyCafeRemote\([\s\S]*?"todo_create"[\s\S]*?\{ refresh: false \}/
);
assert.match(
  appSource,
  /if \(!result\.ok\) \{[\s\S]*?todo\.id !== optimisticTodo\.id[\s\S]*?renderStudyCafeStateUpdate\(\)/
);
assert.doesNotMatch(appSource, /notify\(`\$\{subject\} 할 일을 추가했습니다\.`\)/);
assert.match(appSource, /disabled: todo\.pending === true/);
assert.match(styleSource, /\.study-todo-item\.pending/);
assert.match(appSource, /mutateStudyCafeRemote\(\s*"todo_toggle"/);
assert.match(
  appSource,
  /async function updateStudyTodoCompletion\(todo, checkbox\)[\s\S]*?const previousCompleted = Boolean\(todo\.completed\)[\s\S]*?studyTodoTogglePendingIds\.add\(todo\.id\)[\s\S]*?setStudyTodosForDate\([\s\S]*?renderStudyCafeStateUpdate\(\)[\s\S]*?await mutateStudyCafeRemote\([\s\S]*?"todo_toggle"[\s\S]*?\{ refresh: false \}/
);
assert.match(
  appSource,
  /if \(!result\.ok\) \{[\s\S]*?completed: previousCompleted[\s\S]*?renderStudyCafeStateUpdate\(\)/
);
assert.match(appSource, /mutateStudyCafeRemote\(\s*"todo_delete"/);
assert.match(
  appSource,
  /if \(!confirm\(`"\$\{todo\.content\}" 항목을 삭제할까요\?`\)\) return;[\s\S]*?previousIndex[\s\S]*?renderStudyCafeStateUpdate\(\)[\s\S]*?await mutateStudyCafeRemote\([\s\S]*?"todo_delete"[\s\S]*?\{ refresh: false \}[\s\S]*?if \(!result\.ok\)/
);
assert.match(
  appSource,
  /action !== "heartbeat" && options\.refresh !== false/
);
assert.match(appSource, /studyCafeRemoteState\.refreshTimer = window\.setInterval/);
assert.match(appSource, /studyCafeRemoteState\.heartbeatTimer = window\.setInterval/);
assert.match(appSource, /const STUDY_CAFE_SAFETY_REFRESH_INTERVAL_MS = 2 \* 60 \* 1000/);
assert.match(
  appSource,
  /function requestStudyCafeRemoteRefresh\(\s*delay = STUDY_CAFE_ACTION_REFRESH_DELAY_MS,\s*options = \{\}/
);
assert.match(
  appSource,
  /requestStudyCafeRemoteRefresh\(180, \{\s*retryWhenLoading: false,\s*maxAgeMs: 5000/
);
assert.match(appSource, /Date\.now\(\) - studyCafeRemoteState\.lastLoadedAt < maxAgeMs/);
assert.match(appSource, /if \(options\.retryWhenLoading !== false\)/);
assert.match(appSource, /result\.ok && action !== "heartbeat"/);
assert.match(appSource, /result\.error === "seat_taken"/);
assert.match(appSource, /document\.addEventListener\("visibilitychange", refreshWhenActive\)/);
assert.match(appSource, /window\.addEventListener\("focus", refreshWhenActive\)/);
assert.match(appSource, /window\.addEventListener\("pageshow", refreshWhenActive\)/);
assert.match(appSource, /\}, STUDY_CAFE_SAFETY_REFRESH_INTERVAL_MS\)/);
assert.doesNotMatch(
  appSource,
  /studyCafeRemoteState\.refreshTimer = window\.setInterval\([\s\S]*?\}, 15000\)/
);
assert.match(appSource, /String\(student\?\.id \|\| ""\)\.trim\(\)\.startsWith\("2"\)/);
assert.match(appSource, /onlineMode \? renderStudyCafeHomeCard\(student\) : null/);
assert.match(appSource, /onlineMode \? null : renderStudentImportantNoticeCard\(\)/);
assert.match(appSource, /function getStudyCafeFocusedCount\(\)/);
assert.match(appSource, /function updateStudyCafeHomeLiveCount\(\)/);
assert.match(appSource, /data-study-cafe-home-live-count/);
assert.match(appSource, /const focusedCount = getStudyCafeFocusedCount\(\)/);
assert.doesNotMatch(appSource, /현재 5명이 함께 공부하고 있어요/);
assert.match(appSource, /button\("스터디카페 보기", "btn", "button", \(\) => navigate\("study-cafe"\)\)/);
assert.doesNotMatch(appSource, /seated \? "공부방 보기" : "스터디카페 보기"/);
assert.match(appSource, /new URLSearchParams\(location\.search\)\.get\("studentMode"\) === "online"/);
assert.match(appSource, /if \(onlineMode && \["student", "student-verify", "student-return", "student-done", "attendance"\]\.includes\(normalized\)\) return "home"/);
assert.match(appSource, /if \(!onlineMode && \["study-todo", "study-cafe", "study-timer", "study-ranking", "study-character"\]\.includes\(normalized\)\) return "home"/);
assert.match(appSource, /document\.body\.classList\.toggle\("student-online-mode", onlineMode\)/);
assert.match(appSource, /document\.body\.classList\.toggle\("student-study-mode", studyMode\)/);
assert.match(indexSource, /class="student-footer-menu study-cafe-footer-menu"/);
assert.match(
  indexSource,
  /study-cafe-footer-menu[\s\S]*?data-study-cafe-back[\s\S]*?data-route="study-todo"[\s\S]*?data-route="study-cafe"/,
  "back should remain before the study footer routes"
);
assert.match(indexSource, /footer-icon-study-back/);
assert.match(indexSource, /footer-icon-home/);
assert.match(indexSource, /window\.__studentStudyBack/);
assert.match(indexSource, /data-study-cafe-back aria-label="학생 홈으로 나가기"/);
assert.match(
  indexSource,
  /window\.__studentStudyBack = function \(\) \{\s*navFallback\("home"\);\s*\}/
);
assert.doesNotMatch(indexSource, /window\.__studentStudyBack[\s\S]*?window\.history\.back\(\)/);
const studyFooterSource = indexSource.match(
  /<footer class="student-footer-menu study-cafe-footer-menu"[\s\S]*?<\/footer>/
)?.[0] || "";
assert.doesNotMatch(studyFooterSource, /data-route="home"/);
assert.doesNotMatch(indexSource, /student-header-identity/);
assert.doesNotMatch(indexSource, /data-student-header-name/);
assert.doesNotMatch(indexSource, /data-student-header-track/);
assert.doesNotMatch(appSource, /function updateStudentHeaderIdentity\(\)/);
assert.doesNotMatch(styleSource, /\.student-header-identity/);
assert.match(indexSource, /study-cafe-footer-menu" aria-label="스터디카페 메뉴" aria-hidden="true"/);
assert.match(indexSource, /data-route="study-cafe"[\s\S]*<span>스터디카페<\/span>/);
assert.match(appSource, /function openStudyCafeSubjectModal\(seatId, student, options = \{\}\)/);
assert.match(appSource, /preserveTimer = options\.preserveTimer === true/);
assert.match(
  appSource,
  /preserveTimer\s*\?\s*button\(\s*"과목 공부 종료",\s*"study-cafe-subject-stop-button"[\s\S]*?stopStudyCafePreviewTimer\(\{ closeModalOnSuccess: true \}\)/
);
assert.match(
  appSource,
  /async function stopStudyCafePreviewTimer\(options = \{\}\)[\s\S]*?const previousTimerState = \{[\s\S]*?renderStudyCafeStateUpdate\(\)[\s\S]*?mutateStudyCafeRemote\("timer_stop", \{\}, \{ refresh: false \}\)[\s\S]*?Object\.assign\(studyCafePreviewState, previousTimerState\)[\s\S]*?if \(options\.closeModalOnSuccess === true\) closeInfoModal\(\)/
);
assert.match(
  appSource,
  /async function releaseStudyCafeSeat\(options = \{\}\)[\s\S]*?const previousSeatState = \{[\s\S]*?studyCafePreviewState\.selectedSeatId = ""[\s\S]*?render\(\)[\s\S]*?mutateStudyCafeRemote\("release_seat", \{\}, \{ refresh: false \}\)[\s\S]*?Object\.assign\(studyCafePreviewState, previousSeatState\)/
);
assert.match(styleSource, /\.study-cafe-subject-stop-button/);
assert.match(appSource, /const STUDY_CAFE_IDLE_WARNING_MS = 15 \* 60 \* 1000/);
assert.match(appSource, /const STUDY_CAFE_IDLE_COUNTDOWN_SECONDS = 10/);
assert.match(appSource, /function checkStudyCafeIdleSeat\(\)/);
assert.match(appSource, /function openStudyCafeIdleWarning\(\)/);
assert.match(appSource, /mutateStudyCafeRemote\("keep_seat"\)/);
assert.match(
  appSource,
  /releaseStudyCafeSeat\(\{ skipConfirm: true, autoRelease: true \}\)/
);
assert.match(styleSource, /\.study-cafe-idle-warning-modal/);
assert.match(styleSource, /\.study-cafe-idle-countdown/);
assert.match(appSource, /function startStudyCafeCountdown\(seatId, subject\)/);
assert.match(appSource, /function renderStudyCafeStateUpdate\(\)/);
assert.match(appSource, /\.classList\.add\("study-view-static"\)/);
assert.match(appSource, /function handleRouteHistoryChange\(\)/);
assert.match(appSource, /if \(button\.matches\("a"\)\) event\.preventDefault\(\)/);
assert.doesNotMatch(indexSource, /onclick="window\.__studentNav/);
assert.match(
  appSource,
  /function handleRouteHistoryChange\(\)[\s\S]*?if \(nextRoute === currentRoute\) return;[\s\S]*?currentRoute = nextRoute;[\s\S]*?render\(\)/
);
assert.match(appSource, /addEventListener\("hashchange", handleRouteHistoryChange\)/);
assert.match(appSource, /addEventListener\("popstate", handleRouteHistoryChange\)/);
assert.match(appSource, /let remaining = 3/);
assert.match(appSource, /studyCafeCountdownInterval = window\.setInterval/);
assert.doesNotMatch(appSource, /number\.textContent = "저장 중"/);
assert.match(appSource, /function cancelStudyCafeCountdown\(\)/);
assert.match(
  appSource,
  /async function toggleStudyCafePreviewTimer\(\)[\s\S]*?if \(!confirm\("공부 타이머를 일시정지할까요\?"\)\) return;[\s\S]*?beginStudyCafeLocalSessionMutation\(\)[\s\S]*?const pausedElapsedMs = getStudyCafeElapsedMs\(\)[\s\S]*?studyCafePreviewState\.running = false[\s\S]*?renderStudyCafeStateUpdate\(\)[\s\S]*?await mutateStudyCafeRemote\("timer_pause", \{\}, \{ refresh: false \}\)/
);
assert.match(
  appSource,
  /if \(!result\?\.ok\) \{[\s\S]*?Object\.assign\(studyCafePreviewState, previousTimerState\)[\s\S]*?renderStudyCafeStateUpdate\(\)/
);
assert.match(
  appSource,
  /\} else if \(studyCafePreviewState\.paused\) \{[\s\S]*?beginStudyCafeTimer\([\s\S]*?studyCafePreviewState\.subject,[\s\S]*?true[\s\S]*?\);[\s\S]*?\} else \{[\s\S]*?startStudyCafeCountdown/
);
assert.match(appSource, /async function beginStudyCafeTimer\(seatId, subject, resumeExistingSession\)/);
assert.match(
  appSource,
  /const optimisticStartedAt = Date\.now\(\)[\s\S]*?studyCafePreviewState\.running = true[\s\S]*?clearStudyCafeIdleWarning\(\)[\s\S]*?renderStudyCafeStateUpdate\(\)[\s\S]*?await mutateStudyCafeRemote/
);
assert.match(appSource, /Object\.assign\(studyCafePreviewState, previousTimerState\)/);
assert.match(appSource, /if \(!isStudyCafeLocalPreview\(\)\) return \[\]/);
assert.match(
  appSource,
  /async function stopStudyCafePreviewTimer\(options = \{\}\)[\s\S]*?renderStudyCafeStateUpdate\(\)/
);
assert.match(styleSource, /\.study-cafe-countdown-overlay/);
assert.doesNotMatch(styleSource, /@keyframes study-countdown-tick/);
assert.doesNotMatch(styleSource, /\.study-cafe-countdown-number\.tick/);
assert.doesNotMatch(appSource, /void number\.offsetWidth/);
assert.doesNotMatch(
  styleSource,
  /\.study-cafe-countdown-overlay\s*\{[^}]*backdrop-filter/
);
assert.match(appSource, /현재 자리와 전체 공부시간은 유지되고/);
assert.match(appSource, /button\("과목 변경"/);
assert.match(appSource, /function renderStudentStudyRanking\(\)/);
assert.match(appSource, /requestStudyRankingPeriod\(studyRankingPreviewState\.period\)/);
assert.match(appSource, /async function requestStudyRankingPeriod\(period\)/);
assert.match(appSource, /requestStudyCafeAction\("ranking", \{ period \}\)/);
assert.doesNotMatch(
  appSource,
  /if \(!isStudyCafeLocalPreview\(\) && period !== "daily"\)[\s\S]*?periodButton\.disabled = true/
);
assert.match(appSource, /function renderStudentStudyCharacter\(\)/);
assert.match(appSource, /function renderStudentStudyTodo\(\)/);
assert.match(appSource, /function renderStudyTodoSubjectCard\(subject, todos\)/);
assert.match(appSource, /function renderStudyTodoItem\(todo\)/);
assert.match(appSource, /className: "study-todo-subject-copy"/);
assert.match(appSource, /className: "study-todo-subject-title"/);
assert.match(appSource, /function renderStudyTodoDateNavigation\(selectedDateKey\)/);
assert.match(appSource, /function selectStudyTodoDate\(studyDate\)/);
assert.match(appSource, /requestStudyCafeAction\("todos_load", \{ studyDate \}\)/);
assert.match(appSource, /getStudyTodoDateKeyByOffset\(-1, selectedDateKey\)/);
assert.match(appSource, /getStudyTodoDateKeyByOffset\(1, selectedDateKey\)/);
assert.match(appSource, /ariaLabel: "이전 날짜"/);
assert.match(appSource, /ariaLabel: "다음 날짜"/);
assert.doesNotMatch(appSource, /\{ offset: -1, label: "어제" \}/);
assert.match(appSource, /const subjects = getStudyTimerSubjects\(student\)/);
assert.match(appSource, /const subjectSet = new Set\(subjects\)/);
assert.match(appSource, /ariaLabel: `\$\{subject\} 할 일 \$\{editorOpen \? "입력 닫기" : "추가"\}`/);
assert.match(appSource, /className: "study-todo-add-button"[\s\S]*?type: "button"[\s\S]*?editorOpen \? "×" : "\+"/);
assert.match(appSource, /const studyTodoEditorState = \{[\s\S]*?dateKey: ""[\s\S]*?subject: ""[\s\S]*?draft: ""[\s\S]*?focused: false/);
assert.match(appSource, /className: "study-todo-add-form", hidden: !editorOpen/);
assert.match(
  appSource,
  /textInput\.addEventListener\("input"[\s\S]*?studyTodoEditorState\.draft = textInput\.value/
);
assert.match(
  appSource,
  /if \(editorOpen && studyTodoEditorState\.focused\)[\s\S]*?textInput\.focus\(\{ preventScroll: true \}\)/
);
assert.match(appSource, /const willOpen = form\.hidden/);
assert.match(appSource, /className: "study-todo-submit-button"/);
assert.match(appSource, /className: "study-todo-progress-card"/);
assert.match(styleSource, /\.student-study-todo-page/);
assert.match(styleSource, /\.study-todo-date-navigation/);
assert.match(styleSource, /\.study-todo-date-arrow/);
assert.match(styleSource, /\.study-todo-date-current/);
assert.match(styleSource, /\.study-todo-subject-card/);
assert.match(styleSource, /\.study-todo-subject-title\s*\{[^}]*display: flex[^}]*align-items: center/);
assert.match(styleSource, /\.study-todo-subject-actions\s*\{[^}]*display: flex/);
assert.doesNotMatch(styleSource, /\.study-todo-subject-head > div\s*\{/);
assert.match(styleSource, /\.study-todo-item\.completed/);
assert.match(styleSource, /\.study-todo-add-button\s*\{[^}]*border-radius: 50%/);
assert.match(styleSource, /\.study-todo-add-form\[hidden\]\s*\{[^}]*display: none/);
assert.match(appSource, /function openStudyCafeNicknameEditor\(\)/);
assert.match(appSource, /function normalizeStudyCafeNickname\(value\)/);
assert.match(appSource, /name: getStudyCafeDisplayName\("나"\)/);
assert.match(appSource, /"data-study-character-name": "true"/);
assert.match(appSource, /className: "study-character-name-edit-button"/);
assert.match(appSource, /onclick: openStudyCafeNicknameEditor/);
assert.doesNotMatch(appSource, /renderStudyCafeNicknameEditor\(\)/);
assert.match(appSource, /const STUDY_CAFE_TEMP_NICKNAME_MOODS = \[/);
assert.match(appSource, /const STUDY_CAFE_TEMP_NICKNAME_ANIMALS = \[/);
assert.doesNotMatch(appSource, /"코알라"/);
assert.match(appSource, /function ensureStudyCafeTemporaryNickname\(\)/);
assert.match(appSource, /function getStudyCafeDisplayName\(fallback = "나"\)/);
assert.match(appSource, /displayName: getStudyCafeDisplayName\("나"\)/);
assert.match(appSource, /temporaryNicknameAwaitingEntry = true/);
assert.doesNotMatch(appSource, /student\.id.*temporaryNickname/);
assert.match(appSource, /function updateStudyCafeCharacterSelection\(tone, label\)/);
assert.match(appSource, /studyCafePreviewState\.avatarTone = tone/);
assert.match(appSource, /"data-study-character-tone": option\.tone/);
assert.match(appSource, /previewAvatar\.classList\.remove\(\.\.\.availableTones\)/);
const characterSelectionSource = appSource.match(
  /function updateStudyCafeCharacterSelection\(tone, label\) \{[\s\S]*?\n\}/
)?.[0];
assert.ok(characterSelectionSource, "캐릭터 색상 부분 갱신 함수가 있어야 합니다.");
assert.doesNotMatch(characterSelectionSource, /\brender\(\)/);
assert.match(appSource, /function renderStudentStudyTimer\(\)/);
assert.match(appSource, /매일 오전 4시에 하루 기록이 새로 시작됩니다/);
assert.doesNotMatch(appSource, /오늘 과목별 기록 · 오전 4시 기준/);
assert.match(appSource, /function renderStudyTimerModeTabs\(\)/);
assert.match(appSource, /function renderStudyTimerStats\(\)/);
assert.match(appSource, /function formatStudyBusinessDateKey\(value = new Date\(\)\)/);
assert.match(appSource, /date\.getTime\(\) \+ 5 \* 60 \* 60 \* 1000/);
assert.match(appSource, /anchorDate: parseStudyTimerDateKey\(formatStudyBusinessDateKey\(new Date\(\)\)\)/);
assert.match(appSource, /function renderStudyTimerDailyOverview\(data\)/);
assert.match(appSource, /function renderStudyTimerWeeklyChart\(data\)/);
assert.match(appSource, /function renderStudyTimerMonthlyCalendar\(data\)/);
assert.match(appSource, /requestStudyCafeAction\("stats", range\)/);
assert.match(appSource, /studyTimerStatsState\.mode === "stats"/);
assert.match(appSource, /renderStudyTimerStatsPeriodButton\("daily", "일간"\)/);
assert.match(appSource, /renderStudyTimerStatsPeriodButton\("weekly", "주간"\)/);
assert.match(appSource, /renderStudyTimerStatsPeriodButton\("monthly", "월간"\)/);
assert.match(appSource, /function renderStudySubjectTimerRow\(subject, index, student\)/);
assert.match(appSource, /function renderStudyTimerTodoItem\(todo\)/);
assert.match(appSource, /function updateStudyTodoCompletion\(todo, checkbox\)/);
assert.match(
  appSource,
  /const todos = getStudyTodosForDate\(studyCafeRemoteState\.studyDateKey\)\s*\.filter\(\(todo\) => todo\.subject === subject\)/
);
assert.match(appSource, /className: "study-timer-subject-todos"/);
assert.match(styleSource, /\.study-timer-subject-todos/);
assert.match(styleSource, /\.study-timer-subject-todo\.completed span/);
assert.match(appSource, /button\("전체화면", "study-timer-fullscreen-button"/);
assert.match(appSource, /function openStudyTimerFullscreen\(\)/);
assert.match(appSource, /function closeStudyTimerFullscreen\(\)/);
assert.match(appSource, /function renderStudyTimerFullscreen\(student\)/);
assert.match(appSource, /timerFullscreen: false/);
assert.match(appSource, /ariaLabel: "타이머 전체화면 모드"/);
assert.match(appSource, /document\.querySelectorAll\("\[data-study-total-time\]"\)/);
assert.doesNotMatch(appSource, /button\("과목 편집", "study-subject-edit-button"/);
assert.match(appSource, /function openStudySubjectEditor\(student\)/);
assert.match(appSource, /`\$\{subjects\.length\}개 직렬 과목`/);
assert.match(
  appSource,
  /function getStudyTimerSubjects\(student\)[\s\S]*?getConfiguredWeeklySubjectsForTrack\(student\?\.track\)[\s\S]*?subject !== "기타"/
);
assert.match(
  appSource,
  /const recent = subjects\.includes\(studyCafePreviewState\.lastSubject\)[\s\S]*?\? studyCafePreviewState\.lastSubject[\s\S]*?: ""/
);
assert.doesNotMatch(
  appSource,
  /function getStudyTimerSubjects\(student\)\s*\{[\s\S]*?return \[\.\.\.studyCafePreviewState\.customSubjects\]/
);
assert.match(appSource, /customSubjects: null/);
assert.match(appSource, /과목은 최대 8개까지 등록할 수 있습니다\./);
assert.match(appSource, /같은 과목명은 한 번만 사용할 수 있습니다\./);
assert.match(appSource, /현재 측정 중인 과목은 종료 후 편집할 수 있습니다\./);
assert.match(appSource, /function getStudySubjectElapsedMs\(subject\)/);
assert.match(appSource, /function commitCurrentStudySubjectElapsed\(\)/);
assert.doesNotMatch(appSource, /function enterStudyCafePreview\(\)/);
assert.doesNotMatch(appSource, /function leaveStudyCafePreview\(\)/);
assert.doesNotMatch(appSource, /function renderStudyCafeEntrance\(\)/);
assert.doesNotMatch(appSource, /study-cafe-entry-card/);
assert.match(appSource, /studyCafePreviewState\.pendingSubject = subject/);
assert.match(appSource, /function renderStudyRankingPodiumCard\(member, rank\)/);
assert.match(appSource, /function renderStudyRankingRow\(member\)/);
assert.match(appSource, /className: "study-cafe-room-toolbar"/);
assert.match(appSource, /function renderStudyCafeMySeatCard\(student, seatNumber\)/);
assert.match(appSource, /function activateStudentFooterTapGuard\(\)/);
assert.match(appSource, /function activateStudentFooterRoute\(event\)/);
assert.match(
  appSource,
  /footer\.addEventListener\("pointerdown", \(event\) => \{[\s\S]*?activateStudentFooterRoute\(event\)/
);
assert.match(appSource, /studentFooterTapGuardTimer = window\.setTimeout\([\s\S]*?, 450\)/);
assert.match(styleSource, /body\.student-footer-tap-guard \.study-cafe-seat\s*\{[^}]*pointer-events: none/);
assert.match(appSource, /seated \? renderStudyCafeMySeatCard\(student, selectedSeatNumber\) : null/);
assert.doesNotMatch(appSource, /study-cafe-my-seat-badge/);
assert.doesNotMatch(styleSource, /\.study-cafe-my-seat-badge/);
assert.match(appSource, /function renderStudyCafeChairBack\(\)/);
assert.match(
  appSource,
  /className: "study-cafe-my-seat-character"[\s\S]*?className: "study-cafe-my-seat-scene"[\s\S]*?renderStudyCafeChairBack\(\)[\s\S]*?renderStudyCafeAvatar[\s\S]*?className: "study-cafe-desk"[\s\S]*?renderStudyCafeWritingArms\(\)/
);
assert.doesNotMatch(styleSource, /\.study-cafe-avatar\.is-mine::after/);
assert.match(
  appSource,
  /className: "study-cafe-member-seat-scene"[\s\S]*?renderStudyCafeChairBack\(\)[\s\S]*?renderStudyCafeAvatar/
);
assert.match(
  appSource,
  /active\s*\?\s*null\s*:\s*el\("div", \{ className: "study-cafe-my-seat-idle-buttons" \}/
);
assert.match(
  appSource,
  /"과목 선택",[\s\S]*?"study-cafe-my-seat-subject-button"[\s\S]*?"자리 비우기",[\s\S]*?"study-cafe-my-seat-release-button"/
);
assert.doesNotMatch(appSource, /button\("다른 과목 시작"/);
assert.ok(
  appSource.indexOf("className: `study-cafe-room theme-${activeRoom.theme}`") <
    appSource.indexOf("seated ? renderStudyCafeMySeatCard(student, selectedSeatNumber) : null") &&
    appSource.indexOf("seated ? renderStudyCafeMySeatCard(student, selectedSeatNumber) : null") <
      appSource.indexOf('className: "study-cafe-room-label-row"'),
  "the selected student's seat and character should render inside the study cafe room"
);
assert.match(styleSource, /\.study-cafe-my-seat-card/);
assert.match(styleSource, /\.study-cafe-room \.study-cafe-my-seat-card/);
assert.match(styleSource, /\.study-cafe-my-seat-card\s*\{[^}]*min-height: 124px/);
assert.match(
  styleSource,
  /@media \(max-width: 430px\)[\s\S]*?\.study-cafe-my-seat-card\s*\{[^}]*min-height: 112px[^}]*padding-block: 8px/
);
assert.match(
  styleSource,
  /\.study-cafe-my-seat-character\s*\{[^}]*min-height: 0[^}]*aspect-ratio: 1 \/ 1\.08[^}]*align-self: center/
);
assert.match(styleSource, /\.study-cafe-my-seat-title\s*\{[^}]*padding-right: 86px/);
assert.doesNotMatch(
  styleSource,
  /\.study-cafe-my-seat-copy > p,\s*\.study-cafe-my-seat-detail\s*\{[^}]*padding-right/
);
assert.match(styleSource, /\.study-cafe-my-seat-scene\s*\{[^}]*width: 100px[^}]*height: 122px[^}]*transform: scale\(0\.76\)/);
assert.match(
  styleSource,
  /\.study-cafe-room \.study-cafe-my-seat-card\s*\{[^}]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)[^}]*gap: 7px[^}]*margin: 10px 8px 2px[^}]*padding-inline: 0/
);
assert.match(
  styleSource,
  /\.study-cafe-room \.study-cafe-my-seat-character\s*\{[^}]*grid-column: 1[^}]*width: 100%[^}]*justify-self: stretch[^}]*place-items: center/
);
assert.match(
  styleSource,
  /\.study-cafe-room \.study-cafe-my-seat-scene\s*\{[^}]*margin-inline: auto[^}]*transform-origin: 50% 50%/
);
assert.match(
  styleSource,
  /\.study-cafe-room \.study-cafe-my-seat-copy\s*\{[^}]*grid-column: 2 \/ -1/
);
assert.match(
  styleSource,
  /@media \(max-width: 430px\)[\s\S]*?\.study-cafe-my-seat-scene\s*\{[^}]*transform: scale\(0\.62\)/
);
assert.match(
  styleSource,
  /\.study-cafe-my-seat-actions\s*\{[^}]*pointer-events: none/
);
assert.match(
  styleSource,
  /\.study-cafe-my-seat-fullscreen-button\s*\{[^}]*pointer-events: auto/
);
assert.match(styleSource, /\.study-cafe-chair-back\s*\{[^}]*z-index: 4[^}]*width: 31px[^}]*border-radius: 7px 7px 5px 5px/);
assert.match(styleSource, /\.study-cafe-chair-back::after/);
assert.doesNotMatch(styleSource, /\.study-cafe-my-seat-(?:character|scene) \.study-cafe-chair-back/);
assert.match(styleSource, /\.study-cafe-member-seat-scene \.study-cafe-chair-back/);
assert.match(styleSource, /\.study-cafe-my-seat-subject-button/);
assert.doesNotMatch(styleSource, /\.study-cafe-my-seat-subject-button\.change/);
assert.match(
  appSource,
  /active\s*\?\s*button\(\s*"⛶ 전체화면",\s*"study-cafe-my-seat-fullscreen-button",\s*"button",\s*openStudyTimerFullscreen/
);
assert.match(
  appSource,
  /function openStudyTimerFullscreen\(\)[\s\S]*?studyTimerStatsState\.mode = "timer"[\s\S]*?if \(currentRoute !== "study-timer"\)[\s\S]*?navigate\("study-timer"\)/
);
assert.match(styleSource, /\.study-cafe-my-seat-fullscreen-button/);
assert.match(
  appSource,
  /className: "study-cafe-my-seat-actions"[\s\S]*?study-cafe-my-seat-fullscreen-button[\s\S]*?data-study-member-time/
);
assert.match(
  styleSource,
  /\.study-cafe-my-seat-actions\s*\{[^}]*flex-direction: column[^}]*align-items: flex-end[^}]*justify-content: space-between/
);
assert.match(
  styleSource,
  /@media \(max-width: 430px\)[\s\S]*?\.study-cafe-my-seat-actions\s*\{[^}]*top: 11px[^}]*right: 14px[^}]*bottom: 11px/
);
assert.match(appSource, /el\("strong", \{\}, "RONPARK STUDYCAFE"\)/);
assert.match(appSource, /className: `study-cafe-room theme-\$\{activeRoom\.theme\}`/);
assert.match(appSource, /ariaLabel: `\$\{activeRoom\.label\} \$\{activeRoom\.mood\} 좌석 배치`/);
assert.match(appSource, /theme: "oak", label: "A룸", mood: "따뜻한 우드톤"/);
assert.match(appSource, /theme: "dawn", label: "B룸", mood: "밝고 차분한 톤"/);
assert.match(appSource, /theme: "forest", label: "C룸", mood: "편안한 그린톤"/);
assert.match(appSource, /theme: "night", label: "D룸", mood: "차분한 딥블루톤"/);
assert.match(appSource, /STUDY_CAFE_ROOM_THEMES\.slice\(0, 4\)/);
assert.match(styleSource, /\.study-cafe-room\.theme-dawn/);
assert.match(styleSource, /\.study-cafe-room\.theme-forest/);
assert.match(styleSource, /\.study-cafe-room\.theme-classic/);
assert.match(styleSource, /\.study-cafe-room\.theme-night/);
assert.match(
  styleSource,
  /\.study-cafe-room \.study-cafe-seat\.mine\s*\{[^}]*var\(--room-accent-soft\)[^}]*var\(--room-accent\)/
);
assert.match(
  styleSource,
  /\.study-cafe-room \.study-cafe-desk\s*\{[^}]*var\(--room-desk\)[^}]*var\(--room-desk-top\)[^}]*var\(--room-desk-edge\)/
);
assert.match(
  styleSource,
  /\.study-cafe-room \.study-cafe-chair-back\s*\{[^}]*var\(--room-chair-border\)[^}]*var\(--room-chair-top\)[^}]*var\(--room-chair-bottom\)/
);
assert.doesNotMatch(appSource, /renderStudyCafeActiveTimer/);
assert.doesNotMatch(styleSource, /\.study-cafe-active-timer/);
assert.doesNotMatch(appSource, /스터디카페 퇴실하기/);
assert.match(appSource, /과목 공부를 종료했습니다\. 현재 좌석은 그대로 유지됩니다\./);
assert.match(appSource, /"자리 비우기",[\s\S]*?"study-cafe-my-seat-release-button"/);
assert.doesNotMatch(
  appSource,
  /button\("다른 과목 시작", "btn", "button", \(\) => navigate\("study-timer"\)\)/
);
assert.match(appSource, /function releaseStudyCafeSeat\(options = \{\}\)/);
assert.doesNotMatch(
  appSource,
  /function stopStudyCafePreviewTimer\(options = \{\}\)\s*\{[^}]*studyCafePreviewState\.selectedSeatId = ""/
);
assert.doesNotMatch(appSource, /study-cafe-room-links/);
assert.doesNotMatch(appSource, /study-timer-header-button/);
assert.doesNotMatch(appSource, /study-ranking-header-button/);
assert.doesNotMatch(
  appSource,
  /function renderStudentStudyTimer\(\)[\s\S]*?button\("‹ 카페", "study-cafe-back-button"/
);
assert.match(
  styleSource,
  /\.study-timer-page-head\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\) auto/
);
assert.doesNotMatch(
  appSource,
  /function renderStudentStudyRanking\(\)[\s\S]*?button\("‹ 카페", "study-cafe-back-button"/
);
assert.match(
  styleSource,
  /\.study-ranking-page-head\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\) auto/
);
assert.match(appSource, /론박 온라인 스터디카페/);
assert.doesNotMatch(appSource, /study-ranking-teaser/);
assert.doesNotMatch(appSource, /study-cafe-room-wall/);
assert.match(appSource, /getConfiguredWeeklySubjectsForTrack\(student\?\.track\)/);
assert.match(appSource, /data-study-cafe-clock/);
assert.match(appSource, /data-study-member-time/);
assert.match(appSource, /function formatStudyCafeMemberTime\(seconds\)/);
assert.doesNotMatch(appSource, /study-cafe-subject-bubble/);
assert.doesNotMatch(styleSource, /\.study-cafe-subject-bubble/);
assert.doesNotMatch(appSource, /occupant: \{ name: "[^"]+", subject:/);
assert.match(appSource, /RONPARK ONLINE/);
assert.doesNotMatch(appSource, /RONBAK/i);
assert.match(indexSource, /"study-cafe": "온라인 스터디카페"/);
assert.match(styleSource, /\.study-cafe-seat-grid/);
assert.match(
  styleSource,
  /\.study-cafe-seat-grid\s*\{[^}]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/,
  "student study cafe seats should use a dense four-column layout"
);
assert.match(
  styleSource,
  /@media \(min-width: 768px\)[\s\S]*?\.study-cafe-seat-grid\s*\{[^}]*grid-template-columns: repeat\(6, minmax\(0, 1fr\)\)/
);
assert.match(
  styleSource,
  /@media \(min-width: 1200px\)[\s\S]*?\.study-cafe-seat-grid\s*\{[^}]*grid-template-columns: repeat\(8, minmax\(0, 1fr\)\)/
);
assert.match(
  styleSource,
  /@media \(min-width: 768px\)[\s\S]*?\.study-todo-subject-list\s*\{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/
);
assert.match(
  styleSource,
  /body\.student-study-mode \.brand,\s*body\.student-study-mode \.main-shell\s*\{[^}]*width: min\(1120px, calc\(100% - 64px\)\)/
);
assert.match(styleSource, /\.study-cafe-room-tabs/);
assert.match(styleSource, /\.study-cafe-room-tabs\s*\{[^}]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
assert.match(styleSource, /\.study-cafe-room-tab\.active/);
assert.match(appSource, /className: "study-cafe-seat-number"/);
assert.match(
  appSource,
  /studyCafeRemoteState\.available === true\s*\?\s*remoteOccupant && !remoteOccupant\.isMine/
);
assert.match(appSource, /`\$\{selectedSeatNumber\}번 좌석에서 집중 중`/);
assert.match(appSource, /const STUDY_CAFE_ROOM_SIZE = 48/);
assert.match(appSource, /const STUDY_CAFE_SEAT_COUNT = 192/);
assert.match(appSource, /label: "A룸"/);
assert.match(appSource, /label: "B룸"/);
assert.match(appSource, /label: "C룸"/);
assert.match(appSource, /label: "D룸"/);
assert.match(appSource, /Array\.from\(\{ length: STUDY_CAFE_SEAT_COUNT \}/);
assert.match(appSource, /function renderStudyCafeRoomTabs\(student\)/);
assert.match(appSource, /function selectStudyCafeRoom\(roomIndex, student\)/);
assert.match(appSource, /visibleSeats\.map\(\(seat, index\) =>/);
assert.match(appSource, /className: "study-cafe-seat-name"/);
assert.match(appSource, /function openStudyCafeMemberModal\(occupant, seatNumber\)/);
assert.match(appSource, /className: "study-cafe-member-modal"/);
assert.match(appSource, /className: "study-cafe-member-avatar-stage"/);
assert.match(appSource, /className: "study-cafe-member-seat-scene"/);
assert.match(
  appSource,
  /className: "study-cafe-member-seat-scene"[\s\S]*?className: "study-cafe-desk"/
);
assert.doesNotMatch(appSource, /className: "study-cafe-chair"/);
  assert.doesNotMatch(styleSource, /\.study-cafe-chair\s*\{/);
assert.match(styleSource, /\.study-cafe-member-seat-scene \.study-cafe-avatar/);
assert.match(styleSource, /\.study-cafe-member-info-list/);
assert.match(appSource, /const isPausedSeat = occupant\?\.status === "paused"/);
assert.match(appSource, /className: "study-cafe-seat-pause-icon"/);
assert.match(appSource, /ariaLabel: "일시정지"/);
assert.match(appSource, /el\("strong", \{\}, occupant\.name\)/);
assert.match(appSource, /el\("em", \{\}, occupant\.track\)/);
assert.match(appSource, /track: summarizeStudyCafeTrack\(student\?\.track\)/);
assert.match(appSource, /fullTrack: student\?\.track \|\| "온라인 수강"/);
assert.match(appSource, /function summarizeStudyCafeTrack\(value\)/);
assert.match(appSource, /\[\/해상교통관제\\\(VTS\\\)\/, "VTS"\]/);
assert.match(appSource, /\[\/해양오염방제\\s\*환경\/, "방제·환경"\]/);
assert.match(styleSource, /\.study-cafe-seat-name\s*\{[^}]*right: 4px/);
assert.doesNotMatch(styleSource, /\.study-cafe-seat-name\s*\{[^}]*left: 50%/);
assert.doesNotMatch(appSource, /label: "창가/);
assert.doesNotMatch(appSource, /label: "집중/);
assert.doesNotMatch(appSource, /label: "테이블/);
assert.doesNotMatch(appSource, /label: "조용한 자리/);
assert.match(styleSource, /\.study-cafe-seat-number/);
assert.match(styleSource, /\.study-cafe-avatar-arm/);
assert.match(
  styleSource,
  /\.study-cafe-avatar-arm\s*\{[^}]*top: 40px[^}]*width: 10px[^}]*height: 18px/
);
assert.match(styleSource, /\.study-cafe-avatar\s*\{[^}]*top: 46px/);
assert.match(styleSource, /\.study-cafe-avatar\s*\{[^}]*z-index: 5/);
assert.match(appSource, /function renderStudyCafeWritingArms\(\)/);
assert.match(appSource, /includeArms: false/);
assert.match(styleSource, /\.study-cafe-writing-arms\s*\{[^}]*z-index: 7/);
assert.doesNotMatch(styleSource, /\.study-cafe-desk::before/);
assert.doesNotMatch(styleSource, /\.study-cafe-desk::after/);
assert.match(styleSource, /@keyframes study-cafe-writing-left/);
assert.match(styleSource, /@keyframes study-cafe-writing-right/);
assert.match(
  styleSource,
  /@keyframes study-cafe-writing-left\s*\{[\s\S]*?rotate\(-16deg\)[\s\S]*?rotate\(-11deg\)/
);
assert.match(
  styleSource,
  /@keyframes study-cafe-writing-right\s*\{[\s\S]*?rotate\(16deg\)[\s\S]*?rotate\(11deg\)/
);
assert.match(styleSource, /@keyframes study-cafe-head-nod/);
assert.match(styleSource, /@keyframes study-cafe-body-breathe/);
assert.match(styleSource, /@keyframes study-cafe-book-page/);
assert.match(styleSource, /@keyframes study-cafe-cup-steam/);
assert.match(styleSource, /\.study-cafe-member-time/);
assert.match(styleSource, /\.study-cafe-seat-pause-icon::before/);
assert.match(styleSource, /\.study-cafe-seat-pause-icon::after/);
assert.match(styleSource, /\.study-ranking-podium/);
assert.match(styleSource, /\.study-timer-total-card/);
assert.match(styleSource, /\.study-timer-mode-tabs/);
assert.match(styleSource, /\.study-timer-stats-periods/);
assert.match(styleSource, /\.study-timer-weekly-bars/);
assert.match(styleSource, /\.study-timer-monthly-calendar/);
assert.match(styleSource, /\.study-timer-stats-summary-grid/);
assert.match(styleSource, /\.study-timer-subject-stats-list/);
assert.match(styleSource, /\.study-timer-fullscreen-button/);
assert.match(styleSource, /\.study-timer-fullscreen\s*\{/);
assert.match(styleSource, /\.study-timer-fullscreen-clock/);
assert.match(styleSource, /\.study-timer-fullscreen-actions/);
assert.match(
  styleSource,
  /body\.study-timer-fullscreen-mode \.student-study-timer-page\s*\{[^}]*animation: none[^}]*transform: none/
);
assert.match(styleSource, /\.study-subject-timer-row\.active/);
assert.match(styleSource, /\.study-subject-edit-button/);
assert.match(styleSource, /\.study-subject-edit-modal/);
assert.match(styleSource, /\.study-subject-edit-row/);
assert.doesNotMatch(styleSource, /\.study-cafe-entry-card/);
assert.doesNotMatch(styleSource, /\.study-cafe-leave-button/);
assert.match(styleSource, /\.study-cafe-my-seat-idle-buttons/);
assert.match(styleSource, /\.study-cafe-my-seat-release-button/);
assert.doesNotMatch(
  styleSource,
  /\.study-cafe-my-seat-idle-buttons\s*\{[^}]*padding-right/
);
assert.match(styleSource, /\.study-cafe-footer-menu/);
assert.match(styleSource, /\.footer-icon-study-todo::after\s*\{[^}]*transform: rotate\(-45deg\)/);
assert.match(styleSource, /\.footer-icon-study-cafe::after\s*\{[^}]*linear-gradient/);
assert.match(styleSource, /\.footer-icon-study-ranking::before\s*\{[^}]*border-radius: 2px 2px 8px 8px/);
assert.match(styleSource, /\.footer-icon-study-timer::before\s*\{[^}]*border-radius: 50%/);
assert.match(styleSource, /\.footer-icon-study-character::after\s*\{[^}]*linear-gradient/);
assert.doesNotMatch(styleSource, /\.footer-icon-study-ranking::before\s*\{[^}]*clip-path/);
assert.doesNotMatch(styleSource, /\.footer-icon-study-ranking::after\s*\{\s*content: "1"/);
assert.match(styleSource, /\.study-cafe-footer-menu button\.active::after/);
assert.match(styleSource, /html\s*\{[^}]*scrollbar-gutter: stable/);
assert.doesNotMatch(
  styleSource,
  /\.study-cafe-footer-menu (?:button|a)\.active \.footer-icon\s*\{[^}]*translateY/
);
assert.match(styleSource, /transform: translateX\(-50%\) scaleX\(1\)/);
assert.doesNotMatch(styleSource, /@keyframes study-footer-tab-pop/);
assert.doesNotMatch(
  styleSource,
  /\.student-footer-menu button:active,[^}]*transform: translateY\(1px\)/
);
assert.match(
  styleSource,
  /\.student-footer-menu\s*\{[^}]*will-change: opacity[^}]*opacity 140ms cubic-bezier\(0\.22, 1, 0\.36, 1\)[^}]*visibility 0s linear 140ms/
);
assert.doesNotMatch(styleSource, /transition-delay: 0s, 220ms/);
assert.match(
  styleSource,
  /body\.student-study-mode \.study-cafe-footer-menu\s*\{[^}]*opacity: 1[^}]*transition-delay: 0s, 0s/
);
assert.match(
  styleSource,
  /body\.student-online-mode \.study-cafe-footer-menu,\s*body\.student-study-mode \.study-cafe-footer-menu\s*\{[^}]*grid-template-columns: repeat\(6/
);
assert.doesNotMatch(styleSource, /\[data-route="study-cafe"\]\s*\{[^}]*transform: translateX/);
assert.match(styleSource, /\.study-character-option-grid/);
assert.match(styleSource, /\.study-character-name-edit-button/);
assert.match(
  styleSource,
  /\.study-character-preview-avatar\s*\{[^}]*height: 120px[^}]*place-items: start center[^}]*padding-top: 14px/
);
assert.match(
  styleSource,
  /\.study-character-preview-avatar \.study-cafe-avatar\s*\{[^}]*transform: scale\(1\.55\)[^}]*transform-origin: center top/
);
assert.match(styleSource, /\.study-character-nickname-modal-content/);
assert.match(styleSource, /\.study-character-nickname-input/);
assert.match(appSource, /className: "study-character-nickname-feedback"/);
assert.match(appSource, /feedback\.scrollIntoView\(\{ block: "nearest" \}\)/);
assert.match(appSource, /mutateStudyCafeRemote\("save_profile",[\s\S]*?\{ notify: false \}\)/);
assert.match(styleSource, /\.study-character-nickname-modal\s*\{[^}]*max-height: calc\(100dvh - 36px\)[^}]*overflow-y: auto/);
assert.match(styleSource, /\.study-character-nickname-feedback/);
assert.doesNotMatch(styleSource, /\.study-character-nickname-card/);
assert.doesNotMatch(styleSource, /@keyframes study-view-enter/);
assert.doesNotMatch(
  styleSource,
  /body\.student-study-mode \.student-study-cafe-page\s*\{[^}]*animation/
);
assert.match(styleSource, /white-space: nowrap/);
assert.match(styleSource, /\.study-ranking-row\.mine/);
assert.match(styleSource, /\.study-cafe-room-toolbar/);
assert.doesNotMatch(styleSource, /\.study-cafe-room-links/);
assert.doesNotMatch(styleSource, /\.study-timer-header-button/);
assert.doesNotMatch(styleSource, /\.study-ranking-header-button/);
assert.doesNotMatch(styleSource, /\.study-cafe-page-head/);
assert.doesNotMatch(styleSource, /\.study-ranking-teaser/);
assert.doesNotMatch(styleSource, /\.study-cafe-room-wall/);
assert.doesNotMatch(appSource, /study-cafe-lounge/);
assert.doesNotMatch(styleSource, /\.study-cafe-lounge/);
assert.match(styleSource, /@media \(prefers-reduced-motion: reduce\)/);

console.log("study cafe UI tests passed");
