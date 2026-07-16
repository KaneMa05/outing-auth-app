const SEAT_ROOM_LECTURE_HALL = "lectureHall";
const SEAT_ROOM_STUDY_ROOM = "studyRoom";
const seatRoomLabels = {
  [SEAT_ROOM_LECTURE_HALL]: "대강의실",
  [SEAT_ROOM_STUDY_ROOM]: "공채실(자습실)",
};
const lectureHallSeatGroups = createLectureHallSeatGroups();
const lectureHallSeatIds = lectureHallSeatGroups.flatMap((group) => group.seats.map(String));
const studyRoomSeatColumns = createStudyRoomSeatColumns();
const studyRoomSeatIds = studyRoomSeatColumns.flatMap((column) => column.seats.map(String));
let selectedSeatRoom = SEAT_ROOM_LECTURE_HALL;

function renderSeatManagement() {
  if (!hasTeacherPermission("seats.read")) return renderForbidden();
  const selected = selectedStudentCohortCount();
  ensureSeatAssignments(selected.value);
  const seatIds = getSeatRoomIds(selectedSeatRoom);
  const roomSeats = getSeatRoomAssignments(selectedSeatRoom, selected.value);
  const lectureHallSeats = getSeatRoomAssignments(SEAT_ROOM_LECTURE_HALL, selected.value);
  const studyRoomSeats = getSeatRoomAssignments(SEAT_ROOM_STUDY_ROOM, selected.value);
  const assignedCount = seatIds.filter((seatId) => roomSeats[seatId]?.studentId).length;
  const offlineStudents = getSeatAssignableStudents();
  const unassignedCount = offlineStudents.filter((student) => !findSeatByStudentId(student.id)).length;
  const roomLabel = seatRoomLabels[selectedSeatRoom] || "좌석";

  return el("div", { className: "grid seat-management" }, [
    el("section", { className: "panel" }, [
      el("div", { className: "panel-title-row seat-title-row" }, [
        el("h2", {}, "좌석 관리"),
        renderSeatCohortControl(selected),
      ]),
      el("div", { className: "seat-room-tabs" }, [
        seatRoomTab(SEAT_ROOM_LECTURE_HALL),
        seatRoomTab(SEAT_ROOM_STUDY_ROOM),
      ]),
      el("div", { className: "seat-summary-grid" }, [
        stat("전체 좌석", seatIds.length, "석"),
        stat("배정 완료", assignedCount, "석"),
        stat(`${selected.label} 미배정`, unassignedCount, "명"),
      ]),
    ]),
    el("section", { className: "panel seat-current-panel" }, [
      el("div", { className: "panel-title-row" }, [
        el("h2", {}, `${roomLabel} 좌석 배치`),
      ]),
      selectedSeatRoom === SEAT_ROOM_LECTURE_HALL ? renderLectureHallBoard(roomSeats) : renderStudyRoomBoard(roomSeats),
    ]),
    renderSeatPrintSheets(selected, lectureHallSeats, studyRoomSeats),
  ]);
}

function renderSeatPrintSheets(selected, lectureHallSeats, studyRoomSeats) {
  return el("div", { className: "seat-print-sheets", ariaHidden: "true" }, [
    el("section", { className: "seat-print-sheet" }, [
      el("h2", {}, `${selected.label} 대강의실 좌석 배치`),
      renderLectureHallBoard(lectureHallSeats),
    ]),
    el("section", { className: "seat-print-sheet" }, [
      el("h2", {}, `${selected.label} 공채실 좌석 배치`),
      renderStudyRoomBoard(studyRoomSeats),
    ]),
  ]);
}

function seatRoomTab(roomId) {
  return button(seatRoomLabels[roomId], `mini-btn${selectedSeatRoom === roomId ? " active" : ""}`, "button", () => {
    selectedSeatRoom = roomId;
    ensureSeatAssignments(getCurrentStudentCohort());
    render();
  });
}

