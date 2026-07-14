const fitnessFilters = {
  query: "",
  month: getCurrentFitnessMonth(),
};
let fitnessInputRows = [];

const FITNESS_EVENTS = [
  { key: "sitUpCount", scoreKey: "sitUp", label: "윗몸일으키기", unit: "회" },
  { key: "pushUpCount", scoreKey: "pushUp", label: "팔굽혀펴기", unit: "회" },
  { key: "gripStrength", scoreKey: "grip", label: "악력", unit: "kg" },
];

const FITNESS_SCORE_RULES = {
  male: {
    sitUp: [
      { min: 58, score: 10 }, { min: 55, score: 9 }, { min: 51, score: 8 }, { min: 46, score: 7 }, { min: 40, score: 6 },
      { min: 36, score: 5 }, { min: 31, score: 4 }, { min: 25, score: 3 }, { min: 22, score: 2 }, { min: 0, score: 1 },
    ],
    pushUp: [
      { min: 58, score: 10 }, { min: 54, score: 9 }, { min: 50, score: 8 }, { min: 46, score: 7 }, { min: 42, score: 6 },
      { min: 38, score: 5 }, { min: 33, score: 4 }, { min: 28, score: 3 }, { min: 23, score: 2 }, { min: 0, score: 1 },
    ],
    grip: [
      { min: 61, score: 10 }, { min: 59, score: 9 }, { min: 56, score: 8 }, { min: 54, score: 7 }, { min: 51, score: 6 },
      { min: 48, score: 5 }, { min: 45, score: 4 }, { min: 42, score: 3 }, { min: 38, score: 2 }, { min: 0, score: 1 },
    ],
  },
  female: {
    sitUp: [
      { min: 55, score: 10 }, { min: 50, score: 9 }, { min: 45, score: 8 }, { min: 40, score: 7 }, { min: 35, score: 6 },
      { min: 30, score: 5 }, { min: 25, score: 4 }, { min: 19, score: 3 }, { min: 13, score: 2 }, { min: 0, score: 1 },
    ],
    pushUp: [
      { min: 31, score: 10 }, { min: 28, score: 9 }, { min: 25, score: 8 }, { min: 22, score: 7 }, { min: 19, score: 6 },
      { min: 16, score: 5 }, { min: 13, score: 4 }, { min: 10, score: 3 }, { min: 7, score: 2 }, { min: 0, score: 1 },
    ],
    grip: [
      { min: 40, score: 10 }, { min: 38, score: 9 }, { min: 36, score: 8 }, { min: 34, score: 7 }, { min: 31, score: 6 },
      { min: 29, score: 5 }, { min: 27, score: 4 }, { min: 25, score: 3 }, { min: 22, score: 2 }, { min: 0, score: 1 },
    ],
  },
};

function renderFitnessManagement() {
  if (!hasTeacherPermission("fitness.read")) return renderForbidden();
  const selected = selectedStudentCohortCount();
  const students = getFitnessStudents(selected.value);
  const records = getFitnessRecordsForMonth(fitnessFilters.month);
  const savedCount = records.filter((record) => getStudentCohort({ id: record.studentId }) === selected.value).length;
  return el("div", { className: "grid fitness-management" }, [
    el("div", { className: "stat-groups" }, [
      studentCountStatGroup(),
      statGroup("체력평가", [
        stat("입력 완료", savedCount, "명"),
        stat("미입력", Math.max(0, students.length - savedCount), "명"),
        stat("평가월", formatFitnessMonth(fitnessFilters.month), "", { className: "fitness-month-stat" }),
      ]),
    ]),
    renderFitnessToolbar(),
    renderFitnessInputPanel(students, records),
    renderFitnessLookupPanel(students, records),
  ]);
}

function renderFitnessToolbar() {
  const monthInput = input("fitnessMonth", "month", "", fitnessFilters.month);
  monthInput.value = fitnessFilters.month;
  monthInput.addEventListener("change", () => {
    fitnessFilters.month = normalizeFitnessMonth(monthInput.value);
    render();
  });
  const queryInput = input("fitnessQuery", "search", "번호 또는 이름 검색", fitnessFilters.query);
  queryInput.addEventListener("input", () => {
    fitnessFilters.query = queryInput.value;
    render();
  });
  return panel("조회 조건", [
    el("div", { className: "teacher-search fitness-toolbar" }, [
      field("평가월", monthInput),
      field("검색", queryInput),
    ]),
  ]);
}

