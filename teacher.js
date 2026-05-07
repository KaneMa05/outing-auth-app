const teacherFilters = {
  query: "",
  sort: "name",
};
let penaltySortMode = "id";
const penaltyPeriodFilter = {
  start: "",
  end: "",
};
const LATE_ATTENDANCE_PENALTY_POINTS = 5;
const LATE_ATTENDANCE_PENALTY_REASON = "지각 - 출석 미인증";
const NOT_RETURNED_PENALTY_REASON_PREFIX = "외출 후 미복귀";
const PENALTY_PRESETS = [
  { reason: "주간과제 미제출", points: 10 },
  { reason: "개인사유", points: 5 },
  { reason: "오후 지각", points: 5 },
  { reason: "저녁 지각", points: 5 },
  { reason: "일일과제 미제출", points: 5 },
  { reason: "무단이탈", points: 10 },
];

function renderTeacherAuthLoading() {
  return el("div", { className: "grid" }, [
    el("section", { className: "student-auth-card teacher-auth-card" }, [
      el("div", {}, [
        el("span", {}, "교사 인증"),
        el("h2", {}, "세션 확인 중"),
        el("p", {}, "관리 화면 접근 권한을 확인하고 있습니다."),
      ]),
    ]),
  ]);
}

function renderTeacherAuth() {
  const usernameInput = input("username", "text", "교사 아이디", "admin");
  const passwordInput = input("password", "password", "교사 비밀번호");
  const result = el("div", { className: "student-auth-result", ariaLive: "polite" });
  const submitButton = button("로그인", "btn");
  const form = el("form", { className: "student-auth-card teacher-auth-card" }, [
    el("div", {}, [
      el("span", {}, "교사 인증"),
      el("h2", {}, "관리자 로그인"),
      el("p", {}, "교사용 관리 화면은 비밀번호 확인 후 사용할 수 있습니다."),
    ]),
    field("아이디", usernameInput),
    field("비밀번호", passwordInput),
    result,
    submitButton,
  ]);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const username = String(formData(form).username || "").trim();
    const password = String(formData(form).password || "");
    if (!username || !password) {
      result.className = "student-auth-result error";
      result.textContent = "아이디와 비밀번호를 입력해주세요.";
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "확인 중...";
    result.textContent = "";

    try {
      const response = await fetch("/api/teacher-login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await response.json().catch(() => ({ ok: false }));

      if (!data.ok) {
        result.className = "student-auth-result error";
        if (data.error === "manager_ip_store_not_configured") {
          result.textContent = "장학생 PC 등록을 위해 Supabase 서비스 키 설정이 필요합니다.";
        } else if (data.error === "manager_ip_store_unavailable" || data.error === "manager_ip_register_failed") {
          result.textContent = "장학생 PC 등록 정보를 저장하지 못했습니다. Supabase 스키마를 확인해주세요.";
        } else if (response.status === 503) {
          result.textContent = "서버에 교사 계정이 설정되어 있지 않습니다.";
        } else if (response.status === 403) {
          result.textContent = "이 장학생 계정은 등록된 사무실 PC에서만 로그인할 수 있습니다.";
        } else {
          result.textContent = "아이디 또는 비밀번호가 일치하지 않습니다.";
        }
        return;
      }

      teacherAuth.authenticated = true;
      teacherAuth.checked = true;
      teacherAuth.user = data.user || null;
      if (!canUseRoute(currentRoute)) currentRoute = firstAllowedTeacherRoute();
      await initRemoteStore();
      render();
      notify("교사 로그인이 완료되었습니다.");
    } catch (error) {
      console.error(error);
      result.className = "student-auth-result error";
      result.textContent = "로그인 요청 중 오류가 발생했습니다.";
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "로그인";
    }
  });

  return el("div", { className: "grid" }, [form]);
}

async function logoutTeacher() {
  try {
    await fetch("/api/teacher-logout", { method: "POST", credentials: "same-origin" });
  } catch (error) {
    console.error(error);
  }

  teacherAuth.authenticated = false;
  teacherAuth.checked = true;
  teacherAuth.user = null;
  render();
  notify("로그아웃되었습니다.");
}

function renderTeacher() {
  applyAutoApprovalForReturnedOutings();
  const activeOutings = state.outings.filter((outing) => outing.status !== "returned" && outing.decision !== "rejected");
  const activeEarlyLeaves = activeOutings.filter((outing) => outing.earlyLeaveReason);
  const pendingOutingCases = state.outings.filter((outing) => outing.decision === "pending");
  const returnedTodayCases = state.outings.filter((outing) => isToday(outing.returnedAt));
  const visibleOutings = getFilteredTeacherOutings();
  const pendingOutings = visibleOutings.filter(isActionRequired);
  const completedOutings = visibleOutings.filter((outing) => !isActionRequired(outing));

  return el("div", { className: "grid" }, [
    el("div", { className: "stat-groups" }, [
      studentCountStatGroup(),
      statGroup("외출 인원", [
        stat("외출 중 학생", countOutingStudents(activeOutings), "명"),
        stat("조퇴 인원", countOutingStudents(activeEarlyLeaves), "명"),
      ]),
      statGroup("외출 건수", [
        stat("처리 대기", pendingOutingCases.length, "건"),
        stat("외출 중", activeOutings.length, "건"),
        stat("오늘 복귀", returnedTodayCases.length, "건"),
      ]),
    ]),
    panel("외출 신청 전체 관리", [
      el("p", { className: "subtle" }, "신청 내용, 사진 인증, 복귀 시간, 교사 판단을 이 페이지에서 확인하고 처리합니다."),
      teacherFilterControls(),
      visibleOutings.length
        ? el("div", { className: "teacher-sections" }, [
            teacherOutingSection("처리 필요", pendingOutings, { teacher: true }),
            teacherOutingSection("처리 완료", completedOutings, { teacher: true }),
          ])
        : el("div", { className: "empty" }, state.outings.length ? "검색 결과가 없습니다." : "아직 외출 신청이 없습니다."),
    ]),
  ]);
}

