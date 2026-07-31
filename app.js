const routeTitles = {
  home: "홈",
  student: "외출 신청",
  "student-verify": "사진 인증",
  "student-return": "학원 복귀 인증",
  "student-done": "복귀 완료",
  outing: "외출 관리",
  "weekly-exams": "주간평가",
  "weekly-absences": "주간평가 미응시자",
  grades: "성적 관리",
  fitness: "체력평가",
  penalties: "상/벌점 관리",
  seats: "좌석 관리",
  attendance: "출석 관리",
  "study-cafe-admin": "온라인 스터디카페",
  mypage: "마이페이지",
  "study-todo": "오늘 플래너",
  "study-cafe": "온라인 스터디카페",
  "study-timer": "과목 타이머",
  "study-ranking": "순공시간 랭킹",
  "study-character": "캐릭터",
  teacher: "외출 관리",
  managers: "담당자 등록",
  students: "학생 등록",
  "device-history": "기기 등록 이력",
  "student-preview": "학생 미리보기",
  "track-options": "직렬 항목 관리",
  "track-subjects": "직렬별 응시과목 관리",
  duplicates: "중복 사진",
  trash: "삭제 내역",
  notices: "공지 관리",
};
const COAST_GUARD_EXAM_DATE = "2026-10-24";
const COAST_GUARD_EXAM_LABEL = "해양경찰 필기시험";
const COAST_GUARD_TRACK_OPTIONS = [
  "경찰직 - 공채(순경)",
  "경찰직 - 해경학과 항해(경장)",
  "경찰직 - 해경학과 기관(경장)",
  "경찰직 - 함정요원 항해(순경)",
  "경찰직 - 함정요원 기관(순경)",
  "경찰직 - 함정요원 항해(경장)",
  "경찰직 - 함정요원 기관(경장)",
  "경찰직 - 해상교통관제(VTS)(순경)",
  "일반직 - 선박교통관제(VTS)",
  "경찰직 - 구조(순경)",
  "경찰직 - 구급(순경)",
  "경찰직 - 정보통신 전산(순경)",
  "경찰직 - 특공 전술(순경)",
  "경찰직 - 정보통신 통신(순경)",
  "일반직 - 해양오염방제 환경",
  "일반직 - 해양오염방제 화공",
  "일반직 - 해양오염방제 항해",
  "일반직 - 해양오염방제 기관",
  "경찰직 - 경위 공채(해양-기관)",
  "경찰직 - 경위 공채(해양-항해)",
  "기타",
];
const STUDY_CAFE_ROOM_SIZE = 48;
const STUDY_CAFE_SEAT_COUNT = 192;
const STUDY_CAFE_SAFETY_REFRESH_INTERVAL_MS = 2 * 60 * 1000;
const STUDY_CAFE_ACTION_REFRESH_DELAY_MS = 120;
const STUDY_CAFE_ROOM_THEMES = [
  { theme: "oak", label: "A룸", mood: "따뜻한 우드톤" },
  { theme: "dawn", label: "B룸", mood: "밝고 차분한 톤" },
  { theme: "forest", label: "C룸", mood: "편안한 그린톤" },
  { theme: "night", label: "D룸", mood: "차분한 딥블루톤" },
  { theme: "classic", label: "E룸", mood: "정돈된 클래식톤" },
];
const STUDY_CAFE_ROOMS = STUDY_CAFE_ROOM_THEMES.slice(0, 4).map((roomTheme, index) => ({
  id: `room-${index + 1}`,
  ...roomTheme,
  startSeat: index * STUDY_CAFE_ROOM_SIZE + 1,
  endSeat: (index + 1) * STUDY_CAFE_ROOM_SIZE,
}));
const STUDY_CAFE_PREVIEW_OCCUPANTS = {
  1: { name: "김○○", track: "공채(순경)", tone: "blue", todaySeconds: 11538 },
  3: { name: "이○○", track: "해경학과", tone: "mint", todaySeconds: 8426 },
  4: { name: "박○○", track: "함정요원", tone: "purple", todaySeconds: 14972 },
  6: { name: "최○○", track: "구조", tone: "orange", todaySeconds: 6274 },
  7: { name: "정○○", track: "정보통신", tone: "rose", todaySeconds: 10165 },
  13: { name: "한○○", track: "VTS", tone: "mint", todaySeconds: 7315 },
  24: { name: "오○○", track: "구급", tone: "orange", todaySeconds: 5268 },
  35: { name: "윤○○", track: "특공", tone: "rose", todaySeconds: 9184 },
  46: { name: "서○○", track: "방제·환경", tone: "blue", todaySeconds: 12740 },
  52: { name: "강○○", track: "공채(순경)", tone: "purple", todaySeconds: 6842 },
  57: { name: "조○○", track: "함정요원", tone: "mint", todaySeconds: 11028 },
  63: { name: "임○○", track: "해경학과", tone: "blue", todaySeconds: 7935 },
  71: { name: "송○○", track: "VTS", tone: "orange", todaySeconds: 13418 },
  85: { name: "권○○", track: "구조", tone: "rose", todaySeconds: 9564 },
  94: { name: "남○○", track: "정보통신", tone: "mint", todaySeconds: 4822 },
  99: { name: "장○○", track: "공채(순경)", tone: "blue", todaySeconds: 12306 },
  105: { name: "신○○", track: "특공", tone: "orange", todaySeconds: 7041 },
  112: { name: "문○○", track: "구급", tone: "purple", todaySeconds: 10283 },
  121: { name: "배○○", track: "방제·화공", tone: "mint", todaySeconds: 5960 },
  134: { name: "백○○", track: "함정요원", tone: "rose", todaySeconds: 14218 },
  143: { name: "허○○", track: "VTS", tone: "blue", todaySeconds: 8637 },
  148: { name: "유○○", track: "해경학과", tone: "purple", todaySeconds: 7398 },
  153: { name: "고○○", track: "공채(순경)", tone: "mint", todaySeconds: 11844 },
  161: { name: "노○○", track: "구조", tone: "orange", todaySeconds: 6527 },
  170: { name: "심○○", track: "정보통신", tone: "rose", todaySeconds: 9840 },
  181: { name: "차○○", track: "방제·환경", tone: "blue", todaySeconds: 5319 },
  190: { name: "주○○", track: "함정요원", tone: "purple", todaySeconds: 12972 },
};
const STUDY_CAFE_PREVIEW_SEATS = Array.from({ length: STUDY_CAFE_SEAT_COUNT }, (_, index) => {
  const seatNumber = index + 1;
  return {
    id: `seat-${seatNumber}`,
    ...(STUDY_CAFE_PREVIEW_OCCUPANTS[seatNumber]
      ? { occupant: STUDY_CAFE_PREVIEW_OCCUPANTS[seatNumber] }
      : {}),
  };
});
const STUDY_CAFE_TEMP_NICKNAME_MOODS = [
  "웃고있는",
  "집중하는",
  "차분한",
  "신나는",
  "졸고있는",
  "용감한",
  "부지런한",
  "생각하는",
  "즐거운",
  "느긋한",
];
const STUDY_CAFE_TEMP_NICKNAME_ANIMALS = [
  "기린",
  "하마",
  "수달",
  "판다",
  "여우",
  "펭귄",
  "토끼",
  "다람쥐",
  "카피바라",
];
const STUDY_CAFE_PREVIEW_EPOCH = Date.now();
const STUDY_CAFE_IDLE_WARNING_MS = 15 * 60 * 1000;
const STUDY_CAFE_IDLE_COUNTDOWN_SECONDS = 10;
const studyCafePreviewState = {
  selectedSeatId: "",
  subject: "",
  lastSubject: "",
  pendingSubject: "",
  running: false,
  paused: false,
  elapsedMs: 0,
  startedAt: 0,
  subjectElapsedMs: {},
  subjectStartedAt: 0,
  idleSince: 0,
  customSubjects: null,
  timerFullscreen: false,
  avatarTone: "navy",
  nickname: "",
  temporaryNickname: "",
  temporaryNicknameAwaitingEntry: false,
  activeRoomIndex: 0,
};
const studyCafeRemoteState = {
  studentId: "",
  available: null,
  loaded: false,
  loading: false,
  room: null,
  ranking: null,
  todos: [],
  todosByDate: {},
  plannerDateKey: "",
  plannerLoading: false,
  summary: null,
  rankingPeriods: {},
  rankingLoadingPeriod: "",
  rankingError: "",
  refreshTimer: null,
  requestedRefreshTimer: null,
  heartbeatTimer: null,
  lifecycleRefreshBound: false,
  lastLoadedAt: 0,
  lastAttemptAt: 0,
  error: "",
  studyDateKey: "",
};
let studyCafeTimerActionPending = false;
const STUDY_RANKING_PREVIEW_MEMBERS = [
  { name: "서○○", tone: "rose", dailySeconds: 38538 },
  { name: "김○○", tone: "blue", dailySeconds: 35921 },
  { name: "박○○", tone: "orange", dailySeconds: 33144 },
  { name: "이○○", tone: "mint", dailySeconds: 30608 },
  { name: "정○○", tone: "purple", dailySeconds: 27956 },
  { name: "나", tone: "navy", dailySeconds: 24738, isMine: true },
  { name: "최○○", tone: "blue", dailySeconds: 22691 },
  { name: "한○○", tone: "mint", dailySeconds: 20174 },
  { name: "오○○", tone: "orange", dailySeconds: 18422 },
  { name: "윤○○", tone: "rose", dailySeconds: 15865 },
];
const studyRankingPreviewState = {
  period: "daily",
  dateOffset: 0,
};
const studyTimerStatsState = {
  mode: "timer",
  period: "weekly",
  anchorDate: parseStudyTimerDateKey(formatStudyBusinessDateKey(new Date())),
  cache: {},
  loadingKey: "",
  error: "",
};
let studyCafePreviewClock = null;
let studyCafeCountdownInterval = null;
let studyCafeCountdownCleanupTimer = null;
let studyCafeCountdownId = 0;
let studentFooterTapGuardTimer = null;
let studyCafeIdleWarningRemaining = 0;
let studyCafeIdleReleasePending = false;

document.querySelectorAll("[data-route]").forEach((button) => {
  button.addEventListener("click", (event) => {
    if (button.matches("a")) event.preventDefault();
    navigate(button.dataset.route);
  });
});

document.querySelectorAll(".student-footer-menu").forEach((footer) => {
  footer.addEventListener("pointerdown", (event) => {
    activateStudentFooterTapGuard();
    activateStudentFooterRoute(event);
  }, { passive: true });
  footer.addEventListener("touchstart", (event) => {
    activateStudentFooterTapGuard();
    activateStudentFooterRoute(event);
  }, { passive: true });
  footer.addEventListener("click", (event) => {
    event.stopPropagation();
  });
});

function activateStudentFooterRoute(event) {
  const routeButton = event.target.closest("[data-route]");
  const footer = routeButton?.closest(".student-footer-menu");
  if (!footer || routeButton.hidden) return;
  footer.querySelectorAll("[data-route]").forEach((button) => {
    button.classList.toggle("active", button === routeButton);
  });
}

function activateStudentFooterTapGuard() {
  document.body.classList.add("student-footer-tap-guard");
  window.clearTimeout(studentFooterTapGuardTimer);
  studentFooterTapGuardTimer = window.setTimeout(() => {
    document.body.classList.remove("student-footer-tap-guard");
    studentFooterTapGuardTimer = null;
  }, 450);
}

document.querySelectorAll("[data-unreleased]").forEach((button) => {
  button.addEventListener("click", () => openUnreleasedModal(button.dataset.unreleased));
});

if (seedButton) {
  seedButton.addEventListener("click", () => {
    seedDemo();
    render();
    notify("샘플 데이터가 추가되었습니다.");
  });
}

if (resetButton) {
  resetButton.addEventListener("click", () => {
    if (!confirm("저장된 모든 데이터를 초기화할까요?")) return;
    localStorage.removeItem(STORAGE_KEY);
    Object.assign(state, defaultState());
    render();
    notify("데이터가 초기화되었습니다.");
  });
}

function handleRouteHistoryChange() {
  const nextRoute = normalizeRoute(location.hash.replace("#", "") || defaultRoute());
  if (nextRoute === currentRoute) return;
  if (nextRoute === "study-cafe" && currentRoute !== "study-cafe") {
    studyCafePreviewState.temporaryNicknameAwaitingEntry = false;
  }
  currentRoute = nextRoute;
  render();
  scrollAppToTop();
  if (APP_MODE === "student") {
    scheduleStudentRouteRemoteRefresh();
    if (isStudyCafeRoute() || currentRoute === "home") {
      requestStudyCafeRemoteRefresh(180, {
        retryWhenLoading: false,
        maxAgeMs: 5000,
      });
    }
  }
}

window.addEventListener("hashchange", handleRouteHistoryChange);
window.addEventListener("popstate", handleRouteHistoryChange);

currentRoute = normalizeRoute(location.hash.replace("#", "") || defaultRoute());
render();
if (APP_MODE === "teacher") {
  initTeacherAuth();
} else {
  initRemoteStore();
}

function normalizeRoute(route) {
  const routeName = String(route || "").split("?")[0];
  const legacy = {
    dashboard: "home",
    teacher: "outing",
    out: "student",
    verify: "student-verify",
    return: "student-return",
    "student-out": "student",
    "grades-final": "grades",
    settings: "home",
  };
  const normalized = legacy[routeName] || routeName;
  if (APP_MODE === "teacher") {
    const teacherRoutes = ["home", "outing", "weekly-exams", "weekly-absences", "grades", "fitness", "penalties", "seats", "attendance", "study-cafe-admin", "notices", "managers", "students", "device-history", "student-preview", "track-options", "track-subjects", "duplicates", "trash"];
    if (!teacherRoutes.includes(normalized)) return "home";
    return teacherAuth.checked && teacherAuth.authenticated && !canUseRoute(normalized) ? firstAllowedTeacherRoute() : normalized;
  }
  const studentRoutes = ["home", "student", "student-verify", "student-return", "student-done", "attendance", "grades", "mypage", "study-todo", "study-cafe", "study-timer", "study-ranking", "study-character", "notices"];
  const authedStudent = getAuthedStudent();
  if (authedStudent) {
    const onlineMode = isOnlineStudentExperience(authedStudent);
    if (onlineMode && ["student", "student-verify", "student-return", "student-done", "attendance"].includes(normalized)) return "home";
    if (!onlineMode && ["study-todo", "study-cafe", "study-timer", "study-ranking", "study-character"].includes(normalized)) return "home";
  }
  if (studentRoutes.includes(normalized) || normalized.startsWith("notice-")) return normalized;
  return "home";
}

function defaultRoute() {
  return "home";
}

function navigate(route) {
  const nextRoute = normalizeRoute(route || defaultRoute());
  if (nextRoute === "study-cafe" && currentRoute !== "study-cafe") {
    studyCafePreviewState.temporaryNicknameAwaitingEntry = false;
  }
  if (APP_MODE !== "teacher" && nextRoute === "grades" && typeof resetStudentGradesView === "function") resetStudentGradesView();
  const shouldScrollOnly = nextRoute === currentRoute && location.hash === `#${nextRoute}`;
  location.hash = nextRoute;
  if (shouldScrollOnly) scrollAppToTop();
}

function scrollAppToTop() {
  window.requestAnimationFrame(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  });
}

function render() {
  if (normalizeRoute(location.hash.replace("#", "") || defaultRoute()) !== currentRoute) {
    history.replaceState(null, "", `${location.href.split("#")[0]}#${currentRoute}`);
  }

  if (APP_MODE === "teacher") {
    document.body.classList.toggle("teacher-authenticated", Boolean(teacherAuth.authenticated));
    document.body.classList.toggle("teacher-guest", !teacherAuth.authenticated);
  }
  if (currentRoute !== "study-timer") studyCafePreviewState.timerFullscreen = false;
  document.body.classList.toggle(
    "study-timer-fullscreen-mode",
    currentRoute === "study-timer" && studyCafePreviewState.timerFullscreen
  );
  const studentBrowserInstallOnly = APP_MODE !== "teacher" && !isStandaloneStudentApp();
  document.body.classList.toggle("student-browser-install-only", studentBrowserInstallOnly);

  document.querySelectorAll("[data-route]").forEach((button) => {
    const route = button.dataset.route;
    const allowed = APP_MODE !== "teacher" || !teacherAuth.authenticated || canUseRoute(route);
    button.hidden = !allowed;
    button.classList.toggle("active", route === currentRoute);
  });
  if (APP_MODE !== "teacher") {
    updateStudentNavigationVisibility();
  }
  if (APP_MODE === "teacher") updateTeacherNavSections();

  title.textContent = getRouteTitle(currentRoute);
  if (topActions) {
    topActions.innerHTML = "";
    if (APP_MODE === "teacher" && teacherAuth.authenticated) {
      if (teacherAuth.user?.role === "student_manager") {
        topActions.appendChild(el("span", { className: "auth-chip" }, "장학생 관리자"));
      }
      if (currentRoute === "attendance" && isTeacherAdmin()) {
        topActions.appendChild(button("출석 시간 설정", "btn secondary", "button", openAttendanceDeadlineModal));
        topActions.appendChild(button("출석 휴일 설정", "btn secondary", "button", openAttendanceHolidayModal));
      }
      if (currentRoute === "penalties" && hasTeacherPermission("penalties.write")) {
        topActions.appendChild(button("상/벌점 부여", "btn", "button", openPenaltyModal));
      }
      if (currentRoute !== "weekly-exams") topActions.appendChild(button("로그아웃", "btn secondary", "button", logoutTeacher));
    }
    topActions.hidden = !topActions.children.length;
  }

  if (studentBrowserInstallOnly) {
    app.innerHTML = "";
    app.appendChild(renderStudentBrowserInstallOnly());
    app.removeAttribute("data-loading-shell");
    if (APP_MODE !== "teacher" && typeof window.__studentAppReady === "function") window.__studentAppReady();
    return;
  }

  const routes =
    APP_MODE === "teacher"
      ? {
          home: renderHome,
          outing: renderTeacher,
          "weekly-exams": renderWeeklyExamManagement,
          "weekly-absences": renderWeeklyExamAbsenceManagement,
          grades: renderGradesManagement,
          fitness: renderFitnessManagement,
          penalties: renderPenaltyManagement,
          seats: renderSeatManagement,
          attendance: renderAttendanceManagement,
          "study-cafe-admin": renderStudyCafeAdmin,
          notices: renderNoticesAdmin,
          managers: renderManagersAdmin,
          students: renderStudentsAdmin,
          "device-history": renderDeviceHistoryAdmin,
          "student-preview": renderStudentPreviewAdmin,
          "track-options": renderTrackOptionsAdmin,
          "track-subjects": renderTrackSubjectManagement,
          duplicates: renderDuplicates,
          trash: renderTrash,
        }
      : {
          home: () => requireStudentAuth(renderStudentHome),
          student: () => requireStudentAuth(renderStudentChecklist),
          "student-verify": () => requireStudentAuth(renderStudentChecklist),
          "student-return": () => requireStudentAuth(renderStudentChecklist),
          "student-done": () => requireStudentAuth(renderStudentChecklist),
          attendance: () => requireStudentAuth(renderStudentAttendance),
          grades: () => requireStudentAuth(renderStudentGrades),
          mypage: () => requireStudentAuth(renderStudentMypage),
          "study-todo": () => requireStudentAuth(renderStudentStudyTodo),
          "study-cafe": () => requireStudentAuth(renderStudentStudyCafe),
          "study-timer": () => requireStudentAuth(renderStudentStudyTimer),
          "study-ranking": () => requireStudentAuth(renderStudentStudyRanking),
          "study-character": () => requireStudentAuth(renderStudentStudyCharacter),
          notices: () => requireStudentAuth(renderStudentNoticeList),
        };

  app.innerHTML = "";
  const renderRoute =
    routes[currentRoute] ||
    (APP_MODE !== "teacher" && currentRoute.startsWith("notice-") ? () => requireStudentAuth(renderStudentNoticeDetail) : routes[defaultRoute()]);
  app.appendChild(APP_MODE === "teacher" ? requireTeacherAuth(() => (canUseRoute(currentRoute) ? renderRoute() : renderForbidden())) : renderRoute());
  app.removeAttribute("data-loading-shell");
  if (APP_MODE !== "teacher" && typeof window.__studentAppReady === "function") window.__studentAppReady();
}

function renderStudyCafeStateUpdate() {
  render();
  app
    .querySelector(
      ".student-study-todo-page, .student-study-cafe-page, .student-study-timer-page, .student-study-ranking-page, .student-study-character-page"
    )
    ?.classList.add("study-view-static");
}

function getRouteTitle(route) {
  if (APP_MODE !== "teacher") {
    if (route === "attendance") return "출석 체크";
    if (route === "grades") return "성적";
    if (route === "study-todo") return "오늘 플래너";
    if (route === "study-cafe") return "온라인 스터디카페";
    if (route === "study-timer") return "과목 타이머";
    if (route === "study-ranking") return "순공시간 랭킹";
    if (route === "study-character") return "캐릭터";
    if (route === "notices" || route.startsWith("notice-")) return "중요 공지";
  }
  return routeTitles[route] || routeTitles.student;
}

async function initTeacherAuth() {
  teacherAuth.checked = false;
  teacherAuth.authenticated = false;
  render();

  try {
    const response = await fetch("/api/teacher-session", { credentials: "same-origin" });
    const data = response.ok ? await response.json() : { ok: false };
    teacherAuth.authenticated = Boolean(data.ok);
    teacherAuth.user = data.user || null;
  } catch (error) {
    console.error(error);
    teacherAuth.authenticated = false;
    teacherAuth.user = null;
  } finally {
    teacherAuth.checked = true;
    if (teacherAuth.authenticated && !canUseRoute(currentRoute)) currentRoute = firstAllowedTeacherRoute();
    render();
  }

  if (teacherAuth.authenticated) initRemoteStore();
}

function requireTeacherAuth(renderFn) {
  if (!teacherAuth.checked) return renderTeacherAuthLoading();
  return teacherAuth.authenticated ? renderFn() : renderTeacherAuth();
}

function updateTeacherNavSections() {
  document.querySelectorAll(".nav-section").forEach((section) => {
    let node = section.nextElementSibling;
    let hasVisibleButton = false;
    while (node && !node.classList?.contains("nav-section")) {
      if (node.matches?.("[data-route]") && !node.hidden) hasVisibleButton = true;
      node = node.nextElementSibling;
    }
    section.hidden = !hasVisibleButton;
  });
}

function renderForbidden() {
  return el("div", { className: "grid" }, [
    panel("접근 권한 없음", [el("div", { className: "empty" }, "이 계정으로는 해당 관리 메뉴를 사용할 수 없습니다.")]),
  ]);
}

function requireStudentAuth(renderFn) {
  return getAuthedStudent() ? renderFn() : renderStudentAuth();
}

function getAuthedStudent() {
  const student = findStudent(state.settings.studentAuthId);
  const profile = getStudentProfile(state.settings.studentAuthId);
  if (student && profile?.passwordHash && profile?.deviceToken) return student;
  if (!isStudyCafeLocalPreview()) return null;
  return (
    student ||
    findStudent(state.settings.lastStudentId) ||
    state.students[0] || {
      id: "20000",
      name: "온라인 미리보기",
      track: "온라인 수강",
      className: "온라인반",
      gender: "",
    }
  );
}