function renderFitnessInputPanel(students, records) {
  const recordByStudent = new Map(records.map((record) => [String(record.studentId), record]));
  fitnessInputRows = [];
  const visibleStudents = getFilteredFitnessStudents(students);
  const rows = visibleStudents.map((student) => renderFitnessInputRow(student, recordByStudent.get(String(student.id))));
  const bulkSaveButton = button("일괄 저장", "btn", "button", () => saveFitnessBulkScores());
  return panel("점수 입력", [
    el("p", { className: "subtle" }, "오프라인반 학생만 표시됩니다. 원점수를 입력하면 성별 기준에 따라 환산 점수와 총점이 자동 계산됩니다."),
    hasTeacherPermission("fitness.write") && visibleStudents.length
      ? el("div", { className: "fitness-bulk-actions" }, [bulkSaveButton])
      : null,
    table(
      ["번호", "이름", "성별", "윗몸", "팔굽", "악력", "환산"],
      rows.length ? rows : [el("tr", {}, [el("td", { colSpan: 7 }, el("div", { className: "empty table-empty" }, "조회할 오프라인반 학생이 없습니다."))])]
    ),
    hasTeacherPermission("fitness.write") && visibleStudents.length
      ? el("div", { className: "fitness-bulk-actions bottom" }, [button("일괄 저장", "btn", "button", () => saveFitnessBulkScores())])
      : null,
  ]);
}

function renderFitnessInputRow(student, record) {
  const gender = normalizeFitnessGender(student.gender || record?.gender);
  const values = {
    sitUpCount: record?.sitUpCount ?? "",
    pushUpCount: record?.pushUpCount ?? "",
    gripStrength: record?.gripStrength ?? "",
  };
  const score = calculateFitnessScore(values, gender);
  const scoreSummary = renderFitnessScoreSummary(score);
  const controls = {};
  FITNESS_EVENTS.forEach((event) => {
    controls[event.key] = el("input", {
      className: "fitness-score-input",
      type: "number",
      min: "0",
      step: event.scoreKey === "grip" ? "0.1" : "1",
      value: values[event.key] === null || values[event.key] === undefined ? "" : String(values[event.key]),
      ariaLabel: `${student.name || student.id} ${event.label}`,
    });
    controls[event.key].addEventListener("input", () => {
      updateFitnessScoreSummary(scoreSummary, calculateFitnessScore(readFitnessControlValues(controls), gender));
    });
  });
  const row = el("tr", {}, [
    el("td", {}, formatStudentNumber(student.id)),
    el("td", {}, student.name || "-"),
    el("td", {}, fitnessGenderLabel(gender)),
    ...FITNESS_EVENTS.map((event) => el("td", {}, controls[event.key])),
    el("td", {}, scoreSummary),
  ]);
  fitnessInputRows.push({ student, controls, existingRecord: record, gender });
  return row;
}

function renderFitnessLookupPanel(students, records) {
  const studentIds = new Set(students.map((student) => String(student.id)));
  const summaries = sortFitnessLookupRecords(applyFitnessRanks(records
    .filter((record) => studentIds.has(String(record.studentId)))
    .filter((record) => isFitnessRecordMatched(record))));
  const canDelete = hasTeacherPermission("fitness.write");
  const headers = ["성별 순위", "번호", "이름", "성별", "윗몸", "팔굽", "악력", "환산", "총점", "측정일", canDelete ? "처리" : null].filter(Boolean);
  const rows = summaries.map((record) => {
    const converted = record.convertedScores || calculateFitnessScore(record, normalizeFitnessGender(record.gender)).converted;
    return el("tr", {}, [
      el("td", {}, formatFitnessRankLabel(record)),
      el("td", {}, formatStudentNumber(record.studentId)),
      el("td", {}, record.studentName || getCanonicalStudentName(record.studentId, "") || "-"),
      el("td", {}, fitnessGenderLabel(normalizeFitnessGender(record.gender))),
      el("td", {}, formatFitnessRawScore(record.sitUpCount, "회")),
      el("td", {}, formatFitnessRawScore(record.pushUpCount, "회")),
      el("td", {}, formatFitnessRawScore(record.gripStrength, "kg")),
      el("td", {}, formatFitnessConvertedScores(converted)),
      el("td", {}, `${formatFitnessNumber(record.totalScore)}점`),
      el("td", {}, formatDateCompact(record.measuredAt || record.updatedAt || record.createdAt)),
      canDelete
        ? el("td", { className: "student-admin-actions" }, [
            button("삭제", "mini-btn danger", "button", () => deleteFitnessScore(record)),
          ])
        : null,
    ]);
  });
  return panel("점수 조회", [
    el("div", { className: "action-row weekly-answer-actions" }, [
      button("성적표 다운로드", "mini-btn secondary", "button", () => downloadFitnessMonthlyReport(students, records)),
    ]),
    table(headers, rows.length ? rows : [el("tr", {}, [el("td", { colSpan: headers.length }, el("div", { className: "empty table-empty" }, "입력된 체력평가 점수가 없습니다."))])]),
  ]);
}