function renderAttendanceManagement() {
  if (!hasTeacherPermission("attendance.read")) return renderForbidden();
  const todayKey = getTodayDateKey();
  const selected = selectedStudentCohortCount();
  const visibleStudents = getStudentsInCohort(selected.value);
  const todayChecks = getAttendanceChecksForDate(todayKey).filter((check) => isAttendanceCheckInCohort(check, selected.value));
  const presentChecks = todayChecks.filter((check) => check.status === "present");
  const reasonChecks = todayChecks.filter((check) => check.status === "pre_arrival_reason");
  const checkedStudentIds = new Set(todayChecks.map((check) => check.studentId));
  const absentStudents = visibleStudents.filter((student) => !checkedStudentIds.has(student.id));

  return el("div", { className: "grid" }, [
    el("div", { className: "stat-groups" }, [
      studentCountStatGroup(),
      statGroup("오늘 출석", [
        stat("출석 인증", presentChecks.length, "명"),
        stat("사유신청", reasonChecks.length, "명"),
        stat("미인증", absentStudents.length, "명"),
      ]),
    ]),
    panel("오늘 출석 사진", [
      el("p", { className: "subtle" }, "학생이 제출한 현장 사진과 사유를 확인해 오늘 출석 상태를 관리합니다."),
      todayChecks.length ? renderAttendanceTable(todayChecks) : el("div", { className: "empty" }, "오늘 출석 인증 내역이 없습니다."),
    ]),
    panel("미인증 학생", [
      absentStudents.length && hasTeacherPermission("penalties.write")
        ? el("div", { className: "attendance-bulk-actions" }, [
            button(
              "벌점 일괄 부여",
              "btn danger",
              "button",
              () => giveLatePenaltyToAbsentStudents(absentStudents)
            ),
          ])
        : null,
      absentStudents.length
        ? table(
            hasTeacherPermission("attendance.write") ? ["번호", "이름", "반", "처리"] : ["번호", "이름", "반"],
            absentStudents
              .sort((a, b) => String(a.id).localeCompare(String(b.id), "ko-KR", { numeric: true }))
              .map((student) =>
                el("tr", {}, [
                  el("td", {}, formatStudentNumber(student.id)),
                  el("td", {}, student.name),
                  el("td", {}, student.className || "-"),
                  hasTeacherPermission("attendance.write")
                    ? el("td", { className: "action-cell" }, reasonAttendanceAction(student))
                    : null,
                ])
              )
          )
        : el("div", { className: "empty success-message" }, "모든 학생이 오늘 출석 인증을 완료했습니다."),
    ]),
  ]);
}

function reasonAttendanceAction(student) {
  if (getStudentAttendanceForDate(student.id)) {
    return el("button", { className: "mini-btn", type: "button", disabled: true }, "처리 완료");
  }
  const actions = [];
  if (hasLateAttendancePenaltyForToday(student.id)) {
    actions.push(el("span", { className: "mini-status penalty-applied" }, "벌점 부여 완료"));
  }
  actions.push(button("사유 인증", "mini-btn", "button", () => openTeacherReasonAttendanceModal(student)));
  return el("div", { className: "attendance-action-stack" }, actions);
}

function hasLateAttendancePenaltyForToday(studentId) {
  const todayKey = getTodayDateKey();
  return (state.penalties || []).some((penalty) =>
    String(penalty.studentId || "").trim() === String(studentId || "").trim()
    && getDateInputValue(penalty.createdAt) === todayKey
    && Number(penalty.points) === LATE_ATTENDANCE_PENALTY_POINTS
    && penalty.reason === LATE_ATTENDANCE_PENALTY_REASON
  );
}

function openTeacherReasonAttendanceModal(student) {
  if (!student || !hasTeacherPermission("attendance.write")) return;
  closeInfoModal();
  if (getStudentAttendanceForDate(student.id)) {
    notify("이미 오늘 출석 처리가 완료된 학생입니다.");
    render();
    return;
  }

  const reasonInput = textarea("reason", "사유를 입력하세요.");
  reasonInput.required = true;
  const detailInput = textarea("detail", "상세 내용 (선택)");
  const form = el("form", { className: "form-grid penalty-form" }, [
    field("학생", el("strong", {}, `${student.name || "-"} (${formatStudentNumber(student.id)})`)),
    field("사유", reasonInput, "full"),
    field("상세", detailInput, "full"),
    el("div", { className: "field full" }, [
      el("div", { className: "attendance-modal-actions" }, [
        button("출석 처리", "btn"),
        button("취소", "btn secondary", "button", closeInfoModal),
      ]),
    ]),
  ]);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = formData(form);
    const reason = String(data.reason || "").trim();
    if (!reason) return notify("사유를 입력해주세요.");
    if (getStudentAttendanceForDate(student.id)) {
      closeInfoModal();
      render();
      return notify("이미 오늘 출석 처리가 완료된 학생입니다.");
    }
    createTeacherReasonAttendanceCheck(student, reason, data.detail);
    closeInfoModal();
    render();
    notify("사유 인증으로 출석 처리했습니다.");
  });

  const modal = el("div", { className: "info-modal", role: "dialog", ariaModal: "true" }, [
    el("button", { className: "info-modal-backdrop", type: "button", ariaLabel: "사유 인증 닫기" }),
    el("div", { className: "info-modal-panel penalty-modal" }, [
      el("strong", {}, "사유 인증"),
      form,
    ]),
  ]);
  modal.querySelector(".info-modal-backdrop").addEventListener("click", closeInfoModal);
  document.body.appendChild(modal);
  document.addEventListener("keydown", closeInfoModalOnEscape);
}

function createTeacherReasonAttendanceCheck(student, reason, detail) {
  const id = createId();
  const checkDate = getTodayDateKey();
  const check = {
    id,
    studentId: student.id,
    studentName: student.name,
    className: student.className || state.settings.className || "오프라인반",
    checkDate,
    status: "pre_arrival_reason",
    reason: String(reason || "").trim(),
    detail: String(detail || "").trim(),
    photoPath: `teacher-reason/${checkDate}/${student.id}/${id}`,
    photoUrl: "",
    photoDataUrl: "",
    originalName: "",
    createdAt: new Date().toISOString(),
  };
  state.attendanceChecks = [
    check,
    ...(state.attendanceChecks || []).filter((item) => !(item.studentId === student.id && item.checkDate === checkDate)),
  ];
  saveState();
  return check;
}

function giveLatePenaltyToAbsentStudents(students) {
  if (!hasTeacherPermission("penalties.write")) return;
  const targets = (students || []).filter((student) => !hasLateAttendancePenaltyForToday(student.id));
  const skipped = (students || []).length - targets.length;
  if (!targets.length) {
    notify("오늘 지각 벌점이 모두 이미 부여되었습니다.");
    render();
    return;
  }
  const confirmed = confirm(`미인증 학생 ${targets.length}명에게 지각 벌점 ${LATE_ATTENDANCE_PENALTY_POINTS}점을 일괄 부여할까요?`);
  if (!confirmed) return;
  targets.forEach((student) => {
    createPenalty(student, LATE_ATTENDANCE_PENALTY_POINTS, LATE_ATTENDANCE_PENALTY_REASON, teacherAuth.user?.username || "teacher");
  });
  render();
  notify(skipped ? `${targets.length}명에게 지각 벌점을 부여했습니다. 이미 부여된 ${skipped}명은 제외했습니다.` : `${targets.length}명에게 지각 벌점을 부여했습니다.`);
}

function applyAutoApprovalForReturnedOutings() {
  if (!hasTeacherPermission("outing.approve")) return;
  let changed = false;
  state.outings.forEach((outing) => {
    if (outing.decision === "pending" && isReturnPhotoCompleted(outing)) {
      outing.decision = "approved";
      changed = true;
    }
  });
  if (changed) saveState();
}

