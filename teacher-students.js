function teacherStudentForm() {
  const selected = selectedStudentCohortCount();
  const visibleStudents = getStudentsInCohort(selected.value);
  const filteredStudents = getFilteredStudentAdminStudents(visibleStudents);
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

  const rows = [...filteredStudents]
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
        el("td", { className: "student-admin-actions" }, renderStudentAdminActionMenu(student, profile)),
      ]);
    });

  const studentTable = table(
    ["번호", "이름", "반", "앱 등록", "등록 시간", "직렬", "성별", "출석", "관리"],
    rows.length ? rows : [el("tr", {}, [el("td", { colSpan: 9 }, el("div", { className: "empty table-empty" }, visibleStudents.length ? "검색 결과가 없습니다." : "등록된 학생이 없습니다."))])]
  );
  studentTable.classList.add("student-admin-table-wrap");

  return el("div", { className: "grid" }, [
    panel("학생 등록", [form]),
    studentCountStatGroup(),
    studentAdminSearchControls(visibleStudents.length, filteredStudents.length),
    studentTable,
  ]);
}

function renderStudentAdminActionMenu(student, profile) {
  return el("details", { className: "student-action-menu" }, [
    el("summary", { className: "mini-btn student-action-menu-trigger" }, "관리"),
    el("div", { className: "student-action-menu-list" }, [
      button("미리보기", "student-action-menu-item", "button", () => openStudentPreview(student.id)),
      button("직렬 변경", "student-action-menu-item", "button", () => openStudentTrackEditModal(student.id)),
      button("기기 이력", "student-action-menu-item", "button", () => openStudentRegistrationHistory(student.id)),
      profile ? button("등록 초기화", "student-action-menu-item", "button", () => resetStudentAppRegistration(student.id)) : null,
      button(isAttendanceExcludedStudent(student) ? "출석 포함" : "출석 제외", "student-action-menu-item", "button", () => toggleStudentAttendanceExcluded(student.id)),
      button("삭제", "student-action-menu-item danger", "button", () => deleteStudent(student.id)),
    ]),
  ]);
}

function openStudentTrackEditModal(studentId) {
  const student = findStudent(studentId);
  if (!student) return notify("학생 정보를 찾을 수 없습니다.");
  const currentTrack = getTeacherStudentRegisteredTrack(student);
  const trackSelect = select("track", getCoastGuardTrackOptions());
  const customTrackInput = input("customTrack", "text", "직렬을 입력하세요");
  const customTrackField = field("기타 직렬", customTrackInput);
  customTrackField.hidden = true;
  if (getCoastGuardTrackOptions().includes(currentTrack)) {
    trackSelect.value = currentTrack;
  } else if (currentTrack) {
    trackSelect.value = "기타";
    customTrackInput.value = currentTrack;
    customTrackField.hidden = false;
  }
  trackSelect.addEventListener("change", () => {
    customTrackField.hidden = trackSelect.value !== "기타";
    if (customTrackField.hidden) customTrackInput.value = "";
  });

  const form = el("form", { className: "form-grid" }, [
    field("학생", el("strong", {}, `${student.name || "-"} (${student.id})`)),
    field("현재 직렬", el("span", {}, currentTrack || "-")),
    field("변경 직렬", trackSelect),
    customTrackField,
    el("div", { className: "attendance-modal-actions field full" }, [
      button("취소", "btn secondary", "button", closeInfoModal),
      button("저장", "btn"),
    ]),
  ]);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = formData(form);
    const nextTrack = resolveStudentTrack(data.track, data.customTrack);
    if (!nextTrack) return notify("변경할 직렬을 선택해주세요.");
    await updateStudentTrack(student.id, nextTrack);
  });

  openInfoModal({
    title: "학생 직렬 변경",
    content: form,
  });
}

async function updateStudentTrack(studentId, nextTrack) {
  const student = findStudent(studentId);
  const track = normalizeCoastGuardTrack(nextTrack);
  if (!student || !track) return notify("학생 또는 직렬 정보를 확인해주세요.");
  const previousStudent = { ...student };
  const previousProfile = state.settings.studentProfiles?.[student.id]
    ? { ...state.settings.studentProfiles[student.id] }
    : null;
  try {
    student.track = track;
    const profiles = state.settings.studentProfiles || {};
    if (profiles[student.id]) {
      profiles[student.id] = {
        ...profiles[student.id],
        track,
        initialTrack: track,
      };
    }
    await saveStudentsToRemote([student.id]);
    saveState({ skipRemote: true });
    closeInfoModal();
    render();
    notify(`${student.name || student.id} 학생의 직렬을 변경했습니다.`);
  } catch (error) {
    console.error(error);
    Object.assign(student, previousStudent);
    if (previousProfile) state.settings.studentProfiles[student.id] = previousProfile;
    notify("직렬 변경을 저장하지 못했습니다. 잠시 후 다시 시도해주세요.");
  }
}