function downloadFitnessMonthlyReport(students = getFitnessStudents(selectedStudentCohort), records = getFitnessRecordsForMonth(fitnessFilters.month)) {
  const month = normalizeFitnessMonth(fitnessFilters.month);
  const studentIds = new Set(students.map((student) => String(student.id)));
  const recordByStudent = new Map(records
    .filter((record) => studentIds.has(String(record.studentId)))
    .map((record) => [String(record.studentId), record]));
  const currentRecords = applyFitnessRanks(records
    .filter((record) => studentIds.has(String(record.studentId)))
    .filter(hasCompleteFitnessScoreRecord));

  const previousMonth = getPreviousFitnessMonth(month);
  const previousRecords = applyFitnessRanks(getFitnessRecordsForMonth(previousMonth)
    .filter((record) => studentIds.has(String(record.studentId)))
    .filter(hasCompleteFitnessScoreRecord));
  const previousRankByStudent = new Map(previousRecords.map((record) => [String(record.studentId), record.rank]));
  const sortedRecords = sortFitnessReportRecords(currentRecords);
  const headers = ["번호", "직렬", "성별", "이름", "악력", "팔굽", "윗몸", "악력(환산)", "팔굽(환산)", "윗몸(환산)", "총합", "등수", "전주등수", "등락"];
  const rows = sortedRecords.map((record) => {
    const converted = record.convertedScores || calculateFitnessScore(record, normalizeFitnessGender(record.gender)).converted;
    const previousRank = previousRankByStudent.get(String(record.studentId)) || 0;
    return {
      record,
      previousRank,
      cells: [
        formatStudentNumber(record.studentId),
        formatFitnessReportTrackLabel(getFitnessRecordTrack(record)),
        fitnessGenderLabel(record.gender),
        record.studentName || getCanonicalStudentName(record.studentId, "") || "",
        formatFitnessNumber(record.gripStrength),
        formatFitnessNumber(record.pushUpCount),
        formatFitnessNumber(record.sitUpCount),
        String(Number(converted.grip) || 0),
        String(Number(converted.pushUp) || 0),
        String(Number(converted.sitUp) || 0),
        String(Number(record.totalScore) || 0),
        record.rank ? String(record.rank) : "",
        previousRank ? String(previousRank) : "",
      ],
    };
  });
  const completeStudentIds = new Set(currentRecords.map((record) => String(record.studentId)));
  const missingRows = students
    .filter((student) => !completeStudentIds.has(String(student.id)))
    .map((student) => buildFitnessMissingReportRow(student, recordByStudent.get(String(student.id))))
    .sort((a, b) => String(a.student?.id || "").localeCompare(String(b.student?.id || ""), "ko-KR", { numeric: true }));
  if (!rows.length && !missingRows.length) return notify("다운로드할 체력평가 대상자가 없습니다.");

  const titleText = `${Number(month.split("-")[1])}월 오프라인 월간 체력 측정표`;
  const workbook = buildFitnessMonthlyReportWorkbook({ titleText, headers, rows, missingRows });
  downloadXlsx(`${sanitizeWeeklyGradeReportFilePart(titleText)}_${selectedStudentCohort || "전체"}기.xlsx`, workbook);
  notify("월간 체력 성적표를 다운로드했습니다.");
}

function hasCompleteFitnessScoreRecord(record) {
  return FITNESS_EVENTS.every((event) => !isFitnessEventUnmeasured(record, event));
}

function buildFitnessMissingReportRow(student, record) {
  const gender = normalizeFitnessGender(student?.gender || record?.gender);
  const missingEvents = FITNESS_EVENTS
    .filter((event) => isFitnessEventUnmeasured(record, event))
    .map(formatFitnessMissingEventLabel);
  const missingLabel = missingEvents.length === FITNESS_EVENTS.length || !record ? "전체 미측정" : `${missingEvents.join(", ")} 미측정`;
  return {
    student,
    record,
    cells: [
      formatStudentNumber(student?.id),
      formatFitnessReportTrackLabel(getTeacherStudentRegisteredTrack(student)),
      fitnessGenderLabel(gender),
      student?.name || record?.studentName || "",
      formatFitnessReportRawCell(record?.gripStrength),
      formatFitnessReportRawCell(record?.pushUpCount),
      formatFitnessReportRawCell(record?.sitUpCount),
      "",
      "",
      "",
      "",
      "",
      "",
      missingLabel,
    ],
  };
}

function isFitnessEventUnmeasured(record, event) {
  const value = record?.[event.key];
  if (value === "" || value === null || value === undefined) return true;
  const number = Number(value);
  return Number.isFinite(number) && number <= 0;
}