function isReturnPhotoCompleted(outing) {
  return outing?.status === "returned"
    && Boolean(outing.returnedAt)
    && (outing.photos || []).some((photo) => photo.type === "복귀 인증");
}

function formatStudentNumber(studentId) {
  const value = String(studentId || "").trim();
  return value.length > 3 ? value.slice(-3) : value || "-";
}

function getStudentsInCohort(cohort = selectedStudentCohort) {
  return [...state.students].filter((student) => !cohort || getStudentCohort(student) === cohort);
}

function isAttendanceCheckInCohort(check, cohort = selectedStudentCohort) {
  if (!cohort) return true;
  return getStudentCohort({ id: check.studentId }) === cohort;
}

function renderPenaltyManagement() {
  if (!hasTeacherPermission("penalties.read")) return renderForbidden();
  const selected = selectedStudentCohortCount();
  const visiblePenalties = getFilteredPenalties(selected.value);
  const summaries = getPenaltySummaries(visiblePenalties, selected.value);
  const totalPoints = summaries.reduce((sum, item) => sum + item.total, 0);
  const penalizedStudents = summaries.filter((item) => item.total > 0).length;
  const latestPenalties = [...visiblePenalties].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return el("div", { className: "grid" }, [
    el("div", { className: "stat-groups" }, [
      studentCountStatGroup(),
      statGroup("상/벌점 현황", [
        stat("벌점 학생", penalizedStudents, "명"),
        stat("누적 점수", totalPoints, "점"),
      ]),
    ]),
    panel("전체 상/벌점 내역", [
      el("p", { className: "subtle" }, "선택한 기간 기준으로 학생별 누적 점수를 확인합니다."),
      el("div", { className: "penalty-toolbar" }, [
        penaltyPeriodControls(),
        el("div", { className: "penalty-toolbar-right" }, [
          summaries.some((summary) => summary.count)
            ? button("엑셀 다운로드", "btn secondary", "button", () => downloadPenaltySummaryCsv(summaries))
            : null,
          penaltySortControls(),
        ]),
      ]),
      summaries.length ? renderPenaltySummaryTable(summaries) : el("div", { className: "empty" }, "등록된 학생이 없습니다."),
    ]),
    panel("최근 부여 내역", [
      latestPenalties.length ? renderPenaltyHistoryTable(latestPenalties) : el("div", { className: "empty" }, "아직 부여된 상/벌점이 없습니다."),
    ]),
  ]);
}

function getFilteredPenalties(cohort = selectedStudentCohort) {
  return (state.penalties || []).filter((penalty) => isPenaltyInSelectedPeriod(penalty) && isPenaltyInSelectedCohort(penalty, cohort));
}

function isPenaltyInSelectedPeriod(penalty) {
  const dateKey = getDateInputValue(penalty.createdAt);
  if (!dateKey) return false;
  if (penaltyPeriodFilter.start && dateKey < penaltyPeriodFilter.start) return false;
  if (penaltyPeriodFilter.end && dateKey > penaltyPeriodFilter.end) return false;
  return true;
}

function isPenaltyInSelectedCohort(penalty, cohort = selectedStudentCohort) {
  if (!cohort) return true;
  return getStudentCohort({ id: penalty.studentId }) === cohort;
}

function getDateInputValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getPenaltySummaries(penalties = state.penalties || [], cohort = selectedStudentCohort) {
  const penaltyMap = penalties.reduce((map, penalty) => {
    const key = String(penalty.studentId || "").trim();
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(penalty);
    return map;
  }, new Map());

  return [...state.students]
    .filter((student) => !cohort || getStudentCohort(student) === cohort)
    .map((student) => ({
      student,
      total: (penaltyMap.get(student.id) || []).reduce((sum, penalty) => sum + (Number(penalty.points) || 0), 0),
      count: (penaltyMap.get(student.id) || []).length,
    }))
    .sort((a, b) => {
      if (penaltySortMode === "points") {
        const pointCompare = b.total - a.total;
        if (pointCompare) return pointCompare;
      }
      return String(a.student.id).localeCompare(String(b.student.id), "ko-KR", { numeric: true });
    });
}

function downloadPenaltySummaryCsv(summaries) {
  const sortedSummaries = [...summaries]
    .filter((summary) => summary.count)
    .sort((a, b) => {
      const pointCompare = b.total - a.total;
      if (pointCompare) return pointCompare;
      return String(a.student.id).localeCompare(String(b.student.id), "ko-KR", { numeric: true });
    });
  const rows = [
    ["순위", "번호", "고유번호", "이름", "반", "누적 점수", "부여 건수"],
    ...sortedSummaries.map((summary, index) => [
      String(index + 1),
      formatStudentNumber(summary.student.id),
      summary.student.id || "",
      summary.student.name || "",
      summary.student.className || "",
      String(summary.total),
      String(summary.count),
    ]),
  ];
  downloadCsv(`벌점 내역_${getPenaltyExportDateLabel()}.xls`, rows);
  notify("상/벌점 누적 내역 파일을 다운로드했습니다.");
}

function getPenaltyExportDateLabel() {
  if (penaltyPeriodFilter.start || penaltyPeriodFilter.end) {
    return `${penaltyPeriodFilter.start || "시작"}~${penaltyPeriodFilter.end || "종료"}`;
  }
  return getTodayDateKey();
}

function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n");
  const blob = new Blob(["\ufeff", csv], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = el("a", { href: url, download: filename, style: "display:none" });
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function escapeCsvCell(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function penaltyPeriodControls() {
  const startInput = el("input", { name: "startDate", type: "date", value: penaltyPeriodFilter.start });
  const endInput = el("input", { name: "endDate", type: "date", value: penaltyPeriodFilter.end });
  const form = el("form", { className: "penalty-period-controls" }, [
    field("시작일", startInput),
    field("종료일", endInput),
    el("div", { className: "penalty-period-actions" }, [
      button("조회", "mini-btn"),
      button("전체", "mini-btn", "button", () => {
        penaltyPeriodFilter.start = "";
        penaltyPeriodFilter.end = "";
        render();
      }),
    ]),
  ]);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (startInput.value && endInput.value && startInput.value > endInput.value) {
      notify("시작일은 종료일보다 늦을 수 없습니다.");
      return;
    }
    penaltyPeriodFilter.start = startInput.value;
    penaltyPeriodFilter.end = endInput.value;
    render();
  });

  return form;
}

function penaltySortControls() {
  return el("div", { className: "penalty-sort-controls", role: "group", ariaLabel: "상/벌점 정렬" }, [
    button("번호순", penaltySortMode === "id" ? "mini-btn active" : "mini-btn", "button", () => {
      penaltySortMode = "id";
      render();
    }),
    button("누적 점수순", penaltySortMode === "points" ? "mini-btn active" : "mini-btn", "button", () => {
      penaltySortMode = "points";
      render();
    }),
  ]);
}

