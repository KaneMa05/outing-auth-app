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
  return el("tr", {}, [
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
  const summaries = records
    .filter((record) => studentIds.has(String(record.studentId)))
    .filter((record) => isFitnessRecordMatched(record))
    .sort((a, b) => Number(b.totalScore || 0) - Number(a.totalScore || 0) || String(a.studentId).localeCompare(String(b.studentId), "ko-KR", { numeric: true }));
  const headers = ["순위", "번호", "이름", "성별", "윗몸", "팔굽", "악력", "환산", "총점", "측정일"];
  const rows = summaries.map((record, index) => {
    const converted = record.convertedScores || calculateFitnessScore(record, normalizeFitnessGender(record.gender)).converted;
    return el("tr", {}, [
      el("td", {}, String(index + 1)),
      el("td", {}, formatStudentNumber(record.studentId)),
      el("td", {}, record.studentName || getCanonicalStudentName(record.studentId, "") || "-"),
      el("td", {}, fitnessGenderLabel(normalizeFitnessGender(record.gender))),
      el("td", {}, formatFitnessRawScore(record.sitUpCount, "회")),
      el("td", {}, formatFitnessRawScore(record.pushUpCount, "회")),
      el("td", {}, formatFitnessRawScore(record.gripStrength, "kg")),
      el("td", {}, formatFitnessConvertedScores(converted)),
      el("td", {}, `${formatFitnessNumber(record.totalScore)}점`),
      el("td", {}, formatDateCompact(record.measuredAt || record.updatedAt || record.createdAt)),
    ]);
  });
  return panel("점수 조회", [
    table(headers, rows.length ? rows : [el("tr", {}, [el("td", { colSpan: headers.length }, el("div", { className: "empty table-empty" }, "입력된 체력평가 점수가 없습니다."))])]),
  ]);
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
    notify("체력평가 점수를 서버에 저장하지 못했습니다. Supabase 스키마를 먼저 반영해주세요.");
  }
  render();
}
