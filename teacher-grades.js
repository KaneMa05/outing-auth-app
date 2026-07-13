let weeklyExamRoundFileUploadProgress = null;

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

function renderWeeklyExamAbsenceManagement() {
  if (!hasTeacherPermission("grades.read")) return renderForbidden();
  const selected = selectedStudentCohortCount();
  const weekOptions = Array.from({ length: WEEKLY_EXAM_WEEK_COUNT }, (_, index) => String(index + 1));
  const weekSelect = select("weekNumber", weekOptions);
  weekSelect.querySelectorAll("option").forEach((option) => {
    option.textContent = `${option.value}주차`;
  });
  weekSelect.value = resolveWeeklyGradeWeekFilter(selected.value, weekOptions);
  weekSelect.addEventListener("change", () => {
    weeklyExamGradeFilters.weekNumber = weekSelect.value;
    render();
  });

  const targetWeek = Number(weeklyExamGradeFilters.weekNumber) || 1;
  const exam = getWeeklyExamByCohortAndWeek(selected.value, targetWeek);
  const students = getWeeklyAbsenceStudents(selected.value);
  const summaries = exam ? students.map((student) => getWeeklyGradeStudentSummary(exam, student)) : [];
  const absentSummaries = summaries.filter((summary) => summary.subjectCount > 0 && summary.submittedCount === 0);
  const partialSummaries = summaries.filter((summary) => summary.submittedCount > 0 && summary.submittedCount < summary.subjectCount);
  const completedCount = summaries.filter((summary) => summary.subjectCount > 0 && summary.submittedCount === summary.subjectCount).length;

  return el("div", { className: "grid weekly-absence-management" }, [
    el("div", { className: "stat-groups" }, [
      studentCountStatGroup(),
      statGroup(`${targetWeek}주차 응시 현황`, [
        stat("미응시", absentSummaries.length, "명"),
        stat("일부 응시", partialSummaries.length, "명"),
        stat("응시 완료", completedCount, "명"),
      ]),
    ]),
    panel("주간평가 미응시자 필터", [
      el("div", { className: "teacher-search grade-management-top-filter" }, [
        field("주차", weekSelect),
      ]),
    ]),
    renderWeeklyAbsenceSummaryPanel(exam, summaries, targetWeek),
    renderWeeklyAbsenceStudentPanel("미응시자", absentSummaries, exam, targetWeek, "해당 주차 미응시자가 없습니다."),
    renderWeeklyAbsenceStudentPanel("일부 응시자", partialSummaries, exam, targetWeek, "일부 과목만 응시한 학생이 없습니다."),
  ]);
}

function getWeeklyAbsenceStudents(cohort = selectedStudentCohort) {
  return getStudentsInCohort(cohort)
    .sort((a, b) => String(a.id).localeCompare(String(b.id), "ko-KR", { numeric: true }));
}

function renderWeeklyAbsenceSummaryPanel(exam, summaries, targetWeek) {
  if (!exam) {
    return panel("직렬별 현황", [
      el("div", { className: "empty" }, `${targetWeek}주차 주간평가가 아직 생성되지 않았습니다.`),
    ]);
  }
  const groups = new Map();
  summaries.forEach((summary) => {
    if (!summary.subjectCount) return;
    const track = getTeacherStudentRegisteredTrack(summary.student) || "미분류";
    if (!groups.has(track)) groups.set(track, { total: 0, absent: 0, partial: 0, completed: 0 });
    const item = groups.get(track);
    item.total += 1;
    if (summary.submittedCount === 0) item.absent += 1;
    else if (summary.submittedCount < summary.subjectCount) item.partial += 1;
    else item.completed += 1;
  });
  const rows = [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], "ko-KR"))
    .map(([track, item]) => el("tr", {}, [
      el("td", {}, track),
      el("td", {}, item.total),
      el("td", {}, item.absent),
      el("td", {}, item.partial),
      el("td", {}, item.completed),
    ]));
  return panel("직렬별 현황", [
    table(["직렬", "대상", "미응시", "일부 응시", "응시 완료"], rows.length ? rows : [el("tr", {}, [el("td", { colSpan: 5 }, el("div", { className: "empty table-empty" }, "조회할 학생이 없습니다."))])]),
  ]);
}

function renderWeeklyAbsenceStudentPanel(titleText, summaries, exam, targetWeek, emptyText) {
  const rows = summaries
    .sort((a, b) => String(a.student?.id || "").localeCompare(String(b.student?.id || ""), "ko-KR", { numeric: true }))
    .map((summary) => {
      const missingSubjects = getWeeklyMissingSubjectLabels(summary);
      return el("tr", {}, [
        el("td", {}, formatStudentNumber(summary.student.id)),
        el("td", {}, summary.student.name || "-"),
        el("td", {}, getTeacherStudentRegisteredTrack(summary.student) || "-"),
        el("td", {}, `${summary.submittedCount}/${summary.subjectCount}`),
        el("td", {}, missingSubjects || "-"),
      ]);
    });
  return panel(`${targetWeek}주차 ${titleText}`, [
    exam
      ? table(["번호", "이름", "직렬", "응시 과목", "미응시 과목"], rows.length ? rows : [el("tr", {}, [el("td", { colSpan: 5 }, el("div", { className: "empty table-empty" }, emptyText))])])
      : el("div", { className: "empty" }, "주간평가가 생성되면 미응시자 목록이 표시됩니다."),
  ]);
}

function getWeeklyMissingSubjectLabels(summary) {
  return Object.entries(summary.subjectScores || {})
    .filter(([, subjectScore]) => subjectScore?.status === "missing")
    .map(([subject]) => subject)
    .join(", ");
}

function getGradeManagementTrackOptions(cohort = selectedStudentCohort) {
  const tracks = [
    ...getCoastGuardTrackOptions().filter((track) => track !== "기타"),
    ...getStudentsInCohort(cohort).map((student) => getTeacherStudentRegisteredTrack(student)),
    ...getFinalMockExternalTracks(cohort),
  ]
    .map((track) => normalizeCoastGuardTrack(track))
    .filter((track) => track && track !== "기타")
    .filter((track, index, list) => list.indexOf(track) === index)
    .sort((a, b) => a.localeCompare(b, "ko-KR"));
  return ["", ...tracks];
}