function renderPenaltySummaryTable(summaries) {
  const rows = summaries.map(({ student, total, count }) =>
    el("tr", {}, [
      el("td", {}, formatStudentNumber(student.id)),
      el("td", {}, student.name),
      el("td", {}, student.className || "-"),
      el("td", {}, el("strong", { className: getPenaltyPointClass(total) }, formatPenaltyPoints(total))),
      el("td", {}, count ? button("내역", "mini-btn", "button", () => openPenaltyHistoryModal(student.id)) : "-"),
    ])
  );

  return el("div", { className: "excel-table-wrap" }, [
    el("table", { className: "excel-table penalty-summary-table" }, [
      el("thead", {}, [
        el("tr", {}, [
          el("th", {}, "번호"),
          el("th", {}, "이름"),
          el("th", {}, "반"),
          el("th", {}, "누적점수"),
          el("th", {}, "상세"),
        ]),
      ]),
      el("tbody", {}, rows),
    ]),
  ]);
}

function renderPenaltyHistoryTable(penalties) {
  const rows = penalties.map((penalty) =>
    el("tr", {}, [
      el("td", {}, formatDateCompact(penalty.createdAt)),
      el("td", {}, formatStudentNumber(penalty.studentId)),
      el("td", {}, penalty.studentName || "-"),
      el("td", {}, el("span", { className: getPenaltyPointClass(penalty.points) }, formatPenaltyPoints(penalty.points))),
      el("td", { className: "wide-cell" }, penalty.reason || "-"),
      el("td", {}, penalty.managerName || "-"),
    ])
  );

  return el("div", { className: "excel-table-wrap" }, [
    el("table", { className: "excel-table penalty-history-table" }, [
      el("thead", {}, [
        el("tr", {}, [
          el("th", {}, "부여일"),
          el("th", {}, "번호"),
          el("th", {}, "이름"),
          el("th", {}, "상/벌점"),
          el("th", {}, "사유"),
          el("th", {}, "담당자"),
        ]),
      ]),
      el("tbody", {}, rows),
    ]),
  ]);
}

function openPenaltyModal() {
  closeInfoModal();
  const selectedStudents = [];
  const selectedStudentList = el("div", { className: "penalty-selected-students" });
  const availableStudents = [...state.students]
    .filter((student) => !selectedStudentCohort || getStudentCohort(student) === selectedStudentCohort)
    .sort((a, b) => String(a.id).localeCompare(String(b.id), "ko-KR", { numeric: true }));
  const studentSearch = input("studentSearch", "search", "번호 입력");
  const lookupResult = el("div", { className: "student-check-result" }, "번호 입력 후 추가를 눌러주세요.");
  function findPenaltyStudentByInput() {
    const query = String(studentSearch.value || "").trim().toLowerCase();
    const normalizedShortNumber = /^\d{1,3}$/.test(query) ? query.padStart(3, "0") : query;
    if (!query) {
      lookupResult.className = "student-check-result error";
      lookupResult.textContent = "추가할 번호를 입력해주세요.";
      return null;
    }
    const matches = availableStudents.filter((student) =>
      [student.id, formatStudentNumber(student.id)]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase() === query || String(value).toLowerCase() === normalizedShortNumber)
    );
    if (matches.length !== 1) {
      lookupResult.className = "student-check-result error";
      lookupResult.textContent = matches.length ? "같은 번호의 학생이 여러 명입니다. 전체 고유번호로 조회해주세요." : "해당 번호의 학생을 찾을 수 없습니다.";
      return null;
    }
    return matches[0];
  }
  function addPenaltyStudentFromInput() {
    const student = findPenaltyStudentByInput();
    if (!student) return;
    if (selectedStudents.some((item) => item.id === student.id)) {
      lookupResult.className = "student-check-result error";
      lookupResult.textContent = "이미 추가된 학생입니다.";
      return;
    }
    selectedStudents.push(student);
    studentSearch.value = "";
    lookupResult.className = "student-check-result success";
    lookupResult.textContent = `${formatStudentNumber(student.id)} ${student.name} 학생을 추가했습니다.`;
    renderSelectedPenaltyStudents();
  }
  studentSearch.addEventListener("input", () => {
    lookupResult.className = "student-check-result";
    lookupResult.textContent = "번호 입력 후 추가를 눌러주세요.";
  });
  studentSearch.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    addPenaltyStudentFromInput();
  });
  const addStudentButton = button("추가", "btn secondary", "button", addPenaltyStudentFromInput);
  const typeSelect = el("select", { name: "scoreType", required: true }, [
    el("option", { value: "penalty" }, "벌점"),
    el("option", { value: "reward" }, "상점"),
  ]);
  const presetSelect = el("select", { name: "penaltyPreset" }, [
    el("option", { value: "" }, "직접 입력"),
    ...PENALTY_PRESETS.map((preset) => el("option", { value: preset.reason }, `${preset.reason} - ${preset.points}점`)),
  ]);
  const pointsInput = el("input", { name: "points", type: "number", min: "1", step: "1", placeholder: "예: 1", required: true });
  const reasonInput = textarea("reason", "상/벌점 사유");
  reasonInput.required = true;
  const managerInput = input("managerName", "text", "담당자 이름", teacherAuth.user?.username || "");
  managerInput.required = true;

  const form = el("form", { className: "form-grid penalty-form" }, [
    field("학생 추가", el("div", { className: "penalty-student-lookup" }, [
      el("div", { className: "penalty-student-picker" }, [studentSearch, addStudentButton]),
      lookupResult,
    ]), "full"),
    field("부여 대상", selectedStudentList, "full"),
    field("구분", typeSelect),
    field("벌점 항목", presetSelect),
    field("점수", pointsInput),
    field("사유", reasonInput, "full"),
    field("담당자", managerInput),
    el("div", { className: "field full" }, [
      el("div", { className: "attendance-modal-actions" }, [
        button("부여", "btn"),
        button("취소", "btn secondary", "button", closeInfoModal),
      ]),
    ]),
  ]);

  function renderSelectedPenaltyStudents() {
    const nodes = selectedStudents.length
      ? selectedStudents.map((student) =>
          el("span", { className: "penalty-student-chip" }, [
            `${formatStudentNumber(student.id)}-${student.name}`,
            button("삭제", "mini-btn", "button", () => {
              const index = selectedStudents.findIndex((item) => item.id === student.id);
              if (index >= 0) selectedStudents.splice(index, 1);
              renderSelectedPenaltyStudents();
            }),
          ])
        )
      : [el("span", { className: "subtle" }, "아직 추가된 학생이 없습니다.")];
    selectedStudentList.replaceChildren(...nodes);
  }
  renderSelectedPenaltyStudents();

  const syncPresetState = () => {
    const isPenalty = typeSelect.value === "penalty";
    presetSelect.disabled = !isPenalty;
    if (!isPenalty) {
      presetSelect.value = "";
      return;
    }
    const preset = PENALTY_PRESETS.find((item) => item.reason === presetSelect.value);
    if (!preset) return;
    pointsInput.value = String(preset.points);
    reasonInput.value = preset.reason;
  };
  typeSelect.addEventListener("change", syncPresetState);
  presetSelect.addEventListener("change", syncPresetState);
  syncPresetState();

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = formData(form);
    const points = Number(data.points);
    if (!selectedStudents.length) return notify("학생을 한 명 이상 추가해주세요.");
    if (!Number.isFinite(points) || points < 1) return notify("점수는 1점 이상 입력해주세요.");
    const signedPoints = data.scoreType === "reward" ? -Math.floor(points) : Math.floor(points);
    selectedStudents.forEach((student) => createPenalty(student, signedPoints, data.reason, data.managerName));
    closeInfoModal();
    render();
    notify(`${selectedStudents.length}명에게 ${data.scoreType === "reward" ? "상점" : "벌점"}을 부여했습니다.`);
  });

  const modal = el("div", { className: "info-modal", role: "dialog", ariaModal: "true" }, [
    el("button", { className: "info-modal-backdrop", type: "button", ariaLabel: "상/벌점 부여 닫기" }),
    el("div", { className: "info-modal-panel penalty-modal" }, [
      el("strong", {}, "상/벌점 부여"),
      form,
    ]),
  ]);
  modal.querySelector(".info-modal-backdrop").addEventListener("click", closeInfoModal);
  document.body.appendChild(modal);
  document.addEventListener("keydown", closeInfoModalOnEscape);
}

