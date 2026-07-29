const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
const indexSource = fs.readFileSync(path.join(root, "index.html"), "utf8");
const styleSource = fs.readFileSync(path.join(root, "styles.css"), "utf8");

assert.match(appSource, /"study-cafe": \(\) => requireStudentAuth\(renderStudentStudyCafe\)/);
assert.match(appSource, /"study-timer": \(\) => requireStudentAuth\(renderStudentStudyTimer\)/);
assert.match(appSource, /"study-ranking": \(\) => requireStudentAuth\(renderStudentStudyRanking\)/);
assert.match(appSource, /"study-character": \(\) => requireStudentAuth\(renderStudentStudyCharacter\)/);
assert.match(appSource, /fetch\("\/api\/study-cafe"/);
assert.match(appSource, /function ensureStudyCafeRemoteLoaded\(options = \{\}\)/);
assert.match(appSource, /if \(isStudyCafeLocalPreview\(\)\) return \{ ok: true, localOnly: true \}/);
assert.match(appSource, /return \{ ok: false, error: studyCafeRemoteState\.error \|\| "study_cafe_unavailable" \}/);
assert.match(appSource, /function hydrateStudyCafeSnapshot\(snapshot\)/);
assert.match(appSource, /mutateStudyCafeRemote\("claim_seat"/);
assert.match(appSource, /mutateStudyCafeRemote\("timer_pause"\)/);
assert.match(appSource, /mutateStudyCafeRemote\("timer_stop"\)/);
assert.match(appSource, /mutateStudyCafeRemote\("release_seat"\)/);
assert.match(appSource, /mutateStudyCafeRemote\("save_subjects"/);
assert.match(appSource, /mutateStudyCafeRemote\("save_profile"/);
assert.match(appSource, /studyCafeRemoteState\.refreshTimer = window\.setInterval/);
assert.match(appSource, /studyCafeRemoteState\.heartbeatTimer = window\.setInterval/);
assert.match(appSource, /String\(student\?\.id \|\| ""\)\.trim\(\)\.startsWith\("2"\)/);
assert.match(appSource, /onlineMode \? renderStudyCafeHomeCard\(student\) : null/);
assert.match(appSource, /function getStudyCafeFocusedCount\(\)/);
assert.match(appSource, /function updateStudyCafeHomeLiveCount\(\)/);
assert.match(appSource, /data-study-cafe-home-live-count/);
assert.match(appSource, /const focusedCount = getStudyCafeFocusedCount\(\)/);
assert.doesNotMatch(appSource, /현재 5명이 함께 공부하고 있어요/);
assert.match(appSource, /button\("스터디카페 보기", "btn", "button", \(\) => navigate\("study-cafe"\)\)/);
assert.doesNotMatch(appSource, /seated \? "공부방 보기" : "스터디카페 보기"/);
assert.match(appSource, /new URLSearchParams\(location\.search\)\.get\("studentMode"\) === "online"/);
assert.match(appSource, /if \(onlineMode && \["student", "student-verify", "student-return", "student-done", "attendance"\]\.includes\(normalized\)\) return "home"/);
assert.match(appSource, /if \(!onlineMode && \["study-cafe", "study-timer", "study-ranking", "study-character"\]\.includes\(normalized\)\) return "home"/);
assert.match(appSource, /document\.body\.classList\.toggle\("student-online-mode", onlineMode\)/);
assert.match(appSource, /document\.body\.classList\.toggle\("student-study-mode", studyMode\)/);
assert.match(indexSource, /class="student-footer-menu study-cafe-footer-menu"/);
assert.doesNotMatch(indexSource, /student-header-identity/);
assert.doesNotMatch(indexSource, /data-student-header-name/);
assert.doesNotMatch(indexSource, /data-student-header-track/);
assert.doesNotMatch(appSource, /function updateStudentHeaderIdentity\(\)/);
assert.doesNotMatch(styleSource, /\.student-header-identity/);
assert.match(indexSource, /study-cafe-footer-menu" aria-label="스터디카페 메뉴" aria-hidden="true"/);
assert.match(indexSource, /data-route="study-cafe"[\s\S]*<span>스터디카페<\/span>/);
assert.match(appSource, /function openStudyCafeSubjectModal\(seatId, student, options = \{\}\)/);
assert.match(appSource, /preserveTimer = options\.preserveTimer === true/);
assert.match(appSource, /function startStudyCafeCountdown\(seatId, subject\)/);
assert.match(appSource, /function renderStudyCafeStateUpdate\(\)/);
assert.match(appSource, /\.classList\.add\("study-view-static"\)/);
assert.match(appSource, /let remaining = 3/);
assert.match(appSource, /studyCafeCountdownInterval = window\.setInterval/);
assert.match(appSource, /studyCafePreviewState\.subjectStartedAt = startedAt/);
assert.match(appSource, /function cancelStudyCafeCountdown\(\)/);
assert.match(
  appSource,
  /async function toggleStudyCafePreviewTimer\(\)[\s\S]*?await mutateStudyCafeRemote\("timer_pause"\)[\s\S]*?renderStudyCafeStateUpdate\(\)/
);
assert.match(appSource, /async function beginStudyCafeTimer\(seatId, subject, resumeExistingSession\)/);
assert.match(appSource, /if \(!isStudyCafeLocalPreview\(\)\) return \[\]/);
assert.match(
  appSource,
  /async function stopStudyCafePreviewTimer\(\)[\s\S]*?renderStudyCafeStateUpdate\(\)/
);
assert.match(styleSource, /\.study-cafe-countdown-overlay/);
assert.match(styleSource, /@keyframes study-countdown-tick/);
assert.match(appSource, /현재 자리와 전체 공부시간은 유지되고/);
assert.match(appSource, /button\("과목 변경"/);
assert.match(appSource, /function renderStudentStudyRanking\(\)/);
assert.match(appSource, /function renderStudentStudyCharacter\(\)/);
assert.match(appSource, /function openStudyCafeNicknameEditor\(\)/);
assert.match(appSource, /function normalizeStudyCafeNickname\(value\)/);
assert.match(appSource, /name: getStudyCafeDisplayName\("나"\)/);
assert.match(appSource, /"data-study-character-name": "true"/);
assert.match(appSource, /className: "study-character-name-edit-button"/);
assert.match(appSource, /onclick: openStudyCafeNicknameEditor/);
assert.doesNotMatch(appSource, /renderStudyCafeNicknameEditor\(\)/);
assert.match(appSource, /const STUDY_CAFE_TEMP_NICKNAME_MOODS = \[/);
assert.match(appSource, /const STUDY_CAFE_TEMP_NICKNAME_ANIMALS = \[/);
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
assert.match(appSource, /button\("전체화면", "study-timer-fullscreen-button"/);
assert.match(appSource, /function openStudyTimerFullscreen\(\)/);
assert.match(appSource, /function closeStudyTimerFullscreen\(\)/);
assert.match(appSource, /function renderStudyTimerFullscreen\(student\)/);
assert.match(appSource, /timerFullscreen: false/);
assert.match(appSource, /ariaLabel: "타이머 전체화면 모드"/);
assert.match(appSource, /document\.querySelectorAll\("\[data-study-total-time\]"\)/);
assert.match(appSource, /button\("과목 편집", "study-subject-edit-button"/);
assert.match(appSource, /function openStudySubjectEditor\(student\)/);
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
assert.match(appSource, /el\("strong", \{\}, "RONPARK STUDYCAFE"\)/);
assert.match(appSource, /ariaLabel: "RONPARK STUDYCAFE 좌석 배치"/);
assert.ok(
  appSource.indexOf("active ? renderStudyCafeActiveTimer() : null") <
    appSource.indexOf('className: "study-cafe-room"'),
  "active study timer should render above the seat room"
);
assert.doesNotMatch(appSource, /스터디카페 퇴실하기/);
assert.match(appSource, /과목 공부를 종료해도 현재 좌석은 유지됩니다\./);
assert.match(appSource, /과목 공부를 종료했습니다\. 현재 좌석은 그대로 유지됩니다\./);
assert.match(appSource, /button\("좌석 비우기", "btn secondary", "button", releaseStudyCafeSeat\)/);
assert.match(
  appSource,
  /button\("다른 과목 시작", "btn", "button", \(\) =>\s*openStudyCafeSubjectModal\(studyCafePreviewState\.selectedSeatId, student\)/
);
assert.doesNotMatch(
  appSource,
  /button\("다른 과목 시작", "btn", "button", \(\) => navigate\("study-timer"\)\)/
);
assert.match(appSource, /function releaseStudyCafeSeat\(\)/);
assert.doesNotMatch(
  appSource,
  /function stopStudyCafePreviewTimer\(\)\s*\{[^}]*studyCafePreviewState\.selectedSeatId = ""/
);
assert.doesNotMatch(appSource, /study-cafe-room-links/);
assert.doesNotMatch(appSource, /study-timer-header-button/);
assert.doesNotMatch(appSource, /study-ranking-header-button/);
assert.match(appSource, /론박 온라인 스터디카페/);
assert.doesNotMatch(appSource, /study-ranking-teaser/);
assert.doesNotMatch(appSource, /study-cafe-room-wall/);
assert.match(appSource, /getConfiguredWeeklySubjectsForTrack\(student\?\.track\)/);
assert.match(appSource, /data-study-cafe-clock/);
assert.match(appSource, /현재 과목 순공시간/);
assert.match(appSource, /formatStudyCafeElapsed\(getStudySubjectElapsedMs\(studyCafePreviewState\.subject\)\)/);
assert.match(appSource, /data-study-member-time/);
assert.match(appSource, /function formatStudyCafeMemberTime\(seconds\)/);
assert.doesNotMatch(appSource, /study-cafe-subject-bubble/);
assert.doesNotMatch(styleSource, /\.study-cafe-subject-bubble/);
assert.doesNotMatch(appSource, /occupant: \{ name: "[^"]+", subject:/);
assert.match(appSource, /RONPARK ONLINE/);
assert.doesNotMatch(appSource, /RONBAK/i);
assert.match(indexSource, /"study-cafe": "온라인 스터디카페"/);
assert.match(styleSource, /\.study-cafe-seat-grid/);
assert.match(styleSource, /\.study-cafe-room-tabs/);
assert.match(styleSource, /grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
assert.match(styleSource, /\.study-cafe-room-tab\.active/);
assert.match(appSource, /className: "study-cafe-seat-number"/);
assert.match(appSource, /`\$\{selectedSeatNumber\}번 좌석에서 집중 중`/);
assert.match(appSource, /const STUDY_CAFE_ROOM_SIZE = 10/);
assert.match(appSource, /\["A룸", "B룸", "C룸", "D룸", "E룸"\]/);
assert.match(appSource, /Array\.from\(\{ length: 50 \}/);
assert.match(appSource, /function renderStudyCafeRoomTabs\(student\)/);
assert.match(appSource, /function selectStudyCafeRoom\(roomIndex, student\)/);
assert.match(appSource, /visibleSeats\.map\(\(seat, index\) =>/);
assert.match(appSource, /className: "study-cafe-seat-name"/);
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
assert.match(styleSource, /\.study-cafe-seat-name\s*\{[^}]*right: 6px/);
assert.doesNotMatch(styleSource, /\.study-cafe-seat-name\s*\{[^}]*left: 50%/);
assert.doesNotMatch(appSource, /label: "창가/);
assert.doesNotMatch(appSource, /label: "집중/);
assert.doesNotMatch(appSource, /label: "테이블/);
assert.doesNotMatch(appSource, /label: "조용한 자리/);
assert.match(styleSource, /\.study-cafe-seat-number/);
assert.match(styleSource, /\.study-cafe-avatar-arm/);
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
assert.match(styleSource, /\.study-subject-timer-row\.active/);
assert.match(styleSource, /\.study-subject-edit-button/);
assert.match(styleSource, /\.study-subject-edit-modal/);
assert.match(styleSource, /\.study-subject-edit-row/);
assert.doesNotMatch(styleSource, /\.study-cafe-entry-card/);
assert.doesNotMatch(styleSource, /\.study-cafe-leave-button/);
assert.match(styleSource, /\.study-cafe-seat-release-note/);
assert.match(styleSource, /\.study-cafe-seat-idle-guide/);
assert.match(styleSource, /\.study-cafe-seat-idle-actions/);
assert.match(styleSource, /\.study-cafe-footer-menu/);
assert.match(styleSource, /\.footer-icon-study-back::after\s*\{[^}]*transform: rotate\(45deg\)/);
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
  /\.student-footer-menu\s*\{[^}]*transition:\s*opacity 220ms cubic-bezier/
);
assert.match(
  styleSource,
  /\.study-cafe-footer-menu\s*\{[^}]*transition-delay: 0s, 220ms/
);
assert.match(
  styleSource,
  /body\.student-study-mode \.normal-student-footer\s*\{[^}]*transition-delay: 0s, 220ms/
);
assert.match(
  styleSource,
  /body\.student-online-mode \.study-cafe-footer-menu,\s*body\.student-study-mode \.study-cafe-footer-menu\s*\{[^}]*grid-template-columns: repeat\(5/
);
assert.match(
  styleSource,
  /body\.student-study-mode \.normal-student-footer \[data-route="study-cafe"\]\s*\{[^}]*transform: translateX\(-32%\)/
);
assert.match(
  styleSource,
  /body\.student-study-mode \.study-cafe-footer-menu \[data-route="study-cafe"\]\s*\{[^}]*transform: translateX\(0\)/
);
assert.match(styleSource, /\.study-character-option-grid/);
assert.match(styleSource, /\.study-character-name-edit-button/);
assert.match(styleSource, /\.study-character-nickname-modal-content/);
assert.match(styleSource, /\.study-character-nickname-input/);
assert.doesNotMatch(styleSource, /\.study-character-nickname-card/);
assert.match(styleSource, /@keyframes study-view-enter/);
assert.match(styleSource, /body\.student-study-mode \.study-view-static\s*\{[^}]*animation: none/);
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
