const teacherFilters = {
  query: "",
  sort: "name",
};

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
  const todayChecks = getAttendanceChecksForDate(todayKey);
  const presentChecks = todayChecks.filter((check) => check.status === "present");
  const reasonChecks = todayChecks.filter((check) => check.status === "pre_arrival_reason");
  const checkedStudentIds = new Set(todayChecks.map((check) => check.studentId));
  const absentStudents = state.students.filter((student) => !checkedStudentIds.has(student.id));

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
      el("p", { className: "subtle" }, "학생이 촬영한 현장 사진으로 출석 인증 여부를 확인합니다. 이미지는 Storage에 저장되고 이 화면은 경로만 불러옵니다."),
      todayChecks.length ? renderAttendanceTable(todayChecks) : el("div", { className: "empty" }, "오늘 출석 인증 내역이 없습니다."),
    ]),
    panel("출석 시간 설정", [attendanceDeadlineForm()]),
    panel("미인증 학생", [
      absentStudents.length
        ? table(
            ["고유번호", "이름", "반"],
            absentStudents
              .sort((a, b) => String(a.id).localeCompare(String(b.id), "ko-KR", { numeric: true }))
              .map((student) => el("tr", {}, [el("td", {}, student.id), el("td", {}, student.name), el("td", {}, student.className || "-")]))
          )
        : el("div", { className: "empty success-message" }, "모든 학생이 오늘 출석 인증을 완료했습니다."),
    ]),
  ]);
}

function attendanceDeadlineForm() {
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
      button("설정 저장", "btn secondary"),
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
        el("td", {}, [
          el("strong", {}, check.studentName || "-"),
          el("span", { className: "cell-sub" }, check.studentId || "-"),
        ]),
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
          el("th", {}, "학생"),
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
      el("td", {}, [
        el("strong", {}, outing.studentName || "-"),
        el("span", { className: "cell-sub" }, outing.studentId || "-"),
      ]),
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
          el("th", {}, "학생"),
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

  return [
    hasTeacherPermission("outing.approve") ? button("승인", "mini-btn", "button", () => decideOuting(outing.id, "approved")) : null,
    hasTeacherPermission("outing.approve") ? button("반려", "mini-btn danger", "button", () => decideOuting(outing.id, "rejected")) : null,
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
          el("img", { src: group.photo.dataUrl, alt: group.photo.type }),
          el("div", {}, [
            el("strong", {}, group.photo.type + " · " + group.items.length + "건"),
            el("p", { className: "subtle" }, group.items.map((item) => item.studentName + " (" + item.studentId + ")").join(", ")),
          ]),
        ])
      )
    ),
  ]);
}

function findDuplicatePhotoGroups(outings) {
  const map = new Map();
  outings.forEach((outing) => {
    outing.photos.forEach((photo) => {
      if (!photo.dataUrl) return;
      const key = photo.dataUrl;
      if (!map.has(key)) map.set(key, { photo, items: [] });
      map.get(key).items.push(outing);
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
        el("td", {}, student.id),
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
      ["고유번호", "이름", "반", "앱 등록", "직렬", "성별", "관리"],
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