function openPenaltyHistoryModal(studentId) {
  const student = findStudent(studentId);
  const penalties = getFilteredPenalties()
    .filter((penalty) => penalty.studentId === String(studentId || "").trim())
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  openInfoModal({
    title: `${student?.name || "학생"} 상/벌점 내역`,
    className: "history-modal-panel penalty-detail-modal",
    content: penalties.length
      ? renderPenaltyDetailTable(penalties)
      : el("div", { className: "empty" }, "상/벌점 내역이 없습니다."),
  });
}

function openNotReturnedPenaltyModal(outing) {
  if (!outing || !hasTeacherPermission("penalties.write")) return;
  closeInfoModal();
  const student = findStudent(outing.studentId) || {
    id: outing.studentId,
    name: outing.studentName,
    className: outing.className,
  };
  if (hasNotReturnedPenaltyForOuting(outing)) {
    notify("이미 이 외출 건에 미복귀 벌점이 부여되었습니다.");
    render();
    return;
  }

  const pointsInput = el("input", { name: "points", type: "number", min: "1", step: "1", placeholder: "예: 5", required: true });
  const reasonInput = textarea("reason", "미복귀 사유를 입력하세요.");
  reasonInput.value = "예상 복귀 시간 이후 미복귀";
  reasonInput.required = true;
  const managerInput = input("managerName", "text", "담당자 이름", teacherAuth.user?.username || "");
  managerInput.required = true;

  const form = el("form", { className: "form-grid penalty-form" }, [
    field("학생", el("strong", {}, `${student.name || "-"} (${student.id || "-"})`)),
    field("외출 신청", el("span", {}, formatDateCompact(outing.createdAt))),
    field("예상 복귀", el("span", {}, formatExpectedReturn(outing.expectedReturn))),
    field("벌점", pointsInput),
    field("사유", reasonInput, "full"),
    field("담당자", managerInput),
    el("div", { className: "field full" }, [
      el("div", { className: "attendance-modal-actions" }, [
        button("부여", "btn"),
        button("취소", "btn secondary", "button", closeInfoModal),
      ]),
    ]),
  ]);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = formData(form);
    const points = Number(data.points);
    const reason = String(data.reason || "").trim();
    if (!Number.isFinite(points) || points < 1) return notify("벌점은 1점 이상 입력해주세요.");
    if (!reason) return notify("미복귀 사유를 입력해주세요.");
    if (hasNotReturnedPenaltyForOuting(outing)) {
      closeInfoModal();
      render();
      return notify("이미 이 외출 건에 미복귀 벌점이 부여되었습니다.");
    }
    createPenalty(student, Math.floor(points), `${notReturnedPenaltyReasonLabel(outing)} - ${reason}`, data.managerName);
    closeInfoModal();
    render();
    notify("미복귀 벌점을 부여했습니다.");
  });

  const modal = el("div", { className: "info-modal", role: "dialog", ariaModal: "true" }, [
    el("button", { className: "info-modal-backdrop", type: "button", ariaLabel: "미복귀 벌점 부여 닫기" }),
    el("div", { className: "info-modal-panel penalty-modal" }, [
      el("strong", {}, "미복귀 벌점 부여"),
      form,
    ]),
  ]);
  modal.querySelector(".info-modal-backdrop").addEventListener("click", closeInfoModal);
  document.body.appendChild(modal);
  document.addEventListener("keydown", closeInfoModalOnEscape);
}

function openRejectOutingPenaltyModal(outing) {
  if (!outing || !hasTeacherPermission("outing.approve") || !hasTeacherPermission("penalties.write")) return;
  closeInfoModal();
  const student = findStudent(outing.studentId) || {
    id: outing.studentId,
    name: outing.studentName,
    className: outing.className,
  };

  const pointsInput = el("input", { name: "points", type: "number", min: "1", step: "1", placeholder: "예: 5", required: true });
  const reasonInput = textarea("reason", "반려 및 벌점 사유를 입력하세요.");
  reasonInput.value = "외출 후 미복귀";
  reasonInput.required = true;
  const managerInput = input("managerName", "text", "담당자 이름", teacherAuth.user?.username || "");
  managerInput.required = true;

  const form = el("form", { className: "form-grid penalty-form" }, [
    field("학생", el("strong", {}, `${student.name || "-"} (${formatStudentNumber(student.id)})`)),
    field("외출 신청", el("span", {}, formatDateCompact(outing.createdAt))),
    field("예상 복귀", el("span", {}, formatExpectedReturn(outing.expectedReturn))),
    field("벌점", pointsInput),
    field("사유", reasonInput, "full"),
    field("담당자", managerInput),
    el("div", { className: "field full" }, [
      el("div", { className: "attendance-modal-actions" }, [
        button("반려 및 벌점 부여", "btn danger"),
        button("취소", "btn secondary", "button", closeInfoModal),
      ]),
    ]),
  ]);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = formData(form);
    const points = Number(data.points);
    const reason = String(data.reason || "").trim();
    if (!Number.isFinite(points) || points < 1) return notify("벌점은 1점 이상 입력해주세요.");
    if (!reason) return notify("반려 사유를 입력해주세요.");

    outing.decision = "rejected";
    outing.teacherMemo = `반려 사유: ${reason}`;
    const alreadyPenalized = hasNotReturnedPenaltyForOuting(outing);
    if (!alreadyPenalized) {
      createPenalty(student, Math.floor(points), `${notReturnedPenaltyReasonLabel(outing)} - ${reason}`, data.managerName);
    }
    saveState();
    closeInfoModal();
    render();
    notify(alreadyPenalized ? "반려 처리했습니다. 기존 미복귀 벌점이 있어 추가 부여는 생략했습니다." : "반려 처리하고 벌점을 부여했습니다.");
  });

  const modal = el("div", { className: "info-modal", role: "dialog", ariaModal: "true" }, [
    el("button", { className: "info-modal-backdrop", type: "button", ariaLabel: "반려 및 벌점 부여 닫기" }),
    el("div", { className: "info-modal-panel penalty-modal" }, [
      el("strong", {}, "반려 및 벌점 부여"),
      form,
    ]),
  ]);
  modal.querySelector(".info-modal-backdrop").addEventListener("click", closeInfoModal);
  document.body.appendChild(modal);
  document.addEventListener("keydown", closeInfoModalOnEscape);
}

