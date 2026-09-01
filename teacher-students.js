const LECTURE_APPLICATION_STATUS_LABELS = {
  pending: "검토 대기",
  approved: "승인",
  rejected: "반려",
  cancelled: "취소",
};
const LECTURE_REFERRAL_SOURCE_LABELS = {
  naver_cafe: "네이버 카페",
  referral: "지인 추천",
  youtube: "유튜브",
  search: "검색",
  other: "기타",
};
const LECTURE_APPLICATION_COURSE_TYPE_LABELS = {
  offline: "오프라인반",
  online_managed: "온라인 관리반",
  lecture: "인강생",
};
const lectureApplicationAdminState = {
  applications: [],
  loading: false,
  loaded: false,
  error: "",
  status: "pending",
};

const studentExamNumberAdminState = {
  loading: false,
  loaded: false,
  saving: false,
  error: "",
  cohort: "",
  students: [],
  values: new Map(),
  drafts: new Map(),
  dirtyStudentIds: new Set(),
};

function renderStudentExamNumberAdmin() {
  if (!hasTeacherPermission("exam_numbers.read")) return renderForbidden();
  ensureStudentExamNumberAdminLoaded();

  if (studentExamNumberAdminState.loading && !studentExamNumberAdminState.loaded) {
    return el("div", { className: "grid" }, [
      panel("응시번호 입력", [el("div", { className: "empty" }, "현재 오프라인 학생 명단을 불러오는 중입니다.")]),
    ]);
  }
  if (studentExamNumberAdminState.error && !studentExamNumberAdminState.loaded) {
    const message = studentExamNumberAdminState.error === "exam_number_table_unavailable"
      ? "응시번호 저장소가 아직 준비되지 않았습니다. 데이터베이스 설정 후 다시 시도해주세요."
      : "응시번호 명단을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.";
    return el("div", { className: "grid" }, [
      panel("응시번호 입력", [
        el("div", { className: "empty" }, message),
        button("다시 불러오기", "btn secondary", "button", () => loadStudentExamNumberAdminData({ force: true })),
      ]),
    ]);
  }

  const cohorts = getStudentExamNumberCohorts();
  if (!cohorts.length) {
    return el("div", { className: "grid" }, [
      panel("응시번호 입력", [el("div", { className: "empty" }, "현재 재원 중인 오프라인 학생이 없습니다.")]),
    ]);
  }
  if (!cohorts.includes(studentExamNumberAdminState.cohort)) {
    studentExamNumberAdminState.cohort = getDefaultStudentExamNumberCohort(cohorts);
  }

  const cohort = studentExamNumberAdminState.cohort;
  const students = studentExamNumberAdminState.students
    .filter((student) => student.cohort === cohort)
    .sort((a, b) => String(a.id).localeCompare(String(b.id), "ko-KR", { numeric: true }));
  const completedCount = students.filter((student) => normalizeStudentExamNumber(studentExamNumberAdminState.drafts.get(student.id))).length;
  const cohortSelect = el("select", { ariaLabel: "응시번호 입력 기수 선택" }, cohorts.map((value) =>
    el("option", { value }, `${value}기`)
  ));
  cohortSelect.value = cohort;
  cohortSelect.addEventListener("change", () => {
    studentExamNumberAdminState.cohort = cohortSelect.value;
    render();
  });
  const searchInput = input("studentExamNumberSearch", "search", "이름 또는 등록번호 검색");
  const countLabel = el("span", { className: "student-exam-number-count" }, `${students.length}명 중 ${completedCount}명 입력`);
  const downloadButton = button("엑셀 다운로드", "btn secondary", "button", () => {
    downloadStudentExamNumberWorkbook(cohort, students);
  });
  const saveButton = button("변경사항 저장", "btn", "submit");
  saveButton.disabled = studentExamNumberAdminState.saving || !studentExamNumberAdminState.dirtyStudentIds.size;

  const rowRecords = students.map((student) => {
    const examNumberInput = el("input", {
      className: "student-exam-number-input",
      type: "text",
      value: studentExamNumberAdminState.drafts.get(student.id) || "",
      maxLength: 50,
      placeholder: "응시번호 입력",
      autocomplete: "off",
      spellcheck: false,
      ariaLabel: `${student.name} 응시번호`,
    });
    const row = el("tr", {
      "data-search-text": `${student.id} ${student.name}`.toLowerCase(),
    }, [
      el("td", {}, student.id),
      el("td", {}, student.name),
      el("td", {}, student.track || "-"),
      el("td", {}, examNumberInput),
    ]);
    examNumberInput.addEventListener("input", () => {
      const nextValue = examNumberInput.value;
      studentExamNumberAdminState.drafts.set(student.id, nextValue);
      const normalized = normalizeStudentExamNumber(nextValue);
      const saved = normalizeStudentExamNumber(studentExamNumberAdminState.values.get(student.id));
      if (normalized === saved) studentExamNumberAdminState.dirtyStudentIds.delete(student.id);
      else studentExamNumberAdminState.dirtyStudentIds.add(student.id);
      row.classList.toggle("is-dirty", normalized !== saved);
      saveButton.disabled = studentExamNumberAdminState.saving || !studentExamNumberAdminState.dirtyStudentIds.size;
    });
    row.classList.toggle("is-dirty", studentExamNumberAdminState.dirtyStudentIds.has(student.id));
    return { row };
  });

  const studentTable = table(
    ["등록번호", "이름", "직렬", "응시번호"],
    rowRecords.length
      ? rowRecords.map((record) => record.row)
      : [el("tr", {}, [el("td", { colSpan: 4 }, el("div", { className: "empty table-empty" }, "이 기수의 오프라인 학생이 없습니다."))])]
  );
  studentTable.classList.add("student-exam-number-table-wrap");
  searchInput.addEventListener("input", () => {
    const query = String(searchInput.value || "").trim().toLowerCase();
    let visibleCount = 0;
    rowRecords.forEach(({ row }) => {
      row.hidden = Boolean(query) && !String(row.dataset.searchText || "").includes(query);
      if (!row.hidden) visibleCount += 1;
    });
    countLabel.textContent = query
      ? `${visibleCount}명 검색됨 · 전체 ${completedCount}/${students.length}명 입력`
      : `${students.length}명 중 ${completedCount}명 입력`;
  });

  const form = el("form", { className: "student-exam-number-form" }, [
    el("div", { className: "student-exam-number-toolbar" }, [
      field("기수", cohortSelect),
      field("학생 검색", searchInput),
      el("div", { className: "student-exam-number-summary" }, [countLabel, downloadButton, saveButton]),
    ]),
    studentTable,
  ]);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveStudentExamNumberChanges(saveButton);
  });

  return el("div", { className: "grid student-exam-number-admin" }, [
    panel("응시번호 입력", [
      el("p", { className: "subtle" }, "현재 재원 중인 오프라인 학생만 표시됩니다. 기수를 선택하고 응시번호를 입력한 뒤 한 번에 저장하세요."),
      form,
    ]),
  ]);
}

function ensureStudentExamNumberAdminLoaded() {
  if (studentExamNumberAdminState.loaded || studentExamNumberAdminState.loading) return;
  loadStudentExamNumberAdminData();
}

