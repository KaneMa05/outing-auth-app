const teacherFilters = {
  query: "",
  sort: "name",
};
const studentAdminFilters = {
  query: "",
};
const deviceHistoryFilters = {
  query: "",
  eventType: "all",
};
let previewStudentId = "";
let penaltySortMode = "id";
let editingNoticeId = "";
let trackOptionDraft = null;
let gradeManagementMode = "weekly";
let gradeManagementTrackFilter = "";
let finalExamGradeFilters = { round: "1" };
let studentPreviewFinalRoundByStudent = {};
let weeklyExamMode = "lookup";
let weeklyExamSelectedId = "";
let weeklyExamSelectedSectionId = "";
let weeklyExamAnswerScoped = false;
let weeklyExamSelectedCohort = "";
let weeklyExamGradeFilters = { examId: "", track: "", subject: "", weekNumber: "1" };
let weeklyExamAutoCreatingCohorts = new Set();
let weeklyExamAnswerSaveTimers = new Map();
let attendanceHolidayCalendarMonth = "";
let attendanceHolidayDraftOverrides = null;
let attendanceHolidaySavedMessage = "";
let selectedAttendanceDateKey = "";
const WEEKLY_EXAM_TRACK_ALL = "전체";
const WEEKLY_EXAM_WEEK_COUNT = 12;
const WEEKLY_EXAM_SUBJECTS = ["해양경찰학개론", "해사법규", "형사법", "항해학", "기관학", "해사영어", "형사법(공판)", "해상교통관리"];
const WEEKLY_EXAM_HISTORY_DETAIL = "weekly-exam-problem-detail";
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
  const activeOutings = state.outings.filter(isActiveOuting);
  const todayEarlyLeaves = state.outings.filter(isTodayEarlyLeave);
  const activeOutingCases = state.outings.filter(isActiveOuting);
  const returnedTodayCases = state.outings.filter((outing) => isToday(getOutingReturnedAt(outing)));
  const visibleOutings = getFilteredTeacherOutings();
  const pendingOutings = visibleOutings.filter(isActionRequired);
  const completedOutings = visibleOutings.filter((outing) => !isActionRequired(outing));

  return el("div", { className: "grid" }, [
    el("div", { className: "stat-groups" }, [
      studentCountStatGroup(),
      statGroup("외출 인원", [
        stat("외출 중 학생", countOutingStudents(activeOutings), "명", {
          onClick: () => scrollToFirstOuting(activeOutings, "outing-pending-section"),
        }),
        stat("조퇴 인원", countOutingStudents(todayEarlyLeaves), "명", {
          onClick: () => scrollToFirstOuting(todayEarlyLeaves, "outing-pending-section"),
        }),
      ]),
      statGroup("외출 건수", [
        stat("진행 중", activeOutingCases.length, "건", {
          onClick: () => scrollToPanel("outing-pending-section"),
        }),
        stat("외출 중", activeOutings.length, "건", {
          onClick: () => scrollToFirstOuting(activeOutings, "outing-pending-section"),
        }),
        stat("오늘 복귀", returnedTodayCases.length, "건", {
          onClick: () => scrollToFirstOuting(returnedTodayCases, "outing-completed-section"),
        }),
      ]),
    ]),
    panel("외출 신청 전체 관리", [
      el("p", { className: "subtle" }, "신청 내용, 사진 인증, 복귀 시간, 교사 판단을 이 페이지에서 확인하고 처리합니다."),
      teacherFilterControls(),
      visibleOutings.length
        ? el("div", { className: "teacher-sections" }, [
            teacherOutingSection("처리 필요", pendingOutings, { teacher: true }, "outing-pending-section"),
            completedTeacherOutingSections(completedOutings, { teacher: true }, "outing-completed-section"),
          ])
        : el("div", { className: "empty" }, state.outings.length ? "검색 결과가 없습니다." : "아직 외출 신청이 없습니다."),
    ]),
  ]);
}

function renderAttendanceManagement() {
  if (!hasTeacherPermission("attendance.read")) return renderForbidden();
  normalizeTeacherReasonAttendanceChecks();
  const todayKey = getTodayDateKey();
  const selectedDateKey = getSelectedAttendanceDateKey();
  const isTodayView = selectedDateKey === todayKey;
  const holiday = getAttendanceHoliday(selectedDateKey);
  const selected = selectedStudentCohortCount();
  const attendanceStudents = getAttendanceStudentsInCohort(selected.value);
  const dateChecks = getAttendanceChecksForDate(selectedDateKey).filter((check) => isAttendanceCheckInCohort(check, selected.value));
  const completeStudentIds = new Set(dateChecks.filter(isAttendanceCompleteCheck).map((check) => String(check.studentId || "").trim()));
  const reasonChecks = dateChecks.filter((check) =>
    check.status === "pre_arrival_reason"
    && !isTeacherReasonAttendanceCheck(check)
    && !completeStudentIds.has(String(check.studentId || "").trim())
  );
  const reasonStudentIds = new Set(reasonChecks.map((check) => String(check.studentId || "").trim()));
  const checkedStudentIds = new Set([...completeStudentIds, ...reasonStudentIds]);
  const absentStudents = attendanceStudents.filter((student) => !checkedStudentIds.has(String(student.id || "").trim()));
  const dateLabel = formatAttendanceDateLabel(selectedDateKey);

  return el("div", { className: "grid" }, [
    holiday
      ? el("div", { className: "attendance-holiday-banner" }, [
          el("strong", {}, isTodayView ? "오늘은 휴일입니다." : `${dateLabel}은 휴일입니다.`),
          el("span", {}, attendanceHolidayMessage(selectedDateKey)),
        ])
      : null,
    attendanceDateControls(selectedDateKey),
    el("div", { className: "stat-groups" }, [
      attendanceStudentCountStatGroup(selected, attendanceStudents.length),
      statGroup(`${dateLabel} 출석`, [
        stat("출석 완료", completeStudentIds.size, "명", { onClick: () => scrollToPanel("attendance-photos-panel") }),
        stat("사유신청 후 미등원", reasonChecks.length, "명", { onClick: () => scrollToPanel("attendance-photos-panel") }),
        stat("미인증", absentStudents.length, "명", { onClick: () => scrollToPanel("attendance-absent-panel") }),
      ]),
    ]),
    panel("미인증 학생", [
      holiday
        ? el("div", { className: "empty success-message" }, "휴일로 설정되어 미인증 학생을 처리하지 않습니다.")
        : absentStudents.length && isTodayView && hasTeacherPermission("penalties.write")
        ? el("div", { className: "attendance-bulk-actions" }, [
            button(
              "벌점 일괄 부여",
              "btn danger",
              "button",
              () => giveLatePenaltyToAbsentStudents(absentStudents)
            ),
          ])
        : null,
      !holiday && absentStudents.length
        ? table(
            isTodayView && hasTeacherPermission("attendance.write") ? ["번호", "이름", "반", "처리"] : ["번호", "이름", "반"],
            absentStudents
              .sort((a, b) => String(a.id).localeCompare(String(b.id), "ko-KR", { numeric: true }))
              .map((student) =>
                el("tr", {}, [
                  el("td", {}, formatStudentNumber(student.id)),
                  el("td", {}, student.name),
                  el("td", {}, student.className || "-"),
                  isTodayView && hasTeacherPermission("attendance.write")
                    ? el("td", { className: "action-cell" }, reasonAttendanceAction(student))
                    : null,
                ])
              )
          )
        : holiday
          ? null
          : el("div", { className: "empty success-message" }, "모든 학생이 오늘 출석 인증을 완료했습니다."),
    ], "attendance-absent-panel"),
    panel(`${dateLabel} 출석 사진`, [
      el("p", { className: "subtle" }, holiday ? attendanceHolidayMessage(selectedDateKey) : "학생이 제출한 현장 사진과 사유를 확인해 선택한 날짜의 출석 상태를 관리합니다."),
      dateChecks.length ? renderAttendanceTable(dateChecks) : el("div", { className: "empty" }, `${dateLabel} 출석 인증 내역이 없습니다.`),
    ], "attendance-photos-panel"),
  ]);
}