function openAttendanceDeadlineModal() {
  closeInfoModal();
  const modal = el("div", { className: "info-modal", role: "dialog", ariaModal: "true" }, [
    el("button", { className: "info-modal-backdrop", type: "button", ariaLabel: "출석 시간 설정 닫기" }),
    el("div", { className: "info-modal-panel attendance-settings-modal" }, [
      el("strong", {}, "출석 시간 설정"),
      attendanceDeadlineForm({ modal: true }),
    ]),
  ]);
  modal.querySelector(".info-modal-backdrop").addEventListener("click", closeInfoModal);
  document.body.appendChild(modal);
  document.addEventListener("keydown", closeInfoModalOnEscape);
}

function attendanceDeadlineForm(options = {}) {
  const enabledInput = el("input", {
    name: "attendanceDeadlineEnabled",
    type: "checkbox",
    checked: Boolean(state.settings.attendanceDeadlineEnabled),
  });
  const timeInput = el("input", {
    name: "attendanceDeadline",
    type: "time",
    value: state.settings.attendanceDeadline || "08:50",
  });
  const form = el("form", { className: "form-grid compact-form" }, [
    field("마감 시간", timeInput),
    el("label", { className: "field attendance-toggle-field" }, [
      el("span", {}, "시간 제한"),
      el("div", { className: "attendance-toggle-control" }, [
        enabledInput,
        el("strong", {}, "출석 버튼 마감 적용"),
      ]),
    ]),
    el("div", { className: "field full" }, [
      el("div", { className: "attendance-modal-actions" }, [
        button("저장", "btn"),
        options.modal ? button("취소", "btn secondary", "button", closeInfoModal) : null,
      ]),
      el(
        "p",
        { className: "subtle attendance-deadline-note" },
        state.settings.attendanceDeadlineEnabled
          ? `현재 오전 ${formatAttendanceDeadline()} 이후 출석 인증 버튼이 비활성화됩니다.`
          : "현재 테스트 모드라 출석 인증 버튼이 항상 활성화됩니다."
      ),
    ]),
  ]);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = formData(form);
    setAttendanceDeadline(data.attendanceDeadline, enabledInput.checked);
    if (options.modal) closeInfoModal();
    render();
    notify("출석 시간 설정을 저장했습니다.");
  });

  return form;
}

function renderAttendanceTable(checks) {
  const rows = [...checks]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map((check) =>
      el("tr", {}, [
        el("td", {}, formatDateCompact(check.createdAt)),
        el("td", {}, formatStudentNumber(check.studentId)),
        el("td", {}, check.studentName || "-"),
        el("td", {}, check.className || "-"),
        el("td", {}, attendanceStatusBadge(check)),
        el("td", {}, check.reason || "-"),
        el("td", { className: "wide-cell" }, check.detail || "-"),
        el("td", {}, attendancePhotoButton(check)),
      ])
    );

  return el("div", { className: "excel-table-wrap" }, [
    el("table", { className: "excel-table" }, [
      el("thead", {}, [
        el("tr", {}, [
          el("th", {}, "인증 시각"),
          el("th", {}, "번호"),
          el("th", {}, "이름"),
          el("th", {}, "반"),
          el("th", {}, "상태"),
          el("th", {}, "사유"),
          el("th", {}, "상세"),
          el("th", {}, "사진"),
        ]),
      ]),
      el("tbody", {}, rows),
    ]),
  ]);
}

function attendanceStatusBadge(check) {
  if (check.status === "pre_arrival_reason") return el("span", { className: "badge pending" }, "사유신청");
  return el("span", { className: "badge approved" }, "출석");
}

function attendancePhotoButton(check) {
  const src = getAttendancePhotoSrc(check);
  if (!src) return "-";
  return button("", "attendance-photo-thumb", "button", () => openPhotoModal({
    type: check.status === "pre_arrival_reason" ? "등원 전 사유 인증" : "출석 인증",
    photoUrl: src,
    uploadedAt: check.createdAt,
  }), [
    el("img", { src, alt: "출석 인증 사진" }),
    el("span", {}, "크게 보기"),
  ]);
}

function isActionRequired(outing) {
  return outing.decision === "pending";
}

function teacherOutingSection(titleText, outings, options) {
  return el("section", { className: "teacher-section" }, [
    el("div", { className: "section-heading" }, [
      el("h3", {}, titleText),
      el("span", {}, String(outings.length) + "건"),
    ]),
    outings.length ? renderTeacherOutingTable(outings, options) : el("div", { className: "empty" }, "해당 기록이 없습니다."),
  ]);
}

function renderTeacherOutingTable(outings, options = {}) {
  const rows = outings.map((outing) =>
    el("tr", {}, [
      el("td", {}, formatDateCompact(outing.createdAt)),
      el("td", {}, formatStudentNumber(outing.studentId)),
      el("td", {}, outing.studentName || "-"),
      el("td", {}, outing.reason || "-"),
      el("td", { className: "wide-cell" }, outing.earlyLeaveReason || outing.detail || "-"),
      el("td", {}, formatExpectedReturn(outing.expectedReturn)),
      el("td", {}, formatTime(outing.verifiedAt)),
      el("td", {}, formatTime(outing.returnedAt)),
      el("td", {}, statusBadge(outing)),
      el("td", {}, photoMiniList(outing.photos)),
      el("td", { className: "action-cell" }, teacherRowActions(outing, options)),
    ])
  );

  return el("div", { className: "excel-table-wrap" }, [
    el("table", { className: "excel-table" }, [
      el("thead", {}, [
        el("tr", {}, [
          el("th", {}, "신청일"),
          el("th", {}, "번호"),
          el("th", {}, "이름"),
          el("th", {}, "사유"),
          el("th", {}, "상세"),
          el("th", {}, "예상"),
          el("th", {}, "인증"),
          el("th", {}, "복귀"),
          el("th", {}, "상태"),
          el("th", {}, "사진"),
          el("th", {}, "처리"),
        ]),
      ]),
      el("tbody", {}, rows),
    ]),
  ]);
}