function getSeatRoomIds(roomId) {
  return roomId === SEAT_ROOM_STUDY_ROOM ? studyRoomSeatIds : lectureHallSeatIds;
}

function renderSeatCohortControl(selected) {
  const cohorts = getStudentCohortStats();
  const selectNode = el("select", { className: "cohort-select", ariaLabel: "좌석 관리 기수 선택" }, [
    (cohorts.length ? cohorts : [selected]).map((cohort) => el("option", { value: cohort.value }, cohort.label)),
  ]);
  selectNode.value = selected.value;
  selectNode.addEventListener("change", () => {
    selectedStudentCohort = selectNode.value;
    ensureSeatAssignments(selectedStudentCohort);
    render();
  });

  return el("div", { className: "seat-toolbar" }, [
    el("label", { className: "cohort-filter" }, [
      el("span", {}, "기수"),
      selectNode,
    ]),
    button("인쇄", "mini-btn seat-print-button", "button", printSeatSheets),
  ]);
}

function printSeatSheets() {
  document.body.classList.add("seat-print-mode");
  const cleanup = () => document.body.classList.remove("seat-print-mode");
  window.addEventListener("afterprint", cleanup, { once: true });
  window.print();
  setTimeout(cleanup, 1000);
}

function createLectureHallSeatGroups() {
  const groups = [];
  for (let row = 1; row <= 8; row += 1) {
    const base = (row - 1) * 12;
    groups.push({ row, zone: "left", seats: [base + 1, base + 2, base + 3, base + 4] });
    groups.push({ row, zone: "center", seats: [base + 5, base + 6, base + 7, base + 8] });
    groups.push({ row, zone: "right", seats: [base + 9, base + 10, base + 11, base + 12] });
  }
  [
    { row: 9, zone: "lower-left", seats: [97, 98] },
    { row: 9, zone: "lower-center", seats: [99, 100, 101, 102] },
    { row: 9, zone: "lower-right", seats: [103, 104, 105, 106] },
    { row: 10, zone: "lower-left", seats: [107, 108] },
    { row: 10, zone: "lower-center", seats: [109, 110, 111, 112] },
    { row: 10, zone: "lower-right", seats: [113, 114, 115, 116] },
    { row: 11, zone: "lower-center", seats: [119, 120, 121, 122] },
    { row: 11, zone: "lower-right", seats: [123, 124, 125, 126] },
  ].forEach((group) => groups.push(group));
  return groups;
}

function createStudyRoomSeatColumns() {
  return [
    { key: "far-left", label: "좌측", seats: rangeSeats(35, 47).reverse() },
    { key: "mid-left", label: "좌측 2열", seats: rangeSeats(23, 34).reverse() },
    { key: "mid-right", label: "우측 2열", seats: rangeSeats(12, 22).reverse() },
    { key: "far-right", label: "우측 끝", seats: rangeSeats(1, 11).reverse() },
  ];
}

function rangeSeats(start, end) {
  const seats = [];
  for (let seat = start; seat <= end; seat += 1) seats.push(seat);
  return seats;
}