function openStudentRegistrationHistory(studentId) {
  const student = findStudent(studentId);
  if (!student) return notify("학생 정보를 찾을 수 없습니다.");
  const events = getStudentRegistrationHistoryRows(student);
  const rows = events.map((event) =>
    el("tr", {}, [
      el("td", {}, formatDateCompact(event.createdAt)),
      el("td", {}, studentRegistrationEventLabel(event.eventType)),
      el("td", {}, studentRegistrationActorLabel(event.actor)),
      el("td", {}, event.reason || "-"),
      el("td", {}, event.clientDisplayMode || "-"),
      el("td", { title: event.deviceToken || "" }, formatDeviceTokenPreview(event.deviceToken)),
    ])
  );

  openInfoModal({
    title: `${student.name || "학생"} 기기 등록 이력`,
    className: "student-registration-history-modal",
    content: el("div", { className: "student-registration-history" }, [
      rows.length
        ? table(["일시", "내용", "처리자", "사유", "환경", "기기 토큰"], rows)
        : el("div", { className: "empty" }, "기기 등록 이력이 없습니다."),
    ]),
  });
}

function getStudentRegistrationHistoryRows(student) {
  const events = getStudentRegistrationEvents(student.id);
  if (events.length || !student.appRegisteredAt) return events;
  return [{
    id: `current-${student.id}`,
    studentId: student.id,
    studentName: student.name || "",
    eventType: "registered",
    deviceToken: student.deviceToken || "",
    reason: "현재 등록 상태",
    actor: "student",
    clientDisplayMode: "",
    createdAt: student.appRegisteredAt,
  }];
}

function studentRegistrationEventLabel(type) {
  if (type === "reset") return "등록 초기화";
  if (type === "registered") return "기기 등록";
  return type || "-";
}

function studentRegistrationActorLabel(actor) {
  if (actor === "teacher") return "관리자";
  if (actor === "student") return "학생";
  return actor || "-";
}

function formatDeviceTokenPreview(token) {
  const value = String(token || "");
  if (!value) return "-";
  return value.length > 12 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value;
}

function getCohortFromStudentId(studentId) {
  const id = String(studentId || "").trim();
  if (!/^\d{4,}$/.test(id)) return "-";
  return id.slice(0, -3);
}