function scrollToPanel(id) {
  const target = document.getElementById(id);
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "start" });
}

function scrollToFirstOuting(outings, fallbackId) {
  const target = outings
    .map((outing) => document.getElementById(getOutingRowId(outing)))
    .find(Boolean);
  if (target) {
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  scrollToPanel(fallbackId);
}

function attendanceStudentCountStatGroup(selected, count) {
  const cohorts = getStudentCohortStats();
  const selectNode = el("select", { className: "cohort-select", ariaLabel: "출석 학생 기수 선택" }, [
    cohorts.map((cohort) => el("option", { value: cohort.value }, cohort.label)),
  ]);
  selectNode.value = selectedStudentCohort;
  selectNode.addEventListener("change", () => {
    selectedStudentCohort = selectNode.value;
    render();
  });

  return el("section", { className: "stat-group" }, [
    el("div", { className: "stat-group-heading" }, [
      el("h2", {}, "인원 현황"),
      el("label", { className: "cohort-filter" }, [
        el("span", {}, "기수"),
        selectNode,
      ]),
    ]),
    el("div", { className: "grid stats" }, [
      stat(selected.label, count, "명"),
    ]),
  ]);
}

function getSelectedAttendanceDateKey() {
  if (!isValidDateKey(selectedAttendanceDateKey)) selectedAttendanceDateKey = getTodayDateKey();
  return selectedAttendanceDateKey;
}

function attendanceDateControls(dateKey) {
  const dateInput = el("input", {
    name: "attendanceDate",
    type: "date",
    value: dateKey,
    max: getTodayDateKey(),
  });
  const form = el("form", { className: "teacher-search attendance-date-controls" }, [
    field("조회 날짜", dateInput),
    el("div", { className: "field attendance-date-actions" }, [
      el("span", {}, " "),
      el("div", { className: "action-row" }, [
        button("이전날", "btn secondary", "button", () => moveAttendanceDate(-1)),
        button("조회", "btn"),
        button("다음날", "btn secondary", "button", () => moveAttendanceDate(1)),
        button("오늘", "btn secondary", "button", () => setAttendanceDate(getTodayDateKey())),
      ]),
    ]),
  ]);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const nextDate = String(formData(form).attendanceDate || "").trim();
    if (!isValidDateKey(nextDate)) return notify("조회할 날짜를 선택해주세요.");
    setAttendanceDate(nextDate);
  });
  return panel("출석 날짜 조회", [form]);
}

function setAttendanceDate(dateKey) {
  if (!isValidDateKey(dateKey)) return;
  selectedAttendanceDateKey = dateKey > getTodayDateKey() ? getTodayDateKey() : dateKey;
  render();
}

function moveAttendanceDate(offset) {
  const date = parseDateKeyAsLocalDate(getSelectedAttendanceDateKey());
  date.setDate(date.getDate() + offset);
  const nextDateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  setAttendanceDate(nextDateKey);
}

function formatAttendanceDateLabel(dateKey) {
  if (dateKey === getTodayDateKey()) return "오늘";
  const [year, month, day] = String(dateKey || "").split("-");
  if (!year || !month || !day) return "선택일";
  return `${Number(month)}월 ${Number(day)}일`;
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
    && !isPenaltyDeleted(penalty)
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
  const managerInput = managerNameControl();
  const form = el("form", { className: "form-grid penalty-form" }, [
    field("학생", el("strong", {}, `${student.name || "-"} (${formatStudentNumber(student.id)})`)),
    field("담당자", managerInput),
    field("사유", reasonInput, "full"),
    field("상세", detailInput, "full"),
    el("div", { className: "field full" }, [
      el("div", { className: "attendance-modal-actions" }, [
        button("출석 처리", "btn"),
        button("취소", "btn secondary", "button", closeInfoModal),
      ]),
    ]),
  ]);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = formData(form);
    const reason = String(data.reason || "").trim();
    if (!reason) return notify("사유를 입력해주세요.");
    if (getStudentAttendanceForDate(student.id)) {
      closeInfoModal();
      render();
      return notify("이미 오늘 출석 처리가 완료된 학생입니다.");
    }
    const submitButton = form.querySelector("button[type='submit']");
    if (submitButton) {
      submitButton.disabled = true;
      setButtonLoading(submitButton, "저장 중...");
    }
    try {
      await createTeacherReasonAttendanceCheck(student, reason, data.detail, data.managerName);
      closeInfoModal();
      render();
      notify("사유 인증으로 출석 처리했습니다.");
    } catch (error) {
      console.error(error);
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "출석 처리";
      }
      notify("사유 인증 출석을 서버에 저장하지 못했습니다. Supabase 스키마를 확인해주세요.");
    }
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