function ensureSeatAssignments(cohort = getCurrentStudentCohort()) {
  if (!state.seatAssignments || typeof state.seatAssignments !== "object") state.seatAssignments = {};
  const cohortKey = String(cohort || DEFAULT_STUDENT_COHORT).trim() || DEFAULT_STUDENT_COHORT;
  const legacyLectureHall = state.seatAssignments[SEAT_ROOM_LECTURE_HALL];
  const legacyStudyRoom = state.seatAssignments[SEAT_ROOM_STUDY_ROOM];
  if (legacyLectureHall || legacyStudyRoom) {
    const legacyRooms = {
      [SEAT_ROOM_LECTURE_HALL]: legacyLectureHall || {},
      [SEAT_ROOM_STUDY_ROOM]: legacyStudyRoom || {},
    };
    delete state.seatAssignments[SEAT_ROOM_LECTURE_HALL];
    delete state.seatAssignments[SEAT_ROOM_STUDY_ROOM];
    if (!state.seatAssignments[cohortKey]) state.seatAssignments[cohortKey] = legacyRooms;
  }
  if (!state.seatAssignments[cohortKey] || typeof state.seatAssignments[cohortKey] !== "object") state.seatAssignments[cohortKey] = {};
  if (!state.seatAssignments[cohortKey][SEAT_ROOM_LECTURE_HALL]) state.seatAssignments[cohortKey][SEAT_ROOM_LECTURE_HALL] = {};
  if (!state.seatAssignments[cohortKey][SEAT_ROOM_STUDY_ROOM]) state.seatAssignments[cohortKey][SEAT_ROOM_STUDY_ROOM] = {};
  return state.seatAssignments;
}

function getSeatRoomAssignments(roomId, cohort = getCurrentStudentCohort()) {
  const cohortKey = String(cohort || DEFAULT_STUDENT_COHORT).trim() || DEFAULT_STUDENT_COHORT;
  return ensureSeatAssignments(cohortKey)[cohortKey]?.[roomId] || {};
}

function renderLectureHallBoard(roomSeats) {
  return el("div", { className: "seat-board-wrap" }, [
    el("div", { className: "lecture-layout", role: "grid", ariaLabel: "대강의실 좌석 배치" }, [
      el("div", { className: "lecture-border lecture-border-top", ariaHidden: "true" }),
      el("div", { className: "lecture-border lecture-border-right", ariaHidden: "true" }),
      el("div", { className: "lecture-border lecture-border-bottom", ariaHidden: "true" }),
      el("div", { className: "lecture-border lecture-border-left", ariaHidden: "true" }),
      el("div", { className: "lecture-border lecture-border-notch-top", ariaHidden: "true" }),
      el("div", { className: "lecture-border lecture-border-notch-left", ariaHidden: "true" }),
      el("div", { className: "lecture-stage" }, "칠판"),
      el("div", { className: "lecture-side-door lecture-side-door-top" }, "출입문"),
      el("div", { className: "lecture-side-door lecture-side-door-bottom" }, "출입문"),
      el("div", { className: "lecture-front-room" }, [
        ...renderLectureRowLabels(1, 8),
        ...lectureHallSeatGroups
          .filter((group) => group.row <= 8)
          .map((group) => renderSeatGroup(group, roomSeats)),
      ]),
      el("div", { className: "lecture-exit-label" }, "출입문"),
      el("div", { className: "lecture-bottom-door" }, "출입문"),
      el("div", { className: "lecture-lower-room" }, [
        ...renderLectureRowLabels(9, 11),
        ...lectureHallSeatGroups
          .filter((group) => group.row >= 9)
          .map((group) => renderSeatGroup(group, roomSeats)),
      ]),
    ]),
  ]);
}

function renderLectureRowLabels(startRow, endRow) {
  const labels = [];
  for (let row = startRow; row <= endRow; row += 1) {
    const rowIndex = row <= 8 ? row : row - 8;
    labels.push(el("div", { className: "lecture-row-label", style: `--seat-row-index: ${rowIndex};` }, `${row}열`));
  }
  return labels;
}

function renderSeatGroup(group, roomSeats) {
  const rowIndex = group.row <= 8 ? group.row : group.row - 8;
  const cells = [
    ...group.seats.map((seatId) => renderSeatButton(String(seatId), roomSeats[String(seatId)], SEAT_ROOM_LECTURE_HALL)),
    ...Array.from({ length: group.placeholders || 0 }, () => el("div", { className: "seat-cell placeholder", ariaHidden: "true" })),
  ];
  return el(
    "div",
    {
      className: `seat-group ${group.zone}`,
      style: `--seat-row-index: ${rowIndex}; --seat-count: ${Math.max(group.seats.length + (group.placeholders || 0), 1)};`,
    },
    cells
  );
}