function ensureStudentProfiles() {
  if (!state.settings.studentProfiles) state.settings.studentProfiles = {};
  return state.settings.studentProfiles;
}

function getStudentProfile(studentId) {
  return ensureStudentProfiles()[String(studentId || "").trim()];
}

function renderStudentAuth() {
  const idInput = input("studentId", "text", "예: 18004", state.settings.studentAuthId || "");
  const lookupResult = el("div", { className: "student-auth-result", ariaLive: "polite" });
  const resetRequestArea = el("div", { className: "student-auth-reset-request", hidden: true });
  const profileArea = el("div", { className: "student-auth-profile", hidden: true });
  const studentNameNode = el("strong", { className: "student-auth-name" }, "-");
  let selectedStudent = null;

  const showResetRequestButton = (student) => {
    resetRequestArea.innerHTML = "";
    resetRequestArea.hidden = false;
    resetRequestArea.appendChild(
      button("등록기기 초기화", "btn secondary", "button", () =>
        openStudentRegistrationResetModal(student, () => {
          student.passwordHash = "";
          student.deviceToken = "";
          student.appRegisteredAt = "";
          if (state.settings.studentProfiles?.[student.id]) delete state.settings.studentProfiles[student.id];
          saveState({ skipRemote: true });
          hideResetRequestButton();
          profileArea.hidden = true;
          lookupResult.className = "student-auth-result success";
          lookupResult.textContent = "등록기기가 초기화되었습니다. 다시 조회한 뒤 새 기기로 등록해주세요.";
        })
      )
    );
  };

  const hideResetRequestButton = () => {
    resetRequestArea.innerHTML = "";
    resetRequestArea.hidden = true;
  };

  const lookupButton = button("조회", "btn secondary", "button", async () => {
    selectedStudent = findStudent(idInput.value);
    if (!selectedStudent && localDevStoreUrl) {
      await initLocalDevStore();
      selectedStudent = findStudent(idInput.value);
    }
    lookupResult.innerHTML = "";
    hideResetRequestButton();
    profileArea.hidden = true;

    if (!selectedStudent) {
      lookupResult.className = "student-auth-result error";
      lookupResult.textContent = "관리자가 등록한 학생 고유번호를 찾을 수 없습니다.";
      return;
    }

    const profile = getStudentProfile(selectedStudent.id) || {};
    const registeredTrack = normalizeCoastGuardTrack(selectedStudent.track || profile.initialTrack || profile.track);
    const registeredGender = selectedStudent.gender || profile.gender || "";
    const hasRegisteredTrack = Boolean(selectedStudent.appRegisteredAt && registeredTrack);
    const hasRegisteredGender = Boolean(selectedStudent.appRegisteredAt && registeredGender);

    trackSelect.disabled = hasRegisteredTrack;
    customTrackInput.disabled = hasRegisteredTrack;
    genderSelect.disabled = hasRegisteredGender;
    trackSelect.value = "";
    customTrackInput.value = "";
    customTrackField.hidden = true;
    if (registeredTrack) {
      const registeredOption = [...trackSelect.options].find((option) => option.value === registeredTrack);
      if (registeredOption) trackSelect.value = registeredTrack;
      else {
        trackSelect.value = "기타";
        customTrackInput.value = registeredTrack;
        customTrackField.hidden = false;
      }
    }
    if (registeredGender) genderSelect.value = registeredGender;
    studentNameNode.textContent = selectedStudent.name;
    lookupResult.className = "student-auth-result success";
    lookupResult.textContent = selectedStudent.appRegisteredAt
      ? `${selectedStudent.name} 학생이 확인되었습니다. 기존 비밀번호로 이 기기를 추가 등록할 수 있습니다.`
      : `${selectedStudent.name} 학생이 확인되었습니다.`;
    profileArea.hidden = false;
  });

  const trackSelect = select("track", ["", ...getCoastGuardTrackOptions()]);
  const trackPlaceholder = trackSelect.querySelector("option[value='']");
  trackPlaceholder.textContent = "직렬을 선택하세요";
  trackPlaceholder.disabled = true;
  trackSelect.value = "";
  const customTrackInput = input("customTrack", "text", "직렬을 입력하세요");
  const customTrackField = field("기타 직렬", customTrackInput);
  customTrackField.hidden = true;
  trackSelect.addEventListener("change", () => {
    customTrackField.hidden = trackSelect.value !== "기타";
    if (customTrackField.hidden) customTrackInput.value = "";
  });
  const genderSelect = select("gender", ["남", "여"]);
  const passwordInput = input("password", "password", "비밀번호");

  profileArea.append(
    field("이름", studentNameNode),
    field("직렬", trackSelect),
    customTrackField,
    field("성별", genderSelect),
    field("본인 비밀번호", passwordInput, "", "다음 접속 때 본인 확인에 사용합니다.")
  );

  const submitButton = button("시작하기", "btn");
  const form = el("form", { className: "student-auth-card" }, [
    el("div", {}, [
      el("h2", {}, "학생 등록"),
      el("p", {}, "고유번호를 입력해 본인 정보를 확인해주세요."),
    ]),
    field("학생 고유번호", el("div", { className: "student-auth-lookup" }, [idInput, lookupButton]), "", "예: 18기 4번 -> 18004"),
    lookupResult,
    resetRequestArea,
    profileArea,
    submitButton,
  ]);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = formData(form);
    const studentId = String(data.studentId || "").trim();
    selectedStudent = selectedStudent?.id === studentId ? selectedStudent : findStudent(studentId);

    if (!selectedStudent) {
      return notify("먼저 관리자가 등록한 고유번호를 조회해주세요.");
    }
    if (!isStandaloneStudentApp()) {
      openInstallGuideModal();
      return notify("홈화면에 추가한 뒤 홈화면 아이콘으로 다시 열어 등록해주세요.");
    }
    const profiles = ensureStudentProfiles();
    const existingProfile = profiles[studentId];
    const registeredTrack = normalizeCoastGuardTrack(selectedStudent.track || existingProfile?.initialTrack || existingProfile?.track);
    const finalTrack = registeredTrack || resolveStudentTrack(data.track, data.customTrack);
    const finalGender = selectedStudent.gender || existingProfile?.gender || data.gender;
    if (!finalTrack || !finalGender || !data.password) {
      return notify("직렬, 성별, 비밀번호를 모두 입력해주세요.");
    }

    const passwordHash = await hashStudentPassword(data.password);
    const deviceToken = existingProfile?.deviceToken || createDeviceToken();
    const authedAt = new Date().toISOString();
    let registration;

    setButtonLoading(submitButton, "기기 확인 중");
    submitButton.disabled = true;
    try {
      registration = await registerStudentDeviceWithServer({
        studentId,
        passwordHash,
        deviceToken,
        track: finalTrack,
        gender: finalGender,
      });
    } catch (error) {
      console.error(error);
      notify("기기 등록 서버에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.");
      return;
    } finally {
      submitButton.innerHTML = "";
      submitButton.textContent = "시작하기";
      submitButton.disabled = false;
    }

    if (!registration.ok) {
      if (registration.error === "device_limit_reached") {
        lookupResult.className = "student-auth-result error";
        lookupResult.textContent = "등록 가능한 기기 2대를 모두 사용 중입니다. 기존 기기를 초기화하거나 사무실에 문의해주세요.";
        showResetRequestButton(selectedStudent);
        return notify("등록 가능한 기기 2대를 모두 사용 중입니다.");
      }
      if (registration.error === "invalid_credentials") return notify("비밀번호가 일치하지 않습니다.");
      if (registration.error === "student_device_store_unavailable" || registration.httpStatus >= 500) {
        return notify("기기 등록 서버에 오류가 발생했습니다. 잠시 후 다시 시도하거나 사무실에 문의해주세요.");
      }
      return notify("기기를 등록하지 못했습니다. 잠시 후 다시 시도해주세요.");
    }

    profiles[studentId] = {
      initialTrack: existingProfile?.deviceToken ? existingProfile?.initialTrack || finalTrack : finalTrack,
      track: finalTrack,
      gender: finalGender,
      passwordHash,
      deviceToken,
      deviceId: registration.deviceId || existingProfile?.deviceId || "",
      deviceActiveCount: registration.activeCount || 1,
      authedAt,
    };
    selectedStudent.track = finalTrack;
    selectedStudent.gender = finalGender;
    selectedStudent.passwordHash = passwordHash;
    selectedStudent.deviceToken = deviceToken;
    selectedStudent.appRegisteredAt = authedAt;
    state.settings.studentAuthId = studentId;
    state.settings.lastStudentId = studentId;
    saveState({ skipRemote: true });
    currentRoute = "home";
    if (location.hash !== "#home") location.hash = "home";
    render();
    notify(`${selectedStudent.name}님 인증되었습니다.`);
  });

  return el("div", { className: "grid student-view" }, [form, renderStudentAuthInstallCard()].filter(Boolean));
}

function openStudentRegistrationResetModal(student, onSuccess) {
  const passwordInput = input("password", "password", "본인 비밀번호");
  const reasonInput = textarea("reason", "예: 앱으로만 사용했는데 등록된 기기라고 표시됩니다.");
  const forgotPasswordNotice = el(
    "p",
    { className: "student-forgot-password-notice", hidden: true },
    "비밀번호를 잊은 경우 본인 확인이 필요합니다. 사무실 또는 담당자에게 학생번호와 이름을 알려주세요."
  );
  const forgotPasswordButton = button("비밀번호를 잊었나요?", "mini-btn student-forgot-password-btn", "button", () => {
    forgotPasswordNotice.hidden = false;
  });
  const resetButton = button("초기화하기", "btn", "button", async () => {
    const passwordHash = await hashStudentPassword(passwordInput.value);
    const reason = String(reasonInput.value || "").trim();
    if (!passwordInput.value || !reason) {
      notify("본인 비밀번호와 초기화 사유를 입력해주세요.");
      return;
    }

    setButtonLoading(resetButton, "초기화 중");
    resetButton.disabled = true;
    try {
      const response = await fetch("/api/student-reset-registration", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: student.id,
          passwordHash,
          reason,
          client: {
            href: location.href,
            displayMode: isStandaloneStudentApp() ? "standalone" : "browser",
            userAgent: navigator.userAgent || "",
          },
        }),
      });
      const data = response.ok ? await response.json() : { ok: false };
      if (!data.ok) {
        if (data.error === "password_mismatch") notify("비밀번호가 일치하지 않습니다.");
        else if (data.error === "student_not_found") notify("학생 정보를 찾을 수 없습니다.");
        else notify("등록기기 초기화에 실패했습니다.");
        return;
      }
      closeInfoModal();
      onSuccess?.();
      notify("등록기기를 초기화했습니다.");
    } catch (error) {
      console.error(error);
      notify("등록기기 초기화 중 오류가 발생했습니다.");
    } finally {
      resetButton.disabled = false;
      resetButton.textContent = "초기화하기";
    }
  });

  openInfoModal({
    title: "등록기기 초기화",
    className: "student-reset-request-modal",
    content: el("div", { className: "student-reset-request-content" }, [
      el("p", {}, "본인 확인 후 기존 등록기기를 해제하고 이 기기에서 다시 등록할 수 있습니다."),
      field("본인 비밀번호", passwordInput),
      forgotPasswordButton,
      forgotPasswordNotice,
      field("초기화 사유", reasonInput),
      resetButton,
    ]),
  });
}

function isStandaloneStudentApp() {
  return Boolean(
    isLocalStudentPreview() ||
      window.matchMedia?.("(display-mode: standalone)")?.matches ||
      window.navigator.standalone ||
      document.referrer.startsWith("android-app://")
  );
}

function isLocalStudentPreview() {
  return ["localhost", "127.0.0.1", "::1"].includes(location.hostname);
}

function renderStudentBrowserInstallOnly() {
  return el("div", { className: "student-browser-install-only-view" }, [
    button("앱으로 이용하기", "btn student-browser-install-button", "button", installToHomeScreen),
  ]);
}

async function hashStudentPassword(password) {
  const value = String(password || "");
  if (window.crypto?.subtle) {
    const bytes = new TextEncoder().encode(value);
    const digest = await window.crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  return btoa(unescape(encodeURIComponent(value)));
}

function createDeviceToken() {
  const bytes = new Uint8Array(32);
  if (window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(bytes);
    return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

async function registerStudentDeviceWithServer({ studentId, passwordHash, deviceToken, track, gender }) {
  const response = await fetch("/api/student-devices", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "register",
      studentId,
      passwordHash,
      deviceToken,
      deviceLabel: getStudentDeviceLabel(),
      track,
      gender,
      client: {
        displayMode: isStandaloneStudentApp() ? "standalone" : "browser",
        userAgent: navigator.userAgent || "",
      },
    }),
  });
  const data = await response.json().catch(() => ({}));
  return { ...data, ok: response.ok && data.ok === true, httpStatus: response.status };
}

async function requestStudyCafeAction(action, payload = {}) {
  const student = getAuthedStudent();
  const profile = getStudentProfile(student?.id);
  if (!student || !isOnlineStudentExperience(student) || !profile?.deviceToken) {
    return { ok: false, error: "online_student_auth_required", httpStatus: 403 };
  }
  const response = await fetch("/api/study-cafe", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action,
      studentId: student.id,
      deviceToken: profile.deviceToken,
      ...payload,
      client: {
        displayMode: isStandaloneStudentApp() ? "standalone" : "browser",
        userAgent: navigator.userAgent || "",
      },
    }),
  });
  const data = await response.json().catch(() => ({}));
  return { ...data, ok: response.ok && data.ok === true, httpStatus: response.status };
}

function isStudyCafeRoute() {
  return ["study-todo", "study-cafe", "study-timer", "study-ranking", "study-character"].includes(currentRoute);
}

async function ensureStudyCafeRemoteLoaded(options = {}) {
  const student = getAuthedStudent();
  if (!isOnlineStudentExperience(student)) return false;
  if (studyCafeRemoteState.studentId && studyCafeRemoteState.studentId !== String(student.id)) {
    studyCafeRemoteState.available = null;
    studyCafeRemoteState.loaded = false;
    studyCafeRemoteState.room = null;
    studyCafeRemoteState.ranking = null;
    studyCafeRemoteState.todos = [];
    studyCafeRemoteState.todosByDate = {};
    studyCafeRemoteState.plannerDateKey = "";
    studyCafeRemoteState.plannerLoading = false;
    studyCafeRemoteState.summary = null;
    studyCafeRemoteState.error = "";
    studyCafeRemoteState.studyDateKey = "";
  }
  studyCafeRemoteState.studentId = String(student.id);
  ensureStudyCafeRemoteTimers();
  const force = options.force === true;
  if (studyCafeRemoteState.loading) return false;
  const retryDue = Date.now() - studyCafeRemoteState.lastAttemptAt >= 15000;
  if (!force && (studyCafeRemoteState.loaded || (studyCafeRemoteState.available === false && !retryDue))) {
    return studyCafeRemoteState.loaded;
  }
  studyCafeRemoteState.loading = true;
  studyCafeRemoteState.lastAttemptAt = Date.now();
  try {
    const result = await requestStudyCafeAction("load");
    if (!result.ok) {
      studyCafeRemoteState.error = result.error || "load_failed";
      if ([404, 501, 503].includes(result.httpStatus) || result.error === "service_role_not_configured") {
        studyCafeRemoteState.available = false;
        return false;
      }
      if (result.error === "device_not_active") {
        notify("현재 기기 인증이 만료되었습니다. 다시 등록해주세요.");
      }
      return false;
    }
    studyCafeRemoteState.available = true;
    studyCafeRemoteState.loaded = true;
    studyCafeRemoteState.error = "";
    studyCafeRemoteState.lastLoadedAt = Date.now();
    hydrateStudyCafeSnapshot(result);
    if (currentRoute === "home") updateStudyCafeHomeLiveCount();
    if (isStudyCafeRoute() && options.render !== false) renderStudyCafeStateUpdate();
    return true;
  } catch (error) {
    console.error(error);
    studyCafeRemoteState.available = false;
    studyCafeRemoteState.error = "network_error";
    return false;
  } finally {
    studyCafeRemoteState.loading = false;
  }
}

function hydrateStudyCafeSnapshot(snapshot) {
  const nextStudyDateKey =
    String(snapshot.studyDate || "").trim() ||
    formatStudyBusinessDateKey(new Date(snapshot.serverNow || Date.now()));
  const previousStudyDateKey = studyCafeRemoteState.studyDateKey;
  if (previousStudyDateKey && nextStudyDateKey && previousStudyDateKey !== nextStudyDateKey) {
    studyTimerStatsState.cache = {};
    studyCafeRemoteState.todos = [];
    studyCafeRemoteState.todosByDate = {};
    studyCafeRemoteState.plannerDateKey = nextStudyDateKey;
    if (formatStudyTimerDateKey(studyTimerStatsState.anchorDate) === previousStudyDateKey) {
      studyTimerStatsState.anchorDate = parseStudyTimerDateKey(nextStudyDateKey);
    }
  }
  studyCafeRemoteState.studyDateKey = nextStudyDateKey;
  if (!studyCafeRemoteState.plannerDateKey) {
    studyCafeRemoteState.plannerDateKey = nextStudyDateKey;
  }
  const subjects = Array.isArray(snapshot.subjects) ? snapshot.subjects.filter(Boolean).slice(0, 8) : [];
  if (subjects.length) studyCafePreviewState.customSubjects = subjects;
  if (snapshot.profile?.avatarTone) studyCafePreviewState.avatarTone = snapshot.profile.avatarTone;
  studyCafePreviewState.nickname = String(snapshot.profile?.nickname || "").trim();
  studyCafeRemoteState.room = Array.isArray(snapshot.room) ? snapshot.room : [];
  studyCafeRemoteState.ranking = Array.isArray(snapshot.ranking) ? snapshot.ranking : [];
  studyCafeRemoteState.rankingPeriods.daily = {
    ranking: studyCafeRemoteState.ranking,
    summary: snapshot.summary || null,
  };
  studyCafeRemoteState.todos = Array.isArray(snapshot.todos) ? snapshot.todos : [];
  studyCafeRemoteState.todosByDate[nextStudyDateKey] = studyCafeRemoteState.todos;
  studyCafeRemoteState.summary = snapshot.summary || null;

  const totals = {};
  Object.entries(snapshot.subjectTotals || {}).forEach(([subject, seconds]) => {
    totals[subject] = Math.max(0, Number(seconds) || 0) * 1000;
  });
  const active = snapshot.activeSession;
  const activeElapsedMs = Math.max(0, Number(active?.elapsedSeconds) || 0) * 1000;
  if (active?.subject && active?.status === "running") {
    totals[active.subject] = Math.max(0, (Number(totals[active.subject]) || 0) - activeElapsedMs);
  }
  studyCafePreviewState.subjectElapsedMs = totals;

  const presence = snapshot.presence;
  const previousSeatId = studyCafePreviewState.selectedSeatId;
  if (!studyCafePreviewState.nickname && presence?.displayName) {
    studyCafePreviewState.temporaryNickname = String(presence.displayName).trim();
  }
  studyCafePreviewState.selectedSeatId = presence?.seatNumber
    ? STUDY_CAFE_PREVIEW_SEATS[Number(presence.seatNumber) - 1]?.id || ""
    : "";
  if (!previousSeatId && presence?.seatNumber) {
    studyCafePreviewState.activeRoomIndex = getStudyCafeRoomIndexForSeat(presence.seatNumber);
  }
  studyCafePreviewState.subject = active?.subject || "";
  studyCafePreviewState.lastSubject = active?.subject || studyCafePreviewState.lastSubject;
  studyCafePreviewState.running = active?.status === "running";
  studyCafePreviewState.paused = active?.status === "paused";
  studyCafePreviewState.elapsedMs = studyCafePreviewState.paused ? activeElapsedMs : 0;
  studyCafePreviewState.startedAt = studyCafePreviewState.running ? Date.now() - activeElapsedMs : 0;
  studyCafePreviewState.subjectStartedAt = studyCafePreviewState.running ? Date.now() - activeElapsedMs : 0;
  const remoteIdleSince = Date.parse(presence?.idleSince || "");
  studyCafePreviewState.idleSince =
    studyCafePreviewState.selectedSeatId && !studyCafePreviewState.running
      ? Math.max(
          previousSeatId === studyCafePreviewState.selectedSeatId
            ? Number(studyCafePreviewState.idleSince) || 0
            : 0,
          Number.isFinite(remoteIdleSince) ? remoteIdleSince : Date.now()
        )
      : 0;
}

async function mutateStudyCafeRemote(action, payload = {}, options = {}) {
  if (studyCafeRemoteState.available !== true) {
    await ensureStudyCafeRemoteLoaded({ render: false });
  }
  if (studyCafeRemoteState.available !== true) {
    if (isStudyCafeLocalPreview()) return { ok: true, localOnly: true };
    if (options.notify !== false) {
      notify("스터디카페 서버 연결을 확인 중입니다. 잠시 후 다시 시도해주세요.");
    }
    return { ok: false, error: studyCafeRemoteState.error || "study_cafe_unavailable" };
  }
  try {
    const result = await requestStudyCafeAction(action, payload);
    if (!result.ok && options.notify !== false) {
      const message = result.error === "seat_taken"
        ? "방금 다른 학생이 이 좌석을 선택했습니다."
        : "스터디카페 정보를 저장하지 못했습니다. 잠시 후 다시 시도해주세요.";
      notify(message);
    }
    if ((result.ok && action !== "heartbeat") || result.error === "seat_taken") {
      requestStudyCafeRemoteRefresh();
    }
    return result;
  } catch (error) {
    console.error(error);
    if (options.notify !== false) notify("스터디카페 서버에 연결하지 못했습니다.");
    return { ok: false, error: "network_error" };
  }
}

function requestStudyCafeRemoteRefresh(
  delay = STUDY_CAFE_ACTION_REFRESH_DELAY_MS,
  options = {}
) {
  if (APP_MODE !== "student" || isStudyCafeLocalPreview()) return;
  window.clearTimeout(studyCafeRemoteState.requestedRefreshTimer);
  studyCafeRemoteState.requestedRefreshTimer = window.setTimeout(async () => {
    studyCafeRemoteState.requestedRefreshTimer = null;
    const student = getAuthedStudent();
    const shouldRefresh =
      isStudyCafeRoute() ||
      (currentRoute === "home" && isOnlineStudentExperience(student));
    if (!shouldRefresh || document.visibilityState === "hidden") return;
    const maxAgeMs = Math.max(0, Number(options.maxAgeMs) || 0);
    if (
      maxAgeMs &&
      studyCafeRemoteState.lastLoadedAt &&
      Date.now() - studyCafeRemoteState.lastLoadedAt < maxAgeMs
    ) {
      return;
    }
    if (studyCafeRemoteState.loading) {
      if (options.retryWhenLoading !== false) {
        requestStudyCafeRemoteRefresh(500, options);
      }
      return;
    }
    await ensureStudyCafeRemoteLoaded({ force: true });
  }, Math.max(0, Number(delay) || 0));
}