async function createTeacherReasonAttendanceCheck(student, reason, detail, managerName) {
  const id = createId();
  const checkDate = getTodayDateKey();
  const check = {
    id,
    studentId: student.id,
    studentName: student.name,
    className: student.className || state.settings.className || "오프라인반",
    checkDate,
    status: "present",
    reason: String(reason || "").trim(),
    detail: String(detail || "").trim(),
    managerName: String(managerName || "").trim(),
    photoPath: `teacher-reason/${checkDate}/${student.id}/${id}`,
    photoUrl: "",
    photoDataUrl: "",
    originalName: "",
    createdAt: new Date().toISOString(),
  };
  if (remoteStore) {
    const row = {
      id: check.id,
      student_id: check.studentId,
      student_name: check.studentName,
      class_name: check.className,
      check_date: check.checkDate,
      status: check.status,
      reason: check.reason || null,
      detail: check.detail || null,
      manager_name: check.managerName || null,
      photo_path: check.photoPath,
      photo_url: null,
      thumbnail_path: null,
      thumbnail_url: null,
      arrival_photo_path: null,
      arrival_photo_url: null,
      arrival_thumbnail_path: null,
      arrival_thumbnail_url: null,
      arrival_original_name: null,
      arrived_at: null,
      photo_data_url: null,
      original_name: null,
      created_at: check.createdAt,
    };
    const { error } = await remoteStore.from("attendance_checks").insert(row);
    if (
      isMissingColumnError(error, "manager_name") ||
      isAttendanceManagerPermissionError(error)
    ) {
      const { error: fallbackError } = await remoteStore.from("attendance_checks").insert(stripAttendanceReasonColumnsFromRow(row, error));
      if (isDuplicateAttendanceError(fallbackError)) {
        const existingCheck = await fetchRemoteAttendanceCheck(student.id, checkDate);
        if (existingCheck) {
          upsertLocalAttendanceCheck(existingCheck);
          saveState({ skipRemote: true });
          return existingCheck;
        }
      }
      if (fallbackError) throw fallbackError;
    } else if (isDuplicateAttendanceError(error)) {
      const existingCheck = await fetchRemoteAttendanceCheck(student.id, checkDate);
      if (existingCheck) {
        upsertLocalAttendanceCheck(existingCheck);
        saveState({ skipRemote: true });
        return existingCheck;
      }
      throw error;
    } else if (error) {
      throw error;
    }
  }
  state.attendanceChecks = [
    check,
    ...(state.attendanceChecks || []).filter((item) => !(item.studentId === student.id && item.checkDate === checkDate)),
  ];
  saveState({ skipRemote: true });
  return check;
}

async function giveLatePenaltyToAbsentStudents(students) {
  if (!hasTeacherPermission("penalties.write")) return;
  const targets = (students || []).filter((student) => !hasLateAttendancePenaltyForToday(student.id));
  const skipped = (students || []).length - targets.length;
  if (!targets.length) {
    notify("오늘 지각 벌점이 모두 이미 부여되었습니다.");
    render();
    return;
  }
  openLateAttendancePenaltyModal(targets, skipped);
}

function openLateAttendancePenaltyModal(targets, skipped = 0) {
  closeInfoModal();
  const managerInput = managerNameControl();
  const form = el("form", { className: "form-grid penalty-form" }, [
    field("대상", el("strong", {}, `미인증 학생 ${targets.length}명`)),
    field("벌점", el("strong", {}, `${LATE_ATTENDANCE_PENALTY_POINTS}점`)),
    field("사유", el("span", {}, LATE_ATTENDANCE_PENALTY_REASON), "full"),
    field("담당자", managerInput),
    el("div", { className: "field full" }, [
      el("div", { className: "attendance-modal-actions" }, [
        button("벌점 부여", "btn danger"),
        button("취소", "btn secondary", "button", closeInfoModal),
      ]),
    ]),
  ]);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = formData(form);
    const managerName = String(data.managerName || "").trim();
    if (!managerName) return notify("담당자를 선택해주세요.");

    const freshTargets = targets.filter((student) => !hasLateAttendancePenaltyForToday(student.id));
    const freshSkipped = skipped + targets.length - freshTargets.length;
    if (!freshTargets.length) {
      closeInfoModal();
      render();
      return notify("오늘 지각 벌점이 모두 이미 부여되었습니다.");
    }

    const submitButton = form.querySelector("button[type='submit']");
    if (submitButton) {
      submitButton.disabled = true;
      setButtonLoading(submitButton, "저장 중...");
    }
    try {
      await Promise.all(
        freshTargets.map((student) =>
          createPenalty(student, LATE_ATTENDANCE_PENALTY_POINTS, LATE_ATTENDANCE_PENALTY_REASON, managerName)
        )
      );
      closeInfoModal();
      render();
      notify(freshSkipped ? `${freshTargets.length}명에게 지각 벌점을 부여했습니다. 이미 부여된 ${freshSkipped}명은 제외했습니다.` : `${freshTargets.length}명에게 지각 벌점을 부여했습니다.`);
    } catch (error) {
      console.error(error);
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "벌점 부여";
      }
      render();
      notify("벌점 저장 중 오류가 발생했습니다.");
    }
  });

  const modal = el("div", { className: "info-modal", role: "dialog", ariaModal: "true" }, [
    el("button", { className: "info-modal-backdrop", type: "button", ariaLabel: "지각 벌점 부여 닫기" }),
    el("div", { className: "info-modal-panel penalty-modal" }, [
      el("strong", {}, "지각 벌점 일괄 부여"),
      form,
    ]),
  ]);
  modal.querySelector(".info-modal-backdrop").addEventListener("click", closeInfoModal);
  document.body.appendChild(modal);
  document.addEventListener("keydown", closeInfoModalOnEscape);
}

function applyAutoApprovalForReturnedOutings() {
  let changed = false;
  state.outings.forEach((outing) => {
    if (outing.decision === "pending" && isReturnPhotoCompleted(outing)) {
      outing.decision = "approved";
      outing.approvedBy = outing.approvedBy || "복귀 사진 자동승인";
      outing.approvedAt = outing.approvedAt || getOutingReturnedAt(outing) || new Date().toISOString();
      outing.approvalReason = outing.approvalReason || "복귀 인증 사진 확인";
      changed = true;
      updateOutingDecisionToRemote(outing).catch((error) => console.error(error));
    }
  });
  if (changed) saveState({ skipRemote: true });
}

function isReturnPhotoCompleted(outing) {
  return outing?.status === "returned"
    && Boolean(getOutingReturnedAt(outing))
    && (outing.photos || []).some((photo) => photo.type === "복귀 인증");
}

function formatStudentNumber(studentId) {
  const value = String(studentId || "").trim();
  return value.length > 3 ? value.slice(-3) : value || "-";
}

function getStudentsInCohort(cohort = selectedStudentCohort) {
  return [...state.students].filter((student) => !cohort || getStudentCohort(student) === cohort);
}

function getFilteredStudentAdminStudents(students) {
  const query = studentAdminFilters.query.trim().toLowerCase();
  if (!query) return students;
  return students.filter((student) => {
    const id = String(student.id || "").trim();
    const displayNumber = formatStudentNumber(id);
    const numberWithoutLeadingZero = displayNumber.replace(/^0+/, "") || displayNumber;
    return [id, displayNumber, numberWithoutLeadingZero, student.name]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });
}

function isTeacherReasonAttendanceCheck(check) {
  return String(check?.photoPath || "").startsWith("teacher-reason/");
}

function isAttendanceCompleteCheck(check) {
  return check?.status === "present"
    || check?.status === "pre_arrival_verified"
    || isTeacherReasonAttendanceCheck(check);
}