function renderSeatButton(seatId, assignment, roomId = selectedSeatRoom) {
  const student = assignment?.studentId ? findStudent(assignment.studentId) : null;
  const occupied = Boolean(student);
  const trackLabel = occupied ? formatSeatTrackLabel(getTeacherStudentRegisteredTrack(student)) : "";
  const node = button("", `seat-cell${occupied ? " occupied" : ""}`, "button", () => openSeatModal(roomId, seatId), [
    el("span", { className: "seat-number" }, seatId),
    el("strong", {}, occupied ? student.name : ""),
    occupied ? el("small", {}, formatStudentNumber(student.id)) : null,
    occupied && trackLabel ? el("em", {}, trackLabel) : null,
  ]);
  node.setAttribute("role", "gridcell");
  node.ariaLabel = occupied ? `${seatId}번 ${student.name} 학생 좌석 수정` : `${seatId}번 빈 좌석 학생 등록`;
  return node;
}

function renderStudyRoomBoard(roomSeats) {
  return el("div", { className: "study-seat-board-wrap" }, [
    el("div", { className: "study-seat-layout", role: "grid", ariaLabel: "공채실 좌석 배치" }, [
      el("div", { className: "study-door" }, "출입문"),
      ...studyRoomSeatColumns.map((column) =>
        el("div", { className: `study-seat-column ${column.key}` }, [
          el("div", { className: "study-column-label" }, column.label),
          ...column.seats.map((seatId) => renderSeatButton(String(seatId), roomSeats[String(seatId)], SEAT_ROOM_STUDY_ROOM)),
        ])
      ),
    ]),
  ]);
}

function formatSeatTrackLabel(track) {
  const value = String(track || "").trim();
  if (!value) return "";
  const compact = value.replace(/\s+/g, "");
  if (compact.includes("함정요원기관")) return "함정(기관)";
  if (compact.includes("함정요원항해")) return "함정(항해)";
  if ((compact.includes("경위공채") || compact.includes("간부")) && compact.includes("기관")) return "간부(기관)";
  if ((compact.includes("경위공채") || compact.includes("간부")) && compact.includes("항해")) return "간부(항해)";
  if (compact.includes("공채(순경)") || compact.includes("공채")) return "공채";
  if (compact.includes("해경학과기관")) return "학과(기관)";
  if (compact.includes("해경학과항해")) return "학과(항해)";
  if (compact.includes("선박교통관제") || compact.includes("해상교통관제") || compact.includes("VTS")) return "VTS";
  if (compact.includes("구조")) return "구조";
  if (compact.includes("구급")) return "구급";
  return value
    .replace(/^경찰직\s*-\s*/, "")
    .replace(/^일반직\s*-\s*/, "")
    .replace(/^경위\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function openSeatModal(roomId, seatId) {
  const roomSeats = getSeatRoomAssignments(roomId, getCurrentStudentCohort());
  const current = roomSeats[seatId] || {};
  const currentStudent = current.studentId ? findStudent(current.studentId) : null;
  const studentSelect = select("studentId", [""]);
  const currentStudentId = String(current.studentId || "");
  const assignedStudentIds = new Set(
    getAllSeatAssignmentsForCurrentCohort()
      .filter((item) => !(item.roomId === roomId && item.seatId === seatId) && item.assignment?.studentId)
      .map((item) => String(item.assignment.studentId))
  );
  getSeatAssignableStudents()
    .filter((student) => !assignedStudentIds.has(String(student.id)) || String(student.id) === currentStudentId)
    .forEach((student) => {
      studentSelect.appendChild(el("option", { value: student.id }, `${formatStudentNumber(student.id)} ${student.name}`));
    });
  studentSelect.value = currentStudent?.id || "";

  const form = el("form", { className: "seat-modal-form" }, [
    field("좌석", el("strong", {}, `${seatRoomLabels[roomId]} ${seatId}번`)),
    field("학생", studentSelect),
    el("div", { className: "attendance-modal-actions" }, [
      currentStudent ? button("삭제", "btn danger", "button", () => removeSeatAssignment(roomId, seatId, true)) : null,
      button("취소", "btn secondary", "button", closeInfoModal),
      button(currentStudent ? "수정" : "등록", "btn"),
    ]),
  ]);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const studentId = String(studentSelect.value || "").trim();
    if (!studentId) {
      notify("배정할 학생을 선택해주세요.");
      return;
    }
    const existingSeat = findSeatByStudentId(studentId);
    if (existingSeat && !(existingSeat.roomId === roomId && existingSeat.seatId === seatId)) {
      const existingRoomSeats = getSeatRoomAssignments(existingSeat.roomId, getCurrentStudentCohort());
      delete existingRoomSeats[existingSeat.seatId];
    }
    roomSeats[seatId] = {
      studentId,
      updatedAt: new Date().toISOString(),
    };
    saveState({ skipRemote: true });
    closeInfoModal();
    render();
    notify(`${seatId}번 좌석이 저장되었습니다.`);
  });

  const modal = el("div", { className: "info-modal", role: "dialog", ariaModal: "true" }, [
    el("button", { className: "info-modal-backdrop", type: "button", ariaLabel: "좌석 편집 닫기" }),
    el("div", { className: "info-modal-panel seat-modal" }, [
      el("div", { className: "attendance-modal-titlebar" }, [
        el("strong", {}, currentStudent ? "좌석 수정" : "학생 등록"),
        button("×", "icon-btn attendance-modal-close", "button", closeInfoModal),
      ]),
      form,
    ]),
  ]);
  modal.querySelector(".info-modal-backdrop").addEventListener("click", closeInfoModal);
  document.body.appendChild(modal);
  studentSelect.focus();
}