function getAllDeviceHistoryEvents() {
  const events = [...(state.studentRegistrationEvents || [])];
  const knownCurrentRegistrations = new Set(
    events
      .filter((event) => event.eventType === "registered")
      .map((event) => `${event.studentId}:${event.createdAt}`)
  );
  (state.students || []).forEach((student) => {
    if (!student.appRegisteredAt) return;
    const key = `${student.id}:${student.appRegisteredAt}`;
    if (knownCurrentRegistrations.has(key)) return;
    events.push({
      id: `current-${student.id}`,
      studentId: student.id,
      studentName: student.name || "",
      eventType: "registered",
      deviceToken: student.deviceToken || "",
      reason: "현재 등록 상태",
      actor: "student",
      clientDisplayMode: "",
      clientUserAgent: "",
      createdAt: student.appRegisteredAt,
    });
  });
  return events.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

function getFilteredDeviceHistoryEvents() {
  const query = String(deviceHistoryFilters.query || "").trim().toLowerCase();
  const eventType = deviceHistoryFilters.eventType || "all";
  return getAllDeviceHistoryEvents()
    .map((event) => ({ event, student: findStudent(event.studentId) }))
    .filter(({ event, student }) => {
      if (eventType !== "all" && event.eventType !== eventType) return false;
      if (!query) return true;
      return [
        event.studentId,
        event.studentName,
        student?.name,
        student?.id,
        event.reason,
        event.actor,
        event.clientDisplayMode,
        event.clientUserAgent,
        event.deviceToken,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
}

function deviceHistorySearchControls(filteredCount) {
  const search = input("deviceHistorySearch", "search", "학생, 사유, 처리자, 기기 토큰 검색", deviceHistoryFilters.query);
  const eventType = select("deviceHistoryEventType", ["전체", "기기 등록", "등록 초기화"]);
  eventType.value = deviceHistoryFilters.eventType === "registered"
    ? "기기 등록"
    : deviceHistoryFilters.eventType === "reset"
      ? "등록 초기화"
      : "전체";
  const form = el("form", { className: "teacher-search device-history-search" }, [
    field("검색", search),
    field("구분", eventType),
    el("div", { className: "field" }, [
      el("span", {}, " "),
      button("검색", "btn secondary"),
    ]),
  ]);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    deviceHistoryFilters.query = search.value;
    deviceHistoryFilters.eventType = eventType.value === "기기 등록" ? "registered" : eventType.value === "등록 초기화" ? "reset" : "all";
    render();
  });

  return el("div", { className: "teacher-tools device-history-tools" }, [
    form,
    el("div", { className: "field student-admin-result" }, [
      el("span", {}, "검색 결과"),
      el("strong", {}, `${filteredCount}건`),
    ]),
  ]);
}

function formatUserAgentPreview(userAgent) {
  const value = String(userAgent || "");
  if (!value) return "-";
  return value.length > 28 ? `${value.slice(0, 28)}...` : value;
}

function studentAdminSearchControls(totalCount, filteredCount) {
  const search = input("studentAdminSearch", "search", "번호 또는 이름 검색", studentAdminFilters.query);
  const form = el("form", { className: "teacher-search student-admin-search" }, [
    field("학생 검색", search),
    el("div", { className: "field" }, [
      el("span", {}, " "),
      button("검색", "btn secondary"),
    ]),
  ]);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    studentAdminFilters.query = search.value;
    render();
  });

  return el("div", { className: "teacher-tools student-admin-tools" }, [
    form,
    el("div", { className: "field student-admin-result" }, [
      el("span", {}, "검색 결과"),
      el("strong", {}, `${filteredCount}/${totalCount}명`),
    ]),
  ]);
}

function openStudentPreview(studentId) {
  previewStudentId = String(studentId || "").trim();
  const nextHash = `student-preview?student=${encodeURIComponent(previewStudentId)}`;
  if (location.hash === `#${nextHash}`) {
    currentRoute = "student-preview";
    render();
    scrollAppToTop();
    return;
  }
  location.hash = nextHash;
}

function renderStudentPreviewAdmin() {
  if (!hasTeacherPermission("students.read")) return renderForbidden();
  const studentId = previewStudentId || getStudentPreviewHashStudentId();
  if (studentId) previewStudentId = studentId;
  const student = findStudent(studentId);
  if (!student) {
    return el("div", { className: "grid" }, [
      panel("학생 미리보기", [
        el("div", { className: "empty" }, "학생 등록 목록에서 미리보기할 학생을 선택해주세요."),
        button("학생 등록으로", "btn secondary", "button", () => navigate("students")),
      ]),
    ]);
  }

  return el("div", { className: "grid student-preview-admin" }, [
    panel("학생 미리보기", [
      el("div", { className: "student-preview-header" }, [
        el("div", {}, [
          el("strong", {}, `${student.name} (${student.id})`),
          el("p", { className: "subtle" }, "학생 등록이나 기기 인증 정보를 변경하지 않는 읽기 전용 화면입니다."),
        ]),
        button("학생 등록으로", "btn secondary", "button", () => navigate("students")),
      ]),
    ]),
    renderStudentPreviewProfile(student),
    renderStudentPreviewHome(student),
    renderStudentPreviewGrades(student),
    renderStudentPreviewHistory(student),
  ]);
}