function normalizeTeacherReasonAttendanceChecks() {
  let changed = false;
  state.attendanceChecks = (state.attendanceChecks || []).map((check) => {
    if (!isTeacherReasonAttendanceCheck(check) || check.status === "present") return check;
    changed = true;
    return { ...check, status: "present" };
  });
  if (changed) saveState();
}

function getAttendanceStudentsInCohort(cohort = selectedStudentCohort) {
  return getStudentsInCohort(cohort).filter((student) => !isAttendanceExcludedStudent(student));
}

function isAttendanceCheckInCohort(check, cohort = selectedStudentCohort) {
  if (!cohort) return true;
  return getStudentCohort({ id: check.studentId }) === cohort;
}

function openAttendanceDeadlineModal() {
  if (!isTeacherAdmin()) {
    notify("출석 시간 설정 권한이 없습니다.");
    return;
  }
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

function openAttendanceHolidayModal() {
  if (!isTeacherAdmin()) {
    notify("출석 휴일 설정 권한이 없습니다.");
    return;
  }
  closeInfoModal();
  const modal = el("div", { className: "info-modal", role: "dialog", ariaModal: "true" }, [
    el("button", { className: "info-modal-backdrop", type: "button", ariaLabel: "출석 휴일 설정 닫기" }),
    el("div", { className: "info-modal-panel attendance-settings-modal attendance-holiday-modal" }, [
      el("div", { className: "attendance-modal-titlebar" }, [
        el("strong", {}, "출석 휴일 설정"),
        button("×", "icon-btn attendance-modal-close", "button", closeInfoModal),
      ]),
      el("div", { className: "attendance-holiday-layout" }, [
        attendanceHolidayCalendarForm(),
        attendanceHolidayList(),
      ]),
    ]),
  ]);
  modal.querySelector(".info-modal-backdrop").addEventListener("click", closeInfoModal);
  document.body.appendChild(modal);
  document.addEventListener("keydown", closeInfoModalOnEscape);
}

function attendanceHolidayCalendarForm() {
  const monthKey = getAttendanceHolidayCalendarMonth();
  const saveButton = button("저장", "btn");
  const savedAt = attendanceHolidaySavedMessage ? state.settings.attendanceHolidaySavedAt : "";
  const form = el("form", { className: "attendance-holiday-calendar-form" }, [
    attendanceHolidaySavedMessage
      ? el("div", { className: "attendance-save-status", role: "status" }, [
          el("span", {}, attendanceHolidaySavedMessage),
          savedAt ? el("strong", {}, formatTimeOnly(savedAt)) : null,
        ])
      : null,
    el("div", { className: "attendance-calendar-head" }, [
      button("이전", "mini-btn", "button", () => moveAttendanceHolidayMonth(-1)),
      el("strong", {}, formatAttendanceHolidayMonth(monthKey)),
      button("다음", "mini-btn", "button", () => moveAttendanceHolidayMonth(1)),
    ]),
    renderAttendanceHolidayCalendar(monthKey),
    el("div", { className: "attendance-modal-actions" }, [
      saveButton,
      button("취소", "btn secondary", "button", closeInfoModal),
    ]),
    el("p", { className: "subtle attendance-deadline-note" }, "평일은 체크하면 휴일, 자동 휴일은 체크하면 출석일로 저장됩니다."),
  ]);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!isTeacherAdmin()) return notify("출석 휴일 설정 권한이 없습니다.");
    const checkedDates = [...form.querySelectorAll("input[name='holidayDate']:checked")]
      .map((node) => node.value)
      .filter(isValidDateKey);
    const checkedDefaultHolidayDates = [...form.querySelectorAll("input[name='openDefaultHolidayDate']:checked")]
      .map((node) => node.value)
      .filter(isValidDateKey);
    saveButton.disabled = true;
    saveButton.textContent = "저장 중...";
    try {
      await saveAttendanceHolidayMonth(monthKey, checkedDates, checkedDefaultHolidayDates);
      state.settings.attendanceHolidaySavedAt = new Date().toISOString();
      saveState({ skipRemote: true });
      attendanceHolidaySavedMessage = "저장되었습니다.";
      attendanceHolidayDraftOverrides = null;
      render();
      closeInfoModal();
      openAttendanceHolidayModal();
      notify("출석 휴일을 저장했습니다.");
    } catch (error) {
      console.error(error);
      notify("출석 휴일을 저장하지 못했습니다. Supabase 설정을 확인해주세요.");
      saveButton.disabled = false;
      saveButton.textContent = "저장";
    }
  });

  return form;
}

function attendanceHolidayList() {
  const todayKey = getTodayDateKey();
  const rows = getVisibleAttendanceHolidays()
    .filter((holiday) => holiday.dateKey >= todayKey)
    .slice(0, 20)
    .map((holiday) =>
      el("tr", {}, [
        el("td", {}, [
          holiday.dateKey,
          holiday.isDefault ? el("span", { className: "badge" }, holiday.note || "기본 휴일") : null,
        ]),
        el("td", { className: "student-admin-actions" }, [
          holiday.isDefault
            ? button("휴일 해제", "mini-btn", "button", () => openAttendanceOnDefaultHoliday(holiday.dateKey))
            : button("삭제", "mini-btn danger", "button", () => removeAttendanceHoliday(holiday.dateKey)),
        ]),
      ])
    );

  return el("div", { className: "attendance-holiday-settings" }, [
    el("strong", {}, "자동/추가 휴일"),
    table(
      ["날짜", "관리"],
      rows.length ? rows : [el("tr", {}, [el("td", { colSpan: 2 }, el("div", { className: "empty table-empty" }, "등록된 출석 휴일이 없습니다."))])]
    ),
  ]);
}

function renderAttendanceHolidayCalendar(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  const firstDay = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const customHolidayDates = new Set(getCustomAttendanceHolidays().map((holiday) => holiday.dateKey));
  const todayKey = getTodayDateKey();
  const cells = [
    ...["일", "월", "화", "수", "목", "금", "토"].map((day) => el("div", { className: "attendance-calendar-weekday" }, day)),
  ];

  for (let index = 0; index < firstDay.getDay(); index += 1) {
    cells.push(el("div", { className: "attendance-calendar-empty" }, ""));
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateKey = `${monthKey}-${String(day).padStart(2, "0")}`;
    const disabled = dateKey < todayKey;
    const rawDefaultHoliday = getDefaultAttendanceHoliday(dateKey);
    const isOverridden = isAttendanceHolidayDraftOverridden(dateKey);
    const defaultHoliday = isOverridden ? null : rawDefaultHoliday;
    const checkbox = el("input", {
      name: rawDefaultHoliday ? "openDefaultHolidayDate" : "holidayDate",
      type: "checkbox",
      value: dateKey,
      checked: rawDefaultHoliday ? !isOverridden : customHolidayDates.has(dateKey),
      disabled,
    });
    const dayCell = el("label", { className: `attendance-calendar-day${disabled ? " disabled" : ""}${defaultHoliday ? " default-holiday" : ""}${isOverridden ? " open-default-holiday" : ""}` }, [
      checkbox,
      el("span", {}, String(day)),
      rawDefaultHoliday ? el("small", {}, isOverridden ? "출석일" : rawDefaultHoliday.note || "휴일") : null,
    ]);
    if (rawDefaultHoliday && !disabled) {
      dayCell.addEventListener("click", (event) => {
        event.preventDefault();
        toggleDefaultHolidayDraftOverride(dateKey);
      });
    }
    cells.push(dayCell);
  }

  return el("div", { className: "attendance-calendar-grid" }, cells);
}

