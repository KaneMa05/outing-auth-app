const routeTitles = {
  home: "홈",
  student: "외출 신청",
  "student-verify": "사진 인증",
  "student-return": "학원 복귀 인증",
  "student-done": "복귀 완료",
  outing: "외출 관리",
  grades: "성적 관리",
  penalties: "벌점 관리",
  attendance: "출석 관리",
  mypage: "마이페이지",
  teacher: "외출 관리",
  students: "학생 등록",
  duplicates: "중복 사진",
  trash: "삭제 내역",
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
  "일반직 - 관제전송기술",
  "일반직 - 관제정보보호",
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
});

window.addEventListener("popstate", () => {
  currentRoute = normalizeRoute(location.hash.replace("#", "") || defaultRoute());
  render();
});

currentRoute = normalizeRoute(location.hash.replace("#", "") || defaultRoute());
render();
initRemoteStore();

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
    return ["home", "outing", "grades", "penalties", "attendance", "students", "duplicates", "trash"].includes(normalized)
      ? normalized
      : "home";
  }
  return ["home", "student", "student-verify", "student-return", "student-done", "attendance", "mypage"].includes(normalized) ? normalized : "home";
}

function defaultRoute() {
  return "home";
}

function navigate(route) {
  location.hash = route;
}

function render() {
  if (location.hash !== `#${currentRoute}`) {
    history.replaceState(null, "", `${location.href.split("#")[0]}#${currentRoute}`);
  }

  document.querySelectorAll("[data-route]").forEach((button) => {
    button.classList.toggle("active", button.dataset.route === currentRoute);
  });

  title.textContent = routeTitles[currentRoute] || routeTitles.student;
  if (topActions) topActions.hidden = !topActions.children.length;

  const routes =
    APP_MODE === "teacher"
      ? {
          home: renderHome,
          outing: renderTeacher,
          grades: () => renderComingSoonManagement("성적 관리", "시험별 성적 입력, 학생별 추이, 반 평균 분석 기능을 이곳에 연결할 예정입니다."),
          penalties: () => renderComingSoonManagement("벌점 관리", "벌점 부여, 누적 현황, 지도 이력 관리 기능을 이곳에 연결할 예정입니다."),
          attendance: () => renderComingSoonManagement("출석 관리", "출석 체크, 지각/결석 기록, 기간별 출석 통계 기능을 이곳에 연결할 예정입니다."),
          students: renderStudentsAdmin,
          duplicates: renderDuplicates,
          trash: renderTrash,
        }
      : {
          home: () => requireStudentAuth(renderStudentHomeFlow),
          student: () => requireStudentAuth(renderStudentChecklist),
          "student-verify": () => requireStudentAuth(renderStudentChecklist),
          "student-return": () => requireStudentAuth(renderStudentChecklist),
          "student-done": () => requireStudentAuth(renderStudentChecklist),
          attendance: () => requireStudentAuth(renderStudentAttendance),
          mypage: () => requireStudentAuth(renderStudentMypage),
        };

  try {
    const nextView = (routes[currentRoute] || routes[defaultRoute()])();
    app.innerHTML = "";
    app.appendChild(nextView);
  } catch (error) {
    console.error(error);
    app.innerHTML = "";
    app.appendChild(renderStudentRenderError());
  }
}

function renderStudentRenderError() {
  return el("div", { className: "grid student-view" }, [
    panel("화면을 불러오지 못했습니다", [
      el("div", { className: "empty" }, "앱 데이터를 새로 불러온 뒤 다시 시도해주세요."),
      button("홈으로 다시 불러오기", "btn secondary", "button", () => {
        currentRoute = "home";
        location.hash = "home";
        render();
      }),
    ]),
  ]);
}

function requireStudentAuth(renderFn) {
  return getAuthedStudent() ? renderFn() : renderStudentAuth();
}