function removeSeatAssignment(roomId, seatId, fromModal = false) {
  const roomSeats = getSeatRoomAssignments(roomId, getCurrentStudentCohort());
  const assignment = roomSeats[seatId];
  if (!assignment?.studentId) return;
  const student = findStudent(assignment.studentId);
  if (!confirm(`${seatId}번 좌석의 ${student?.name || "학생"} 배정을 삭제할까요?`)) return;
  delete roomSeats[seatId];
  saveState({ skipRemote: true });
  if (fromModal) closeInfoModal();
  render();
  notify(`${seatId}번 좌석 배정을 삭제했습니다.`);
}

function getSeatAssignableStudents() {
  return getStudentsInCohort(selectedStudentCohort)
    .filter((student) => !isOnlineClassName(student.className))
    .sort((a, b) => {
      const cohortCompare = String(getStudentCohort(a) || "").localeCompare(String(getStudentCohort(b) || ""), "ko-KR");
      if (cohortCompare !== 0) return cohortCompare;
      return String(a.id || "").localeCompare(String(b.id || ""), "ko-KR", { numeric: true });
    });
}

function findSeatByStudentId(studentId) {
  const id = String(studentId || "").trim();
  if (!id) return null;
  for (const item of getAllSeatAssignmentsForCurrentCohort()) {
    if (String(item.assignment?.studentId || "") === id) return item;
  }
  return null;
}

function getAllSeatAssignmentsForCurrentCohort() {
  const cohortKey = getCurrentStudentCohort();
  const cohortRooms = ensureSeatAssignments(cohortKey)[cohortKey] || {};
  return [SEAT_ROOM_LECTURE_HALL, SEAT_ROOM_STUDY_ROOM].flatMap((roomId) =>
    Object.entries(cohortRooms[roomId] || {}).map(([seatId, assignment]) => ({ roomId, seatId, assignment }))
  );
}