function getAttendanceHolidayCalendarMonth() {
  const fallback = getTodayDateKey().slice(0, 7);
  return /^\d{4}-\d{2}$/.test(attendanceHolidayCalendarMonth) ? attendanceHolidayCalendarMonth : fallback;
}

function moveAttendanceHolidayMonth(offset) {
  const [year, month] = getAttendanceHolidayCalendarMonth().split("-").map(Number);
  const date = new Date(year, month - 1 + offset, 1);
  attendanceHolidayCalendarMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  closeInfoModal();
  openAttendanceHolidayModal();
}

function formatAttendanceHolidayMonth(monthKey) {
  const [year, month] = monthKey.split("-");
  return `${year}년 ${Number(month)}월`;
}

async function saveAttendanceHolidayMonth(monthKey, checkedDates, checkedDefaultHolidayDates = []) {
  const checkedSet = new Set(checkedDates);
  const checkedDefaultHolidaySet = new Set(checkedDefaultHolidayDates);
  const draftOverrides = getAttendanceHolidayDraftOverrides();
  const todayKey = getTodayDateKey();
  const [year, month] = monthKey.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const existingMonthDates = getCustomAttendanceHolidays()
    .map((holiday) => holiday.dateKey)
    .filter((dateKey) => dateKey.startsWith(`${monthKey}-`) && dateKey >= todayKey);
  const datesToAdd = checkedDates.filter((dateKey) => !getAttendanceHoliday(dateKey) && !getDefaultAttendanceHoliday(dateKey));
  const datesToDelete = existingMonthDates.filter((dateKey) => !checkedSet.has(dateKey));

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateKey = `${monthKey}-${String(day).padStart(2, "0")}`;
    if (dateKey < todayKey || !getDefaultAttendanceHoliday(dateKey)) continue;
    const shouldOpenAttendance = draftOverrides.has(dateKey) || !checkedDefaultHolidaySet.has(dateKey);
    await setAttendanceHolidayOverride(dateKey, shouldOpenAttendance);
  }

  await Promise.all([
    ...datesToAdd.map((dateKey) => setAttendanceHoliday(dateKey, "")),
    ...datesToDelete.map((dateKey) => deleteAttendanceHoliday(dateKey)),
  ]);
}

function getAttendanceHolidayDraftOverrides() {
  if (!attendanceHolidayDraftOverrides) {
    attendanceHolidayDraftOverrides = new Set(normalizeDateKeyList(state.settings.attendanceHolidayOverrides));
  }
  return attendanceHolidayDraftOverrides;
}

function isAttendanceHolidayDraftOverridden(dateKey) {
  return getAttendanceHolidayDraftOverrides().has(dateKey);
}

function toggleDefaultHolidayDraftOverride(dateKey) {
  if (!isTeacherAdmin()) return notify("출석 휴일 설정 권한이 없습니다.");
  const overrides = getAttendanceHolidayDraftOverrides();
  if (overrides.has(dateKey)) overrides.delete(dateKey);
  else overrides.add(dateKey);
  attendanceHolidaySavedMessage = "";
  closeInfoModal();
  openAttendanceHolidayModal();
}

function getVisibleAttendanceHolidays() {
  const todayKey = getTodayDateKey();
  const customHolidays = normalizeAttendanceHolidays(getCustomAttendanceHolidays());
  const holidays = new Map(customHolidays.map((holiday) => [holiday.dateKey, holiday]));
  for (let offset = 0; offset < 370; offset += 1) {
    const date = parseDateKeyAsLocalDate(todayKey);
    date.setDate(date.getDate() + offset);
    const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const defaultHoliday = getDefaultAttendanceHoliday(dateKey);
    if (defaultHoliday && !isAttendanceHolidayOverridden(dateKey) && !holidays.has(dateKey)) holidays.set(dateKey, defaultHoliday);
  }
  return [...holidays.values()].sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

async function openAttendanceOnDefaultHoliday(dateKey) {
  if (!isTeacherAdmin()) return notify("출석 휴일 설정 권한이 없습니다.");
  if (!confirm(`${dateKey} 자동 휴일을 출석일로 열까요?`)) return;
  try {
    const overrides = getAttendanceHolidayDraftOverrides();
    overrides.add(dateKey);
    attendanceHolidaySavedMessage = "";
    closeInfoModal();
    openAttendanceHolidayModal();
  } catch (error) {
    console.error(error);
    notify("휴일 해제를 저장하지 못했습니다.");
  }
}

async function removeAttendanceHoliday(dateKey) {
  if (!isTeacherAdmin()) return notify("출석 휴일 설정 권한이 없습니다.");
  if (!confirm(`${dateKey} 출석 휴일을 삭제할까요?`)) return;
  try {
    await deleteAttendanceHoliday(dateKey);
    state.settings.attendanceHolidaySavedAt = new Date().toISOString();
    saveState({ skipRemote: true });
    attendanceHolidaySavedMessage = "삭제되었습니다.";
    attendanceHolidayDraftOverrides = null;
    render();
    closeInfoModal();
    openAttendanceHolidayModal();
    notify("출석 휴일을 삭제했습니다.");
  } catch (error) {
    console.error(error);
    notify("출석 휴일 삭제를 서버에 반영하지 못했습니다.");
  }
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

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!isTeacherAdmin()) return notify("출석 시간 설정 권한이 없습니다.");
    const data = formData(form);
    try {
      setAttendanceDeadline(data.attendanceDeadline, enabledInput.checked, { skipRemote: true });
      await saveAppSettingsToRemote();
      if (options.modal) closeInfoModal();
      render();
      notify("출석 시간 설정을 저장했습니다.");
    } catch (error) {
      console.error(error);
      notify("출석 시간 설정을 서버에 저장하지 못했습니다.");
    }
  });

  return form;
}