function getFinalMockExternalTracks(cohort = selectedStudentCohort) {
  const sources = [state.finalExamScores, state.finalMockScores, state.mockExamScores, state.finalScores].filter(Array.isArray);
  return sources.flat()
    .filter((record) => {
      const studentId = String(record.studentId || record.student_id || record.studentNumber || "").trim();
      const exists = (state.students || []).some((student) => String(student.id) === studentId);
      if (exists) return false;
      const recordCohort = String(record.cohort || record.studentCohort || record.student_cohort || "");
      return !recordCohort || recordCohort === String(cohort || "");
    })
    .map((record) => normalizeCoastGuardTrack(record.track || record.studentTrack || record.student_track || ""))
    .filter(Boolean);
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

function getLatestWeeklyExamWeekForCohort(cohort = selectedStudentCohort) {
  const normalizedCohort = String(cohort || "");
  const exams = [...(state.exams || [])]
    .filter((exam) => !normalizedCohort || String(exam.cohort || "") === normalizedCohort)
    .sort((a, b) => Number(b.weekNumber) - Number(a.weekNumber) || new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  const latestExam = exams.find(hasWeeklyExamGradeData) || exams[0];
  return String(Number(latestExam?.weekNumber) || 1);
}

function hasWeeklyExamGradeData(exam) {
  if (!exam?.id) return false;
  const sectionIds = new Set(
    (state.examSections || [])
      .filter((section) => section.examId === exam.id && section.isActive !== false && !isWeeklySubjectExcludedForTrack(section.subject, section.track))
      .map((section) => section.id)
  );
  if (!sectionIds.size) return false;
  const hasAnswerKey = (state.examAnswers || []).some((answer) =>
    sectionIds.has(answer.examSectionId) && Boolean(answer.correctAnswer)
  );
  if (hasAnswerKey) return true;
  return (state.examSubmissions || []).some((submission) => sectionIds.has(submission.examSectionId));
}

function resolveWeeklyGradeWeekFilter(cohort, weekOptions) {
  const currentWeek = String(weeklyExamGradeFilters.weekNumber || "");
  if (weekOptions.includes(currentWeek)) return currentWeek;
  const latestWeek = getLatestWeeklyExamWeekForCohort(cohort);
  weeklyExamGradeFilters.weekNumber = weekOptions.includes(latestWeek) ? latestWeek : "1";
  return weeklyExamGradeFilters.weekNumber;
}

function getSelectedWeeklyExamCohort() {
  const cohorts = getStudentCohortStats().filter((cohort) => cohort.value && cohort.value !== "미분류");
  if (!cohorts.length) {
    weeklyExamSelectedCohort = DEFAULT_STUDENT_COHORT;
    return "";
  }
  if (!cohorts.some((cohort) => cohort.value === weeklyExamSelectedCohort)) weeklyExamSelectedCohort = getDefaultStudentCohortValue(cohorts);
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
  selectNode.addEventListener("change", () => {
    const nextCohort = selectNode.value;
    weeklyExamSelectedCohort = nextCohort;
    weeklyExamSelectedId = "";
    weeklyExamSelectedSectionId = "";
    weeklyExamAnswerScoped = false;
    render();
  });
  return panel("주간평가 필터", [
    el("div", { className: "teacher-search weekly-cohort-filter compact-filter" }, [
      field("기수", selectNode),
    ]),
    el("p", { className: "subtle" }, "새 기수는 학생 등록에서 해당 기수 학생을 등록하면 자동으로 추가됩니다."),
  ]);
}

function getExamSections(examId) {
  return (state.examSections || [])
    .filter((section) => section.examId === examId && !isWeeklySubjectExcludedForTrack(section.subject, section.track))
    .sort((a, b) => {
      const trackCompare = String(a.track || "").localeCompare(String(b.track || ""), "ko-KR");
      return trackCompare || compareWeeklySubjects(a.subject, b.subject);
    });
}

function getWeeklyExamSubjectRows(examId) {
  const sections = getExamSections(examId);
  return WEEKLY_EXAM_SUBJECTS.map((subject) => {
    const subjectSections = sections.filter((section) => String(section.subject || "").trim() === subject);
    if (!subjectSections.length) return { subject, section: null };
    const section = subjectSections.find((item) => normalizeCoastGuardTrack(item.track) === WEEKLY_EXAM_TRACK_ALL)
      || subjectSections.find(isWeeklyExamSectionPublished)
      || subjectSections[0];
    return { subject, section };
  });
}

function getWeeklyExamAnswerSections() {
  const examMap = new Map((state.exams || []).map((exam) => [exam.id, exam]));
  const subjectOrder = new Map(WEEKLY_EXAM_SUBJECTS.map((subject, index) => [subject, index]));
  return (state.examSections || [])
    .filter((section) => section.isActive !== false && examMap.has(section.examId) && !isWeeklySubjectExcludedForTrack(section.subject, section.track))
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
    : (state.examSections || [])
      .filter((section) => !isWeeklySubjectExcludedForTrack(section.subject, section.track))
      .map((section, index) => ({
        ...getWeeklySubjectDefaultSpec(section.subject),
        id: `derived-${section.track}-${section.subject}`,
        track: section.track,
        subject: section.subject,
        questionCount: section.questionCount || getWeeklySubjectDefaultSpec(section.subject).questionCount,
        totalScore: section.totalScore || getWeeklySubjectDefaultSpec(section.subject).totalScore,
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
        questionCount: Number(setting.questionCount) || getWeeklySubjectDefaultSpec(subject).questionCount,
        totalScore: Number(setting.totalScore) || getWeeklySubjectDefaultSpec(subject).totalScore,
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

function getWeeklyTrackSpecificSectionSettings() {
  return getWeeklyExamSubjectSettings().filter((setting) => {
    const track = normalizeCoastGuardTrack(setting.track);
    return setting.isActive !== false && track && track !== WEEKLY_EXAM_TRACK_ALL;
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
        isPublished: false,
        scoreReleaseMode: "after_all_submitted",
        explanationReleaseMode: "after_all_submitted",
        createdAt: now,
        updatedAt: now,
      };
      state.exams = [exam, ...(state.exams || [])];
      WEEKLY_EXAM_SUBJECTS.forEach((subject) => {
        const spec = getWeeklySubjectDefaultSpec(subject);
        const section = createLocalExamSection(exam, WEEKLY_EXAM_TRACK_ALL, subject, {
          questionCount: spec.questionCount,
          totalScore: spec.totalScore,
          isActive: true,
        });
        if (section) createdSections.push(section);
      });
      getWeeklyTrackSpecificSectionSettings().forEach((setting) => {
        const section = createLocalExamSection(exam, setting.track, setting.subject, {
          questionCount: setting.questionCount,
          totalScore: setting.totalScore,
          isActive: setting.isActive !== false,
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
  return panel("주간평가 생성", [renderWeeklyExamCreateForm()]);
}

function renderWeeklyExamCreateForm() {
  const cohort = getSelectedWeeklyExamCohort();
  const form = el("form", { className: "form-grid weekly-exam-form" }, [
    el("div", { className: "field full" }, [button(`${cohort || ""}기 1~${WEEKLY_EXAM_WEEK_COUNT}주차 주간평가 생성하기`, "btn")]),
  ]);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const selectedCohort = getSelectedWeeklyExamCohort();
    if (!selectedCohort) return notify("기수를 먼저 선택해주세요.");
    await ensureWeeklyExamWeeksForCohort(selectedCohort);
  });
  return form;
}

function formatWeeklyExamName(weekNumber, cohort = "") {
  return `${cohort ? `${cohort}기 ` : ""}${Number(weekNumber) || 1}주차 주간평가`;
}

function renderWeeklyExamProblemLookupPanel() {
  const exams = getWeeklyExams();
  if (!exams.length) {
    return panel("주간평가 문제 조회", [
      el("div", { className: "empty" }, "조회할 주간평가가 없습니다. 주간평가를 먼저 생성해주세요."),
      renderWeeklyExamCreateForm(),
    ]);
  }
  const selectedExam = exams.find((exam) => exam.id === weeklyExamSelectedId) || null;
  if (selectedExam) return renderWeeklyExamProblemDetailPanel(selectedExam);

  const rows = Array.from({ length: 12 }, (_, index) => {
    const weekNumber = index + 1;
    const exam = exams.find((item) => Number(item.weekNumber) === weekNumber);
    const subjectRows = exam ? getWeeklyExamSubjectRows(exam.id) : [];
    const publishedCount = subjectRows.filter((item) => item.section && isWeeklyExamSectionPublished(item.section)).length;
    return el("tr", { className: exam ? "" : "weekly-unpublished-row" }, [
      el("td", {}, `${weekNumber}주차 주간평가`),
      el("td", {}, exam ? renderWeeklyExamPublishControl(exam) : "-"),
      el("td", {}, exam ? `${publishedCount}/${WEEKLY_EXAM_SUBJECTS.length}` : "-"),
      el("td", {}, exam ? formatWeeklyExamPeriod(exam) : "-"),
      el("td", {}, exam ? renderWeeklyExamRoundFileUpload(exam, subjectRows.map((item) => item.section).filter(Boolean)) : "-"),
      el("td", { className: "action-cell" }, exam
        ? el("div", { className: "weekly-exam-row-actions" }, [
            button("관리", "mini-btn", "button", () => openWeeklyExamProblemDetail(exam.id)),
            button("초기화", "mini-btn danger", "button", () => openWeeklyExamResetModal(exam.id)),
          ])
        : el("span", { className: "subtle" }, "미생성")),
    ]);
  });

  return panel("주간평가 문제 조회", [
    el("div", { className: "action-row weekly-lookup-actions" }, [
      button("주간평가 과목 설정", "btn secondary", "button", openWeeklyExamSubjectSettingsModal),
    ]),
    table(["주간평가", "공개 여부", "출제 현황", "응시 시작", "답안지 업로드", "관리"], rows),
  ]);
}

function renderWeeklyExamPublishControl(exam) {
  const selectNode = el("select", { className: exam.isPublished ? "weekly-publish-select published" : "weekly-publish-select hidden", ariaLabel: `${formatWeeklyExamName(exam.weekNumber, exam.cohort)} 공개 여부` }, [
    el("option", { value: "published" }, "공개"),
    el("option", { value: "hidden" }, "비공개"),
  ]);
  selectNode.value = exam.isPublished ? "published" : "hidden";
  selectNode.addEventListener("change", async () => {
    const nextPublished = selectNode.value === "published";
    if (exam.isPublished === nextPublished) return;
    selectNode.disabled = true;
    try {
      exam.isPublished = nextPublished;
      exam.updatedAt = new Date().toISOString();
      saveState({ skipRemote: true });
      await saveWeeklyExamToRemote(exam);
      render();
      notify(nextPublished ? "주간평가를 공개로 변경했습니다." : "주간평가를 비공개로 변경했습니다.");
    } catch (error) {
      console.error(error);
      selectNode.disabled = false;
      selectNode.value = exam.isPublished ? "published" : "hidden";
      notify("공개 여부 저장 중 오류가 발생했습니다.");
    }
  });
  return selectNode;
}

function openWeeklyExamResetModal(examId) {
  const exam = (state.exams || []).find((item) => item.id === examId);
  if (!exam) return notify("초기화할 주간평가를 찾을 수 없습니다.");
  const confirmInput = input("resetConfirm", "text", "초기화");
  confirmInput.autocomplete = "off";
  const confirmButton = button("확인", "btn danger", "button");
  confirmButton.disabled = true;
  confirmInput.addEventListener("input", () => {
    confirmButton.disabled = confirmInput.value.trim() !== "초기화";
  });
  confirmButton.addEventListener("click", async () => {
    if (confirmInput.value.trim() !== "초기화") return;
    confirmButton.disabled = true;
    confirmInput.disabled = true;
    try {
      await resetWeeklyExamRound(exam);
      closeInfoModal();
      render();
      notify("주간평가를 초기화했습니다.");
    } catch (error) {
      console.error(error);
      confirmButton.disabled = false;
      confirmInput.disabled = false;
      notify("초기화 중 오류가 발생했습니다. Supabase 권한을 확인해주세요.");
    }
  });
  closeInfoModal();
  const modal = el("div", { className: "info-modal", role: "dialog", ariaModal: "true" }, [
    el("button", { className: "info-modal-backdrop", type: "button", ariaLabel: "초기화 닫기" }),
    el("div", { className: "info-modal-panel weekly-reset-modal" }, [
      el("strong", {}, "주간평가 초기화"),
      el("div", { className: "weekly-reset-content" }, [
        el("p", {}, `${formatWeeklyExamName(exam.weekNumber, exam.cohort)}의 공개 여부, 응시 시작일, 답안지 업로드, 과목별 정답을 모두 초기화합니다.`),
        el("p", { className: "subtle" }, "학생 제출 기록과 성적 기록은 삭제하지 않습니다."),
        field("확인 문구", confirmInput, "", "'초기화'를 정확히 입력해야 확인할 수 있습니다."),
        el("div", { className: "attendance-modal-actions" }, [
          button("취소", "btn secondary", "button", closeInfoModal),
          confirmButton,
        ]),
      ]),
    ]),
  ]);
  modal.querySelector(".info-modal-backdrop").addEventListener("click", closeInfoModal);
  document.body.appendChild(modal);
  document.addEventListener("keydown", closeInfoModalOnEscape);
  requestAnimationFrame(() => confirmInput.focus());
}

async function resetWeeklyExamRound(exam) {
  const sectionIds = getExamSections(exam.id).map((section) => section.id);
  const sectionIdSet = new Set(sectionIds);
  const targetFiles = (state.examFiles || []).filter((file) => sectionIdSet.has(file.examSectionId));
  const targetAnswerIds = new Set(
    (state.examAnswers || [])
      .filter((answer) => sectionIdSet.has(answer.examSectionId))
      .map((answer) => answer.id)
  );
  const previousExam = { ...exam };
  const previousFiles = [...(state.examFiles || [])];
  const previousAnswers = [...(state.examAnswers || [])];

  exam.isPublished = false;
  exam.startAt = "";
  exam.endAt = "";
  exam.updatedAt = new Date().toISOString();
  state.examFiles = (state.examFiles || []).filter((file) => !sectionIdSet.has(file.examSectionId));
  state.examAnswers = (state.examAnswers || []).filter((answer) => !sectionIdSet.has(answer.examSectionId));
  saveState({ skipRemote: true });

  try {
    if (remoteStore) {
      await saveWeeklyExamToRemote(exam);
      const paths = [...new Set(targetFiles.map((file) => file.filePath).filter(Boolean))];
      if (paths.length) await remoteStore.storage.from("exam-files").remove(paths);
      await deleteExamFilesFromRemote(targetFiles.map((file) => file.id));
      await deleteExamAnswersFromRemote(sectionIds, [...targetAnswerIds]);
    }
  } catch (error) {
    Object.assign(exam, previousExam);
    state.examFiles = previousFiles;
    state.examAnswers = previousAnswers;
    saveState({ skipRemote: true });
    throw error;
  }
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

  const rows = getWeeklyExamSubjectRows(selectedExam.id).map(({ subject, section }) => {
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
  const remainingFileCount = Math.max(0, WEEKLY_EXAM_ROUND_ANSWER_FILE_LIMIT - files.length);
  const uploadProgress = getWeeklyExamRoundFileUploadProgress(exam.id);
  const isUploading = Boolean(uploadProgress);
  const inputNode = el("input", { type: "file", accept: "application/pdf", multiple: remainingFileCount > 1, className: "visually-hidden-file" });
  const uploadButton = button(files.length ? "추가" : "업로드", "mini-btn", "button", () => inputNode.click());
  uploadButton.disabled = remainingFileCount <= 0 || isUploading;
  if (isUploading) uploadButton.title = "답안지를 업로드하는 중입니다.";
  else if (uploadButton.disabled) uploadButton.title = `PDF ${WEEKLY_EXAM_ROUND_ANSWER_FILE_LIMIT}개까지 업로드할 수 있습니다.`;
  inputNode.addEventListener("change", async () => {
    await uploadWeeklyExamRoundAnswerFiles(exam, activeSections, inputNode.files);
    inputNode.value = "";
  });
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
    uploadProgress ? renderWeeklyExamRoundFileUploadProgress(uploadProgress) : null,
  ]);
}

function getWeeklyExamRoundFileUploadProgress(examId) {
  return weeklyExamRoundFileUploadProgress?.examId === examId ? weeklyExamRoundFileUploadProgress : null;
}

function setWeeklyExamRoundFileUploadProgress(examId, payload) {
  weeklyExamRoundFileUploadProgress = {
    examId,
    percent: Math.max(0, Math.min(100, Math.round(Number(payload.percent) || 0))),
    label: payload.label || "업로드 준비 중",
    detail: payload.detail || "",
  };
  render();
}

function clearWeeklyExamRoundFileUploadProgress(examId, delay = 0) {
  const clear = () => {
    if (weeklyExamRoundFileUploadProgress?.examId !== examId) return;
    weeklyExamRoundFileUploadProgress = null;
    render();
  };
  if (delay > 0) window.setTimeout(clear, delay);
  else clear();
}

function renderWeeklyExamRoundFileUploadProgress(progress) {
  return el("div", { className: "weekly-inline-upload-progress", ariaLive: "polite" }, [
    el("div", { className: "weekly-inline-upload-progress-top" }, [
      el("strong", {}, progress.label),
      el("span", {}, `${progress.percent}%`),
    ]),
    el("div", { className: "weekly-inline-upload-progress-track", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(progress.percent) }, [
      el("span", { style: `width: ${progress.percent}%` }),
    ]),
    progress.detail ? el("small", {}, progress.detail) : null,
  ].filter(Boolean));
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
  if (files.some((file) => !isWeeklyExamAnswerPdfFile(file))) return notify("PDF 파일만 업로드할 수 있습니다.");
  const oversizedFile = files.find((file) => file.size > WEEKLY_EXAM_ANSWER_FILE_MAX_BYTES);
  if (oversizedFile) return notify(`${oversizedFile.name || "PDF 파일"}은 10MB 이하로 업로드해주세요.`);
  const sectionIds = new Set(sections.map((section) => section.id));
  const existingFiles = getWeeklyExamRoundFiles(sectionIds);
  const remainingFileCount = WEEKLY_EXAM_ROUND_ANSWER_FILE_LIMIT - existingFiles.length;
  if (remainingFileCount <= 0) return notify(`PDF는 ${WEEKLY_EXAM_ROUND_ANSWER_FILE_LIMIT}개까지 업로드할 수 있습니다.`);
  if (files.length > remainingFileCount) return notify(`PDF는 최대 ${WEEKLY_EXAM_ROUND_ANSWER_FILE_LIMIT}개까지 업로드할 수 있습니다. ${remainingFileCount}개만 더 선택해주세요.`);

  const createdRows = [];
  setWeeklyExamRoundFileUploadProgress(exam.id, {
    percent: 5,
    label: "업로드 준비 중",
    detail: `${files.length}개 PDF 확인 완료`,
  });

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
    setWeeklyExamRoundFileUploadProgress(exam.id, {
      percent: 100,
      label: "저장 완료",
      detail: "로컬 파일명이 저장되었습니다.",
    });
    notify(`로컬에 답안지 ${files.length}개 파일명을 저장했습니다. Supabase 연결 후 실제 업로드가 가능합니다.`);
    clearWeeklyExamRoundFileUploadProgress(exam.id, 900);
    return;
  }

  const totalSteps = files.length + 1;
  for (const [index, file] of files.entries()) {
    const uploadedAt = new Date().toISOString();
    const path = `${exam.id}/round-answer-${Date.now()}-${index}-${sanitizeStorageFileName(file.name)}`;
    const uploadBody = file.type === "application/pdf" ? file : new Blob([file], { type: "application/pdf" });
    setWeeklyExamRoundFileUploadProgress(exam.id, {
      percent: Math.max(8, Math.round((index / totalSteps) * 100)),
      label: `PDF 업로드 중 (${index + 1}/${files.length})`,
      detail: file.name || "answer.pdf",
    });
    const { error: uploadError } = await remoteStore.storage.from("exam-files").upload(path, uploadBody, { contentType: "application/pdf" });
    if (uploadError) {
      console.error(uploadError);
      clearWeeklyExamRoundFileUploadProgress(exam.id);
      return notify(`파일 업로드에 실패했습니다. ${formatStorageUploadError(uploadError)}`);
    }
    setWeeklyExamRoundFileUploadProgress(exam.id, {
      percent: Math.round(((index + 1) / totalSteps) * 100),
      label: `PDF 업로드 완료 (${index + 1}/${files.length})`,
      detail: file.name || "answer.pdf",
    });
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
  const previousFiles = [...(state.examFiles || [])];
  state.examFiles = [...previousFiles, ...createdRows];
  try {
    setWeeklyExamRoundFileUploadProgress(exam.id, {
      percent: Math.round((files.length / totalSteps) * 100),
      label: "기록 저장 중",
      detail: "업로드한 답안지를 과목에 연결하고 있습니다.",
    });
    await saveExamFilesToRemote(createdRows);
    saveState({ skipRemote: true });
    setWeeklyExamRoundFileUploadProgress(exam.id, {
      percent: 100,
      label: "업로드 완료",
      detail: `${files.length}개 PDF가 저장되었습니다.`,
    });
    notify(`회차 답안지 ${files.length}개를 업로드했습니다.`);
    clearWeeklyExamRoundFileUploadProgress(exam.id, 900);
  } catch (error) {
    console.error(error);
    state.examFiles = previousFiles;
    const paths = [...new Set(createdRows.map((row) => row.filePath).filter(Boolean))];
    if (paths.length) await remoteStore.storage.from("exam-files").remove(paths).catch((removeError) => console.error(removeError));
    clearWeeklyExamRoundFileUploadProgress(exam.id);
    notify("답안지 기록 저장에 실패했습니다. Supabase exam_files 스키마와 권한을 확인해주세요.");
  }
}

function sanitizeStorageFileName(name) {
  const rawName = String(name || "answer.pdf").trim();
  const withoutExtension = rawName.replace(/\.pdf$/i, "");
  const safeBase = withoutExtension
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 80);
  return `${safeBase || "answer"}.pdf`;
}

function isWeeklyExamAnswerPdfFile(file) {
  const type = String(file?.type || "").toLowerCase();
  const name = String(file?.name || "").toLowerCase();
  return type === "application/pdf" || (!type && name.endsWith(".pdf"));
}

function formatStorageUploadError(error) {
  const message = String(error?.message || "").trim();
  const statusCode = error?.statusCode || error?.status || "";
  if (message && statusCode) return `(${statusCode}: ${message})`;
  if (message) return `(${message})`;
  if (statusCode) return `(${statusCode})`;
  return "파일 크기와 Storage 권한을 확인해주세요.";
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
            const excluded = isWeeklySubjectExcludedForTrack(subject, normalizedTrack);
            const required = isWeeklySubjectRequiredForTrack(subject, normalizedTrack);
            const checked = hasSavedByTrack.has(normalizedTrack)
              ? (required || activeSettings.has(`${normalizedTrack}|||${subject}`)) && !excluded
              : defaultSubjects.includes(subject) || required;
            return el("td", {}, el("label", { className: "track-subject-check" }, [
              el("input", { type: "checkbox", name: `${normalizedTrack}|||${subject}`, checked, disabled: excluded || required }),
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
        const spec = getWeeklySubjectDefaultSpec(subject);
        const required = isWeeklySubjectRequiredForTrack(subject, normalizedTrack);
        const checked = !isWeeklySubjectExcludedForTrack(subject, normalizedTrack) && (required || Boolean(form.querySelector(`input[name="${CSS.escape(key)}"]`)?.checked));
        return {
          ...(current || {}),
          id: current?.id || createId(),
          track: normalizedTrack,
          subject,
          questionCount: current?.questionCount || spec.questionCount,
          totalScore: current?.totalScore || spec.totalScore,
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
    el("p", { className: "subtle" }, "학생에게 보일 과목을 직렬별로 설정합니다. 저장 전에는 기본 매칭값이 적용됩니다."),
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
      if (checkbox) checkbox.checked = (defaultSubjects.includes(subject) || isWeeklySubjectRequiredForTrack(subject, normalizedTrack)) && !isWeeklySubjectExcludedForTrack(subject, normalizedTrack);
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
  const pointValue = getWeeklySectionQuestionPointValue(section);
  state.examSections = [...(state.examSections || []), section];
  state.examAnswers = [
    ...(state.examAnswers || []),
    ...Array.from({ length: section.questionCount }, (_, index) => ({
      id: createId(),
      examSectionId: section.id,
      questionNumber: index + 1,
      correctAnswer: 0,
      points: pointValue,
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
    el("td", {}, renderWeeklyExamPublishControl(exam)),
    el("td", {}, `${formatReleaseMode(exam.scoreReleaseMode)} / ${formatReleaseMode(exam.explanationReleaseMode)}`),
    el("td", {}, button("관리", "mini-btn", "button", () => {
      weeklyExamSelectedId = exam.id;
      weeklyExamSelectedSectionId = "";
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
    try {
      const section = createLocalExamSection(exam, normalizeCoastGuardTrack(data.track), String(data.subject || "").trim(), {
        questionCount: Number(data.questionCount) || 20,
        totalScore: Number(data.totalScore) || 100,
      });
      if (!section) return notify("이미 같은 직렬/과목이 있습니다.");
      resetSectionAnswerRows(section);
      weeklyExamSelectedSectionId = section.id;
      saveState({ skipRemote: true });
      await saveExamSectionsToRemote([section]);
      await saveExamAnswersToRemote(getSectionAnswers(section.id));
      render();
    } catch (error) {
      console.error("Failed to create weekly exam section", error);
      notify("과목 저장에 실패했습니다. 잠시 후 다시 시도해주세요.");
    }
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
    : [baseSection].filter(Boolean);
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
      renderWeeklyExamAnswerPanel(section, modalSections, { modal: true, sectionIds: sectionIds.length ? sectionIds : modalSections.map((item) => item.id) }),
    ]),
  ]);
  modal.querySelector(".info-modal-backdrop").addEventListener("click", closeInfoModal);
  document.body.appendChild(modal);
  document.addEventListener("keydown", closeInfoModalOnEscape);
}

function resetSectionAnswerRows(section) {
  const pointValue = getWeeklySectionQuestionPointValue(section);
  state.examAnswers = (state.examAnswers || []).filter((answer) => answer.examSectionId !== section.id);
  state.examAnswers.push(...Array.from({ length: section.questionCount }, (_, index) => ({
    id: createId(),
    examSectionId: section.id,
    questionNumber: index + 1,
    correctAnswer: 0,
    points: pointValue,
    targetTracks: getDefaultWeeklyQuestionTargetTracks(),
  })));
}

function getSectionAnswers(sectionId) {
  const section = (state.examSections || []).find((item) => item.id === sectionId);
  const questionCount = section ? Number(section.questionCount) || 0 : 0;
  if (section && questionCount > 0) {
    state.examAnswers = (state.examAnswers || []).filter((answer) => answer.examSectionId !== sectionId || Number(answer.questionNumber) <= questionCount);
  }
  const answers = (state.examAnswers || []).filter((answer) => answer.examSectionId === sectionId);
  answers.forEach((answer) => {
    answer.targetTracks = normalizeWeeklyQuestionTargetTracks(answer.targetTracks);
  });
  if (section && answers.length < questionCount) {
    const existing = new Set(answers.map((answer) => answer.questionNumber));
    const pointValue = getWeeklySectionQuestionPointValue(section);
    for (let i = 1; i <= questionCount; i += 1) {
      if (!existing.has(i)) {
        const row = { id: createId(), examSectionId: sectionId, questionNumber: i, correctAnswer: 0, points: pointValue, targetTracks: getDefaultWeeklyQuestionTargetTracks() };
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
  const previousTotalScore = Number(targetSection.totalScore) || 100;
  targetSection.questionCount = questionCount;
  targetSection.totalScore = previousTotalScore;
  section.questionCount = questionCount;
  section.totalScore = targetSection.totalScore;
  state.examAnswers = (state.examAnswers || []).filter((answer) => answer.examSectionId !== targetSection.id || answer.questionNumber <= questionCount);
  const currentAnswers = getSectionAnswers(targetSection.id);
  const pointValue = getWeeklySectionQuestionPointValue(targetSection);
  currentAnswers.forEach((answer) => {
    answer.points = pointValue;
  });
  saveState({ skipRemote: true });
  try {
    await saveExamSectionsToRemote([targetSection]);
    await saveExamAnswersToRemote(currentAnswers);
    await regradeSectionsAfterAnswerChange([targetSection]);
  } catch (error) {
    console.error("Failed to save weekly question count change", error);
    notify("문항 수 변경은 화면에 반영됐지만 서버 재채점 저장에 실패했습니다. 정답 저장을 다시 눌러주세요.");
  }
  render();
  if (options.modal) openWeeklyExamAnswerModal(targetSection.id, options.sectionIds || []);
  notify("문항 수를 변경하고 기존 답안지를 다시 채점했습니다.");
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
      answer.points = getWeeklySectionQuestionPointValue(section);
      saveState({ skipRemote: true });
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
  const picker = sections.length > 1 ? el("div", { className: "weekly-answer-picker compact" }, sections.map((item) =>
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
      el("span", {}, `${answers.length}문항 · 숫자를 키보드로 입력해주세요`),
      trackScoped ? el("small", {}, "공채, 함정요원, 경찰직 VTS, 간부는 기본 적용됩니다. 일반직 VTS와 학과특채만 문항별로 선택해주세요.") : null,
    ]),
    el("div", { className: "weekly-answer-header-actions" }, [
      renderWeeklyQuestionCountControls(section, answers, options),
      trackScoped
        ? el("div", { className: "weekly-answer-control-group" }, [
            el("span", { className: "weekly-answer-control-label" }, "일괄 적용"),
            el("div", { className: "weekly-track-bulk-actions" }, [
              renderWeeklyTrackBulkButton(section, answers, "vts"),
              renderWeeklyTrackBulkButton(section, answers, "academy"),
            ]),
          ])
        : null,
    ]),
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
    try {
      syncWeeklyAnswerFormState(form, answers);
      saveState({ skipRemote: true });
      const targetSection = (state.examSections || []).find((item) => item.id === section.id) || section;
      await saveExamSectionsToRemote([targetSection]);
      await saveExamAnswersToRemote(getSectionAnswers(section.id));
      await regradeSectionsAfterAnswerChange([targetSection]);
      render();
      if (options.modal) closeInfoModal();
      notify("정답을 저장했습니다.");
    } catch (error) {
      console.error("Failed to save weekly exam answers", error);
      notify("정답 저장에 실패했습니다. 잠시 후 다시 시도해주세요.");
    }
  });
  return panel("정답 입력", [
    answerHeader,
    picker,
    form,
  ].filter(Boolean));
}

function renderWeeklyQuestionCountControls(section, answers, options = {}) {
  const countInput = input("questionCount", "number", "문항 수", String(Number(section.questionCount) || answers.length || 20));
  countInput.min = "1";
  countInput.step = "1";
  const sectionIds = options.sectionIds || [];
  const getCurrentCount = () => Number(section.questionCount) || Number(countInput.value) || answers.length || 20;
  const applyCount = async (nextCount) => {
    countInput.value = String(Math.max(1, Number(nextCount) || 1));
    await updateWeeklyExamSectionQuestionCount(section, nextCount, {
      modal: options.modal,
      sectionIds,
    });
  };
  const countForm = el("form", { className: "weekly-question-count-row" }, [
    field("문항 수", countInput),
    button("적용", "mini-btn"),
  ]);
  countForm.addEventListener("submit", (event) => {
    event.preventDefault();
    applyCount(countInput.value);
  });
  return el("div", { className: "weekly-answer-control-group weekly-question-count-tools" }, [
    el("span", { className: "weekly-answer-control-label" }, "문항 관리"),
    el("div", { className: "weekly-question-count-controls" }, [
      countForm,
      button("-1 문항", "mini-btn secondary", "button", () => applyCount(getCurrentCount() - 1)),
      button("+1 문항", "mini-btn secondary", "button", () => applyCount(getCurrentCount() + 1)),
    ]),
  ]);
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
  const sectionId = answers[0]?.examSectionId || "";
  const section = (state.examSections || []).find((item) => item.id === sectionId) || null;
  const pointValue = getWeeklySectionQuestionPointValue(section);
  answers.forEach((answer) => {
    answer.correctAnswer = Number(form.querySelector(`[name='answer-${answer.questionNumber}']`)?.value) || 0;
    answer.points = pointValue;
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
      }
    );
    return chip;
  }));
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
      const pointValue = getWeeklySectionQuestionPointValue(target);
      state.examAnswers.push(...sourceAnswers.slice(0, target.questionCount).map((answer) => ({
        id: createId(),
        examSectionId: id,
        questionNumber: answer.questionNumber,
        correctAnswer: answer.correctAnswer,
        points: pointValue,
        targetTracks: normalizeWeeklyQuestionTargetTracks(answer.targetTracks),
      })));
    });
    saveState({ skipRemote: true });
    await saveExamAnswersToRemote(targetIds.flatMap(getSectionAnswers));
    await regradeSectionsAfterAnswerChange(targetIds.map((id) => (state.examSections || []).find((section) => section.id === id)).filter(Boolean));
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
  weekSelect.value = resolveWeeklyGradeWeekFilter(cohort, weekOptions);
  weekSelect.addEventListener("change", () => {
    weeklyExamGradeFilters.weekNumber = weekSelect.value;
    weeklyExamGradeFilters.examId = "";
    render();
  });

  const targetWeek = Number(weeklyExamGradeFilters.weekNumber) || 1;
  const exam = getWeeklyExamByCohortAndWeek(cohort, targetWeek);
  const previousExam = targetWeek > 1 ? getWeeklyExamByCohortAndWeek(cohort, targetWeek - 1) : null;
  const students = getGradeManagementStudents(cohort);
  const weeklySubjectHeaders = gradeManagementTrackFilter
    ? getWeeklyGradeSubjectHeaders(exam, gradeManagementTrackFilter)
    : getWeeklyGradeSubjectHeadersForStudents(exam, students);
  const summaries = applyWeeklyGradeRanksByTrack(students.map((student) => getWeeklyGradeStudentSummary(exam, student)));
  const previousSummaries = applyWeeklyGradeRanksByTrack(students.map((student) => getWeeklyGradeStudentSummary(previousExam, student)));
  const previousRankByStudent = new Map(previousSummaries.map((summary) => [String(summary.student.id), summary.rank]));
  const headers = ["번호", "이름", "직렬", ...weeklySubjectHeaders, "틀린 개수", "이번 등수", "백분율", "전회차 등수", "전회차 대비 등수 등락", "관리"];
  const displaySummaries = gradeManagementTrackFilter ? sortGradeSummariesForDisplay(summaries) : sortWeeklyGradeSummariesByTrack(summaries);
  const rows = displaySummaries.map((summary) => {
    const previousRank = previousRankByStudent.get(String(summary.student.id)) || 0;
    return el("tr", {}, [
      el("td", {}, formatStudentNumber(summary.student.id)),
      el("td", {}, summary.student.name || "-"),
      el("td", {}, getTeacherStudentRegisteredTrack(summary.student) || "-"),
      ...weeklySubjectHeaders.map((subject) => el("td", {}, formatSubjectScoreCell(summary.subjectScores[subject], summary))),
      el("td", {}, formatWeeklyWrongCountCell(summary)),
      el("td", {}, summary.rank ? `${summary.rank}등` : "-"),
      el("td", {}, summary.rank ? formatTopPercentLabel(summary.topPercent) : "-"),
      el("td", {}, previousRank ? `${previousRank}등` : "-"),
      el("td", {}, formatRankDelta(summary.rank, previousRank)),
      el("td", { className: "action-cell" }, summary.submittedCount
        ? button("삭제", "mini-btn danger", "button", () => deleteWeeklyExamStudentSubmissions(exam, summary.student))
        : "-"),
    ]);
  });

  return panel("주간평가 성적", [
    el("div", { className: "teacher-search grade-management-filter" }, [
      field("주차", weekSelect),
    ]),
    exam ? renderWeeklyGradeScoreActions(exam, cohort, targetWeek) : null,
    exam
      ? table(headers, rows.length ? rows : [el("tr", {}, [el("td", { colSpan: headers.length }, el("div", { className: "empty table-empty" }, "조회할 학생이 없습니다."))])])
      : el("div", { className: "empty" }, `${targetWeek}주차 주간평가가 아직 생성되지 않았습니다.`),
  ]);
}

function renderWeeklyGradeScoreActions(exam, cohort, weekNumber) {
  const resetTargets = getZeroScoreIncompleteWeeklySubmissions(exam, cohort);
  return el("div", { className: "action-row weekly-answer-actions" }, [
    button("성적표 다운로드", "mini-btn secondary", "button", () => downloadWeeklyGradeReport(exam, cohort, weekNumber)),
    resetTargets.length
      ? button(`0점 답안 초기화 ${resetTargets.length}건`, "mini-btn danger", "button", () => resetZeroScoreIncompleteWeeklySubmissions(exam, cohort))
      : null,
  ]);
}

function getWeeklyGradeSubjectHeaders(exam, track) {
  if (!exam) return [];
  const normalizedTrack = normalizeCoastGuardTrack(track);
  const seen = new Set();
  const subjectOrder = new Map(WEEKLY_EXAM_SUBJECTS.map((subject, index) => [subject, index]));
  return getExamSections(exam.id)
    .filter((section) => {
      const sectionTrack = normalizeCoastGuardTrack(section.track);
      if (section.isActive === false) return false;
      if (sectionTrack === normalizedTrack) return isWeeklyGradeSectionVisibleForTrack(section, normalizedTrack);
      return sectionTrack === WEEKLY_EXAM_TRACK_ALL &&
        isWeeklySubjectAllowedForTrack(section.subject, normalizedTrack) &&
        isWeeklyGradeSectionVisibleForTrack(section, normalizedTrack);
    })
    .map((section) => String(section.subject || "").trim())
    .filter((subject) => {
      if (!subject || seen.has(subject)) return false;
      seen.add(subject);
      return true;
    })
    .sort((a, b) => (subjectOrder.get(a) ?? 999) - (subjectOrder.get(b) ?? 999) || a.localeCompare(b, "ko-KR"));
}

function getWeeklyGradeSubjectHeadersForStudents(exam, students = []) {
  if (!exam) return [];
  const seen = new Set();
  const subjectOrder = new Map(WEEKLY_EXAM_SUBJECTS.map((subject, index) => [subject, index]));
  students.forEach((student) => {
    getWeeklyGradeSectionsForStudent(exam, student).forEach((section) => {
      const subject = String(section.subject || "").trim();
      if (subject) seen.add(subject);
    });
  });
  return [...seen].sort((a, b) => (subjectOrder.get(a) ?? 999) - (subjectOrder.get(b) ?? 999) || a.localeCompare(b, "ko-KR"));
}
async function deleteWeeklyExamStudentSubmissions(exam, student) {
  if (!exam || !student) return notify("삭제할 성적을 찾을 수 없습니다.");
  const sections = getWeeklyGradeSectionsForStudent(exam, student);
  const sectionIds = new Set(sections.map((section) => section.id));
  const submissions = (state.examSubmissions || []).filter((submission) =>
    sectionIds.has(submission.examSectionId) &&
    String(submission.studentId || "") === String(student.id || "") &&
    submission.status === "submitted"
  );
  if (!submissions.length) return notify("삭제할 주간평가 성적이 없습니다.");
  const weekLabel = `${Number(exam.weekNumber) || 1}주차`;
  if (!confirm(`${student.name || student.id} 학생의 ${weekLabel} 주간평가 성적 ${submissions.length}건을 삭제할까요?\n삭제하면 학생 앱에서 해당 과목을 다시 응시할 수 있습니다.`)) return;

  const previousSubmissions = [...(state.examSubmissions || [])];
  const previousAnswers = [...(state.submissionAnswers || [])];
  const submissionIds = new Set(submissions.map((submission) => submission.id));
  state.examSubmissions = previousSubmissions.filter((submission) => !submissionIds.has(submission.id));
  state.submissionAnswers = previousAnswers.filter((answer) => !submissionIds.has(answer.submissionId));
  saveState({ skipRemote: true });

  try {
    await deleteExamSubmissionsFromRemote([...submissionIds]);
    render();
    notify("주간평가 성적을 삭제했습니다. 학생 앱에서 다시 응시할 수 있습니다.");
  } catch (error) {
    console.error(error);
    state.examSubmissions = previousSubmissions;
    state.submissionAnswers = previousAnswers;
    saveState({ skipRemote: true });
    render();
    notify("성적 삭제를 서버에 반영하지 못했습니다. Supabase 삭제 권한을 확인해주세요.");
  }
}

async function resetWeeklyExamSubjectSubmission(section, submission, student) {
  if (!section || !submission?.id) return notify("초기화할 답안을 찾을 수 없습니다.");
  const studentLabel = student?.name || submission.studentName || submission.studentId || "학생";
  const subjectLabel = section.subject || "과목";
  if (!confirm(`${studentLabel} 학생의 ${subjectLabel} 답안을 초기화할까요?\n초기화하면 해당 과목을 학생 앱에서 다시 입력해야 합니다.`)) return;

  const previousSubmissions = [...(state.examSubmissions || [])];
  const previousAnswers = [...(state.submissionAnswers || [])];
  state.examSubmissions = previousSubmissions.filter((item) => item.id !== submission.id);
  state.submissionAnswers = previousAnswers.filter((answer) => answer.submissionId !== submission.id);
  saveState({ skipRemote: true });

  try {
    await deleteExamSubmissionsFromRemote([submission.id]);
    render();
    notify(`${studentLabel} 학생의 ${subjectLabel} 답안을 초기화했습니다. 학생 앱에서 다시 입력할 수 있습니다.`);
  } catch (error) {
    console.error(error);
    state.examSubmissions = previousSubmissions;
    state.submissionAnswers = previousAnswers;
    saveState({ skipRemote: true });
    render();
    notify("답안 초기화를 서버에 반영하지 못했습니다. Supabase 삭제 권한을 확인해주세요.");
  }
}

function getZeroScoreIncompleteWeeklySubmissions(exam, cohort) {
  if (!exam) return [];
  const targets = [];
  getGradeManagementStudents(cohort).forEach((student) => {
    getWeeklyGradeSectionsForStudent(exam, student).forEach((section) => {
      const submission = getStudentExamSubmission(student.id, section.id);
      if (!submission || Number(submission.score || 0) !== 0) return;
      const visibleAnswers = getWeeklyGradeVisibleAnswers(section, student);
      const answerStatus = getWeeklySubmissionAnswerStatus(section, submission, visibleAnswers);
      if (answerStatus.status !== "incomplete") return;
      targets.push({ student, section, submission, answerStatus });
    });
  });
  return targets;
}

async function resetZeroScoreIncompleteWeeklySubmissions(exam, cohort) {
  const targets = getZeroScoreIncompleteWeeklySubmissions(exam, cohort);
  if (!targets.length) return notify("초기화할 0점 답안 부족 제출이 없습니다.");
  const weekLabel = `${Number(exam?.weekNumber) || 1}주차`;
  const trackLabel = gradeManagementTrackFilter || "전체 직렬";
  if (!confirm(`${weekLabel} ${trackLabel}에서 0점으로 표시된 답안 부족 제출 ${targets.length}건을 초기화할까요?\n정상 답안이 있는 실제 0점 제출은 제외됩니다.`)) return;

  const previousSubmissions = [...(state.examSubmissions || [])];
  const previousAnswers = [...(state.submissionAnswers || [])];
  const submissionIds = new Set(targets.map((target) => target.submission.id).filter(Boolean));
  state.examSubmissions = previousSubmissions.filter((submission) => !submissionIds.has(submission.id));
  state.submissionAnswers = previousAnswers.filter((answer) => !submissionIds.has(answer.submissionId));
  saveState({ skipRemote: true });

  try {
    await deleteExamSubmissionsFromRemote([...submissionIds]);
    render();
    notify(`0점 답안 부족 제출 ${targets.length}건을 초기화했습니다.`);
  } catch (error) {
    console.error(error);
    state.examSubmissions = previousSubmissions;
    state.submissionAnswers = previousAnswers;
    saveState({ skipRemote: true });
    render();
    notify("0점 답안 초기화를 서버에 반영하지 못했습니다. Supabase 삭제 권한을 확인해주세요.");
  }
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
  const participants = getFinalMockGradeParticipants(cohort, students, records);
  const previousParticipants = getFinalMockGradeParticipants(cohort, students, previousRecords);
  const previousSummaries = applyGradeRanksByTrack(previousParticipants.map((student) => getFinalMockGradeStudentSummary(student, previousRecords)));
  const previousRankByStudent = new Map(previousSummaries.map((summary) => [String(summary.student.id), summary.rank]));
  const summaries = applyGradeRanksByTrack(participants.map((student) => getFinalMockGradeStudentSummary(student, records)));
  const registered = participants.map((student) => recordByStudent.get(String(student.id))).filter(Boolean);
  const headers = [
    "번호",
    "이름",
    "구분",
    "직렬",
    ...getGradeSubjectHeaders().map((subject) => formatFinalGradeTableSubjectHeader(subject, gradeManagementTrackFilter)),
    "오답",
    "이번 등수",
    "백분율",
    "전회차 등수",
    "전회차 대비 등수 등락",
    "관리",
  ];
  const rows = sortGradeSummariesForDisplay(summaries).map((summary) => {
    const previousRank = previousRankByStudent.get(String(summary.student.id)) || 0;
    const record = recordByStudent.get(String(summary.student.id)) || null;
    return el("tr", {}, [
      el("td", {}, formatStudentNumber(summary.student.id)),
      el("td", {}, summary.student.name || "-"),
      el("td", {}, summary.student.isExternalFinalScore ? "미등록" : "등록"),
      el("td", {}, getTeacherStudentRegisteredTrack(summary.student) || "-"),
      ...getGradeSubjectHeaders().map((subject) => el("td", {}, formatSubjectScoreCell(summary.subjectScores[subject]))),
      el("td", {}, summary.hasScore && summary.wrongCount !== "" ? String(summary.wrongCount) : "-"),
      el("td", {}, summary.rank ? `${summary.rank}등` : "-"),
      el("td", {}, summary.rank ? formatTopPercentLabel(summary.topPercent) : "-"),
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
  const bulkSaveButton = button("일괄 저장", "btn", "button", () => saveFinalBulkScoreInput(round, students, bulkTextarea.value, cohort));
  const bulkDeleteButton = button("일괄 삭제", "mini-btn danger", "button", () => deleteFinalBulkScores(round, participants));

  return panel("파이널 모의고사 성적", [
    el("div", { className: "teacher-search grade-management-filter" }, [
      field("회차", roundSelect),
    ]),
    el("div", { className: "grade-bulk-input" }, [
      el("div", { className: "grade-input-actions" }, [
        el("p", { className: "subtle" }, "엑셀에서 성적 표를 복사해 붙여넣으면 등록 학생은 자동 매칭되고, 매칭되지 않은 행도 미등록 응시자로 석차에 반영됩니다."),
        el("div", { className: "grade-bulk-action-buttons" }, [
          bulkDeleteButton,
          bulkSaveButton,
        ]),
      ]),
      bulkTextarea,
    ]),
    table(headers, rows.length ? rows : [el("tr", {}, [el("td", { colSpan: headers.length }, el("div", { className: "empty table-empty" }, "조회할 학생이 없습니다."))])]),
    registered.length ? null : el("p", { className: "subtle" }, "파이널 모의고사 성적 데이터가 등록되면 이 표에 응시자별 성적이 표시됩니다."),
  ]);
}

async function saveFinalBulkScoreInput(round, students = [], rawText = "", cohort = selectedStudentCohort) {
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
  let externalCount = 0;
  parsed.rows.forEach((row) => {
    if (!String(row.name || row.id || "").trim()) return;
    const matchedStudent = matchFinalBulkStudent(row, studentById, studentsByName);
    const student = matchedStudent || createFinalExternalStudentFromRow(row, cohort);
    if (!matchedStudent) externalCount += 1;
    if (!student) {
      return;
    }
    const subjectScores = {};
    getGradeSubjectHeaders().forEach((subject) => {
      const raw = row.subjectScores[subject];
      if (raw === "" || raw === "-" || raw === undefined || raw === null) return;
      const value = Number(raw);
      if (!Number.isFinite(value)) return;
      subjectScores[subject] = { score: value, maxScore: 100, status: "submitted" };
    });
    const totals = calculateFinalSubjectTotalsForTrack(subjectScores, getTeacherStudentRegisteredTrack(student));
    const wrongCount = row.wrongCount === "" || row.wrongCount === "-" ? "" : Math.max(0, Number(row.wrongCount) || 0);
    if (!Object.keys(subjectScores).length && wrongCount === "") return;
    nextRecords.push({
      id: `final-${round}-${student.id}`,
      round,
      studentId: student.id,
      studentName: student.name || "",
      track: getTeacherStudentRegisteredTrack(student) || "",
      cohort: String(cohort || ""),
      isExternalFinalScore: student.isExternalFinalScore === true,
      score: Math.round(totals.score * 10) / 10,
      maxScore: totals.maxScore,
      wrongCount: totals.submittedCount ? totals.wrongCount : wrongCount,
      subjectScores,
      status: "등록 완료",
      updatedAt: new Date().toISOString(),
    });
  });
  if (!nextRecords.length) {
    return notify("저장할 성적 데이터가 없습니다.");
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
  await persistFinalExamScoresToRemote();
  notify(externalCount
    ? `${nextRecords.length}명 저장, 미등록 응시자 ${externalCount}명도 석차에 반영했습니다.`
    : `${nextRecords.length}명의 파이널 성적을 일괄 저장했습니다.`);
  render();
}

async function deleteFinalBulkScores(round, participants = []) {
  const targetIds = new Set(participants.map((student) => String(student.id)).filter(Boolean));
  if (!targetIds.size) return notify("삭제할 파이널 성적이 없습니다.");
  const currentRound = Number(round) || 1;
  const deleteCount = (state.finalExamScores || []).filter((record) =>
    Number(record.round || record.roundNumber || record.session || record.sessionNumber || record.examRound || record.examNumber || 0) === currentRound &&
    targetIds.has(String(record.studentId || record.student_id || record.studentNumber || ""))
  ).length;
  if (!deleteCount) return notify("삭제할 파이널 성적이 없습니다.");
  const scopeText = gradeManagementTrackFilter ? `${gradeManagementTrackFilter} 직렬 ` : "";
  if (!confirm(`${currentRound}회차 ${scopeText}파이널 성적 ${deleteCount}건을 일괄 삭제할까요?`)) return;
  state.finalExamScores = (state.finalExamScores || []).filter((record) =>
    Number(record.round || record.roundNumber || record.session || record.sessionNumber || record.examRound || record.examNumber || 0) !== currentRound ||
    !targetIds.has(String(record.studentId || record.student_id || record.studentNumber || ""))
  );
  saveState({ skipRemote: true });
  await persistFinalExamScoresToRemote();
  notify(`${deleteCount}건의 파이널 성적을 삭제했습니다.`);
  render();
}

function parseFinalBulkScoreRows(rawText = "") {
  const lines = String(rawText || "").split(/\r?\n/).filter((line) => line.trim());
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
    el("p", { className: "subtle" }, `${student.name || "-"} / ${student.isExternalFinalScore ? "미등록" : "등록"} / ${getTeacherStudentRegisteredTrack(student) || "-"} / ${round}회차`),
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

async function saveFinalScoreEdit(round, student, subjectInputs, wrongInput) {
  const subjectScores = {};
  subjectInputs.forEach((node, subject) => {
    const raw = String(node.value || "").trim();
    if (raw === "") return;
    const value = Number(raw);
    if (!Number.isFinite(value)) return;
    subjectScores[subject] = { score: value, maxScore: 100, status: "submitted" };
  });
  const totals = calculateFinalSubjectTotalsForTrack(subjectScores, getTeacherStudentRegisteredTrack(student));
  const wrongRaw = String(wrongInput.value || "").trim();
  const wrongCount = wrongRaw === "" ? "" : Math.max(0, Number(wrongRaw) || 0);
  if (!Object.keys(subjectScores).length && wrongRaw === "") return notify("점수 또는 오답 수를 입력해주세요.");
  const record = {
    id: `final-${round}-${student.id}`,
    round,
    studentId: student.id,
    studentName: student.name || "",
    track: getTeacherStudentRegisteredTrack(student) || "",
    cohort: student.finalScoreCohort || selectedStudentCohort || "",
    isExternalFinalScore: student.isExternalFinalScore === true,
    score: Math.round(totals.score * 10) / 10,
    maxScore: totals.maxScore,
    wrongCount: totals.submittedCount ? totals.wrongCount : wrongCount,
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
  await persistFinalExamScoresToRemote();
  closeInfoModal();
  notify(`${student.name || student.id} 학생의 파이널 성적을 저장했습니다.`);
  render();
}

function renderFinalScoreInputRow(student, record) {
  const subjectScores = record?.subjectScores || {};
  return el("tr", {}, [
    el("td", {}, formatStudentNumber(student.id)),
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

async function saveFinalScoreInputs(round, students = []) {
  const nextRecords = [];
  students.forEach((student) => {
    const subjectScores = {};
    getGradeSubjectHeaders().forEach((subject) => {
      const selector = `.grade-score-input[data-student-id="${escapeCssValue(student.id)}"][data-subject="${escapeCssValue(subject)}"]`;
      const node = document.querySelector(selector);
      const raw = String(node?.value || "").trim();
      if (raw === "") return;
      const value = Number(raw);
      if (!Number.isFinite(value)) return;
      subjectScores[subject] = { score: value, maxScore: 100, status: "submitted" };
    });
    const totals = calculateFinalSubjectTotalsForTrack(subjectScores, getTeacherStudentRegisteredTrack(student));
    const wrongNode = document.querySelector(`.grade-score-input[data-student-id="${escapeCssValue(student.id)}"][data-role="wrongCount"]`);
    const wrongRaw = String(wrongNode?.value || "").trim();
    const wrongCount = wrongRaw === "" ? "" : Math.max(0, Number(wrongRaw) || 0);
    if (!Object.keys(subjectScores).length && wrongRaw === "") return;
    nextRecords.push({
      id: `final-${round}-${student.id}`,
      round,
      studentId: student.id,
      studentName: student.name || "",
      track: getTeacherStudentRegisteredTrack(student) || "",
      cohort: String(selectedStudentCohort || ""),
      isExternalFinalScore: false,
      score: Math.round(totals.score * 10) / 10,
      maxScore: totals.maxScore,
      wrongCount: totals.submittedCount ? totals.wrongCount : wrongCount,
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
  await persistFinalExamScoresToRemote();
  notify(`${nextRecords.length}명의 파이널 성적을 저장했습니다.`);
  render();
}

async function persistFinalExamScoresToRemote() {
  try {
    await saveFinalExamScoresToRemote();
  } catch (error) {
    console.error(error);
    notify("파이널 성적을 서버에 저장하지 못했습니다. Supabase 스키마를 확인해주세요.");
  }
}

function escapeCssValue(value) {
  const text = String(value || "");
  return window.CSS?.escape ? CSS.escape(text) : text.replace(/["\\]/g, "\\$&");
}

function downloadWeeklyGradeReport(exam, cohort = selectedStudentCohort, weekNumber = weeklyExamGradeFilters.weekNumber) {
  if (!exam) return notify("다운로드할 주간평가가 없습니다.");
  const targetWeek = Number(weekNumber || exam.weekNumber) || 1;
  const students = getWeeklyGradeReportStudents(cohort);
  const previousExam = targetWeek > 1 ? getWeeklyExamByCohortAndWeek(cohort, targetWeek - 1) : null;
  const rankedSummaries = applyWeeklyGradeRanksByTrack(students.map((student) => getWeeklyGradeStudentSummary(exam, student)));
  const summaries = sortWeeklyGradeReportSummaries(rankedSummaries, true).filter((summary) => summary.submittedCount > 0);
  const previousSummaries = applyWeeklyGradeRanksByTrack(students.map((student) => getWeeklyGradeStudentSummary(previousExam, student)));
  const previousRankByStudent = new Map(previousSummaries.map((summary) => [String(summary.student.id), summary.rank]));
  const subjects = getWeeklyGradeReportSubjects(exam);
  const headers = ["번호", "이름", "직렬", ...subjects.map(formatWeeklyGradeReportSubjectHeader), "개수", "이번 등수", "전주 등수", "등락"];
  const rows = summaries.map((summary) => {
    const previousRank = previousRankByStudent.get(String(summary.student.id)) || 0;
    return {
      summary,
      previousRank,
      cells: [
        formatStudentNumber(summary.student.id),
        summary.student.name || "",
        formatWeeklyGradeReportTrackLabel(getTeacherStudentRegisteredTrack(summary.student)),
        ...subjects.map((subject) => formatWeeklyGradeReportScoreCell(summary.subjectScores[subject])),
        formatWeeklyWrongCountCell(summary) === "-" ? "" : formatWeeklyWrongCountCell(summary),
        summary.rank ? String(summary.rank) : "",
        previousRank ? String(previousRank) : "",
      ],
    };
  });
  if (!rows.length) return notify("해당 주차에 응시한 학생이 없습니다.");
  const titleText = `[론박스터디] ${targetWeek}주차 주간평가 성적표`;
  const workbook = buildWeeklyGradeReportWorkbook({ titleText, headers, rows });
  downloadXlsx(`${titleText}_${cohort || "전체"}기_전체직렬.xlsx`, workbook);
  notify("주간평가 성적표를 다운로드했습니다.");
}

function getWeeklyGradeReportStudents(cohort = selectedStudentCohort) {
  return getStudentsInCohort(cohort)
    .sort((a, b) => String(a.id).localeCompare(String(b.id), "ko-KR", { numeric: true }));
}

function getWeeklyGradeReportSubjects(exam) {
  const standardSubjects = ["해사법규", "해양경찰학개론", "형사법", "해사영어", "항해학", "기관학"];
  const actualSubjects = getExamSections(exam?.id || "")
    .filter((section) => section.isActive !== false)
    .map((section) => String(section.subject || "").trim())
    .filter(Boolean)
    .filter((subject, index, subjects) => subjects.indexOf(subject) === index)
    .sort(compareWeeklySubjects);
  return [
    ...standardSubjects,
    ...actualSubjects.filter((subject) => !standardSubjects.includes(subject)),
  ];
}

function sortWeeklyGradeReportSummaries(summaries = [], groupByTrack = false) {
  const sorted = sortGradeSummariesForDisplay(summaries);
  if (!groupByTrack) return sorted;
  return sorted.sort((a, b) => {
    const trackCompare = formatWeeklyGradeReportTrackLabel(getTeacherStudentRegisteredTrack(a.student))
      .localeCompare(formatWeeklyGradeReportTrackLabel(getTeacherStudentRegisteredTrack(b.student)), "ko-KR");
    if (trackCompare) return trackCompare;
    const rankA = Number(a.rank) || 0;
    const rankB = Number(b.rank) || 0;
    if (rankA && rankB && rankA !== rankB) return rankA - rankB;
    if (rankA !== rankB) return rankA ? -1 : 1;
    const scoreCompare = (Number(b.score) || 0) - (Number(a.score) || 0);
    if (scoreCompare) return scoreCompare;
    const wrongCompare = (Number(a.wrongCount) || 0) - (Number(b.wrongCount) || 0);
    if (wrongCompare) return wrongCompare;
    return String(a.student?.id || "").localeCompare(String(b.student?.id || ""), "ko-KR", { numeric: true });
  });
}

function formatWeeklyGradeReportSubjectHeader(subject) {
  const labels = {
    해사법규: "법규",
    해양경찰학개론: "개론",
    형사법: "형사",
    "형사법(공판)": "형소법",
    해사영어: "영어",
    항해학: "항해",
    기관학: "기관",
  };
  return labels[subject] || subject;
}

function formatWeeklyGradeReportTrackLabel(track) {
  const normalized = normalizeCoastGuardTrack(track);
  const labels = {
    "경찰직 - 공채(순경)": "공개채용",
    "경찰직 - 해경학과 항해(경장)": "해경학과 항해",
    "경찰직 - 해경학과 기관(경장)": "해경학과 기관",
    "경찰직 - 함정요원 항해(순경)": "함정 항해",
    "경찰직 - 함정요원 기관(순경)": "함정 기관",
    "경찰직 - 해상교통관제(VTS)(순경)": "VTS",
    "일반직 - 선박교통관제(VTS)": "선박관제",
    "경찰직 - 경위 공채(해양-기관)": "간부 기관",
    "경찰직 - 경위 공채(해양-항해)": "간부 항해",
  };
  return labels[normalized] || normalized || "";
}

function formatWeeklyGradeReportScoreCell(subjectScore) {
  if (!subjectScore || subjectScore.status === "missing" || subjectScore.status === "empty") return "";
  return String(Number(subjectScore.score) || 0);
}

function buildWeeklyGradeReportHtml({ titleText, headers, rows }) {
  const columnCount = headers.length;
  const colgroup = headers.map((header, index) => {
    const width = getWeeklyGradeReportColumnWidthPx(header, index, headers.length);
    return `<col style="width:${width}px">`;
  }).join("");
  const bodyRows = rows.length
    ? rows.map(({ summary, previousRank, cells }, index) => {
        const delta = getWeeklyGradeReportRankDelta(summary.rank, previousRank);
        const deltaClass = delta.direction === "up" ? "rank-up" : delta.direction === "down" ? "rank-down" : "";
        const previousTrack = String(rows[index - 1]?.cells?.[2] || "");
        const currentTrack = String(cells[2] || "");
        const nextTrack = String(rows[index + 1]?.cells?.[2] || "");
        const rowClasses = currentTrack
          ? [
              "track-group",
              currentTrack !== previousTrack ? "track-start" : "",
              currentTrack !== nextTrack ? "track-end" : "",
            ].filter(Boolean)
          : [];
        const rowClass = rowClasses.length ? ` class="${rowClasses.join(" ")}"` : "";
        return `<tr${rowClass}>${cells.map((cell) => `<td>${escapeHtmlText(cell)}</td>`).join("")}<td class="${deltaClass}">${escapeHtmlText(delta.label)}</td></tr>`;
      }).join("")
    : `<tr><td colspan="${columnCount}">조회할 성적이 없습니다.</td></tr>`;
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  table { border-collapse: collapse; table-layout: fixed; font-family: "Malgun Gothic", Arial, sans-serif; }
  th, td { border: 0.12pt solid #111; height: 21px; padding: 0 4px; text-align: center; vertical-align: middle; font-family: "Malgun Gothic", Arial, sans-serif; font-size: 12pt; mso-number-format: "\\@"; }
  .title { background: #ffff00; color: #1f2933; font-family: "공체 Bold", "공체", "GongGothic", "Malgun Gothic", Arial, sans-serif; font-size: 48pt; font-weight: bold; letter-spacing: 0; height: 70px; text-align: center; white-space: nowrap; }
  .title-spacer th { border: none; height: 21px; background: #fff; }
  .header th { font-size: 12pt; font-weight: 400; background: #fff; }
  .track-group td:first-child { border-left: 0.4pt solid #111; }
  .track-group td:last-child { border-right: 0.4pt solid #111; }
  .track-start td { border-top: 0.4pt solid #111; }
  .track-end td { border-bottom: 0.4pt solid #111; }
  .rank-up { color: #f00; font-weight: 700; }
  .rank-down { color: #00f; font-weight: 700; }
</style>
</head>
<body>
<table>
  <colgroup>${colgroup}</colgroup>
  <thead>
    <tr><th class="title" colspan="${columnCount}">${escapeHtmlText(titleText)}</th></tr>
    <tr class="title-spacer"><th colspan="${columnCount}"></th></tr>
    <tr class="header">${headers.map((header) => `<th>${escapeHtmlText(header)}</th>`).join("")}</tr>
  </thead>
  <tbody>${bodyRows}</tbody>
</table>
</body>
</html>`;
}

function getWeeklyGradeReportRankDelta(currentRank, previousRank) {
  if (!currentRank || !previousRank) return { label: "-", direction: "" };
  const delta = Number(previousRank) - Number(currentRank);
  if (!delta) return { label: "-", direction: "" };
  return delta > 0
    ? { label: `▲${delta}`, direction: "up" }
    : { label: `▼${Math.abs(delta)}`, direction: "down" };
}

function buildWeeklyGradeReportWorkbook({ titleText, headers, rows }) {
  return [
    { name: "[Content_Types].xml", content: buildXlsxContentTypesXml() },
    { name: "_rels/.rels", content: buildXlsxRootRelsXml() },
    { name: "docProps/app.xml", content: buildXlsxAppXml() },
    { name: "docProps/core.xml", content: buildXlsxCoreXml() },
    { name: "xl/workbook.xml", content: buildXlsxWorkbookXml() },
    { name: "xl/_rels/workbook.xml.rels", content: buildXlsxWorkbookRelsXml() },
    { name: "xl/styles.xml", content: buildWeeklyGradeReportStylesXml() },
    { name: "xl/worksheets/sheet1.xml", content: buildWeeklyGradeReportSheetXml({ titleText, headers, rows }) },
  ];
}

function buildWeeklyGradeReportSheetXml({ titleText, headers, rows }) {
  const columnCount = headers.length;
  const lastColumn = getExcelColumnName(columnCount);
  const dataRowCount = Math.max(rows.length, 1);
  const lastRow = 3 + dataRowCount;
  const cols = headers.map((header, index) => {
    const width = getWeeklyGradeReportColumnWidth(header, index, headers.length);
    return `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`;
  }).join("");
  const titleRow = `<row r="1" ht="${pxToExcelRowHeight(70)}" customHeight="1">${buildXlsxInlineStringCell("A1", titleText, 1)}</row>`;
  const spacerRow = `<row r="2" ht="21" customHeight="1"></row>`;
  const headerRow = `<row r="3">${headers.map((header, index) =>
    buildXlsxInlineStringCell(`${getExcelColumnName(index + 1)}3`, header, 2)
  ).join("")}</row>`;
  const bodyRows = rows.length
    ? rows.map(({ summary, previousRank, cells }, rowIndex) => {
        const rowNumber = rowIndex + 4;
        const delta = getWeeklyGradeReportRankDelta(summary.rank, previousRank);
        const previousTrack = String(rows[rowIndex - 1]?.cells?.[2] || "");
        const currentTrack = String(cells[2] || "");
        const nextTrack = String(rows[rowIndex + 1]?.cells?.[2] || "");
        const isTrackStart = Boolean(currentTrack && currentTrack !== previousTrack);
        const isTrackEnd = Boolean(currentTrack && currentTrack !== nextTrack);
        const cellsXml = cells.map((cell, columnIndex) =>
          buildWeeklyGradeReportXlsxDataCell(`${getExcelColumnName(columnIndex + 1)}${rowNumber}`, cell, getWeeklyGradeReportXlsxCellStyleId({
            columnNumber: columnIndex + 1,
            columnCount,
            isTrackStart,
            isTrackEnd,
          }), isWeeklyGradeReportNumericColumn(columnIndex + 1, columnCount))
        ).join("");
        const deltaStyle = getWeeklyGradeReportXlsxCellStyleId({
          columnNumber: columnCount,
          columnCount,
          isTrackStart,
          isTrackEnd,
          deltaDirection: delta.direction,
        });
        return `<row r="${rowNumber}">${cellsXml}${buildXlsxInlineStringCell(`${getExcelColumnName(columnCount)}${rowNumber}`, delta.label, deltaStyle)}</row>`;
      }).join("")
    : `<row r="4">${buildXlsxInlineStringCell("A4", "조회된 성적이 없습니다.", 3)}</row>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <dimension ref="A1:${lastColumn}${lastRow}"/>
  <sheetViews><sheetView workbookViewId="0"/></sheetViews>
  <sheetFormatPr defaultRowHeight="21"/>
  <cols>${cols}</cols>
  <sheetData>${titleRow}${spacerRow}${headerRow}${bodyRows}</sheetData>
  <mergeCells count="1"><mergeCell ref="A1:${lastColumn}1"/></mergeCells>
  <pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
</worksheet>`;
}

function getWeeklyGradeReportColumnWidth(header, index, columnCount) {
  if (index >= columnCount - 4) return 11.1;
  const pixels = getWeeklyGradeReportColumnWidthPx(header, index, columnCount);
  return pxToExcelColumnWidth(pixels, index === 2 ? 9 : 7);
}

function getWeeklyGradeReportColumnWidthPx(header, index, columnCount) {
  if (index === 0 || index === 1) return 72;
  if (index === 2) return 125;
  if (index >= 3 && index < columnCount - 4) return 72;
  return 100;
}

function pxToExcelColumnWidth(pixels, maxDigitWidth = 7) {
  return Math.max(1, Math.round(((Number(pixels) || 72) - 5) / maxDigitWidth * 100) / 100);
}

function pxToExcelRowHeight(pixels) {
  return Math.max(1, Math.round((Number(pixels) || 70) * 0.75 * 100) / 100);
}

function buildXlsxInlineStringCell(ref, value, styleId = 0) {
  return `<c r="${ref}" s="${styleId}" t="inlineStr"><is><t>${escapeXmlText(value)}</t></is></c>`;
}

function buildWeeklyGradeReportXlsxDataCell(ref, value, styleId = 0, numeric = false) {
  const text = String(value ?? "").trim();
  if (numeric && text !== "" && /^-?\d+(\.\d+)?$/.test(text)) {
    return `<c r="${ref}" s="${styleId}"><v>${text}</v></c>`;
  }
  return buildXlsxInlineStringCell(ref, value, styleId);
}

function isWeeklyGradeReportNumericColumn(columnNumber, columnCount) {
  return columnNumber >= 4 && columnNumber < columnCount;
}

function getWeeklyGradeReportXlsxCellStyleId({ columnNumber, columnCount, isTrackStart, isTrackEnd, deltaDirection = "" }) {
  const borderMask = (columnNumber === 1 ? 1 : 0)
    | (columnNumber === columnCount ? 2 : 0)
    | (isTrackStart ? 4 : 0)
    | (isTrackEnd ? 8 : 0);
  const fontOffset = deltaDirection === "up" ? 1 : deltaDirection === "down" ? 2 : 0;
  return 3 + fontOffset * 16 + borderMask;
}

function buildWeeklyGradeReportStylesXml() {
  const borders = [
    `<border><left/><right/><top/><bottom/><diagonal/></border>`,
    ...Array.from({ length: 16 }, (_, mask) => buildWeeklyGradeReportBorderXml(mask)),
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
    <font><b/><sz val="48"/><color rgb="FF1F2933"/><name val="공체 Bold"/></font>
    <font><sz val="12"/><name val="Malgun Gothic"/></font>
    <font><b/><sz val="12"/><color rgb="FFFF0000"/><name val="Malgun Gothic"/></font>
    <font><b/><sz val="12"/><color rgb="FF0000FF"/><name val="Malgun Gothic"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFFF00"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="17">${borders}</borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="51">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="49" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1" applyNumberFormat="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="49" fontId="2" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1" applyNumberFormat="1"><alignment horizontal="center" vertical="center"/></xf>
    ${bodyXfs}
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

function buildWeeklyGradeReportBorderXml(mask) {
  const side = () => `<color rgb="FF111111"/>`;
  const leftStyle = mask & 1 ? "medium" : "thin";
  const rightStyle = mask & 2 ? "medium" : "thin";
  const topStyle = mask & 4 ? "medium" : "thin";
  const bottomStyle = mask & 8 ? "medium" : "thin";
  return `<border><left style="${leftStyle}">${side(mask & 1)}</left><right style="${rightStyle}">${side(mask & 2)}</right><top style="${topStyle}">${side(mask & 4)}</top><bottom style="${bottomStyle}">${side(mask & 8)}</bottom><diagonal/></border>`;
}

function buildXlsxContentTypesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`;
}

function buildXlsxRootRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
}

function buildXlsxWorkbookXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="성적표" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;
}

function buildXlsxWorkbookRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
}

function buildXlsxAppXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Robustudy</Application>
</Properties>`;
}

function buildXlsxCoreXml() {
  const now = new Date().toISOString();
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:creator>Robustudy</dc:creator>
  <cp:lastModifiedBy>Robustudy</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`;
}

function downloadXlsx(filename, files) {
  const blob = createZipBlob(files, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  const url = URL.createObjectURL(blob);
  const link = el("a", { href: url, download: filename, style: "display:none" });
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function createZipBlob(files, type = "application/zip") {
  const encoder = new TextEncoder();
  const preparedFiles = files.map((file) => ({
    nameBytes: encoder.encode(file.name),
    data: typeof file.content === "string" ? encoder.encode(file.content) : file.content,
  }));
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  preparedFiles.forEach((file) => {
    const crc = getCrc32(file.data);
    const localHeader = createZipLocalHeader(file, crc);
    localParts.push(localHeader, file.nameBytes, file.data);
    centralParts.push(createZipCentralHeader(file, crc, offset), file.nameBytes);
    offset += localHeader.length + file.nameBytes.length + file.data.length;
  });
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const endRecord = createZipEndRecord(preparedFiles.length, centralSize, offset);
  return new Blob([...localParts, ...centralParts, endRecord], { type });
}

function createZipLocalHeader(file, crc) {
  const header = new Uint8Array(30);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, 0, true);
  view.setUint32(14, crc, true);
  view.setUint32(18, file.data.length, true);
  view.setUint32(22, file.data.length, true);
  view.setUint16(26, file.nameBytes.length, true);
  view.setUint16(28, 0, true);
  return header;
}

function createZipCentralHeader(file, crc, offset) {
  const header = new Uint8Array(46);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, 0, true);
  view.setUint16(14, 0, true);
  view.setUint32(16, crc, true);
  view.setUint32(20, file.data.length, true);
  view.setUint32(24, file.data.length, true);
  view.setUint16(28, file.nameBytes.length, true);
  view.setUint16(30, 0, true);
  view.setUint16(32, 0, true);
  view.setUint16(34, 0, true);
  view.setUint16(36, 0, true);
  view.setUint32(38, 0, true);
  view.setUint32(42, offset, true);
  return header;
}

function createZipEndRecord(fileCount, centralSize, centralOffset) {
  const record = new Uint8Array(22);
  const view = new DataView(record.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(4, 0, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, fileCount, true);
  view.setUint16(10, fileCount, true);
  view.setUint32(12, centralSize, true);
  view.setUint32(16, centralOffset, true);
  view.setUint16(20, 0, true);
  return record;
}

function getCrc32(bytes) {
  const table = getCrc32Table();
  let crc = -1;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = (crc >>> 8) ^ table[(crc ^ bytes[index]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

function getCrc32Table() {
  if (getCrc32Table.cache) return getCrc32Table.cache;
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  getCrc32Table.cache = table;
  return table;
}

function getExcelColumnName(index) {
  let name = "";
  let column = Number(index) || 1;
  while (column > 0) {
    const modulo = (column - 1) % 26;
    name = String.fromCharCode(65 + modulo) + name;
    column = Math.floor((column - modulo) / 26);
  }
  return name;
}

function escapeHtmlText(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeXmlText(value) {
  return escapeHtmlText(value);
}

function sanitizeWeeklyGradeReportFilePart(value) {
  return String(value || "")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, "_") || "성적표";
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
    const visibleAnswers = getWeeklyGradeVisibleAnswers(section, student);
    const questionCount = visibleAnswers.length;
    const maxScore = sumWeeklyAnswerPoints(visibleAnswers, section);
    const computedGrade = submission ? computeWeeklySubmissionGrade(section, submission, visibleAnswers) : null;
    return { section, submission, computedGrade, visibleAnswers, questionCount, maxScore };
  });
  const submitted = sectionSummaries.filter((item) => item.submission);
  const score = submitted.reduce((sum, item) => sum + getWeeklySummarySectionScore(item), 0);
  const correctCount = submitted.reduce((sum, item) => sum + getWeeklySummarySectionCorrectCount(item), 0);
  const submittedMaxCorrect = submitted.reduce((sum, item) => sum + item.questionCount, 0);
  const maxCorrect = sectionSummaries.reduce((sum, item) => sum + item.questionCount, 0);
  const maxScore = sectionSummaries.reduce((sum, item) => sum + item.maxScore, 0);
  const subjectScores = {};
  sectionSummaries.forEach((item) => {
    subjectScores[item.section.subject] = item.submission
      ? {
          section: item.section,
          submission: item.submission,
          score: getWeeklySummarySectionScore(item),
          maxScore: item.maxScore,
          correctCount: getWeeklySummarySectionCorrectCount(item),
          questionCount: item.questionCount,
          status: "submitted",
          answerStatus: getWeeklySubmissionAnswerStatus(item.section, item.submission, item.visibleAnswers),
        }
      : { status: "missing", questionCount: item.questionCount, maxScore: item.maxScore };
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
    wrongCount: submitted.length ? Math.max(0, submittedMaxCorrect - correctCount) : "",
    subjectScores,
    latestSubmittedAt,
    status,
  };
}

function getWeeklySubmissionAnswerStatus(section, submission, visibleAnswers = []) {
  const requiredQuestionNumbers = visibleAnswers.map((answer) => Number(answer.questionNumber) || 0).filter(Boolean);
  const savedAnswers = (state.submissionAnswers || []).filter((answer) => answer.submissionId === submission.id);
  const savedByQuestion = new Map(savedAnswers.map((answer) => [Number(answer.questionNumber), answer]));
  const missingQuestions = requiredQuestionNumbers.filter((questionNumber) =>
    !normalizeExamAnswerChoice(savedByQuestion.get(questionNumber)?.selectedAnswer)
  );
  return {
    status: missingQuestions.length ? "incomplete" : "complete",
    savedCount: requiredQuestionNumbers.filter((questionNumber) =>
      normalizeExamAnswerChoice(savedByQuestion.get(questionNumber)?.selectedAnswer)
    ).length,
    requiredCount: requiredQuestionNumbers.length,
    missingQuestions,
  };
}

function computeWeeklySubmissionGrade(section, submission, visibleAnswers = []) {
  const savedAnswers = (state.submissionAnswers || [])
    .filter((answer) => answer.submissionId === submission.id)
    .sort((a, b) => Number(a.questionNumber) - Number(b.questionNumber));
  if (!visibleAnswers.length || savedAnswers.length < visibleAnswers.length) return null;
  const savedByQuestion = new Map(savedAnswers.map((answer) => [Number(answer.questionNumber), answer]));
  let score = 0;
  let correctCount = 0;
  for (const answerKey of visibleAnswers) {
    const questionNumber = Number(answerKey.questionNumber) || 0;
    const savedAnswer = savedByQuestion.get(questionNumber);
    const selectedAnswer = normalizeExamAnswerChoice(savedAnswer?.selectedAnswer);
    const correctAnswer = normalizeExamAnswerChoice(answerKey.correctAnswer);
    if (!savedAnswer || !selectedAnswer || !correctAnswer) return null;
    if (selectedAnswer === correctAnswer) {
      correctCount += 1;
      score += getWeeklyVisibleAnswerPointValue(answerKey, section, visibleAnswers);
    }
  }
  return {
    score: Math.round(score * 10) / 10,
    correctCount,
  };
}

function getWeeklySummarySectionScore(item) {
  return Number(item?.computedGrade?.score ?? item?.submission?.score) || 0;
}

function getWeeklySummarySectionCorrectCount(item) {
  return Number(item?.computedGrade?.correctCount ?? item?.submission?.correctCount) || 0;
}

function applyWeeklyGradeRanksByTrack(summaries) {
  const groups = new Map();
  summaries.forEach((summary) => {
    const track = getTeacherStudentRegisteredTrack(summary.student) || "미분류";
    if (!groups.has(track)) groups.set(track, []);
    groups.get(track).push(summary);
  });
  groups.forEach((items) => {
    const ranked = items
      .filter((summary) => summary.submittedCount > 0 && Number(summary.maxScore) > 0)
      .map((summary) => ({
        summary,
        percent: summary.maxScore ? Math.round(((Number(summary.score) || 0) / summary.maxScore) * 1000) / 10 : 0,
      }));
    const sorted = [...ranked].sort((a, b) => {
      const percentCompare = b.percent - a.percent;
      if (percentCompare) return percentCompare;
      const scoreCompare = (Number(b.summary.score) || 0) - (Number(a.summary.score) || 0);
      if (scoreCompare) return scoreCompare;
      const wrongCompare = (Number(a.summary.wrongCount) || 0) - (Number(b.summary.wrongCount) || 0);
      if (wrongCompare) return wrongCompare;
      return String(a.summary.student?.id || "").localeCompare(String(b.summary.student?.id || ""), "ko-KR", { numeric: true });
    });
    let previousPercent = null;
    let previousScore = null;
    let previousWrong = null;
    let previousRank = 0;
    sorted.forEach((item, index) => {
      const score = Number(item.summary.score) || 0;
      const wrong = Number(item.summary.wrongCount) || 0;
      const rank = item.percent === previousPercent && score === previousScore && wrong === previousWrong ? previousRank : index + 1;
      item.summary.rank = rank;
      item.summary.topPercent = calculateGradePercentile(rank, sorted.length);
      previousPercent = item.percent;
      previousScore = score;
      previousWrong = wrong;
      previousRank = rank;
    });
    items.forEach((summary) => {
      if (!sorted.some((item) => item.summary === summary)) {
        summary.rank = 0;
        summary.topPercent = 0;
      }
    });
  });
  return summaries;
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

function applyTeacherPreviewFinalSubjectRanks(summaries = []) {
  const groups = new Map();
  summaries.forEach((summary) => {
    const track = getTeacherStudentRegisteredTrack(summary.student) || "미분류";
    const subjects = getTeacherPreviewFinalSubjectHeadersForTrack(track);
    subjects.forEach((subject) => {
      const subjectScore = summary.subjectScores?.[subject];
      if (!subjectScore || subjectScore.status === "empty") return;
      const key = `${track}::${subject}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ summary, subjectScore });
    });
  });
  groups.forEach((items) => {
    const sorted = [...items].sort((a, b) => {
      const scoreCompare = (Number(b.subjectScore.score) || 0) - (Number(a.subjectScore.score) || 0);
      if (scoreCompare) return scoreCompare;
      return String(a.summary.student.id).localeCompare(String(b.summary.student.id), "ko-KR", { numeric: true });
    });
    let previousScore = null;
    let previousRank = 0;
    sorted.forEach((item, index) => {
      const score = Number(item.subjectScore.score) || 0;
      const rank = score === previousScore ? previousRank : index + 1;
      item.subjectScore.rank = rank;
      item.subjectScore.topPercent = calculateGradePercentile(rank, sorted.length);
      previousScore = score;
      previousRank = rank;
    });
  });
}

function sortGradeSummariesForDisplay(summaries = []) {
  return [...summaries].sort((a, b) => {
    const rankA = Number(a.rank) || 0;
    const rankB = Number(b.rank) || 0;
    if (rankA && rankB && rankA !== rankB) return rankA - rankB;
    if (rankA !== rankB) return rankA ? -1 : 1;
    const scoreCompare = (Number(b.score) || 0) - (Number(a.score) || 0);
    if (scoreCompare) return scoreCompare;
    const wrongCompare = (Number(a.wrongCount) || 0) - (Number(b.wrongCount) || 0);
    if (wrongCompare) return wrongCompare;
    return String(a.student?.id || "").localeCompare(String(b.student?.id || ""), "ko-KR", { numeric: true });
  });
}

function sortWeeklyGradeSummariesByTrack(summaries = []) {
  return [...summaries].sort((a, b) => {
    const trackCompare = String(getTeacherStudentRegisteredTrack(a.student) || "").localeCompare(
      String(getTeacherStudentRegisteredTrack(b.student) || ""),
      "ko-KR"
    );
    if (trackCompare) return trackCompare;
    const rankA = Number(a.rank) || 0;
    const rankB = Number(b.rank) || 0;
    if (rankA && rankB && rankA !== rankB) return rankA - rankB;
    if (rankA !== rankB) return rankA ? -1 : 1;
    return String(a.student?.id || "").localeCompare(String(b.student?.id || ""), "ko-KR", { numeric: true });
  });
}

function calculateGradePercentile(rank, total) {
  if (!rank || !total) return 0;
  if (total <= 1) return 0;
  return Math.round(((rank - 1) / (total - 1)) * 1000) / 10;
}

function formatSubjectScoreCell(subjectScore, summary = null) {
  if (!subjectScore) return "-";
  if (subjectScore.status === "missing") return "미제출";
  if (subjectScore.status === "empty") return "-";
  const score = Number(subjectScore.score) || 0;
  if (subjectScore.answerStatus?.status !== "incomplete") return String(score);
  const savedCount = Number(subjectScore.answerStatus.savedCount) || 0;
  const requiredCount = Number(subjectScore.answerStatus.requiredCount) || Number(subjectScore.questionCount) || 0;
  return el("div", { className: "weekly-score-cell answer-incomplete" }, [
    el("span", {}, String(score)),
    el("small", { className: "subtle" }, `답안 부족 ${savedCount}/${requiredCount}`),
    button("답안 초기화", "mini-btn danger", "button", () =>
      resetWeeklyExamSubjectSubmission(subjectScore.section, subjectScore.submission, summary?.student)
    ),
  ]);
}

function formatWeeklyWrongCountCell(summary) {
  if (!summary || !summary.maxCorrect) return "-";
  if (summary.wrongCount === "" || summary.wrongCount === null || summary.wrongCount === undefined) return "-";
  return String(Number(summary.wrongCount) || 0);
}

function formatFinalGradeTableSubjectHeader(subject, track = "") {
  return formatFinalGradeSubjectDisplayName(subject, normalizeCoastGuardTrack(track));
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
  const matchedSections = getExamSections(exam?.id || "").filter((section) => {
    const sectionTrack = normalizeCoastGuardTrack(section.track);
    const trackMatched = sectionTrack === studentTrack || sectionTrack === WEEKLY_EXAM_TRACK_ALL;
    const subjectMatched = sectionTrack !== WEEKLY_EXAM_TRACK_ALL || isWeeklySubjectAllowedForTrack(section.subject, studentTrack);
    return section.isActive !== false && trackMatched && subjectMatched && isWeeklyGradeSectionVisibleForTrack(section, studentTrack);
  });
  return preferTrackSpecificWeeklySections(matchedSections, studentTrack);
}

function isWeeklyGradeSectionVisibleForTrack(section, track) {
  const answers = getWeeklyGradeVisibleAnswers(section, track);
  const questionCount = Number(section.questionCount) || 0;
  if (isWeeklyQuestionTrackScopedSubject(section.subject)) return answers.length > 0;
  return answers.length > 0 && (!questionCount || answers.length >= questionCount);
}

function getWeeklyGradeVisibleAnswers(section, student) {
  const studentTrack = typeof student === "string" ? normalizeCoastGuardTrack(student) : getTeacherStudentRegisteredTrack(student);
  const questionCount = Number(section.questionCount) || 0;
  return getSectionAnswers(section.id)
    .filter((answer) => answer.correctAnswer)
    .filter((answer) => !questionCount || Number(answer.questionNumber) <= questionCount)
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
    studentName: record.studentName || record.student_name || record.name || "",
    track: normalizeCoastGuardTrack(record.track || record.studentTrack || record.student_track || ""),
    cohort: String(record.cohort || record.studentCohort || record.student_cohort || ""),
    isExternalFinalScore: record.isExternalFinalScore === true || record.is_external_final_score === true || record.external === true,
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

function getFinalMockGradeParticipants(cohort, students = [], records = []) {
  const registeredIds = new Set(students.map((student) => String(student.id)));
  const allStudentIds = new Set((state.students || []).map((student) => String(student.id)));
  const participants = [...students];
  records.forEach((record) => {
    const studentId = String(record.studentId || "").trim();
    if (!studentId || registeredIds.has(studentId)) return;
    if (allStudentIds.has(studentId)) return;
    if (record.cohort && String(record.cohort) !== String(cohort || "")) return;
    const track = normalizeCoastGuardTrack(record.track);
    if (gradeManagementTrackFilter && track !== gradeManagementTrackFilter) return;
    participants.push({
      id: studentId,
      name: record.studentName || studentId,
      track,
      className: "",
      finalScoreCohort: record.cohort || String(cohort || ""),
      isExternalFinalScore: true,
    });
    registeredIds.add(studentId);
  });
  return participants;
}

function createFinalExternalStudentFromRow(row, cohort = selectedStudentCohort) {
  const track = normalizeCoastGuardTrack(row.track);
  const label = String(row.name || row.id || "미등록 응시자").trim();
  const sourceId = String(row.id || label).trim();
  return {
    id: `external-${String(cohort || "all").trim() || "all"}-${slugFinalExternalValue(sourceId)}-${slugFinalExternalValue(track || "none")}`,
    name: label,
    track,
    className: "",
    finalScoreCohort: String(cohort || ""),
    isExternalFinalScore: true,
  };
}

function slugFinalExternalValue(value) {
  const text = String(value || "").trim().toLowerCase();
  const ascii = text.replace(/[^a-z0-9가-힣]+/gi, "-").replace(/^-+|-+$/g, "");
  return ascii || "unknown";
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
  const subjectScores = {};
  getGradeSubjectHeaders().forEach((subject) => {
    subjectScores[subject] = record.subjectScores[subject] || { status: "empty" };
  });
  const totals = calculateFinalSubjectTotalsForTrack(subjectScores, getTeacherStudentRegisteredTrack(student));
  const score = totals.submittedCount ? totals.score : Number(record.score) || 0;
  const maxScore = totals.submittedCount ? totals.maxScore : Number(record.maxScore) || 0;
  return {
    student,
    score,
    maxScore,
    wrongCount: totals.submittedCount
      ? totals.wrongCount
      : record.wrongCount !== "" && record.wrongCount !== null && record.wrongCount !== undefined
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

function calculateFinalSubjectTotalsForTrack(subjectScores = {}, track = "") {
  const subjects = getTeacherPreviewFinalSubjectHeadersForTrack(track);
  return subjects.reduce((totals, subject) => {
    const subjectScore = subjectScores[subject];
    if (!subjectScore || subjectScore.status === "empty") return totals;
    const score = Number(subjectScore.score) || 0;
    const maxScore = Number(subjectScore.maxScore) || 100;
    totals.score += score;
    totals.maxScore += maxScore;
    totals.wrongCount += Math.max(0, Math.round((maxScore - score) / 5));
    totals.submittedCount += 1;
    return totals;
  }, { score: 0, maxScore: 0, wrongCount: 0, submittedCount: 0 });
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

async function regradeSectionsAfterAnswerChange(sections) {
  const uniqueSections = [];
  const seen = new Set();
  (sections || []).forEach((section) => {
    if (!section?.id || seen.has(section.id)) return;
    seen.add(section.id);
    uniqueSections.push(section);
  });
  for (const section of uniqueSections) {
    const submissions = (state.examSubmissions || []).filter((submission) => submission.examSectionId === section.id && submission.status === "submitted");
    if (!submissions.length) continue;
    submissions.forEach((submission) => gradeSubmission(section, submission, getSubmissionAnswers(submission.id).map((answer) => answer.selectedAnswer)));
    saveState({ skipRemote: true });
    if (remoteStore) {
      await saveExamSubmissionsToRemote(submissions);
      await saveSubmissionAnswersToRemote(submissions.flatMap((submission) => getSubmissionAnswers(submission.id)));
    }
  }
}

function gradeSubmission(section, submission, selectedAnswers) {
  const answers = getSectionAnswers(section.id)
    .filter((answer) => !Number(section.questionCount) || Number(answer.questionNumber) <= Number(section.questionCount))
    .filter((answer) => !isWeeklyQuestionTrackScopedSubject(section.subject) || isWeeklyQuestionForTrack(answer, submission.track));
  const previousAnswers = getSubmissionAnswers(submission.id);
  const previousByQuestion = new Map(previousAnswers.map((answer) => [Number(answer.questionNumber), answer]));
  const selectedByQuestion = new Map(previousAnswers.map((answer) => [Number(answer.questionNumber), answer.selectedAnswer]));
  let score = 0;
  let correctCount = 0;
  state.submissionAnswers = (state.submissionAnswers || []).filter((answer) => answer.submissionId !== submission.id);
  answers.forEach((answer) => {
    const questionNumber = Number(answer.questionNumber) || 0;
    const previousAnswer = previousByQuestion.get(questionNumber);
    const selectedAnswer = normalizeExamAnswerChoice(selectedByQuestion.has(questionNumber)
      ? selectedByQuestion.get(questionNumber)
      : selectedAnswers[questionNumber - 1]);
    const correctAnswer = normalizeExamAnswerChoice(answer.correctAnswer);
    const isCorrect = Boolean(selectedAnswer && correctAnswer && selectedAnswer === correctAnswer);
    const pointsAwarded = isCorrect ? getWeeklyVisibleAnswerPointValue(answer, section, answers) : 0;
    if (isCorrect) correctCount += 1;
    score += pointsAwarded;
    state.submissionAnswers.push({
      id: previousAnswer?.id || createId(),
      submissionId: submission.id,
      questionNumber,
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
  const uniqueAnswers = getUniqueExamAnswersByQuestion(answers);
  if (!uniqueAnswers.length) return;
  const answerConflictKey = "exam_section_id,question_number";
  let rows = buildExamAnswerRows(uniqueAnswers, { includeId: false });
  let { error } = await remoteStore.from("exam_answers").upsert(rows, { onConflict: answerConflictKey });
  if (isMissingConflictConstraintError(error)) {
    await saveExamAnswersToRemoteWithoutQuestionConflict(uniqueAnswers);
    return;
  }
  if (isMissingColumnError(error, "target_tracks")) {
    const fallbackRows = rows.map(({ target_tracks, ...row }) => row);
    ({ error } = await remoteStore.from("exam_answers").upsert(fallbackRows, { onConflict: answerConflictKey }));
    if (isMissingConflictConstraintError(error)) {
      await saveExamAnswersToRemoteWithoutQuestionConflict(uniqueAnswers, { omitTargetTracks: true });
      return;
    }
  }
  if (isDuplicateConstraintError(error, "exam_answers_pkey")) {
    await syncRemoteExamAnswerIds(uniqueAnswers);
    rows = buildExamAnswerRows(uniqueAnswers);
    ({ error } = await remoteStore.from("exam_answers").upsert(rows, { onConflict: "id" }));
    if (isMissingColumnError(error, "target_tracks")) {
      const fallbackRows = rows.map(({ target_tracks, ...row }) => row);
      ({ error } = await remoteStore.from("exam_answers").upsert(fallbackRows, { onConflict: "id" }));
    }
  }
  if (error) throw error;
}

async function saveExamAnswersToRemoteWithoutQuestionConflict(answers, options = {}) {
  const uniqueAnswers = getUniqueExamAnswersByQuestion(answers);
  if (!remoteStore || !uniqueAnswers.length) return;
  const sectionIds = Array.from(new Set(uniqueAnswers.map((answer) => answer.examSectionId).filter(Boolean)));
  const { data, error: selectError } = await remoteStore
    .from("exam_answers")
    .select("id,exam_section_id,question_number")
    .in("exam_section_id", sectionIds);
  if (selectError) throw selectError;
  const remoteIds = new Map((data || []).map((row) => [
    `${row.exam_section_id}|||${Number(row.question_number) || 0}`,
    row.id,
  ]));
  for (const answer of uniqueAnswers) {
    const remoteId = remoteIds.get(`${answer.examSectionId}|||${Number(answer.questionNumber) || 0}`);
    if (remoteId) answer.id = remoteId;
    const [row] = buildExamAnswerRows([answer], { includeId: Boolean(answer.id) });
    const payload = options.omitTargetTracks
      ? (({ target_tracks, ...rest }) => rest)(row)
      : row;
    if (remoteId) {
      let { error } = await remoteStore.from("exam_answers").update(payload).eq("id", remoteId);
      if (isMissingColumnError(error, "target_tracks") && !options.omitTargetTracks) {
        await saveExamAnswersToRemoteWithoutQuestionConflict([answer], { omitTargetTracks: true });
        continue;
      }
      if (error) throw error;
    } else {
      let { error } = await remoteStore.from("exam_answers").insert(payload);
      if (isMissingColumnError(error, "target_tracks") && !options.omitTargetTracks) {
        await saveExamAnswersToRemoteWithoutQuestionConflict([answer], { omitTargetTracks: true });
        continue;
      }
      if (error) throw error;
    }
  }
}

function getUniqueExamAnswersByQuestion(answers) {
  const answersByQuestion = new Map();
  answers.forEach((answer) => {
    const questionNumber = Number(answer.questionNumber) || 0;
    if (!answer.examSectionId || questionNumber < 1) return;
    answersByQuestion.set(`${answer.examSectionId}|||${questionNumber}`, answer);
  });
  return Array.from(answersByQuestion.values());
}

function buildExamAnswerRows(answers, options = {}) {
  return answers.map((answer) => ({
    ...(options.includeId === false ? {} : { id: answer.id }),
    exam_section_id: answer.examSectionId,
    question_number: Number(answer.questionNumber) || 0,
    correct_answer: answer.correctAnswer || null,
    points: getWeeklyAnswerPointValue(answer, (state.examSections || []).find((section) => section.id === answer.examSectionId)),
    target_tracks: normalizeWeeklyQuestionTargetTracks(answer.targetTracks),
  }));
}

async function syncRemoteExamAnswerIds(answers) {
  if (!remoteStore || !answers.length) return;
  const sectionIds = Array.from(new Set(answers.map((answer) => answer.examSectionId).filter(Boolean)));
  if (!sectionIds.length) return;
  const { data, error } = await remoteStore
    .from("exam_answers")
    .select("id,exam_section_id,question_number")
    .in("exam_section_id", sectionIds);
  if (error) throw error;
  const remoteIds = new Map((data || []).map((row) => [
    `${row.exam_section_id}|||${Number(row.question_number) || 0}`,
    row.id,
  ]));
  answers.forEach((answer) => {
    const remoteId = remoteIds.get(`${answer.examSectionId}|||${Number(answer.questionNumber) || 0}`);
    if (remoteId) answer.id = remoteId;
  });
}

function isDuplicateConstraintError(error, constraintName) {
  return Boolean(error && error.code === "23505" && String(error.message || "").includes(constraintName));
}

function isMissingConflictConstraintError(error) {
  return Boolean(error && (error.code === "42P10" || String(error.message || "").includes("no unique or exclusion constraint")));
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
  if (APP_MODE === "teacher") {
    const response = await fetch("/api/exam-files", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files: rows }),
    });
    const data = await response.json().catch(() => ({ ok: false }));
    if (!response.ok || !data.ok) throw new Error(data.error || "exam_file_save_failed");
    return;
  }
  const { error } = await remoteStore.from("exam_files").upsert(rows, { onConflict: "id" });
  if (error) throw error;
}

async function deleteExamFilesFromRemote(fileIds) {
  if (!remoteStore || !fileIds.length) return;
  if (APP_MODE === "teacher") {
    const response = await fetch("/api/exam-files", {
      method: "DELETE",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: fileIds }),
    });
    const data = await response.json().catch(() => ({ ok: false }));
    if (!response.ok || !data.ok) throw new Error(data.error || "exam_file_delete_failed");
    return;
  }
  const { error } = await remoteStore.from("exam_files").delete().in("id", fileIds);
  if (error) throw error;
}

async function deleteExamAnswersFromRemote(sectionIds, answerIds = []) {
  if (!remoteStore) return;
  const cleanSectionIds = sectionIds.filter(Boolean);
  const cleanAnswerIds = answerIds.filter(Boolean);
  if (APP_MODE === "teacher") {
    const response = await fetch("/api/exam-answers", {
      method: "DELETE",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sectionIds: cleanSectionIds, ids: cleanAnswerIds }),
    });
    const data = await response.json().catch(() => ({ ok: false }));
    if (!response.ok || !data.ok) throw new Error(data.error || "exam_answer_delete_failed");
    return;
  }
  if (cleanSectionIds.length) {
    const { error } = await remoteStore.from("exam_answers").delete().in("exam_section_id", cleanSectionIds);
    if (!error) return;
    if (!cleanAnswerIds.length) throw error;
  }
  if (cleanAnswerIds.length) {
    const { error } = await remoteStore.from("exam_answers").delete().in("id", cleanAnswerIds);
    if (error) throw error;
  }
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

async function deleteExamSubmissionsFromRemote(submissionIds) {
  if (!remoteStore || !submissionIds.length) return;
  const cleanIds = submissionIds.filter(Boolean);
  if (!cleanIds.length) return;
  const { error: answerError } = await remoteStore.from("submission_answers").delete().in("submission_id", cleanIds);
  if (answerError) throw answerError;
  const { error } = await remoteStore.from("exam_submissions").delete().in("id", cleanIds);
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