function getStudentPreviewHashStudentId() {
  const hash = String(location.hash || "").replace(/^#/, "");
  const queryStart = hash.indexOf("?");
  if (queryStart < 0) return "";
  const params = new URLSearchParams(hash.slice(queryStart + 1));
  return String(params.get("student") || "").trim();
}

function renderStudentPreviewProfile(student) {
  const profile = getStudentProfileForTeacher(student.id) || {};
  return panel("마이페이지", [
    el("section", { className: "student-profile-card" }, [
      el("div", { className: "student-profile-head" }, [
        el("div", { className: "student-avatar" }, String(student.name || "?").slice(0, 1)),
        el("div", {}, [
          el("span", {}, "학생 정보"),
          el("h2", {}, student.name || "-"),
        ]),
      ]),
      el("div", { className: "student-profile-list" }, [
        profileItem("학생 고유번호", student.id),
        profileItem("반", student.className || state.settings.className || "오프라인반"),
        profileItem("직렬", normalizeCoastGuardTrack(profile.initialTrack || profile.track || student.track) || "-"),
        profileItem("성별", profile.gender || student.gender || "-"),
        profileItem("앱 등록", profile.deviceToken ? "완료" : "미등록"),
      ]),
    ]),
  ]);
}

function renderStudentPreviewHome(student) {
  const activeOuting = getActiveOuting(student.id);
  const todayAttendance = getStudentAttendanceForDate(student.id);
  const holiday = getAttendanceHoliday();
  const attendanceText = holiday && !todayAttendance
    ? attendanceHolidayMessage(holiday.dateKey)
    : todayAttendance
      ? studentPreviewAttendanceText(todayAttendance)
      : "오늘 출석 인증 전입니다.";
  const homeStatus = getStudentHomeStatus(activeOuting);

  return panel("학생 홈", [
    el("section", { className: "student-dday-card" }, [
      el("div", {}, [
        el("span", {}, COAST_GUARD_EXAM_LABEL),
        el("strong", {}, formatDday(COAST_GUARD_EXAM_DATE)),
      ]),
      el("p", {}, `${formatExamDate(COAST_GUARD_EXAM_DATE)} 시험 기준`),
    ]),
    el("section", { className: "student-summary-card" }, [
      el("div", {}, [
        el("strong", {}, "출석 인증"),
        el("p", {}, attendanceText),
      ]),
    ]),
    el("section", { className: "student-summary-card" }, [
      el("div", {}, [
        el("strong", {}, homeStatus.title),
        homeStatus.copy ? el("p", {}, homeStatus.copy) : null,
      ]),
    ]),
  ]);
}

function studentPreviewAttendanceText(check) {
  if (check.status === "present") return `출석 완료 (${formatTimeOnly(check.createdAt)})`;
  if (check.status === "pre_arrival_reason") return "등원 전 사유신청 접수";
  if (check.status === "pre_arrival_verified") return "사유신청 후 등원 완료";
  return "출석 상태 확인 중";
}

function renderStudentPreviewGrades(student) {
  const weeklyExams = getTeacherPreviewWeeklyExamOptions(student);
  const selectedWeeklyExam = getTeacherPreviewSelectedWeeklyExam(student, weeklyExams);
  const roundOptions = getTeacherPreviewFinalRoundOptions(student);
  const selectedRound = Number(studentPreviewFinalRoundByStudent[student.id]) || 0;
  const round = roundOptions.includes(selectedRound) ? selectedRound : roundOptions[roundOptions.length - 1] || 0;
  if (round) studentPreviewFinalRoundByStudent[student.id] = round;
  const summary = round ? getTeacherPreviewFinalSummary(student, round) : null;
  return panel("성적", [
    renderStudentWeeklyGradePreviewPanel(student, selectedWeeklyExam, weeklyExams),
    renderStudentGradePreviewPanel(summary, roundOptions),
  ]);
}

function getTeacherPreviewWeeklyExamOptions(student) {
  const cohort = getStudentCohort(student);
  return [...(state.exams || [])]
    .filter((exam) => String(exam.cohort || "") === String(cohort || ""))
    .sort((a, b) => Number(b.weekNumber) - Number(a.weekNumber) || String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

function getTeacherPreviewSelectedWeeklyExam(student, exams = []) {
  const selectedId = studentPreviewWeeklyExamByStudent[student.id] || "";
  const selected = exams.find((exam) => exam.id === selectedId) || exams[0] || null;
  if (selected) studentPreviewWeeklyExamByStudent[student.id] = selected.id;
  return selected;
}

function renderTeacherPreviewWeeklyExamSelect(studentId, exams = [], selectedExam) {
  const node = el("select", {
    className: "student-grade-round-select",
    ariaLabel: "주간평가 주차 선택",
  }, exams.map((exam) => el("option", { value: exam.id }, `${Number(exam.weekNumber) || 1}주차`)));
  node.value = selectedExam?.id || "";
  node.addEventListener("change", () => {
    studentPreviewWeeklyExamByStudent[studentId] = node.value;
    render();
  });
  return node;
}

function renderStudentWeeklyGradePreviewPanel(student, exam, exams = []) {
  const summary = exam ? getTeacherPreviewWeeklySummary(student, exam) : null;
  const title = exam ? `${Number(exam.weekNumber) || 1}주차 주간평가 성적` : "주간평가 성적";
  const headerControl = exam ? renderTeacherPreviewWeeklyExamSelect(student.id, exams, exam) : null;
  if (!summary || !summary.submittedCount) {
    return el("div", { className: "student-grade-result" }, [
      el("div", { className: "student-grade-result-title" }, [
        el("strong", {}, title),
        headerControl,
      ]),
      renderTeacherPreviewGradeSummary({ trackText: getTeacherStudentRegisteredTrack(student) }),
      el("div", { className: "empty" }, exam ? "제출된 주간평가 성적이 없습니다." : "조회할 주간평가가 없습니다."),
    ]);
  }
  const subjectSummaries = getTeacherPreviewWeeklySubjectSummaries(student, exam, summary);
  return el("div", { className: "student-grade-result" }, [
    el("div", { className: "student-grade-result-title" }, [
      el("strong", {}, title),
      headerControl,
    ]),
    renderTeacherPreviewGradeSummary({
      label: summary.rank ? formatTopPercentLabel(summary.topPercent) : "",
      metaText: summary.rank ? `응시자 ${summary.total || 0}명 중 ${summary.rank}등` : "",
      scoreValue: `${summary.score}/${summary.maxScore}점`,
      wrongValue: formatTeacherPreviewWrongCount(summary.wrongCount),
      rankValue: summary.rank ? `${summary.rank}등` : "-",
      topPercent: summary.topPercent,
      trackText: getTeacherStudentRegisteredTrack(student),
    }),
    renderTeacherPreviewSubjectGradeList(subjectSummaries),
  ]);
}

function getTeacherPreviewWeeklySummary(student, exam) {
  const students = getStudentsInCohort(getStudentCohort(student));
  const summaries = applyWeeklyGradeRanksByTrack(students.map((item) => getWeeklyGradeStudentSummary(exam, item)));
  const summary = summaries.find((item) => String(item.student.id) === String(student.id)) || null;
  if (!summary) return null;
  const track = getTeacherStudentRegisteredTrack(student) || "미분류";
  summary.total = summaries.filter((item) =>
    item.submittedCount > 0 &&
    Number(item.maxScore) > 0 &&
    getTeacherStudentRegisteredTrack(item.student) === track
  ).length;
  return summary;
}

function getTeacherPreviewWeeklySubjectSummaries(student, exam, summary) {
  return getWeeklyGradeSectionsForStudent(exam, student).map((section) => {
    const subjectScore = summary.subjectScores?.[section.subject] || {};
    const submitted = subjectScore.status === "submitted";
    return {
      subject: section.subject,
      track: getTeacherStudentRegisteredTrack(student),
      submitted,
      score: Number(subjectScore.score) || 0,
      wrongCount: submitted ? Math.max(0, (Number(subjectScore.questionCount) || 0) - (Number(subjectScore.correctCount) || 0)) : "-",
      rank: 0,
      topPercent: 0,
      displayTopPercent: 0,
      maxScore: Number(subjectScore.maxScore) || 0,
    };
  });
}

function renderTeacherPreviewFinalRoundSelect(studentId, roundOptions = []) {
  const node = el("select", {
    className: "student-grade-round-select",
    ariaLabel: "파이널 성적 회차 선택",
  }, roundOptions.map((round) => el("option", { value: String(round) }, `${round}회차`)));
  node.value = String(studentPreviewFinalRoundByStudent[studentId] || roundOptions[roundOptions.length - 1] || "");
  node.addEventListener("change", () => {
    studentPreviewFinalRoundByStudent[studentId] = Number(node.value) || 0;
    render();
  });
  return node;
}

function getTeacherPreviewFinalRoundOptions(student) {
  const studentId = String(student?.id || "").trim();
  const sources = [state.finalExamScores, state.finalMockScores, state.mockExamScores, state.finalScores].filter(Array.isArray);
  const records = sources.flat()
    .filter((record) => hasTeacherPreviewFinalScore({
      score: record.score ?? record.totalScore ?? record.total_score ?? "",
      maxScore: record.maxScore ?? record.max_score ?? record.totalPossible ?? "",
      wrongCount: record.wrongCount ?? record.wrong_count ?? record.incorrectCount ?? record.incorrect_count ?? "",
      subjectScores: normalizeFinalMockSubjectScores(record),
    }));
  const studentRounds = records
    .filter((record) => String(record.studentId || record.student_id || record.studentNumber || "").trim() === studentId)
    .map((record) => Number(record.round || record.roundNumber || record.session || record.sessionNumber || record.examRound || record.examNumber || 0))
    .filter((round) => Number.isFinite(round) && round > 0);
  const rounds = studentRounds.length
    ? studentRounds
    : records
      .map((record) => Number(record.round || record.roundNumber || record.session || record.sessionNumber || record.examRound || record.examNumber || 0))
      .filter((round) => Number.isFinite(round) && round > 0);
  return Array.from(new Set(rounds))
    .sort((a, b) => a - b);
}

function hasTeacherPreviewFinalScore(record) {
  if (!record) return false;
  if ([record.score, record.maxScore, record.wrongCount].some((value) => value !== "" && value !== null && value !== undefined)) return true;
  return Object.values(record.subjectScores || {}).some((score) => score?.status !== "empty");
}

function getTeacherPreviewFinalSummary(student, round) {
  const students = getStudentsInCohort(getStudentCohort(student));
  const records = getFinalMockScoreRecords(round);
  const participants = getFinalMockGradeParticipants(getStudentCohort(student), students, records);
  const summaries = applyGradeRanksByTrack(participants.map((item) => getFinalMockGradeStudentSummary(item, records)));
  applyTeacherPreviewFinalSubjectRanks(summaries);
  const summary = summaries.find((item) => String(item.student.id) === String(student.id)) || null;
  if (!summary) return null;
  const track = getTeacherStudentRegisteredTrack(student) || "미분류";
  summary.round = round;
  summary.total = summaries.filter((item) =>
    item.hasScore &&
    getTeacherStudentRegisteredTrack(item.student) === track
  ).length;
  return summary;
}

function renderStudentGradePreviewPanel(summary, roundOptions) {
  if (!summary || !summary.hasScore) {
    return el("div", { className: "student-grade-result" }, [
      renderTeacherPreviewGradeSummary({ trackText: summary?.student ? getTeacherStudentRegisteredTrack(summary.student) : "" }),
      el("div", { className: "empty" }, "입력된 파이널 성적이 없습니다."),
    ]);
  }
  const subjectSummaries = getTeacherPreviewFinalSubjectHeadersForTrack(getTeacherStudentRegisteredTrack(summary.student)).map((subject) => {
    const subjectScore = summary.subjectScores[subject] || {};
    const score = Number(subjectScore.score) || 0;
    const submitted = subjectScore.status !== "empty";
    const maxScore = Number(subjectScore.maxScore) || (submitted ? 100 : 0);
    return {
      subject,
      track: getTeacherStudentRegisteredTrack(summary.student),
      submitted,
      score,
      wrongCount: maxScore ? Math.max(0, Math.round((maxScore - score) / 5)) : "-",
      rank: Number(subjectScore.rank) || 0,
      topPercent: Number(subjectScore.topPercent) || 0,
      displayTopPercent: subjectScore.rank ? Math.max(1, Math.ceil(Number(subjectScore.topPercent) || 0)) : 0,
      maxScore,
    };
  });
  return el("div", { className: "student-grade-result" }, [
    el("div", { className: "student-grade-result-title" }, [
      el("strong", {}, `${Number(summary.round) || roundOptions[roundOptions.length - 1]}회차 파이널 성적`),
      roundOptions.length ? renderTeacherPreviewFinalRoundSelect(summary.student.id, roundOptions) : null,
    ]),
    renderTeacherPreviewGradeSummary({
      label: summary.rank ? formatTopPercentLabel(summary.topPercent) : "",
      metaText: summary.rank ? `응시자 ${summary.total || 0}명 중 ${summary.rank}등` : "",
      scoreValue: `${summary.score}/${summary.maxScore}점`,
      wrongValue: formatTeacherPreviewWrongCount(summary.wrongCount),
      rankValue: summary.rank ? `${summary.rank}등` : "-",
      topPercent: summary.topPercent,
      trackText: getTeacherStudentRegisteredTrack(summary.student),
    }),
    renderTeacherPreviewSubjectGradeList(subjectSummaries),
  ]);
}

function renderTeacherPreviewGradeSummary({ label = "", metaText = "", scoreValue = "", wrongValue = "", rankValue = "", topPercent = 0, trackText = "" } = {}) {
  return el("section", { className: "student-grade-overview", ariaLabel: "성적 요약" }, [
    el("div", { className: "student-grade-overview-head" }, [
      el("span", { className: "student-grade-overview-label" }, "내 위치"),
      trackText ? el("span", { className: "student-grade-overview-track" }, trackText) : null,
    ]),
    el("strong", { className: "student-grade-overview-value" }, label || "준비 중"),
    el("span", { className: "student-grade-overview-meta" }, metaText || "성적 집계 후 표시됩니다."),
    renderTeacherPreviewGradeProgress(rankValue && rankValue !== "-" ? topPercent : null),
    el("div", { className: "detail-grid student-grade-overview-grid" }, [
      renderTeacherPreviewGradeMetric("총점", scoreValue || "-"),
      renderTeacherPreviewGradeMetric("오답", wrongValue || "-"),
      renderTeacherPreviewGradeMetric("등수", rankValue || "-"),
    ]),
  ]);
}

function renderTeacherPreviewGradeProgress(topPercent) {
  const rawPercent = topPercent === null ? 0 : Number(topPercent) || 0;
  const percent = topPercent === null ? 0 : Math.max(1, Math.min(100, Math.ceil(100 - rawPercent)));
  return el("div", {
    className: "student-grade-progress",
    role: "meter",
    ariaLabel: "내 위치 백분율",
    ariaValueMin: "0",
    ariaValueMax: "100",
    ariaValueNow: String(percent),
  }, [
    el("span", { className: "student-grade-progress-fill", style: `width: ${percent}%` }),
  ]);
}

function renderTeacherPreviewGradeMetric(label, value) {
  return el("div", { className: "detail-item" }, [
    el("span", {}, label),
    el("strong", {}, value),
  ]);
}

function renderTeacherPreviewSubjectGradeList(subjectSummaries = []) {
  return el("div", { className: "student-grade-subject-list" }, [
    el("strong", {}, "과목별 성적"),
    subjectSummaries.length
      ? subjectSummaries.map((item) => el("article", { className: "student-grade-subject-card" }, [
          el("h3", {}, formatTeacherPreviewFinalSubjectName(item.subject, item.track)),
          el("div", { className: "detail-grid" }, [
            el("div", { className: "detail-item" }, [el("span", {}, "점수"), el("strong", {}, item.submitted ? `${item.score}점` : "미제출")]),
            el("div", { className: "detail-item" }, [el("span", {}, "오답"), el("strong", {}, item.submitted ? formatTeacherPreviewWrongCount(item.wrongCount) : "-")]),
            el("div", { className: "detail-item" }, [el("span", {}, "위치"), el("strong", {}, item.rank ? formatTeacherPreviewSubjectPositionLabel(item.topPercent ?? item.displayTopPercent) : "-")]),
          ]),
        ]))
      : el("div", { className: "empty" }, "표시할 과목별 성적이 없습니다."),
  ]);
}

function getTeacherPreviewFinalSubjectHeadersForTrack(track) {
  const finalSubjects = getGradeSubjectHeaders();
  return getFinalGradeSubjectsForTrack(track, finalSubjects);
}

function formatTeacherPreviewFinalSubjectName(subject, track = "") {
  return formatFinalGradeSubjectDisplayName(subject, track);
}

function formatTeacherPreviewSubjectPositionLabel(value) {
  const percent = Number(value);
  if (!Number.isFinite(percent)) return "-";
  return `상위 ${Math.max(1, Math.ceil(percent))}%`;
}

function formatTeacherPreviewWrongCount(value) {
  if (value === "" || value === null || value === undefined || value === "-") return "-";
  const count = Number(value);
  return Number.isFinite(count) ? `${count}개` : "-";
}

function renderStudentPreviewHistory(student) {
  const outingCount = state.outings.filter((outing) => outing.studentId === String(student.id)).length;
  const penaltyCount = getPenaltiesForStudent(student.id).length;
  const penaltyTotal = getPenaltyTotal(student.id);
  return panel("내역", [
    el("div", { className: "detail-grid" }, [
      el("div", { className: "detail-item" }, [el("span", {}, "외출 내역"), el("strong", {}, `${outingCount}건`)]),
      el("div", { className: "detail-item" }, [el("span", {}, "상/벌점 내역"), el("strong", {}, `${penaltyCount}건`)]),
      el("div", { className: "detail-item" }, [el("span", {}, "상/벌점 합계"), el("strong", {}, formatPenaltyPoints(penaltyTotal))]),
    ]),
  ]);
}

function canCancelPenalty(penalty) {
  return canManagePenaltyDeletes() && Boolean(penalty?.id) && Boolean(String(penalty?.reason || "").trim()) && !isPenaltyDeleted(penalty);
}

function canManagePenaltyDeletes() {
  return isTeacherAdmin();
}

function cancelPenalty(id) {
  const penalty = (state.penalties || []).find((item) => item.id === id);
  if (!canCancelPenalty(penalty)) return notify("삭제할 수 없는 상/벌점 내역입니다.");
  openPenaltyDeletePasswordModal(penalty);
}

function openPenaltyDeletePasswordModal(penalty) {
  closeInfoModal();
  const passwordInput = input("adminPassword", "password", "관리자 패스워드");
  passwordInput.required = true;
  const form = el("form", { className: "form-grid penalty-form" }, [
    field("학생", el("strong", {}, `${penalty.studentName || "학생"} (${formatStudentNumber(penalty.studentId)})`)),
    field("내역", el("span", {}, `${formatPenaltyPoints(penalty.points)} · ${penalty.reason || "-"}`), "full"),
    field("관리자 패스워드", passwordInput, "full"),
    el("div", { className: "field full" }, [
      el("div", { className: "attendance-modal-actions" }, [
        button("삭제 처리", "btn danger"),
        button("취소", "btn secondary", "button", closeInfoModal),
      ]),
    ]),
  ]);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = formData(form);
    const adminPassword = String(data.adminPassword || "");
    if (!adminPassword) return notify("관리자 패스워드를 입력해주세요.");

    const submitButton = form.querySelector("button[type='submit']");
    if (submitButton) {
      submitButton.disabled = true;
      setButtonLoading(submitButton, "삭제 중...");
    }
    const beforePenalties = [...(state.penalties || [])];
    try {
      const deletedPenalty = await deletePenaltyFromTeacherApi(penalty.id, adminPassword);
      state.penalties = (state.penalties || []).map((item) =>
        item.id === penalty.id ? (deletedPenalty || { ...item, deletedAt: new Date().toISOString(), deletedBy: teacherAuth.user?.username || "admin" }) : item
      );
      saveState({ skipRemote: true });
      closeInfoModal();
      render();
      notify("상/벌점 내역을 삭제 처리했습니다.");
    } catch (error) {
      console.error(error);
      state.penalties = beforePenalties;
      render();
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "삭제 처리";
      }
      notify(error.message === "invalid_admin_password" ? "관리자 패스워드가 일치하지 않습니다." : "상/벌점 삭제를 서버에 저장하지 못했습니다.");
    }
  });

  const modal = el("div", { className: "info-modal", role: "dialog", ariaModal: "true" }, [
    el("button", { className: "info-modal-backdrop", type: "button", ariaLabel: "상/벌점 삭제 닫기" }),
    el("div", { className: "info-modal-panel penalty-modal" }, [
      el("strong", {}, "상/벌점 삭제 확인"),
      form,
    ]),
  ]);
  modal.querySelector(".info-modal-backdrop").addEventListener("click", closeInfoModal);
  document.body.appendChild(modal);
  document.addEventListener("keydown", closeInfoModalOnEscape);
  passwordInput.focus();
}