function renderAttendanceTable(checks) {
  const headers = ["사유/출석 시각", "번호", "이름", "반", "상태", "담당자", "사유", "상세", "사진"];
  const rows = [...checks]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map((check) =>
      el("tr", {}, [
        el("td", {}, formatDateCompact(check.createdAt)),
        el("td", {}, formatStudentNumber(check.studentId)),
        el("td", {}, check.studentName || "-"),
        el("td", {}, check.className || "-"),
        el("td", {}, attendanceStatusBadge(check)),
        el("td", {}, check.managerName || "-"),
        el("td", {}, check.reason || "-"),
        el("td", { className: "wide-cell" }, check.detail || "-"),
        el("td", {}, attendancePhotoButton(check)),
      ])
    );
  labelTableRows(headers, rows);

  return el("div", { className: "excel-table-wrap" }, [
    el("table", { className: "excel-table" }, [
      el("thead", {}, [
        el("tr", {}, headers.map((header) => el("th", {}, header))),
      ]),
      el("tbody", {}, rows),
    ]),
  ]);
}

function attendanceStatusBadge(check) {
  if (isTeacherReasonAttendanceCheck(check)) return el("span", { className: "badge approved" }, "사유 인증 출석");
  if (check.status === "pre_arrival_reason") return el("span", { className: "badge pending" }, "사유신청");
  if (check.status === "pre_arrival_verified") return el("span", { className: "badge approved" }, "사유 후 등원");
  return el("span", { className: "badge approved" }, "출석");
}

function attendancePhotoButton(check) {
  if (isTeacherReasonAttendanceCheck(check)) return el("span", {}, "사유 인증");
  const src = getAttendancePhotoSrc(check);
  const thumbnailSrc = getAttendanceThumbnailSrc(check);
  const arrivalSrc = getAttendanceArrivalPhotoSrc(check);
  const arrivalThumbnailSrc = getAttendanceArrivalThumbnailSrc(check);
  const buttons = [];
  if (src) {
    buttons.push(button("", "attendance-photo-thumb", "button", () => openPhotoModal({
      type: check.status === "present" ? "출석 인증" : "등원 전 사유 인증",
      photoUrl: src,
      thumbnailUrl: thumbnailSrc,
      uploadedAt: check.createdAt,
    }), [
      el("img", { src: thumbnailSrc, alt: "출석 인증 사진", loading: "lazy" }),
      el("span", {}, check.status === "present" ? "출석" : "사유"),
    ]));
  }
  if (arrivalSrc) {
    buttons.push(button("", "attendance-photo-thumb", "button", () => openPhotoModal({
      type: "등원 인증",
      photoUrl: arrivalSrc,
      thumbnailUrl: arrivalThumbnailSrc,
      uploadedAt: check.arrivedAt,
    }), [
      el("img", { src: arrivalThumbnailSrc, alt: "등원 인증 사진", loading: "lazy" }),
      el("span", {}, "등원"),
    ]));
  }
  return buttons.length ? el("div", { className: "attendance-photo-grid" }, buttons) : "-";
}

function isActionRequired(outing) {
  return isActiveOuting(outing);
}

function teacherOutingSection(titleText, outings, options, id = "") {
  const props = id ? { className: "teacher-section", id } : { className: "teacher-section" };
  return el("section", props, [
    el("div", { className: "section-heading" }, [
      el("h3", {}, titleText),
      el("span", {}, String(outings.length) + "건"),
    ]),
    outings.length ? renderTeacherOutingTable(outings, options) : el("div", { className: "empty" }, "해당 기록이 없습니다."),
  ]);
}

function completedTeacherOutingSections(outings, options, id = "") {
  const sortedOutings = sortOutingsByCreatedAtDesc(outings);
  const props = id ? { className: "teacher-section", id } : { className: "teacher-section" };
  return el("section", props, [
    el("div", { className: "section-heading" }, [
      el("h3", {}, "처리 완료"),
      el("span", {}, String(sortedOutings.length) + "건"),
    ]),
    sortedOutings.length
      ? el(
          "div",
          { className: "teacher-date-sections" },
          groupOutingsByCreatedDate(sortedOutings).map((group) =>
            el("section", { className: "teacher-date-section" }, [
              el("div", { className: "section-heading compact" }, [
                el("h3", {}, group.date),
                el("span", {}, String(group.outings.length) + "건"),
              ]),
              renderTeacherOutingTable(group.outings, options),
            ])
          )
        )
      : el("div", { className: "empty" }, "해당 기록이 없습니다."),
  ]);
}

function groupOutingsByCreatedDate(outings) {
  const groups = new Map();
  outings.forEach((outing) => {
    const date = formatDateKey(outing.createdAt);
    if (!groups.has(date)) groups.set(date, []);
    groups.get(date).push(outing);
  });
  return [...groups.entries()].map(([date, groupOutings]) => ({
    date,
    outings: sortOutingsByCreatedAtDesc(groupOutings),
  }));
}