function bindStudyCafeLifecycleRefresh() {
  if (studyCafeRemoteState.lifecycleRefreshBound) return;
  studyCafeRemoteState.lifecycleRefreshBound = true;
  const refreshWhenActive = () => {
    if (document.visibilityState === "hidden") return;
    requestStudyCafeRemoteRefresh(180);
  };
  document.addEventListener("visibilitychange", refreshWhenActive);
  window.addEventListener("focus", refreshWhenActive);
  window.addEventListener("pageshow", refreshWhenActive);
}

function ensureStudyCafeRemoteTimers() {
  bindStudyCafeLifecycleRefresh();
  ensureStudyCafePreviewClock();
  if (!studyCafeRemoteState.refreshTimer) {
    studyCafeRemoteState.refreshTimer = window.setInterval(() => {
      const student = getAuthedStudent();
      if (
        document.visibilityState !== "hidden" &&
        (isStudyCafeRoute() || (currentRoute === "home" && isOnlineStudentExperience(student)))
      ) {
        requestStudyCafeRemoteRefresh();
      }
    }, STUDY_CAFE_SAFETY_REFRESH_INTERVAL_MS);
  }
  if (!studyCafeRemoteState.heartbeatTimer) {
    studyCafeRemoteState.heartbeatTimer = window.setInterval(() => {
      if (studyCafePreviewState.selectedSeatId) {
        mutateStudyCafeRemote("heartbeat", {}, { notify: false });
      }
    }, 30000);
  }
}

function getStudentDeviceLabel() {
  const userAgent = String(navigator.userAgent || "").toLowerCase();
  if (/iphone|ipad|ipod/.test(userAgent)) return "iPhone/iPad";
  if (userAgent.includes("android")) return "Android";
  if (userAgent.includes("windows")) return "Windows";
  if (userAgent.includes("macintosh") || userAgent.includes("mac os")) return "Mac";
  return "등록 기기";
}

function renderStudentHome() {
  const student = getAuthedStudent();
  const onlineMode = isOnlineStudentExperience(student);
  const activeOuting = !onlineMode && student ? getActiveOuting(student.id) : null;
  const todayAttendance = !onlineMode && student ? getStudentAttendanceForDate(student.id) : null;
  const holiday = onlineMode ? null : getAttendanceHoliday();
  const needsArrivalVerification = todayAttendance?.status === "pre_arrival_reason";
  const needsAttendance = !todayAttendance && !holiday && isAttendanceCheckOpen();
  const homeAction = getStudentHomeAction(activeOuting);
  return el("div", { className: "grid student-view student-home" }, [
    el("section", { className: "student-dday-card" }, [
      el("div", {}, [
        el("span", {}, COAST_GUARD_EXAM_LABEL),
        el("strong", {}, formatDday(COAST_GUARD_EXAM_DATE)),
      ]),
      el("p", {}, `${formatExamDate(COAST_GUARD_EXAM_DATE)} 시험 기준`),
    ]),
    onlineMode ? renderStudyCafeHomeCard(student) : null,
    onlineMode ? null : renderStudentImportantNoticeCard(),
    !onlineMode && holiday && !todayAttendance
      ? el("section", { className: "student-summary-card" }, [
          el("div", {}, [
            el("strong", {}, "출석 인증"),
            el("p", {}, attendanceHolidayMessage(holiday.dateKey)),
          ]),
        ])
      : null,
    !onlineMode && needsArrivalVerification
      ? el("section", { className: "student-summary-card" }, [
          el("div", {}, [
            el("strong", {}, "등원 인증 대기"),
            el("p", {}, "등원 전 사유신청이 접수되었습니다. 학원에 도착하면 등원 인증을 완료해주세요."),
          ]),
          button("등원 인증하기", "btn", "button", () => {
            state.settings.attendanceMode = "";
            saveState();
            navigate("attendance");
          }),
        ])
      : null,
    !onlineMode && needsAttendance
      ? el("section", { className: "student-summary-card" }, [
          el("div", {}, [
            el("strong", {}, "출석 인증"),
            el("p", {}, "오늘 출석 인증을 완료해주세요."),
          ]),
          button("출석 인증하기", "btn", "button", () => {
            state.settings.attendanceMode = "";
            saveState();
            navigate("attendance");
          }),
        ])
      : null,
    !onlineMode
      ? el("section", { className: "student-summary-card" }, [
          el("div", {}, [
            el("strong", {}, homeAction.title),
            homeAction.copy ? el("p", {}, homeAction.copy) : null,
          ]),
          button(homeAction.buttonText, "btn", "button", homeAction.action),
        ])
      : null,
  ]);
}

function renderHomeScreenInstallCard() {
  if (isRunningStandalone()) return null;
  return el("section", { className: "student-install-card" }, [
    el("div", {}, [
      el("strong", {}, "앱처럼 사용하기"),
      el("p", {}, "iPhone은 Safari와 Chrome의 공유 버튼 위치가 다릅니다."),
    ]),
    button("홈화면 추가", "btn secondary", "button", installToHomeScreen),
  ]);
}

function renderStudentAuthInstallCard() {
  if (isRunningStandalone()) return null;
  return el("section", { className: "student-install-card student-auth-install-card" }, [
    el("div", {}, [
      el("strong", {}, "앱처럼 이용하기"),
      el("p", {}, "iPhone은 Safari와 Chrome의 공유 버튼 위치가 다릅니다."),
    ]),
    button("앱으로 이용하기", "btn secondary", "button", installToHomeScreen),
  ]);
}

async function installToHomeScreen() {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    render();
    return;
  }

  openInstallGuideModal();
}

function openInstallGuideModal() {
  const userAgent = navigator.userAgent.toLowerCase();
  const isKakao = userAgent.includes("kakaotalk");
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isChromeIos = isIos && userAgent.includes("crios");
  const isSafariIos = isIos && userAgent.includes("safari") && !userAgent.includes("crios") && !userAgent.includes("fxios") && !userAgent.includes("edgios");
  const isAndroid = userAgent.includes("android");
  const pageUrl = location.href;
  const title = isKakao ? "브라우저에서 열어주세요" : "홈 화면에 추가하기";
  const guideMessage = isKakao
    ? "카카오톡 안에서는 홈 화면 추가가 잘 안 될 수 있습니다. 먼저 기본 브라우저로 열어주세요."
    : isIos
      ? "iPhone에서는 브라우저마다 공유 버튼 위치가 다릅니다. 현재 브라우저에 맞춰 진행해주세요."
      : "현재 브라우저에서 아래 순서대로 홈 화면에 추가해주세요.";
  const steps = isKakao
    ? [
        "카카오톡 오른쪽 아래 점 세 개 또는 공유 버튼을 누릅니다.",
        isIos ? "Safari로 열기를 선택합니다." : "다른 브라우저로 열기를 선택합니다.",
        "브라우저에서 공유 또는 메뉴를 눌러 홈 화면에 추가합니다.",
      ]
    : isChromeIos
      ? ["주소창 오른쪽의 공유 버튼을 누릅니다. 보이지 않으면 오른쪽 아래 점 세 개 메뉴에서 공유를 선택합니다.", "홈 화면에 추가를 선택합니다."]
      : isSafariIos
        ? ["하단 도구막대 또는 주소창 옆의 공유 버튼을 누릅니다.", "홈 화면에 추가를 선택합니다."]
        : isIos
          ? ["브라우저의 공유 버튼 또는 메뉴를 누릅니다.", "홈 화면에 추가를 선택합니다."]
      : ["브라우저 오른쪽 위 메뉴를 누릅니다.", "앱 설치 또는 홈 화면에 추가를 선택합니다.", "설치 또는 추가를 누릅니다."];

  const actions = [
    button("주소 복사", "btn secondary", "button", async () => {
      await copyText(pageUrl);
      notify("주소를 복사했습니다. 브라우저에 붙여넣어 열어주세요.");
    }),
  ];

  if (isKakao && isAndroid) {
    actions.unshift(button("Chrome으로 열기", "btn", "button", openCurrentPageInChrome));
  }

  openInfoModal({
    title,
    content: el("div", { className: "install-guide" }, [
      el(
        "p",
        {},
        guideMessage
      ),
      el(
        "ol",
        {},
        steps.map((step) => el("li", {}, step))
      ),
      el("div", { className: "install-guide-actions" }, actions),
    ]),
  });
}

function openCurrentPageInChrome() {
  const url = new URL(location.href);
  const fallback = encodeURIComponent(location.href);
  location.href = `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=${url.protocol.replace(":", "")};package=com.android.chrome;S.browser_fallback_url=${fallback};end`;
}

function isRunningStandalone() {
  return window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function renderStudentImportantNoticeCard() {
  const notices = getImportantNotices({ publishedOnly: true }).slice(0, 2);
  if (!notices.length) return null;
  return el("section", { className: "student-notice-card" }, [
    el("div", { className: "student-notice-head" }, [
      el("h3", {}, "중요 공지"),
      button("더보기", "student-notice-more", "button", () => navigate("notices")),
    ]),
    el(
      "div",
      { className: "student-notice-list" },
      notices.map((notice) => renderStudentNoticeRow(notice))
    ),
  ]);
}

function renderStudentNoticeRow(notice) {
  return button("", "student-notice-title", "button", () => navigate(`notice-${notice.id}`), [
    el("span", { className: "student-notice-title-text" }, notice.title),
    el("span", { className: "student-notice-arrow", ariaHidden: "true" }, ">"),
  ]);
}

function renderStudentNoticeList() {
  const notices = getImportantNotices({ publishedOnly: true });
  return el("div", { className: "grid student-view student-notices" }, [
    el("section", { className: "student-notices-panel" }, [
      el("div", { className: "student-notices-head" }, [
        el("h2", {}, "중요 공지"),
        button("홈", "mini-btn", "button", () => navigate("home")),
      ]),
      el(
        "div",
        { className: "student-notice-list full" },
        notices.length ? notices.map((notice) => renderStudentNoticeRow(notice)) : el("div", { className: "empty" }, "등록된 중요 공지가 없습니다.")
      ),
    ]),
  ]);
}

function renderStudentNoticeDetail() {
  const noticeId = currentRoute.replace(/^notice-/, "");
  const notice = getImportantNoticeById(noticeId, { publishedOnly: true });
  if (!notice) {
    return el("div", { className: "grid student-view student-notices" }, [
      el("section", { className: "student-notices-panel" }, [
        el("h2", {}, "공지글을 찾을 수 없습니다"),
        el("p", {}, "삭제되었거나 주소가 변경된 공지입니다."),
        button("목록으로", "btn secondary", "button", () => navigate("notices")),
      ]),
    ]);
  }
  return el("div", { className: "grid student-view student-notices" }, [
    el("article", { className: "student-notice-detail" }, [
      el("div", { className: "student-notice-detail-head" }, [
        el("span", {}, formatNoticeDate(notice.createdAt)),
        el("h2", {}, notice.title),
      ]),
      el(
        "div",
        { className: "student-notice-body" },
        splitNoticeBody(notice.body).map((paragraph) => el("p", {}, paragraph))
      ),
      el("div", { className: "student-notice-actions" }, [
        button("목록으로", "btn secondary", "button", () => navigate("notices")),
        button("홈으로", "btn", "button", () => navigate("home")),
      ]),
    ]),
  ]);
}

function formatNoticeDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10).replaceAll("-", ".");
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function splitNoticeBody(value) {
  return String(value || "")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function getStudentHomeStatus(outing) {
  if (!outing) {
    return {
      dot: "active",
      title: "해양경찰 시험 준비 중.",
      copy: "",
    };
  }
  if (outing.earlyLeaveReason) {
    if (outing.decision === "approved") {
      return {
        dot: "active",
        title: "조퇴 완료되었습니다.",
        copy: "",
      };
    }
    if (outing.decision === "rejected") {
      return {
        dot: "pending",
        title: "조퇴 신청이 반려되었습니다.",
        copy: "사무실에 문의해주세요.",
      };
    }
    return {
      dot: "pending",
      title: "조퇴 신청이 접수되었습니다.",
      copy: "승인 대기 중입니다.",
    };
  }
  if (outing.status === "requested") {
    return {
      dot: "pending",
      title: "외출 신청 후 사진 인증이 필요합니다",
      copy: `${outing.reason} 외출 신청이 접수되었습니다. 현장 인증 사진을 제출해주세요.`,
    };
  }
  return {
    dot: "pending",
    title: "외출 중입니다",
    copy: "학원에 도착했다면 복귀 인증을 완료해주세요.",
  };
}

function getStudentHomeAction(outing) {
  if (!outing) {
    return {
      title: "외출 신청",
      copy: "",
      buttonText: "외출 신청하기",
      action: () => navigate("student"),
    };
  }
  if (outing.earlyLeaveReason) {
    return {
      title: "조퇴 신청",
      copy: outing.decision === "approved" ? "조퇴 처리가 완료되었습니다." : "처리 상태를 확인할 수 있습니다.",
      buttonText: "상태 확인하기",
      action: () => navigate("student"),
    };
  }
  if (outing.status === "requested") {
    return {
      title: "다음 단계",
      copy: "현장 인증 사진이 필요합니다.",
      buttonText: "사진 인증하기",
      action: () => navigate("student-verify"),
    };
  }
  return {
    title: "다음 단계",
    copy: "복귀했다면 사무실에서 복귀 인증을 완료하세요.",
    buttonText: "복귀 인증하기",
    action: () => navigate("student-return"),
  };
}

function renderStudentMypage() {
  const student = getAuthedStudent();
  const profile = getStudentProfile(student.id) || {};
  return el("div", { className: "grid student-view student-mypage" }, [
    el("section", { className: "student-profile-card" }, [
      el("div", { className: "student-profile-head" }, [
        el("div", { className: "student-avatar" }, student.name.slice(0, 1)),
        el("div", {}, [
          el("span", {}, "로그인 정보"),
          el("div", { className: "student-profile-name-row" }, [
            el("h2", {}, student.name),
            button("정보 수정", "mini-btn", "button", () => notify("정보 수정은 사무실에 문의해주세요.")),
          ]),
        ]),
      ]),
      el("div", { className: "student-profile-list" }, [
        profileItem("학생 고유번호", student.id),
        profileItem("반", student.className || state.settings.className || "오프라인반"),
        profileItem("직렬", normalizeCoastGuardTrack(profile.track) || "-"),
        profileItem("성별", profile.gender || "-"),
      ]),
    ]),
    renderStudentOutingHistoryButton(student.id),
    renderStudentPenaltyHistoryButton(student.id),
    renderStudentDeviceManagementCard(student, profile),
    renderHomeScreenInstallCard(),
  ]);
}

function isOnlineStudyStudent(student) {
  return String(student?.id || "").trim().startsWith("2");
}

function isStudyCafeLocalPreview() {
  if (!isLocalStudentPreview()) return false;
  return new URLSearchParams(location.search).get("studentMode") === "online";
}

function isOnlineStudentExperience(student) {
  return isOnlineStudyStudent(student) || isStudyCafeLocalPreview();
}

function ensureStudyCafeTemporaryNickname() {
  if (studyCafePreviewState.nickname) return studyCafePreviewState.nickname;
  if (studyCafePreviewState.temporaryNicknameAwaitingEntry) return "";
  if (!studyCafePreviewState.temporaryNickname) {
    const mood =
      STUDY_CAFE_TEMP_NICKNAME_MOODS[
        Math.floor(Math.random() * STUDY_CAFE_TEMP_NICKNAME_MOODS.length)
      ];
    const animal =
      STUDY_CAFE_TEMP_NICKNAME_ANIMALS[
        Math.floor(Math.random() * STUDY_CAFE_TEMP_NICKNAME_ANIMALS.length)
      ];
    studyCafePreviewState.temporaryNickname = `${mood}${animal}`;
  }
  return studyCafePreviewState.temporaryNickname;
}

function getStudyCafeDisplayName(fallback = "나") {
  return (
    studyCafePreviewState.nickname ||
    studyCafePreviewState.temporaryNickname ||
    fallback
  );
}

function updateStudentNavigationVisibility() {
  const student = getAuthedStudent();
  const onlineMode = Boolean(student && isOnlineStudentExperience(student));
  const studyMode = onlineMode && ["study-todo", "study-cafe", "study-ranking", "study-timer", "study-character"].includes(currentRoute);
  document.body.classList.toggle("student-online-mode", onlineMode);
  document.body.classList.toggle("student-study-mode", studyMode);
  document.querySelectorAll('[data-route="study-cafe"]').forEach((item) => {
    item.hidden = !onlineMode;
  });
  ["student", "attendance"].forEach((route) => {
    document.querySelectorAll(`[data-route="${route}"]`).forEach((item) => {
      item.hidden = onlineMode;
    });
  });
  const normalFooter = document.querySelector(".normal-student-footer");
  const studyFooter = document.querySelector(".study-cafe-footer-menu");
  if (normalFooter) normalFooter.setAttribute("aria-hidden", studyMode ? "true" : "false");
  if (studyFooter) studyFooter.setAttribute("aria-hidden", studyMode ? "false" : "true");
}

function renderStudyCafeHomeCard(student) {
  ensureStudyCafeRemoteLoaded({ render: false });
  const seated = Boolean(studyCafePreviewState.selectedSeatId);
  const active = Boolean(studyCafePreviewState.selectedSeatId && studyCafePreviewState.subject);
  const focusedCount = getStudyCafeFocusedCount();
  const selectedSeatNumber = STUDY_CAFE_PREVIEW_SEATS.findIndex(
    (seat) => seat.id === studyCafePreviewState.selectedSeatId
  ) + 1;
  const title = active
    ? `${studyCafePreviewState.subject} 공부 중`
    : seated
      ? `${selectedSeatNumber}번 좌석 이용 중`
      : "론박 온라인 스터디카페";
  return el("section", { className: "student-study-cafe-card" }, [
    el("div", { className: "student-study-cafe-card-copy" }, [
      el("span", { className: "student-study-cafe-card-kicker" }, active ? "집중 타이머" : seated ? "좌석 이용 중" : "ONLINE STUDY CAFE"),
      el("strong", {}, title),
      el(
        "span",
        { className: "student-study-cafe-live-count", "data-study-cafe-home-live-count": "true" },
        formatStudyCafeLiveCount(focusedCount)
      ),
      renderStudyCafeHomeAvatarStack(focusedCount),
    ]),
    button("스터디카페 보기", "btn", "button", () => navigate("study-cafe")),
  ]);
}

function getStudyCafeFocusedCount() {
  const remoteCount = Number(studyCafeRemoteState.summary?.focusedCount);
  if (studyCafeRemoteState.summary && Number.isFinite(remoteCount)) {
    return Math.max(0, remoteCount);
  }
  if (!isStudyCafeLocalPreview()) return null;
  const active = Boolean(studyCafePreviewState.selectedSeatId && studyCafePreviewState.subject);
  return STUDY_CAFE_PREVIEW_SEATS.filter((seat) => seat.occupant).length + (active ? 1 : 0);
}

function formatStudyCafeLiveCount(count) {
  return Number.isFinite(count) ? `● 현재 ${count}명 함께 공부 중` : "● 실시간 인원 연결 중";
}

function renderStudyCafeHomeAvatarStack(count) {
  const normalizedCount = Number.isFinite(count) ? Math.max(0, Number(count)) : null;
  const tones = ["blue", "mint", "purple"];
  const visibleCount = normalizedCount === null ? 0 : Math.min(3, normalizedCount);
  const children = tones.slice(0, visibleCount).map(renderStudyCafeMiniAvatar);
  if (normalizedCount === null || normalizedCount === 0 || normalizedCount > visibleCount) {
    children.push(
      el(
        "span",
        { className: "student-study-cafe-avatar-more" },
        normalizedCount === null ? "…" : normalizedCount === 0 ? "0" : `+${normalizedCount - visibleCount}`
      )
    );
  }
  return el(
    "div",
    {
      className: "student-study-cafe-avatar-stack",
      "data-study-cafe-home-avatar-stack": "true",
      ariaLabel: normalizedCount === null ? "실시간 공부 인원 연결 중" : `현재 ${normalizedCount}명 함께 공부 중`,
    },
    children
  );
}

function updateStudyCafeHomeLiveCount() {
  const count = getStudyCafeFocusedCount();
  document.querySelectorAll("[data-study-cafe-home-live-count]").forEach((node) => {
    node.textContent = formatStudyCafeLiveCount(count);
  });
  document.querySelectorAll("[data-study-cafe-home-avatar-stack]").forEach((node) => {
    node.replaceWith(renderStudyCafeHomeAvatarStack(count));
  });
}

function renderStudyCafeMiniAvatar(tone) {
  return el("span", { className: `study-cafe-mini-avatar ${tone}` }, [
    el("i", { className: "study-cafe-mini-avatar-hair" }),
    el("i", { className: "study-cafe-mini-avatar-face" }),
  ]);
}

function renderStudentStudyTodo() {
  const student = getAuthedStudent();
  if (!isOnlineStudentExperience(student)) {
    return el("div", { className: "grid student-view student-study-cafe-access" }, [
      el("section", { className: "student-study-cafe-access-card" }, [
        el("span", { className: "study-cafe-access-icon", ariaHidden: "true" }, "✓"),
        el("h2", {}, "온라인 수강생 전용 플래너입니다"),
        el("p", {}, "과목별 플래너는 등록번호가 2로 시작하는 인터넷 강의 수강생만 이용할 수 있습니다."),
        button("홈으로", "btn secondary", "button", () => navigate("home")),
      ]),
    ]);
  }

  ensureStudyCafeRemoteLoaded();
  const subjects = getStudyTimerSubjects(student);
  const subjectSet = new Set(subjects);
  const selectedDateKey = getSelectedStudyTodoDateKey();
  const selectedDateLabel = getStudyTodoRelativeDateLabel(selectedDateKey);
  const todos = getStudyTodosForDate(selectedDateKey)
    .filter((todo) => subjectSet.has(String(todo.subject || "").trim()));
  const completedCount = todos.filter((todo) => todo.completed).length;
  const progress = todos.length ? Math.round((completedCount / todos.length) * 100) : 0;

  return el("div", { className: "student-study-todo-page" }, [
    el("header", { className: "study-todo-page-head" }, [
      button("홈", "study-todo-home-button", "button", () => navigate("home")),
      el("div", {}, [
        el("span", {}, getStudyTodoDateLabel(selectedDateKey)),
        el("h2", {}, `${selectedDateLabel} 플래너`),
      ]),
      el("strong", {}, `${completedCount}/${todos.length}`),
    ]),
    renderStudyTodoDateNavigation(selectedDateKey),
    studyCafeRemoteState.plannerLoading
      ? el("p", { className: "study-todo-date-loading" }, "플래너를 불러오는 중입니다.")
      : null,
    el("section", { className: "study-todo-progress-card" }, [
      el("div", {}, [
        el("span", {}, `${selectedDateLabel} 달성률`),
        el("strong", {}, `${progress}%`),
      ]),
      el("span", { className: "study-todo-progress-track", ariaLabel: `${selectedDateLabel} 플래너 ${progress}% 완료` }, [
        el("i", { style: `width:${progress}%` }),
      ]),
      el("p", {}, todos.length
        ? `${todos.length - completedCount}개의 할 일이 남아 있어요.`
        : `${selectedDateLabel} 할 일을 과목별로 작성해보세요.`),
    ]),
    el(
      "div",
      { className: "study-todo-subject-list" },
      subjects.map((subject) => renderStudyTodoSubjectCard(subject, todos))
    ),
  ]);
}

function renderStudyTodoSubjectCard(subject, todos) {
  const subjectTodos = todos.filter((todo) => todo.subject === subject);
  const completedCount = subjectTodos.filter((todo) => todo.completed).length;
  const textInput = el("input", {
    className: "study-todo-input",
    type: "text",
    maxLength: 80,
    placeholder: `${subject} 할 일 추가`,
    ariaLabel: `${subject} 할 일`,
    autocomplete: "off",
  });
  const submitButton = el(
    "button",
    {
      className: "study-todo-submit-button",
      type: "submit",
      ariaLabel: `${subject} 할 일 등록`,
      title: "등록",
    },
    "✓"
  );
  const form = el("form", { className: "study-todo-add-form", hidden: true }, [textInput, submitButton]);
  const addButton = el(
    "button",
    {
      className: "study-todo-add-button",
      type: "button",
      ariaLabel: `${subject} 할 일 추가`,
      ariaExpanded: "false",
      title: "할 일 추가",
    },
    "+"
  );
  addButton.addEventListener("click", () => {
    const willOpen = form.hidden;
    form.hidden = !willOpen;
    addButton.setAttribute("aria-expanded", willOpen ? "true" : "false");
    addButton.setAttribute("aria-label", `${subject} 할 일 ${willOpen ? "입력 닫기" : "추가"}`);
    addButton.textContent = willOpen ? "×" : "+";
    if (willOpen) textInput.focus();
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const content = String(textInput.value || "").trim();
    if (!content) return notify("할 일을 입력해주세요.");
    submitButton.disabled = true;
    const studyDate = getSelectedStudyTodoDateKey();
    const optimisticTodo = {
      id: `pending-todo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      subject,
      content,
      completed: false,
      studyDate,
      pending: true,
    };
    setStudyTodosForDate(studyDate, [...getStudyTodosForDate(studyDate), optimisticTodo]);
    renderStudyCafeStateUpdate();
    const result = await mutateStudyCafeRemote("todo_create", { subject, content, studyDate });
    if (!result.ok) {
      setStudyTodosForDate(
        studyDate,
        getStudyTodosForDate(studyDate).filter((todo) => todo.id !== optimisticTodo.id)
      );
      renderStudyCafeStateUpdate();
      return;
    }
    const todo = result.todo || {
      ...optimisticTodo,
      id: `local-todo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      subject,
      content,
      completed: false,
      studyDate,
      pending: false,
    };
    setStudyTodosForDate(
      studyDate,
      getStudyTodosForDate(studyDate).map((item) =>
        item.id === optimisticTodo.id ? todo : item
      )
    );
    renderStudyCafeStateUpdate();
  });

  return el("section", { className: "study-todo-subject-card" }, [
    el("div", { className: "study-todo-subject-head" }, [
      el("div", { className: "study-todo-subject-copy" }, [
        el("div", { className: "study-todo-subject-title" }, [
          el("strong", {}, subject),
          subject === studyCafePreviewState.subject
            ? el("span", { className: "study-todo-current-subject" }, "현재 공부 중")
            : null,
        ]),
        el("span", {}, `${completedCount}/${subjectTodos.length} 완료`),
      ]),
      el("div", { className: "study-todo-subject-actions" }, [
        addButton,
      ]),
    ]),
    subjectTodos.length
      ? el(
          "div",
          { className: "study-todo-items" },
          subjectTodos.map((todo) => renderStudyTodoItem(todo))
        )
      : null,
    form,
  ]);
}

function renderStudyTodoItem(todo) {
  const checkbox = el("input", {
    type: "checkbox",
    checked: Boolean(todo.completed),
    disabled: todo.pending === true,
    ariaLabel: `${todo.content} 완료`,
  });
  checkbox.addEventListener("change", () => updateStudyTodoCompletion(todo, checkbox));
  const deleteButton = button("삭제", "study-todo-delete-button", "button", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (todo.pending) return;
    if (!confirm(`"${todo.content}" 항목을 삭제할까요?`)) return;
    deleteButton.disabled = true;
    const studyDate = getSelectedStudyTodoDateKey();
    const result = await mutateStudyCafeRemote("todo_delete", { todoId: todo.id, studyDate });
    if (!result.ok) {
      deleteButton.disabled = false;
      return;
    }
    setStudyTodosForDate(
      studyDate,
      getStudyTodosForDate(studyDate).filter((item) => item.id !== todo.id)
    );
    renderStudyCafeStateUpdate();
    notify("할 일을 삭제했습니다.");
  });
  deleteButton.disabled = todo.pending === true;

  return el("label", { className: `study-todo-item ${todo.completed ? "completed" : ""} ${todo.pending ? "pending" : ""}` }, [
    checkbox,
    el("span", {}, todo.content),
    deleteButton,
  ]);
}