function formatFitnessReportRawCell(value) {
  if (value === "" || value === null || value === undefined) return "";
  return formatFitnessNumber(value);
}

function formatFitnessMissingEventLabel(event) {
  if (event?.key === "sitUpCount") return "윗몸";
  if (event?.key === "pushUpCount") return "팔굽";
  if (event?.key === "gripStrength") return "악력";
  return String(event?.label || "").trim();
}

function applyFitnessRanks(records = []) {
  const rankedRecords = records.map((record) => ({ ...record }));
  const groups = new Map();
  rankedRecords.forEach((record) => {
    const gender = normalizeFitnessGender(record.gender);
    if (!groups.has(gender)) groups.set(gender, []);
    groups.get(gender).push(record);
  });
  groups.forEach((items) => {
    const sorted = [...items].sort((a, b) => {
      const scoreCompare = (Number(b.totalScore) || 0) - (Number(a.totalScore) || 0);
      if (scoreCompare) return scoreCompare;
      return String(a.studentId || "").localeCompare(String(b.studentId || ""), "ko-KR", { numeric: true });
    });
    let previousScore = null;
    let previousRank = 0;
    sorted.forEach((record, index) => {
      const score = Number(record.totalScore) || 0;
      const rank = score === previousScore ? previousRank : index + 1;
      record.rank = rank;
      previousScore = score;
      previousRank = rank;
    });
  });
  return rankedRecords;
}

function sortFitnessLookupRecords(records = []) {
  return [...records].sort((a, b) => {
    const genderCompare = getFitnessGenderSortOrder(a.gender) - getFitnessGenderSortOrder(b.gender);
    if (genderCompare) return genderCompare;
    const rankA = Number(a.rank) || 0;
    const rankB = Number(b.rank) || 0;
    if (rankA && rankB && rankA !== rankB) return rankA - rankB;
    const scoreCompare = (Number(b.totalScore) || 0) - (Number(a.totalScore) || 0);
    if (scoreCompare) return scoreCompare;
    return String(a.studentId || "").localeCompare(String(b.studentId || ""), "ko-KR", { numeric: true });
  });
}

function formatFitnessRankLabel(record) {
  return record?.rank ? `${fitnessGenderLabel(record.gender)} ${record.rank}` : "-";
}

function getFitnessGenderSortOrder(gender) {
  return normalizeFitnessGender(gender) === "female" ? 2 : 1;
}

function sortFitnessReportRecords(records = []) {
  return [...records].sort((a, b) => {
    const genderCompare = getFitnessGenderSortOrder(a.gender) - getFitnessGenderSortOrder(b.gender);
    if (genderCompare) return genderCompare;
    const rankA = Number(a.rank) || 0;
    const rankB = Number(b.rank) || 0;
    if (rankA && rankB && rankA !== rankB) return rankA - rankB;
    const scoreCompare = (Number(b.totalScore) || 0) - (Number(a.totalScore) || 0);
    if (scoreCompare) return scoreCompare;
    return String(a.studentId || "").localeCompare(String(b.studentId || ""), "ko-KR", { numeric: true });
  });
}

function getFitnessRecordTrack(record) {
  const student = findStudent(record?.studentId);
  return record?.track || getTeacherStudentRegisteredTrack(student) || "";
}

function formatFitnessReportTrackLabel(track) {
  const normalized = normalizeCoastGuardTrack(track);
  const labels = {
    "경찰직 - 공채(순경)": "공채",
    "경찰직 - 해경학과 항해(경장)": "학과(항해)",
    "경찰직 - 해경학과 기관(경장)": "학과(기관)",
    "경찰직 - 함정요원 항해(순경)": "함정(항해)",
    "경찰직 - 함정요원 기관(순경)": "함정(기관)",
    "경찰직 - 해상교통관제(VTS)(순경)": "VTS",
    "일반직 - 선박교통관제(VTS)": "일반직(VTS)",
    "경찰직 - 경위 공채(해양-기관)": "간부(기관)",
    "경찰직 - 경위 공채(해양-항해)": "간부(항해)",
  };
  return labels[normalized] || normalized || "";
}