function sortOutingsByCreatedAtDesc(outings) {
  return [...outings].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function renderTeacherOutingTable(outings, options = {}) {
  const headers = ["신청일", "번호", "이름", "사유", "상세", "예상", "인증", "복귀", "상태", "승인 담당자", "승인 시간", "승인 사유", "사진", "처리"];
  const rows = outings.map((outing) =>
    el("tr", { id: getOutingRowId(outing) }, [
      el("td", { className: "outing-date-cell" }, formatDateCompact(outing.createdAt)),
      el("td", {}, formatStudentNumber(outing.studentId)),
      el("td", { className: "outing-name-cell" }, outing.studentName || "-"),
      el("td", { className: "outing-reason-cell" }, outing.reason || "-"),
      el("td", { className: "wide-cell" }, outing.earlyLeaveReason || outing.detail || "-"),
      el("td", { className: "outing-expected-cell" }, formatExpectedReturn(outing.expectedReturn)),
      el("td", { className: "outing-time-cell" }, formatTime(outing.verifiedAt)),
      el("td", { className: "outing-time-cell" }, formatTime(getOutingReturnedAt(outing))),
      el("td", { className: "outing-status-cell" }, statusBadge(outing)),
      el("td", { className: "approval-history-cell" }, approvalManagerSummary(outing)),
      el("td", { className: "approval-history-cell" }, approvalTimeSummary(outing)),
      el("td", { className: "approval-reason-cell" }, approvalReasonSummary(outing)),
      el("td", { className: "outing-photo-cell" }, photoMiniList(outing.photos)),
      el("td", { className: "action-cell" }, teacherRowActions(outing, options)),
    ])
  );
  labelTableRows(headers, rows);

  return el("div", { className: "excel-table-wrap" }, [
    el("table", { className: "excel-table teacher-outing-table" }, [
      el("thead", {}, [
        el("tr", {}, headers.map((header) => el("th", {}, header))),
      ]),
      el("tbody", {}, rows),
    ]),
  ]);
}

function teacherRowActions(outing, options = {}) {
  if (options.trash) {
    return hasTeacherPermission("outing.delete")
      ? el("div", { className: "teacher-action-stack" }, [button("복구", "mini-btn", "button", () => restoreOuting(outing.id))])
      : [];
  }
  const canDecide = outing.decision === "pending" && outing.status !== "returned" && hasTeacherPermission("outing.approve");
  const canCancelApproval = outing.decision === "approved" && !isReturnPhotoCompleted(outing) && hasTeacherPermission("outing.approve");
  const canGiveNotReturnedPenalty = canGiveNotReturnedPenaltyForOuting(outing);
  const canRejectWithPenalty = canDecide && hasTeacherPermission("penalties.write");

  const actions = [
    canDecide ? button("승인", "mini-btn", "button", () => approveOutingFromTeacher(outing)) : null,
    canDecide ? button("반려", "mini-btn danger", "button", () => {
      if (canRejectWithPenalty) openRejectOutingPenaltyModal(outing);
      else decideOuting(outing.id, "rejected");
    }) : null,
    canGiveNotReturnedPenalty && !canDecide
      ? hasNotReturnedPenaltyForOuting(outing)
        ? el("button", { className: "mini-btn", type: "button", disabled: true }, "미복귀 벌점 부여 완료")
        : button("미복귀 벌점 부여", "mini-btn danger", "button", () => openNotReturnedPenaltyModal(outing))
      : null,
    canCancelApproval ? button("승인 취소", "mini-btn danger", "button", () => cancelOutingApproval(outing)) : null,
    hasTeacherPermission("outing.memo") ? button("메모", "mini-btn", "button", () => {
      const memo = prompt("교사용 메모", outing.teacherMemo || "");
      if (memo === null) return;
      outing.teacherMemo = memo;
      saveState();
      render();
    }) : null,
    hasTeacherPermission("outing.delete") ? button("삭제", "mini-btn danger", "button", () => deleteOuting(outing.id)) : null,
  ].filter(Boolean);

  return actions.length ? el("div", { className: "teacher-action-stack" }, actions) : [];
}

async function cancelOutingApproval(outing) {
  if (!outing || !hasTeacherPermission("outing.approve")) return;
  if (isReturnPhotoCompleted(outing)) {
    notify("복귀 인증 사진이 있는 건은 승인 취소할 수 없습니다.");
    return;
  }
  const nextStatus = getApprovalCancelStatus(outing);
  const nextStepLabel = nextStatus === "verified" ? "복귀 인증 단계" : "사진 인증 단계";
  if (!confirm(`승인을 취소하고 학생을 ${nextStepLabel}로 되돌릴까요?`)) return;

  const previous = {
    decision: outing.decision,
    status: outing.status,
    returnedAt: outing.returnedAt,
    approvedBy: outing.approvedBy,
    approvedAt: outing.approvedAt,
    approvalReason: outing.approvalReason,
  };

  outing.decision = "pending";
  outing.status = nextStatus;
  outing.returnedAt = "";
  outing.approvedBy = "";
  outing.approvedAt = "";
  outing.approvalReason = "";
  saveState({ skipRemote: true });
  render();

  try {
    await updateOutingDecisionToRemote(outing);
    notify(`승인을 취소하고 ${nextStepLabel}로 되돌렸습니다.`);
  } catch (error) {
    console.error(error);
    outing.decision = previous.decision;
    outing.status = previous.status;
    outing.returnedAt = previous.returnedAt;
    outing.approvedBy = previous.approvedBy;
    outing.approvedAt = previous.approvedAt;
    outing.approvalReason = previous.approvalReason;
    saveState({ skipRemote: true });
    render();
    notify("승인 취소 저장 중 오류가 발생했습니다.");
  }
}

function getApprovalCancelStatus(outing) {
  return isOutingReadyForReturnAfterApprovalCancel(outing) ? "verified" : "requested";
}

function isOutingReadyForReturnAfterApprovalCancel(outing) {
  return Boolean(
    outing &&
      hasTeacherOutingPhotoType(outing, "현장 인증") &&
      (!isTeacherOutingReceiptRequired(outing) || hasTeacherOutingPhotoType(outing, "영수증 인증"))
  );
}

function isTeacherOutingReceiptRequired(outing) {
  return String(outing?.reason || "").trim() === "병원";
}

function hasTeacherOutingPhotoType(outing, type) {
  return (outing?.photos || []).some((photo) => photo?.type === type);
}

function approveOutingFromTeacher(outing) {
  if (!outing || !hasTeacherPermission("outing.approve")) return;
  if (!isReturnPhotoCompleted(outing)) {
    openApprovalWithoutReturnPhotoModal(outing);
    return;
  }
  decideOuting(outing.id, "approved", {
    approvedBy: teacherAuth.user?.username || "",
    approvalReason: "복귀 인증 사진 확인",
  });
}

function openApprovalWithoutReturnPhotoModal(outing) {
  closeInfoModal();
  const managerInput = managerNameControl();
  const reasonInput = textarea("approvalReason", "복귀 사진 없이 승인하는 사유를 입력하세요.");
  reasonInput.required = true;
  const form = el("form", { className: "form-grid penalty-form" }, [
    field("학생", el("strong", {}, `${outing.studentName || "-"} (${formatStudentNumber(outing.studentId)})`)),
    field("신청일", el("span", {}, formatDateCompact(outing.createdAt))),
    field("예상 복귀", el("span", {}, formatExpectedReturn(outing.expectedReturn))),
    field("담당자", managerInput),
    field("승인 사유", reasonInput, "full"),
    el("div", { className: "field full" }, [
      el("div", { className: "attendance-modal-actions" }, [
        button("승인 처리", "btn"),
        button("취소", "btn secondary", "button", closeInfoModal),
      ]),
    ]),
  ]);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = formData(form);
    const managerName = String(data.managerName || "").trim();
    const approvalReason = String(data.approvalReason || "").trim();
    if (!managerName) return notify("담당자를 선택해주세요.");
    if (!approvalReason) return notify("승인 사유를 입력해주세요.");

    const submitButton = form.querySelector("button[type='submit']");
    if (submitButton) {
      submitButton.disabled = true;
      setButtonLoading(submitButton, "저장 중...");
    }
    try {
      await decideOuting(outing.id, "approved", { approvalManagerName: managerName, approvalReason, throwOnError: true });
      closeInfoModal();
    } catch (error) {
      console.error(error);
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "승인 처리";
      }
    }
  });

  const modal = el("div", { className: "info-modal", role: "dialog", ariaModal: "true" }, [
    el("button", { className: "info-modal-backdrop", type: "button", ariaLabel: "승인 사유 입력 닫기" }),
    el("div", { className: "info-modal-panel penalty-modal" }, [
      el("strong", {}, "복귀 사진 없이 승인"),
      form,
    ]),
  ]);
  modal.querySelector(".info-modal-backdrop").addEventListener("click", closeInfoModal);
  document.body.appendChild(modal);
  document.addEventListener("keydown", closeInfoModalOnEscape);
}