async function loadStudentExamNumberAdminData({ force = false } = {}) {
  if (studentExamNumberAdminState.loading || (studentExamNumberAdminState.loaded && !force)) return;
  studentExamNumberAdminState.loading = true;
  studentExamNumberAdminState.error = "";
  try {
    const response = await fetch("/api/student-exam-numbers", { credentials: "same-origin" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.error || "student_exam_number_load_failed");
    studentExamNumberAdminState.students = Array.isArray(data.students) ? data.students : [];
    studentExamNumberAdminState.values = new Map(
      (data.examNumbers || []).map((entry) => [String(entry.studentId), String(entry.examNumber || "")])
    );
    studentExamNumberAdminState.drafts = new Map(studentExamNumberAdminState.values);
    studentExamNumberAdminState.students.forEach((student) => {
      const studentId = String(student.id || "");
      student.id = studentId;
      student.cohort = String(student.cohort || "");
      if (!studentExamNumberAdminState.drafts.has(studentId)) studentExamNumberAdminState.drafts.set(studentId, "");
    });
    studentExamNumberAdminState.dirtyStudentIds.clear();
    studentExamNumberAdminState.loaded = true;
  } catch (error) {
    console.error(error);
    studentExamNumberAdminState.error = error.message || "student_exam_number_load_failed";
    if (force) studentExamNumberAdminState.loaded = false;
  } finally {
    studentExamNumberAdminState.loading = false;
    if (currentRoute === "student-exam-numbers") render();
  }
}

async function saveStudentExamNumberChanges(saveButton) {
  const studentIds = [...studentExamNumberAdminState.dirtyStudentIds];
  if (!studentIds.length || studentExamNumberAdminState.saving) return;
  studentExamNumberAdminState.saving = true;
  saveButton.disabled = true;
  saveButton.textContent = "저장 중...";
  try {
    const entries = studentIds.map((studentId) => ({
      studentId,
      examNumber: normalizeStudentExamNumber(studentExamNumberAdminState.drafts.get(studentId)),
    }));
    const response = await fetch("/api/student-exam-numbers", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.error || "student_exam_number_save_failed");
    entries.forEach((entry) => {
      studentExamNumberAdminState.values.set(entry.studentId, entry.examNumber);
      studentExamNumberAdminState.drafts.set(entry.studentId, entry.examNumber);
      studentExamNumberAdminState.dirtyStudentIds.delete(entry.studentId);
    });
    notify(`응시번호 변경사항 ${entries.length}건을 저장했습니다.`);
    render();
  } catch (error) {
    console.error(error);
    const message = error.message === "exam_number_table_unavailable"
      ? "응시번호 저장소가 준비되지 않아 저장하지 못했습니다."
      : "응시번호를 저장하지 못했습니다. 잠시 후 다시 시도해주세요.";
    notify(message);
  } finally {
    studentExamNumberAdminState.saving = false;
    saveButton.disabled = !studentExamNumberAdminState.dirtyStudentIds.size;
    saveButton.textContent = "변경사항 저장";
  }
}

function getStudentExamNumberCohorts() {
  return [...new Set(studentExamNumberAdminState.students.map((student) => String(student.cohort || "")).filter(Boolean))]
    .sort((a, b) => Number(b) - Number(a));
}

function getDefaultStudentExamNumberCohort(cohorts) {
  const selected = String(selectedStudentCohort || "");
  if (cohorts.includes(selected)) return selected;
  if (cohorts.includes(DEFAULT_STUDENT_COHORT)) return DEFAULT_STUDENT_COHORT;
  return cohorts[0] || "";
}

function normalizeStudentExamNumber(value) {
  return String(value || "").trim().replace(/\s+/g, "");
}

function downloadStudentExamNumberWorkbook(cohort, students) {
  if (!students.length) return notify("다운로드할 학생이 없습니다.");
  const cohortLabel = `${cohort || "선택"}기`;
  const rows = [
    ["등록번호", "이름", "직렬", "응시번호"],
    ...students.map((student) => [
      student.id,
      student.name,
      student.track || "-",
      normalizeStudentExamNumber(studentExamNumberAdminState.drafts.get(student.id)),
    ]),
  ];
  const blob = createStudentCohortWorkbookBlob(`${cohortLabel} 응시번호`, rows);
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = `${sanitizeWorkbookFileName(cohortLabel)}_응시번호_명단.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  notify(`${cohortLabel} 응시번호 명단 ${students.length}명을 다운로드했습니다.`);
}

function renderOnlineManagedStudyCafeTogglePanel() {
  const enabled = state.settings.onlineManagedStudyCafeEnabled === true;
  const toggle = el("input", {
    type: "checkbox",
    role: "switch",
    checked: enabled,
    ariaLabel: "온라인 관리반 스터디카페 메뉴 사용",
  });
  const status = el(
    "strong",
    { className: "online-managed-toggle-status" },
    enabled ? "사용 중" : "사용 안 함"
  );

  toggle.addEventListener("change", async () => {
    const nextEnabled = toggle.checked;
    toggle.disabled = true;
    try {
      const response = await fetch("/api/app-settings", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: { onlineManagedStudyCafeEnabled: nextEnabled },
        }),
      });
      const data = await response.json().catch(() => ({ ok: false }));
      if (!response.ok || !data.ok) throw new Error(data.error || "app_settings_save_failed");
      applyRemoteAppSettings(data.settings);
      saveState({ skipRemote: true });
      render();
      notify(
        nextEnabled
          ? "온라인 관리반 스터디카페 메뉴를 활성화했습니다."
          : "온라인 관리반 메뉴를 기존 방식으로 되돌렸습니다."
      );
    } catch (error) {
      console.error(error);
      toggle.checked = enabled;
      toggle.disabled = false;
      status.textContent = enabled ? "사용 중" : "사용 안 함";
      notify("온라인 관리반 메뉴 설정을 저장하지 못했습니다.");
    }
  });

  return panel("온라인 관리반 메뉴 설정", [
    el("div", { className: "online-managed-toggle-row" }, [
      el("div", {}, [
        el("strong", {}, "스터디카페형 하단 메뉴"),
        el(
          "p",
          { className: "subtle" },
          enabled
            ? "온라인 관리반 학생에게 홈·스터디카페·성적·마이 메뉴가 표시됩니다."
            : "현재 온라인 관리반 학생에게 기존 홈·출석·외출·성적·마이 메뉴가 표시됩니다."
        ),
      ]),
      el("label", { className: "online-managed-toggle-control" }, [toggle, status]),
    ]),
    el(
      "p",
      { className: "subtle online-managed-toggle-note" },
      "수강생 메뉴와 학생 등록 방식에는 영향을 주지 않습니다. 스터디카페 준비가 끝난 뒤 켜주세요."
    ),
  ]);
}

function renderLoginPhoneVerificationSettingsButton() {
  if (!isTeacherAdmin()) return null;
  return button("로그인 인증 설정", "mini-btn", "button", openLoginPhoneVerificationSettingsModal);
}

function openLoginPhoneVerificationSettingsModal() {
  let enabled = state.settings.phoneVerificationEnabled === true;
  const toggle = el("input", {
    type: "checkbox",
    role: "switch",
    checked: enabled,
    ariaLabel: "로그인 시 인증번호 사용 허용",
  });
  const status = el(
    "strong",
    { className: "online-managed-toggle-status" },
    enabled ? "사용 중" : "사용 안 함"
  );
  const description = el(
    "p",
    { className: "subtle" },
    enabled
      ? "수강생 등록 신청 화면에 인증번호 받기와 인증번호 입력란이 표시됩니다."
      : "휴대전화 번호만 입력하며 인증번호 관련 버튼과 입력란은 표시하지 않습니다."
  );

  toggle.addEventListener("change", async () => {
    const nextEnabled = toggle.checked;
    toggle.disabled = true;
    try {
      const response = await fetch("/api/app-settings", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: { phoneVerificationEnabled: nextEnabled },
        }),
      });
      const data = await response.json().catch(() => ({ ok: false }));
      if (!response.ok || !data.ok) throw new Error(data.error || "app_settings_save_failed");
      applyRemoteAppSettings(data.settings);
      saveState({ skipRemote: true });
      enabled = state.settings.phoneVerificationEnabled === true;
      toggle.checked = enabled;
      toggle.disabled = false;
      status.textContent = enabled ? "사용 중" : "사용 안 함";
      description.textContent = enabled
        ? "수강생 등록 신청 화면에 인증번호 받기와 인증번호 입력란이 표시됩니다."
        : "휴대전화 번호만 입력하며 인증번호 관련 버튼과 입력란은 표시하지 않습니다.";
      notify(nextEnabled
        ? "로그인 인증번호 사용을 허용했습니다."
        : "로그인 인증번호 사용을 중지했습니다.");
    } catch (error) {
      console.error(error);
      toggle.checked = enabled;
      toggle.disabled = false;
      status.textContent = enabled ? "사용 중" : "사용 안 함";
      notify("로그인 인증번호 설정을 저장하지 못했습니다.");
    }
  });

  openInfoModal({
    title: "로그인 인증 설정",
    className: "login-phone-verification-modal",
    confirmLabel: "닫기",
    content: el("div", { className: "login-phone-verification-settings" }, [
    el("div", { className: "online-managed-toggle-row" }, [
      el("div", {}, [
        el("strong", {}, "로그인 시 인증번호 사용 허용"),
        description,
      ]),
      el("label", { className: "online-managed-toggle-control" }, [toggle, status]),
    ]),
    el(
      "p",
      { className: "subtle online-managed-toggle-note" },
      "SOLAPI 채널과 알림톡 템플릿 준비가 끝난 뒤 켜주세요. 관리자 계정만 변경할 수 있습니다."
    ),
    ]),
  });
}

function renderLectureApplicationsAdminPanel() {
  ensureLectureApplicationsLoaded();
  const applications = lectureApplicationAdminState.applications;
  const visible = lectureApplicationAdminState.status === "all"
    ? applications
    : applications.filter((application) => application.status === lectureApplicationAdminState.status);
  const statusSelect = el("select", { ariaLabel: "수강생 신청 상태" }, [
    el("option", { value: "pending" }, "검토 대기"),
    el("option", { value: "approved" }, "승인"),
    el("option", { value: "rejected" }, "반려"),
    el("option", { value: "all" }, "전체"),
  ]);
  statusSelect.value = lectureApplicationAdminState.status;
  statusSelect.addEventListener("change", () => {
    lectureApplicationAdminState.status = statusSelect.value;
    render();
  });

  const head = el("div", { className: "lecture-application-admin-head" }, [
    el("div", {}, [
      el("p", { className: "subtle" }, `검토 대기 ${applications.filter((item) => item.status === "pending").length}건`),
      el("p", { className: "subtle" }, "오프라인반·온라인 관리반은 관리자가 등록번호를 입력하고, 인강생은 자동 발급됩니다."),
    ]),
    el("div", { className: "lecture-application-admin-controls" }, [
      renderLoginPhoneVerificationSettingsButton(),
      statusSelect,
      button("새로고침", "mini-btn", "button", () => loadLectureApplications({ force: true })),
    ].filter(Boolean)),
  ]);

  if (lectureApplicationAdminState.loading && !lectureApplicationAdminState.loaded) {
    return panel("수강생 신청 관리", [head, el("div", { className: "empty" }, "신청 목록을 불러오는 중입니다.")]);
  }
  if (lectureApplicationAdminState.error && !lectureApplicationAdminState.loaded) {
    return panel("수강생 신청 관리", [head, el("div", { className: "empty" }, "신청 목록을 불러오지 못했습니다.")]);
  }

  const rows = visible.map((application) => el("tr", {}, [
    el("td", {}, formatDateCompact(application.createdAt)),
    el("td", {}, application.name),
    el("td", {}, formatLectureApplicationCourseType(application.courseType)),
    el("td", {}, maskLectureApplicationPhone(application.phone)),
    el("td", {}, application.track),
    el("td", {}, formatLectureReferralSource(application)),
    el("td", {}, application.lectureId),
    el("td", {}, el("span", { className: `badge lecture-application-${application.status}` }, LECTURE_APPLICATION_STATUS_LABELS[application.status] || application.status)),
    el("td", {}, application.approvedStudentId || application.rejectionReason || "-"),
    el("td", {}, el("div", { className: "lecture-application-row-actions" }, [
      button("상세", "mini-btn", "button", () => openLectureApplicationDetail(application)),
      application.status === "pending" ? button("승인", "mini-btn", "button", () => approveLectureApplication(application)) : null,
      application.status === "pending" ? button("반려", "mini-btn danger", "button", () => openRejectLectureApplicationModal(application)) : null,
    ].filter(Boolean))),
  ]));

  const applicationTable = table(
    ["신청일", "이름", "수강 구분", "휴대전화", "직렬", "들어온 경로", "인강 아이디", "상태", "처리 결과", "관리"],
    rows.length ? rows : [el("tr", {}, [el("td", { colSpan: 10 }, el("div", { className: "empty table-empty" }, "해당 상태의 신청이 없습니다."))])]
  );
  applicationTable.classList.add("lecture-application-table-wrap");

  return panel("수강생 신청 관리", [
    head,
    applicationTable,
  ]);
}

function ensureLectureApplicationsLoaded() {
  if (lectureApplicationAdminState.loaded || lectureApplicationAdminState.loading) return;
  loadLectureApplications();
}

async function loadLectureApplications({ force = false } = {}) {
  if (lectureApplicationAdminState.loading) return;
  if (lectureApplicationAdminState.loaded && !force) return;
  lectureApplicationAdminState.loading = true;
  lectureApplicationAdminState.error = "";
  if (currentRoute === "students") render();
  try {
    const response = await fetch("/api/lecture-applications?status=all", { credentials: "same-origin" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.error || "lecture_application_load_failed");
    lectureApplicationAdminState.applications = (data.applications || []).map(mapLectureApplication);
    lectureApplicationAdminState.loaded = true;
  } catch (error) {
    console.error(error);
    lectureApplicationAdminState.error = error.message || "lecture_application_load_failed";
  } finally {
    lectureApplicationAdminState.loading = false;
    if (currentRoute === "students") render();
  }
}

function mapLectureApplication(row) {
  return {
    id: row.id,
    name: row.name || "",
    phone: row.phone || "",
    birthDate: row.birth_date || "",
    gender: row.gender || "",
    track: row.track || "",
    courseType: row.course_type || "lecture",
    cohort: row.cohort ? String(row.cohort) : "",
    referralSource: row.referral_source || "",
    referralSourceDetail: row.referral_source_detail || "",
    lectureId: row.lecture_id || "",
    status: row.status || "pending",
    rejectionReason: row.rejection_reason || "",
    approvedStudentId: row.approved_student_id || "",
    reviewedAt: row.reviewed_at || "",
    reviewedBy: row.reviewed_by || "",
    createdAt: row.created_at || "",
  };
}

function maskLectureApplicationPhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length < 10) return "-";
  return `${digits.slice(0, 3)}-${digits.slice(3, digits.length - 4).replace(/./g, "*")}-${digits.slice(-4)}`;
}

function formatLectureReferralSource(application) {
  const label = LECTURE_REFERRAL_SOURCE_LABELS[application.referralSource] || application.referralSource || "-";
  return application.referralSourceDetail ? `${label} (${application.referralSourceDetail})` : label;
}

function formatLectureApplicationCourseType(courseType) {
  return LECTURE_APPLICATION_COURSE_TYPE_LABELS[courseType] || "인강생";
}

function openLectureApplicationDetail(application) {
  const detailRows = [
    ["이름", application.name],
    ["수강 구분", formatLectureApplicationCourseType(application.courseType)],
    ["기수", application.cohort ? `${application.cohort}기` : "-"],
    ["휴대전화 번호", application.phone],
    ["생년월일", application.birthDate],
    ["성별", application.gender],
    ["직렬", application.track],
    ["들어온 경로", formatLectureReferralSource(application)],
    ["인강 아이디", application.lectureId],
    ["신청 상태", LECTURE_APPLICATION_STATUS_LABELS[application.status] || application.status],
    ["등록번호", application.approvedStudentId || "-"],
    ["반려 사유", application.rejectionReason || "-"],
  ];
  openInfoModal({
    title: "수강생 신청 상세",
    content: el("dl", { className: "lecture-application-detail" }, detailRows.flatMap(([label, value]) => [
      el("dt", {}, label),
      el("dd", {}, value || "-"),
    ])),
  });
}

async function approveLectureApplication(application) {
  if (["offline", "online_managed"].includes(application.courseType)) {
    openManualLectureApplicationApprovalModal(application);
    return;
  }
  if (!confirm(`${application.name} 인강생 신청을 승인할까요? 승인하면 등록번호가 즉시 자동 발급됩니다.`)) return;
  await reviewLectureApplication(application, "approved", "", "");
}

function openManualLectureApplicationApprovalModal(application) {
  const cohortOptions = getManualApplicationCohortOptions();
  const cohortSelect = el("select", { name: "cohort" }, [
    el("option", { value: "" }, "기수를 선택하세요"),
    ...cohortOptions.map((cohort) => el("option", { value: cohort }, `${cohort}기`)),
    el("option", { value: "custom" }, "새 기수 입력"),
  ]);
  const customCohortInput = input("customCohort", "number", "예: 18");
  customCohortInput.min = "1";
  customCohortInput.max = "99";
  const customCohortField = field("새 기수", customCohortInput, "full");
  customCohortField.hidden = true;
  const registrationNumberInput = input("registrationNumber", "text", "등록번호");
  registrationNumberInput.inputMode = "numeric";
  registrationNumberInput.maxLength = 30;
  const selectedCohort = () => cohortSelect.value === "custom"
    ? String(customCohortInput.value || "").trim()
    : String(cohortSelect.value || "").trim();
  const updateSuggestedRegistrationNumber = () => {
    const cohort = selectedCohort();
    registrationNumberInput.value = isValidCohort(cohort) ? suggestNextManualRegistrationNumber(cohort) : "";
  };
  cohortSelect.addEventListener("change", () => {
    customCohortField.hidden = cohortSelect.value !== "custom";
    if (customCohortField.hidden) customCohortInput.value = "";
    updateSuggestedRegistrationNumber();
  });
  customCohortInput.addEventListener("input", updateSuggestedRegistrationNumber);
  const submitButton = button("승인하기", "btn");
  const form = el("form", { className: "form-grid" }, [
    field("신청자", el("strong", {}, `${application.name} · ${formatLectureApplicationCourseType(application.courseType)}`), "full"),
    field("기수", cohortSelect, "full"),
    customCohortField,
    field("등록번호", registrationNumberInput, "full", "다음 등록번호가 자동 입력됩니다. 필요하면 수정해주세요."),
    el("div", { className: "lecture-application-actions field full" }, [
      button("취소", "btn secondary", "button", closeInfoModal),
      submitButton,
    ]),
  ]);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const cohort = selectedCohort();
    const registrationNumber = String(registrationNumberInput.value || "").trim();
    if (!isValidCohort(cohort)) return notify("기수를 선택하거나 숫자로 입력해주세요.");
    if (!isRegistrationNumberForCohort(registrationNumber, cohort)) {
      return notify(`${cohort}기 등록번호는 ${cohort}001부터 ${cohort}999 사이로 입력해주세요.`);
    }
    submitButton.disabled = true;
    try {
      const reviewed = await reviewLectureApplication(application, "approved", "", registrationNumber, cohort);
      if (reviewed) closeInfoModal();
    } finally {
      submitButton.disabled = false;
    }
  });
  openInfoModal({ title: "수강생 신청 승인", content: form, showConfirm: false });
}

function getManualApplicationCohortOptions() {
  return [...new Set((state.students || [])
    .filter((student) => getStudentCategory(student) !== "lecture")
    .map((student) => getStudentCohort(student))
    .filter(isValidCohort))]
    .sort((a, b) => Number(a) - Number(b));
}

function suggestNextManualRegistrationNumber(cohort) {
  const normalizedCohort = String(cohort || "").trim();
  if (!isValidCohort(normalizedCohort)) return "";
  const maxSequence = (state.students || []).reduce((maxValue, student) => {
    const value = String(student?.id || "").trim();
    if (!isRegistrationNumberForCohort(value, normalizedCohort)) return maxValue;
    return Math.max(maxValue, Number(value.slice(normalizedCohort.length)));
  }, 0);
  return maxSequence >= 999 ? "" : buildStudentId(normalizedCohort, maxSequence + 1);
}

function isRegistrationNumberForCohort(registrationNumber, cohort) {
  const normalizedCohort = String(cohort || "").trim();
  const value = String(registrationNumber || "").trim();
  if (!isValidCohort(normalizedCohort) || !value.startsWith(normalizedCohort)) return false;
  const suffix = value.slice(normalizedCohort.length);
  return /^\d{3}$/.test(suffix) && Number(suffix) >= 1;
}

function openRejectLectureApplicationModal(application) {
  const reasonInput = textarea("reason", "반려 사유를 입력하세요");
  const submitButton = button("반려하기", "btn danger");
  const form = el("form", { className: "form-grid" }, [
    field("신청자", el("strong", {}, `${application.name} (${application.lectureId})`)),
    field("반려 사유", reasonInput, "full"),
    el("div", { className: "lecture-application-actions field full" }, [
      button("취소", "btn secondary", "button", closeInfoModal),
      submitButton,
    ]),
  ]);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const reason = String(reasonInput.value || "").trim();
    if (!reason) return notify("반려 사유를 입력해주세요.");
    submitButton.disabled = true;
    try {
      const reviewed = await reviewLectureApplication(application, "rejected", reason);
      if (reviewed) closeInfoModal();
    } finally {
      submitButton.disabled = false;
    }
  });
  openInfoModal({ title: "수강생 신청 반려", content: form, showConfirm: false });
}

async function reviewLectureApplication(application, status, rejectionReason, registrationNumber = "", cohort = "") {
  try {
    const response = await fetch("/api/lecture-applications", {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: application.id, status, rejectionReason, registrationNumber, cohort }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.error || "lecture_application_review_failed");
    const reviewed = mapLectureApplication(data.application || {});
    const index = lectureApplicationAdminState.applications.findIndex((item) => item.id === application.id);
    if (index >= 0) lectureApplicationAdminState.applications[index] = reviewed;
    if (status === "approved" && reviewed.approvedStudentId && !findStudent(reviewed.approvedStudentId)) {
      state.students.push({
        id: reviewed.approvedStudentId,
        name: reviewed.name,
        className: application.courseType === "offline"
          ? "오프라인반"
          : application.courseType === "online_managed" ? "온라인 관리반" : "수강생",
        studentCategory: application.courseType,
        cohort: reviewed.cohort || "",
        track: reviewed.track,
        gender: reviewed.gender,
        attendanceExcluded: application.courseType !== "offline",
        fitnessExcluded: false,
        isActive: true,
        createdAt: new Date().toISOString(),
      });
      saveState({ skipRemote: true });
    }
    render();
    const reviewMessage = status === "approved"
      ? `${reviewed.name} 학생을 승인했습니다. 등록번호는 ${reviewed.approvedStudentId}입니다.`
      : `${reviewed.name} 학생의 신청을 반려했습니다.`;
    const notification = data.notification || {};
    notify(notification.failed > 0
      ? `${reviewMessage} 다만 푸시 알림 전송에 실패했습니다.`
      : notification.sent > 0
        ? `${reviewMessage} 학생에게 푸시 알림도 보냈습니다.`
        : reviewMessage);
    return true;
  } catch (error) {
    console.error(error);
    notify(error.message === "application_already_reviewed"
      ? "이미 처리된 신청입니다. 목록을 새로고침해주세요."
      : error.message === "registration_number_in_use"
        ? "이미 사용 중인 등록번호입니다. 다른 번호를 입력해주세요."
        : error.message === "invalid_cohort"
          ? "기수를 1부터 99 사이의 숫자로 선택해주세요."
          : error.message === "registration_number_cohort_mismatch"
            ? "등록번호가 선택한 기수와 일치하지 않습니다."
        : error.message === "registration_number_required"
          ? "등록번호를 입력해주세요."
          : "신청 처리에 실패했습니다. 잠시 후 다시 시도해주세요.");
    return false;
  }
}

function renderStudentPushAdminPanel() {
  ensureStudentPushAdminLoaded();
  const targetSelect = el("select", { name: "target" }, [
    el("option", { value: "all" }, "전체 학생"),
    el("option", { value: "category:offline" }, "오프라인 학생"),
    el("option", { value: "category:online_managed" }, "온라인 관리반"),
    el("option", { value: "category:lecture" }, "수강생"),
    el("option", { value: "students" }, "학생 직접 선택"),
  ]);
  const titleInput = input("title", "text", "예: 오늘 수업 안내");
  titleInput.maxLength = 80;
  const bodyInput = textarea("body", "알림 내용을 입력하세요.");
  bodyInput.maxLength = 300;
  const targetSummary = el("div", { className: "student-push-target-summary", ariaLive: "polite" });
  const directTargets = el("div", { className: "student-push-direct-targets", hidden: true });
  const sendButton = button("푸시 알림 보내기", "btn");
  const form = el("form", { className: "form-grid student-push-admin-form" }, [
    el("p", { className: "subtle field full" }, "알림을 허용한 학생의 등록 기기로 전송됩니다. 발송 전 대상 인원을 확인해주세요."),
    field("발송 대상", targetSelect, "full"),
    directTargets,
    targetSummary,
    field("알림 제목", titleInput, "full"),
    field("알림 내용", bodyInput, "full", "최대 300자이며, 알림을 누르면 학생 앱 홈으로 이동합니다."),
    el("div", { className: "field full student-push-send-actions" }, [sendButton]),
  ]);

  const updateTargets = () => {
    const direct = targetSelect.value === "students";
    directTargets.hidden = !direct;
    if (direct && !directTargets.childElementCount) renderStudentPushDirectTargets(directTargets, updateTargets);
    const targetIds = resolveStudentPushTargetIds(targetSelect.value, studentPushAdminState.selectedStudentIds);
    const subscribedCount = targetIds.filter((id) => studentPushAdminState.subscribedStudentIds.has(id)).length;
    targetSummary.replaceChildren(
      el("strong", {}, `대상 ${targetIds.length}명`),
      el("span", {}, `알림 허용 ${subscribedCount}명`)
    );
    sendButton.disabled = studentPushAdminState.sending || !targetIds.length;
  };
  targetSelect.addEventListener("change", updateTargets);
  updateTargets();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (studentPushAdminState.sending) return;
    const title = String(titleInput.value || "").trim();
    const messageBody = String(bodyInput.value || "").trim();
    const targetIds = resolveStudentPushTargetIds(targetSelect.value, studentPushAdminState.selectedStudentIds);
    if (!title || !messageBody) return notify("알림 제목과 내용을 입력해주세요.");
    if (!targetIds.length) return notify("발송할 학생을 선택해주세요.");
    const subscribedCount = targetIds.filter((id) => studentPushAdminState.subscribedStudentIds.has(id)).length;
    if (!confirm(`대상 ${targetIds.length}명 중 현재 알림 허용 학생은 ${subscribedCount}명입니다. 푸시 알림을 보낼까요?`)) return;

    studentPushAdminState.sending = true;
    sendButton.disabled = true;
    setButtonLoading(sendButton, "발송 중");
    try {
      const target = buildStudentPushAdminTarget(targetSelect.value, studentPushAdminState.selectedStudentIds);
      const response = await fetch("/api/student-push", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", title, body: messageBody, ...target }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || "student_push_send_failed");
      titleInput.value = "";
      bodyInput.value = "";
      studentPushAdminState.loaded = false;
      await loadStudentPushAdminData({ force: true });
      notify(`대상 ${data.targetCount}명 중 ${data.subscribedStudentCount}명이 알림을 허용했습니다. ${data.sentCount}개 기기 전송 성공${data.failedCount ? `, ${data.failedCount}개 실패` : ""}.`);
    } catch (error) {
      console.error(error);
      notify("푸시 알림을 보내지 못했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      studentPushAdminState.sending = false;
      sendButton.disabled = false;
      sendButton.textContent = "푸시 알림 보내기";
    }
  });

  const history = renderStudentPushHistory();
  return panel("학생 푸시 알림", [
    el("div", { className: "student-push-admin-status" }, [
      el("strong", {}, `알림 허용 학생 ${studentPushAdminState.subscribedStudentIds.size}명`),
      button("새로고침", "mini-btn", "button", () => loadStudentPushAdminData({ force: true })),
    ]),
    studentPushAdminState.error ? el("div", { className: "empty" }, "푸시 알림 현황을 불러오지 못했습니다.") : null,
    form,
    history,
  ].filter(Boolean));
}

function renderStudentPushDirectTargets(container, onChange) {
  const searchInput = input("studentPushSearch", "search", "학생번호 또는 이름 검색");
  const list = el("div", { className: "student-push-student-list" });
  const selectedCount = el("strong", {}, "");
  const renderList = () => {
    const query = String(searchInput.value || "").trim().toLowerCase();
    const students = getStudentPushEligibleStudents()
      .filter((student) => !query || `${student.id} ${student.name}`.toLowerCase().includes(query))
      .slice(0, 200);
    selectedCount.textContent = `${studentPushAdminState.selectedStudentIds.size}명 선택`;
    list.replaceChildren(...students.map((student) => {
      const checkbox = el("input", { type: "checkbox", value: student.id, checked: studentPushAdminState.selectedStudentIds.has(String(student.id)) });
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) studentPushAdminState.selectedStudentIds.add(String(student.id));
        else studentPushAdminState.selectedStudentIds.delete(String(student.id));
        selectedCount.textContent = `${studentPushAdminState.selectedStudentIds.size}명 선택`;
        onChange();
      });
      return el("label", { className: "student-push-student-option" }, [
        checkbox,
        el("span", {}, `${student.name} (${student.id})`),
        studentPushAdminState.subscribedStudentIds.has(String(student.id)) ? el("small", {}, "알림 허용") : null,
      ].filter(Boolean));
    }));
  };
  searchInput.addEventListener("input", renderList);
  container.append(
    el("div", { className: "student-push-direct-head" }, [searchInput, selectedCount]),
    list
  );
  renderList();
}

function getStudentPushEligibleStudents() {
  return (state.students || [])
    .filter((student) => student.isActive !== false)
    .sort((a, b) => String(a.id).localeCompare(String(b.id), "ko-KR", { numeric: true }));
}

function resolveStudentPushTargetIds(targetValue, selectedIds) {
  const students = getStudentPushEligibleStudents();
  if (targetValue === "all") return students.map((student) => String(student.id));
  if (targetValue.startsWith("category:")) {
    const category = targetValue.slice("category:".length);
    return students.filter((student) => getStudentCategory(student) === category).map((student) => String(student.id));
  }
  const activeIds = new Set(students.map((student) => String(student.id)));
  return [...selectedIds].filter((id) => activeIds.has(String(id)));
}

function buildStudentPushAdminTarget(targetValue, selectedIds) {
  if (targetValue === "all") return { targetType: "all" };
  if (targetValue.startsWith("category:")) return { targetType: "category", targetCategory: targetValue.slice("category:".length) };
  return { targetType: "students", studentIds: [...selectedIds] };
}

function ensureStudentPushAdminLoaded() {
  if (studentPushAdminState.loaded || studentPushAdminState.loading) return;
  loadStudentPushAdminData();
}

async function loadStudentPushAdminData({ force = false } = {}) {
  if (studentPushAdminState.loading || (studentPushAdminState.loaded && !force)) return;
  studentPushAdminState.loading = true;
  studentPushAdminState.error = "";
  try {
    const response = await fetch("/api/student-push", { credentials: "same-origin" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.error || "student_push_load_failed");
    studentPushAdminState.messages = Array.isArray(data.messages) ? data.messages : [];
    studentPushAdminState.subscribedStudentIds = new Set((data.subscribedStudentIds || []).map(String));
    studentPushAdminState.loaded = true;
  } catch (error) {
    console.error(error);
    studentPushAdminState.error = error.message || "student_push_load_failed";
  } finally {
    studentPushAdminState.loading = false;
    if (currentRoute === "student-push") render();
  }
}

function renderStudentPushHistory() {
  if (studentPushAdminState.loading && !studentPushAdminState.loaded) {
    return el("div", { className: "empty" }, "발송 이력을 불러오는 중입니다.");
  }
  const messages = studentPushAdminState.messages || [];
  if (!messages.length) return el("div", { className: "empty" }, "아직 발송한 푸시 알림이 없습니다.");
  const rows = messages.map((message) => el("tr", {}, [
    el("td", {}, formatDateCompact(message.created_at)),
    el("td", {}, message.title || "-"),
    el("td", {}, formatStudentPushTarget(message)),
    el("td", {}, `${Number(message.target_count) || 0}명`),
    el("td", {}, `${Number(message.subscribed_count) || 0}명`),
    el("td", {}, `${Number(message.sent_count) || 0}기기`),
    el("td", {}, Number(message.failed_count) ? `${message.failed_count}건` : "-"),
    el("td", {}, message.created_by || "-"),
  ]));
  return el("div", { className: "student-push-history" }, [
    el("h3", {}, "최근 발송 이력"),
    table(["발송일", "제목", "대상", "학생", "허용", "성공", "실패", "발송자"], rows),
  ]);
}

function formatStudentPushTarget(message) {
  if (message.target_type === "all") return "전체";
  if (message.target_type === "category") {
    return { offline: "오프라인", online_managed: "온라인 관리반", lecture: "수강생" }[message.target_category] || "그룹";
  }
  return "직접 선택";
}

function teacherStudentForm() {
  const selected = selectedStudentCohortCount();
  const visibleStudents = getStudentsInCohort(selected.value);
  const filteredStudents = getFilteredStudentAdminStudents(visibleStudents);
  const cohortInput = input("cohort", "number", "18", /^\d{1,2}$/.test(selected.value) ? selected.value : DEFAULT_STUDENT_COHORT);
  const categorySelect = el("select", { name: "studentCategory" }, [
    el("option", { value: "offline" }, "오프라인 학생"),
    el("option", { value: "online_managed" }, "온라인 관리반"),
  ]);
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
    field("학생 카테고리", categorySelect, "", "수강생 신규 신청은 2차 개발의 승인 화면에서 등록됩니다."),
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
    const studentCategory = normalizeStudentCategory(data.studentCategory) || "offline";
    const parsed = parseStudentRoster(data.roster, cohort, studentCategory);
    if (!parsed.length) return notify("등록할 학생 번호와 이름을 입력해주세요.");
    const track = resolveStudentTrack(data.track, data.customTrack);
    if (data.track && !track) return notify("기타 직렬을 입력해주세요.");
    submitButton.disabled = true;
    submitButton.textContent = "저장 중...";
    try {
      const result = upsertStudents(parsed, data.className, track, studentCategory, cohort);
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
        el("td", {}, student.id),
        el("td", {}, student.name),
        el("td", {}, el("span", { className: `badge student-category-${getStudentCategory(student)}` }, getStudentCategoryLabel(student))),
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
    ["등록번호", "이름", "카테고리", "반", "앱 등록", "등록 시간", "직렬", "성별", "출석", "관리"],
    rows.length ? rows : [el("tr", {}, [el("td", { colSpan: 10 }, el("div", { className: "empty table-empty" }, visibleStudents.length ? "검색 결과가 없습니다." : "등록된 학생이 없습니다."))])]
  );
  studentTable.classList.add("student-admin-table-wrap");

  return el("div", { className: "grid" }, [
    panel("학생 등록", [form]),
    studentCountStatGroup(),
    studentAdminSearchControls(selected, visibleStudents, filteredStudents.length),
    studentTable,
  ]);
}

function renderStudentAdminActionMenu(student, profile) {
  const hasAppRegistration = Boolean(student.appRegisteredAt || profile?.passwordHash || profile?.authedAt);
  return el("details", { className: "student-action-menu" }, [
    el("summary", { className: "mini-btn student-action-menu-trigger" }, "관리"),
    el("div", { className: "student-action-menu-list" }, [
      button("미리보기", "student-action-menu-item", "button", () => openStudentPreview(student.id)),
      button("카테고리 변경", "student-action-menu-item", "button", () => openStudentCategoryEditModal(student.id)),
      button("반 변경", "student-action-menu-item", "button", () => openStudentClassEditModal(student.id)),
      button("직렬 변경", "student-action-menu-item", "button", () => openStudentTrackEditModal(student.id)),
      button("기기 이력", "student-action-menu-item", "button", () => openStudentRegistrationHistory(student.id)),
      profile ? button("등록 기기 관리", "student-action-menu-item", "button", () => openTeacherStudentDeviceManager(student.id)) : null,
      hasAppRegistration
        ? button("비밀번호 초기화", "student-action-menu-item danger", "button", () => openStudentPasswordResetModal(student.id))
        : null,
      button(isAttendanceExcludedStudent(student) ? "출석 포함" : "출석 제외", "student-action-menu-item", "button", () => toggleStudentAttendanceExcluded(student.id)),
      button(isFitnessExcludedStudent(student) ? "체력평가 포함" : "체력평가 제외", "student-action-menu-item", "button", () => toggleStudentFitnessExcluded(student.id)),
      button("삭제", "student-action-menu-item danger", "button", () => deleteStudent(student.id)),
    ]),
  ]);
}

function openStudentCategoryEditModal(studentId) {
  const student = findStudent(studentId);
  if (!student) return notify("학생 정보를 찾을 수 없습니다.");
  const categorySelect = el("select", { name: "studentCategory" }, STUDENT_CATEGORY_OPTIONS.map((option) =>
    el("option", { value: option.value }, option.label)
  ));
  categorySelect.value = getStudentCategory(student);
  const cohortInput = input("cohort", "number", "예: 18", getStudentCohort(student));
  const syncCohortState = () => {
    const lecture = categorySelect.value === "lecture";
    cohortInput.disabled = lecture;
    if (lecture) cohortInput.value = "";
  };
  categorySelect.addEventListener("change", syncCohortState);
  syncCohortState();

  const form = el("form", { className: "form-grid" }, [
    field("학생", el("strong", {}, `${student.name || "-"} (${student.id})`)),
    field("학생 카테고리", categorySelect),
    field("기수", cohortInput, "", "수강생은 기수를 사용하지 않습니다."),
    el("div", { className: "attendance-modal-actions field full" }, [
      button("취소", "btn secondary", "button", closeInfoModal),
      button("저장", "btn"),
    ]),
  ]);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = formData(form);
    await updateStudentCategory(student.id, data.studentCategory, data.cohort);
  });
  openInfoModal({ title: "학생 카테고리 변경", content: form });
}

async function updateStudentCategory(studentId, nextCategory, nextCohort) {
  const student = findStudent(studentId);
  const category = normalizeStudentCategory(nextCategory);
  const cohort = category === "lecture" ? "" : String(nextCohort || "").trim();
  if (!student || !category) return notify("학생 카테고리를 확인해주세요.");
  if (category !== "lecture" && !isValidCohort(cohort)) return notify("기수를 숫자로 입력해주세요.");
  const previousStudent = { ...student };
  try {
    student.studentCategory = category;
    student.cohort = cohort;
    if (category !== "offline") student.attendanceExcluded = true;
    await saveStudentsToRemote([student.id]);
    saveState({ skipRemote: true });
    closeInfoModal();
    render();
    notify(`${student.name || student.id} 학생을 ${getStudentCategoryLabel(category)}으로 변경했습니다.`);
  } catch (error) {
    console.error(error);
    Object.assign(student, previousStudent);
    render();
    notify("학생 카테고리 변경을 저장하지 못했습니다. 잠시 후 다시 시도해주세요.");
  }
}

function openStudentClassEditModal(studentId) {
  const student = findStudent(studentId);
  if (!student) return notify("학생 정보를 찾을 수 없습니다.");
  const currentClassName = student.className || state.settings.className || "오프라인반";
  const classInput = input("className", "text", "오프라인반", currentClassName);

  const form = el("form", { className: "form-grid" }, [
    field("학생", el("strong", {}, `${student.name || "-"} (${student.id})`)),
    field("현재 반", el("span", {}, currentClassName || "-")),
    field("변경 반", classInput, "", "예: 오프라인반, 온라인반"),
    el("div", { className: "attendance-modal-actions field full" }, [
      button("취소", "btn secondary", "button", closeInfoModal),
      button("저장", "btn"),
    ]),
  ]);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = formData(form);
    await updateStudentClass(student.id, data.className);
  });

  openInfoModal({
    title: "학생 반 변경",
    content: form,
  });
}

async function updateStudentClass(studentId, nextClassName) {
  const student = findStudent(studentId);
  const className = String(nextClassName || "").trim();
  if (!student || !className) return notify("학생 또는 반 정보를 확인해주세요.");
  const previousStudent = { ...student };
  const wasManuallyAttendanceExcluded = student.attendanceExcluded === true && !isOnlineClassName(student.className);
  try {
    student.className = className;
    student.attendanceExcluded = isOnlineClassName(className) || wasManuallyAttendanceExcluded;
    await saveStudentsToRemote([student.id]);
    saveState({ skipRemote: true });
    closeInfoModal();
    render();
    notify(`${student.name || student.id} 학생의 반을 변경했습니다.`);
  } catch (error) {
    console.error(error);
    Object.assign(student, previousStudent);
    render();
    notify("반 변경을 저장하지 못했습니다. 잠시 후 다시 시도해주세요.");
  }
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

async function openTeacherStudentDeviceManager(studentId) {
  const student = findStudent(studentId);
  if (!student) return notify("학생 정보를 찾을 수 없습니다.");
  openLoadingModal("등록 기기 확인 중", "학생의 등록 기기 목록을 불러오고 있습니다.");
  try {
    const result = await requestTeacherStudentDeviceAction("admin_list", { studentId });
    if (!result.ok) return notify("등록 기기 목록을 불러오지 못했습니다.");
    const devices = Array.isArray(result.devices) ? result.devices : [];
    openInfoModal({
      title: `${student.name || "학생"} 등록 기기 관리`,
      className: "student-device-manager-modal",
      content: el("div", { className: "student-device-manager-content" }, [
        el("p", { className: "subtle" }, `현재 ${devices.length}/2대가 등록되어 있습니다.`),
        devices.length
          ? el("div", { className: "student-device-list" }, devices.map((device) =>
              el("article", { className: "student-device-item" }, [
                el("div", { className: "student-device-item-head" }, [el("strong", {}, device.label || "등록 기기")]),
                el("p", { className: "subtle" }, `등록 ${formatDateCompact(device.registeredAt)} · 최근 사용 ${formatDateCompact(device.lastUsedAt)}`),
                device.tokenPreview ? el("small", {}, `기기 코드 ···${device.tokenPreview}`) : null,
                button("이 기기 해제", "mini-btn danger", "button", () => revokeTeacherStudentDevice(studentId, device)),
              ])
            ))
          : el("div", { className: "empty" }, "등록된 기기가 없습니다."),
        button("비밀번호 및 전체 등록 초기화", "btn danger", "button", () => {
          closeInfoModal();
          openStudentPasswordResetModal(studentId);
        }),
      ]),
    });
  } catch (error) {
    console.error(error);
    notify("등록 기기 서버에 연결하지 못했습니다.");
  } finally {
    closeLoadingModal();
  }
}

async function revokeTeacherStudentDevice(studentId, device) {
  if (!confirm(`${device.label || "선택한 기기"}를 해제할까요?`)) return;
  try {
    const result = await requestTeacherStudentDeviceAction("admin_revoke", {
      studentId,
      targetDeviceId: device.id,
      reason: "관리자 개별 기기 해제",
    });
    if (!result.ok) return notify("기기를 해제하지 못했습니다.");
    notify("선택한 기기를 해제했습니다.");
    await openTeacherStudentDeviceManager(studentId);
  } catch (error) {
    console.error(error);
    notify("기기 해제 중 오류가 발생했습니다.");
  }
}

async function requestTeacherStudentDeviceAction(action, payload) {
  const response = await fetch("/api/student-devices", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await response.json().catch(() => ({}));
  return { ...data, ok: response.ok && data.ok === true, httpStatus: response.status };
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

function studentAdminSearchControls(selectedCohort, students, filteredCount) {
  const totalCount = students.length;
  const search = input("studentAdminSearch", "search", "번호 또는 이름 검색", studentAdminFilters.query);
  const categorySelect = el("select", { name: "studentCategory" }, [
    el("option", { value: "all" }, "전체 카테고리"),
    ...STUDENT_CATEGORY_OPTIONS.map((option) => el("option", { value: option.value }, option.label)),
  ]);
  categorySelect.value = studentAdminFilters.category;
  const form = el("form", { className: "teacher-search student-admin-search" }, [
    field("학생 검색", search),
    field("카테고리", categorySelect),
    el("div", { className: "field" }, [
      el("span", {}, " "),
      button("검색", "btn secondary"),
    ]),
  ]);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    studentAdminFilters.query = search.value;
    studentAdminFilters.category = categorySelect.value;
    render();
  });

  return el("div", { className: "teacher-tools student-admin-tools" }, [
    form,
    el("div", { className: "field student-admin-result" }, [
      el("span", {}, "검색 결과"),
      el("div", { className: "student-admin-result-actions" }, [
        el("strong", {}, `${filteredCount}/${totalCount}명`),
        button("엑셀 다운로드", "btn secondary student-roster-download", "button", () => {
          downloadStudentCohortWorkbook(selectedCohort, students);
        }),
      ]),
    ]),
  ]);
}

function downloadStudentCohortWorkbook(selectedCohort, students) {
  if (!students.length) return notify("다운로드할 학생이 없습니다.");
  const cohortLabel = selectedCohort?.label || `${selectedCohort?.value || "선택"}기`;
  const sortedStudents = [...students]
    .sort((a, b) => String(a.id).localeCompare(String(b.id), "ko-KR", { numeric: true }));
  const rows = [
    ["등록번호", "이름", "카테고리", "반", "앱 등록", "등록 시간", "직렬", "성별", "출석"],
    ...sortedStudents.map((student) => {
      const profile = getStudentProfileForTeacher(student.id);
      return [
        student.id,
        student.name,
        getStudentCategoryLabel(student),
        student.className || "-",
        profile ? "완료" : "미등록",
        formatDateCompact(profile?.authedAt),
        normalizeCoastGuardTrack(profile?.track) || "-",
        profile?.gender || "-",
        isAttendanceExcludedStudent(student) ? "제외" : "포함",
      ];
    }),
  ];
  const blob = createStudentCohortWorkbookBlob(cohortLabel, rows);
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = `${sanitizeWorkbookFileName(cohortLabel)}_학생_명단.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  notify(`${cohortLabel} 학생 명단 ${students.length}명을 다운로드했습니다.`);
}

function createStudentCohortWorkbookBlob(sheetTitle, rows) {
  const encoder = new TextEncoder();
  const xml = (value) => encoder.encode(value);
  const safeSheetTitle = sanitizeWorkbookSheetName(sheetTitle);
  const files = [
    ["[Content_Types].xml", xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`)],
    ["_rels/.rels", xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`)],
    ["xl/workbook.xml", xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escapeWorkbookXml(safeSheetTitle)}" sheetId="1" r:id="rId1"/></sheets></workbook>`)],
    ["xl/_rels/workbook.xml.rels", xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`)],
    ["xl/styles.xml", xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="맑은 고딕"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="맑은 고딕"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F4E78"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="49" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1"><alignment horizontal="center"/></xf></cellXfs></styleSheet>`)],
    ["xl/worksheets/sheet1.xml", xml(createStudentRosterSheetXml(rows))],
  ];
  return new Blob([createStoredZip(files)], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function createStudentRosterSheetXml(rows) {
  const columnWidths = [16, 14, 16, 18, 12, 20, 14, 10, 10];
  const columns = columnWidths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("");
  const sheetRows = rows.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) => {
      const reference = `${workbookColumnName(columnIndex)}${rowIndex + 1}`;
      const style = rowIndex === 0 ? 1 : 0;
      return `<c r="${reference}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeWorkbookXml(value)}</t></is></c>`;
    }).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");
  const lastCell = `${workbookColumnName(Math.max(0, (rows[0]?.length || 1) - 1))}${Math.max(1, rows.length)}`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${columns}</cols><sheetData>${sheetRows}</sheetData><autoFilter ref="A1:${lastCell}"/></worksheet>`;
}

function createStoredZip(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  files.forEach(([name, content]) => {
    const nameBytes = encoder.encode(name);
    const crc = workbookCrc32(content);
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, content.length, true);
    localView.setUint32(22, content.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localHeader.set(nameBytes, 30);
    localParts.push(localHeader, content);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, content.length, true);
    centralView.setUint32(24, content.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);
    centralParts.push(centralHeader);
    offset += localHeader.length + content.length;
  });
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  return new Blob([...localParts, ...centralParts, end]);
}

function workbookCrc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function workbookColumnName(index) {
  let value = index + 1;
  let name = "";
  while (value > 0) {
    value -= 1;
    name = String.fromCharCode(65 + (value % 26)) + name;
    value = Math.floor(value / 26);
  }
  return name;
}

function escapeWorkbookXml(value) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sanitizeWorkbookSheetName(value) {
  return String(value || "학생 명단").replace(/[\\/*?:[\]]/g, " ").trim().slice(0, 31) || "학생 명단";
}

function sanitizeWorkbookFileName(value) {
  return String(value || "학생_명단").replace(/[\\/:*?"<>|]/g, "_").trim() || "학생_명단";
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
      isTeacherAdmin() && !activeOuting
        ? button("조퇴 신청", "btn", "button", () => openStudentPreviewEarlyLeaveModal(student.id))
        : null,
    ]),
  ]);
}

function openStudentPreviewEarlyLeaveModal(studentId) {
  if (!isTeacherAdmin()) return notify("관리자만 조퇴 신청을 할 수 있습니다.");
  const student = findStudent(studentId);
  if (!student) return notify("학생 정보를 찾을 수 없습니다.");
  if (getActiveOuting(student.id)) {
    render();
    return notify("이미 진행 중인 신청이 있습니다.");
  }

  const reasonInput = textarea("earlyLeaveReason", "조퇴 사유를 입력하세요.");
  const submitButton = button("조퇴 신청하기", "btn");
  const form = el("form", { className: "form-grid" }, [
    field("신청 학생", el("strong", {}, `${student.name} (${student.id})`)),
    field("조퇴 사유", reasonInput, "full"),
    el("div", { className: "field full attendance-action-row" }, [
      submitButton,
      button("취소", "btn secondary", "button", closeInfoModal),
    ]),
  ]);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const earlyLeaveReason = String(formData(form).earlyLeaveReason || "").trim();
    if (!earlyLeaveReason) return notify("조퇴 사유를 입력해주세요.");
    if (getActiveOuting(student.id)) {
      closeInfoModal();
      render();
      return notify("이미 진행 중인 신청이 있습니다.");
    }

    submitButton.disabled = true;
    setButtonLoading(submitButton, "신청 저장 중...");
    try {
      await createEarlyLeaveRequest(student, earlyLeaveReason);
      closeInfoModal();
      render();
      notify("조퇴 신청이 접수되었습니다.");
    } catch (error) {
      console.error("Failed to save an administrator early-leave request", error);
      if (error?.message === "active_outing_exists") {
        closeInfoModal();
        render();
        notify("이미 진행 중인 신청이 있습니다.");
        return;
      }
      submitButton.disabled = false;
      submitButton.textContent = "조퇴 신청하기";
      notify("조퇴 신청을 저장하지 못했습니다. 잠시 후 다시 시도해주세요.");
    }
  });

  openInfoModal({
    title: "관리자 조퇴 신청",
    content: form,
  });
  requestAnimationFrame(() => reasonInput.focus());
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
  const type = studentPreviewGradeTypeByStudent[student.id] === "final" ? "final" : "weekly";
  return panel("성적", [
    renderStudentPreviewGradeTabs(student.id, type),
    type === "weekly"
      ? renderStudentWeeklyGradePreviewPanel(student, selectedWeeklyExam, weeklyExams)
      : renderStudentGradePreviewPanel(summary, roundOptions),
  ]);
}

function renderStudentPreviewGradeTabs(studentId, activeType = "weekly") {
  const items = [
    { key: "weekly", label: "주간평가" },
    { key: "final", label: "파이널" },
  ];
  return el("div", { className: "student-grade-type-tabs" }, items.map((item) =>
    button(item.label, activeType === item.key ? "mini-btn active" : "mini-btn", "button", () => {
      studentPreviewGradeTypeByStudent[studentId] = item.key;
      render();
    })
  ));
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
  const title = exam ? `${Number(exam.weekNumber) || 1}주차 주간평가 성적` : "주간평가 성적";
  const headerControl = exam ? renderTeacherPreviewWeeklyExamSelect(student.id, exams, exam) : null;
  if (exam && !isTeacherWeeklyGradeDataLoaded(exam.id)) {
    requestTeacherWeeklyGradeDataForExams([exam]);
    return el("div", { className: "student-grade-result" }, [
      el("div", { className: "student-grade-result-title" }, [
        el("strong", {}, title),
        headerControl,
      ]),
      renderDataLoadingState("주간평가 성적을 불러오는 중입니다."),
    ]);
  }
  scheduleTeacherWeeklyGradeDataRefresh(exam ? [exam] : []);
  const summary = exam ? getTeacherPreviewWeeklySummary(student, exam) : null;
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
    isSameGradeRankingGroup(getTeacherStudentRegisteredTrack(item.student), track)
  ).length;
  return summary;
}

function getTeacherPreviewWeeklySubjectSummaries(student, exam, summary) {
  const track = getTeacherStudentRegisteredTrack(student);
  const peers = getStudentsInCohort(getStudentCohort(student))
    .filter((peer) => getTeacherStudentRegisteredTrack(peer) === track);
  return getWeeklyGradeSectionsForStudent(exam, student).map((section) => {
    const subjectScore = summary.subjectScores?.[section.subject] || {};
    const submitted = subjectScore.status === "submitted";
    const peerScores = peers.map((peer) => {
      const peerSection = getWeeklyGradeSectionsForStudent(exam, peer).find((item) => item.subject === section.subject);
      if (!peerSection) return null;
      const peerSubmission = getStudentExamSubmission(peer.id, peerSection.id);
      if (!peerSubmission) return null;
      const questionCount = getWeeklyGradeVisibleAnswers(peerSection, peer).length;
      const maxScore = sumWeeklyAnswerPoints(getWeeklyGradeVisibleAnswers(peerSection, peer), peerSection);
      const score = Number(peerSubmission.score) || 0;
      const wrongCount = Math.max(0, questionCount - (Number(peerSubmission.correctCount) || 0));
      return {
        id: peer.id,
        score,
        wrongCount,
        percent: maxScore ? Math.round((score / maxScore) * 1000) / 10 : 0,
      };
    }).filter(Boolean);
    const sorted = [...peerScores].sort((a, b) =>
      b.percent - a.percent ||
      b.score - a.score ||
      a.wrongCount - b.wrongCount ||
      String(a.id).localeCompare(String(b.id), "ko-KR", { numeric: true })
    );
    const rank = submitted ? sorted.findIndex((item) => String(item.id) === String(student.id)) + 1 : 0;
    const topPercent = rank ? calculateGradePercentile(rank, sorted.length) : 0;
    return {
      subject: section.subject,
      track,
      submitted,
      score: Number(subjectScore.score) || 0,
      wrongCount: submitted ? Math.max(0, (Number(subjectScore.questionCount) || 0) - (Number(subjectScore.correctCount) || 0)) : "-",
      rank,
      topPercent,
      displayTopPercent: rank ? Math.max(1, Math.ceil(topPercent)) : 0,
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
    isSameGradeRankingGroup(getTeacherStudentRegisteredTrack(item.student), track)
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
      student_category: getStudentCategory(student),
      cohort: getStudentCohort(student) ? Number(getStudentCohort(student)) : null,
      track: normalizeCoastGuardTrack(student.track) || null,
      is_active: true,
      attendance_excluded: student.attendanceExcluded === true,
      fitness_excluded: student.fitnessExcluded === true,
      created_at: student.createdAt || new Date().toISOString(),
    }));

  if (!rows.length) return;
  if (APP_MODE === "teacher" && await saveStudentsToTeacherApi(rows)) return;

  if (!remoteStore) {
    await loadSupabaseSdk();
    remoteStore = createRemoteStore();
  }
  if (!remoteStore) return;

  const clientRows = rows.map(({ student_category, cohort, ...row }) => row);
  const { error } = await remoteStore.from("students").upsert(clientRows, { onConflict: "id", ignoreDuplicates: true });
  if (isMissingColumnError(error, "attendance_excluded") || isMissingColumnError(error, "fitness_excluded")) {
    const fallbackRows = clientRows.map(({ attendance_excluded, fitness_excluded, ...row }) => row);
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
        fitness_excluded: row.fitness_excluded,
      })
      .eq("id", row.id);
    if (isMissingColumnError(updateError, "attendance_excluded") || isMissingColumnError(updateError, "fitness_excluded")) {
      const { error: fallbackError } = await remoteStore
        .from("students")
        .update({
          name: row.name,
          class_name: row.class_name,
          student_category: row.student_category,
          cohort: row.cohort,
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


function parseStudentRoster(value, cohort, studentCategory = "offline") {
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

async function toggleStudentFitnessExcluded(id) {
  const student = findStudent(id);
  if (!student) return;
  const nextValue = !isFitnessExcludedStudent(student);
  const message = nextValue
    ? `${student.name} (${student.id}) 학생을 체력평가 대상에서 제외할까요?`
    : `${student.name} (${student.id}) 학생을 다시 체력평가 대상에 포함할까요?`;
  if (!confirm(message)) return;
  const previousValue = student.fitnessExcluded === true;
  student.fitnessExcluded = nextValue;
  try {
    await updateStudentFitnessExcludedRemote(student.id, nextValue);
    saveState({ skipRemote: true });
    render();
    notify(nextValue ? "체력평가 제외로 변경했습니다." : "체력평가 포함으로 변경했습니다.");
  } catch (error) {
    console.error(error);
    student.fitnessExcluded = previousValue;
    render();
    notify("체력평가 제외 설정을 서버에 저장하지 못했습니다. Supabase 스키마를 먼저 반영해주세요.");
  }
}

async function updateStudentFitnessExcludedRemote(id, excluded) {
  if (!remoteStore) {
    await loadSupabaseSdk();
    remoteStore = createRemoteStore();
  }
  if (!remoteStore) return;
  const { error } = await remoteStore
    .from("students")
    .update({ fitness_excluded: excluded })
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

function openStudentPasswordResetModal(id) {
  const student = findStudent(id);
  if (!student) return notify("학생 정보를 찾을 수 없습니다.");

  const resetButton = button("비밀번호 초기화", "btn danger", "button", async () => {
    resetButton.disabled = true;
    try {
      await resetStudentPassword(student.id);
    } finally {
      resetButton.disabled = false;
    }
  });

  openInfoModal({
    title: "학생 비밀번호 초기화",
    className: "student-password-reset-modal",
    content: el("div", { className: "student-password-reset-content" }, [
      el("p", {}, [
        el("strong", {}, `${student.name} (${student.id})`),
        " 학생의 비밀번호를 초기화합니다.",
      ]),
      el("p", { className: "subtle" }, "보안을 위해 기존에 등록된 모든 기기도 함께 해제됩니다. 학생은 다음 앱 등록 때 새 비밀번호를 설정할 수 있습니다."),
      el("div", { className: "attendance-modal-actions" }, [
        button("취소", "btn secondary", "button", closeInfoModal),
        resetButton,
      ]),
    ]),
  });
}

async function resetStudentPassword(id) {
  const student = findStudent(id);
  if (!student) return notify("학생 정보를 찾을 수 없습니다.");

  closeInfoModal();
  openLoadingModal("비밀번호 초기화 중", "학생 비밀번호와 등록 기기를 초기화하고 있습니다.");

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
        } else if (response.status === 403) {
          notify("비밀번호를 초기화할 권한이 없습니다.");
        } else if (response.status === 404) {
          notify("학생 정보를 찾을 수 없습니다.");
        } else {
          notify(response.status === 503 ? "서버 초기화 설정을 확인해주세요." : "서버 비밀번호 초기화에 실패했습니다.");
        }
        return;
      }
    } catch (error) {
      console.error(error);
      notify("서버 비밀번호 초기화 요청 중 오류가 발생했습니다.");
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

  saveState({ skipRemote: true });
  render();
  notify(`${student.name} 학생의 비밀번호를 초기화했습니다. 다음 앱 등록 때 새 비밀번호를 설정할 수 있습니다.`);
}