function teacherRowActions(outing, options = {}) {
  if (options.trash) return hasTeacherPermission("outing.delete") ? [button("복구", "mini-btn", "button", () => restoreOuting(outing.id))] : [];
  const canDecide = outing.decision === "pending" && hasTeacherPermission("outing.approve");
  const canGiveNotReturnedPenalty = canGiveNotReturnedPenaltyForOuting(outing);
  const canRejectWithPenalty = canDecide && hasTeacherPermission("penalties.write");

  return [
    canDecide ? button("승인", "mini-btn", "button", () => decideOuting(outing.id, "approved")) : null,
    canDecide ? button("반려", "mini-btn danger", "button", () => {
      if (canRejectWithPenalty) openRejectOutingPenaltyModal(outing);
      else decideOuting(outing.id, "rejected");
    }) : null,
    canGiveNotReturnedPenalty && !canDecide
      ? hasNotReturnedPenaltyForOuting(outing)
        ? el("button", { className: "mini-btn", type: "button", disabled: true }, "벌점 완료")
        : button("미복귀 벌점", "mini-btn danger", "button", () => openNotReturnedPenaltyModal(outing))
      : null,
    hasTeacherPermission("outing.memo") ? button("메모", "mini-btn", "button", () => {
      const memo = prompt("교사용 메모", outing.teacherMemo || "");
      if (memo === null) return;
      outing.teacherMemo = memo;
      saveState();
      render();
    }) : null,
    hasTeacherPermission("outing.delete") ? button("삭제", "mini-btn danger", "button", () => deleteOuting(outing.id)) : null,
  ].filter(Boolean);
}

function canGiveNotReturnedPenaltyForOuting(outing) {
  return hasTeacherPermission("penalties.write")
    && outing?.decision !== "rejected"
    && outing?.status !== "returned";
}

function hasNotReturnedPenaltyForOuting(outing) {
  const label = notReturnedPenaltyReasonLabel(outing);
  return (state.penalties || []).some((penalty) =>
    String(penalty.studentId || "").trim() === String(outing?.studentId || "").trim()
    && Number(penalty.points) > 0
    && String(penalty.reason || "").startsWith(label)
  );
}

function notReturnedPenaltyReasonLabel(outing) {
  return `${NOT_RETURNED_PENALTY_REASON_PREFIX} (신청: ${formatDateCompact(outing?.createdAt)})`;
}

function photoMiniList(photos = []) {
  if (!photos.length) return "-";
  return el(
    "div",
    { className: "photo-mini-list" },
    photos.map((photo) =>
      button("", "photo-mini-button", "button", () => openPhotoModal(photo), [
        el("img", { src: photo.dataUrl, alt: photo.type }),
      ])
    )
  );
}

function renderStudentsAdmin() {
  if (!hasTeacherPermission("students.read")) return renderForbidden();
  return el("div", { className: "grid" }, [teacherStudentForm()]);
}

function renderDuplicates() {
  if (!hasTeacherPermission("outing.audit")) return renderForbidden();
  return el("div", { className: "grid" }, [renderDuplicatePhotoPanel()]);
}

function teacherFilterControls() {
  const search = input("teacherSearch", "search", "이름, 고유번호, 사유 검색", teacherFilters.query);
  const sort = select("teacherSort", ["이름순", "최신순"]);
  sort.value = teacherFilters.sort === "latest" ? "최신순" : "이름순";

  const form = el("form", { className: "teacher-search" }, [
    field("검색", search),
    el("div", { className: "field" }, [
      el("span", {}, " "),
      button("검색", "btn secondary"),
    ]),
  ]);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    teacherFilters.query = search.value;
    render();
  });

  sort.addEventListener("change", (event) => {
    teacherFilters.sort = event.target.value === "최신순" ? "latest" : "name";
    render();
  });

  return el("div", { className: "teacher-tools" }, [form, field("정렬", sort)]);
}