function getPreviousFitnessMonth(month) {
  const [year, monthNumber] = normalizeFitnessMonth(month).split("-").map(Number);
  const date = new Date(year, monthNumber - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getFitnessReportRankDelta(currentRank, previousRank) {
  if (!currentRank || !previousRank) return { label: "-", direction: "" };
  const delta = Number(previousRank) - Number(currentRank);
  if (!delta) return { label: "-", direction: "" };
  return delta > 0
    ? { label: `▲${delta}`, direction: "up" }
    : { label: `▼${Math.abs(delta)}`, direction: "down" };
}

function buildFitnessMonthlyReportWorkbook({ titleText, headers, rows, missingRows = [] }) {
  return [
    { name: "[Content_Types].xml", content: buildXlsxContentTypesXml() },
    { name: "_rels/.rels", content: buildXlsxRootRelsXml() },
    { name: "docProps/app.xml", content: buildXlsxAppXml() },
    { name: "docProps/core.xml", content: buildXlsxCoreXml() },
    { name: "xl/workbook.xml", content: buildXlsxWorkbookXml() },
    { name: "xl/_rels/workbook.xml.rels", content: buildXlsxWorkbookRelsXml() },
    { name: "xl/styles.xml", content: buildFitnessMonthlyReportStylesXml() },
    { name: "xl/worksheets/sheet1.xml", content: buildFitnessMonthlyReportSheetXml({ titleText, headers, rows, missingRows }) },
  ];
}

function buildFitnessMonthlyReportSheetXml({ titleText, headers, rows, missingRows = [] }) {
  const columnCount = headers.length;
  const lastColumn = getExcelColumnName(columnCount);
  const dataRowCount = Math.max(rows.length, 1);
  const missingBlockRowCount = missingRows.length ? 3 + missingRows.length : 0;
  const lastRow = 3 + dataRowCount + missingBlockRowCount;
  const cols = headers.map((header, index) =>
    `<col min="${index + 1}" max="${index + 1}" width="${getFitnessMonthlyReportColumnWidth(header, index)}" customWidth="1"/>`
  ).join("");
  const titleRow = `<row r="1" ht="${pxToExcelRowHeight(82)}" customHeight="1">${buildXlsxInlineStringCell("A1", titleText, 1)}</row>`;
  const spacerRow = `<row r="2" ht="21" customHeight="1"></row>`;
  const headerRow = `<row r="3">${headers.map((header, index) =>
    buildXlsxInlineStringCell(`${getExcelColumnName(index + 1)}3`, header, 2)
  ).join("")}</row>`;
  const bodyRows = rows.length
    ? rows.map(({ record, previousRank, cells }, rowIndex) => {
        const rowNumber = rowIndex + 4;
        const delta = getFitnessReportRankDelta(record.rank, previousRank);
        const previousGender = rows[rowIndex - 1] ? normalizeFitnessGender(rows[rowIndex - 1]?.record?.gender) : "";
        const currentGender = normalizeFitnessGender(record.gender);
        const nextGender = rows[rowIndex + 1] ? normalizeFitnessGender(rows[rowIndex + 1]?.record?.gender) : "";
        const isGenderStart = Boolean(currentGender && currentGender !== previousGender);
        const isGenderEnd = Boolean(currentGender && currentGender !== nextGender);
        const cellsXml = cells.map((cell, columnIndex) =>
          buildWeeklyGradeReportXlsxDataCell(
            `${getExcelColumnName(columnIndex + 1)}${rowNumber}`,
            cell,
            getFitnessMonthlyReportBodyStyleId({
              columnNumber: columnIndex + 1,
              columnCount,
              isGenderStart,
              isGenderEnd,
            }),
            isFitnessMonthlyReportNumericColumn(columnIndex)
          )
        ).join("");
        const deltaStyle = getFitnessMonthlyReportBodyStyleId({
          columnNumber: columnCount,
          columnCount,
          isGenderStart,
          isGenderEnd,
          deltaDirection: delta.direction,
        });
        return `<row r="${rowNumber}" ht="${pxToExcelRowHeight(28)}" customHeight="1">${cellsXml}${buildXlsxInlineStringCell(`${getExcelColumnName(columnCount)}${rowNumber}`, delta.label, deltaStyle)}</row>`;
      }).join("")
    : `<row r="4">${buildXlsxInlineStringCell("A4", "측정 완료 인원이 없습니다.", 3)}</row>`;
  const missingRowsXml = missingRows.length
    ? buildFitnessMonthlyReportMissingRowsXml({ headers, missingRows, startRow: 4 + dataRowCount, columnCount, lastColumn })
    : "";
  const mergeRefs = [`<mergeCell ref="A1:${lastColumn}1"/>`];
  if (missingRows.length) {
    const missingTitleRow = 4 + dataRowCount + 1;
    mergeRefs.push(`<mergeCell ref="A${missingTitleRow}:${lastColumn}${missingTitleRow}"/>`);
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
  <dimension ref="A1:${lastColumn}${lastRow}"/>
  <sheetViews><sheetView workbookViewId="0"/></sheetViews>
  <sheetFormatPr defaultRowHeight="21"/>
  <cols>${cols}</cols>
  <sheetData>${titleRow}${spacerRow}${headerRow}${bodyRows}${missingRowsXml}</sheetData>
  <mergeCells count="${mergeRefs.length}">${mergeRefs.join("")}</mergeCells>
  <pageMargins left="0.25" right="0.25" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
  <pageSetup paperSize="8" fitToWidth="1" fitToHeight="0"/>
</worksheet>`;
}

function buildFitnessMonthlyReportMissingRowsXml({ headers, missingRows, startRow, columnCount, lastColumn }) {
  const titleRow = startRow + 1;
  const headerRow = startRow + 2;
  const dataStartRow = startRow + 3;
  const headerXml = headers.map((header, index) =>
    buildXlsxInlineStringCell(`${getExcelColumnName(index + 1)}${headerRow}`, header, 2)
  ).join("");
  const rowsXml = missingRows.map(({ cells }, rowIndex) => {
    const rowNumber = dataStartRow + rowIndex;
    const cellsXml = cells.map((cell, columnIndex) =>
      buildWeeklyGradeReportXlsxDataCell(`${getExcelColumnName(columnIndex + 1)}${rowNumber}`, cell, 3, isFitnessMonthlyReportNumericColumn(columnIndex))
    ).join("");
    return `<row r="${rowNumber}" ht="${pxToExcelRowHeight(28)}" customHeight="1">${cellsXml}</row>`;
  }).join("");
  return [
    `<row r="${startRow}" ht="21" customHeight="1"></row>`,
    `<row r="${titleRow}">${buildXlsxInlineStringCell(`A${titleRow}`, "미측정 인원", 2)}</row>`,
    `<row r="${headerRow}">${headerXml}</row>`,
    rowsXml,
  ].join("");
}

function getFitnessMonthlyReportColumnWidth(header, index) {
  const pixelWidths = [70, 96, 70, 86, 76, 76, 76, 86, 86, 86, 72, 72, 82, 70];
  return pxToExcelColumnWidth(pixelWidths[index] || 76, index === 1 ? 9 : 7);
}

function isFitnessMonthlyReportNumericColumn(columnIndex) {
  return ![1, 2, 3, 13].includes(columnIndex);
}

function getFitnessMonthlyReportBodyStyleId({ columnNumber, columnCount, isGenderStart, isGenderEnd, deltaDirection = "" }) {
  const borderMask = (columnNumber === 1 ? 1 : 0)
    | (columnNumber === columnCount ? 2 : 0)
    | (isGenderStart ? 4 : 0)
    | (isGenderEnd ? 8 : 0);
  const fontOffset = deltaDirection === "up" ? 1 : deltaDirection === "down" ? 2 : 0;
  return 3 + fontOffset * 16 + borderMask;
}

function buildFitnessMonthlyReportStylesXml() {
  const borders = [
    `<border><left/><right/><top/><bottom/><diagonal/></border>`,
    ...Array.from({ length: 16 }, (_, mask) => buildFitnessMonthlyReportBorderXml(mask)),
  ].join("");
  const bodyXfs = [0, 3, 4].flatMap((fontId, fontOffset) =>
    Array.from({ length: 16 }, (_, mask) => {
      const applyFont = fontOffset ? ` applyFont="1"` : "";
      return `<xf numFmtId="0" fontId="${fontId}" fillId="0" borderId="${mask + 1}" xfId="0"${applyFont} applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>`;
    })
  ).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="5">
    <font><sz val="12"/><name val="Malgun Gothic"/></font>
    <font><b/><sz val="48"/><color rgb="FF000000"/><name val="Malgun Gothic"/></font>
    <font><sz val="12"/><name val="Malgun Gothic"/></font>
    <font><b/><sz val="12"/><color rgb="FFFF0000"/><name val="Malgun Gothic"/></font>
    <font><b/><sz val="12"/><color rgb="FF0000FF"/><name val="Malgun Gothic"/></font>
  </fonts>
  <fills count="2">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
  </fills>
  <borders count="17">${borders}</borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="51">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="49" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1" applyNumberFormat="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="49" fontId="2" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1" applyNumberFormat="1"><alignment horizontal="center" vertical="center"/></xf>
    ${bodyXfs}
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

function buildFitnessMonthlyReportBorderXml(mask) {
  const side = (enabled) => enabled ? `<color rgb="FF111111"/>` : `<color rgb="FF111111"/>`;
  const leftStyle = mask & 1 ? "medium" : "thin";
  const rightStyle = mask & 2 ? "medium" : "thin";
  const topStyle = mask & 4 ? "medium" : "thin";
  const bottomStyle = mask & 8 ? "medium" : "thin";
  return `<border><left style="${leftStyle}">${side(mask & 1)}</left><right style="${rightStyle}">${side(mask & 2)}</right><top style="${topStyle}">${side(mask & 4)}</top><bottom style="${bottomStyle}">${side(mask & 8)}</bottom><diagonal/></border>`;
}

function getFitnessStudents(cohort = selectedStudentCohort) {
  return (state.students || [])
    .filter((student) => getStudentCohort(student) === cohort && !isOnlineClassName(student.className) && !isFitnessExcludedStudent(student))
    .sort((a, b) => String(a.id).localeCompare(String(b.id), "ko-KR", { numeric: true }));
}

function getFilteredFitnessStudents(students = []) {
  const query = String(fitnessFilters.query || "").trim().toLowerCase();
  if (!query) return students;
  return students.filter((student) =>
    [student.id, formatStudentNumber(student.id), student.name].some((value) => String(value || "").toLowerCase().includes(query))
  );
}

function getFitnessRecordsForMonth(month) {
  const targetMonth = normalizeFitnessMonth(month);
  return (state.fitnessScores || []).filter((record) => normalizeFitnessMonth(record.assessmentMonth) === targetMonth);
}

function isFitnessRecordMatched(record) {
  const query = String(fitnessFilters.query || "").trim().toLowerCase();
  if (!query) return true;
  return [record.studentId, formatStudentNumber(record.studentId), record.studentName].some((value) => String(value || "").toLowerCase().includes(query));
}

function normalizeFitnessGender(gender) {
  const value = String(gender || "").trim().toLowerCase();
  if (["여", "여자", "여성", "female", "f"].includes(value)) return "female";
  return "male";
}

function fitnessGenderLabel(gender) {
  return normalizeFitnessGender(gender) === "female" ? "여" : "남";
}

function calculateFitnessScore(values, gender) {
  const normalizedGender = normalizeFitnessGender(gender);
  const converted = {};
  FITNESS_EVENTS.forEach((event) => {
    converted[event.scoreKey] = convertFitnessEventScore(values[event.key], normalizedGender, event.scoreKey);
  });
  const total = Object.values(converted).reduce((sum, score) => sum + score, 0);
  return { converted, totalScore: total };
}

function convertFitnessEventScore(rawValue, gender, eventKey) {
  if (rawValue === "" || rawValue === null || rawValue === undefined) return 0;
  const value = Number(rawValue);
  if (!Number.isFinite(value)) return 0;
  const rules = FITNESS_SCORE_RULES[normalizeFitnessGender(gender)]?.[eventKey] || [];
  const matched = rules.find((rule) => value >= rule.min);
  return matched ? matched.score : 0;
}

function renderFitnessScoreSummary(score) {
  const node = el("div", { className: "fitness-score-summary" });
  updateFitnessScoreSummary(node, score);
  return node;
}

function updateFitnessScoreSummary(node, score) {
  if (!node) return;
  node.innerHTML = "";
  node.appendChild(el("strong", {}, `${formatFitnessNumber(score.totalScore)}점`));
  node.appendChild(el("span", {}, formatFitnessConvertedScores(score.converted)));
}

function readFitnessControlValues(controls) {
  const values = {};
  FITNESS_EVENTS.forEach((event) => {
    const raw = String(controls[event.key]?.value || "").trim();
    values[event.key] = raw === "" ? "" : Number(raw);
  });
  return values;
}

function formatFitnessConvertedScores(converted = {}) {
  return FITNESS_EVENTS.map((event) => `${event.label.slice(0, 2)} ${Number(converted[event.scoreKey]) || 0}`).join(" / ");
}

function formatFitnessRawScore(value, unit) {
  if (value === "" || value === null || value === undefined) return "-";
  return `${formatFitnessNumber(value)}${unit}`;
}

function formatFitnessNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return Number.isInteger(number) ? String(number) : String(Math.round(number * 10) / 10);
}

function getCurrentFitnessMonth() {
  return normalizeFitnessMonth(new Date().toISOString().slice(0, 7));
}

function normalizeFitnessMonth(value) {
  const text = String(value || "").trim();
  return /^\d{4}-\d{2}$/.test(text) ? text : new Date().toISOString().slice(0, 7);
}

function formatFitnessMonth(value) {
  const month = normalizeFitnessMonth(value);
  const [year, monthNumber] = month.split("-");
  return `${year}년 ${Number(monthNumber)}월`;
}

async function saveFitnessStudentScore(student, controls, existingRecord) {
  if (!hasTeacherPermission("fitness.write")) return notify("체력평가 입력 권한이 없습니다.");
  const values = readFitnessControlValues(controls);
  if (FITNESS_EVENTS.every((event) => values[event.key] === "")) return notify("체력 점수를 하나 이상 입력해주세요.");
  const record = buildFitnessScoreRecord(student, values, existingRecord);
  const previousFitnessScores = JSON.parse(JSON.stringify(state.fitnessScores || []));
  state.fitnessScores = [
    ...(state.fitnessScores || []).filter((item) => item.id !== record.id),
    record,
  ];
  saveState({ skipRemote: true });
  try {
    await saveFitnessScoresToRemote([record]);
    notify(`${student.name || student.id} 체력평가 점수를 저장했습니다.`);
  } catch (error) {
    console.error(error);
    state.fitnessScores = previousFitnessScores;
    saveState({ skipRemote: true });
    notify("체력평가 점수를 서버에 저장하지 못했습니다. Supabase 스키마를 먼저 반영해주세요.");
  }
  render();
}

function buildFitnessScoreRecord(student, values, existingRecord) {
  const gender = normalizeFitnessGender(student.gender || existingRecord?.gender);
  const score = calculateFitnessScore(values, gender);
  const now = new Date().toISOString();
  const assessmentMonth = normalizeFitnessMonth(fitnessFilters.month);
  return {
    id: existingRecord?.id || `fitness-${assessmentMonth}-${student.id}`,
    assessmentMonth,
    studentId: student.id,
    studentName: student.name || "",
    gender,
    cohort: getStudentCohort(student),
    ...values,
    convertedScores: score.converted,
    totalScore: score.totalScore,
    memo: existingRecord?.memo || "",
    measuredAt: existingRecord?.measuredAt || now,
    updatedAt: now,
    createdAt: existingRecord?.createdAt || now,
  };
}

async function deleteFitnessScore(record) {
  if (!hasTeacherPermission("fitness.write")) return notify("체력평가 삭제 권한이 없습니다.");
  if (!record?.id && !record?.studentId) return;
  const studentLabel = record.studentName || getCanonicalStudentName(record.studentId, "") || record.studentId || "학생";
  const monthLabel = formatFitnessMonth(record.assessmentMonth || fitnessFilters.month);
  if (!confirm(`${studentLabel} ${monthLabel} 체력평가 점수를 삭제할까요?`)) return;

  const previousFitnessScores = JSON.parse(JSON.stringify(state.fitnessScores || []));
  state.fitnessScores = (state.fitnessScores || []).filter((item) => !isSameFitnessScoreRecord(item, record));
  saveState({ skipRemote: true });
  try {
    await deleteFitnessScoreFromRemote(record);
    notify("체력평가 점수를 삭제했습니다.");
  } catch (error) {
    console.error(error);
    state.fitnessScores = previousFitnessScores;
    saveState({ skipRemote: true });
    notify("체력평가 점수를 서버에서 삭제하지 못했습니다.");
  }
  render();
}

function isSameFitnessScoreRecord(left, right) {
  if (!left || !right) return false;
  const leftMonth = normalizeFitnessMonth(left.assessmentMonth || left.assessment_month);
  const rightMonth = normalizeFitnessMonth(right.assessmentMonth || right.assessment_month);
  const leftStudentId = String(left.studentId || left.student_id || "").trim();
  const rightStudentId = String(right.studentId || right.student_id || "").trim();
  if (leftMonth && rightMonth && leftStudentId && rightStudentId) {
    return leftMonth === rightMonth && leftStudentId === rightStudentId;
  }
  return Boolean(left.id && right.id && left.id === right.id);
}

async function saveFitnessBulkScores() {
  if (!hasTeacherPermission("fitness.write")) return notify("체력평가 입력 권한이 없습니다.");
  const records = fitnessInputRows
    .map(({ student, controls, existingRecord }) => {
      const values = readFitnessControlValues(controls);
      if (FITNESS_EVENTS.every((event) => values[event.key] === "")) return null;
      return buildFitnessScoreRecord(student, values, existingRecord);
    })
    .filter(Boolean);
  if (!records.length) return notify("저장할 체력 점수가 없습니다.");
  const previousFitnessScores = JSON.parse(JSON.stringify(state.fitnessScores || []));
  const recordIds = new Set(records.map((record) => record.id));
  state.fitnessScores = [
    ...(state.fitnessScores || []).filter((item) => !recordIds.has(item.id)),
    ...records,
  ];
  saveState({ skipRemote: true });
  try {
    await saveFitnessScoresToRemote(records);
    notify(`${records.length}명 체력평가 점수를 일괄 저장했습니다.`);
  } catch (error) {
    console.error(error);
    state.fitnessScores = previousFitnessScores;
    saveState({ skipRemote: true });
    notify("체력평가 점수를 서버에 저장하지 못했습니다. Supabase 스키마를 먼저 반영해주세요.");
  }
  render();
}