async function updateStudyTodoCompletion(todo, checkbox) {
  checkbox.disabled = true;
  const completed = checkbox.checked;
  const result = await mutateStudyCafeRemote("todo_toggle", {
    todoId: todo.id,
    completed,
    studyDate: todo.studyDate || getSelectedStudyTodoDateKey(),
  });
  checkbox.disabled = false;
  if (!result.ok) {
    checkbox.checked = !completed;
    return;
  }
  const studyDate = todo.studyDate || getSelectedStudyTodoDateKey();
  setStudyTodosForDate(
    studyDate,
    getStudyTodosForDate(studyDate).map((item) =>
      item.id === todo.id ? { ...item, completed } : item
    )
  );
  renderStudyCafeStateUpdate();
}

function getStudyTodoDateLabel(key = getSelectedStudyTodoDateKey()) {
  const date = parseStudyTimerDateKey(key);
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(date);
}

function getStudyTodoRelativeDateLabel(studyDate) {
  if (studyDate === getStudyTodoDateKeyByOffset(0)) return "오늘";
  if (studyDate === getStudyTodoDateKeyByOffset(-1)) return "어제";
  if (studyDate === getStudyTodoDateKeyByOffset(1)) return "내일";
  const date = parseStudyTimerDateKey(studyDate);
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

function getSelectedStudyTodoDateKey() {
  return (
    studyCafeRemoteState.plannerDateKey ||
    studyCafeRemoteState.studyDateKey ||
    formatStudyBusinessDateKey(new Date())
  );
}

function getStudyTodosForDate(studyDate) {
  return Array.isArray(studyCafeRemoteState.todosByDate?.[studyDate])
    ? studyCafeRemoteState.todosByDate[studyDate]
    : [];
}

function setStudyTodosForDate(studyDate, todos) {
  studyCafeRemoteState.todosByDate[studyDate] = Array.isArray(todos) ? todos : [];
  if (studyDate === studyCafeRemoteState.studyDateKey) {
    studyCafeRemoteState.todos = studyCafeRemoteState.todosByDate[studyDate];
  }
}

function getStudyTodoDateKeyByOffset(offset, fromDateKey = "") {
  const baseKey =
    fromDateKey ||
    studyCafeRemoteState.studyDateKey ||
    formatStudyBusinessDateKey(new Date());
  const date = parseStudyTimerDateKey(baseKey);
  date.setDate(date.getDate() + offset);
  return formatStudyTimerDateKey(date);
}

function renderStudyTodoDateNavigation(selectedDateKey) {
  const previousDateKey = getStudyTodoDateKeyByOffset(-1, selectedDateKey);
  const nextDateKey = getStudyTodoDateKeyByOffset(1, selectedDateKey);
  const relativeLabel = getStudyTodoRelativeDateLabel(selectedDateKey);
  return el(
    "nav",
    { className: "study-todo-date-navigation", ariaLabel: "플래너 날짜 선택" },
    [
      el("button", {
        className: "study-todo-date-arrow",
        type: "button",
        textContent: "‹",
        ariaLabel: "이전 날짜",
        onclick: () => selectStudyTodoDate(previousDateKey),
      }),
      el("div", { className: "study-todo-date-current", ariaLive: "polite" }, [
        el("strong", {}, getStudyTodoDateLabel(selectedDateKey)),
        el("span", {}, relativeLabel),
      ]),
      el("button", {
        className: "study-todo-date-arrow",
        type: "button",
        textContent: "›",
        ariaLabel: "다음 날짜",
        onclick: () => selectStudyTodoDate(nextDateKey),
      }),
    ]
  );
}

async function selectStudyTodoDate(studyDate) {
  if (studyCafeRemoteState.plannerLoading) return;
  studyCafeRemoteState.plannerDateKey = studyDate;
  if (Object.prototype.hasOwnProperty.call(studyCafeRemoteState.todosByDate, studyDate)) {
    renderStudyCafeStateUpdate();
    return;
  }
  if (isStudyCafeLocalPreview() || studyCafeRemoteState.available !== true) {
    setStudyTodosForDate(studyDate, []);
    renderStudyCafeStateUpdate();
    return;
  }
  studyCafeRemoteState.plannerLoading = true;
  renderStudyCafeStateUpdate();
  const result = await requestStudyCafeAction("todos_load", { studyDate });
  studyCafeRemoteState.plannerLoading = false;
  if (!result.ok) {
    notify("선택한 날짜의 플래너를 불러오지 못했습니다.");
    renderStudyCafeStateUpdate();
    return;
  }
  setStudyTodosForDate(studyDate, result.todos || []);
  renderStudyCafeStateUpdate();
}

function renderStudentStudyCafe() {
  const student = getAuthedStudent();
  if (!isOnlineStudentExperience(student)) {
    return el("div", { className: "grid student-view student-study-cafe-access" }, [
      el("section", { className: "student-study-cafe-access-card" }, [
        el("span", { className: "study-cafe-access-icon", ariaHidden: "true" }, "☕"),
        el("h2", {}, "온라인 수강생 전용 공간입니다"),
        el("p", {}, "론박 온라인 스터디카페는 등록번호가 2로 시작하는 인터넷 강의 수강생만 이용할 수 있습니다."),
        button("홈으로", "btn secondary", "button", () => navigate("home")),
      ]),
    ]);
  }

  ensureStudyCafeTemporaryNickname();
  ensureStudyCafeRemoteLoaded();
  ensureStudyCafePreviewClock();
  const seated = Boolean(studyCafePreviewState.selectedSeatId);
  const active = Boolean(studyCafePreviewState.selectedSeatId && studyCafePreviewState.subject);
  const selectedSeatNumber = STUDY_CAFE_PREVIEW_SEATS.findIndex(
    (seat) => seat.id === studyCafePreviewState.selectedSeatId
  ) + 1;
  const activeRoomIndex = Math.min(
    STUDY_CAFE_ROOMS.length - 1,
    Math.max(0, Number(studyCafePreviewState.activeRoomIndex) || 0)
  );
  const activeRoom = STUDY_CAFE_ROOMS[activeRoomIndex];
  const visibleSeats = STUDY_CAFE_PREVIEW_SEATS.slice(activeRoom.startSeat - 1, activeRoom.endSeat);
  const focusedCount = getStudyCafeFocusedCount();

  return el("div", { className: "student-study-cafe-page" }, [
    el("section", {
      className: `study-cafe-room theme-${activeRoom.theme}`,
      ariaLabel: `${activeRoom.label} ${activeRoom.mood} 좌석 배치`,
      "data-study-cafe-room": "true",
    }, [
      el("div", { className: "study-cafe-room-toolbar" }, [
        el("div", { className: "study-cafe-room-identity" }, [
          el("strong", {}, "RONPARK STUDYCAFE"),
          el(
            "span",
            { "data-study-cafe-room-mood": "true" },
            `${activeRoom.label} · ${activeRoom.mood}`
          ),
        ]),
        el("div", { className: "study-cafe-room-toolbar-actions" }, [
          el(
            "span",
            { className: "study-cafe-live-chip" },
            Number.isFinite(focusedCount) ? `● ${focusedCount}명 집중 중` : "● 실시간 인원 연결 중"
          ),
        ]),
      ]),
      seated ? renderStudyCafeMySeatCard(student, selectedSeatNumber) : null,
      el("div", { className: "study-cafe-room-label-row" }, [
        el(
          "span",
          { "data-study-cafe-room-context": "true" },
          getStudyCafeRoomContextText(activeRoomIndex, selectedSeatNumber)
        ),
      ]),
      renderStudyCafeRoomTabs(student),
      el(
        "div",
        { className: "study-cafe-seat-grid", "data-study-cafe-seat-grid": "true" },
        visibleSeats.map((seat, index) =>
          renderStudyCafeSeat(seat, activeRoom.startSeat - 1 + index, student)
        )
      ),
    ]),
    seated
      ? null
      : el("section", { className: "study-cafe-start-guide" }, [
          el("div", {}, [
            el("strong", {}, "공부를 시작해볼까요?"),
            el("p", {}, "빈자리를 누르고 과목만 선택하면 바로 시작됩니다."),
          ]),
          el("span", { ariaHidden: "true" }, "→"),
        ]),
    active ? renderStudyCafeFloatingActions(student) : null,
  ]);
}

function renderStudyCafeMySeatCard(student, seatNumber) {
  const active = Boolean(studyCafePreviewState.subject);
  const statusLabel = studyCafePreviewState.paused
    ? "일시정지"
    : studyCafePreviewState.running
      ? "집중 중"
      : "착석 중";
  const detail = active
    ? `${studyCafePreviewState.subject} 공부 중`
    : "공부할 과목을 선택해주세요";

  return el("section", { className: "study-cafe-my-seat-card", ariaLabel: "내 좌석 정보" }, [
    el("div", { className: "study-cafe-my-seat-character", ariaHidden: "true" }, [
      el("span", { className: "study-cafe-my-seat-scene" }, [
        renderStudyCafeChairBack(),
        renderStudyCafeAvatar(studyCafePreviewState.avatarTone || "navy", true, { includeArms: false }),
        el("span", { className: "study-cafe-desk" }, [
          el("i", { className: "study-cafe-desk-book" }),
          el("i", { className: "study-cafe-desk-cup" }),
        ]),
        renderStudyCafeWritingArms(),
      ]),
    ]),
    el("div", { className: "study-cafe-my-seat-copy" }, [
      el("span", { className: "study-cafe-my-seat-eyebrow" }, "내 좌석"),
      el("div", { className: "study-cafe-my-seat-title" }, [
        el("strong", {}, `${seatNumber}번 좌석`),
        el("span", { className: `study-cafe-my-seat-status ${studyCafePreviewState.paused ? "paused" : studyCafePreviewState.running ? "running" : "seated"}` }, statusLabel),
      ]),
      el("p", {}, [
        el("strong", {}, getStudyCafeDisplayName("나")),
        el("span", {}, ` · ${summarizeStudyCafeTrack(student?.track)}`),
      ]),
      el("div", { className: "study-cafe-my-seat-detail" }, [
        el("span", {}, detail),
      ]),
      active
        ? null
        : el("div", { className: "study-cafe-my-seat-idle-buttons" }, [
            button(
              "과목 선택",
              "study-cafe-my-seat-subject-button",
              "button",
              () => openStudyCafeSubjectModal(studyCafePreviewState.selectedSeatId, student)
            ),
            button(
              "자리 비우기",
              "study-cafe-my-seat-release-button",
              "button",
              releaseStudyCafeSeat
            ),
          ]),
    ]),
    el("div", { className: "study-cafe-my-seat-actions" }, [
      active
        ? button(
            "⛶ 전체화면",
            "study-cafe-my-seat-fullscreen-button",
            "button",
            openStudyTimerFullscreen
          )
        : null,
      el(
        "time",
        {
          "data-study-member-time": "mine",
          ariaLabel: "오늘 총 순공시간",
        },
        formatStudyCafeMemberTime(getStudyCafeMemberSeconds(null, true))
      ),
    ]),
  ]);
}

function getStudyCafeRoomIndexForSeat(seatNumber) {
  const normalizedSeat = Math.min(
    STUDY_CAFE_SEAT_COUNT,
    Math.max(1, Number(seatNumber) || 1)
  );
  return Math.floor((normalizedSeat - 1) / STUDY_CAFE_ROOM_SIZE);
}

function getStudyCafeRoomOccupancyCount(roomIndex) {
  const room = STUDY_CAFE_ROOMS[roomIndex];
  if (!room) return 0;
  const selectedSeatNumber = STUDY_CAFE_PREVIEW_SEATS.findIndex(
    (seat) => seat.id === studyCafePreviewState.selectedSeatId
  ) + 1;
  if (studyCafeRemoteState.available === true) {
    return (studyCafeRemoteState.room || []).filter((member) => {
      const seatNumber = Number(member.seatNumber);
      return seatNumber >= room.startSeat && seatNumber <= room.endSeat;
    }).length;
  }
  const previewCount = isStudyCafeLocalPreview()
    ? STUDY_CAFE_PREVIEW_SEATS
      .slice(room.startSeat - 1, room.endSeat)
      .filter((seat) => seat.occupant).length
    : 0;
  const selectedSeatIsAdditional =
    selectedSeatNumber >= room.startSeat &&
    selectedSeatNumber <= room.endSeat &&
    !STUDY_CAFE_PREVIEW_SEATS[selectedSeatNumber - 1]?.occupant;
  return previewCount + (selectedSeatIsAdditional ? 1 : 0);
}

function getStudyCafeRoomContextText(roomIndex, selectedSeatNumber) {
  const room = STUDY_CAFE_ROOMS[roomIndex] || STUDY_CAFE_ROOMS[0];
  const myRoomIndex = selectedSeatNumber ? getStudyCafeRoomIndexForSeat(selectedSeatNumber) : -1;
  if (selectedSeatNumber && myRoomIndex !== roomIndex) {
    return `${room.label} 둘러보는 중 · 내 좌석 ${selectedSeatNumber}번`;
  }
  if (studyCafePreviewState.subject) return `${selectedSeatNumber}번 좌석에서 집중 중`;
  if (selectedSeatNumber) return `${selectedSeatNumber}번 좌석에서 다음 과목 선택 대기 중`;
  if (studyCafePreviewState.pendingSubject) {
    return `${studyCafePreviewState.pendingSubject} 공부할 빈자리를 선택하세요`;
  }
  return `${room.label}의 빈자리를 선택하세요`;
}

function renderStudyCafeRoomTabs(student) {
  const selectedSeatNumber = STUDY_CAFE_PREVIEW_SEATS.findIndex(
    (seat) => seat.id === studyCafePreviewState.selectedSeatId
  ) + 1;
  const myRoomIndex = selectedSeatNumber ? getStudyCafeRoomIndexForSeat(selectedSeatNumber) : -1;
  return el(
    "nav",
    { className: "study-cafe-room-tabs", ariaLabel: "스터디카페 룸 선택" },
    STUDY_CAFE_ROOMS.map((room, index) => {
      const isActive = index === studyCafePreviewState.activeRoomIndex;
      const tab = el(
        "button",
        {
          className: `study-cafe-room-tab ${isActive ? "active" : ""} ${index === myRoomIndex ? "has-my-seat" : ""}`,
          type: "button",
          "data-study-cafe-room-index": String(index),
          "aria-selected": isActive ? "true" : "false",
          title: `${room.label} · ${room.mood}`,
          onclick: () => selectStudyCafeRoom(index, student),
        },
        [
          el("strong", {}, room.label),
          el("span", {}, `${getStudyCafeRoomOccupancyCount(index)}/${STUDY_CAFE_ROOM_SIZE}`),
          index === myRoomIndex ? el("i", {}, "내 좌석") : null,
        ]
      );
      return tab;
    })
  );
}

function selectStudyCafeRoom(roomIndex, student) {
  const nextIndex = Math.min(STUDY_CAFE_ROOMS.length - 1, Math.max(0, Number(roomIndex) || 0));
  if (nextIndex === studyCafePreviewState.activeRoomIndex) return;
  studyCafePreviewState.activeRoomIndex = nextIndex;

  document.querySelectorAll("[data-study-cafe-room-index]").forEach((tab) => {
    const isActive = Number(tab.dataset.studyCafeRoomIndex) === nextIndex;
    tab.classList.toggle("active", isActive);
    tab.setAttribute("aria-selected", isActive ? "true" : "false");
  });

  const room = STUDY_CAFE_ROOMS[nextIndex];
  const roomElement = document.querySelector("[data-study-cafe-room]");
  if (roomElement) {
    roomElement.classList.remove(...STUDY_CAFE_ROOM_THEMES.map(({ theme }) => `theme-${theme}`));
    roomElement.classList.add(`theme-${room.theme}`);
    roomElement.setAttribute("aria-label", `${room.label} ${room.mood} 좌석 배치`);
  }
  const roomMood = document.querySelector("[data-study-cafe-room-mood]");
  if (roomMood) roomMood.textContent = `${room.label} · ${room.mood}`;
  const seatGrid = document.querySelector("[data-study-cafe-seat-grid]");
  if (seatGrid) {
    const seats = STUDY_CAFE_PREVIEW_SEATS.slice(room.startSeat - 1, room.endSeat);
    seatGrid.replaceChildren(
      ...seats.map((seat, index) =>
        renderStudyCafeSeat(seat, room.startSeat - 1 + index, student)
      )
    );
    seatGrid.classList.remove("room-changed");
    void seatGrid.offsetWidth;
    seatGrid.classList.add("room-changed");
  }

  const selectedSeatNumber = STUDY_CAFE_PREVIEW_SEATS.findIndex(
    (seat) => seat.id === studyCafePreviewState.selectedSeatId
  ) + 1;
  const context = document.querySelector("[data-study-cafe-room-context]");
  if (context) context.textContent = getStudyCafeRoomContextText(nextIndex, selectedSeatNumber);
}

function renderStudentStudyTimer() {
  const student = getAuthedStudent();
  if (!isOnlineStudentExperience(student)) {
    return el("div", { className: "grid student-view student-study-cafe-access" }, [
      el("section", { className: "student-study-cafe-access-card" }, [
        el("span", { className: "study-cafe-access-icon", ariaHidden: "true" }, "⏱"),
        el("h2", {}, "온라인 수강생 전용 타이머입니다"),
        el("p", {}, "과목별 순공시간 타이머는 등록번호가 2로 시작하는 인터넷 강의 수강생만 이용할 수 있습니다."),
        button("홈으로", "btn secondary", "button", () => navigate("home")),
      ]),
    ]);
  }

  ensureStudyCafeRemoteLoaded();
  ensureStudyCafePreviewClock();
  const subjects = getStudyTimerSubjects(student);
  const active = Boolean(studyCafePreviewState.selectedSeatId && studyCafePreviewState.subject);
  const timerContent = [
    el("section", { className: "study-timer-total-card" }, [
      button("전체화면", "study-timer-fullscreen-button", "button", openStudyTimerFullscreen),
      el("span", {}, "오늘 총 순공시간"),
      el(
        "time",
        { "data-study-total-time": "true" },
        formatStudyCafeElapsed(getStudySubjectTotalElapsedMs())
      ),
      el("p", {}, active ? `${studyCafePreviewState.subject} 과목을 측정하고 있어요.` : "공부할 과목의 시작 버튼을 눌러주세요."),
    ]),
    el("section", { className: "study-subject-timer-card" }, [
      el("div", { className: "study-subject-timer-card-head" }, [
        el("strong", {}, "과목별 타이머"),
        el("div", { className: "study-subject-timer-card-tools" }, [
          el("span", {}, `${subjects.length}개 직렬 과목`),
        ]),
      ]),
      el(
        "div",
        { className: "study-subject-timer-list" },
        subjects.map((subject, index) => renderStudySubjectTimerRow(subject, index, student))
      ),
    ]),
    el("p", { className: "study-timer-footnote" }, "과목을 바꿔도 현재 좌석과 오늘 총 순공시간은 그대로 유지됩니다."),
    studyCafePreviewState.timerFullscreen ? renderStudyTimerFullscreen(student) : null,
  ];
  return el("div", { className: "student-study-timer-page" }, [
    el("header", { className: "study-timer-page-head" }, [
      el("div", {}, [
        el("span", {}, "매일 오전 4시에 하루 기록이 새로 시작됩니다"),
        el("h2", {}, studyTimerStatsState.mode === "stats" ? "타이머 통계" : "과목 타이머"),
      ]),
      active ? el("span", { className: "study-timer-active-chip" }, studyCafePreviewState.paused ? "일시정지" : "측정 중") : null,
    ]),
    renderStudyTimerModeTabs(),
    ...(studyTimerStatsState.mode === "stats" ? [renderStudyTimerStats()] : timerContent),
  ]);
}

function renderStudyTimerModeTabs() {
  return el("nav", { className: "study-timer-mode-tabs", ariaLabel: "타이머 화면 선택" }, [
    button(
      "타이머",
      `study-timer-mode-button ${studyTimerStatsState.mode === "timer" ? "active" : ""}`,
      "button",
      () => {
        studyTimerStatsState.mode = "timer";
        render();
      }
    ),
    button(
      "통계",
      `study-timer-mode-button ${studyTimerStatsState.mode === "stats" ? "active" : ""}`,
      "button",
      () => {
        studyTimerStatsState.mode = "stats";
        studyCafePreviewState.timerFullscreen = false;
        render();
      }
    ),
  ]);
}

function renderStudyTimerStats() {
  const range = getStudyTimerStatsRange();
  const key = `${range.dateFrom}:${range.dateTo}`;
  const data = studyTimerStatsState.cache[key];
  requestStudyTimerStats(range, key);
  return el("div", { className: "study-timer-stats-view" }, [
    el("nav", { className: "study-timer-stats-periods", ariaLabel: "통계 기간 선택" }, [
      renderStudyTimerStatsPeriodButton("daily", "일간"),
      renderStudyTimerStatsPeriodButton("weekly", "주간"),
      renderStudyTimerStatsPeriodButton("monthly", "월간"),
    ]),
    el("section", { className: "study-timer-stats-calendar-card" }, [
      el("div", { className: "study-timer-stats-date-nav" }, [
        button("‹", "study-timer-stats-date-button", "button", () => shiftStudyTimerStatsDate(-1)),
        el("strong", {}, formatStudyTimerStatsRangeLabel(range)),
        el("button", {
          className: "study-timer-stats-date-button",
          type: "button",
          textContent: "›",
          disabled: !canMoveStudyTimerStatsForward(range),
          ariaLabel: "다음 기간",
          onclick: () => shiftStudyTimerStatsDate(1),
        }),
      ]),
      !data
        ? el("div", { className: "study-timer-stats-loading" }, [
            el("span", { className: "loading-spinner", ariaHidden: "true" }),
            el("p", {}, "공부 기록을 불러오는 중입니다."),
          ])
        : studyTimerStatsState.period === "monthly"
          ? renderStudyTimerMonthlyCalendar(data)
          : studyTimerStatsState.period === "weekly"
            ? renderStudyTimerWeeklyChart(data)
            : renderStudyTimerDailyOverview(data),
    ]),
    data ? renderStudyTimerStatsSummary(data) : null,
    data ? renderStudyTimerSubjectStats(data) : null,
    studyTimerStatsState.error
      ? el("p", { className: "study-timer-stats-note" }, studyTimerStatsState.error)
      : null,
  ]);
}

function renderStudyTimerStatsPeriodButton(period, label) {
  return button(
    label,
    `study-timer-stats-period-button ${studyTimerStatsState.period === period ? "active" : ""}`,
    "button",
    () => {
      studyTimerStatsState.period = period;
      studyTimerStatsState.anchorDate = parseStudyTimerDateKey(formatStudyBusinessDateKey(new Date()));
      studyTimerStatsState.error = "";
      renderStudyCafeStateUpdate();
    }
  );
}

function renderStudyTimerDailyOverview(data) {
  const day = data.days?.[0] || {};
  return el("div", { className: "study-timer-daily-overview" }, [
    el("div", { className: "study-timer-daily-total" }, [
      el("span", {}, formatStudyTimerStatsDayLabel(day.date)),
      el("strong", {}, formatStudyCafeElapsed((day.totalSeconds || 0) * 1000)),
      el("p", {}, day.totalSeconds ? `${day.sessionCount || 0}번 집중한 순공시간` : "아직 기록된 공부시간이 없습니다."),
    ]),
    el("div", { className: "study-timer-daily-details" }, [
      renderStudyTimerDailyMetric("최대 집중시간", formatStudyCafeElapsed((day.longestSeconds || 0) * 1000)),
      renderStudyTimerDailyMetric("시작시간", formatStudyTimerStatsClock(day.firstStartedAt)),
      renderStudyTimerDailyMetric("종료시간", formatStudyTimerStatsClock(day.lastEndedAt)),
    ]),
  ]);
}

function renderStudyTimerDailyMetric(label, value) {
  return el("div", {}, [
    el("span", {}, label),
    el("strong", {}, value || "-"),
  ]);
}

function renderStudyTimerWeeklyChart(data) {
  const days = Array.isArray(data.days) ? data.days : [];
  const maximum = Math.max(1, ...days.map((day) => Number(day.totalSeconds) || 0));
  return el("div", { className: "study-timer-weekly-chart" }, [
    el(
      "div",
      { className: "study-timer-weekly-bars" },
      days.map((day) => {
        const seconds = Number(day.totalSeconds) || 0;
        const height = seconds ? Math.max(10, Math.round((seconds / maximum) * 100)) : 4;
        return el("div", { className: `study-timer-weekly-day ${seconds ? "studied" : ""}` }, [
          el("time", {}, seconds ? formatStudyCafeCompactDuration(seconds) : "-"),
          el("span", { className: "study-timer-weekly-bar-track" }, [
            el("i", { style: `height:${height}%` }),
          ]),
          el("strong", {}, formatStudyTimerStatsWeekday(day.date)),
          el("small", {}, String(Number(day.date?.slice(-2)) || "")),
        ]);
      })
    ),
  ]);
}

function renderStudyTimerMonthlyCalendar(data) {
  const days = Array.isArray(data.days) ? data.days : [];
  const firstDate = parseStudyTimerDateKey(days[0]?.date);
  const leading = firstDate ? firstDate.getDay() : 0;
  const maximum = Math.max(1, ...days.map((day) => Number(day.totalSeconds) || 0));
  return el("div", { className: "study-timer-monthly-calendar" }, [
    el(
      "div",
      { className: "study-timer-monthly-weekdays" },
      ["일", "월", "화", "수", "목", "금", "토"].map((day) => el("span", {}, day))
    ),
    el("div", { className: "study-timer-monthly-days" }, [
      ...Array.from({ length: leading }, () => el("span", { className: "study-timer-monthly-day blank" })),
      ...days.map((day) => {
        const seconds = Number(day.totalSeconds) || 0;
        const level = seconds ? Math.max(1, Math.ceil((seconds / maximum) * 4)) : 0;
        const isToday = day.date === formatStudyBusinessDateKey(new Date());
        return el("article", {
          className: `study-timer-monthly-day level-${level} ${isToday ? "today" : ""}`,
          title: `${day.date} ${formatStudyCafeElapsed(seconds * 1000)}`,
        }, [
          el("strong", {}, String(Number(day.date?.slice(-2)) || "")),
          seconds ? el("time", {}, formatStudyCafeCompactDuration(seconds)) : null,
        ]);
      }),
    ]),
    el("div", { className: "study-timer-monthly-legend" }, [
      el("span", {}, "적게"),
      ...[0, 1, 2, 3, 4].map((level) => el("i", { className: `level-${level}` })),
      el("span", {}, "많이"),
    ]),
  ]);
}

function renderStudyTimerStatsSummary(data) {
  const summary = data.summary || {};
  const periodLabel = studyTimerStatsState.period === "daily"
    ? "선택일"
    : studyTimerStatsState.period === "weekly"
      ? "선택 주"
      : "선택 월";
  return el("section", { className: "study-timer-stats-summary" }, [
    el("div", { className: "study-timer-stats-summary-head" }, [
      el("span", {}, periodLabel),
      el("strong", {}, `${data.dateFrom} ~ ${data.dateTo}`),
    ]),
    el("div", { className: "study-timer-stats-summary-grid" }, [
      renderStudyTimerStatsMetric("총 순공시간", formatStudyCafeElapsed((summary.totalSeconds || 0) * 1000)),
      renderStudyTimerStatsMetric("공부한 날", `${summary.studiedDays || 0}일`),
      renderStudyTimerStatsMetric("하루 평균", formatStudyCafeElapsed((summary.dailyAverageSeconds || 0) * 1000)),
      renderStudyTimerStatsMetric("최고 기록", formatStudyCafeElapsed((summary.maxDailySeconds || 0) * 1000)),
    ]),
  ]);
}

function renderStudyTimerStatsMetric(label, value) {
  return el("div", {}, [
    el("span", {}, label),
    el("strong", {}, value),
  ]);
}

function renderStudyTimerSubjectStats(data) {
  const entries = Object.entries(data.subjectTotals || {})
    .map(([subject, seconds]) => ({ subject, seconds: Number(seconds) || 0 }))
    .filter((item) => item.seconds > 0)
    .sort((left, right) => right.seconds - left.seconds);
  const maximum = Math.max(1, ...entries.map((item) => item.seconds));
  return el("section", { className: "study-timer-subject-stats" }, [
    el("div", { className: "study-timer-subject-stats-head" }, [
      el("strong", {}, "과목별 순공시간"),
      el("span", {}, `${entries.length}개 과목`),
    ]),
    entries.length
      ? el("div", { className: "study-timer-subject-stats-list" }, entries.map((item, index) =>
          el("article", {}, [
            el("span", { className: `study-timer-subject-stat-dot tone-${index % 6}` }),
            el("strong", {}, item.subject),
            el("span", { className: "study-timer-subject-stat-bar" }, [
              el("i", { style: `width:${Math.max(5, Math.round((item.seconds / maximum) * 100))}%` }),
            ]),
            el("time", {}, formatStudyCafeElapsed(item.seconds * 1000)),
          ])
        ))
      : el("div", { className: "empty" }, "이 기간에는 과목별 공부 기록이 없습니다."),
  ]);
}

async function requestStudyTimerStats(range, key) {
  if (studyTimerStatsState.cache[key] || studyTimerStatsState.loadingKey === key) return;
  studyTimerStatsState.loadingKey = key;
  studyTimerStatsState.error = "";
  try {
    const result = await requestStudyCafeAction("stats", range);
    if (result.ok) {
      studyTimerStatsState.cache[key] = result;
    } else {
      studyTimerStatsState.cache[key] = buildLocalStudyTimerStats(range);
      if (studyCafeRemoteState.available === true) {
        studyTimerStatsState.error = "통계 서버에서 기록을 불러오지 못해 현재 기기의 오늘 기록만 표시합니다.";
      }
    }
  } catch (error) {
    console.error(error);
    studyTimerStatsState.cache[key] = buildLocalStudyTimerStats(range);
    studyTimerStatsState.error = "현재 기기의 오늘 기록만 표시합니다.";
  } finally {
    studyTimerStatsState.loadingKey = "";
    if (currentRoute === "study-timer" && studyTimerStatsState.mode === "stats") render();
  }
}

function buildLocalStudyTimerStats(range) {
  const dateKeys = enumerateStudyTimerDateKeys(range.dateFrom, range.dateTo);
  const todayKey = formatStudyBusinessDateKey(new Date());
  const todaySeconds = Math.floor(getStudySubjectTotalElapsedMs() / 1000);
  const subjectTotals = {};
  Object.keys(studyCafePreviewState.subjectElapsedMs || {}).forEach((subject) => {
    const seconds = Math.floor(getStudySubjectElapsedMs(subject) / 1000);
    if (seconds) subjectTotals[subject] = seconds;
  });
  const days = dateKeys.map((date) => ({
    date,
    totalSeconds: date === todayKey ? todaySeconds : 0,
    longestSeconds: 0,
    sessionCount: date === todayKey && todaySeconds ? 1 : 0,
    firstStartedAt: "",
    lastEndedAt: "",
    subjects: date === todayKey ? subjectTotals : {},
  }));
  const studiedDays = days.filter((day) => day.totalSeconds > 0).length;
  return {
    ok: true,
    localOnly: true,
    dateFrom: range.dateFrom,
    dateTo: range.dateTo,
    days,
    subjectTotals: dateKeys.includes(todayKey) ? subjectTotals : {},
    summary: {
      totalSeconds: dateKeys.includes(todayKey) ? todaySeconds : 0,
      studiedDays,
      dailyAverageSeconds: studiedDays ? todaySeconds : 0,
      maxDailySeconds: dateKeys.includes(todayKey) ? todaySeconds : 0,
      sessionCount: todaySeconds ? 1 : 0,
    },
  };
}

function getStudyTimerStatsRange() {
  const anchor = new Date(studyTimerStatsState.anchorDate);
  anchor.setHours(12, 0, 0, 0);
  let start = new Date(anchor);
  let end = new Date(anchor);
  if (studyTimerStatsState.period === "weekly") {
    const weekday = start.getDay() || 7;
    start.setDate(start.getDate() - weekday + 1);
    end = new Date(start);
    end.setDate(end.getDate() + 6);
  } else if (studyTimerStatsState.period === "monthly") {
    start = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 12);
    end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0, 12);
  }
  return {
    dateFrom: formatStudyTimerDateKey(start),
    dateTo: formatStudyTimerDateKey(end),
  };
}