function approvalHistorySummary(outing) {
  if (outing.decision !== "approved") return "-";
  const items = [
    outing.approvedBy ? el("span", {}, outing.approvedBy) : null,
    outing.approvedAt ? el("span", {}, formatDateCompact(outing.approvedAt)) : null,
    outing.approvalReason ? el("small", {}, outing.approvalReason) : null,
  ].filter(Boolean);
  return items.length ? el("div", { className: "approval-history" }, items) : "-";
}

function approvalManagerSummary(outing) {
  if (outing.decision !== "approved") return "-";
  return outing.approvedBy || "-";
}

function approvalTimeSummary(outing) {
  if (outing.decision !== "approved") return "-";
  return outing.approvedAt ? formatDateCompact(outing.approvedAt) : "-";
}

function approvalReasonSummary(outing) {
  if (outing.decision !== "approved") return "-";
  return outing.approvalReason || "-";
}

function canGiveNotReturnedPenaltyForOuting(outing) {
  return hasTeacherPermission("penalties.write")
    && outing?.decision !== "approved"
    && outing?.decision !== "rejected"
    && outing?.status !== "returned";
}

function getOutingRowId(outing) {
  return `outing-row-${outing.id || ""}`;
}

function hasNotReturnedPenaltyForOuting(outing) {
  const label = notReturnedPenaltyReasonLabel(outing);
  return (state.penalties || []).some((penalty) =>
    String(penalty.studentId || "").trim() === String(outing?.studentId || "").trim()
    && !isPenaltyDeleted(penalty)
    && Number(penalty.points) > 0
    && String(penalty.reason || "").startsWith(label)
  );
}

function notReturnedPenaltyReasonLabel(outing) {
  return `${NOT_RETURNED_PENALTY_REASON_PREFIX} (신청: ${formatDateCompact(outing?.createdAt)})`;
}

function photoMiniList(photos = []) {
  photos = normalizeOutingPhotosByType(photos);
  if (!photos.length) return "-";
  return el(
    "div",
    { className: "photo-mini-list" },
    photos.map((photo) => {
      const thumbnailSrc = getOutingThumbnailSrc(photo);
      const label = photo.type || "인증 사진";
      const photoButton = button("", "photo-mini-button", "button", () => openLoadedOutingPhotoModal(photo), [
        thumbnailSrc
          ? el("img", { src: thumbnailSrc, alt: label, loading: "lazy" })
          : el("span", { className: "photo-mini-placeholder" }, "보기"),
        el("span", { className: "photo-mini-label" }, label.replace(" 인증", "")),
      ]);
      photoButton.title = label;
      photoButton.ariaLabel = label + " 보기";
      return photoButton;
    })
  );
}

function renderStudentsAdmin() {
  if (!hasTeacherPermission("students.read")) return renderForbidden();
  return el("div", { className: "grid" }, [teacherStudentForm()]);
}

function renderDeviceHistoryAdmin() {
  if (!hasTeacherPermission("students.read")) return renderForbidden();
  const events = getFilteredDeviceHistoryEvents();
  const rows = events.map(({ event, student }) =>
    el("tr", {}, [
      el("td", {}, formatDateCompact(event.createdAt)),
      el("td", {}, student ? getStudentCohort(student) || "-" : getCohortFromStudentId(event.studentId)),
      el("td", {}, student ? formatStudentNumber(student.id) : formatStudentNumber(event.studentId)),
      el("td", {}, student?.name || event.studentName || "-"),
      el("td", {}, studentRegistrationEventLabel(event.eventType)),
      el("td", {}, studentRegistrationActorLabel(event.actor)),
      el("td", {}, event.reason || "-"),
      el("td", {}, event.clientDisplayMode || "-"),
      el("td", { title: event.clientUserAgent || "" }, formatUserAgentPreview(event.clientUserAgent)),
      el("td", { title: event.deviceToken || "" }, formatDeviceTokenPreview(event.deviceToken)),
      el("td", { className: "student-admin-actions" }, [
        student ? button("학생별 보기", "mini-btn", "button", () => openStudentRegistrationHistory(student.id)) : null,
      ]),
    ])
  );

  return el("div", { className: "grid device-history-admin" }, [
    panel("기기 등록 이력", [
      el("p", { className: "subtle" }, "학생 앱 기기 등록과 초기화 기록을 시간순으로 확인합니다."),
      deviceHistorySearchControls(events.length),
      table(
        ["일시", "기수", "번호", "이름", "내용", "처리자", "사유", "환경", "브라우저", "기기 토큰", "관리"],
        rows.length ? rows : [el("tr", {}, [el("td", { colSpan: 11 }, el("div", { className: "empty table-empty" }, "조회할 기기 등록 이력이 없습니다."))])]
      ),
    ]),
  ]);
}

function renderTrackOptionsAdmin() {
  if (!hasTeacherPermission("students.read")) return renderForbidden();
  return el("div", { className: "grid" }, [trackOptionAdminPanel()]);
}

function renderManagersAdmin() {
  if (!hasTeacherPermission("managers.read")) return renderForbidden();
  return el("div", { className: "grid" }, [managerAdminPanel()]);
}

function renderNoticesAdmin() {
  if (!hasTeacherPermission("notices.read")) return renderForbidden();
  return el("div", { className: "grid" }, [noticeAdminPanel()]);
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

function getStudentProfileForTeacher(studentId) {
  const id = String(studentId || "").trim();
  const student = findStudent(id);
  const localProfile = state.settings.studentProfiles?.[id] || null;
  if (student?.track || student?.gender || student?.passwordHash || student?.deviceToken || student?.appRegisteredAt) {
    return {
      initialTrack: normalizeCoastGuardTrack(localProfile?.initialTrack || localProfile?.track || student.track),
      track: normalizeCoastGuardTrack(localProfile?.track || student.track),
      gender: student.gender || localProfile?.gender || "",
      passwordHash: student.passwordHash || localProfile?.passwordHash || "",
      deviceToken: student.deviceToken || localProfile?.deviceToken || "",
      authedAt: student.appRegisteredAt || localProfile?.authedAt || "",
    };
  }
  return localProfile;
}

function getTeacherStudentRegisteredTrack(student) {
  const profile = getStudentProfileForTeacher(student?.id);
  return normalizeCoastGuardTrack(student?.track || profile?.track || profile?.initialTrack);
}

function upsertStudents(students, className, track = "") {
  let created = 0;
  let updated = 0;
  const nextTrack = normalizeCoastGuardTrack(track);
  students.forEach((student) => {
    const existing = findStudent(student.id);
    const payload = {
      id: student.id,
      name: student.name,
      className: String(className || "").trim() || state.settings.className,
      track: nextTrack || normalizeCoastGuardTrack(existing?.track),
      gender: existing?.gender || "",
      passwordHash: existing?.passwordHash || "",
      deviceToken: existing?.deviceToken || "",
      appRegisteredAt: existing?.appRegisteredAt || "",
      attendanceExcluded: existing?.attendanceExcluded === true,
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