function getFilteredTeacherOutings() {
  const query = teacherFilters.query.trim().toLowerCase();
  const filtered = state.outings.filter((outing) => {
    if (!query) return true;
    return [outing.studentName, outing.studentId, outing.reason, outing.detail, outing.className, outing.earlyLeaveReason]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });

  return filtered.sort((a, b) => {
    if (teacherFilters.sort === "latest") return new Date(b.createdAt) - new Date(a.createdAt);
    const nameCompare = String(a.studentName || "").localeCompare(String(b.studentName || ""), "ko-KR");
    if (nameCompare !== 0) return nameCompare;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
}

function renderDuplicatePhotoPanel() {
  const groups = findDuplicatePhotoGroups(state.outings);
  if (!groups.length) return panel("중복 사진 의심", [el("div", { className: "empty" }, "같은 사진으로 보이는 인증 내역이 없습니다.")]);

  return panel("중복 사진 의심", [
    el("p", { className: "subtle" }, "같은 이미지 데이터가 여러 외출 기록에 연결된 경우입니다. 사진을 재사용한 학생이 있는지 확인할 때 참고하세요."),
    el(
      "div",
      { className: "duplicate-list" },
      groups.map((group) =>
        el("article", { className: "duplicate-item" }, [
          button("", "duplicate-photo-button", "button", () => openDuplicatePhotoModal(group), [
            el("img", { src: group.photo.dataUrl, alt: group.photo.type }),
          ]),
          el("div", {}, [
            el("strong", {}, group.photo.type + " · " + group.items.length + "건"),
            el("p", { className: "subtle" }, group.items.map((item) => item.studentName + " (" + item.studentId + ")").join(", ")),
          ]),
        ])
      )
    ),
  ]);
}

function openDuplicatePhotoModal(group) {
  openPhotoModal({
    ...group.photo,
    type: group.photo.type + " · " + group.items.length + "건",
    details: group.items.map((item) => {
      const date = formatDateKey(item.duplicatePhotoUploadedAt || item.createdAt);
      return `${item.studentName || "학생"} (${item.studentId || "-"}) · 인증 날짜 ${date}`;
    }),
  });
}

function findDuplicatePhotoGroups(outings) {
  const map = new Map();
  outings.forEach((outing) => {
    outing.photos.forEach((photo) => {
      if (!photo.dataUrl) return;
      const key = photo.dataUrl;
      if (!map.has(key)) map.set(key, { photo, items: [] });
      map.get(key).items.push({ ...outing, duplicatePhotoUploadedAt: photo.uploadedAt });
    });
  });

  return [...map.values()]
    .map((group) => ({ ...group, items: uniqueBy(group.items, (item) => item.id) }))
    .filter((group) => group.items.length > 1);
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function renderTrash() {
  if (!hasTeacherPermission("outing.delete")) return renderForbidden();
  const deleted = state.deletedOutings || [];
  return el("div", { className: "grid" }, [
    panel("삭제 내역", [
      el("p", { className: "subtle" }, "삭제된 외출 신청 기록을 확인하고 복구할 수 있습니다."),
      deleted.length ? renderTeacherOutingTable(deleted, { trash: true }) : el("div", { className: "empty" }, "삭제된 외출 신청 기록이 없습니다."),
    ]),
  ]);
}

function teacherStudentForm() {
  const rosterInput = el("textarea", {
    name: "roster",
    placeholder: "1 홍길동\n2 김민지\n3 박서준",
    rows: 8,
  });
  const form = el("form", { className: "form-grid" }, [
    field("기수", input("cohort", "number", "18", "18")),
    field("기본 반", input("className", "text", "오프라인반", state.settings.className)),
    field("학생 번호와 이름", rosterInput, "full", "한 줄에 한 명씩 입력하세요. 한 명만 입력하면 단일 등록, 여러 명이면 일괄 등록됩니다."),
    el("div", { className: "field full" }, [
      button("학생 등록/수정", "btn"),
      el("p", { className: "subtle" }, "예: 기수 18, 번호 4번은 18004로 저장됩니다. 이미 등록된 고유번호는 이름과 반 정보가 업데이트됩니다."),
    ]),
  ]);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = formData(form);
    const cohort = String(data.cohort || "").trim();
    if (!isValidCohort(cohort)) return notify("기수를 숫자로 입력해주세요.");
    const parsed = parseStudentRoster(data.roster, cohort);
    if (!parsed.length) return notify("등록할 학생 번호와 이름을 입력해주세요.");
    const result = upsertStudents(parsed, data.className);
    saveState();
    form.reset();
    render();
    notify("학생 " + result.created + "명 등록, " + result.updated + "명 수정되었습니다.");
  });

  const rows = [...state.students]
    .sort((a, b) => String(a.id).localeCompare(String(b.id), "ko-KR", { numeric: true }))
    .map((student) => {
      const profile = getStudentProfileForTeacher(student.id);
      return el("tr", {}, [
        el("td", {}, formatStudentNumber(student.id)),
        el("td", {}, student.name),
        el("td", {}, student.className),
        el("td", {}, profile ? el("span", { className: "badge approved" }, "완료") : el("span", { className: "badge" }, "미등록")),
        el("td", {}, normalizeCoastGuardTrack(profile?.track) || "-"),
        el("td", {}, profile?.gender || "-"),
        el("td", { className: "student-admin-actions" }, [
          profile ? button("등록 초기화", "mini-btn", "button", () => resetStudentAppRegistration(student.id)) : null,
          button("삭제", "mini-btn danger", "button", () => deleteStudent(student.id)),
        ]),
      ]);
    });

  return el("div", { className: "grid" }, [
    panel("학생 등록", [form]),
    studentCountStatGroup(),
    table(
      ["번호", "이름", "반", "앱 등록", "직렬", "성별", "관리"],
      rows.length ? rows : [el("tr", {}, [el("td", { colSpan: 7 }, el("div", { className: "empty table-empty" }, "등록된 학생이 없습니다."))])]
    ),
  ]);
}

function getStudentProfileForTeacher(studentId) {
  const id = String(studentId || "").trim();
  const student = findStudent(id);
  const localProfile = state.settings.studentProfiles?.[id] || null;
  if (student?.track || student?.gender || student?.passwordHash || student?.deviceToken || student?.appRegisteredAt) {
    return {
      track: normalizeCoastGuardTrack(student.track || localProfile?.track),
      gender: student.gender || localProfile?.gender || "",
      passwordHash: student.passwordHash || localProfile?.passwordHash || "",
      deviceToken: student.deviceToken || localProfile?.deviceToken || "",
      authedAt: student.appRegisteredAt || localProfile?.authedAt || "",
    };
  }
  return localProfile;
}

function upsertStudents(students, className) {
  let created = 0;
  let updated = 0;
  students.forEach((student) => {
    const existing = findStudent(student.id);
    const payload = {
      id: student.id,
      name: student.name,
      className: String(className || "").trim() || state.settings.className,
      track: normalizeCoastGuardTrack(existing?.track),
      gender: existing?.gender || "",
      passwordHash: existing?.passwordHash || "",
      deviceToken: existing?.deviceToken || "",
      appRegisteredAt: existing?.appRegisteredAt || "",
      createdAt: existing?.createdAt || new Date().toISOString(),
    };
    if (existing) {
      Object.assign(existing, payload);
      updated += 1;
    } else {
      state.students.push(payload);
      created += 1;
    }
  });
  return { created, updated };
}

function parseStudentRoster(value, cohort) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.includes(",") || line.includes("\t") ? line.split(/[,\t]/) : line.split(/\s+/);
      const studentNumber = Number((parts.shift() || "").trim());
      const name = parts.join(" ").trim();
      if (!Number.isInteger(studentNumber) || studentNumber < 1 || studentNumber > 130 || !name) return null;
      return { id: buildStudentId(cohort, studentNumber), name };
    })
    .filter(Boolean);
}

function isValidCohort(value) {
  return /^\d{1,2}$/.test(String(value || "").trim());
}

function buildStudentId(cohort, studentNumber) {
  return String(cohort).trim() + String(studentNumber).padStart(3, "0");
}

function deleteStudent(id) {
  const student = findStudent(id);
  if (!student) return;
  if (!confirm(student.name + " (" + student.id + ") 학생을 삭제할까요? 기존 외출 기록은 유지됩니다.")) return;
  state.students = state.students.filter((item) => item.id !== student.id);
  if (state.settings.studentProfiles) delete state.settings.studentProfiles[student.id];
  if (state.settings.studentAuthId === student.id) state.settings.studentAuthId = "";
  saveState();
  render();
  notify("학생을 삭제했습니다.");
}

async function resetStudentAppRegistration(id) {
  const student = findStudent(id);
  if (!student) return;
  if (!confirm(student.name + " (" + student.id + ") 학생의 앱 등록 상태를 초기화할까요?")) return;

  openLoadingModal("등록 초기화 중", "학생 앱 등록 정보를 초기화하고 있습니다.");

  if (remoteStore) {
    try {
      const response = await fetch("/api/reset-student-registration", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: student.id }),
      });
      const data = response.ok ? await response.json() : { ok: false };
      if (!data.ok) {
        if (response.status === 401) {
          notify("교사 로그인 세션이 만료되었습니다. 다시 로그인해주세요.");
        } else {
          notify(response.status === 503 ? "서버 초기화 설정을 확인해주세요." : "서버 등록 초기화에 실패했습니다.");
        }
        return;
      }
    } catch (error) {
      console.error(error);
      notify("서버 등록 초기화 요청 중 오류가 발생했습니다.");
      return;
    } finally {
      closeLoadingModal();
    }
  } else {
    closeLoadingModal();
  }

  student.track = "";
  student.gender = "";
  student.passwordHash = "";
  student.deviceToken = "";
  student.appRegisteredAt = "";
  if (state.settings.studentProfiles) delete state.settings.studentProfiles[student.id];
  if (state.settings.studentAuthId === student.id) state.settings.studentAuthId = "";

  saveState();
  render();
  notify("학생 앱 등록 상태를 초기화했습니다.");
}
