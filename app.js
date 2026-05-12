const routeTitles = {
  home: "홈",
  student: "외출 신청",
  "student-verify": "사진 인증",
  "student-return": "학원 복귀 인증",
  "student-done": "복귀 완료",
  outing: "외출 관리",
  "weekly-exams": "주간평가",
  penalties: "상/벌점 관리",
  attendance: "출석 관리",
  mypage: "마이페이지",
  teacher: "외출 관리",
  managers: "담당자 등록",
  students: "학생 등록",
  "track-options": "직렬 항목 관리",
  duplicates: "중복 사진",
  trash: "삭제 내역",
  notices: "공지 관리",
};
const COAST_GUARD_EXAM_DATE = "2026-06-13";
const COAST_GUARD_EXAM_LABEL = "해양경찰 필기시험";
const COAST_GUARD_TRACK_OPTIONS = [
  "경찰직 - 공채(순경)",
  "경찰직 - 해경학과 항해(경장)",
  "경찰직 - 해경학과 기관(경장)",
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
  "기타",
];

document.querySelectorAll("[data-route]").forEach((button) => {
  button.addEventListener("click", () => navigate(button.dataset.route));
});

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

window.addEventListener("hashchange", () => {
  currentRoute = normalizeRoute(location.hash.replace("#", "") || defaultRoute());
  render();
  scrollAppToTop();
});

window.addEventListener("popstate", () => {
  currentRoute = normalizeRoute(location.hash.replace("#", "") || defaultRoute());
  render();
  scrollAppToTop();
});

currentRoute = normalizeRoute(location.hash.replace("#", "") || defaultRoute());
render();
if (APP_MODE === "teacher") {
  initTeacherAuth();
} else {
  initRemoteStore();
}

function normalizeRoute(route) {
  const legacy = {
    dashboard: "home",
    teacher: "outing",
    out: "student",
    verify: "student-verify",
    return: "student-return",
    "student-out": "student",
    settings: "home",
  };
  const normalized = legacy[route] || route;
  if (APP_MODE === "teacher") {
    const teacherRoutes = ["home", "outing", "weekly-exams", "penalties", "attendance", "notices", "managers", "students", "track-options", "duplicates", "trash"];
    if (!teacherRoutes.includes(normalized)) return "home";
    return teacherAuth.checked && teacherAuth.authenticated && !canUseRoute(normalized) ? firstAllowedTeacherRoute() : normalized;
  }
  const studentRoutes = ["home", "student", "student-verify", "student-return", "student-done", "attendance", "mypage", "notices"];
  if (studentRoutes.includes(normalized) || normalized.startsWith("notice-")) return normalized;
  return "home";
}

function defaultRoute() {
  return "home";
}