async function deletePenaltyFromTeacherApi(id, adminPassword) {
  const response = await fetch("/api/penalties", {
    method: "DELETE",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, adminPassword }),
  });
  const data = await response.json().catch(() => ({ ok: false }));
  if (!response.ok || !data.ok) throw new Error(data.error || "penalty_delete_failed");
  return data.penalty ? mapPenaltyFromRemote(data.penalty) : null;
}

async function saveStudentsToTeacherApi(students) {
  const response = await fetch("/api/students", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ students }),
  });
  const data = await response.json().catch(() => ({ ok: false }));
  if (response.status === 503 && data.error === "service_role_not_configured") return false;
  if (!response.ok || !data.ok) throw new Error(data.error || "student_save_failed");
  return true;
}

async function saveStudentsToRemote(studentIds) {
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
  if (APP_MODE === "teacher" && await saveStudentsToTeacherApi(rows)) return;

  if (!remoteStore) {
    await loadSupabaseSdk();
    remoteStore = createRemoteStore();
  }
  if (!remoteStore) return;

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


function parseStudentRoster(value, cohort) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.includes(",") || line.includes("\t") ? line.split(/[,\t]/) : line.split(/\s+/);
      const studentNumber = Number((parts.shift() || "").trim());
      const name = parts.join(" ").trim();
      if (!Number.isInteger(studentNumber) || studentNumber < 1 || studentNumber > 999 || !name) return null;
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

  const previousDeviceToken = student.deviceToken || "";
  student.passwordHash = "";
  student.deviceToken = "";
  student.appRegisteredAt = "";
  addStudentRegistrationEvent(student, "reset", {
    deviceToken: previousDeviceToken,
    actor: "teacher",
    reason: "관리자 등록 초기화",
  });
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
