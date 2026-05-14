const teacherFilters = {
  query: "",
  sort: "name",
};
let penaltySortMode = "id";
let editingNoticeId = "";
let trackOptionDraft = null;
let gradeManagementMode = "weekly";
let gradeManagementTrackFilter = "";
let finalExamGradeFilters = { round: "1" };
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
  const pendingOutingCases = state.outings.filter((outing) => outing.decision === "pending");
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
        stat("처리 대기", pendingOutingCases.length, "건", {
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
  const confirmed = confirm(`미인증 학생 ${targets.length}명에게 지각 벌점 ${LATE_ATTENDANCE_PENALTY_POINTS}점을 일괄 부여할까요?`);
  if (!confirmed) return;
  try {
    await Promise.all(
      targets.map((student) =>
        createPenalty(student, LATE_ATTENDANCE_PENALTY_POINTS, LATE_ATTENDANCE_PENALTY_REASON, teacherAuth.user?.username || "teacher")
      )
    );
    render();
    notify(skipped ? `${targets.length}명에게 지각 벌점을 부여했습니다. 이미 부여된 ${skipped}명은 제외했습니다.` : `${targets.length}명에게 지각 벌점을 부여했습니다.`);
  } catch (error) {
    console.error(error);
    render();
    notify("벌점 저장 중 오류가 발생했습니다.");
  }
}

function applyAutoApprovalForReturnedOutings() {
  if (!hasTeacherPermission("outing.approve")) return;
  let changed = false;
  state.outings.forEach((outing) => {
    if (outing.decision === "pending" && isReturnPhotoCompleted(outing)) {
      outing.decision = "approved";
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

function renderPenaltyManagement() {
  if (!hasTeacherPermission("penalties.read")) return renderForbidden();
  const selected = selectedStudentCohortCount();
  const visiblePenalties = getFilteredPenalties(selected.value);
  const summaries = getPenaltySummaries(visiblePenalties, selected.value);
  const penalizedStudents = summaries.filter((item) => item.total > 0).length;
  const latestPenalties = [...visiblePenalties].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return el("div", { className: "grid" }, [
    el("div", { className: "stat-groups" }, [
      studentCountStatGroup(),
      statGroup("상/벌점 현황", [
        stat("벌점 학생", penalizedStudents, "명"),
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
  const headers = ["번호", "이름", "반", "누적점수", "상세"];
  const rows = summaries.map(({ student, total, count }) =>
    el("tr", {}, [
      el("td", {}, formatStudentNumber(student.id)),
      el("td", {}, student.name),
      el("td", {}, student.className || "-"),
      el("td", {}, el("strong", { className: getPenaltyPointClass(total) }, formatPenaltyPoints(total))),
      el("td", {}, count ? button("내역", "mini-btn", "button", () => openPenaltyHistoryModal(student.id)) : "-"),
    ])
  );
  labelTableRows(headers, rows);

  return el("div", { className: "excel-table-wrap" }, [
    el("table", { className: "excel-table penalty-summary-table" }, [
      el("thead", {}, [
        el("tr", {}, headers.map((header) => el("th", {}, header))),
      ]),
      el("tbody", {}, rows),
    ]),
  ]);
}

function renderPenaltyHistoryTable(penalties) {
  const showDeleteColumn = canManagePenaltyDeletes();
  const headers = showDeleteColumn ? ["부여일", "번호", "이름", "상/벌점", "사유", "담당자", "관리"] : ["부여일", "번호", "이름", "상/벌점", "사유", "담당자"];
  const rows = penalties.map((penalty) =>
    el("tr", {}, [
      el("td", {}, formatDateCompact(penalty.createdAt)),
      el("td", {}, formatStudentNumber(penalty.studentId)),
      el("td", {}, penalty.studentName || "-"),
      el("td", {}, el("span", { className: getPenaltyPointClass(penalty.points) }, formatPenaltyPoints(penalty.points))),
      el("td", { className: "wide-cell" }, penalty.reason || "-"),
      el("td", {}, penalty.managerName || "-"),
      showDeleteColumn ? el("td", { className: "student-admin-actions" }, canCancelPenalty(penalty) ? button("삭제", "mini-btn danger", "button", () => cancelPenalty(penalty.id)) : "-") : null,
    ].filter(Boolean))
  );
  labelTableRows(headers, rows);

  return el("div", { className: "excel-table-wrap" }, [
    el("table", { className: "excel-table penalty-history-table" }, [
      el("thead", {}, [
        el("tr", {}, headers.map((header) => el("th", {}, header))),
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
  const managerInput = managerNameControl();

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

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = formData(form);
    const points = Number(data.points);
    if (!selectedStudents.length) return notify("학생을 한 명 이상 추가해주세요.");
    if (!Number.isFinite(points) || points < 1) return notify("점수는 1점 이상 입력해주세요.");
    const signedPoints = data.scoreType === "reward" ? -Math.floor(points) : Math.floor(points);
    try {
      await Promise.all(selectedStudents.map((student) => createPenalty(student, signedPoints, data.reason, data.managerName)));
      closeInfoModal();
      render();
      notify(`${selectedStudents.length}명에게 ${data.scoreType === "reward" ? "상점" : "벌점"}을 부여했습니다.`);
    } catch (error) {
      console.error(error);
      render();
      notify("벌점 저장 중 오류가 발생했습니다.");
    }
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
  const managerInput = managerNameControl();

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

  form.addEventListener("submit", async (event) => {
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
    try {
      await createPenalty(student, Math.floor(points), `${notReturnedPenaltyReasonLabel(outing)} - ${reason}`, data.managerName);
      closeInfoModal();
      render();
      notify("미복귀 벌점을 부여했습니다.");
    } catch (error) {
      console.error(error);
      render();
      notify("벌점 저장 중 오류가 발생했습니다.");
    }
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
  const managerInput = managerNameControl();

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

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = formData(form);
    const points = Number(data.points);
    const reason = String(data.reason || "").trim();
    if (!Number.isFinite(points) || points < 1) return notify("벌점은 1점 이상 입력해주세요.");
    if (!reason) return notify("반려 사유를 입력해주세요.");

    outing.decision = "rejected";
    outing.teacherMemo = `반려 사유: ${reason}`;
    const alreadyPenalized = hasNotReturnedPenaltyForOuting(outing);
    try {
      if (!alreadyPenalized) {
        await createPenalty(student, Math.floor(points), `${notReturnedPenaltyReasonLabel(outing)} - ${reason}`, data.managerName);
      }
      saveState();
      closeInfoModal();
      render();
      notify(alreadyPenalized ? "반려 처리했습니다. 기존 미복귀 벌점이 있어 추가 부여는 생략했습니다." : "반려 처리하고 벌점을 부여했습니다.");
    } catch (error) {
      console.error(error);
      render();
      notify("벌점 저장 중 오류가 발생했습니다.");
    }
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

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!isTeacherAdmin()) return notify("출석 시간 설정 권한이 없습니다.");
    const data = formData(form);
    setAttendanceDeadline(data.attendanceDeadline, enabledInput.checked);
    if (options.modal) closeInfoModal();
    render();
    notify("출석 시간 설정을 저장했습니다.");
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
  return outing.decision === "pending";
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
  const headers = ["신청일", "번호", "이름", "사유", "상세", "예상", "인증", "복귀", "상태", "사진", "처리"];
  const rows = outings.map((outing) =>
    el("tr", { id: getOutingRowId(outing) }, [
      el("td", {}, formatDateCompact(outing.createdAt)),
      el("td", {}, formatStudentNumber(outing.studentId)),
      el("td", {}, outing.studentName || "-"),
      el("td", {}, outing.reason || "-"),
      el("td", { className: "wide-cell" }, outing.earlyLeaveReason || outing.detail || "-"),
      el("td", {}, formatExpectedReturn(outing.expectedReturn)),
      el("td", {}, formatTime(outing.verifiedAt)),
      el("td", {}, formatTime(getOutingReturnedAt(outing))),
      el("td", {}, statusBadge(outing)),
      el("td", {}, photoMiniList(outing.photos)),
      el("td", { className: "action-cell" }, teacherRowActions(outing, options)),
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
        ? el("button", { className: "mini-btn", type: "button", disabled: true }, "미복귀 벌점 부여 완료")
        : button("미복귀 벌점 부여", "mini-btn danger", "button", () => openNotReturnedPenaltyModal(outing))
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
    photos.map((photo) => {
      const thumbnailSrc = getOutingThumbnailSrc(photo);
      return button("", "photo-mini-button", "button", () => openLoadedOutingPhotoModal(photo), [
        thumbnailSrc
          ? el("img", { src: thumbnailSrc, alt: photo.type || "외출 인증 사진", loading: "lazy" })
          : el("span", { className: "photo-mini-placeholder" }, "보기"),
      ]);
    })
  );
}

function renderStudentsAdmin() {
  if (!hasTeacherPermission("students.read")) return renderForbidden();
  return el("div", { className: "grid" }, [teacherStudentForm()]);
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

function teacherStudentForm() {
  const selected = selectedStudentCohortCount();
  const visibleStudents = getStudentsInCohort(selected.value);
  const cohortInput = input("cohort", "number", "18", selected.value || "18");
  const trackSelect = el("select", { name: "track" }, [
    el("option", { value: "" }, "선택 안 함"),
    ...getCoastGuardTrackOptions().map((option) => el("option", { value: option }, option)),
  ]);
  const customTrackInput = input("customTrack", "text", "직렬을 입력하세요");
  const customTrackField = field("기타 직렬", customTrackInput);
  customTrackField.hidden = true;
  trackSelect.addEventListener("change", () => {
    customTrackField.hidden = trackSelect.value !== "기타";
    if (customTrackField.hidden) customTrackInput.value = "";
  });
  const rosterInput = el("textarea", {
    name: "roster",
    placeholder: "1 홍길동\n2 김민지\n3 박서준",
    rows: 8,
  });
  const form = el("form", { className: "form-grid" }, [
    field("기수", cohortInput),
    field("기본 반", input("className", "text", "오프라인반", state.settings.className)),
    field("직렬", trackSelect, "", "선택하면 이번 등록 명단에 동일하게 적용됩니다."),
    customTrackField,
    field("학생 번호와 이름", rosterInput, "full", "한 줄에 한 명씩 입력하세요. 한 명만 입력하면 단일 등록, 여러 명이면 일괄 등록됩니다."),
    el("div", { className: "field full" }, [
      button("학생 등록/수정", "btn"),
      el("p", { className: "subtle" }, "예: 기수 18, 번호 4번은 18004로 저장됩니다. 직렬을 선택하면 이름, 반 정보와 함께 저장됩니다."),
    ]),
  ]);
  const submitButton = form.querySelector("button[type='submit']");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = formData(form);
    const cohort = String(data.cohort || "").trim();
    if (!isValidCohort(cohort)) return notify("기수를 숫자로 입력해주세요.");
    const parsed = parseStudentRoster(data.roster, cohort);
    if (!parsed.length) return notify("등록할 학생 번호와 이름을 입력해주세요.");
    const track = resolveStudentTrack(data.track, data.customTrack);
    if (data.track && !track) return notify("기타 직렬을 입력해주세요.");
    submitButton.disabled = true;
    submitButton.textContent = "저장 중...";
    try {
      const result = upsertStudents(parsed, data.className, track);
      selectedStudentCohort = cohort;
      await saveStudentsToRemote(parsed.map((student) => student.id));
      saveState({ skipRemote: true });
      form.reset();
      render();
      notify("학생 " + result.created + "명 등록, " + result.updated + "명 수정되었습니다.");
    } catch (error) {
      console.error(error);
      notify("학생 등록 정보를 저장하지 못했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "학생 등록/수정";
    }
  });

  const rows = [...visibleStudents]
    .sort((a, b) => String(a.id).localeCompare(String(b.id), "ko-KR", { numeric: true }))
    .map((student) => {
      const profile = getStudentProfileForTeacher(student.id);
      return el("tr", {}, [
        el("td", {}, formatStudentNumber(student.id)),
        el("td", {}, student.name),
        el("td", {}, student.className),
        el("td", {}, profile ? el("span", { className: "badge approved" }, "완료") : el("span", { className: "badge" }, "미등록")),
        el("td", {}, formatDateCompact(profile?.authedAt)),
        el("td", {}, normalizeCoastGuardTrack(profile?.track) || "-"),
        el("td", {}, profile?.gender || "-"),
        el("td", {}, isAttendanceExcludedStudent(student) ? el("span", { className: "badge rejected" }, "제외") : el("span", { className: "badge approved" }, "포함")),
        el("td", { className: "student-admin-actions" }, [
          profile ? button("등록 초기화", "mini-btn", "button", () => resetStudentAppRegistration(student.id)) : null,
          button(isAttendanceExcludedStudent(student) ? "출석 포함" : "출석 제외", "mini-btn", "button", () => toggleStudentAttendanceExcluded(student.id)),
          button("삭제", "mini-btn danger", "button", () => deleteStudent(student.id)),
        ]),
      ]);
    });

  return el("div", { className: "grid" }, [
    panel("학생 등록", [form]),
    studentCountStatGroup(),
    table(
      ["번호", "이름", "반", "앱 등록", "등록 시간", "직렬", "성별", "출석", "관리"],
      rows.length ? rows : [el("tr", {}, [el("td", { colSpan: 9 }, el("div", { className: "empty table-empty" }, "등록된 학생이 없습니다."))])]
    ),
  ]);
}

function canCancelPenalty(penalty) {
  return canManagePenaltyDeletes() && Boolean(penalty?.id) && Boolean(String(penalty?.reason || "").trim());
}

function canManagePenaltyDeletes() {
  return isTeacherAdmin();
}

async function cancelPenalty(id) {
  const penalty = (state.penalties || []).find((item) => item.id === id);
  if (!canCancelPenalty(penalty)) return notify("삭제할 수 없는 상/벌점 내역입니다.");
  if (!confirm(`${penalty.studentName || "학생"} ${formatPenaltyPoints(penalty.points)} 내역을 삭제할까요?`)) return;

  const beforePenalties = [...(state.penalties || [])];
  try {
    await deletePenaltyFromTeacherApi(id);
    state.penalties = (state.penalties || []).filter((item) => item.id !== id);
    saveState({ skipRemote: true });
    closeInfoModal();
    render();
    notify("상/벌점 내역을 삭제했습니다.");
  } catch (error) {
    console.error(error);
    state.penalties = beforePenalties;
    render();
    notify("상/벌점 삭제를 서버에 저장하지 못했습니다.");
  }
}

async function deletePenaltyFromTeacherApi(id) {
  const response = await fetch("/api/penalties", {
    method: "DELETE",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  const data = await response.json().catch(() => ({ ok: false }));
  if (!response.ok || !data.ok) throw new Error(data.error || "penalty_delete_failed");
}

async function saveStudentsToRemote(studentIds) {
  if (!remoteStore) {
    await loadSupabaseSdk();
    remoteStore = createRemoteStore();
  }
  if (!remoteStore) return;
  const idSet = new Set(studentIds.map((id) => String(id || "").trim()).filter(Boolean));
  const rows = state.students
    .filter((student) => idSet.has(String(student.id || "").trim()) && student.id && student.name)
    .map((student) => ({
      id: student.id,
      name: student.name,
      class_name: student.className || state.settings.className || "오프라인반",
      track: normalizeCoastGuardTrack(student.track) || null,
      is_active: true,
      attendance_excluded: student.attendanceExcluded === true,
      created_at: student.createdAt || new Date().toISOString(),
    }));

  if (!rows.length) return;
  const { error } = await remoteStore.from("students").upsert(rows, { onConflict: "id", ignoreDuplicates: true });
  if (isMissingColumnError(error, "attendance_excluded")) {
    const fallbackRows = rows.map(({ attendance_excluded, ...row }) => row);
    const { error: fallbackError } = await remoteStore.from("students").upsert(fallbackRows, { onConflict: "id", ignoreDuplicates: true });
    if (fallbackError) throw fallbackError;
  } else if (isExpectedProfileRewriteError(error)) {
    const fallbackRows = rows.map(({ track, ...row }) => row);
    const { error: fallbackError } = await remoteStore.from("students").upsert(fallbackRows, { onConflict: "id", ignoreDuplicates: true });
    if (fallbackError) throw fallbackError;
  } else if (error) {
    throw error;
  }

  for (const row of rows) {
    const { error: updateError } = await remoteStore
      .from("students")
      .update({
        name: row.name,
        class_name: row.class_name,
        track: row.track,
        attendance_excluded: row.attendance_excluded,
      })
      .eq("id", row.id);
    if (isMissingColumnError(updateError, "attendance_excluded")) {
      const { error: fallbackError } = await remoteStore
        .from("students")
        .update({
          name: row.name,
          class_name: row.class_name,
          track: row.track,
        })
        .eq("id", row.id);
      if (isExpectedProfileRewriteError(fallbackError)) continue;
      if (fallbackError) throw fallbackError;
      continue;
    }
    if (isExpectedProfileRewriteError(updateError)) continue;
    if (updateError) throw updateError;
  }
}

function trackOptionAdminPanel() {
  const draftOptions = ensureTrackOptionDraft();
  const isDirty = isTrackOptionDraftDirty();
  const trackInput = input("trackOption", "text", "추가할 직렬명");
  const form = el("form", { className: "form-grid track-option-form" }, [
    field("직렬 항목 추가", trackInput),
    el("div", { className: "field" }, [
      el("span", {}, " "),
      button("항목 추가", "btn"),
    ]),
  ]);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const label = normalizeCoastGuardTrack(formData(form).trackOption);
    if (!label) return notify("추가할 직렬명을 입력해주세요.");
    if (label === "기타") return notify("기타는 기본 항목으로 이미 포함되어 있습니다.");
    if (draftOptions.includes(label)) return notify("이미 등록된 직렬 항목입니다.");

    trackOptionDraft = normalizeTrackOptionList([...draftOptions, label]);
    form.reset();
    render();
    notify("직렬 항목을 추가했습니다. 저장 버튼을 눌러 반영해주세요.");
  });

  const baseOptions = new Set(getBaseTrackOptions());
  const optionList = el("div", { className: "track-option-list" }, [
    ...draftOptions.map((option, index) => {
      const isBaseOption = baseOptions.has(option);
      const upButton = button("↑", "mini-btn", "button", () => moveTrackOption(option, -1));
      const downButton = button("↓", "mini-btn", "button", () => moveTrackOption(option, 1));
      upButton.disabled = index === 0;
      downButton.disabled = index === draftOptions.length - 1;
      return el("div", { className: "track-option-row" }, [
        el("div", { className: "track-option-order" }, String(index + 1)),
        el("div", { className: "track-option-name" }, [
          el("strong", {}, option),
          el("span", {}, isBaseOption ? "기본 항목" : "추가 항목"),
        ]),
        el("div", { className: "track-option-actions" }, [
          upButton,
          downButton,
          isBaseOption ? null : button("삭제", "mini-btn danger", "button", () => deleteTrackOption(option)),
        ].filter(Boolean)),
      ]);
    }),
    el("div", { className: "track-option-row fixed" }, [
      el("div", { className: "track-option-order" }, String(draftOptions.length + 1)),
      el("div", { className: "track-option-name" }, [
        el("strong", {}, "기타"),
        el("span", {}, "맨 아래 고정"),
      ]),
    ]),
  ]);
  const saveButton = button("저장", "btn", "button", saveTrackOptionDraft);
  saveButton.disabled = !isDirty;
  const resetButton = button("변경 취소", "btn secondary", "button", resetTrackOptionDraft);
  resetButton.disabled = !isDirty;

  return panel("직렬 항목 관리", [
    form,
    el("p", { className: "subtle" }, "이 순서대로 학생 등록 화면의 직렬 드롭다운에 표시됩니다. 기본 항목은 삭제할 수 없고, 기타는 항상 맨 아래에 고정됩니다."),
    optionList,
    el("div", { className: "track-option-savebar" }, [
      el("span", { className: isDirty ? "badge pending" : "badge approved" }, isDirty ? "저장 전 변경사항 있음" : "저장됨"),
      saveButton,
      resetButton,
    ]),
  ]);
}

function ensureTrackOptionDraft() {
  if (!Array.isArray(trackOptionDraft)) {
    trackOptionDraft = getCoastGuardTrackOptions().filter((option) => option !== "기타");
  }
  return trackOptionDraft;
}

function isTrackOptionDraftDirty() {
  const saved = getCoastGuardTrackOptions().filter((option) => option !== "기타");
  const draft = ensureTrackOptionDraft();
  return saved.length !== draft.length || saved.some((option, index) => option !== draft[index]);
}

function moveTrackOption(option, direction) {
  const label = normalizeCoastGuardTrack(option);
  const options = ensureTrackOptionDraft();
  const currentIndex = options.indexOf(label);
  const nextIndex = currentIndex + direction;
  if (currentIndex < 0 || nextIndex < 0 || nextIndex >= options.length) return;

  const nextOptions = [...options];
  [nextOptions[currentIndex], nextOptions[nextIndex]] = [nextOptions[nextIndex], nextOptions[currentIndex]];
  trackOptionDraft = normalizeTrackOptionList(nextOptions);
  render();
}

function deleteTrackOption(option) {
  const label = normalizeCoastGuardTrack(option);
  if (!label) return;
  trackOptionDraft = ensureTrackOptionDraft().filter((item) => item !== label);
  render();
  notify("직렬 항목을 목록에서 제외했습니다. 저장 버튼을 눌러 반영해주세요.");
}

function resetTrackOptionDraft() {
  trackOptionDraft = null;
  render();
  notify("직렬 항목 변경사항을 취소했습니다.");
}

async function saveTrackOptionDraft() {
  const nextOptions = normalizeTrackOptionList(ensureTrackOptionDraft());
  const previousCustomOptions = getCustomTrackOptions();
  const nextSet = new Set(nextOptions);
  const deletedCustomOptions = previousCustomOptions.filter((option) => !nextSet.has(option));
  state.settings.trackOptions = nextOptions;
  saveState({ skipRemote: true });

  if (remoteStore) {
    try {
      await saveTrackOptionsToRemote(nextOptions, deletedCustomOptions);
    } catch (error) {
      console.error(error);
      notify("직렬 항목을 로컬에 저장했지만 서버 저장에 실패했습니다. Supabase 설정을 확인해주세요.");
      render();
      return;
    }
  }

  trackOptionDraft = null;
  render();
  notify("직렬 항목을 저장했습니다.");
}

async function saveTrackOptionsToRemote(options, deletedOptions = []) {
  const rows = normalizeTrackOptionList(options)
    .filter((label) => label !== "기타")
    .map((label, index) => ({
      label,
      sort_order: index + 1,
      is_active: true,
      created_at: new Date().toISOString(),
    }));

  if (rows.length) {
    const { error } = await remoteStore.from("track_options").upsert(rows, { onConflict: "label" });
    if (isMissingColumnError(error, "sort_order")) {
      const fallbackRows = rows.map(({ sort_order, ...row }) => row);
      const { error: fallbackError } = await remoteStore.from("track_options").upsert(fallbackRows, { onConflict: "label" });
      if (fallbackError && !isMissingRelationError(fallbackError, "track_options")) throw fallbackError;
    } else if (error && !isMissingRelationError(error, "track_options")) {
      throw error;
    }
  }

  for (const label of deletedOptions) {
    const { error } = await remoteStore.from("track_options").update({ is_active: false }).eq("label", label);
    if (error && !isMissingRelationError(error, "track_options")) throw error;
  }
}

function managerAdminPanel() {
  const nameInput = input("name", "text", "담당자 이름");
  nameInput.required = true;
  const roleInput = input("role", "text", "예: 데스크, 담임, 장학생");
  const memoInput = textarea("memo", "메모 (선택)");
  const form = el("form", { className: "form-grid" }, [
    field("이름", nameInput),
    field("역할", roleInput),
    field("메모", memoInput, "full"),
    el("div", { className: "field full" }, [
      button("담당자 등록", "btn"),
      el("p", { className: "subtle" }, "등록한 담당자는 상/벌점 부여 화면의 담당자 선택 목록에 표시됩니다."),
    ]),
  ]);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!hasTeacherPermission("managers.write")) return notify("담당자 등록 권한이 없습니다.");
    const data = formData(form);
    const name = String(data.name || "").trim();
    if (!name) return notify("담당자 이름을 입력해주세요.");
    const beforeManagers = JSON.parse(JSON.stringify(state.managers || []));
    const submitButton = form.querySelector("button[type='submit']");
    submitButton.disabled = true;
    submitButton.textContent = "저장 중...";
    try {
      const result = upsertManager(data);
      await saveManagersToTeacherApi([managerToRemoteRow(result.manager)]);
      saveState({ skipRemote: true });
      form.reset();
      render();
      notify(result.created ? "담당자를 등록했습니다." : "기존 담당자 정보를 수정했습니다.");
    } catch (error) {
      console.error(error);
      state.managers = beforeManagers;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      notify("담당자를 서버에 저장하지 못했습니다. 잠시 후 다시 시도해주세요.");
      render();
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "담당자 등록";
    }
  });

  const rows = getActiveManagers().map((manager) =>
    el("tr", {}, [
      el("td", {}, manager.name),
      el("td", {}, manager.role || "-"),
      el("td", {}, manager.memo || "-"),
      el("td", {}, formatDateCompact(manager.createdAt)),
      el("td", { className: "student-admin-actions" }, [
        hasTeacherPermission("managers.write") ? button("삭제", "mini-btn danger", "button", () => deleteManager(manager.id)) : null,
      ]),
    ])
  );

  return el("div", { className: "grid" }, [
    panel("담당자 등록", [form]),
    table(
      ["이름", "역할", "메모", "등록일", "관리"],
      rows.length ? rows : [el("tr", {}, [el("td", { colSpan: 5 }, el("div", { className: "empty table-empty" }, "등록된 담당자가 없습니다."))])]
    ),
  ]);
}

function noticeAdminPanel() {
  const editingNotice = editingNoticeId ? getImportantNoticeById(editingNoticeId) : null;
  const titleInput = input("title", "text", "공지 제목", editingNotice?.title || "");
  titleInput.required = true;
  const bodyInput = el("textarea", {
    name: "body",
    placeholder: "공지 내용을 입력하세요.",
    rows: 8,
  }, editingNotice?.body || "");
  bodyInput.required = true;
  const publishedInput = el("input", { name: "isPublished", type: "checkbox", checked: editingNotice?.isPublished !== false });
  const submitButton = button(editingNotice ? "공지 수정" : "공지 등록", "btn");
  const formActions = [submitButton];
  if (editingNotice) {
    formActions.push(button("수정 취소", "btn secondary", "button", () => {
      editingNoticeId = "";
      render();
    }));
  }

  const form = el("form", { className: "form-grid notice-admin-form" }, [
    field("제목", titleInput, "full"),
    field("내용", bodyInput, "full"),
    el("label", { className: "notice-publish-toggle" }, [
      publishedInput,
      el("span", {}, "학생 홈에 공개"),
    ]),
    el("div", { className: "field full notice-form-actions" }, formActions),
  ]);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!hasTeacherPermission("notices.write")) return notify("공지 저장 권한이 없습니다.");
    const data = formData(form);
    const title = String(data.title || "").trim();
    const body = String(data.body || "").trim();
    if (!title || !body) return notify("공지 제목과 내용을 입력해주세요.");
    submitButton.disabled = true;
    submitButton.textContent = "저장 중...";
    const beforeNotices = JSON.parse(JSON.stringify(state.notices || []));
    try {
      upsertNotice({
        id: editingNotice?.id,
        title,
        body,
        isPublished: Boolean(data.isPublished),
      });
      const savedNotice = editingNotice?.id ? getImportantNoticeById(editingNotice.id) : state.notices[0];
      await saveNoticeToRemote(savedNotice, { update: Boolean(editingNotice?.id) });
      editingNoticeId = "";
      saveState({ skipRemote: true });
      render();
      notify(editingNotice ? "공지글을 수정했습니다." : "공지글을 등록했습니다.");
    } catch (error) {
      console.error(error);
      state.notices = beforeNotices;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      notify("공지글을 원격 저장소에 저장하지 못했습니다. Supabase notices 권한을 확인해주세요.");
      submitButton.disabled = false;
      submitButton.textContent = editingNotice ? "공지 수정" : "공지 등록";
      render();
    }
  });

  const rows = getImportantNotices()
    .map((notice) =>
      el("tr", {}, [
        el("td", { className: "wide-cell" }, [
          el("strong", {}, notice.title),
          notice.body ? el("p", { className: "notice-admin-preview" }, notice.body.replace(/\s+/g, " ").slice(0, 80)) : null,
        ]),
        el("td", {}, notice.isPublished !== false ? el("span", { className: "badge approved" }, "공개") : el("span", { className: "badge" }, "숨김")),
        el("td", {}, formatDateCompact(notice.createdAt)),
        el("td", { className: "student-admin-actions" }, [
          hasTeacherPermission("notices.write") ? button("수정", "mini-btn", "button", () => {
            editingNoticeId = notice.id;
            render();
          }) : null,
          hasTeacherPermission("notices.write") ? button("삭제", "mini-btn danger", "button", () => deleteNotice(notice.id)) : null,
        ]),
      ])
    );

  return el("div", { className: "grid" }, [
    panel(editingNotice ? "공지 수정" : "공지 등록", [form]),
    panel("공지 목록", [
      table(
        ["제목", "상태", "등록일", "관리"],
        rows.length ? rows : [el("tr", {}, [el("td", { colSpan: 4 }, el("div", { className: "empty table-empty" }, "등록된 공지글이 없습니다."))])]
      ),
    ]),
  ]);
}

function upsertNotice({ id, title, body, isPublished }) {
  state.notices = state.notices || [];
  const now = new Date().toISOString();
  const existing = id ? state.notices.find((notice) => notice.id === id) : null;
  if (existing) {
    existing.title = title;
    existing.body = body;
    existing.isPublished = isPublished;
    existing.updatedAt = now;
    return existing;
  }
  const notice = {
    id: createId(),
    title,
    body,
    isPublished,
    createdAt: now,
    updatedAt: now,
  };
  state.notices.unshift(notice);
  return notice;
}

async function deleteNotice(id) {
  if (!hasTeacherPermission("notices.write")) return notify("공지 삭제 권한이 없습니다.");
  const notice = getImportantNoticeById(id);
  if (!notice) return;
  if (!confirm(`"${notice.title}" 공지글을 삭제할까요?`)) return;
  try {
    await deleteNoticeFromRemote(id);
  } catch (error) {
    console.error(error);
    notify("공지글 삭제를 원격 저장소에 반영하지 못했습니다.");
    return;
  }

  state.notices = (state.notices || []).filter((item) => item.id !== id);
  if (editingNoticeId === id) editingNoticeId = "";
  saveState({ skipRemote: true });
  render();
  notify("공지글을 삭제했습니다.");
}

async function saveNoticeToRemote(notice, options = {}) {
  if (!remoteStore || !notice) return;
  const payload = {
    title: String(notice.title || "").trim(),
    body: String(notice.body || "").trim(),
    is_published: notice.isPublished !== false,
    updated_at: notice.updatedAt || new Date().toISOString(),
  };
  const result = options.update
    ? await remoteStore.from("notices").update(payload).eq("id", notice.id)
    : await remoteStore.from("notices").insert({
        id: notice.id,
        ...payload,
        created_at: notice.createdAt || new Date().toISOString(),
      });
  const { error } = result;
  if (error) throw error;
}

async function deleteNoticeFromRemote(id) {
  if (!remoteStore) return;
  const { error } = await remoteStore.from("notices").delete().eq("id", id);
  if (error) throw error;
}

function getActiveManagers() {
  return (state.managers || [])
    .filter((manager) => manager.isActive !== false && String(manager.name || "").trim())
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ko-KR"));
}

function managerNameControl() {
  const managers = getActiveManagers();
  const defaultName = String(teacherAuth.user?.username || "").trim();
  const options = managers.map((manager) => el("option", { value: manager.name }, manager.role ? `${manager.name} (${manager.role})` : manager.name));
  const node = el("select", { name: "managerName", required: true }, [
    el("option", { value: "" }, "담당자 선택"),
    ...options,
  ]);
  if (defaultName && managers.some((manager) => manager.name === defaultName)) node.value = defaultName;
  return node;
}

function isAdminManagerOption(manager) {
  const name = String(manager?.name || "").trim().toLowerCase();
  const role = String(manager?.role || "").trim().toLowerCase();
  return name === "admin" || role === "admin" || role === "관리자";
}

function upsertManager(data) {
  const name = String(data.name || "").trim();
  const role = String(data.role || "").trim();
  const memo = String(data.memo || "").trim();
  state.managers = state.managers || [];
  const existing = state.managers.find((manager) => manager.isActive !== false && manager.name === name);
  if (existing) {
    existing.role = role;
    existing.memo = memo;
    return { created: false, manager: existing };
  }
  const manager = {
    id: createId(),
    name,
    role,
    memo,
    isActive: true,
    createdAt: new Date().toISOString(),
  };
  state.managers.push(manager);
  return { created: true, manager };
}

function managerToRemoteRow(manager) {
  return {
    id: manager.id,
    name: manager.name,
    role: manager.role || null,
    memo: manager.memo || null,
    is_active: manager.isActive !== false,
    created_at: manager.createdAt || new Date().toISOString(),
  };
}

async function deleteManager(id) {
  const manager = (state.managers || []).find((item) => item.id === id);
  if (!manager) return;
  if (!confirm(`${manager.name} 담당자를 삭제할까요? 기존 상/벌점 기록의 담당자명은 유지됩니다.`)) return;
  const beforeManagers = JSON.parse(JSON.stringify(state.managers || []));
  manager.isActive = false;
  try {
    await deleteManagerFromTeacherApi(id);
    saveState({ skipRemote: true });
    render();
    notify("담당자를 삭제했습니다.");
  } catch (error) {
    console.error(error);
    state.managers = beforeManagers;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    render();
    notify("담당자 삭제를 서버에 저장하지 못했습니다.");
  }
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
  return normalizeCoastGuardTrack(profile?.initialTrack || profile?.track || student?.track);
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

function renderWeeklyExamManagement() {
  if (!hasTeacherPermission("grades.read")) return renderForbidden();
  const selectedLookupExam = weeklyExamMode === "lookup" && weeklyExamSelectedId
    ? getWeeklyExams().find((exam) => exam.id === weeklyExamSelectedId)
    : null;
  const cohortPanel = selectedLookupExam ? null : renderWeeklyExamCohortPanel();
  const allAnswerSections = getWeeklyExamAnswerSections();
  const answerExams = getWeeklyExams().filter((exam) => allAnswerSections.some((section) => section.examId === exam.id));
  if (weeklyExamMode === "answers" && !weeklyExamSelectedId && answerExams[0]) weeklyExamSelectedId = answerExams[0].id;
  const answerSections = weeklyExamMode === "answers" && !weeklyExamAnswerScoped && weeklyExamSelectedId
    ? allAnswerSections.filter((section) => section.examId === weeklyExamSelectedId)
    : allAnswerSections;
  const shouldResolveAnswerSection = weeklyExamMode !== "lookup";
  if (shouldResolveAnswerSection && !weeklyExamSelectedSectionId && answerSections[0]) weeklyExamSelectedSectionId = answerSections[0].id;
  const selectedSection = shouldResolveAnswerSection ? answerSections.find((section) => section.id === weeklyExamSelectedSectionId) || answerSections[0] || null : null;
  if (shouldResolveAnswerSection && selectedSection && weeklyExamSelectedSectionId !== selectedSection.id) weeklyExamSelectedSectionId = selectedSection.id;
  if (weeklyExamAnswerScoped && selectedSection) weeklyExamSelectedId = selectedSection.examId;

  if (weeklyExamMode === "lookup") {
    return el("div", { className: "grid weekly-exam-admin" }, [cohortPanel, renderWeeklyExamProblemLookupPanel()].filter(Boolean));
  }

  if (weeklyExamMode === "create" || !allAnswerSections.length) {
    return el("div", { className: "grid weekly-exam-admin" }, [cohortPanel, renderWeeklyExamCreatePanel()]);
  }

  return el("div", { className: "grid weekly-exam-admin" }, [
    cohortPanel,
    weeklyExamMode === "answers" && !weeklyExamAnswerScoped ? renderWeeklyExamAnswerWeekPanel(answerExams) : null,
    renderWeeklyExamAnswerPicker(answerSections, selectedSection),
  ].filter(Boolean));
}

function openWeeklyExamCreateView() {
  weeklyExamAnswerScoped = false;
  weeklyExamMode = "create";
  render();
}

function openWeeklyExamLookupView() {
  weeklyExamSelectedId = "";
  weeklyExamSelectedSectionId = "";
  weeklyExamAnswerScoped = false;
  weeklyExamMode = "lookup";
  render();
}

function openWeeklyExamAnswerView() {
  const sections = getWeeklyExamAnswerSections();
  if (!sections.length) return notify("답안을 입력할 주간평가 과목이 없습니다.");
  const exams = getWeeklyExams().filter((exam) => sections.some((section) => section.examId === exam.id));
  if (!weeklyExamSelectedId && exams[0]) weeklyExamSelectedId = exams[0].id;
  const weekSections = weeklyExamSelectedId ? sections.filter((section) => section.examId === weeklyExamSelectedId) : sections;
  if (!weekSections.some((section) => section.id === weeklyExamSelectedSectionId)) weeklyExamSelectedSectionId = weekSections[0]?.id || sections[0].id;
  weeklyExamAnswerScoped = false;
  weeklyExamMode = "answers";
  render();
}

function renderGradesManagement() {
  if (!hasTeacherPermission("grades.read")) return renderForbidden();
  const selected = selectedStudentCohortCount();
  const typeSelect = select("gradeType", ["weekly", "final"]);
  typeSelect.querySelector("option[value='weekly']").textContent = "주간평가";
  typeSelect.querySelector("option[value='final']").textContent = "파이널 모의고사";
  typeSelect.value = gradeManagementMode;
  typeSelect.addEventListener("change", () => {
    gradeManagementMode = typeSelect.value;
    render();
  });

  const trackOptions = getGradeManagementTrackOptions(selected.value);
  if (gradeManagementTrackFilter && !trackOptions.includes(gradeManagementTrackFilter)) gradeManagementTrackFilter = "";
  const trackSelect = select("track", trackOptions);
  trackSelect.querySelector("option[value='']").textContent = "전체 직렬";
  trackSelect.value = gradeManagementTrackFilter;
  trackSelect.addEventListener("change", () => {
    gradeManagementTrackFilter = trackSelect.value;
    render();
  });

  return el("div", { className: "grid grade-management" }, [
    el("div", { className: "stat-groups" }, [
      studentCountStatGroup(),
    ]),
    panel("성적 필터", [
      el("div", { className: "teacher-search grade-management-top-filter" }, [
        field("성적 구분", typeSelect),
        field("직렬", trackSelect),
      ]),
    ]),
    gradeManagementMode === "weekly"
      ? renderWeeklyExamScoresPanel(selected.value)
      : renderFinalMockScoresPanel(selected.value),
  ]);
}

function getGradeManagementTrackOptions(cohort = selectedStudentCohort) {
  const tracks = [
    ...getCoastGuardTrackOptions().filter((track) => track !== "기타"),
    ...getStudentsInCohort(cohort).map((student) => getTeacherStudentRegisteredTrack(student)),
  ]
    .map((track) => normalizeCoastGuardTrack(track))
    .filter((track) => track && track !== "기타")
    .filter((track, index, list) => list.indexOf(track) === index)
    .sort((a, b) => a.localeCompare(b, "ko-KR"));
  return ["", ...tracks];
}

function getGradeManagementStudents(cohort = selectedStudentCohort) {
  return getStudentsInCohort(cohort)
    .filter((student) => !gradeManagementTrackFilter || getTeacherStudentRegisteredTrack(student) === gradeManagementTrackFilter)
    .sort((a, b) => String(a.id).localeCompare(String(b.id), "ko-KR", { numeric: true }));
}

function getWeeklyExams() {
  const cohort = getSelectedWeeklyExamCohort();
  return [...(state.exams || [])]
    .filter((exam) => !cohort || String(exam.cohort || "") === cohort)
    .sort((a, b) => Number(b.weekNumber) - Number(a.weekNumber) || new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

function getSelectedWeeklyExamCohort() {
  const cohorts = getStudentCohortStats().filter((cohort) => cohort.value && cohort.value !== "미분류");
  if (!cohorts.length) {
    weeklyExamSelectedCohort = "";
    return "";
  }
  if (!cohorts.some((cohort) => cohort.value === weeklyExamSelectedCohort)) weeklyExamSelectedCohort = cohorts[0].value;
  return weeklyExamSelectedCohort;
}

function renderWeeklyExamCohortPanel() {
  const cohorts = getStudentCohortStats().filter((cohort) => cohort.value && cohort.value !== "미분류");
  if (!cohorts.length) {
    return panel("기수 선택", [el("div", { className: "empty" }, "등록된 학생 기수가 없습니다. 학생을 먼저 등록해주세요.")]);
  }
  const selected = getSelectedWeeklyExamCohort();
  const selectNode = el("select", { className: "cohort-select", ariaLabel: "주간평가 기수 선택" }, [
    cohorts.map((cohort) => el("option", { value: cohort.value }, cohort.label)),
  ]);
  selectNode.value = selected;
  selectNode.addEventListener("change", async () => {
    const nextCohort = selectNode.value;
    weeklyExamSelectedCohort = nextCohort;
    weeklyExamSelectedId = "";
    weeklyExamSelectedSectionId = "";
    weeklyExamAnswerScoped = false;
    render();
    await ensureWeeklyExamWeeksForCohort(nextCohort);
  });
  return panel("주간평가 필터", [
    el("div", { className: "teacher-search weekly-cohort-filter compact-filter" }, [
      field("기수", selectNode),
    ]),
    el("p", { className: "subtle" }, "새 기수는 학생 등록에서 해당 기수 학생을 등록하면 자동으로 추가됩니다."),
  ]);
}

function getExamSections(examId) {
  return (state.examSections || []).filter((section) => section.examId === examId).sort((a, b) => {
    const trackCompare = String(a.track || "").localeCompare(String(b.track || ""), "ko-KR");
    return trackCompare || String(a.subject || "").localeCompare(String(b.subject || ""), "ko-KR");
  });
}

function getWeeklyExamAnswerSections() {
  const examMap = new Map((state.exams || []).map((exam) => [exam.id, exam]));
  const subjectOrder = new Map(WEEKLY_EXAM_SUBJECTS.map((subject, index) => [subject, index]));
  return (state.examSections || [])
    .filter((section) => section.isActive !== false && examMap.has(section.examId))
    .map((section) => ({ ...section, exam: examMap.get(section.examId) }))
    .sort((a, b) => {
      const weekCompare = Number(b.exam?.weekNumber || 0) - Number(a.exam?.weekNumber || 0);
      if (weekCompare) return weekCompare;
      const subjectCompare = (subjectOrder.get(a.subject) ?? 999) - (subjectOrder.get(b.subject) ?? 999);
      if (subjectCompare) return subjectCompare;
      return String(a.subject || "").localeCompare(String(b.subject || ""), "ko-KR");
    });
}

function getTrackSubjectSuggestions(track) {
  return getWeeklyExamSubjectSettings()
    .filter((section) => !track || section.track === track)
    .map((section) => section.subject)
    .filter(Boolean)
    .filter((subject, index, subjects) => subjects.indexOf(subject) === index);
}

function getWeeklyExamSubjectSettings() {
  const saved = Array.isArray(state.examSubjectSettings) ? state.examSubjectSettings : [];
  const source = saved.length
    ? saved
    : (state.examSections || []).map((section, index) => ({
        id: `derived-${section.track}-${section.subject}`,
        track: section.track,
        subject: section.subject,
        questionCount: section.questionCount || 20,
        totalScore: section.totalScore || 100,
        isActive: section.isActive !== false,
        sortOrder: index + 1,
        createdAt: section.createdAt || "",
        updatedAt: section.createdAt || "",
      }));
  const map = new Map();
  source.forEach((setting, index) => {
    const track = normalizeCoastGuardTrack(setting.track);
    const subject = String(setting.subject || "").trim();
    if (!track || !subject) return;
    const key = `${track}|||${subject}`;
    if (!map.has(key)) {
      map.set(key, {
        ...setting,
        id: setting.id && !String(setting.id).startsWith("derived-") ? setting.id : createId(),
        track,
        subject,
        questionCount: Number(setting.questionCount) || 20,
        totalScore: Number(setting.totalScore) || 100,
        isActive: setting.isActive !== false,
        sortOrder: Number(setting.sortOrder) || index + 1,
        createdAt: setting.createdAt || new Date().toISOString(),
        updatedAt: setting.updatedAt || setting.createdAt || new Date().toISOString(),
      });
    }
  });
  return [...map.values()].sort((a, b) => {
    const trackCompare = String(a.track).localeCompare(String(b.track), "ko-KR");
    return trackCompare || Number(a.sortOrder) - Number(b.sortOrder) || String(a.subject).localeCompare(String(b.subject), "ko-KR");
  });
}

async function ensureWeeklyExamWeeksForCohort(cohort, options = {}) {
  const selectedCohort = String(cohort || "").trim();
  if (!selectedCohort || weeklyExamAutoCreatingCohorts.has(selectedCohort)) return [];
  weeklyExamAutoCreatingCohorts.add(selectedCohort);
  try {
    const createdExams = [];
    const createdSections = [];
    for (let week = 1; week <= WEEKLY_EXAM_WEEK_COUNT; week += 1) {
      const existing = (state.exams || []).find((exam) => String(exam.cohort || "") === selectedCohort && Number(exam.weekNumber) === week);
      if (existing) continue;
      const now = new Date().toISOString();
      const exam = {
        id: createId(),
        cohort: selectedCohort,
        weekNumber: week,
        name: formatWeeklyExamName(week, selectedCohort),
        startAt: "",
        endAt: "",
        targetTracks: [WEEKLY_EXAM_TRACK_ALL],
        isPublished: true,
        scoreReleaseMode: "after_all_submitted",
        explanationReleaseMode: "after_all_submitted",
        createdAt: now,
        updatedAt: now,
      };
      state.exams = [exam, ...(state.exams || [])];
      WEEKLY_EXAM_SUBJECTS.forEach((subject) => {
        const section = createLocalExamSection(exam, WEEKLY_EXAM_TRACK_ALL, subject, {
          questionCount: 20,
          totalScore: 100,
          isActive: true,
        });
        if (section) createdSections.push(section);
      });
      createdExams.push(exam);
    }
    if (!createdExams.length) {
      if (!options.silent) notify(`${selectedCohort}기는 이미 1~${WEEKLY_EXAM_WEEK_COUNT}주차 주간평가가 있습니다.`);
      return [];
    }
    weeklyExamSelectedId = "";
    weeklyExamSelectedSectionId = "";
    weeklyExamMode = "lookup";
    saveState({ skipRemote: true });
    for (const exam of createdExams) await saveWeeklyExamToRemote(exam);
    await saveExamSectionsToRemote(createdSections);
    render();
    if (!options.silent) notify(`${selectedCohort}기 주간평가 ${createdExams.length}개 주차를 생성했습니다.`);
    return createdExams;
  } catch (error) {
    console.error(error);
    notify("주간평가 저장 중 오류가 발생했습니다. Supabase 스키마 적용 여부를 확인해주세요.");
    return [];
  } finally {
    weeklyExamAutoCreatingCohorts.delete(selectedCohort);
  }
}

function renderWeeklyExamCreatePanel() {
  const cohort = getSelectedWeeklyExamCohort();
  const form = el("form", { className: "form-grid weekly-exam-form" }, [
    el("div", { className: "field full" }, [button(`${cohort || ""}기 1~${WEEKLY_EXAM_WEEK_COUNT}주차 주간평가 생성`, "btn")]),
  ]);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const selectedCohort = getSelectedWeeklyExamCohort();
    if (!selectedCohort) return notify("기수를 먼저 선택해주세요.");
    await ensureWeeklyExamWeeksForCohort(selectedCohort);
  });
  return panel("주간평가 생성", [form]);
}

function formatWeeklyExamName(weekNumber, cohort = "") {
  return `${cohort ? `${cohort}기 ` : ""}${Number(weekNumber) || 1}주차 주간평가`;
}

function renderWeeklyExamProblemLookupPanel() {
  const exams = getWeeklyExams();
  if (!exams.length) {
    return panel("주간평가 문제 조회", [
      el("div", { className: "empty" }, "조회할 주간평가가 없습니다. 주간평가를 먼저 생성해주세요."),
    ]);
  }
  const selectedExam = exams.find((exam) => exam.id === weeklyExamSelectedId) || null;
  if (selectedExam) return renderWeeklyExamProblemDetailPanel(selectedExam);

  const rows = Array.from({ length: 12 }, (_, index) => {
    const weekNumber = index + 1;
    const exam = exams.find((item) => Number(item.weekNumber) === weekNumber);
    const sections = exam ? getExamSections(exam.id) : [];
    const publishedCount = sections.filter(isWeeklyExamSectionPublished).length;
    return el("tr", { className: exam ? "" : "weekly-unpublished-row" }, [
      el("td", {}, `${weekNumber}주차 주간평가`),
      el("td", {}, exam ? `${publishedCount}/${WEEKLY_EXAM_SUBJECTS.length}` : "-"),
      el("td", {}, exam ? formatWeeklyExamPeriod(exam) : "-"),
      el("td", {}, exam ? renderWeeklyExamRoundFileUpload(exam, sections) : "-"),
      el("td", { className: "action-cell" }, exam
        ? button("관리", "mini-btn", "button", () => openWeeklyExamProblemDetail(exam.id))
        : el("span", { className: "subtle" }, "미생성")),
    ]);
  });

  return panel("주간평가 문제 조회", [
    el("div", { className: "action-row weekly-lookup-actions" }, [
      button("주간평가 과목 설정", "btn secondary", "button", openWeeklyExamSubjectSettingsModal),
    ]),
    table(["주간평가", "출제 현황", "응시 시작", "답안지 업로드", "관리"], rows),
  ]);
}

function openWeeklyExamProblemDetail(examId, options = {}) {
  weeklyExamMode = "lookup";
  weeklyExamSelectedId = examId;
  weeklyExamSelectedSectionId = "";
  weeklyExamAnswerScoped = false;
  if (!options.skipHistory && history?.pushState) {
    history.pushState({ weeklyExamView: WEEKLY_EXAM_HISTORY_DETAIL, examId }, "", "#weekly-exams");
  }
  render();
  scrollAppToTop();
}

function closeWeeklyExamProblemDetail(options = {}) {
  weeklyExamSelectedId = "";
  weeklyExamSelectedSectionId = "";
  if (!options.skipHistory && history?.state?.weeklyExamView === WEEKLY_EXAM_HISTORY_DETAIL) {
    history.replaceState(null, "", "#weekly-exams");
  }
  render();
}

window.addEventListener("popstate", (event) => {
  if (APP_MODE !== "teacher" || location.hash.replace("#", "") !== "weekly-exams") return;
  if (event.state?.weeklyExamView === WEEKLY_EXAM_HISTORY_DETAIL && event.state.examId) {
    weeklyExamMode = "lookup";
    weeklyExamSelectedId = event.state.examId;
    weeklyExamSelectedSectionId = "";
    weeklyExamAnswerScoped = false;
    return;
  }
  if (weeklyExamMode === "lookup") {
    weeklyExamSelectedId = "";
    weeklyExamSelectedSectionId = "";
    weeklyExamAnswerScoped = false;
    requestAnimationFrame(render);
  }
});

function renderWeeklyExamProblemDetailPanel(selectedExam) {
  const startInput = input("startDate", "date", "", formatDateLocalInput(selectedExam.startAt));
  const periodForm = el("form", { className: "form-grid weekly-exam-period-form" }, [
    field("응시 시작일", startInput, "", "선택한 날짜 오전 9시에 시작됩니다."),
    el("div", { className: "field" }, [el("span", {}, " "), button("응시 기간 저장", "btn secondary")]),
  ]);
  periodForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = formData(periodForm);
    selectedExam.startAt = buildWeeklyExamStartAt(data.startDate);
    selectedExam.endAt = "";
    selectedExam.updatedAt = new Date().toISOString();
    saveState({ skipRemote: true });
    await saveWeeklyExamToRemote(selectedExam);
    render();
    notify("응시 시작일을 저장했습니다.");
  });

  const sections = getExamSections(selectedExam.id);
  const rows = WEEKLY_EXAM_SUBJECTS.map((subject) => {
    const section = sections.find((item) => item.subject === subject);
    const answerCount = section ? countEnteredSectionAnswers(section) : 0;
    const isPublished = Boolean(section && isWeeklyExamSectionPublished(section));
    return el("tr", { className: isPublished ? "" : "weekly-unpublished-row" }, [
      el("td", {}, subject),
      el("td", {}, section && section.isActive === false
        ? el("span", { className: "badge pending" }, "미사용")
        : el("span", { className: isPublished ? "badge approved" : "badge pending" }, isPublished ? "출제됨" : "미출제")),
      el("td", {}, section ? `${section.questionCount || 20}문항` : "-"),
      el("td", {}, section ? `${answerCount}/${section.questionCount || 20}` : "-"),
      el("td", { className: "action-cell" }, section ? [
        button("답안 입력", "mini-btn", "button", () => {
          openWeeklyExamAnswerModal(section.id);
        }),
        button("삭제", "mini-btn danger", "button", () => deleteWeeklyExamSection(section.id)),
      ].filter(Boolean) : "-"),
    ]);
  });

  return el("section", { className: "panel weekly-exam-detail-panel" }, [
    el("div", { className: "panel-title-row weekly-detail-title-row" }, [
      el("h2", {}, formatWeeklyExamName(selectedExam.weekNumber, selectedExam.cohort)),
      button("주간평가 목록", "btn secondary", "button", () => closeWeeklyExamProblemDetail()),
    ]),
    periodForm,
    table(["과목", "출제 여부", "문항", "정답 입력", "관리"], rows),
  ]);
}

function renderWeeklyExamRoundFileUpload(exam, sections) {
  const activeSections = sections.filter((section) => section.isActive !== false);
  const sectionIds = new Set(activeSections.map((section) => section.id));
  const files = getWeeklyExamRoundFiles(sectionIds);
  const inputNode = el("input", { type: "file", accept: "application/pdf", multiple: true, className: "visually-hidden-file" });
  const uploadButton = button(files.length ? "추가" : "업로드", "mini-btn", "button", () => inputNode.click());
  inputNode.addEventListener("change", () => uploadWeeklyExamRoundAnswerFiles(exam, activeSections, inputNode.files));
  return el("div", { className: "weekly-inline-file-upload" }, [
    files.length
      ? el("div", { className: "weekly-inline-file-list" }, files.map((file) =>
          el("div", { className: "weekly-inline-file-row" }, [
            el("span", { title: file.originalName || "" }, file.originalName || "답안지"),
            file.fileUrl ? el("a", { href: file.fileUrl, target: "_blank", rel: "noreferrer", className: "mini-btn" }, "열기") : null,
            button("삭제", "mini-btn danger", "button", () => deleteWeeklyExamRoundAnswerFile(file, activeSections)),
          ].filter(Boolean))
        ))
      : el("span", {}, "미업로드"),
    el("div", { className: "weekly-inline-file-actions" }, [
      uploadButton,
      inputNode,
    ]),
  ]);
}

function getWeeklyExamRoundFiles(sectionIds) {
  const grouped = new Map();
  (state.examFiles || [])
    .filter((item) => sectionIds.has(item.examSectionId) && item.fileType === "answer_pdf")
    .forEach((file) => {
      const key = file.filePath || file.fileUrl || `${file.originalName || ""}::${file.uploadedAt || ""}`;
      if (!grouped.has(key)) grouped.set(key, { ...file, ids: [] });
      grouped.get(key).ids.push(file.id);
    });
  return [...grouped.values()].sort((a, b) => new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0));
}

async function uploadWeeklyExamRoundAnswerFiles(exam, sections, fileList) {
  if (!sections.length) return notify("답안지를 연결할 출제 과목이 없습니다.");
  const files = Array.from(fileList || []);
  if (!files.length) return notify("업로드할 PDF 파일을 선택해주세요.");
  if (files.some((file) => file.type !== "application/pdf")) return notify("PDF 파일만 업로드할 수 있습니다.");

  const createdRows = [];

  if (!remoteStore) {
    files.forEach((file) => {
      const uploadedAt = new Date().toISOString();
      sections.forEach((section) => {
        createdRows.push({
          id: createId(),
          examSectionId: section.id,
          fileType: "answer_pdf",
          filePath: "",
          fileUrl: "",
          originalName: file.name,
          uploadedAt,
        });
      });
    });
    state.examFiles = [...(state.examFiles || []), ...createdRows];
    saveState({ skipRemote: true });
    render();
    return notify(`로컬에 답안지 ${files.length}개 파일명을 저장했습니다. Supabase 연결 후 실제 업로드가 가능합니다.`);
  }

  for (const [index, file] of files.entries()) {
    const uploadedAt = new Date().toISOString();
    const path = `${exam.id}/round-answer-${Date.now()}-${index}-${sanitizeStorageFileName(file.name)}`;
    const { error: uploadError } = await remoteStore.storage.from("exam-files").upload(path, file, { upsert: true, contentType: "application/pdf" });
    if (uploadError) return notify("파일 업로드에 실패했습니다.");
    const { data } = remoteStore.storage.from("exam-files").getPublicUrl(path);
    sections.forEach((section) => {
      createdRows.push({
        id: createId(),
        examSectionId: section.id,
        fileType: "answer_pdf",
        filePath: path,
        fileUrl: data?.publicUrl || "",
        originalName: file.name,
        uploadedAt,
      });
    });
  }
  state.examFiles = [...(state.examFiles || []), ...createdRows];
  await saveExamFilesToRemote(createdRows);
  saveState({ skipRemote: true });
  render();
  notify(`회차 답안지 ${files.length}개를 업로드했습니다.`);
}

function sanitizeStorageFileName(name) {
  return String(name || "answer.pdf").replace(/[^\w.\-가-힣]/g, "_").slice(0, 120) || "answer.pdf";
}

async function deleteWeeklyExamRoundAnswerFile(file, sections) {
  if (!file) return;
  if (!confirm(`${file.originalName || "답안지"} 파일을 삭제할까요?`)) return;
  const sectionIds = new Set(sections.map((section) => section.id));
  const targets = (state.examFiles || []).filter((item) =>
    sectionIds.has(item.examSectionId) &&
    item.fileType === "answer_pdf" &&
    ((file.filePath && item.filePath === file.filePath) || (!file.filePath && item.originalName === file.originalName && item.uploadedAt === file.uploadedAt))
  );
  try {
    if (remoteStore) {
      const paths = [...new Set(targets.map((item) => item.filePath).filter(Boolean))];
      if (paths.length) await remoteStore.storage.from("exam-files").remove(paths);
      await deleteExamFilesFromRemote(targets.map((item) => item.id));
    }
    const targetIds = new Set(targets.map((item) => item.id));
    state.examFiles = (state.examFiles || []).filter((item) => !targetIds.has(item.id));
    saveState({ skipRemote: true });
    render();
    notify("답안지를 삭제했습니다.");
  } catch (error) {
    console.error(error);
    notify("답안지 삭제 중 오류가 발생했습니다. Supabase 삭제 권한을 확인해주세요.");
  }
}

function formatDateLocalInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 10);
}

function buildWeeklyExamStartAt(dateKey) {
  if (!dateKey) return "";
  const date = new Date(`${dateKey}T09:00:00`);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function formatWeeklyExamPeriod(exam) {
  if (!exam.startAt) return "미설정";
  return `${formatDateCompact(exam.startAt)} 시작`;
}

function renderWeeklyExamAnswerWeekPanel(exams) {
  const examSelect = select("examId", exams.map((exam) => exam.id));
  examSelect.querySelectorAll("option").forEach((option) => {
    const exam = exams.find((item) => item.id === option.value);
    if (exam) option.textContent = formatWeeklyExamName(exam.weekNumber);
  });
  examSelect.value = weeklyExamSelectedId || exams[0]?.id || "";
  examSelect.addEventListener("change", () => {
    weeklyExamSelectedId = examSelect.value;
    const firstSection = getWeeklyExamAnswerSections().find((section) => section.examId === weeklyExamSelectedId);
    weeklyExamSelectedSectionId = firstSection?.id || "";
    render();
  });
  return panel("답안 입력 주차 선택", [
    el("div", { className: "teacher-search weekly-answer-week-filter" }, [field("주차", examSelect)]),
  ]);
}

function countEnteredSectionAnswers(section) {
  return getSectionAnswers(section.id).filter((answer) => answer.correctAnswer).length;
}

function isWeeklyExamSectionPublished(section) {
  return section.isActive !== false && countEnteredSectionAnswers(section) >= (Number(section.questionCount) || 20);
}

function openWeeklyExamSubjectSettingsModal() {
  openInfoModal({
    title: "직렬별 과목 설정",
    className: "weekly-subject-settings-modal",
    content: renderWeeklyExamSubjectSettingsPanel({ modal: true }),
  });
}

function renderWeeklyExamSubjectSettingsPanel(options = {}) {
  const settings = getWeeklyExamSubjectSettings();
  const trackSelect = select("track", getCoastGuardTrackOptions().filter((track) => track !== "기타"));
  const subjectInput = input("subject", "text", "예: 형사법");
  const questionInput = input("questionCount", "number", "20", "20");
  const scoreInput = input("totalScore", "number", "100", "100");
  questionInput.min = "1";
  scoreInput.min = "1";
  const form = el("form", { className: "form-grid" }, [
    field("직렬", trackSelect),
    field("과목", subjectInput),
    field("문항 수", questionInput),
    field("총점", scoreInput),
    el("div", { className: "field" }, [el("span", {}, " "), button("과목 추가/수정", "btn secondary")]),
  ]);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = formData(form);
    const setting = upsertWeeklyExamSubjectSetting({
      track: normalizeCoastGuardTrack(data.track),
      subject: data.subject,
      questionCount: data.questionCount,
      totalScore: data.totalScore,
      isActive: true,
    });
    if (!setting) return notify("직렬과 과목명을 입력해주세요.");
    await saveExamSubjectSettingsToRemote([setting]);
    saveState({ skipRemote: true });
    if (options.modal) {
      closeInfoModal();
      openWeeklyExamSubjectSettingsModal();
    } else {
      render();
    }
    notify("직렬별 과목 설정을 저장했습니다.");
  });

  const rows = settings.map((setting) => el("tr", {}, [
    el("td", {}, setting.track),
    el("td", {}, setting.subject),
    el("td", {}, `${setting.questionCount}문항`),
    el("td", {}, `${setting.totalScore}점`),
    el("td", {}, setting.isActive ? "사용" : "미사용"),
    el("td", { className: "action-cell" }, [
      button("수정", "mini-btn", "button", () => editWeeklyExamSubjectSetting(setting.id, options)),
      button("삭제", "mini-btn danger", "button", () => deleteWeeklyExamSubjectSetting(setting.id, options)),
      button(setting.isActive ? "미사용" : "사용", "mini-btn", "button", async () => {
        setting.isActive = !setting.isActive;
        setting.updatedAt = new Date().toISOString();
        state.examSubjectSettings = getWeeklyExamSubjectSettings().map((item) => item.id === setting.id ? setting : item);
        saveState({ skipRemote: true });
        await saveExamSubjectSettingsToRemote([setting]);
        if (options.modal) {
          closeInfoModal();
          openWeeklyExamSubjectSettingsModal();
        } else {
          render();
        }
      }),
    ]),
  ]));

  return el("div", { className: "weekly-subject-settings" }, [
    el("p", { className: "subtle" }, "여기서 설정한 과목이 새 주간평가 생성 시 직렬별 시험 과목으로 자동 생성됩니다. 학생은 최초 등록한 본인 직렬의 과목만 봅니다."),
    form,
    table(["직렬", "과목", "문항", "총점", "상태", "관리"], rows.length ? rows : [el("tr", {}, [el("td", { colSpan: 6 }, el("div", { className: "empty table-empty" }, "등록된 직렬별 과목이 없습니다."))])]),
  ]);
}

function upsertWeeklyExamSubjectSetting(payload) {
  const track = normalizeCoastGuardTrack(payload.track);
  const subject = String(payload.subject || "").trim();
  if (!track || !subject) return null;
  const settings = getWeeklyExamSubjectSettings();
  const existing = settings.find((setting) => setting.track === track && setting.subject === subject);
  const now = new Date().toISOString();
  const next = {
    ...(existing || {}),
    id: existing?.id || createId(),
    track,
    subject,
    questionCount: Number(payload.questionCount) || existing?.questionCount || 20,
    totalScore: Number(payload.totalScore) || existing?.totalScore || 100,
    isActive: payload.isActive !== false,
    sortOrder: existing?.sortOrder || settings.filter((setting) => setting.track === track).length + 1,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  state.examSubjectSettings = [...settings.filter((setting) => setting.id !== next.id), next];
  return next;
}

async function editWeeklyExamSubjectSetting(settingId, options = {}) {
  const setting = getWeeklyExamSubjectSettings().find((item) => item.id === settingId);
  if (!setting) return;
  const subject = prompt("과목명", setting.subject);
  if (subject === null) return;
  const questionCount = prompt("문항 수", String(setting.questionCount));
  if (questionCount === null) return;
  const totalScore = prompt("총점", String(setting.totalScore));
  if (totalScore === null) return;
  const next = upsertWeeklyExamSubjectSetting({
    ...setting,
    subject,
    questionCount,
    totalScore,
    isActive: setting.isActive,
  });
  if (!next) return notify("과목명을 입력해주세요.");
  await saveExamSubjectSettingsToRemote([next]);
  saveState({ skipRemote: true });
  if (options.modal) {
    closeInfoModal();
    openWeeklyExamSubjectSettingsModal();
  } else {
    render();
  }
  notify("과목 설정을 수정했습니다.");
}

async function deleteWeeklyExamSubjectSetting(settingId, options = {}) {
  const setting = getWeeklyExamSubjectSettings().find((item) => item.id === settingId);
  if (!setting) return;
  if (!confirm(`${setting.track} / ${setting.subject} 과목 설정을 삭제할까요?`)) return;
  state.examSubjectSettings = (state.examSubjectSettings || []).filter((item) => item.id !== setting.id);
  saveState({ skipRemote: true });
  await deleteExamSubjectSettingFromRemote(setting.id);
  if (options.modal) {
    closeInfoModal();
    openWeeklyExamSubjectSettingsModal();
  } else {
    render();
  }
  notify("과목 설정을 삭제했습니다.");
}

function renderTrackSubjectManagement() {
  if (!hasTeacherPermission("grades.read")) return renderForbidden();
  const tracks = getCoastGuardTrackOptions().filter((track) => track !== "기타");
  const activeSettings = new Set(
    (state.examSubjectSettings || [])
      .filter((setting) => setting.isActive !== false)
      .map((setting) => `${normalizeCoastGuardTrack(setting.track)}|||${String(setting.subject || "").trim()}`)
  );
  const hasSavedByTrack = new Set((state.examSubjectSettings || []).map((setting) => normalizeCoastGuardTrack(setting.track)));
  const form = el("form", { className: "track-subject-management" }, [
    table(
      ["직렬", ...WEEKLY_SUBJECT_OPTIONS],
      tracks.map((track) => {
        const normalizedTrack = normalizeCoastGuardTrack(track);
        const defaultSubjects = getDefaultWeeklySubjectsForTrack(normalizedTrack);
        return el("tr", {}, [
          el("th", {}, normalizedTrack),
          ...WEEKLY_SUBJECT_OPTIONS.map((subject) => {
            const checked = hasSavedByTrack.has(normalizedTrack)
              ? activeSettings.has(`${normalizedTrack}|||${subject}`)
              : defaultSubjects.includes(subject);
            return el("td", {}, el("label", { className: "track-subject-check" }, [
              el("input", { type: "checkbox", name: `${normalizedTrack}|||${subject}`, checked }),
              el("span", {}, "응시"),
            ]));
          }),
        ]);
      })
    ),
    el("div", { className: "action-row weekly-answer-actions" }, [
      button("응시과목 저장", "btn"),
      button("기본값 다시 적용", "btn secondary", "button", () => resetTrackSubjectDefaults(form, tracks)),
    ]),
  ]);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const now = new Date().toISOString();
    const existing = new Map((state.examSubjectSettings || []).map((setting) => [`${normalizeCoastGuardTrack(setting.track)}|||${String(setting.subject || "").trim()}`, setting]));
    const nextSettings = tracks.flatMap((track) => {
      const normalizedTrack = normalizeCoastGuardTrack(track);
      return WEEKLY_SUBJECT_OPTIONS.map((subject, index) => {
        const key = `${normalizedTrack}|||${subject}`;
        const current = existing.get(key);
        const checked = Boolean(form.querySelector(`input[name="${CSS.escape(key)}"]`)?.checked);
        return {
          ...(current || {}),
          id: current?.id || createId(),
          track: normalizedTrack,
          subject,
          questionCount: current?.questionCount || 20,
          totalScore: current?.totalScore || 100,
          isActive: checked,
          sortOrder: index + 1,
          createdAt: current?.createdAt || now,
          updatedAt: now,
        };
      });
    });
    state.examSubjectSettings = nextSettings;
    saveState({ skipRemote: true });
    await saveExamSubjectSettingsToRemote(nextSettings);
    render();
    notify("직렬별 응시과목을 저장했습니다.");
  });
  return panel("직렬별 응시과목 관리", [
    el("p", { className: "subtle" }, "학생에게 보일 주간평가 과목을 직렬별로 설정합니다. 저장 전에는 기본 매칭값이 적용됩니다."),
    form,
  ]);
}

function resetTrackSubjectDefaults(form, tracks) {
  tracks.forEach((track) => {
    const normalizedTrack = normalizeCoastGuardTrack(track);
    const defaultSubjects = getDefaultWeeklySubjectsForTrack(normalizedTrack);
    WEEKLY_SUBJECT_OPTIONS.forEach((subject) => {
      const key = `${normalizedTrack}|||${subject}`;
      const checkbox = form.querySelector(`input[name="${CSS.escape(key)}"]`);
      if (checkbox) checkbox.checked = defaultSubjects.includes(subject);
    });
  });
}

function mapReleaseMode(label) {
  if (label === "비공개") return "hidden";
  if (label === "과목 제출 즉시") return "after_submit";
  return "after_all_submitted";
}

function formatReleaseMode(mode) {
  if (mode === "hidden") return "비공개";
  if (mode === "after_submit") return "과목 제출 즉시";
  return "모든 과목 제출 후";
}

function createLocalExamSection(exam, track, subject, options = {}) {
  const exists = (state.examSections || []).some((section) => section.examId === exam.id && section.track === track && section.subject === subject);
  if (exists) return null;
  const section = {
    id: createId(),
    examId: exam.id,
    track,
    subject,
    questionCount: Number(options.questionCount) || 20,
    totalScore: Number(options.totalScore) || 100,
    isActive: options.isActive !== false,
    createdAt: new Date().toISOString(),
  };
  state.examSections = [...(state.examSections || []), section];
  state.examAnswers = [
    ...(state.examAnswers || []),
    ...Array.from({ length: section.questionCount }, (_, index) => ({
      id: createId(),
      examSectionId: section.id,
      questionNumber: index + 1,
      correctAnswer: 0,
      points: 5,
      targetTracks: getDefaultWeeklyQuestionTargetTracks(),
    })),
  ];
  return section;
}

function renderWeeklyExamListPanel(exams, selectedExam) {
  const rows = exams.map((exam) => el("tr", { className: selectedExam?.id === exam.id ? "selected-row" : "" }, [
    el("td", {}, button(formatWeeklyExamName(exam.weekNumber), "link-btn", "button", () => {
      weeklyExamSelectedId = exam.id;
      weeklyExamSelectedSectionId = "";
      render();
    })),
    el("td", {}, `${exam.weekNumber}주차`),
    el("td", {}, `${getExamSections(exam.id).length}개`),
    el("td", {}, exam.isPublished ? el("span", { className: "badge approved" }, "공개") : el("span", { className: "badge pending" }, "비공개")),
    el("td", {}, `${formatReleaseMode(exam.scoreReleaseMode)} / ${formatReleaseMode(exam.explanationReleaseMode)}`),
    el("td", {}, button(exam.isPublished ? "비공개" : "공개", "mini-btn", "button", async () => {
      exam.isPublished = !exam.isPublished;
      exam.updatedAt = new Date().toISOString();
      saveState({ skipRemote: true });
      await saveWeeklyExamToRemote(exam);
      render();
    })),
  ]));
  return panel("주간평가 목록", [
    table(["주간평가", "주차", "과목 수", "상태", "공개 방식", "관리"], rows.length ? rows : [el("tr", {}, [el("td", { colSpan: 6 }, el("div", { className: "empty table-empty" }, "등록된 주간평가가 없습니다."))])]),
  ]);
}

function renderWeeklyExamSectionPanel(exam, sections) {
  const trackSelect = select("track", getCoastGuardTrackOptions().filter((track) => track !== "기타"));
  const subjectInput = input("subject", "text", "과목명");
  const questionInput = input("questionCount", "number", "20", "20");
  const scoreInput = input("totalScore", "number", "100", "100");
  const form = el("form", { className: "form-grid" }, [
    field("직렬", trackSelect),
    field("과목", subjectInput),
    field("문항 수", questionInput),
    field("총점", scoreInput),
    el("div", { className: "field" }, [el("span", {}, " "), button("과목 추가", "btn secondary")]),
  ]);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = formData(form);
    const section = createLocalExamSection(exam, normalizeCoastGuardTrack(data.track), String(data.subject || "").trim());
    if (!section) return notify("이미 같은 직렬/과목이 있습니다.");
    section.questionCount = Number(data.questionCount) || 20;
    section.totalScore = Number(data.totalScore) || 100;
    resetSectionAnswerRows(section);
    weeklyExamSelectedSectionId = section.id;
    saveState({ skipRemote: true });
    await saveExamSectionsToRemote([section]);
    await saveExamAnswersToRemote(getSectionAnswers(section.id));
    render();
  });
  const rows = sections.map((section) => el("tr", { className: weeklyExamSelectedSectionId === section.id ? "selected-row" : "" }, [
    el("td", {}, button(section.subject, "link-btn", "button", () => {
      weeklyExamSelectedSectionId = section.id;
      render();
    })),
    el("td", {}, `${section.questionCount}문항`),
    el("td", {}, `${section.totalScore}점`),
    el("td", {}, section.isActive ? "사용" : "미사용"),
    el("td", {}, button(section.isActive ? "미사용" : "사용", "mini-btn", "button", async () => {
      section.isActive = !section.isActive;
      saveState({ skipRemote: true });
      await saveExamSectionsToRemote([section]);
      render();
    })),
  ]));
  return panel(`${formatWeeklyExamName(exam.weekNumber)} 과목 설정`, [form, table(["과목", "문항", "총점", "상태", "관리"], rows)]);
}

function renderWeeklyExamAnswerPicker(sections, selectedSection) {
  if (!sections.length) {
    return panel("주간평가 답안 입력", [
      el("div", { className: "empty" }, "정답을 입력할 주간평가 과목이 없습니다. 주간평가를 먼저 생성해주세요."),
    ]);
  }
  return panel("주간평가 답안 입력", [
    el("div", { className: "weekly-answer-picker" }, sections.map((section) =>
      button(
        "",
        section.id === selectedSection?.id ? "weekly-answer-chip active" : "weekly-answer-chip",
        "button",
        () => {
          weeklyExamSelectedSectionId = section.id;
          openWeeklyExamAnswerModal(section.id, sections.map((item) => item.id));
        },
        [
          el("strong", {}, `${Number(section.exam?.weekNumber) || 1}주차 ${section.subject}`),
        ]
      )
    )),
  ]);
}

function openWeeklyExamAnswerModal(sectionId, sectionIds = []) {
  const examMap = new Map((state.exams || []).map((exam) => [exam.id, exam]));
  const enrichSection = (section) => section ? ({ ...section, exam: examMap.get(section.examId) }) : null;
  const allSections = getWeeklyExamAnswerSections();
  const fallbackSection = enrichSection((state.examSections || []).find((item) => item.id === sectionId));
  const baseSection = allSections.find((item) => item.id === sectionId) || fallbackSection;
  const modalSections = sectionIds.length
    ? sectionIds.map((id) => allSections.find((section) => section.id === id) || enrichSection((state.examSections || []).find((section) => section.id === id))).filter(Boolean)
    : (state.examSections || []).filter((section) => section.examId === baseSection?.examId).map(enrichSection).filter(Boolean);
  const section = baseSection || modalSections[0] || null;
  if (!section) return notify("정답을 입력할 과목을 찾을 수 없습니다.");
  weeklyExamSelectedSectionId = section.id;
  weeklyExamSelectedId = section.examId;
  closeInfoModal();
  const modal = el("div", { className: "info-modal weekly-answer-modal", role: "dialog", ariaModal: "true" }, [
    el("button", { className: "info-modal-backdrop", type: "button", ariaLabel: "정답 입력 닫기" }),
    el("div", { className: "info-modal-panel weekly-answer-modal-panel" }, [
      el("div", { className: "attendance-modal-titlebar" }, [
        el("strong", {}, "정답 입력"),
        button("×", "icon-btn attendance-modal-close", "button", closeInfoModal),
      ]),
      renderWeeklyExamAnswerPanel(section, [], { modal: true }),
    ]),
  ]);
  modal.querySelector(".info-modal-backdrop").addEventListener("click", closeInfoModal);
  document.body.appendChild(modal);
  document.addEventListener("keydown", closeInfoModalOnEscape);
}

function resetSectionAnswerRows(section) {
  state.examAnswers = (state.examAnswers || []).filter((answer) => answer.examSectionId !== section.id);
  state.examAnswers.push(...Array.from({ length: section.questionCount }, (_, index) => ({
    id: createId(),
    examSectionId: section.id,
    questionNumber: index + 1,
    correctAnswer: 0,
    points: 5,
    targetTracks: getDefaultWeeklyQuestionTargetTracks(),
  })));
}

function getSectionAnswers(sectionId) {
  const section = (state.examSections || []).find((item) => item.id === sectionId);
  const answers = (state.examAnswers || []).filter((answer) => answer.examSectionId === sectionId);
  answers.forEach((answer) => {
    answer.targetTracks = normalizeWeeklyQuestionTargetTracks(answer.targetTracks);
  });
  if (section && answers.length < section.questionCount) {
    const existing = new Set(answers.map((answer) => answer.questionNumber));
    for (let i = 1; i <= section.questionCount; i += 1) {
      if (!existing.has(i)) {
        const row = { id: createId(), examSectionId: sectionId, questionNumber: i, correctAnswer: 0, points: 5, targetTracks: getDefaultWeeklyQuestionTargetTracks() };
        state.examAnswers.push(row);
        answers.push(row);
      }
    }
  }
  return answers.sort((a, b) => a.questionNumber - b.questionNumber);
}

async function updateWeeklyExamSectionQuestionCount(section, nextCount, options = {}) {
  const targetSection = (state.examSections || []).find((item) => item.id === section.id);
  if (!targetSection) return notify("문항 수를 변경할 과목을 찾을 수 없습니다.");
  const questionCount = Number(nextCount) || 0;
  if (questionCount < 1) return notify("문항 수는 1문항 이상이어야 합니다.");
  const currentCount = Number(targetSection.questionCount) || 20;
  if (questionCount === currentCount) return notify("변경된 문항 수가 없습니다.");
  const existingAnswers = getSectionAnswers(targetSection.id);
  const removedAnswers = existingAnswers.filter((answer) => answer.questionNumber > questionCount && answer.correctAnswer);
  if (removedAnswers.length && !confirm(`${questionCount}문항으로 줄이면 ${removedAnswers.length}개 정답이 삭제됩니다. 변경할까요?`)) return;
  targetSection.questionCount = questionCount;
  targetSection.totalScore = questionCount * 5;
  section.questionCount = questionCount;
  section.totalScore = questionCount * 5;
  state.examAnswers = (state.examAnswers || []).filter((answer) => answer.examSectionId !== targetSection.id || answer.questionNumber <= questionCount);
  const currentAnswers = getSectionAnswers(targetSection.id);
  currentAnswers.forEach((answer) => {
    answer.points = 5;
  });
  saveState({ skipRemote: true });
  await saveExamSectionsToRemote([targetSection]);
  await saveExamAnswersToRemote(currentAnswers);
  render();
  if (options.modal) openWeeklyExamAnswerModal(targetSection.id, options.sectionIds || []);
  notify("문항 수를 변경했습니다.");
}

function renderWeeklyExamAnswerPanel(section, sections = [], options = {}) {
  const exam = section.exam || (state.exams || []).find((item) => item.id === section.examId) || null;
  const answers = getSectionAnswers(section.id);
  const trackScoped = isWeeklyQuestionTrackScopedSubject(section.subject);
  const answerCells = answers.map((answer) => {
    const answerInput = el("input", {
      className: "answer-key-input",
      name: `answer-${answer.questionNumber}`,
      type: "text",
      inputMode: "numeric",
      pattern: "[1-4]",
      maxLength: 1,
      value: answer.correctAnswer ? String(answer.correctAnswer) : "",
      autocomplete: "off",
      ariaLabel: `${answer.questionNumber}번 정답`,
    });
    answerInput.addEventListener("input", () => {
      answerInput.value = normalizeMultipleChoiceAnswer(answerInput.value);
      answer.correctAnswer = Number(answerInput.value) || 0;
      answer.points = 5;
      saveState({ skipRemote: true });
      render();
      scheduleWeeklyExamAnswerAutosave(section.id, answers);
      if (answerInput.value) focusNextAnswerInput(answerInput);
    });
    answerInput.addEventListener("keydown", (event) => {
      if (event.key === "Tab" && !event.shiftKey) {
        const next = getNextAnswerInput(answerInput);
        if (next) {
          event.preventDefault();
          next.focus();
          next.select();
        }
      }
    });
    return { answer, answerInput };
  });
  const rows = [];
  for (let index = 0; index < answerCells.length; index += 10) {
    const group = answerCells.slice(index, index + 10);
    rows.push(el("tr", { className: "weekly-answer-question-row" }, [
      el("th", {}, "문항"),
      ...group.map(({ answer }) => el("th", {}, `${answer.questionNumber}번`)),
    ]));
    rows.push(el("tr", { className: "weekly-answer-input-row" }, [
      el("th", {}, "정답"),
      ...group.map(({ answerInput }) => el("td", {}, answerInput)),
    ]));
    if (trackScoped) {
      rows.push(el("tr", { className: "weekly-answer-track-row" }, [
        el("th", {}, "추가 직렬"),
        ...group.map(({ answer }) => el("td", {}, renderWeeklyQuestionTrackOptions(answer, section, answers))),
      ]));
    }
  }
  const picker = sections.length ? el("div", { className: "weekly-answer-picker compact" }, sections.map((item) =>
    button(
      "",
      item.id === section.id ? "weekly-answer-chip active" : "weekly-answer-chip",
      "button",
      () => {
        weeklyExamSelectedSectionId = item.id;
        weeklyExamAnswerScoped = false;
        if (options.modal) openWeeklyExamAnswerModal(item.id, options.sectionIds || sections.map((section) => section.id));
        else render();
      },
      [
        el("strong", {}, `${Number(item.exam?.weekNumber) || 1}주차 ${item.subject}`),
      ]
    )
  )) : null;
  let form;
  const answerHeader = el("div", { className: "weekly-answer-header" }, [
    el("div", {}, [
      el("strong", {}, `${Number(exam?.weekNumber) || 1}주차 ${section.subject}`),
      el("span", {}, "숫자를 키보드로 입력해주세요"),
      trackScoped ? el("small", {}, "공채와 함정요원은 기본 적용됩니다. VTS와 학과특채만 문항별로 선택해주세요.") : null,
    ]),
    trackScoped
      ? el("div", { className: "weekly-track-bulk-actions" }, [
          renderWeeklyTrackBulkButton(section, answers, "vts"),
          renderWeeklyTrackBulkButton(section, answers, "academy"),
        ])
      : null,
  ]);
  form = el("form", { className: "weekly-answer-form" }, [
    el("div", { className: "excel-table-wrap weekly-answer-table" }, [
      el("table", { className: "excel-table" }, [
        el("tbody", {}, rows),
      ]),
    ]),
    el("div", { className: "action-row weekly-answer-actions" }, [
      button("정답 저장", "btn"),
    ]),
  ]);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    syncWeeklyAnswerFormState(form, answers);
    saveState({ skipRemote: true });
    if (weeklyExamAnswerSaveTimers.has(section.id)) {
      clearTimeout(weeklyExamAnswerSaveTimers.get(section.id));
      weeklyExamAnswerSaveTimers.delete(section.id);
    }
    await saveExamAnswersToRemote(answers);
    render();
    if (options.modal) closeInfoModal();
    notify("정답을 저장했습니다.");
  });
  return panel("정답 입력", [
    answerHeader,
    picker,
    form,
  ].filter(Boolean));
}

function applyWeeklyQuestionTrackGroupToAll(section, answers, groupKey) {
  const group = WEEKLY_QUESTION_OPTIONAL_TRACK_GROUPS.find((item) => item.key === groupKey);
  if (!group) return;
  const allApplied = isWeeklyQuestionTrackGroupAppliedToAll(answers, group);
  answers.forEach((answer) => {
    const currentTracks = normalizeWeeklyQuestionTargetTracks(answer.targetTracks);
    answer.targetTracks = allApplied
      ? normalizeTrackOptionList(currentTracks.filter((track) => !group.tracks.map(normalizeCoastGuardTrack).includes(normalizeCoastGuardTrack(track))))
      : normalizeTrackOptionList([...currentTracks, ...group.tracks]);
  });
  saveState({ skipRemote: true });
  render();
  openWeeklyExamAnswerModal(section.id);
  scheduleWeeklyExamAnswerAutosave(section.id, answers);
  notify(allApplied ? `${group.label} 전체 적용을 해제했습니다.` : `${group.label}을 모든 문항에 적용했습니다.`);
}

function renderWeeklyTrackBulkButton(section, answers, groupKey) {
  const group = WEEKLY_QUESTION_OPTIONAL_TRACK_GROUPS.find((item) => item.key === groupKey);
  if (!group) return null;
  const allApplied = isWeeklyQuestionTrackGroupAppliedToAll(answers, group);
  return button(
    allApplied ? `전체 ${group.label} 해제` : `전체 ${group.label} 적용`,
    allApplied ? "mini-btn active" : "mini-btn",
    "button",
    () => applyWeeklyQuestionTrackGroupToAll(section, answers, groupKey)
  );
}

function isWeeklyQuestionTrackGroupAppliedToAll(answers, group) {
  return answers.length > 0 && answers.every((answer) => {
    const tracks = normalizeWeeklyQuestionTargetTracks(answer.targetTracks);
    return group.tracks.some((track) => tracks.includes(normalizeCoastGuardTrack(track)));
  });
}

function syncWeeklyAnswerFormState(form, answers) {
  answers.forEach((answer) => {
    answer.correctAnswer = Number(form.querySelector(`[name='answer-${answer.questionNumber}']`)?.value) || 0;
    answer.points = 5;
    answer.targetTracks = normalizeWeeklyQuestionTargetTracks(answer.targetTracks);
  });
}

function renderWeeklyQuestionTrackOptions(answer, section, answers) {
  answer.targetTracks = normalizeWeeklyQuestionTargetTracks(answer.targetTracks);
  return el("div", { className: "weekly-question-track-options" }, WEEKLY_QUESTION_OPTIONAL_TRACK_GROUPS.map((group) => {
    const selected = group.tracks.some((track) => answer.targetTracks.includes(normalizeCoastGuardTrack(track)));
    const chip = button(
      group.label,
      selected ? "weekly-question-track-chip active" : "weekly-question-track-chip",
      "button",
      () => {
      const nextSelected = !chip.classList.contains("active");
      const selectedGroups = WEEKLY_QUESTION_OPTIONAL_TRACK_GROUPS.filter((item) => {
        if (item.key === group.key) return nextSelected;
        return item.tracks.some((track) => answer.targetTracks.includes(normalizeCoastGuardTrack(track)));
      });
      answer.targetTracks = normalizeTrackOptionList([
        ...WEEKLY_QUESTION_FIXED_TRACKS,
        ...selectedGroups.flatMap((item) => item.tracks),
      ]);
      chip.classList.toggle("active", nextSelected);
      saveState({ skipRemote: true });
      scheduleWeeklyExamAnswerAutosave(section.id, answers);
      }
    );
    return chip;
  }));
}

function scheduleWeeklyExamAnswerAutosave(sectionId, answers) {
  if (weeklyExamAnswerSaveTimers.has(sectionId)) clearTimeout(weeklyExamAnswerSaveTimers.get(sectionId));
  const timer = setTimeout(async () => {
    weeklyExamAnswerSaveTimers.delete(sectionId);
    try {
      await saveExamAnswersToRemote(answers);
    } catch (error) {
      console.error(error);
    }
  }, 700);
  weeklyExamAnswerSaveTimers.set(sectionId, timer);
}

function normalizeMultipleChoiceAnswer(value) {
  const circled = { "①": "1", "②": "2", "③": "3", "④": "4" };
  const normalized = String(value || "").trim().replace(/[①②③④]/g, (char) => circled[char] || "");
  const match = normalized.match(/[1-4]/);
  return match ? match[0] : "";
}

function getNextAnswerInput(inputNode) {
  const inputs = [...inputNode.form.querySelectorAll(".answer-key-input")];
  const index = inputs.indexOf(inputNode);
  return index >= 0 ? inputs[index + 1] || null : null;
}

function focusNextAnswerInput(inputNode) {
  const next = getNextAnswerInput(inputNode);
  if (!next) return;
  next.focus();
  next.select();
}

function openCopyAnswersModal(sourceSection) {
  const targets = (state.examSections || []).filter((section) => section.examId === sourceSection.examId && section.id !== sourceSection.id);
  const list = el("div", { className: "weekly-check-grid" }, targets.map((section) =>
    el("label", { className: "check-chip" }, [el("input", { type: "checkbox", value: section.id }), el("span", {}, `${getSectionWeekLabel(section)} ${section.subject}`)])
  ));
  const run = button("복사", "btn", "button", async () => {
    const targetIds = [...list.querySelectorAll("input:checked")].map((node) => node.value);
    if (!targetIds.length) return notify("복사할 과목을 선택해주세요.");
    const hasExisting = targetIds.some((id) => getSectionAnswers(id).some((answer) => answer.correctAnswer));
    if (hasExisting && !confirm("기존 정답이 있는 과목이 있습니다. 덮어쓸까요?")) return;
    const sourceAnswers = getSectionAnswers(sourceSection.id);
    targetIds.forEach((id) => {
      const target = (state.examSections || []).find((section) => section.id === id);
      if (!target) return;
      state.examAnswers = (state.examAnswers || []).filter((answer) => answer.examSectionId !== id);
      state.examAnswers.push(...sourceAnswers.slice(0, target.questionCount).map((answer) => ({
        id: createId(),
        examSectionId: id,
        questionNumber: answer.questionNumber,
        correctAnswer: answer.correctAnswer,
        points: 5,
        targetTracks: normalizeWeeklyQuestionTargetTracks(answer.targetTracks),
      })));
    });
    saveState({ skipRemote: true });
    await saveExamAnswersToRemote(targetIds.flatMap(getSectionAnswers));
    closeInfoModal();
    render();
    notify("정답을 복사했습니다.");
  });
  openInfoModal({ title: "정답 복사", className: "weekly-copy-modal", content: el("div", {}, [list, el("div", { className: "attendance-modal-actions" }, [run])]) });
}

async function deleteWeeklyExamSection(sectionId) {
  const section = (state.examSections || []).find((item) => item.id === sectionId);
  if (!section) return notify("삭제할 과목을 찾을 수 없습니다.");
  const submissionCount = (state.examSubmissions || []).filter((submission) => submission.examSectionId === section.id).length;
  const message = submissionCount
    ? `${getSectionWeekLabel(section)} ${section.subject} 과목과 제출 기록 ${submissionCount}건이 함께 삭제됩니다. 삭제할까요?`
    : `${getSectionWeekLabel(section)} ${section.subject} 과목을 삭제할까요?`;
  if (!confirm(message)) return;
  const submissionIds = new Set((state.examSubmissions || []).filter((submission) => submission.examSectionId === section.id).map((submission) => submission.id));
  try {
    await deleteExamSectionFromRemote(section.id);
    state.examSections = (state.examSections || []).filter((item) => item.id !== section.id);
    state.examAnswers = (state.examAnswers || []).filter((answer) => answer.examSectionId !== section.id);
    state.examSubmissions = (state.examSubmissions || []).filter((submission) => submission.examSectionId !== section.id);
    state.submissionAnswers = (state.submissionAnswers || []).filter((answer) => !submissionIds.has(answer.submissionId));
    state.examFiles = (state.examFiles || []).filter((file) => file.examSectionId !== section.id);
    if (weeklyExamSelectedSectionId === section.id) weeklyExamSelectedSectionId = "";
    saveState({ skipRemote: true });
    render();
    notify("주간평가 과목을 삭제했습니다.");
  } catch (error) {
    console.error(error);
    notify("원격 삭제 중 오류가 발생했습니다. Supabase 스키마의 삭제 권한을 확인해주세요.");
  }
}

function getSectionWeekLabel(section) {
  const exam = section.exam || (state.exams || []).find((item) => item.id === section.examId);
  return `${Number(exam?.weekNumber) || 1}주차`;
}

function renderWeeklyExamScoresPanel(cohort = selectedStudentCohort) {
  const weekOptions = Array.from({ length: WEEKLY_EXAM_WEEK_COUNT }, (_, index) => String(index + 1));
  const weekSelect = select("weekNumber", weekOptions);
  weekSelect.querySelectorAll("option").forEach((option) => {
    option.textContent = `${option.value}주차`;
  });
  if (!weekOptions.includes(String(weeklyExamGradeFilters.weekNumber || ""))) weeklyExamGradeFilters.weekNumber = "1";
  weekSelect.value = String(weeklyExamGradeFilters.weekNumber || "1");
  weekSelect.addEventListener("change", () => {
    weeklyExamGradeFilters.weekNumber = weekSelect.value;
    weeklyExamGradeFilters.examId = "";
    render();
  });

  const targetWeek = Number(weeklyExamGradeFilters.weekNumber) || 1;
  const exam = getWeeklyExamByCohortAndWeek(cohort, targetWeek);
  if (!gradeManagementTrackFilter) {
    return panel("주간평가 성적", [
      el("div", { className: "teacher-search grade-management-filter" }, [
        field("주차", weekSelect),
      ]),
      el("div", { className: "empty" }, "직렬을 선택하면 해당 직렬 학생의 주간평가 성적이 표시됩니다."),
    ]);
  }
  const previousExam = targetWeek > 1 ? getWeeklyExamByCohortAndWeek(cohort, targetWeek - 1) : null;
  const students = getGradeManagementStudents(cohort);
  const summaries = applyGradeRanksByTrack(students.map((student) => getWeeklyGradeStudentSummary(exam, student)));
  const previousSummaries = applyGradeRanksByTrack(students.map((student) => getWeeklyGradeStudentSummary(previousExam, student)));
  const previousRankByStudent = new Map(previousSummaries.map((summary) => [String(summary.student.id), summary.rank]));
  const headers = ["이름", "직렬", ...WEEKLY_EXAM_SUBJECTS, "틀린 개수", "이번 등수", "백분율", "전회차 등수", "전회차 대비 등수 등락"];
  const rows = summaries.map((summary) => {
    const previousRank = previousRankByStudent.get(String(summary.student.id)) || 0;
    return el("tr", {}, [
    el("td", {}, summary.student.name || "-"),
    el("td", {}, getTeacherStudentRegisteredTrack(summary.student) || "-"),
    ...WEEKLY_EXAM_SUBJECTS.map((subject) => el("td", {}, formatSubjectScoreCell(summary.subjectScores[subject]))),
    el("td", {}, summary.maxCorrect ? String(summary.wrongCount) : "-"),
    el("td", {}, summary.rank ? `${summary.rank}등` : "-"),
    el("td", {}, summary.rank ? `${summary.topPercent}%` : "-"),
    el("td", {}, previousRank ? `${previousRank}등` : "-"),
    el("td", {}, formatRankDelta(summary.rank, previousRank)),
  ]);
  });

  return panel("주간평가 성적", [
    el("div", { className: "teacher-search grade-management-filter" }, [
      field("주차", weekSelect),
    ]),
    exam
      ? table(headers, rows.length ? rows : [el("tr", {}, [el("td", { colSpan: headers.length }, el("div", { className: "empty table-empty" }, "조회할 학생이 없습니다."))])])
      : el("div", { className: "empty" }, `${targetWeek}주차 주간평가가 아직 생성되지 않았습니다.`),
  ]);
}

function renderFinalMockScoresPanel(cohort = selectedStudentCohort) {
  const roundOptions = Array.from({ length: 24 }, (_, index) => String(index + 1));
  const roundSelect = select("round", roundOptions);
  roundSelect.querySelectorAll("option").forEach((option) => {
    option.textContent = `${option.value}회차`;
  });
  if (!roundOptions.includes(String(finalExamGradeFilters.round || ""))) finalExamGradeFilters.round = "1";
  roundSelect.value = String(finalExamGradeFilters.round || "1");
  roundSelect.addEventListener("change", () => {
    finalExamGradeFilters.round = roundSelect.value;
    render();
  });

  const round = Number(finalExamGradeFilters.round) || 1;
  const students = getGradeManagementStudents(cohort);
  const records = getFinalMockScoreRecords(round);
  const previousRecords = getFinalMockScoreRecords(round - 1);
  const recordByStudent = new Map(records.map((record) => [String(record.studentId || "").trim(), record]));
  const previousSummaries = applyGradeRanksByTrack(students.map((student) => getFinalMockGradeStudentSummary(student, previousRecords)));
  const previousRankByStudent = new Map(previousSummaries.map((summary) => [String(summary.student.id), summary.rank]));
  const summaries = applyGradeRanksByTrack(students.map((student) => getFinalMockGradeStudentSummary(student, records)));
  const registered = students.map((student) => recordByStudent.get(String(student.id))).filter(Boolean);
  const headers = ["이름", "직렬", ...getGradeSubjectHeaders(), "오답", "이번 등수", "백분율", "전회차 등수", "전회차 대비 등수 등락", "관리"];
  const rows = summaries.map((summary) => {
    const previousRank = previousRankByStudent.get(String(summary.student.id)) || 0;
    const record = recordByStudent.get(String(summary.student.id)) || null;
    return el("tr", {}, [
      el("td", {}, summary.student.name || "-"),
      el("td", {}, getTeacherStudentRegisteredTrack(summary.student) || "-"),
      ...getGradeSubjectHeaders().map((subject) => el("td", {}, formatSubjectScoreCell(summary.subjectScores[subject]))),
      el("td", {}, summary.hasScore && summary.wrongCount !== "" ? String(summary.wrongCount) : "-"),
      el("td", {}, summary.rank ? `${summary.rank}등` : "-"),
      el("td", {}, summary.rank ? `${summary.topPercent}%` : "-"),
      el("td", {}, previousRank ? `${previousRank}등` : "-"),
      el("td", {}, formatRankDelta(summary.rank, previousRank)),
      el("td", {}, button("수정", "mini-btn", "button", () => openFinalScoreEditModal(round, summary.student, record))),
    ]);
  });
  const bulkTextarea = el("textarea", {
    className: "grade-bulk-textarea",
    placeholder: "엑셀 표를 그대로 붙여넣으세요.\n예: 이름\t직렬\t법규\t개론\t형사\t영어\t항해\t기관\t형소법(공판)\t개수",
    rows: 5,
  });
  const bulkSaveButton = button("일괄 저장", "btn", "button", () => saveFinalBulkScoreInput(round, students, bulkTextarea.value));

  return panel("파이널 모의고사 성적", [
    el("div", { className: "teacher-search grade-management-filter" }, [
      field("회차", roundSelect),
    ]),
    el("div", { className: "grade-bulk-input" }, [
      el("div", { className: "grade-input-actions" }, [
        el("p", { className: "subtle" }, "엑셀에서 성적 표를 복사해 붙여넣으면 이름/직렬 기준으로 일괄 저장됩니다."),
        bulkSaveButton,
      ]),
      bulkTextarea,
    ]),
    table(headers, rows.length ? rows : [el("tr", {}, [el("td", { colSpan: headers.length }, el("div", { className: "empty table-empty" }, "조회할 학생이 없습니다."))])]),
    registered.length ? null : el("p", { className: "subtle" }, "파이널 모의고사 성적 데이터가 등록되면 이 표에 학생별 성적이 표시됩니다."),
  ]);
}

function saveFinalBulkScoreInput(round, students = [], rawText = "") {
  const parsed = parseFinalBulkScoreRows(rawText);
  if (!parsed.rows.length) return notify("붙여넣은 성적 데이터가 없습니다.");
  const studentById = new Map(students.map((student) => [String(student.id), student]));
  const studentsByName = new Map();
  students.forEach((student) => {
    const key = String(student.name || "").trim();
    if (!key) return;
    if (!studentsByName.has(key)) studentsByName.set(key, []);
    studentsByName.get(key).push(student);
  });
  const nextRecords = [];
  const unmatched = [];
  parsed.rows.forEach((row) => {
    const student = matchFinalBulkStudent(row, studentById, studentsByName);
    if (!student) {
      unmatched.push(row.name || row.id || "이름 없음");
      return;
    }
    const subjectScores = {};
    let score = 0;
    let maxScore = 0;
    getGradeSubjectHeaders().forEach((subject) => {
      const raw = row.subjectScores[subject];
      if (raw === "" || raw === "-" || raw === undefined || raw === null) return;
      const value = Number(raw);
      if (!Number.isFinite(value)) return;
      subjectScores[subject] = { score: value, maxScore: 100, status: "submitted" };
      score += value;
      maxScore += 100;
    });
    const wrongCount = row.wrongCount === "" || row.wrongCount === "-" ? "" : Math.max(0, Number(row.wrongCount) || 0);
    if (!Object.keys(subjectScores).length && wrongCount === "") return;
    nextRecords.push({
      id: `final-${round}-${student.id}`,
      round,
      studentId: student.id,
      score: Math.round(score * 10) / 10,
      maxScore,
      wrongCount,
      subjectScores,
      status: "등록 완료",
      updatedAt: new Date().toISOString(),
    });
  });
  if (!nextRecords.length) {
    return notify(unmatched.length ? `매칭된 학생이 없습니다. 확인 필요: ${unmatched.slice(0, 3).join(", ")}` : "저장할 성적 데이터가 없습니다.");
  }
  const targetIds = new Set(nextRecords.map((record) => String(record.studentId)));
  state.finalExamScores = [
    ...((state.finalExamScores || []).filter((record) =>
      Number(record.round || record.roundNumber || record.session || record.sessionNumber || record.examRound || record.examNumber || 0) !== Number(round) ||
      !targetIds.has(String(record.studentId || record.student_id || record.studentNumber || ""))
    )),
    ...nextRecords,
  ];
  saveState({ skipRemote: true });
  notify(unmatched.length
    ? `${nextRecords.length}명 저장, ${unmatched.length}명 매칭 실패`
    : `${nextRecords.length}명의 파이널 성적을 일괄 저장했습니다.`);
  render();
}

function parseFinalBulkScoreRows(rawText = "") {
  const lines = String(rawText || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return { rows: [] };
  const delimiter = lines.some((line) => line.includes("\t")) ? "\t" : ",";
  const splitLine = (line) => line.split(delimiter).map((cell) => String(cell || "").trim());
  const headers = splitLine(lines[0]).map(normalizeFinalBulkHeader);
  const hasHeader = headers.some((header) => ["name", "track", "wrongCount", "id"].includes(header) || getGradeSubjectHeaders().includes(header));
  const effectiveHeaders = hasHeader ? headers : ["name", "track", ...getGradeSubjectHeaders(), "wrongCount"];
  const dataLines = hasHeader ? lines.slice(1) : lines;
  const rows = dataLines.map((line) => {
    const cells = splitLine(line);
    const row = { id: "", name: "", track: "", wrongCount: "", subjectScores: {} };
    effectiveHeaders.forEach((header, index) => {
      const value = cells[index] ?? "";
      if (header === "id") row.id = value;
      else if (header === "name") row.name = value;
      else if (header === "track") row.track = normalizeCoastGuardTrack(value);
      else if (header === "wrongCount") row.wrongCount = value;
      else if (getGradeSubjectHeaders().includes(header)) row.subjectScores[header] = value;
    });
    return row;
  });
  return { rows };
}

function normalizeFinalBulkHeader(header) {
  const value = String(header || "").replace(/\s/g, "").trim();
  if (["번호", "학번", "id", "ID", "studentId"].includes(value)) return "id";
  if (["이름", "성명", "name"].includes(value)) return "name";
  if (["직렬", "트랙", "track"].includes(value)) return "track";
  if (["개수", "오답", "오답수", "틀린개수", "wrongCount"].includes(value)) return "wrongCount";
  return getGradeSubjectHeaders().find((subject) => subject.replace(/\s/g, "") === value) || value;
}

function matchFinalBulkStudent(row, studentById, studentsByName) {
  if (row.id && studentById.has(String(row.id))) return studentById.get(String(row.id));
  const candidates = studentsByName.get(String(row.name || "").trim()) || [];
  if (!candidates.length) return null;
  if (!row.track) return candidates.length === 1 ? candidates[0] : null;
  return candidates.find((student) => getTeacherStudentRegisteredTrack(student) === row.track) || null;
}

function openFinalScoreEditModal(round, student, record) {
  const subjectInputs = new Map();
  const subjectFields = getGradeSubjectHeaders().map((subject) => {
    const inputNode = el("input", {
      className: "grade-score-input",
      type: "number",
      min: "0",
      max: "100",
      step: "1",
      value: record?.subjectScores?.[subject]?.score ?? "",
      ariaLabel: `${student.name || student.id} ${subject} 점수`,
    });
    subjectInputs.set(subject, inputNode);
    return field(subject, inputNode);
  });
  const wrongInput = el("input", {
    className: "grade-score-input compact",
    type: "number",
    min: "0",
    step: "1",
    value: record?.wrongCount ?? "",
    ariaLabel: `${student.name || student.id} 오답 수`,
  });
  const form = el("form", { className: "final-score-modal-form" }, [
    el("p", { className: "subtle" }, `${student.name || "-"} / ${getTeacherStudentRegisteredTrack(student) || "-"} / ${round}회차`),
    el("div", { className: "detail-grid" }, [...subjectFields, field("오답", wrongInput)]),
    el("div", { className: "attendance-modal-actions" }, [
      button("취소", "btn secondary", "button", closeInfoModal),
      button("저장", "btn", "submit"),
    ]),
  ]);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    saveFinalScoreEdit(round, student, subjectInputs, wrongInput);
  });
  openInfoModal({
    title: "파이널 성적 수정",
    className: "final-score-edit-modal",
    content: form,
  });
}

function saveFinalScoreEdit(round, student, subjectInputs, wrongInput) {
  const subjectScores = {};
  let score = 0;
  let maxScore = 0;
  subjectInputs.forEach((node, subject) => {
    const raw = String(node.value || "").trim();
    if (raw === "") return;
    const value = Number(raw);
    if (!Number.isFinite(value)) return;
    subjectScores[subject] = { score: value, maxScore: 100, status: "submitted" };
    score += value;
    maxScore += 100;
  });
  const wrongRaw = String(wrongInput.value || "").trim();
  const wrongCount = wrongRaw === "" ? "" : Math.max(0, Number(wrongRaw) || 0);
  if (!Object.keys(subjectScores).length && wrongRaw === "") return notify("점수 또는 오답 수를 입력해주세요.");
  const record = {
    id: `final-${round}-${student.id}`,
    round,
    studentId: student.id,
    score: Math.round(score * 10) / 10,
    maxScore,
    wrongCount,
    subjectScores,
    status: "등록 완료",
    updatedAt: new Date().toISOString(),
  };
  state.finalExamScores = [
    ...((state.finalExamScores || []).filter((item) =>
      Number(item.round || item.roundNumber || item.session || item.sessionNumber || item.examRound || item.examNumber || 0) !== Number(round) ||
      String(item.studentId || item.student_id || item.studentNumber || "") !== String(student.id)
    )),
    record,
  ];
  saveState({ skipRemote: true });
  closeInfoModal();
  notify(`${student.name || student.id} 학생의 파이널 성적을 저장했습니다.`);
  render();
}

function renderFinalScoreInputRow(student, record) {
  const subjectScores = record?.subjectScores || {};
  return el("tr", {}, [
    el("td", {}, student.name || "-"),
    el("td", {}, getTeacherStudentRegisteredTrack(student) || "-"),
    ...getGradeSubjectHeaders().map((subject) => {
      const value = subjectScores[subject]?.score ?? "";
      return el("td", {}, el("input", {
        className: "grade-score-input",
        type: "number",
        min: "0",
        max: "100",
        step: "1",
        value: value === null || value === undefined ? "" : String(value),
        "data-student-id": student.id,
        "data-subject": subject,
        ariaLabel: `${student.name || student.id} ${subject} 점수`,
      }));
    }),
    el("td", {}, el("input", {
      className: "grade-score-input compact",
      type: "number",
      min: "0",
      step: "1",
      value: record?.wrongCount === null || record?.wrongCount === undefined ? "" : String(record?.wrongCount ?? ""),
      "data-student-id": student.id,
      "data-role": "wrongCount",
      ariaLabel: `${student.name || student.id} 오답 수`,
    })),
  ]);
}

function saveFinalScoreInputs(round, students = []) {
  const nextRecords = [];
  students.forEach((student) => {
    const subjectScores = {};
    let score = 0;
    let maxScore = 0;
    getGradeSubjectHeaders().forEach((subject) => {
      const selector = `.grade-score-input[data-student-id="${escapeCssValue(student.id)}"][data-subject="${escapeCssValue(subject)}"]`;
      const node = document.querySelector(selector);
      const raw = String(node?.value || "").trim();
      if (raw === "") return;
      const value = Number(raw);
      if (!Number.isFinite(value)) return;
      subjectScores[subject] = { score: value, maxScore: 100, status: "submitted" };
      score += value;
      maxScore += 100;
    });
    const wrongNode = document.querySelector(`.grade-score-input[data-student-id="${escapeCssValue(student.id)}"][data-role="wrongCount"]`);
    const wrongRaw = String(wrongNode?.value || "").trim();
    const wrongCount = wrongRaw === "" ? "" : Math.max(0, Number(wrongRaw) || 0);
    if (!Object.keys(subjectScores).length && wrongRaw === "") return;
    nextRecords.push({
      id: `final-${round}-${student.id}`,
      round,
      studentId: student.id,
      score: Math.round(score * 10) / 10,
      maxScore,
      wrongCount,
      subjectScores,
      status: "등록 완료",
      updatedAt: new Date().toISOString(),
    });
  });
  const targetIds = new Set(students.map((student) => String(student.id)));
  state.finalExamScores = [
    ...((state.finalExamScores || []).filter((record) =>
      Number(record.round || record.roundNumber || record.session || record.sessionNumber || record.examRound || record.examNumber || 0) !== Number(round) ||
      !targetIds.has(String(record.studentId || record.student_id || record.studentNumber || ""))
    )),
    ...nextRecords,
  ];
  saveState({ skipRemote: true });
  notify(`${nextRecords.length}명의 파이널 성적을 저장했습니다.`);
  render();
}

function escapeCssValue(value) {
  const text = String(value || "");
  return window.CSS?.escape ? CSS.escape(text) : text.replace(/["\\]/g, "\\$&");
}

function getWeeklyExamByCohortAndWeek(cohort, weekNumber) {
  return (state.exams || []).find((exam) =>
    String(exam.cohort || "") === String(cohort || "") &&
    Number(exam.weekNumber) === Number(weekNumber)
  );
}

function getWeeklyGradeStudentSummary(exam, student) {
  const sections = exam ? getWeeklyGradeSectionsForStudent(exam, student) : [];
  const sectionSummaries = sections.map((section) => {
    const submission = getStudentExamSubmission(student.id, section.id);
    const questionCount = getWeeklyGradeVisibleAnswers(section, student).length || Number(section.questionCount) || 0;
    return { section, submission, questionCount };
  });
  const submitted = sectionSummaries.filter((item) => item.submission);
  const score = submitted.reduce((sum, item) => sum + (Number(item.submission.score) || 0), 0);
  const correctCount = submitted.reduce((sum, item) => sum + (Number(item.submission.correctCount) || 0), 0);
  const maxCorrect = sectionSummaries.reduce((sum, item) => sum + item.questionCount, 0);
  const maxScore = sectionSummaries.reduce((sum, item) => sum + item.questionCount * 5, 0);
  const subjectScores = {};
  sectionSummaries.forEach((item) => {
    subjectScores[item.section.subject] = item.submission
      ? {
          score: Number(item.submission.score) || 0,
          maxScore: item.questionCount * 5,
          correctCount: Number(item.submission.correctCount) || 0,
          questionCount: item.questionCount,
          status: "submitted",
        }
      : { status: "missing", questionCount: item.questionCount, maxScore: item.questionCount * 5 };
  });
  const latestSubmittedAt = submitted
    .map((item) => item.submission.submittedAt)
    .filter(Boolean)
    .sort((a, b) => new Date(b) - new Date(a))[0] || "";
  const status = !exam
    ? "시험 없음"
    : !sections.length
      ? "대상 과목 없음"
      : submitted.length === sections.length
        ? "제출 완료"
        : submitted.length
          ? "일부 제출"
          : "미제출";
  return {
    student,
    subjectCount: sections.length,
    submittedCount: submitted.length,
    score: Math.round(score * 10) / 10,
    maxScore,
    correctCount,
    maxCorrect,
    wrongCount: Math.max(0, maxCorrect - correctCount),
    subjectScores,
    latestSubmittedAt,
    status,
  };
}

function applyGradeRanks(summaries) {
  const ranked = summaries.filter((summary) => summary.hasScore !== false && (summary.submittedCount > 0 || Number(summary.score) > 0 || Number(summary.maxScore) > 0 && summary.status === "등록 완료"));
  const sorted = [...ranked].sort((a, b) => {
    const scoreCompare = (Number(b.score) || 0) - (Number(a.score) || 0);
    if (scoreCompare) return scoreCompare;
    const wrongCompare = (Number(a.wrongCount) || 0) - (Number(b.wrongCount) || 0);
    if (wrongCompare) return wrongCompare;
    return String(a.student.id).localeCompare(String(b.student.id), "ko-KR", { numeric: true });
  });
  let previousScore = null;
  let previousWrong = null;
  let previousRank = 0;
  sorted.forEach((summary, index) => {
    const score = Number(summary.score) || 0;
    const wrong = Number(summary.wrongCount) || 0;
    const rank = score === previousScore && wrong === previousWrong ? previousRank : index + 1;
    summary.rank = rank;
    summary.topPercent = calculateGradePercentile(rank, sorted.length);
    previousScore = score;
    previousWrong = wrong;
    previousRank = rank;
  });
  summaries.forEach((summary) => {
    if (!sorted.includes(summary)) {
      summary.rank = 0;
      summary.topPercent = 0;
    }
  });
  return summaries;
}

function applyGradeRanksByTrack(summaries) {
  const groups = new Map();
  summaries.forEach((summary) => {
    const track = getTeacherStudentRegisteredTrack(summary.student) || "미분류";
    if (!groups.has(track)) groups.set(track, []);
    groups.get(track).push(summary);
  });
  groups.forEach((items) => applyGradeRanks(items));
  return summaries;
}

function calculateGradePercentile(rank, total) {
  if (!rank || !total) return 0;
  if (total <= 1) return 0;
  return Math.round(((rank - 1) / (total - 1)) * 1000) / 10;
}

function formatSubjectScoreCell(subjectScore) {
  if (!subjectScore) return "-";
  if (subjectScore.status === "missing") return "미제출";
  if (subjectScore.status === "empty") return "-";
  const score = Number(subjectScore.score) || 0;
  const maxScore = Number(subjectScore.maxScore) || 0;
  return maxScore ? `${score}/${maxScore}` : String(score);
}

function formatRankDelta(currentRank, previousRank) {
  if (!currentRank || !previousRank) return "-";
  const delta = Number(previousRank) - Number(currentRank);
  if (!delta) return "변동 없음";
  return delta > 0 ? `▲ ${delta}` : `▼ ${Math.abs(delta)}`;
}

function getGradeSubjectHeaders() {
  return Array.isArray(FINAL_GRADE_SUBJECTS) ? FINAL_GRADE_SUBJECTS : Array.from({ length: 8 }, (_, index) => `과목${index + 1}`);
}

function getWeeklyGradeSectionsForStudent(exam, student) {
  const studentTrack = getTeacherStudentRegisteredTrack(student);
  return getExamSections(exam?.id || "").filter((section) => {
    const sectionTrack = normalizeCoastGuardTrack(section.track);
    const trackMatched = sectionTrack === studentTrack || sectionTrack === WEEKLY_EXAM_TRACK_ALL;
    const subjectMatched = sectionTrack !== WEEKLY_EXAM_TRACK_ALL || isWeeklySubjectAllowedForTrack(section.subject, studentTrack);
    return section.isActive !== false && trackMatched && subjectMatched;
  });
}

function getWeeklyGradeVisibleAnswers(section, student) {
  const studentTrack = typeof student === "string" ? normalizeCoastGuardTrack(student) : getTeacherStudentRegisteredTrack(student);
  return getSectionAnswers(section.id)
    .filter((answer) => answer.correctAnswer)
    .filter((answer) => !isWeeklyQuestionTrackScopedSubject(section.subject) || isWeeklyQuestionForTrack(answer, studentTrack));
}

function getStudentExamSubmission(studentId, sectionId) {
  return (state.examSubmissions || []).find((submission) =>
    String(submission.studentId || "") === String(studentId || "") &&
    submission.examSectionId === sectionId &&
    submission.status === "submitted"
  );
}

function getFinalMockScoreRecords(round) {
  const sources = [state.finalExamScores, state.finalMockScores, state.mockExamScores, state.finalScores].filter(Array.isArray);
  return sources.flat().filter((record) => {
    const value = Number(record.round || record.roundNumber || record.session || record.sessionNumber || record.examRound || record.examNumber || 0);
    return value === Number(round);
  }).map((record) => ({
    studentId: record.studentId || record.student_id || record.studentNumber || "",
    score: record.score ?? record.totalScore ?? record.total_score ?? "",
    maxScore: record.maxScore ?? record.max_score ?? record.totalPossible ?? "",
    percent: record.percent ?? record.percentage ?? "",
    wrongCount: record.wrongCount ?? record.wrong_count ?? record.incorrectCount ?? record.incorrect_count ?? "",
    subjectScores: normalizeFinalMockSubjectScores(record),
    rank: record.rank ?? "",
    submittedAt: record.submittedAt || record.createdAt || record.updatedAt || record.submitted_at || "",
    status: record.status || "",
  }));
}

function getFinalMockGradeStudentSummary(student, records) {
  const record = records.find((item) => String(item.studentId || "").trim() === String(student.id || "").trim());
  if (!record) {
    return {
      student,
      score: 0,
      maxScore: 0,
      wrongCount: "",
      subjectScores: {},
      hasScore: false,
      submittedCount: 0,
      status: "미등록",
    };
  }
  const score = Number(record.score) || 0;
  const maxScore = Number(record.maxScore) || 0;
  const subjectScores = {};
  getGradeSubjectHeaders().forEach((subject) => {
    subjectScores[subject] = record.subjectScores[subject] || { status: "empty" };
  });
  return {
    student,
    score,
    maxScore,
    wrongCount: record.wrongCount !== "" && record.wrongCount !== null && record.wrongCount !== undefined
      ? Number(record.wrongCount) || 0
      : maxScore
        ? Math.max(0, Math.round((maxScore - score) / 5))
        : "",
    subjectScores,
    hasScore: true,
    submittedCount: 1,
    status: record.status || "등록 완료",
  };
}

function normalizeFinalMockSubjectScores(record) {
  const subjectScores = {};
  const source = record.subjectScores || record.subject_scores || record.scoresBySubject || record.subjects || null;
  if (Array.isArray(source)) {
    source.slice(0, 8).forEach((value, index) => {
      subjectScores[`과목${index + 1}`] = normalizeSubjectScoreValue(value);
    });
  } else if (source && typeof source === "object") {
    getGradeSubjectHeaders().forEach((subject, index) => {
      const value = source[subject] ?? source[`subject${index + 1}`] ?? source[`과목${index + 1}`];
      if (value !== undefined) subjectScores[subject] = normalizeSubjectScoreValue(value);
    });
  }
  getGradeSubjectHeaders().forEach((subject, index) => {
    const direct = record[`subject${index + 1}`] ?? record[`subject_${index + 1}`] ?? record[`score${index + 1}`] ?? record[`score_${index + 1}`];
    if (direct !== undefined) subjectScores[subject] = normalizeSubjectScoreValue(direct);
  });
  return subjectScores;
}

function normalizeSubjectScoreValue(value) {
  if (value && typeof value === "object") {
    return {
      score: value.score ?? value.total ?? value.value ?? "",
      maxScore: value.maxScore ?? value.max_score ?? value.max ?? "",
      status: value.status || "submitted",
    };
  }
  if (value === "" || value === null || value === undefined) return { status: "empty" };
  return { score: value, maxScore: "", status: "submitted" };
}

function getMissingExamStudents(section) {
  const submitted = new Set((state.examSubmissions || []).filter((submission) => submission.examSectionId === section.id && submission.status === "submitted").map((submission) => submission.studentId));
  return (state.students || []).filter((student) => getTeacherStudentRegisteredTrack(student) === section.track && !submitted.has(student.id));
}

function renderQuestionAccuracy(sections) {
  const rows = [];
  sections.forEach((section) => {
    const submissions = (state.examSubmissions || []).filter((submission) => submission.examSectionId === section.id && submission.status === "submitted");
    const answers = (state.submissionAnswers || []).filter((answer) => submissions.some((submission) => submission.id === answer.submissionId));
    for (let i = 1; i <= section.questionCount; i += 1) {
      const items = answers.filter((answer) => answer.questionNumber === i);
      if (!items.length) continue;
      const correct = items.filter((answer) => answer.isCorrect).length;
      rows.push(el("tr", {}, [el("td", {}, section.subject), el("td", {}, `${i}번`), el("td", {}, `${correct}/${items.length}`), el("td", {}, `${Math.round((correct / items.length) * 100)}%`)]));
    }
  });
  return table(["과목", "문항", "정답", "정답률"], rows.length ? rows : [el("tr", {}, [el("td", { colSpan: 4 }, el("div", { className: "empty table-empty" }, "문항별 정답률 데이터가 없습니다."))])]);
}

async function regradeSection(section) {
  const submissions = (state.examSubmissions || []).filter((submission) => submission.examSectionId === section.id && submission.status === "submitted");
  submissions.forEach((submission) => gradeSubmission(section, submission, getSubmissionAnswers(submission.id).map((answer) => answer.selectedAnswer)));
  saveState({ skipRemote: true });
  if (remoteStore) {
    await saveExamSubmissionsToRemote(submissions);
    await saveSubmissionAnswersToRemote(submissions.flatMap((submission) => getSubmissionAnswers(submission.id)));
  }
  render();
  notify("전체 재채점을 완료했습니다.");
}

function getSubmissionAnswers(submissionId) {
  return (state.submissionAnswers || []).filter((answer) => answer.submissionId === submissionId).sort((a, b) => a.questionNumber - b.questionNumber);
}

function gradeSubmission(section, submission, selectedAnswers) {
  const answers = getSectionAnswers(section.id).filter((answer) => !isWeeklyQuestionTrackScopedSubject(section.subject) || isWeeklyQuestionForTrack(answer, submission.track));
  const previousAnswers = getSubmissionAnswers(submission.id);
  const selectedByQuestion = new Map(previousAnswers.map((answer) => [answer.questionNumber, answer.selectedAnswer]));
  let score = 0;
  let correctCount = 0;
  state.submissionAnswers = (state.submissionAnswers || []).filter((answer) => answer.submissionId !== submission.id);
  answers.forEach((answer) => {
    const selectedAnswer = Number(selectedByQuestion.get(answer.questionNumber) || selectedAnswers[answer.questionNumber - 1]) || null;
    const isCorrect = Boolean(selectedAnswer && answer.correctAnswer && selectedAnswer === answer.correctAnswer);
    const pointsAwarded = isCorrect ? Number(answer.points) || 0 : 0;
    if (isCorrect) correctCount += 1;
    score += pointsAwarded;
    state.submissionAnswers.push({
      id: createId(),
      submissionId: submission.id,
      questionNumber: answer.questionNumber,
      selectedAnswer,
      isCorrect,
      pointsAwarded,
    });
  });
  submission.score = Math.round(score * 10) / 10;
  submission.correctCount = correctCount;
  return submission;
}

async function saveWeeklyExamToRemote(exam) {
  if (!remoteStore) return;
  const row = {
    id: exam.id,
    name: formatWeeklyExamName(exam.weekNumber, exam.cohort),
    cohort: exam.cohort || "",
    week_number: exam.weekNumber,
    start_at: exam.startAt || null,
    end_at: exam.endAt || null,
    target_tracks: exam.targetTracks,
    is_published: exam.isPublished,
    score_release_mode: exam.scoreReleaseMode,
    explanation_release_mode: exam.explanationReleaseMode,
    created_at: exam.createdAt,
    updated_at: exam.updatedAt || new Date().toISOString(),
  };
  let { error } = await remoteStore.from("exams").upsert(row, { onConflict: "id" });
  if (isMissingColumnError(error, "cohort")) {
    const { cohort, ...fallbackRow } = row;
    ({ error } = await remoteStore.from("exams").upsert(fallbackRow, { onConflict: "id" }));
  }
  if (error) throw error;
}

async function saveExamSectionsToRemote(sections) {
  if (!remoteStore || !sections.length) return;
  const rows = sections.map((section) => ({
    id: section.id,
    exam_id: section.examId,
    track: section.track,
    subject: section.subject,
    question_count: section.questionCount,
    total_score: section.totalScore,
    is_active: section.isActive,
    created_at: section.createdAt || new Date().toISOString(),
  }));
  const { error } = await remoteStore.from("exam_sections").upsert(rows, { onConflict: "id" });
  if (error) throw error;
}

async function deleteExamSectionFromRemote(sectionId) {
  if (!remoteStore) return;
  const { error } = await remoteStore.from("exam_sections").delete().eq("id", sectionId);
  if (error) throw error;
}

async function saveExamAnswersToRemote(answers) {
  if (!remoteStore || !answers.length) return;
  const rows = answers.map((answer) => ({
    id: answer.id,
    exam_section_id: answer.examSectionId,
    question_number: answer.questionNumber,
    correct_answer: answer.correctAnswer || null,
    points: 5,
    target_tracks: normalizeWeeklyQuestionTargetTracks(answer.targetTracks),
  }));
  let { error } = await remoteStore.from("exam_answers").upsert(rows, { onConflict: "id" });
  if (isMissingColumnError(error, "target_tracks")) {
    const fallbackRows = rows.map(({ target_tracks, ...row }) => row);
    ({ error } = await remoteStore.from("exam_answers").upsert(fallbackRows, { onConflict: "id" }));
  }
  if (error) throw error;
}

async function saveExamFilesToRemote(files) {
  if (!remoteStore || !files.length) return;
  const rows = files.map((file) => ({
    id: file.id,
    exam_section_id: file.examSectionId,
    file_type: file.fileType,
    file_path: file.filePath || null,
    file_url: file.fileUrl || null,
    original_name: file.originalName || null,
    uploaded_at: file.uploadedAt || new Date().toISOString(),
  }));
  const { error } = await remoteStore.from("exam_files").upsert(rows, { onConflict: "id" });
  if (error) throw error;
}

async function deleteExamFilesFromRemote(fileIds) {
  if (!remoteStore || !fileIds.length) return;
  const { error } = await remoteStore.from("exam_files").delete().in("id", fileIds);
  if (error) throw error;
}

async function saveExamSubjectSettingsToRemote(settings) {
  if (!remoteStore || !settings.length) return;
  const rows = settings.map((setting) => ({
    id: setting.id,
    track: setting.track,
    subject: setting.subject,
    question_count: setting.questionCount,
    total_score: setting.totalScore,
    is_active: setting.isActive !== false,
    sort_order: setting.sortOrder || null,
    created_at: setting.createdAt || new Date().toISOString(),
    updated_at: setting.updatedAt || new Date().toISOString(),
  }));
  const { error } = await remoteStore.from("exam_subject_settings").upsert(rows, { onConflict: "track,subject" });
  if (error && !isMissingRelationError(error, "exam_subject_settings")) throw error;
}

async function deleteExamSubjectSettingFromRemote(settingId) {
  if (!remoteStore || !settingId) return;
  const { error } = await remoteStore.from("exam_subject_settings").delete().eq("id", settingId);
  if (error && !isMissingRelationError(error, "exam_subject_settings")) throw error;
}

async function saveExamSubmissionsToRemote(submissions) {
  if (!remoteStore || !submissions.length) return;
  const rows = submissions.map((submission) => ({
    id: submission.id,
    exam_section_id: submission.examSectionId,
    student_id: submission.studentId,
    student_name: submission.studentName,
    track: submission.track,
    status: submission.status,
    score: submission.score,
    correct_count: submission.correctCount,
    submitted_at: submission.submittedAt || null,
    created_at: submission.createdAt || new Date().toISOString(),
  }));
  const { error } = await remoteStore.from("exam_submissions").upsert(rows, { onConflict: "student_id,exam_section_id" });
  if (error) throw error;
}

async function saveSubmissionAnswersToRemote(answers) {
  if (!remoteStore || !answers.length) return;
  const rows = answers.map((answer) => ({
    id: answer.id,
    submission_id: answer.submissionId,
    question_number: answer.questionNumber,
    selected_answer: answer.selectedAnswer || null,
    is_correct: answer.isCorrect,
    points_awarded: answer.pointsAwarded || 0,
  }));
  const { error } = await remoteStore.from("submission_answers").upsert(rows, { onConflict: "submission_id,question_number" });
  if (error) throw error;
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

async function toggleStudentAttendanceExcluded(id) {
  const student = findStudent(id);
  if (!student) return;
  const nextValue = !isAttendanceExcludedStudent(student);
  const message = nextValue
    ? `${student.name} (${student.id}) 학생을 출석 미인증/벌점 대상에서 제외할까요?`
    : `${student.name} (${student.id}) 학생을 다시 출석 대상에 포함할까요?`;
  if (!confirm(message)) return;
  const previousValue = student.attendanceExcluded === true;
  student.attendanceExcluded = nextValue;
  try {
    await updateStudentAttendanceExcludedRemote(student.id, nextValue);
    saveState({ skipRemote: true });
    render();
    notify(nextValue ? "출석 제외로 변경했습니다." : "출석 포함으로 변경했습니다.");
  } catch (error) {
    console.error(error);
    student.attendanceExcluded = previousValue;
    render();
    notify("출석 제외 설정을 서버에 저장하지 못했습니다. Supabase 스키마를 먼저 반영해주세요.");
  }
}

async function updateStudentAttendanceExcludedRemote(id, excluded) {
  if (!remoteStore) {
    await loadSupabaseSdk();
    remoteStore = createRemoteStore();
  }
  if (!remoteStore) return;
  const { error } = await remoteStore
    .from("students")
    .update({ attendance_excluded: excluded })
    .eq("id", id);
  if (error) throw error;
}

async function deleteStudent(id) {
  const student = findStudent(id);
  if (!student) return;
  if (!confirm(student.name + " (" + student.id + ") 학생을 삭제할까요? 기존 외출 기록은 유지됩니다.")) return;
  const beforeStudents = [...state.students];
  const beforeProfiles = state.settings.studentProfiles ? { ...state.settings.studentProfiles } : null;
  const beforeAuthId = state.settings.studentAuthId;
  state.students = state.students.filter((item) => item.id !== student.id);
  if (state.settings.studentProfiles) delete state.settings.studentProfiles[student.id];
  if (state.settings.studentAuthId === student.id) state.settings.studentAuthId = "";
  try {
    try {
      await deleteStudentFromTeacherApi(student.id);
    } catch (error) {
      if (error?.message !== "service_role_not_configured") throw error;
      await deactivateStudentRemote(student.id);
    }
    saveState({ skipRemote: true });
    render();
    notify("학생을 삭제했습니다.");
  } catch (error) {
    console.error(error);
    state.students = beforeStudents;
    if (beforeProfiles) state.settings.studentProfiles = beforeProfiles;
    state.settings.studentAuthId = beforeAuthId;
    render();
    notify("학생 삭제를 서버에 저장하지 못했습니다. Supabase 스키마를 먼저 반영해주세요.");
  }
}

async function deleteStudentFromTeacherApi(id) {
  const response = await fetch("/api/students", {
    method: "DELETE",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  const data = await response.json().catch(() => ({ ok: false }));
  if (!response.ok || !data.ok) {
    const error = new Error(data.error || "student_delete_failed");
    error.status = response.status;
    throw error;
  }
}

async function deactivateStudentRemote(id) {
  if (!remoteStore) {
    await loadSupabaseSdk();
    remoteStore = createRemoteStore();
  }
  if (!remoteStore) return;
  const { error } = await remoteStore
    .from("students")
    .update({ is_active: false })
    .eq("id", id);
  if (error) throw error;
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

  student.passwordHash = "";
  student.deviceToken = "";
  student.appRegisteredAt = "";
  if (state.settings.studentProfiles?.[student.id]) {
    const profile = state.settings.studentProfiles[student.id];
    state.settings.studentProfiles[student.id] = {
      initialTrack: profile.initialTrack || profile.track || student.track || "",
      track: profile.track || student.track || "",
      gender: profile.gender || student.gender || "",
    };
  }
  if (state.settings.studentAuthId === student.id) state.settings.studentAuthId = "";

  saveState();
  render();
  notify("학생 앱 등록 상태를 초기화했습니다.");
}