function getAuthedStudent() {
  const student = findStudent(state.settings.studentAuthId);
  const profile = getStudentProfile(state.settings.studentAuthId);
  return student && profile?.passwordHash ? student : null;
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

  const lookupButton = button("조회", "btn secondary", "button", () => {
    selectedStudent = findStudent(idInput.value);
    lookupResult.innerHTML = "";
    profileArea.hidden = true;

    if (!selectedStudent) {
      lookupResult.className = "student-auth-result error";
      lookupResult.textContent = "관리자가 등록한 학생 고유번호를 찾을 수 없습니다.";
      return;
    }

    const profile = getStudentProfile(selectedStudent.id) || {};
    trackSelect.value = profile.track || trackSelect.value;
    genderSelect.value = profile.gender || genderSelect.value;
    studentNameNode.textContent = selectedStudent.name;
    lookupResult.className = "student-auth-result success";
    lookupResult.textContent = `${selectedStudent.name} 학생이 확인되었습니다.`;
    profileArea.hidden = false;
  });

  const trackSelect = select("track", COAST_GUARD_TRACK_OPTIONS);
  const genderSelect = select("gender", ["남", "여"]);
  const passwordInput = input("password", "password", "패스워드");

  profileArea.append(
    field("이름", studentNameNode),
    field("직렬", trackSelect),
    field("성별", genderSelect),
    field("본인 패스워드", passwordInput, "", "다음 접속 때 본인 확인에 사용됩니다.")
  );

  const form = el("form", { className: "student-auth-card" }, [
    el("div", {}, [
      el("span", {}, "학생 등록"),
      el("h2", {}, "학생 등록"),
      el("p", {}, "고유번호 조회 후 등록해주세요."),
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
      return notify("먼저 관리자 등록 고유번호를 조회해주세요.");
    }
    if (!data.track || !data.gender || !data.password) {
      return notify("직렬, 성별, 패스워드를 모두 입력해주세요.");
    }

    const profiles = ensureStudentProfiles();
    const existingProfile = profiles[studentId];
    const passwordHash = await hashStudentPassword(data.password);
    if (existingProfile?.passwordHash && existingProfile.passwordHash !== passwordHash) {
      return notify("패스워드가 일치하지 않습니다.");
    }

    profiles[studentId] = {
      track: data.track,
      gender: data.gender,
      passwordHash,
      authedAt: new Date().toISOString(),
    };
    selectedStudent.track = data.track;
    selectedStudent.gender = data.gender;
    selectedStudent.passwordHash = passwordHash;
    selectedStudent.appRegisteredAt = new Date().toISOString();
    state.settings.studentAuthId = studentId;
    state.settings.lastStudentId = studentId;
    saveState();
    currentRoute = "home";
    if (location.hash !== "#home") location.hash = "home";
    render();
    notify(`${selectedStudent.name}님, 인증되었습니다.`);
  });

  return el("div", { className: "grid student-view" }, [form]);
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

function renderStudentHome() {
  return el("div", { className: "grid student-view student-home" }, [
    el("section", { className: "student-dday-card" }, [
      el("div", {}, [
        el("span", {}, COAST_GUARD_EXAM_LABEL),
        el("strong", {}, formatDday(COAST_GUARD_EXAM_DATE)),
      ]),
      el("p", {}, `${formatExamDate(COAST_GUARD_EXAM_DATE)} 시험 기준`),
    ]),
    renderStudentTodayCard(),
    el("section", { className: "student-summary-card" }, [
      el("strong", {}, "외출 신청"),
      button("외출 신청하기", "btn", "button", () => navigate("student")),
    ]),
  ]);
}

function renderStudentTodayCard() {
  return el("section", { className: "student-today-card" }, [
    el("h3", {}, "오늘 상태"),
    el("div", { className: "student-status-row" }, [
      el("span", { className: "student-status-dot active" }),
      el("div", {}, [
        el("strong", {}, "해양경찰 시험 준비 중"),
        el("p", {}, "D-Day를 기준으로 학습과 생활 기록을 관리합니다."),
      ]),
    ]),
  ]);
}

function renderStudentHomeFlow() {
  const student = getAuthedStudent();
  const activeOuting = student ? getActiveOuting(student.id) : null;
  const homeAction = getStudentHomeAction(activeOuting);
  return el("div", { className: "grid student-view student-home" }, [
    el("section", { className: "student-dday-card" }, [
      el("div", {}, [
        el("span", {}, COAST_GUARD_EXAM_LABEL),
        el("strong", {}, formatDday(COAST_GUARD_EXAM_DATE)),
      ]),
      el("p", {}, `${formatExamDate(COAST_GUARD_EXAM_DATE)} 시험 기준`),
    ]),
    renderStudentTodayCardFlow(activeOuting),
    el("section", { className: "student-summary-card" }, [
      el("div", {}, [
        el("strong", {}, homeAction.title),
        homeAction.copy ? el("p", {}, homeAction.copy) : null,
      ]),
      button(homeAction.buttonText, "btn", "button", homeAction.action),
    ]),
  ]);
}

function renderStudentTodayCardFlow(activeOuting = null) {
  const status = getStudentHomeStatus(activeOuting);
  return el("section", { className: "student-today-card" }, [
    el("h3", {}, "오늘 상태"),
    el("div", { className: "student-status-row" }, [
      el("span", { className: "student-status-dot " + status.dot }),
      el("div", {}, [
        el("strong", {}, status.title),
        status.copy ? el("p", {}, status.copy) : null,
      ]),
    ]),
  ]);
}

function getStudentHomeStatus(outing) {
  if (!outing) {
    return {
      dot: "active",
      title: "해양경찰 시험 준비 중",
      copy: "",
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
  return el("div", { className: "excel-table-wrap penalty-detail-table-wrap" }, [
    el("table", { className: "excel-table penalty-detail-table" }, [
      el("thead", {}, [
        el("tr", {}, [
          el("th", {}, "날짜"),
          el("th", {}, "상/벌점"),
          el("th", {}, "사유"),
          el("th", {}, "담당자"),
        ]),
      ]),
      el(
        "tbody",
        {},
        penalties.map((penalty) =>
          el("tr", {}, [
            el("td", {}, formatDateOnly(penalty.createdAt)),
            el("td", {}, formatPenaltyPoints(penalty.points)),
            el("td", { className: "wide-cell" }, penalty.reason || "-"),
            el("td", {}, penalty.managerName || "-"),
          ])
        )
      ),
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

function renderHomeScreenInstallCard() {
  if (isRunningStandalone()) return null;
  return el("section", { className: "student-install-card" }, [
    el("strong", {}, "앱처럼 사용하기"),
    button("홈화면 추가", "btn secondary", "button", installToHomeScreen),
  ]);
}

function isRunningStandalone() {
  return window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true;
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
  const activeOutings = state.outings.filter((outing) => outing.status !== "returned").length;
  const pendingOutings = state.outings.filter((outing) => outing.decision === "pending").length;
  const returnedToday = state.outings.filter((outing) => isToday(outing.returnedAt)).length;

  return el("div", { className: "grid" }, [
    el("div", { className: "grid stats" }, [
      stat("등록 학생", state.students.length),
      stat("외출 중", activeOutings),
      stat("승인 대기", pendingOutings),
      stat("오늘 복귀", returnedToday),
    ]),
    panel("관리 메뉴", [
      el("div", { className: "module-grid" }, [
        moduleCard("외출 관리", "외출 신청, 사진 인증, 복귀 확인을 관리합니다.", "outing", "운영 중"),
        moduleCard("성적 관리", "시험 성적 입력과 학생별 성적 추이를 관리합니다.", "grades", "준비 중"),
        moduleCard("벌점 관리", "벌점 부여, 누적 벌점, 지도 기록을 관리합니다.", "penalties", "준비 중"),
        moduleCard("출석 관리", "출석, 지각, 결석과 기간별 통계를 관리합니다.", "attendance", "준비 중"),
      ]),
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