function navigate(route) {
  const nextRoute = normalizeRoute(route || defaultRoute());
  const shouldScrollOnly = nextRoute === currentRoute && location.hash === `#${nextRoute}`;
  location.hash = route;
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
  if (location.hash !== `#${currentRoute}`) {
    history.replaceState(null, "", `${location.href.split("#")[0]}#${currentRoute}`);
  }

  if (APP_MODE === "teacher") {
    document.body.classList.toggle("teacher-authenticated", Boolean(teacherAuth.authenticated));
    document.body.classList.toggle("teacher-guest", !teacherAuth.authenticated);
  }

  document.querySelectorAll("[data-route]").forEach((button) => {
    const allowed = APP_MODE !== "teacher" || !teacherAuth.authenticated || canUseRoute(button.dataset.route);
    button.hidden = !allowed;
    button.classList.toggle("active", button.dataset.route === currentRoute);
  });
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

  const routes =
    APP_MODE === "teacher"
      ? {
          home: renderHome,
          outing: renderTeacher,
          "weekly-exams": renderWeeklyExamManagement,
          penalties: renderPenaltyManagement,
          attendance: renderAttendanceManagement,
          notices: renderNoticesAdmin,
          managers: renderManagersAdmin,
          students: renderStudentsAdmin,
          "track-options": renderTrackOptionsAdmin,
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
          mypage: () => requireStudentAuth(renderStudentMypage),
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

function getRouteTitle(route) {
  if (APP_MODE !== "teacher") {
    if (route === "attendance") return "출석 체크";
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
  return student && profile?.passwordHash && profile?.deviceToken ? student : null;
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
  const profileArea = el("div", { className: "student-auth-profile", hidden: true });
  const studentNameNode = el("strong", { className: "student-auth-name" }, "-");
  let selectedStudent = null;

  const lookupButton = button("조회", "btn secondary", "button", async () => {
    selectedStudent = findStudent(idInput.value);
    if (!selectedStudent && localDevStoreUrl) {
      await initLocalDevStore();
      selectedStudent = findStudent(idInput.value);
    }
    lookupResult.innerHTML = "";
    profileArea.hidden = true;

    if (!selectedStudent) {
      lookupResult.className = "student-auth-result error";
      lookupResult.textContent = "관리자가 등록한 학생 고유번호를 찾을 수 없습니다.";
      return;
    }

    const profile = getStudentProfile(selectedStudent.id) || {};
    if (selectedStudent.appRegisteredAt && !profile.deviceToken) {
      lookupResult.className = "student-auth-result error";
      lookupResult.textContent = "이미 다른 기기에서 앱 등록이 완료된 학생입니다. 사무실에 문의해주세요.";
      return;
    }
    const normalizedTrack = normalizeCoastGuardTrack(profile.track || selectedStudent.track);
    if (getCoastGuardTrackOptions().includes(normalizedTrack)) {
      trackSelect.value = normalizedTrack;
      customTrackField.hidden = true;
      customTrackInput.value = "";
    } else if (normalizedTrack) {
      trackSelect.value = "기타";
      customTrackInput.value = normalizedTrack;
      customTrackField.hidden = false;
    }
    genderSelect.value = profile.gender || genderSelect.value;
    studentNameNode.textContent = selectedStudent.name;
    lookupResult.className = "student-auth-result success";
    lookupResult.textContent = `${selectedStudent.name} 학생이 확인되었습니다.`;
    profileArea.hidden = false;
  });

  const trackSelect = select("track", getCoastGuardTrackOptions());
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

  const form = el("form", { className: "student-auth-card" }, [
    el("div", {}, [
      el("h2", {}, "학생 등록"),
      el("p", {}, "고유번호를 입력해 본인 정보를 확인해주세요."),
    ]),
    field("학생 고유번호", el("div", { className: "student-auth-lookup" }, [idInput, lookupButton]), "", "예: 18기 4번 -> 18004"),
    lookupResult,
    profileArea,
    button("시작하기", "btn"),
  ]);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = formData(form);
    const studentId = String(data.studentId || "").trim();
    selectedStudent = selectedStudent?.id === studentId ? selectedStudent : findStudent(studentId);

    if (!selectedStudent) {
      return notify("먼저 관리자가 등록한 고유번호를 조회해주세요.");
    }
    const finalTrack = resolveStudentTrack(data.track, data.customTrack);
    if (!finalTrack || !data.gender || !data.password) {
      return notify("직렬, 성별, 비밀번호를 모두 입력해주세요.");
    }

    const profiles = ensureStudentProfiles();
    const existingProfile = profiles[studentId];
    if (selectedStudent.appRegisteredAt && !existingProfile?.deviceToken) {
      return notify("이미 다른 기기에서 앱 등록이 완료된 학생입니다. 사무실에 문의해주세요.");
    }
    const passwordHash = await hashStudentPassword(data.password);
    if (existingProfile?.passwordHash && existingProfile.passwordHash !== passwordHash) {
      return notify("비밀번호가 일치하지 않습니다.");
    }

    const deviceToken = existingProfile?.deviceToken || createDeviceToken();
    const authedAt = new Date().toISOString();

    profiles[studentId] = {
      track: finalTrack,
      gender: data.gender,
      passwordHash,
      deviceToken,
      authedAt,
    };
    selectedStudent.track = finalTrack;
    selectedStudent.gender = data.gender;
    selectedStudent.passwordHash = passwordHash;
    selectedStudent.deviceToken = deviceToken;
    selectedStudent.appRegisteredAt = authedAt;
    state.settings.studentAuthId = studentId;
    state.settings.lastStudentId = studentId;
    saveState();
    currentRoute = "home";
    if (location.hash !== "#home") location.hash = "home";
    render();
    notify(`${selectedStudent.name}님 인증되었습니다.`);
  });

  return el("div", { className: "grid student-view" }, [form, renderStudentAuthInstallCard()].filter(Boolean));
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

function renderStudentHome() {
  const student = getAuthedStudent();
  const activeOuting = student ? getActiveOuting(student.id) : null;
  const todayAttendance = student ? getStudentAttendanceForDate(student.id) : null;
  const holiday = getAttendanceHoliday();
  const needsArrivalVerification = todayAttendance?.status === "pre_arrival_reason";
  const needsAttendance = !todayAttendance && !holiday;
  const homeAction = getStudentHomeAction(activeOuting);
  return el("div", { className: "grid student-view student-home" }, [
    el("section", { className: "student-dday-card" }, [
      el("div", {}, [
        el("span", {}, COAST_GUARD_EXAM_LABEL),
        el("strong", {}, formatDday(COAST_GUARD_EXAM_DATE)),
      ]),
      el("p", {}, `${formatExamDate(COAST_GUARD_EXAM_DATE)} 시험 기준`),
    ]),
    renderStudentImportantNoticeCard(),
    holiday && !todayAttendance
      ? el("section", { className: "student-summary-card" }, [
          el("div", {}, [
            el("strong", {}, "출석 인증"),
            el("p", {}, attendanceHolidayMessage(holiday.dateKey)),
          ]),
        ])
      : null,
    needsArrivalVerification
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
    needsAttendance
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
    el("section", { className: "student-summary-card" }, [
      el("div", {}, [
        el("strong", {}, homeAction.title),
        homeAction.copy ? el("p", {}, homeAction.copy) : null,
      ]),
      button(homeAction.buttonText, "btn", "button", homeAction.action),
    ]),
  ]);
}

function renderHomeScreenInstallCard() {
  if (isRunningStandalone()) return null;
  return el("section", { className: "student-install-card" }, [
    el("strong", {}, "앱처럼 사용하기"),
    button("홈화면 추가", "btn secondary", "button", installToHomeScreen),
  ]);
}

function renderStudentAuthInstallCard() {
  if (isRunningStandalone()) return null;
  return el("section", { className: "student-install-card student-auth-install-card" }, [
    el("strong", {}, "앱처럼 이용하기"),
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
  const isAndroid = userAgent.includes("android");
  const pageUrl = location.href;
  const title = isKakao ? "브라우저에서 열어주세요" : "홈 화면에 추가하기";
  const steps = isKakao
    ? [
        "카카오톡 오른쪽 위 메뉴를 누릅니다.",
        isIos ? "Safari로 열기를 선택합니다." : "다른 브라우저로 열기를 선택합니다.",
        "브라우저에서 공유 또는 메뉴를 누른 뒤 홈 화면에 추가를 선택합니다.",
      ]
    : isIos
      ? ["하단 공유 버튼을 누릅니다.", "홈 화면에 추가를 선택합니다.", "추가를 누르면 앱처럼 실행할 수 있습니다."]
      : ["브라우저 오른쪽 위 메뉴를 누릅니다.", "앱 설치 또는 홈 화면에 추가를 선택합니다.", "설치를 누르면 앱처럼 실행할 수 있습니다."];

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
        isKakao
          ? "카카오톡 안에서는 앱 설치가 바로 열리지 않을 수 있습니다. 먼저 기본 브라우저에서 열면 홈 화면에 추가할 수 있습니다."
          : "설치 창이 자동으로 뜨지 않는 브라우저에서는 아래 순서로 홈 화면에 추가해주세요."
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
    renderHomeScreenInstallCard(),
  ]);
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
              historyRow("복귀 시간", outing.returnedAt ? formatTimeOnly(outing.returnedAt) : "-"),
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
  const headers = ["날짜", "상/벌점", "사유", "담당자"];
  const rows = penalties.map((penalty) =>
    el("tr", {}, [
      el("td", {}, formatDateOnly(penalty.createdAt)),
      el("td", {}, formatPenaltyPoints(penalty.points)),
      el("td", { className: "wide-cell" }, penalty.reason || "-"),
      el("td", {}, penalty.managerName || "-"),
    ])
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
  const activeOutings = state.outings.filter((outing) => outing.status !== "returned" && outing.decision !== "rejected");
  const activeEarlyLeaves = activeOutings.filter((outing) => outing.earlyLeaveReason);
  const pendingOutingCases = state.outings.filter((outing) => outing.decision === "pending");
  const returnedTodayCases = state.outings.filter((outing) => isToday(outing.returnedAt));

  return el("div", { className: "grid" }, [
    el("div", { className: "stat-groups" }, [
      studentCountStatGroup(),
      statGroup("외출 인원", [
        stat("외출 중 학생", countOutingStudents(activeOutings), "명"),
        stat("조퇴 인원", countOutingStudents(activeEarlyLeaves), "명"),
      ]),
      statGroup("외출 건수", [
        stat("승인 대기", pendingOutingCases.length, "건"),
        stat("외출 중", activeOutings.length, "건"),
        stat("오늘 복귀", returnedTodayCases.length, "건"),
      ]),
    ]),
    panel("관리 메뉴", [
      el("div", { className: "module-grid" }, [
        hasTeacherPermission("outing.read") ? moduleCard("외출 관리", "외출 신청, 사진 인증, 복귀 확인을 관리합니다.", "outing", "운영 중") : null,
        hasTeacherPermission("grades.read") ? moduleCard("주간평가", "주차별 시험, 과목, 정답과 답안지 파일을 관리합니다.", "weekly-exams", "운영 중") : null,
        hasTeacherPermission("penalties.read") ? moduleCard("상/벌점 관리", "상/벌점 부여, 누적 점수, 지도 기록을 관리합니다.", "penalties", "운영 중") : null,
        hasTeacherPermission("attendance.read") ? moduleCard("출석 관리", "현장 사진 출석과 일별 출석 현황을 관리합니다.", "attendance", "운영 중") : null,
        hasTeacherPermission("notices.read") ? moduleCard("공지 관리", "학생 홈에 표시되는 중요 공지를 등록하고 관리합니다.", "notices", "운영 중") : null,
        hasTeacherPermission("managers.read") ? moduleCard("담당자 등록", "상/벌점 처리 담당자 명단을 등록하고 관리합니다.", "managers", "운영 중") : null,
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