function shiftStudyTimerStatsDate(amount) {
  const next = new Date(studyTimerStatsState.anchorDate);
  if (studyTimerStatsState.period === "monthly") {
    next.setMonth(next.getMonth() + amount, 1);
  } else if (studyTimerStatsState.period === "weekly") {
    next.setDate(next.getDate() + amount * 7);
  } else {
    next.setDate(next.getDate() + amount);
  }
  studyTimerStatsState.anchorDate = next;
  studyTimerStatsState.error = "";
  render();
}

function canMoveStudyTimerStatsForward(range) {
  return range.dateTo < formatStudyBusinessDateKey(new Date());
}

function formatStudyTimerStatsRangeLabel(range) {
  const start = parseStudyTimerDateKey(range.dateFrom);
  const end = parseStudyTimerDateKey(range.dateTo);
  if (!start || !end) return "";
  if (studyTimerStatsState.period === "monthly") {
    return `${start.getFullYear()}년 ${start.getMonth() + 1}월`;
  }
  if (studyTimerStatsState.period === "weekly") {
    return `${start.getMonth() + 1}.${start.getDate()} – ${end.getMonth() + 1}.${end.getDate()}`;
  }
  return `${start.getFullYear()}년 ${start.getMonth() + 1}월 ${start.getDate()}일`;
}

function formatStudyTimerStatsDayLabel(dateKey) {
  const date = parseStudyTimerDateKey(dateKey);
  if (!date) return "선택한 날짜";
  return `${date.getMonth() + 1}월 ${date.getDate()}일 (${new Intl.DateTimeFormat("ko-KR", { weekday: "short" }).format(date)})`;
}

function formatStudyTimerStatsWeekday(dateKey) {
  const date = parseStudyTimerDateKey(dateKey);
  return date ? new Intl.DateTimeFormat("ko-KR", { weekday: "short" }).format(date).replace("요일", "") : "";
}

