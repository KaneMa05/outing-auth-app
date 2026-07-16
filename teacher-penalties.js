function renderPenaltyManagement() {
  if (!hasTeacherPermission("penalties.read")) return renderForbidden();
  const selected = selectedStudentCohortCount();
  const visiblePenalties = getFilteredPenaltyHistory(selected.value);
  const activePenalties = getFilteredPenalties(selected.value);
  const summaries = getPenaltySummaries(activePenalties, selected.value);
  const penalizedStudents = summaries.filter((item) => item.total > 0).length;
  const latestPenalties = [...visiblePenalties].sort((a, b) => new Date(getPenaltyActivityAt(b)) - new Date(getPenaltyActivityAt(a)));

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
  return (state.penalties || []).filter((penalty) => !isPenaltyDeleted(penalty) && isPenaltyInSelectedPeriod(penalty) && isPenaltyInSelectedCohort(penalty, cohort));
}

function getFilteredPenaltyHistory(cohort = selectedStudentCohort) {
  return (state.penalties || []).filter((penalty) => isPenaltyInSelectedHistoryPeriod(penalty) && isPenaltyInSelectedCohort(penalty, cohort));
}

function isPenaltyInSelectedPeriod(penalty) {
  const dateKey = getDateInputValue(penalty.createdAt);
  if (!dateKey) return false;
  if (penaltyPeriodFilter.start && dateKey < penaltyPeriodFilter.start) return false;
  if (penaltyPeriodFilter.end && dateKey > penaltyPeriodFilter.end) return false;
  return true;
}

function isPenaltyInSelectedHistoryPeriod(penalty) {
  if (isPenaltyInSelectedPeriod(penalty)) return true;
  if (!isPenaltyDeleted(penalty)) return false;
  const deletedDateKey = getDateInputValue(penalty.deletedAt);
  if (!deletedDateKey) return false;
  if (penaltyPeriodFilter.start && deletedDateKey < penaltyPeriodFilter.start) return false;
  if (penaltyPeriodFilter.end && deletedDateKey > penaltyPeriodFilter.end) return false;
  return true;
}

function getPenaltyActivityAt(penalty) {
  return penalty?.deletedAt || penalty?.createdAt || "";
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
  const headers = showDeleteColumn ? ["부여일", "번호", "이름", "상/벌점", "상태", "사유", "담당자", "관리"] : ["부여일", "번호", "이름", "상/벌점", "상태", "사유", "담당자"];
  const rows = penalties.map((penalty) =>
    el("tr", {}, [
      el("td", {}, formatDateCompact(penalty.createdAt)),
      el("td", {}, formatStudentNumber(penalty.studentId)),
      el("td", {}, penalty.studentName || "-"),
      el("td", {}, el("span", { className: getPenaltyPointClass(penalty.points) }, formatPenaltyPoints(penalty.points))),
      el("td", {}, penaltyStatusBadge(penalty)),
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

function penaltyStatusBadge(penalty) {
  if (!isPenaltyDeleted(penalty)) return el("span", { className: "badge approved" }, "부여");
  const deletedAt = formatDateCompact(penalty.deletedAt);
  const deletedBy = penalty.deletedBy ? ` · ${penalty.deletedBy}` : "";
  return el("div", { title: `${deletedAt}${deletedBy}` }, [
    el("span", { className: "badge rejected" }, "삭제"),
    el("small", {}, `${deletedAt}${deletedBy}`),
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
    el("option", { value: "" }, ""),
    ...PENALTY_PRESETS.map((preset) => el("option", { value: preset.reason }, `${preset.reason} - ${preset.points}점`)),
    el("option", { value: "__custom__" }, "직접 입력"),
  ]);
  const pointsInput = el("input", { name: "points", type: "number", min: "1", step: "1", placeholder: "예: 1", required: true });
  const reasonInput = textarea("reason", "상/벌점 사유");
  reasonInput.required = true;
  let reasonEditMode = false;
  const reasonPreviewText = el("span", { className: "penalty-reason-preview-text" });
  const reasonEditButton = button("수정", "mini-btn", "button", () => {
    reasonEditMode = true;
    syncPresetState();
    reasonInput.focus();
  });
  const reasonPreview = el("div", { className: "penalty-reason-preview" }, [reasonPreviewText, reasonEditButton]);
  const reasonControl = el("div", { className: "penalty-reason-control" }, [reasonPreview, reasonInput]);
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
    field("사유", reasonControl, "full"),
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
    const preset = PENALTY_PRESETS.find((item) => item.reason === presetSelect.value);
    const isDirectInput = isPenalty && presetSelect.value === "__custom__";
    const isPresetPenalty = isPenalty && Boolean(preset);
    const shouldEditReason = !isPenalty || isDirectInput || reasonEditMode;
    presetSelect.disabled = !isPenalty;
    reasonPreview.hidden = shouldEditReason;
    reasonEditButton.hidden = !isPresetPenalty;
    reasonInput.hidden = !shouldEditReason;
    reasonInput.required = shouldEditReason;
    reasonInput.disabled = !shouldEditReason;
    if (!isPenalty) {
      presetSelect.value = "";
      reasonPreviewText.textContent = "";
      return;
    }
    if (isDirectInput) {
      reasonInput.value = "";
      reasonPreviewText.textContent = "";
      return;
    }
    if (!preset) {
      reasonPreviewText.textContent = "벌점 항목을 선택해주세요.";
      return;
    }
    pointsInput.value = String(preset.points);
    if (!reasonEditMode) reasonInput.value = preset.reason;
    reasonPreviewText.textContent = reasonInput.value || preset.reason;
  };
  typeSelect.addEventListener("change", () => {
    reasonEditMode = false;
    syncPresetState();
  });
  presetSelect.addEventListener("change", () => {
    reasonEditMode = false;
    syncPresetState();
  });
  syncPresetState();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = formData(form);
    const points = Number(data.points);
    const selectedPreset = PENALTY_PRESETS.find((item) => item.reason === data.penaltyPreset);
    const reason = data.scoreType === "penalty" && selectedPreset && !reasonEditMode
      ? selectedPreset.reason
      : String(data.reason || "").trim();
    if (!selectedStudents.length) return notify("학생을 한 명 이상 추가해주세요.");
    if (data.scoreType === "penalty" && !data.penaltyPreset) return notify("벌점 항목을 선택해주세요.");
    if (!Number.isFinite(points) || points < 1) return notify("점수는 1점 이상 입력해주세요.");
    if (!reason) return notify(data.penaltyPreset === "__custom__" ? "직접 입력할 벌점 사유를 입력해주세요." : "상/벌점 사유를 입력해주세요.");
    const signedPoints = data.scoreType === "reward" ? -Math.floor(points) : Math.floor(points);
    try {
      await Promise.all(selectedStudents.map((student) => createPenalty(student, signedPoints, reason, data.managerName)));
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