function formatStudyTimerStatsClock(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function formatStudyCafeCompactDuration(seconds) {
  const totalMinutes = Math.floor(Math.max(0, Number(seconds) || 0) / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (!hours) return `${minutes}분`;
  return minutes ? `${hours}시간 ${minutes}분` : `${hours}시간`;
}

function formatStudyTimerDateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function formatStudyBusinessDateKey(value = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const shiftedKst = new Date(date.getTime() + 5 * 60 * 60 * 1000);
  return [
    shiftedKst.getUTCFullYear(),
    String(shiftedKst.getUTCMonth() + 1).padStart(2, "0"),
    String(shiftedKst.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function parseStudyTimerDateKey(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
}

function enumerateStudyTimerDateKeys(dateFrom, dateTo) {
  const start = parseStudyTimerDateKey(dateFrom);
  const end = parseStudyTimerDateKey(dateTo);
  if (!start || !end) return [];
  const keys = [];
  for (const cursor = new Date(start); cursor <= end && keys.length < 62; cursor.setDate(cursor.getDate() + 1)) {
    keys.push(formatStudyTimerDateKey(cursor));
  }
  return keys;
}

function invalidateStudyTimerStatsCache() {
  const today = formatStudyBusinessDateKey(new Date());
  Object.keys(studyTimerStatsState.cache).forEach((key) => {
    const [dateFrom, dateTo] = key.split(":");
    if (dateFrom <= today && dateTo >= today) delete studyTimerStatsState.cache[key];
  });
}

function openStudyTimerFullscreen() {
  if (!studyCafePreviewState.selectedSeatId || !studyCafePreviewState.subject) {
    return notify("과목 타이머를 먼저 시작해주세요.");
  }
  studyTimerStatsState.mode = "timer";
  studyCafePreviewState.timerFullscreen = true;
  if (currentRoute !== "study-timer") {
    navigate("study-timer");
    return;
  }
  render();
}

function closeStudyTimerFullscreen() {
  studyCafePreviewState.timerFullscreen = false;
  render();
}

function renderStudyTimerFullscreen(student) {
  const seatNumber = STUDY_CAFE_PREVIEW_SEATS.findIndex(
    (seat) => seat.id === studyCafePreviewState.selectedSeatId
  ) + 1;
  const status = studyCafePreviewState.running
    ? "집중 중"
    : studyCafePreviewState.paused
      ? "일시정지"
      : "시작 준비";
  return el("section", { className: "study-timer-fullscreen", ariaLabel: "타이머 전체화면 모드" }, [
    el("header", { className: "study-timer-fullscreen-head" }, [
      el("div", {}, [
        el("span", {}, "RONPARK FOCUS TIMER"),
        el("strong", {}, "과목별 순공시간"),
      ]),
      button("전체화면 닫기", "study-timer-fullscreen-close", "button", closeStudyTimerFullscreen),
    ]),
    el("main", { className: "study-timer-fullscreen-main" }, [
      el("span", { className: `study-timer-fullscreen-status ${studyCafePreviewState.running ? "running" : ""}` }, `● ${status}`),
      el("h2", {}, studyCafePreviewState.subject),
      el(
        "time",
        { className: "study-timer-fullscreen-clock", "data-study-cafe-clock": "true" },
        formatStudyCafeElapsed(getStudySubjectElapsedMs(studyCafePreviewState.subject))
      ),
      el("p", {}, `${student?.name || "나"} · ${seatNumber}번 좌석`),
      el("div", { className: "study-timer-fullscreen-actions" }, [
        button(
          studyCafePreviewState.paused ? "다시 시작" : "일시정지",
          "btn secondary",
          "button",
          toggleStudyCafePreviewTimer
        ),
        button("과목 변경", "btn secondary", "button", () => {
          openStudyCafeSubjectModal(studyCafePreviewState.selectedSeatId, student, { preserveTimer: true });
        }),
        button("과목 종료", "btn", "button", stopStudyCafePreviewTimer),
      ]),
      el("div", { className: "study-timer-fullscreen-total" }, [
        el("span", {}, "오늘 총 순공시간"),
        el("time", { "data-study-total-time": "true" }, formatStudyCafeElapsed(getStudySubjectTotalElapsedMs())),
      ]),
    ]),
  ]);
}

function renderStudySubjectTimerRow(subject, index, student) {
  const isCurrent = studyCafePreviewState.subject === subject && Boolean(studyCafePreviewState.selectedSeatId);
  const isRunning = isCurrent && studyCafePreviewState.running;
  const todos = getStudyTodosForDate(studyCafeRemoteState.studyDateKey)
    .filter((todo) => todo.subject === subject);
  const completedTodoCount = todos.filter((todo) => todo.completed).length;
  const tones = ["coral", "purple", "teal", "amber", "blue", "mint", "navy", "rose"];
  const tone = tones[index % tones.length];
  const actionLabel = isRunning ? `${subject} 일시정지` : isCurrent ? `${subject} 다시 시작` : `${subject} 공부 시작`;
  return el("article", { className: `study-subject-timer-row ${isCurrent ? "active" : ""}` }, [
    el(
      "button",
      {
        className: `study-subject-play-button ${tone} ${isRunning ? "pause" : ""}`,
        type: "button",
        ariaLabel: actionLabel,
        onclick: () => handleStudySubjectTimerAction(subject, student),
      },
      isRunning ? "Ⅱ" : "▶"
    ),
    el("strong", {}, subject),
    el(
      "time",
      {
        "data-study-subject-time": subject,
      },
      formatStudyCafeElapsed(getStudySubjectElapsedMs(subject))
    ),
    isCurrent ? el("span", { className: "study-subject-current-dot", ariaLabel: "현재 선택 과목" }, "●") : null,
    todos.length
      ? el("div", { className: "study-timer-subject-todos" }, [
          el("div", { className: "study-timer-subject-todos-head" }, [
            el("strong", {}, "오늘 할 일"),
            el("span", {}, `${completedTodoCount}/${todos.length} 완료`),
          ]),
          el(
            "div",
            { className: "study-timer-subject-todo-list" },
            todos.map((todo) => renderStudyTimerTodoItem(todo))
          ),
        ])
      : null,
  ]);
}

function renderStudyTimerTodoItem(todo) {
  const checkbox = el("input", {
    type: "checkbox",
    checked: Boolean(todo.completed),
    ariaLabel: `${todo.content} 완료`,
  });
  checkbox.addEventListener("change", () => updateStudyTodoCompletion(todo, checkbox));
  return el("label", {
    className: `study-timer-subject-todo ${todo.completed ? "completed" : ""}`,
  }, [
    checkbox,
    el("span", {}, todo.content),
  ]);
}

function handleStudySubjectTimerAction(subject, student) {
  const seated = Boolean(studyCafePreviewState.selectedSeatId);
  const active = Boolean(studyCafePreviewState.selectedSeatId && studyCafePreviewState.subject);
  if (active && studyCafePreviewState.subject === subject) {
    toggleStudyCafePreviewTimer();
    return;
  }
  if (active) {
    applyStudyCafeSubjectSelection(studyCafePreviewState.selectedSeatId, subject, { preserveTimer: true });
    render();
    notify(`${subject} 과목으로 변경을 준비합니다.`);
    return;
  }
  if (seated) {
    applyStudyCafeSubjectSelection(studyCafePreviewState.selectedSeatId, subject);
    render();
    notify(`${subject} 공부를 준비합니다.`);
    return;
  }
  studyCafePreviewState.pendingSubject = subject;
  navigate("study-cafe");
  notify(`${subject} 공부를 시작할 빈 좌석을 선택해주세요.`);
}

function renderStudentStudyCharacter() {
  const student = getAuthedStudent();
  if (!isOnlineStudentExperience(student)) {
    return el("div", { className: "grid student-view student-study-cafe-access" }, [
      el("section", { className: "student-study-cafe-access-card" }, [
        el("span", { className: "study-cafe-access-icon", ariaHidden: "true" }, "🙂"),
        el("h2", {}, "온라인 수강생 전용 캐릭터입니다"),
        el("p", {}, "스터디카페 캐릭터는 등록번호가 2로 시작하는 인터넷 강의 수강생만 설정할 수 있습니다."),
        button("홈으로", "btn secondary", "button", () => navigate("home")),
      ]),
    ]);
  }

  ensureStudyCafeRemoteLoaded();
  const options = [
    { tone: "navy", label: "론박 블루" },
    { tone: "blue", label: "스카이" },
    { tone: "mint", label: "민트" },
    { tone: "purple", label: "퍼플" },
    { tone: "orange", label: "오렌지" },
    { tone: "rose", label: "로즈" },
  ];
  const characterName = getStudyCafeDisplayName(student.name || "나");
  return el("div", { className: "student-study-character-page" }, [
    el("section", { className: "study-character-preview-card" }, [
      el("span", {}, "MY CHARACTER"),
      el("div", { className: "study-character-preview-avatar" }, [
        renderStudyCafeAvatar(studyCafePreviewState.avatarTone || "navy", true),
      ]),
      el("div", { className: "study-character-name-row" }, [
        el("h2", { "data-study-character-name": "true" }, `${characterName}의 캐릭터`),
        el(
          "button",
          {
            className: "study-character-name-edit-button",
            type: "button",
            ariaLabel: "닉네임 수정",
            title: "닉네임 수정",
            onclick: openStudyCafeNicknameEditor,
          },
          el("span", { ariaHidden: "true" }, "✎")
        ),
      ]),
      el("p", {}, "스터디카페에서 다른 학생들에게 보이는 내 캐릭터입니다."),
    ]),
    el("section", { className: "study-character-options-card" }, [
      el("div", { className: "study-character-options-head" }, [
        el("strong", {}, "캐릭터 색상"),
        el("span", {}, "원하는 스타일을 선택하세요"),
      ]),
      el(
        "div",
        { className: "study-character-option-grid" },
        options.map((option) =>
          el(
            "button",
            {
              className: `study-character-option ${studyCafePreviewState.avatarTone === option.tone ? "active" : ""}`,
              type: "button",
              "data-study-character-tone": option.tone,
              "aria-pressed": studyCafePreviewState.avatarTone === option.tone ? "true" : "false",
              onclick: () => updateStudyCafeCharacterSelection(option.tone, option.label),
            },
            [
              el("span", { className: `study-character-color ${option.tone}`, ariaHidden: "true" }),
              el("strong", {}, option.label),
              studyCafePreviewState.avatarTone === option.tone
                ? el("span", { "data-study-character-selected": "true" }, "선택됨")
                : null,
            ]
          )
        )
      ),
    ]),
    el("p", { className: "study-character-footnote" }, "현재는 색상 선택 시안이며, 의상과 소품은 이후 단계에서 추가할 수 있습니다."),
  ]);
}

function openStudyCafeNicknameEditor() {
  const input = el("input", {
    className: "study-character-nickname-input",
    type: "text",
    value: getStudyCafeDisplayName(""),
    maxLength: 10,
    placeholder: "사용할 닉네임",
    ariaLabel: "스터디카페 닉네임",
    autocomplete: "off",
  });
  const saveButton = button("저장하기", "btn study-character-nickname-save", "submit");
  const feedback = el("p", {
    className: "study-character-nickname-feedback",
    role: "alert",
    ariaLive: "assertive",
    hidden: true,
  });
  const form = el("form", { className: "study-character-nickname-modal-content" }, [
    el("p", {}, "저장한 닉네임은 캐릭터와 스터디카페 좌석에 표시됩니다."),
    el("div", { className: "study-character-nickname-row" }, [input, saveButton]),
    feedback,
    el("small", {}, "한글·영문·숫자로 2~10자까지 입력할 수 있습니다."),
  ]);
  const showNicknameFeedback = (message) => {
    feedback.textContent = message;
    feedback.hidden = false;
    input.setAttribute("aria-invalid", "true");
    window.requestAnimationFrame(() => {
      feedback.scrollIntoView({ block: "nearest" });
    });
  };
  input.addEventListener("input", () => {
    feedback.hidden = true;
    feedback.textContent = "";
    input.removeAttribute("aria-invalid");
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const nickname = normalizeStudyCafeNickname(input.value);
    if (!nickname) {
      showNicknameFeedback("닉네임은 한글·영문·숫자로 2~10자까지 입력해주세요.");
      input.focus();
      return;
    }

    saveButton.disabled = true;
    const result = await mutateStudyCafeRemote("save_profile", {
      avatarTone: studyCafePreviewState.avatarTone,
      nickname,
    }, { notify: false });
    saveButton.disabled = false;
    if (!result.ok) {
      showNicknameFeedback("닉네임을 저장하지 못했습니다. 잠시 후 다시 시도해주세요.");
      input.focus();
      return;
    }

    studyCafePreviewState.nickname = nickname;
    input.value = nickname;
    const previewName = document.querySelector("[data-study-character-name]");
    if (previewName) previewName.textContent = `${nickname}의 캐릭터`;
    closeInfoModal();
    notify(`${nickname}(으)로 닉네임을 저장했습니다.`);
  });
  openInfoModal({
    title: "닉네임 수정",
    className: "study-character-nickname-modal",
    content: form,
  });
  window.requestAnimationFrame(() => {
    input.focus();
    input.select();
  });
}

function normalizeStudyCafeNickname(value) {
  const nickname = String(value || "").trim().replace(/\s+/g, " ");
  if (nickname.length < 2 || nickname.length > 10) return "";
  return /^[가-힣A-Za-z0-9 ]+$/.test(nickname) ? nickname : "";
}

function updateStudyCafeCharacterSelection(tone, label) {
  const availableTones = ["navy", "blue", "mint", "purple", "orange", "rose"];
  if (!availableTones.includes(tone)) return;

  studyCafePreviewState.avatarTone = tone;

  const previewAvatar = document.querySelector(".study-character-preview-avatar .study-cafe-avatar");
  if (previewAvatar) {
    previewAvatar.classList.remove(...availableTones);
    previewAvatar.classList.add(tone);
  }

  document.querySelectorAll("[data-study-character-tone]").forEach((optionButton) => {
    const isSelected = optionButton.dataset.studyCharacterTone === tone;
    optionButton.classList.toggle("active", isSelected);
    optionButton.setAttribute("aria-pressed", isSelected ? "true" : "false");

    const selectedMarker = optionButton.querySelector("[data-study-character-selected]");
    if (isSelected && !selectedMarker) {
      optionButton.appendChild(el("span", { "data-study-character-selected": "true" }, "선택됨"));
    } else if (!isSelected && selectedMarker) {
      selectedMarker.remove();
    }
  });

  mutateStudyCafeRemote("save_profile", { avatarTone: tone });
  notify(`${label} 캐릭터를 선택했습니다.`);
}

function renderStudentStudyRanking() {
  const student = getAuthedStudent();
  if (!isOnlineStudentExperience(student)) {
    return el("div", { className: "grid student-view student-study-cafe-access" }, [
      el("section", { className: "student-study-cafe-access-card" }, [
        el("span", { className: "study-cafe-access-icon", ariaHidden: "true" }, "🏆"),
        el("h2", {}, "온라인 수강생 전용 랭킹입니다"),
        el("p", {}, "순공시간 랭킹은 등록번호가 2로 시작하는 인터넷 강의 수강생만 이용할 수 있습니다."),
        button("홈으로", "btn secondary", "button", () => navigate("home")),
      ]),
    ]);
  }

  ensureStudyCafeRemoteLoaded();
  requestStudyRankingPeriod(studyRankingPreviewState.period);
  const rows = getStudyRankingPreviewRows();
  const topThree = rows.slice(0, 3);
  const mine = rows.find((row) => row.isMine);
  const hasLiveRanking = studyCafeRemoteState.available === true;
  const isPreview = isStudyCafeLocalPreview();
  const periodData = studyCafeRemoteState.rankingPeriods[studyRankingPreviewState.period];
  const periodSummary = periodData?.summary || (
    studyRankingPreviewState.period === "daily" ? studyCafeRemoteState.summary : null
  );
  const rankingLoading =
    !isPreview &&
    studyCafeRemoteState.rankingLoadingPeriod === studyRankingPreviewState.period &&
    !periodData;
  return el("div", { className: "student-study-ranking-page" }, [
    el("header", { className: "study-ranking-page-head" }, [
      el("div", {}, [
        el("span", {}, "RONPARK ONLINE"),
        el("h2", {}, "순공시간 랭킹"),
      ]),
      el("span", { className: "study-ranking-my-chip" }, `내 순위 ${mine?.rank || "-"}위`),
    ]),
    el("nav", { className: "study-ranking-period-tabs", ariaLabel: "랭킹 기간 선택" }, [
      renderStudyRankingPeriodButton("daily", "일간"),
      renderStudyRankingPeriodButton("weekly", "주간"),
      renderStudyRankingPeriodButton("monthly", "월간"),
    ]),
    el("section", { className: "study-ranking-date-bar" }, [
      el("button", {
        className: "study-ranking-date-button",
        type: "button",
        textContent: "‹",
        disabled: !isPreview,
        ariaLabel: "이전 기간",
        onclick: () => changeStudyRankingDate(-1),
      }),
      el("strong", {}, formatStudyRankingDate()),
      el("button", {
        className: "study-ranking-date-button",
        type: "button",
        textContent: "›",
        disabled: !isPreview || studyRankingPreviewState.dateOffset >= 0,
        ariaLabel: "다음 기간",
        onclick: () => changeStudyRankingDate(1),
      }),
    ]),
    rows.length
      ? el("section", { className: "study-ranking-podium-section" }, [
          el("div", { className: "study-ranking-section-title" }, [
            el("strong", {}, `${getStudyRankingPeriodLabel()} Top 3`),
            el("span", {}, "순공시간 기준"),
          ]),
          el("div", { className: "study-ranking-podium" }, [
            renderStudyRankingPodiumCard(topThree[1], 2),
            renderStudyRankingPodiumCard(topThree[0], 1),
            renderStudyRankingPodiumCard(topThree[2], 3),
          ]),
        ])
      : el("section", { className: "study-ranking-podium-section empty" }, [
          el("strong", {}, rankingLoading
            ? `${getStudyRankingPeriodLabel()} 랭킹을 불러오는 중입니다.`
            : hasLiveRanking
              ? `아직 ${getStudyRankingPeriodLabel()} 순공 기록이 없습니다.`
              : "랭킹 서버에 연결하고 있습니다."),
          el("p", {}, rankingLoading
            ? "잠시만 기다려주세요."
            : hasLiveRanking
              ? "타이머 기록이 생기면 랭킹에 반영됩니다."
              : "연결되면 실제 기록만 표시됩니다."),
        ]),
    el("section", { className: "study-ranking-summary" }, [
      el("div", {}, [
        el("span", {}, `${getStudyRankingPeriodLabel()} 참여 학생`),
        el("strong", {}, `${periodSummary?.studiedCount ?? (isPreview ? 28 : 0)}명`),
      ]),
      el("div", {}, [
        el("span", {}, "현재 공부 중"),
        el("strong", {}, `${periodSummary?.focusedCount ?? (isPreview ? 5 : 0)}명`),
      ]),
      el("div", {}, [
        el("span", {}, "내 위치"),
        el("strong", {}, `상위 ${mine?.percentile || 0}%`),
      ]),
    ]),
    el("section", { className: "study-ranking-list-card" }, [
      el("div", { className: "study-ranking-section-title" }, [
        el("strong", {}, "전체 순위"),
        el("span", {}, `${getStudyRankingPeriodLabel()} 누적 순공시간`),
      ]),
      rows.length
        ? el("div", { className: "study-ranking-list" }, rows.map(renderStudyRankingRow))
        : el("div", { className: "empty" }, "표시할 실제 기록이 없습니다."),
    ]),
    el(
      "p",
      { className: "study-ranking-footnote" },
      hasLiveRanking && studyRankingPreviewState.period === "daily" && studyRankingPreviewState.dateOffset === 0
        ? "오늘 기록은 매일 오전 4시에 새로 시작되며, 다른 학생의 이름은 일부 가려서 표시합니다."
        : isPreview
          ? "로컬 미리보기 데이터입니다. 운영 화면에는 실제 서버 기록만 표시됩니다."
          : studyCafeRemoteState.rankingError
            ? studyCafeRemoteState.rankingError
            : "주간·월간은 현재 기간의 누적 순공시간이며, 다른 학생의 이름은 일부 가려서 표시합니다."
    ),
  ]);
}

function renderStudyRankingPeriodButton(period, label) {
  const periodButton = button(
    label,
    `study-ranking-period-button ${studyRankingPreviewState.period === period ? "active" : ""}`,
    "button",
    () => {
      studyRankingPreviewState.period = period;
      studyRankingPreviewState.dateOffset = 0;
      render();
    }
  );
  return periodButton;
}

async function requestStudyRankingPeriod(period) {
  if (
    isStudyCafeLocalPreview() ||
    period === "daily" ||
    studyCafeRemoteState.available !== true ||
    studyCafeRemoteState.rankingPeriods[period] ||
    studyCafeRemoteState.rankingLoadingPeriod === period
  ) {
    return;
  }
  studyCafeRemoteState.rankingLoadingPeriod = period;
  studyCafeRemoteState.rankingError = "";
  const result = await requestStudyCafeAction("ranking", { period });
  if (result.ok) {
    studyCafeRemoteState.rankingPeriods[period] = {
      ranking: Array.isArray(result.ranking) ? result.ranking : [],
      summary: result.summary || null,
      dateFrom: result.dateFrom || "",
      dateTo: result.dateTo || "",
    };
  } else {
    studyCafeRemoteState.rankingError = "랭킹을 불러오지 못했습니다. 잠시 후 다시 눌러주세요.";
  }
  if (studyCafeRemoteState.rankingLoadingPeriod === period) {
    studyCafeRemoteState.rankingLoadingPeriod = "";
  }
  if (currentRoute === "study-ranking") renderStudyCafeStateUpdate();
}

function changeStudyRankingDate(amount) {
  studyRankingPreviewState.dateOffset = Math.min(0, studyRankingPreviewState.dateOffset + Number(amount || 0));
  render();
}

function getStudyRankingPeriodLabel() {
  if (studyRankingPreviewState.period === "weekly") return "주간";
  if (studyRankingPreviewState.period === "monthly") return "월간";
  return "일간";
}

function formatStudyRankingDate() {
  const now = parseStudyTimerDateKey(formatStudyBusinessDateKey(new Date()));
  if (studyRankingPreviewState.period === "monthly") {
    const date = new Date(now.getFullYear(), now.getMonth() + studyRankingPreviewState.dateOffset, 1);
    return `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
  }
  if (studyRankingPreviewState.period === "weekly") {
    const date = new Date(now);
    const day = date.getDay() || 7;
    date.setDate(date.getDate() - day + 1 + studyRankingPreviewState.dateOffset * 7);
    const end = new Date(date);
    end.setDate(end.getDate() + 6);
    return `${date.getMonth() + 1}.${date.getDate()} – ${end.getMonth() + 1}.${end.getDate()}`;
  }
  const date = new Date(now);
  date.setDate(date.getDate() + studyRankingPreviewState.dateOffset);
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

function getStudyRankingPreviewRows() {
  if (
    studyCafeRemoteState.available === true &&
    studyRankingPreviewState.dateOffset === 0 &&
    Array.isArray(
      studyCafeRemoteState.rankingPeriods[studyRankingPreviewState.period]?.ranking
    )
  ) {
    return studyCafeRemoteState.rankingPeriods[studyRankingPreviewState.period].ranking.map((member, index, members) => ({
      ...member,
      name: member.isMine ? "나" : member.name,
      seconds: Math.max(0, Number(member.totalSeconds) || 0),
      rank: Number(member.rank) || index + 1,
      percentile: Number(member.percentile) || Math.max(1, Math.round(((index + 1) / Math.max(1, members.length)) * 100)),
    }));
  }
  if (!isStudyCafeLocalPreview()) return [];
  const multiplier = studyRankingPreviewState.period === "monthly"
    ? 22.4
    : studyRankingPreviewState.period === "weekly"
      ? 5.3
      : 1;
  const offsetFactor = 1 + Math.abs(studyRankingPreviewState.dateOffset) * 0.037;
  const currentSeconds = Math.floor(getStudySubjectTotalElapsedMs() / 1000);
  const rows = STUDY_RANKING_PREVIEW_MEMBERS.map((member, index) => ({
    ...member,
    seconds: Math.floor((member.dailySeconds + (member.isMine ? currentSeconds : index * 23)) * multiplier * offsetFactor),
  }))
    .sort((a, b) => b.seconds - a.seconds)
    .map((member, index, members) => ({
      ...member,
      rank: index + 1,
      percentile: Math.max(1, Math.round(((index + 1) / members.length) * 100)),
    }));
  return rows;
}

function renderStudyRankingPodiumCard(member, rank) {
  if (!member) return null;
  const rankClass = rank === 1 ? "gold" : rank === 2 ? "silver" : "bronze";
  return el("article", { className: `study-ranking-podium-card rank-${rank} ${rankClass}` }, [
    el("span", { className: "study-ranking-medal" }, [
      el("i", { ariaHidden: "true" }),
      el("strong", {}, rank),
    ]),
    el("span", { className: `study-ranking-avatar ${member.tone}`, ariaHidden: "true" }, [
      el("i", { className: "hair" }),
      el("i", { className: "face" }),
      el("i", { className: "body" }),
    ]),
    el("strong", { className: "study-ranking-podium-name" }, member.name),
    el("time", {}, formatStudyCafeMemberTime(member.seconds)),
  ]);
}

function renderStudyRankingRow(member) {
  const leaderSeconds = getStudyRankingPreviewRows()[0]?.seconds || 1;
  const progress = Math.max(8, Math.round((member.seconds / leaderSeconds) * 100));
  return el("article", { className: `study-ranking-row ${member.isMine ? "mine" : ""}` }, [
    el("span", { className: `study-ranking-number rank-${member.rank}` }, member.rank),
    el("span", { className: `study-ranking-list-avatar ${member.tone}`, ariaHidden: "true" }, member.name.slice(0, 1)),
    el("div", { className: "study-ranking-row-main" }, [
      el("div", {}, [
        el("strong", {}, member.isMine ? "나" : member.name),
        member.isMine ? el("span", {}, "내 순위") : null,
        el("time", {}, formatStudyCafeMemberTime(member.seconds)),
      ]),
      el("span", { className: "study-ranking-progress" }, [
        el("i", { style: `width:${progress}%` }),
      ]),
    ]),
  ]);
}

function renderStudyCafeSeat(seat, index, student) {
  const seatNumber = index + 1;
  const isMine = seat.id === studyCafePreviewState.selectedSeatId;
  const remoteOccupant = studyCafeRemoteState.available === true
    ? studyCafeRemoteState.room?.find((member) => Number(member.seatNumber) === seatNumber)
    : null;
  const occupant = isMine
    ? {
        name: getStudyCafeDisplayName("나"),
        track: summarizeStudyCafeTrack(student?.track),
        fullTrack: student?.track || "온라인 수강",
        tone: studyCafePreviewState.avatarTone || "navy",
        status: studyCafePreviewState.running ? "studying" : studyCafePreviewState.paused ? "paused" : "seated",
        remote: studyCafeRemoteState.available === true,
      }
    : studyCafeRemoteState.available === true
      ? remoteOccupant && !remoteOccupant.isMine
        ? { ...remoteOccupant, remote: true }
        : null
      : isStudyCafeLocalPreview()
        ? seat.occupant
        : null;
  const occupantFullTrack = occupant?.fullTrack || occupant?.track || "직렬 미등록";
  const isPausedSeat = occupant?.status === "paused";
  const seatButton = el(
    "button",
    {
      className: `study-cafe-seat ${occupant ? "occupied" : "empty"} ${isMine ? "mine" : ""}`,
      type: "button",
      ariaLabel: occupant
        ? `${seatNumber}번 좌석, ${occupant.name}, ${occupantFullTrack}${isPausedSeat ? ", 일시정지" : ""}, 오늘 누적 공부시간 ${formatStudyCafeMemberTime(getStudyCafeMemberSeconds(occupant, isMine))}`
        : `${seatNumber}번 좌석 선택`,
    },
    [
      el("span", { className: "study-cafe-seat-number" }, `${seatNumber}번`),
      occupant
        ? el(
            "span",
            {
              className: "study-cafe-seat-name",
              title: `${occupant.name} / ${occupantFullTrack}`,
            },
            [
              el("strong", {}, occupant.name),
              el("em", {}, occupant.track),
            ]
          )
        : null,
      occupant
        ? el(
            "time",
            {
              className: "study-cafe-member-time",
              "data-study-member-time": isMine
                ? "mine"
                : occupant.remote
                  ? occupant.status === "studying" ? "remote" : "static"
                  : "mock",
              "data-study-base-seconds": String(Number(occupant.todaySeconds) || 0),
              ariaLabel: `${occupant.name} 오늘 누적 공부시간`,
            },
            formatStudyCafeMemberTime(getStudyCafeMemberSeconds(occupant, isMine))
          )
        : null,
      isPausedSeat
        ? el("span", {
            className: "study-cafe-seat-pause-icon",
            ariaLabel: "일시정지",
            title: "일시정지",
          })
        : null,
      occupant ? renderStudyCafeChairBack() : null,
      occupant
        ? renderStudyCafeAvatar(occupant.tone, isMine, { includeArms: false })
        : el("span", { className: "study-cafe-empty-plus" }, "+"),
      el("span", { className: "study-cafe-desk" }, [
        el("i", { className: "study-cafe-desk-book" }),
        el("i", { className: "study-cafe-desk-cup" }),
      ]),
      occupant ? renderStudyCafeWritingArms() : null,
    ]
  );
  if (!occupant) {
    seatButton.addEventListener("click", async () => {
      if (studyCafePreviewState.selectedSeatId) {
        openStudyCafeSeatMoveModal(seat.id, seatNumber, {
          preserveStudy: Boolean(studyCafePreviewState.subject),
        });
        return;
      }
      if (studyCafePreviewState.pendingSubject) {
        seatButton.disabled = true;
        seatButton.classList.add("loading");
        const claim = await claimStudyCafeSeat(seatNumber);
        seatButton.disabled = false;
        seatButton.classList.remove("loading");
        if (!claim.ok) return;
        studyCafePreviewState.selectedSeatId = seat.id;
        const subject = studyCafePreviewState.pendingSubject;
        applyStudyCafeSubjectSelection(seat.id, subject);
        studyCafePreviewState.pendingSubject = "";
        renderStudyCafeStateUpdate();
        notify(`${seatNumber}번 좌석에서 ${subject} 공부를 준비합니다.`);
        return;
      }
      openStudyCafeSubjectModal(seat.id, student, {
        beforeSelect: async () => {
          const claim = await claimStudyCafeSeat(seatNumber);
          if (!claim.ok) return false;
          studyCafePreviewState.selectedSeatId = seat.id;
          return true;
        },
      });
    });
  } else if (isMine) {
    seatButton.addEventListener("click", () =>
      openStudyCafeSubjectModal(seat.id, student, {
        preserveTimer: Boolean(studyCafePreviewState.subject),
      })
    );
  } else {
    seatButton.addEventListener("click", () => openStudyCafeMemberModal(occupant, seatNumber));
  }
  return seatButton;
}

function openStudyCafeMemberModal(occupant, seatNumber) {
  const statusLabel = occupant.status === "paused"
    ? "일시정지"
    : occupant.status === "seated"
      ? "착석 중"
      : "집중 중";
  const timeMode = occupant.remote
    ? occupant.status === "studying" ? "remote" : "static"
    : "mock";

  openInfoModal({
    title: `${occupant.name}님의 자리`,
    className: "study-cafe-member-modal",
    content: el("div", { className: "study-cafe-member-detail" }, [
      el("div", { className: "study-cafe-member-avatar-stage", ariaHidden: "true" }, [
        el("div", { className: "study-cafe-member-seat-scene" }, [
          renderStudyCafeChairBack(),
          renderStudyCafeAvatar(occupant.tone || "navy", false, { includeArms: false }),
          el("span", { className: "study-cafe-desk" }, [
            el("i", { className: "study-cafe-desk-book" }),
            el("i", { className: "study-cafe-desk-cup" }),
          ]),
          renderStudyCafeWritingArms(),
        ]),
      ]),
      el("div", { className: "study-cafe-member-profile" }, [
        el("strong", {}, occupant.name),
        el("span", {}, occupant.fullTrack || occupant.track || "직렬 미등록"),
      ]),
      el("div", { className: "study-cafe-member-chips" }, [
        el("span", {}, `${seatNumber}번 좌석`),
        el("span", { className: `status ${occupant.status || "studying"}` }, statusLabel),
      ]),
      el("dl", { className: "study-cafe-member-info-list" }, [
        occupant.currentSubject
          ? el("div", {}, [
              el("dt", {}, "현재 과목"),
              el("dd", {}, occupant.currentSubject),
            ])
          : null,
        el("div", {}, [
          el("dt", {}, "오늘 순공시간"),
          el(
            "dd",
            {},
            el(
              "time",
              {
                "data-study-member-time": timeMode,
                "data-study-base-seconds": String(Number(occupant.todaySeconds) || 0),
              },
              formatStudyCafeMemberTime(getStudyCafeMemberSeconds(occupant, false))
            )
          ),
        ]),
      ]),
    ]),
  });
}

function summarizeStudyCafeTrack(value) {
  const track = String(value || "").trim();
  if (!track) return "온라인 수강";
  const rules = [
    [/해상교통관제\(VTS\)/, "VTS"],
    [/선박교통관제\(VTS\)/, "VTS"],
    [/해경학과\s*항해/, "학과·항해"],
    [/해경학과\s*기관/, "학과·기관"],
    [/함정요원\s*항해/, "함정·항해"],
    [/함정요원\s*기관/, "함정·기관"],
    [/해양오염방제\s*환경/, "방제·환경"],
    [/해양오염방제\s*화공/, "방제·화공"],
    [/해양오염방제\s*항해/, "방제·항해"],
    [/해양오염방제\s*기관/, "방제·기관"],
    [/경위\s*공채\(해양-항해\)/, "경위·항해"],
    [/경위\s*공채\(해양-기관\)/, "경위·기관"],
    [/정보통신\s*전산/, "전산"],
    [/정보통신\s*통신/, "통신"],
    [/특공\s*전술/, "특공"],
    [/공채\(순경\)/, "공채(순경)"],
    [/구조\(순경\)/, "구조"],
    [/구급\(순경\)/, "구급"],
  ];
  const matched = rules.find(([pattern]) => pattern.test(track));
  if (matched) {
    const suffix = track.match(/\((순경|경장)\)\s*$/)?.[0] || "";
    return matched[1] === "VTS" && suffix ? `${matched[1]}${suffix}` : matched[1];
  }
  const shortened = track
    .replace(/^(경찰직|일반직)\s*-\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
  return shortened.length > 10 ? `${shortened.slice(0, 9)}…` : shortened;
}

function renderStudyCafeAvatar(tone, isMine = false, options = {}) {
  const includeArms = options.includeArms !== false;
  return el("span", { className: `study-cafe-avatar ${tone} ${isMine ? "is-mine" : ""}`, ariaHidden: "true" }, [
    el("i", { className: "study-cafe-avatar-shadow" }),
    el("i", { className: "study-cafe-avatar-body" }),
    el("i", { className: "study-cafe-avatar-face" }),
    el("i", { className: "study-cafe-avatar-hair" }),
    includeArms ? el("i", { className: "study-cafe-avatar-arm left" }) : null,
    includeArms ? el("i", { className: "study-cafe-avatar-arm right" }) : null,
  ]);
}

function renderStudyCafeWritingArms() {
  return el("span", { className: "study-cafe-writing-arms", ariaHidden: "true" }, [
    el("i", { className: "study-cafe-avatar-arm left" }),
    el("i", { className: "study-cafe-avatar-arm right" }),
  ]);
}

function renderStudyCafeChairBack() {
  return el("span", { className: "study-cafe-chair-back", ariaHidden: "true" });
}

function claimStudyCafeSeat(seatNumber, options = {}) {
  return mutateStudyCafeRemote("claim_seat", {
    seatNumber,
    avatarTone: studyCafePreviewState.avatarTone,
    displayName: getStudyCafeDisplayName("나"),
    preserveStudy: options.preserveStudy === true,
  });
}

function openStudyCafeSeatMoveModal(seatId, seatNumber, options = {}) {
  const preserveStudy = options.preserveStudy === true;
  closeInfoModal();
  let moving = false;
  const cancelButton = button("취소", "btn secondary", "button", closeInfoModal);
  const moveButton = button("좌석 이동", "btn", "button", async () => {
    if (moving) return;
    moving = true;
    moveButton.disabled = true;
    cancelButton.disabled = true;
    moveButton.textContent = "이동 중…";
    const claim = await claimStudyCafeSeat(seatNumber, { preserveStudy });
    if (!claim.ok) {
      moving = false;
      moveButton.disabled = false;
      cancelButton.disabled = false;
      moveButton.textContent = "좌석 이동";
      return;
    }
    studyCafePreviewState.selectedSeatId = seatId;
    closeInfoModal();
    renderStudyCafeStateUpdate();
    notify(
      preserveStudy
        ? `${seatNumber}번 좌석으로 이동했습니다. 타이머는 계속 측정됩니다.`
        : `${seatNumber}번 좌석으로 이동했습니다. 내 좌석 카드에서 공부할 과목을 선택해주세요.`
    );
  });
  const modal = el("div", { className: "info-modal", role: "dialog", ariaModal: "true" }, [
    el("button", { className: "info-modal-backdrop", type: "button", ariaLabel: "좌석 이동 취소" }),
    el("div", { className: "info-modal-panel study-cafe-seat-move-modal" }, [
      el("strong", {}, "좌석을 변경하시겠어요?"),
      el(
        "p",
        {},
        preserveStudy
          ? `${seatNumber}번 좌석으로 이동합니다. 현재 과목과 타이머는 그대로 유지됩니다.`
          : `${seatNumber}번 좌석으로 이동합니다. 이동 후 내 좌석 카드에서 공부할 과목을 선택할 수 있습니다.`
      ),
      el("div", { className: "study-cafe-seat-move-actions" }, [
        cancelButton,
        moveButton,
      ]),
    ]),
  ]);
  modal.querySelector(".info-modal-backdrop").addEventListener("click", closeInfoModal);
  document.body.appendChild(modal);
  document.addEventListener("keydown", closeInfoModalOnEscape);
}

function openStudyCafeSubjectModal(seatId, student, options = {}) {
  const preserveTimer = options.preserveTimer === true;
  const beforeSelect = typeof options.beforeSelect === "function" ? options.beforeSelect : null;
  const subjects = getStudyTimerSubjects(student);
  const recent = subjects.includes(studyCafePreviewState.lastSubject)
    ? studyCafePreviewState.lastSubject
    : "";
  const ordered = recent ? [recent, ...subjects.filter((subject) => subject !== recent)] : subjects;
  const subjectOptionButtons = [];
  let selectionPending = false;
  ordered.forEach((subject) => {
    const optionButton = button(
      subject,
      `study-cafe-subject-option ${subject === recent ? "recent" : ""}`,
      "button",
      async () => {
        if (selectionPending) return;
        selectionPending = true;
        subjectOptionButtons.forEach((node) => {
          node.disabled = true;
        });
        const originalLabel = optionButton.textContent;
        if (beforeSelect) optionButton.textContent = "좌석 확인 중…";
        const canContinue = beforeSelect ? await beforeSelect(subject) : true;
        if (!canContinue) {
          selectionPending = false;
          subjectOptionButtons.forEach((node) => {
            node.disabled = false;
          });
          optionButton.textContent = originalLabel;
          return;
        }
        applyStudyCafeSubjectSelection(seatId, subject, { preserveTimer });
        closeInfoModal();
        render();
        if (preserveTimer) notify(`${subject} 과목으로 변경을 준비합니다.`);
      }
    );
    subjectOptionButtons.push(optionButton);
  });
  openInfoModal({
    title: preserveTimer ? "공부할 과목을 변경할까요?" : "어떤 과목을 공부할까요?",
    className: "study-cafe-subject-modal",
    content: el("div", { className: "study-cafe-subject-picker" }, [
      el(
        "p",
        {},
        preserveTimer
          ? "현재 자리와 전체 공부시간은 유지되고, 선택한 과목으로 바로 이어집니다."
          : "과목을 선택하면 캐릭터가 자리에 앉고 타이머가 시작됩니다."
      ),
      el(
        "div",
        { className: "study-cafe-subject-options" },
        subjectOptionButtons
      ),
      preserveTimer
        ? button(
            "과목 공부 종료",
            "study-cafe-subject-stop-button",
            "button",
            () => stopStudyCafePreviewTimer({ closeModalOnSuccess: true })
          )
        : null,
    ]),
  });
}

function applyStudyCafeSubjectSelection(seatId, subject, options = {}) {
  const preserveTimer = options.preserveTimer === true;
  const previousSubject = studyCafePreviewState.subject;
  if (studyCafePreviewState.running && previousSubject) commitCurrentStudySubjectElapsed();
  cancelStudyCafeCountdown();
  studyCafePreviewState.selectedSeatId = seatId;
  studyCafePreviewState.pendingSubject = "";
  studyCafePreviewState.subject = subject;
  studyCafePreviewState.lastSubject = subject;
  if (!preserveTimer) {
    studyCafePreviewState.elapsedMs = 0;
  }
  studyCafePreviewState.running = false;
  studyCafePreviewState.paused = false;
  studyCafePreviewState.startedAt = 0;
  studyCafePreviewState.subjectStartedAt = 0;
  startStudyCafeCountdown(seatId, subject);
}

function cancelStudyCafeCountdown() {
  studyCafeCountdownId += 1;
  if (studyCafeCountdownInterval) window.clearInterval(studyCafeCountdownInterval);
  if (studyCafeCountdownCleanupTimer) window.clearTimeout(studyCafeCountdownCleanupTimer);
  studyCafeCountdownInterval = null;
  studyCafeCountdownCleanupTimer = null;
  document.querySelector(".study-cafe-countdown-overlay")?.remove();
}

function startStudyCafeCountdown(seatId, subject) {
  if (studyCafeTimerActionPending) return;
  const resumeExistingSession =
    studyCafePreviewState.paused &&
    studyCafePreviewState.selectedSeatId === seatId &&
    studyCafePreviewState.subject === subject;
  cancelStudyCafeCountdown();
  const countdownId = studyCafeCountdownId;
  let remaining = 3;
  const number = el("strong", { className: "study-cafe-countdown-number" }, String(remaining));
  const overlay = el(
    "div",
    {
      className: "study-cafe-countdown-overlay",
      role: "status",
      ariaLive: "assertive",
      ariaLabel: `${subject} 타이머 시작 카운트다운`,
    },
    [
      el("div", { className: "study-cafe-countdown-panel" }, [
        el("span", {}, subject),
        number,
        el("p", {}, "집중할 준비를 해주세요"),
      ]),
    ]
  );
  document.body.append(overlay);
  studyCafeCountdownInterval = window.setInterval(() => {
    if (countdownId !== studyCafeCountdownId) return;
    remaining -= 1;
    if (remaining > 0) {
      number.textContent = String(remaining);
      return;
    }
    window.clearInterval(studyCafeCountdownInterval);
    studyCafeCountdownInterval = null;
    if (
      studyCafePreviewState.selectedSeatId === seatId &&
      studyCafePreviewState.subject === subject
    ) {
      number.textContent = "시작!";
      overlay.classList.add("go");
      studyCafeCountdownCleanupTimer = window.setTimeout(() => {
        if (countdownId === studyCafeCountdownId) overlay.remove();
        studyCafeCountdownCleanupTimer = null;
      }, 280);
      beginStudyCafeTimer(seatId, subject, resumeExistingSession).then((started) => {
        if (countdownId !== studyCafeCountdownId) return;
        if (!started) notify("타이머를 시작하지 못했습니다. 다시 시도해주세요.");
      });
      return;
    }
    studyCafeCountdownCleanupTimer = window.setTimeout(() => {
      if (countdownId === studyCafeCountdownId) overlay.remove();
      studyCafeCountdownCleanupTimer = null;
    }, 280);
  }, 1000);
}

async function beginStudyCafeTimer(seatId, subject, resumeExistingSession) {
  if (studyCafeTimerActionPending) return false;
  studyCafeTimerActionPending = true;
  const previousTimerState = {
    elapsedMs: studyCafePreviewState.elapsedMs,
    startedAt: studyCafePreviewState.startedAt,
    subjectStartedAt: studyCafePreviewState.subjectStartedAt,
    running: studyCafePreviewState.running,
    paused: studyCafePreviewState.paused,
    idleSince: studyCafePreviewState.idleSince,
  };
  const optimisticStartedAt = Date.now();
  studyCafePreviewState.startedAt = optimisticStartedAt;
  studyCafePreviewState.subjectStartedAt = optimisticStartedAt;
  studyCafePreviewState.idleSince = 0;
  studyCafePreviewState.running = true;
  studyCafePreviewState.paused = false;
  clearStudyCafeIdleWarning();
  renderStudyCafeStateUpdate();
  try {
    const result = await mutateStudyCafeRemote(
      resumeExistingSession ? "timer_resume" : "timer_start",
      resumeExistingSession ? {} : { subject }
    );
    if (!result.ok) {
      Object.assign(studyCafePreviewState, previousTimerState);
      renderStudyCafeStateUpdate();
      return false;
    }
    if (
      studyCafePreviewState.selectedSeatId !== seatId ||
      studyCafePreviewState.subject !== subject
    ) {
      return false;
    }
    invalidateStudyTimerStatsCache();
    return true;
  } finally {
    studyCafeTimerActionPending = false;
  }
}

function getStudyTimerSubjects(student) {
  const configured = typeof getConfiguredWeeklySubjectsForTrack === "function"
    ? getConfiguredWeeklySubjectsForTrack(student?.track)
    : [];
  const fallback = ["해양경찰학개론", "해사법규", "형사법"];
  return [...(configured.length ? configured : fallback)]
    .map((subject) => String(subject || "").trim())
    .filter(
      (subject, index, subjects) =>
        subject &&
        subject !== "기타" &&
        subjects.indexOf(subject) === index
    )
    .slice(0, 8);
}

function openStudySubjectEditor(student) {
  const activeSubject = studyCafePreviewState.subject;
  const draft = getStudyTimerSubjects(student).map((name) => ({
    originalName: name,
    name,
  }));
  const list = el("div", { className: "study-subject-edit-list" });

  const renderRows = () => {
    list.replaceChildren(
      ...draft.map((item, index) => {
        const isActive = Boolean(activeSubject && item.originalName === activeSubject);
        const input = el("input", {
          type: "text",
          value: item.name,
          maxLength: 20,
          ariaLabel: `${index + 1}번째 과목명`,
          disabled: isActive,
        });
        input.addEventListener("input", () => {
          item.name = input.value;
        });
        const deleteButton = button(
          isActive ? "측정 중" : "삭제",
          "study-subject-delete-button",
          "button",
          isActive
            ? null
            : () => {
                if (draft.length <= 1) return notify("과목은 1개 이상 필요합니다.");
                draft.splice(index, 1);
                renderRows();
              }
        );
        deleteButton.disabled = isActive;
        return el("div", { className: `study-subject-edit-row ${isActive ? "active" : ""}` }, [
          el("span", { className: "study-subject-edit-number" }, String(index + 1)),
          input,
          deleteButton,
        ]);
      })
    );
  };

  const addSubject = () => {
    if (draft.length >= 8) return notify("과목은 최대 8개까지 등록할 수 있습니다.");
    let number = 1;
    let name = "새 과목";
    const usedNames = new Set(draft.map((item) => item.name.trim()));
    while (usedNames.has(name)) {
      number += 1;
      name = `새 과목 ${number}`;
    }
    draft.push({ originalName: "", name });
    renderRows();
    list.querySelector(".study-subject-edit-row:last-child input")?.focus();
  };

  const saveSubjects = async () => {
    const names = draft.map((item) => item.name.trim());
    if (names.some((name) => !name)) return notify("과목명을 입력해주세요.");
    if (new Set(names).size !== names.length) return notify("같은 과목명은 한 번만 사용할 수 있습니다.");
    const elapsedBefore = { ...studyCafePreviewState.subjectElapsedMs };
    const renamed = draft
      .map((item, index) => ({
        previousName: item.originalName,
        nextName: names[index],
      }))
      .filter(({ previousName, nextName }) => previousName && previousName !== nextName);
    renamed.forEach(({ previousName }) => {
      delete studyCafePreviewState.subjectElapsedMs[previousName];
    });
    renamed.forEach(({ previousName, nextName }) => {
      const previousElapsed = Number(elapsedBefore[previousName]) || 0;
      if (previousElapsed) {
        studyCafePreviewState.subjectElapsedMs[nextName] =
          (Number(studyCafePreviewState.subjectElapsedMs[nextName]) || 0) + previousElapsed;
      }
    });
    draft.forEach((item, index) => {
      const previousName = item.originalName;
      const nextName = names[index];
      if (!previousName || previousName === nextName) return;
      if (studyCafePreviewState.lastSubject === previousName) {
        studyCafePreviewState.lastSubject = nextName;
      }
    });
    studyCafePreviewState.customSubjects = names;
    const result = await mutateStudyCafeRemote("save_subjects", { subjects: names });
    if (!result.ok) return;
    closeInfoModal();
    render();
    notify("과목 목록을 저장했습니다.");
  };

  renderRows();
  openInfoModal({
    title: "과목 편집",
    className: "study-subject-edit-modal",
    content: el("div", { className: "study-subject-editor" }, [
      activeSubject
        ? el("p", {}, "현재 측정 중인 과목은 종료 후 편집할 수 있습니다.")
        : el("p", {}, "과목명을 변경하거나 필요한 과목을 추가해보세요."),
      list,
      button("+ 과목 추가", "study-subject-add-button", "button", addSubject),
      button("저장하기", "btn", "button", saveSubjects),
    ]),
  });
}

function renderStudyCafeFloatingActions(student) {
  const actionMenu = el("div", {
    className: "study-cafe-floating-action-menu",
    role: "menu",
    ariaLabel: "공부 중 기능",
    hidden: true,
  });
  const controls = el("div", { className: "study-cafe-floating-controls" });
  const menuButton = el(
    "button",
    {
      className: "study-cafe-floating-menu-button",
      type: "button",
      ariaLabel: "공부 메뉴 열기",
      ariaExpanded: "false",
    },
    [
      el("span", { ariaHidden: "true" }, "⋮"),
      el("small", {}, "공부 메뉴"),
    ]
  );

  const closeMenu = ({ restoreFocus = false } = {}) => {
    controls.classList.remove("open");
    actionMenu.hidden = true;
    menuButton.setAttribute("aria-expanded", "false");
    menuButton.setAttribute("aria-label", "공부 메뉴 열기");
    if (restoreFocus) menuButton.focus();
  };
  const action = (label, icon, tone, handler) =>
    el(
      "button",
      {
        className: `study-cafe-floating-action ${tone}`,
        type: "button",
        role: "menuitem",
        onclick: () => {
          closeMenu();
          handler();
        },
      },
      [
        el("strong", {}, label),
        el("span", { ariaHidden: "true" }, icon),
      ]
    );

  actionMenu.append(
    action(
      studyCafePreviewState.paused ? "다시 시작" : "일시정지",
      studyCafePreviewState.paused ? "▶" : "Ⅱ",
      "pause",
      toggleStudyCafePreviewTimer
    ),
    action("과목 변경", "↻", "change", () => {
      openStudyCafeSubjectModal(studyCafePreviewState.selectedSeatId, student, { preserveTimer: true });
    }),
    action("과목 종료", "■", "stop", stopStudyCafePreviewTimer)
  );

  menuButton.addEventListener("click", (event) => {
    event.stopPropagation();
    const willOpen = !controls.classList.contains("open");
    if (!willOpen) {
      closeMenu();
      return;
    }
    actionMenu.hidden = false;
    controls.classList.add("open");
    menuButton.setAttribute("aria-expanded", "true");
    menuButton.setAttribute("aria-label", "공부 메뉴 닫기");
    actionMenu.querySelector("button")?.focus();
  });
  controls.addEventListener("click", (event) => {
    if (event.target === controls) closeMenu({ restoreFocus: true });
  });
  controls.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu({ restoreFocus: true });
  });
  controls.append(actionMenu, menuButton);
  return controls;
}

function getStudyCafeElapsedMs() {
  return studyCafePreviewState.elapsedMs +
    (studyCafePreviewState.running && studyCafePreviewState.startedAt ? Date.now() - studyCafePreviewState.startedAt : 0);
}

function getStudySubjectElapsedMs(subject) {
  const saved = Number(studyCafePreviewState.subjectElapsedMs?.[subject]) || 0;
  if (
    studyCafePreviewState.running &&
    studyCafePreviewState.subject === subject &&
    studyCafePreviewState.subjectStartedAt
  ) {
    return saved + (Date.now() - studyCafePreviewState.subjectStartedAt);
  }
  return saved;
}

function getStudySubjectTotalElapsedMs() {
  const subjects = Object.keys(studyCafePreviewState.subjectElapsedMs || {});
  const savedTotal = subjects.reduce(
    (total, subject) => total + (Number(studyCafePreviewState.subjectElapsedMs[subject]) || 0),
    0
  );
  return savedTotal +
    (studyCafePreviewState.running && studyCafePreviewState.subjectStartedAt
      ? Date.now() - studyCafePreviewState.subjectStartedAt
      : 0);
}

function commitCurrentStudySubjectElapsed() {
  const subject = studyCafePreviewState.subject;
  if (!subject || !studyCafePreviewState.running || !studyCafePreviewState.subjectStartedAt) return;
  if (!studyCafePreviewState.subjectElapsedMs) studyCafePreviewState.subjectElapsedMs = {};
  studyCafePreviewState.subjectElapsedMs[subject] =
    (Number(studyCafePreviewState.subjectElapsedMs[subject]) || 0) +
    (Date.now() - studyCafePreviewState.subjectStartedAt);
  studyCafePreviewState.subjectStartedAt = 0;
}

function formatStudyCafeElapsed(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(Number(milliseconds || 0) / 1000));
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function getStudyCafeMemberSeconds(occupant, isMine = false) {
  if (isMine) return Math.floor(getStudySubjectTotalElapsedMs() / 1000);
  const baseSeconds = Number(occupant?.todaySeconds) || 0;
  if (occupant?.remote) {
    return baseSeconds + (occupant.status === "studying"
      ? Math.floor((Date.now() - (studyCafeRemoteState.lastLoadedAt || Date.now())) / 1000)
      : 0);
  }
  return baseSeconds + Math.floor((Date.now() - STUDY_CAFE_PREVIEW_EPOCH) / 1000);
}

function formatStudyCafeMemberTime(seconds) {
  return formatStudyCafeElapsed(Math.max(0, Number(seconds) || 0) * 1000);
}

function ensureStudyCafePreviewClock() {
  if (studyCafePreviewClock) return;
  studyCafePreviewClock = window.setInterval(() => {
    checkStudyCafeIdleSeat();
    const clock = document.querySelector("[data-study-cafe-clock]");
    if (clock) {
      clock.textContent = formatStudyCafeElapsed(getStudySubjectElapsedMs(studyCafePreviewState.subject));
    }
    document.querySelectorAll("[data-study-member-time]").forEach((time) => {
      const seconds = time.dataset.studyMemberTime === "mine"
        ? Math.floor(getStudySubjectTotalElapsedMs() / 1000)
        : (Number(time.dataset.studyBaseSeconds) || 0) +
          (time.dataset.studyMemberTime === "static"
            ? 0
            : Math.floor(
                (Date.now() -
                  (time.dataset.studyMemberTime === "remote"
                    ? studyCafeRemoteState.lastLoadedAt || Date.now()
                    : STUDY_CAFE_PREVIEW_EPOCH)) /
                  1000
              ));
      time.textContent = formatStudyCafeMemberTime(seconds);
    });
    document.querySelectorAll("[data-study-total-time]").forEach((totalTime) => {
      totalTime.textContent = formatStudyCafeElapsed(getStudySubjectTotalElapsedMs());
    });
    document.querySelectorAll("[data-study-subject-time]").forEach((time) => {
      time.textContent = formatStudyCafeElapsed(getStudySubjectElapsedMs(time.dataset.studySubjectTime));
    });
  }, 1000);
}

async function toggleStudyCafePreviewTimer() {
  if (studyCafeTimerActionPending) return;
  if (studyCafePreviewState.running) {
    if (!confirm("공부 타이머를 일시정지할까요?")) return;
    studyCafeTimerActionPending = true;
    const previousTimerState = {
      elapsedMs: studyCafePreviewState.elapsedMs,
      startedAt: studyCafePreviewState.startedAt,
      subjectStartedAt: studyCafePreviewState.subjectStartedAt,
      subjectElapsedMs: { ...(studyCafePreviewState.subjectElapsedMs || {}) },
      running: studyCafePreviewState.running,
      paused: studyCafePreviewState.paused,
      idleSince: studyCafePreviewState.idleSince,
    };
    const pausedElapsedMs = getStudyCafeElapsedMs();
    commitCurrentStudySubjectElapsed();
    studyCafePreviewState.elapsedMs = pausedElapsedMs;
    studyCafePreviewState.startedAt = 0;
    studyCafePreviewState.running = false;
    studyCafePreviewState.paused = true;
    studyCafePreviewState.idleSince = Date.now();
    renderStudyCafeStateUpdate();
    let result;
    try {
      result = await mutateStudyCafeRemote("timer_pause");
    } finally {
      studyCafeTimerActionPending = false;
    }
    if (!result?.ok) {
      Object.assign(studyCafePreviewState, previousTimerState);
      renderStudyCafeStateUpdate();
      return;
    }
    invalidateStudyTimerStatsCache();
  } else if (studyCafePreviewState.paused) {
    beginStudyCafeTimer(
      studyCafePreviewState.selectedSeatId,
      studyCafePreviewState.subject,
      true
    );
  } else {
    startStudyCafeCountdown(
      studyCafePreviewState.selectedSeatId,
      studyCafePreviewState.subject
    );
  }
}

async function stopStudyCafePreviewTimer(options = {}) {
  if (studyCafeTimerActionPending) return;
  if (!confirm(`${studyCafePreviewState.subject} 공부를 종료할까요?`)) return;
  studyCafeTimerActionPending = true;
  let result;
  try {
    result = await mutateStudyCafeRemote("timer_stop");
  } finally {
    studyCafeTimerActionPending = false;
  }
  if (!result.ok) return;
  cancelStudyCafeCountdown();
  commitCurrentStudySubjectElapsed();
  studyCafePreviewState.subject = "";
  studyCafePreviewState.pendingSubject = "";
  studyCafePreviewState.running = false;
  studyCafePreviewState.paused = false;
  studyCafePreviewState.elapsedMs = 0;
  studyCafePreviewState.startedAt = 0;
  studyCafePreviewState.subjectStartedAt = 0;
  studyCafePreviewState.idleSince = Date.now();
  studyCafePreviewState.timerFullscreen = false;
  invalidateStudyTimerStatsCache();
  if (options.closeModalOnSuccess === true) closeInfoModal();
  renderStudyCafeStateUpdate();
  notify("과목 공부를 종료했습니다. 현재 좌석은 그대로 유지됩니다.");
}

async function releaseStudyCafeSeat(options = {}) {
  const seatNumber = STUDY_CAFE_PREVIEW_SEATS.findIndex(
    (seat) => seat.id === studyCafePreviewState.selectedSeatId
  ) + 1;
  if (!seatNumber || (options.skipConfirm !== true && !confirm(`${seatNumber}번 좌석을 비울까요?`))) {
    return false;
  }
  const result = await mutateStudyCafeRemote("release_seat");
  if (!result.ok) return false;
  cancelStudyCafeCountdown();
  clearStudyCafeIdleWarning();
  studyCafePreviewState.selectedSeatId = "";
  studyCafePreviewState.subject = "";
  studyCafePreviewState.pendingSubject = "";
  studyCafePreviewState.running = false;
  studyCafePreviewState.paused = false;
  studyCafePreviewState.elapsedMs = 0;
  studyCafePreviewState.startedAt = 0;
  studyCafePreviewState.subjectStartedAt = 0;
  studyCafePreviewState.idleSince = 0;
  studyCafePreviewState.timerFullscreen = false;
  if (!studyCafePreviewState.nickname) {
    studyCafePreviewState.temporaryNickname = "";
    studyCafePreviewState.temporaryNicknameAwaitingEntry = true;
  }
  render();
  notify(
    options.autoRelease === true
      ? "15분 동안 타이머가 정지되어 좌석이 자동으로 비워졌습니다."
      : `${seatNumber}번 좌석을 비웠습니다.`
  );
  return true;
}

function checkStudyCafeIdleSeat() {
  if (!studyCafePreviewState.selectedSeatId || studyCafePreviewState.running) {
    studyCafePreviewState.idleSince = 0;
    clearStudyCafeIdleWarning();
    return;
  }
  if (!studyCafePreviewState.idleSince) {
    studyCafePreviewState.idleSince = Date.now();
    return;
  }
  if (Date.now() - studyCafePreviewState.idleSince < STUDY_CAFE_IDLE_WARNING_MS) return;
  if (document.visibilityState === "hidden") return;
  const warning = document.querySelector("[data-study-cafe-idle-warning]");
  if (!warning) {
    openStudyCafeIdleWarning();
    return;
  }
  if (studyCafeIdleReleasePending) return;
  studyCafeIdleWarningRemaining = Math.max(0, studyCafeIdleWarningRemaining - 1);
  const countdown = warning.querySelector("[data-study-cafe-idle-countdown]");
  if (countdown) countdown.textContent = String(studyCafeIdleWarningRemaining);
  if (studyCafeIdleWarningRemaining === 0) {
    studyCafeIdleReleasePending = true;
    releaseStudyCafeSeat({ skipConfirm: true, autoRelease: true })
      .then((released) => {
        if (released) return;
        studyCafeIdleWarningRemaining = STUDY_CAFE_IDLE_COUNTDOWN_SECONDS;
        const activeCountdown = document.querySelector("[data-study-cafe-idle-countdown]");
        if (activeCountdown) activeCountdown.textContent = String(studyCafeIdleWarningRemaining);
      })
      .finally(() => {
        studyCafeIdleReleasePending = false;
      });
  }
}

function openStudyCafeIdleWarning() {
  closeInfoModal();
  studyCafeIdleWarningRemaining = STUDY_CAFE_IDLE_COUNTDOWN_SECONDS;
  const countdown = el(
    "strong",
    {
      className: "study-cafe-idle-countdown",
      "data-study-cafe-idle-countdown": "true",
      ariaLive: "assertive",
    },
    String(studyCafeIdleWarningRemaining)
  );
  const keepButton = button("자리 유지", "btn study-cafe-idle-keep-button", "button", async () => {
    if (studyCafeIdleReleasePending) return;
    studyCafeIdleReleasePending = true;
    keepButton.disabled = true;
    const result = await mutateStudyCafeRemote("keep_seat");
    studyCafeIdleReleasePending = false;
    if (!result.ok) {
      keepButton.disabled = false;
      studyCafeIdleWarningRemaining = STUDY_CAFE_IDLE_COUNTDOWN_SECONDS;
      countdown.textContent = String(studyCafeIdleWarningRemaining);
      return;
    }
    studyCafePreviewState.idleSince = Date.now();
    clearStudyCafeIdleWarning();
    notify("좌석이 유지되었습니다. 15분 후 다시 확인합니다.");
  });
  const modal = el(
    "div",
    {
      className: "info-modal",
      role: "alertdialog",
      ariaModal: "true",
      "data-study-cafe-idle-warning": "true",
    },
    [
      el("div", { className: "info-modal-backdrop", ariaHidden: "true" }),
      el("div", { className: "info-modal-panel study-cafe-idle-warning-modal" }, [
        el("strong", {}, "좌석을 계속 이용하시겠어요?"),
        el("p", {}, "15분 동안 타이머가 정지되어 있습니다."),
        el("div", { className: "study-cafe-idle-countdown-wrap" }, [
          countdown,
          el("span", {}, "초 후 자동 퇴실"),
        ]),
        el("p", { className: "subtle" }, "계속 이용하려면 아래 버튼을 눌러주세요."),
        keepButton,
      ]),
    ]
  );
  document.body.appendChild(modal);
}

function clearStudyCafeIdleWarning() {
  document.querySelector("[data-study-cafe-idle-warning]")?.remove();
  studyCafeIdleWarningRemaining = 0;
}

function renderStudentDeviceManagementCard(student, profile) {
  const activeCount = Math.max(1, Number(profile.deviceActiveCount || 1));
  return el("section", { className: "student-history-button-card student-device-card" }, [
    el("div", { className: "student-history-head" }, [
      el("h2", {}, "등록 기기"),
      el("span", {}, `${activeCount}/2대`),
    ]),
  ]);
}

async function openStudentDeviceManager(studentId) {
  const profile = getStudentProfile(studentId);
  if (!profile?.deviceToken) return notify("현재 기기 등록 정보를 찾을 수 없습니다.");
  openLoadingModal("등록 기기 확인 중", "사용 중인 기기 목록을 불러오고 있습니다.");
  try {
    const result = await requestStudentDeviceAction("list", { studentId, deviceToken: profile.deviceToken });
    if (!result.ok) {
      if (result.error === "device_not_active") {
        clearStudentDeviceAuth(studentId);
        saveState({ skipRemote: true });
        render();
        return notify("현재 기기의 등록이 해제되었습니다. 다시 등록해주세요.");
      }
      return notify("등록 기기 목록을 불러오지 못했습니다.");
    }
    profile.deviceActiveCount = result.devices.length;
    saveState({ skipRemote: true });
    openInfoModal({
      title: "등록 기기 관리",
      className: "student-device-manager-modal",
      content: renderStudentDeviceList(studentId, result.devices),
    });
  } catch (error) {
    console.error(error);
    notify("등록 기기 서버에 연결하지 못했습니다.");
  } finally {
    closeLoadingModal();
  }
}

function renderStudentDeviceList(studentId, devices) {
  if (!devices.length) return el("div", { className: "empty" }, "등록된 기기가 없습니다.");
  return el("div", { className: "student-device-list" }, devices.map((device) =>
    el("article", { className: "student-device-item" }, [
      el("div", { className: "student-device-item-head" }, [
        el("strong", {}, device.label || "등록 기기"),
        device.isCurrent ? el("span", { className: "badge approved" }, "현재 기기") : null,
      ]),
      el("p", { className: "subtle" }, `등록 ${formatDateCompact(device.registeredAt)} · 최근 사용 ${formatDateCompact(device.lastUsedAt)}`),
      device.tokenPreview ? el("small", {}, `기기 코드 ···${device.tokenPreview}`) : null,
      button(device.isCurrent ? "현재 기기 해제" : "이 기기 해제", "mini-btn danger", "button", () =>
        revokeStudentDevice(studentId, device)
      ),
    ])
  ));
}

async function revokeStudentDevice(studentId, device) {
  const message = device.isCurrent
    ? "현재 기기를 해제하면 다시 등록해야 합니다. 계속할까요?"
    : `${device.label || "선택한 기기"}를 해제할까요?`;
  if (!confirm(message)) return;
  const profile = getStudentProfile(studentId);
  if (!profile?.deviceToken) return;
  try {
    const result = await requestStudentDeviceAction("revoke", {
      studentId,
      deviceToken: profile.deviceToken,
      targetDeviceId: device.id,
      reason: "학생 개별 기기 해제",
    });
    if (!result.ok) return notify("기기를 해제하지 못했습니다. 목록을 다시 확인해주세요.");
    if (result.selfRevoked) {
      closeInfoModal();
      clearStudentDeviceAuth(studentId);
      saveState({ skipRemote: true });
      render();
      return notify("현재 기기를 해제했습니다. 다시 등록해주세요.");
    }
    profile.deviceActiveCount = result.activeCount || 1;
    notify("선택한 기기를 해제했습니다.");
    await openStudentDeviceManager(studentId);
  } catch (error) {
    console.error(error);
    notify("기기 해제 중 오류가 발생했습니다.");
  }
}

function clearStudentDeviceAuth(studentId) {
  if (state.settings.studentProfiles?.[studentId]) delete state.settings.studentProfiles[studentId];
  if (state.settings.studentAuthId === studentId) state.settings.studentAuthId = "";
  if (state.settings.lastStudentId === studentId) state.settings.lastStudentId = "";
}

async function requestStudentDeviceAction(action, payload) {
  const response = await fetch("/api/student-devices", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await response.json().catch(() => ({}));
  return { ...data, ok: response.ok && data.ok === true, httpStatus: response.status };
}

function renderStudentOutingHistoryButton(studentId) {
  const outings = state.outings
    .filter((outing) => outing.studentId === String(studentId))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return el("section", { className: "student-history-button-card" }, [
    el("div", { className: "student-history-head" }, [
      el("h2", {}, "외출 내역"),
      el("span", {}, String(outings.length) + "건"),
    ]),
    button("외출 내역 보기", "btn secondary", "button", () => openStudentOutingHistoryModal(studentId)),
  ]);
}

function openStudentOutingHistoryModal(studentId) {
  const outings = state.outings
    .filter((outing) => outing.studentId === String(studentId))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  openInfoModal({
    title: "외출 내역",
    className: "history-modal-panel outing-history-modal",
    content: outings.length
      ? el(
          "div",
          { className: "student-history-list" },
          outings.map((outing) =>
            el("article", { className: "student-history-item" }, [
              historyRow("날짜", formatDateOnly(outing.createdAt)),
              historyRow("사유", outing.reason || "-"),
              historyRow("외출 시간", formatTimeOnly(outing.createdAt)),
              historyRow("복귀 시간", getOutingReturnedAt(outing) ? formatTimeOnly(getOutingReturnedAt(outing)) : "-"),
            ])
          )
        )
      : el("div", { className: "empty" }, "아직 외출 내역이 없습니다."),
  });
}

function renderStudentPenaltyHistoryButton(studentId) {
  const penalties = getPenaltiesForStudent(studentId);
  const total = getPenaltyTotal(studentId);

  return el("section", { className: "student-history-button-card student-penalty-card" }, [
    el("div", { className: "student-history-head" }, [
      el("h2", {}, "상/벌점 내역"),
      el("span", {}, `누적 ${formatPenaltyPoints(total)} · ${penalties.length}건`),
    ]),
    button("상/벌점 내역 보기", "btn secondary", "button", () => openStudentPenaltyHistoryModal(studentId)),
  ]);
}

function openStudentPenaltyHistoryModal(studentId) {
  const penalties = getPenaltiesForStudent(studentId);
  openInfoModal({
    title: "상/벌점 내역",
    className: "history-modal-panel penalty-detail-modal",
    content: penalties.length
      ? renderPenaltyDetailTable(penalties)
      : el("div", { className: "empty" }, "아직 상/벌점 내역이 없습니다."),
  });
}

function renderPenaltyDetailTable(penalties) {
  const showCancel = penalties.some((penalty) => typeof canCancelPenalty === "function" && canCancelPenalty(penalty));
  const headers = showCancel ? ["날짜", "상/벌점", "사유", "담당자", "관리"] : ["날짜", "상/벌점", "사유", "담당자"];
  const rows = penalties.map((penalty) =>
    el("tr", {}, [
      el("td", {}, formatDateOnly(penalty.createdAt)),
      el("td", {}, formatPenaltyPoints(penalty.points)),
      el("td", { className: "wide-cell" }, penalty.reason || "-"),
      el("td", {}, penalty.managerName || "-"),
      showCancel
        ? el(
            "td",
            { className: "student-admin-actions" },
            typeof canCancelPenalty === "function" && canCancelPenalty(penalty)
              ? button("취소", "mini-btn danger", "button", () => cancelPenalty(penalty.id))
              : "-"
          )
        : null,
    ].filter(Boolean))
  );
  labelTableRows(headers, rows);

  return el("div", { className: "excel-table-wrap penalty-detail-table-wrap" }, [
    el("table", { className: "excel-table penalty-detail-table" }, [
      el("thead", {}, [
        el("tr", {}, headers.map((header) => el("th", {}, header))),
      ]),
      el("tbody", {}, rows),
    ]),
  ]);
}

function historyRow(label, value) {
  return el("div", { className: "student-history-row" }, [
    el("span", {}, label),
    el("strong", {}, value),
  ]);
}

function formatDateOnly(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).format(new Date(value));
}

function formatTimeOnly(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function resolveStudentTrack(track, customTrack) {
  const selected = normalizeCoastGuardTrack(track);
  if (selected !== "기타") return selected;
  return String(customTrack || "").trim();
}

function profileItem(label, value) {
  return el("div", { className: "student-profile-item" }, [
    el("span", {}, label),
    el("strong", {}, value),
  ]);
}

function formatDday(dateString) {
  const target = new Date(`${dateString}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.ceil((target - today) / 86400000);
  if (diff === 0) return "D-Day";
  if (diff > 0) return `D-${diff}`;
  return `D+${Math.abs(diff)}`;
}

function formatExamDate(dateString) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).format(new Date(`${dateString}T00:00:00`));
}

function renderHome() {
  const activeOutings = state.outings.filter(isActiveOuting);
  const todayEarlyLeaves = state.outings.filter(isTodayEarlyLeave);
  const activeOutingCases = state.outings.filter(isActiveOuting);
  const returnedTodayCases = state.outings.filter((outing) => isToday(getOutingReturnedAt(outing)));

  return el("div", { className: "grid" }, [
    el("div", { className: "stat-groups" }, [
      studentCountStatGroup(),
      statGroup("외출 인원", [
        stat("외출 중 학생", countOutingStudents(activeOutings), "명"),
        stat("조퇴 인원", countOutingStudents(todayEarlyLeaves), "명"),
      ]),
      statGroup("외출 건수", [
        stat("진행 중", activeOutingCases.length, "건"),
        stat("외출 중", activeOutings.length, "건"),
        stat("오늘 복귀", returnedTodayCases.length, "건"),
      ]),
    ]),
    panel("관리 메뉴", [
      el("div", { className: "module-grid" }, [
        hasTeacherPermission("outing.read") ? moduleCard("외출 관리", "외출 신청, 사진 인증, 복귀 확인을 관리합니다.", "outing", "운영 중") : null,
        hasTeacherPermission("grades.read") ? moduleCard("주간평가", "주차별 시험, 과목, 정답과 답안지 파일을 관리합니다.", "weekly-exams", "운영 중") : null,
        hasTeacherPermission("grades.read") ? moduleCard("주간평가 미응시자", "주차별 미응시자와 일부 응시자를 확인합니다.", "weekly-absences", "운영 중") : null,
        hasTeacherPermission("grades.read") ? moduleCard("성적 관리", "주간평가와 파이널 모의고사 성적을 학생별로 조회합니다.", "grades", "운영 중") : null,
        hasTeacherPermission("fitness.read") ? moduleCard("체력평가", "윗몸일으키기, 팔굽혀펴기, 좌우악력 점수를 입력하고 환산 점수를 조회합니다.", "fitness", "운영 중") : null,
        hasTeacherPermission("penalties.read") ? moduleCard("상/벌점 관리", "상/벌점 부여, 누적 점수, 지도 기록을 관리합니다.", "penalties", "운영 중") : null,
        hasTeacherPermission("attendance.read") ? moduleCard("출석 관리", "현장 사진 출석과 일별 출석 현황을 관리합니다.", "attendance", "운영 중") : null,
        hasTeacherPermission("study_cafe.read") ? moduleCard("온라인 스터디카페", "현재 좌석, 순공시간과 온라인 학생 이용 상태를 관리합니다.", "study-cafe-admin", "운영 중") : null,
        hasTeacherPermission("notices.read") ? moduleCard("공지 관리", "학생 홈에 표시되는 중요 공지를 등록하고 관리합니다.", "notices", "운영 중") : null,
        hasTeacherPermission("managers.read") ? moduleCard("담당자 등록", "상/벌점 처리 담당자 명단을 등록하고 관리합니다.", "managers", "운영 중") : null,
        hasTeacherPermission("students.read") ? moduleCard("기기 등록 이력", "학생 앱 기기 등록과 초기화 기록을 확인합니다.", "device-history", "운영 중") : null,
      ].filter(Boolean)),
    ]),
  ]);
}

function moduleCard(titleText, description, route, statusText) {
  return el("article", { className: "module-card" }, [
    el("div", { className: "module-card-head" }, [
      el("h3", {}, titleText),
      el("span", { className: statusText === "운영 중" ? "module-status active" : "module-status" }, statusText),
    ]),
    el("p", {}, description),
    button("열기", "btn secondary", "button", () => navigate(route)),
  ]);
}

function renderComingSoonManagement(heading, copy) {
  return el("div", { className: "grid" }, [
    panel(heading, [
      el("div", { className: "empty management-empty" }, [
        el("strong", {}, `${heading} 준비 중`),
        el("p", {}, copy),
      ]),
    ]),
  ]);
}
