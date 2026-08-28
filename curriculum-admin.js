const curriculumAdminState = {
  loaded: false,
  loading: false,
  saving: false,
  togglingEnabled: false,
  error: "",
  subjects: [],
  selectedSubjectId: "",
  selectedStageId: "",
  usingBundledDefaults: false,
};

function renderCurriculumAdmin() {
  if (!hasTeacherPermission("curriculum.read")) return renderForbidden();
  if (!curriculumAdminState.loaded && !curriculumAdminState.loading) loadCurriculumAdmin();
  if (curriculumAdminState.loading && !curriculumAdminState.loaded) {
    return el("div", { className: "grid" }, [panel("커리큘럼 관리", [el("div", { className: "empty" }, "커리큘럼을 불러오는 중입니다.")])]);
  }
  if (curriculumAdminState.error && !curriculumAdminState.subjects.length) {
    return el("div", { className: "grid" }, [panel("커리큘럼 관리", [
      el("div", { className: "empty" }, curriculumAdminState.error),
      button("다시 불러오기", "btn secondary", "button", loadCurriculumAdmin),
    ])]);
  }

  const subject = getSelectedCurriculumAdminSubject();
  const stage = getSelectedCurriculumAdminStage(subject);
  return el("div", { className: "curriculum-admin-page" }, [
    el("section", { className: "curriculum-admin-heading" }, [
      el("div", {}, [
        el("span", {}, "CURRICULUM BUILDER"),
        el("h2", {}, "커리큘럼 관리"),
        el("p", {}, "과목과 회차, 회차별 강의를 구성하고 학생 화면 공개 여부를 설정합니다."),
      ]),
      hasTeacherPermission("curriculum.write")
        ? button("+ 과목 추가", "btn", "button", addCurriculumAdminSubject)
        : null,
    ].filter(Boolean)),
    renderCurriculumAdminReleaseControl(),
    curriculumAdminState.error ? el("div", { className: "curriculum-admin-alert" }, curriculumAdminState.error) : null,
    el("div", { className: "curriculum-admin-workspace" }, [
      renderCurriculumAdminSubjectRail(subject),
      subject ? renderCurriculumAdminEditor(subject, stage) : renderCurriculumAdminEmpty(),
    ]),
  ].filter(Boolean));
}

function renderCurriculumAdminReleaseControl() {
  const enabled = state.settings.curriculumQuestEnabled === true;
  const canWrite = hasTeacherPermission("curriculum.write");
  const toggleButton = button(
    curriculumAdminState.togglingEnabled ? "변경 중..." : enabled ? "기능 끄기" : "기능 켜기",
    `btn curriculum-admin-release-button ${enabled ? "danger" : ""}`,
    "button",
    () => updateCurriculumQuestEnabled(!enabled)
  );
  toggleButton.disabled = !canWrite || curriculumAdminState.togglingEnabled;
  return el("section", { className: `curriculum-admin-release ${enabled ? "enabled" : "disabled"}` }, [
    el("div", { className: "curriculum-admin-release-status" }, [
      el("span", {}, "STUDENT RELEASE"),
      el("strong", {}, `학생 공개 ${enabled ? "ON" : "OFF"}`),
      el("p", {}, enabled
        ? "수강생에게 커리큘럼 메뉴와 퀘스트 진행 기능이 공개되어 있습니다."
        : "현재 수강생 화면·직접 주소·진행도 API가 모두 차단되어 있습니다."),
    ]),
    toggleButton,
  ]);
}

async function updateCurriculumQuestEnabled(enabled) {
  if (!hasTeacherPermission("curriculum.write") || curriculumAdminState.togglingEnabled) return;
  curriculumAdminState.togglingEnabled = true;
  curriculumAdminState.error = "";
  render();
  try {
    const response = await fetch("/api/app-settings", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: { curriculumQuestEnabled: enabled === true } }),
    });
    const data = await response.json().catch(() => ({ ok: false }));
    if (!response.ok || !data.ok) throw new Error(data.error || "curriculum_release_update_failed");
    applyRemoteAppSettings(data.settings);
    notify(enabled ? "커리큘럼 퀘스트를 학생에게 공개했습니다." : "커리큘럼 퀘스트를 학생 화면에서 숨겼습니다.");
  } catch (error) {
    curriculumAdminState.error = curriculumAdminErrorMessage(error);
  } finally {
    curriculumAdminState.togglingEnabled = false;
    if (currentRoute === "curriculum-admin") render();
  }
}

function renderCurriculumAdminSubjectRail(selectedSubject) {
  return el("aside", { className: "curriculum-admin-subject-rail" }, [
    el("div", { className: "curriculum-admin-rail-title" }, [
      el("strong", {}, "과목"),
      el("span", {}, `${curriculumAdminState.subjects.length}개`),
    ]),
    el("div", { className: "curriculum-admin-subject-list" }, curriculumAdminState.subjects.map((subject) => button(
      "",
      `curriculum-admin-subject ${selectedSubject?.id === subject.id ? "active" : ""}`,
      "button",
      () => {
        curriculumAdminState.selectedSubjectId = subject.id;
        curriculumAdminState.selectedStageId = subject.stages?.[0]?.id || "";
        render();
      },
      [
        el("span", { className: `curriculum-subject-mark ${subject.tone}`, ariaHidden: "true" }, subject.shortName),
        el("span", {}, [
          el("strong", {}, subject.name),
          el("small", {}, `${subject.stages.length}회차 · ${countCurriculumAdminLectures(subject)}강`),
        ]),
        el("i", { className: subject.isPublished === false ? "draft" : "published" }, subject.isPublished === false ? "비공개" : "공개"),
      ]
    ))),
  ]);
}

function renderCurriculumAdminEditor(subject, selectedStage) {
  const canWrite = hasTeacherPermission("curriculum.write");
  return el("main", { className: "curriculum-admin-editor" }, [
    el("section", { className: "curriculum-admin-subject-settings" }, [
      el("div", { className: "curriculum-admin-section-head" }, [
        el("div", {}, [el("span", {}, "SUBJECT"), el("h3", {}, "과목 설정")]),
        el("div", { className: "curriculum-admin-actions" }, [
          canWrite ? button("과목 저장", "btn", "button", () => saveCurriculumAdminSubject(subject)) : null,
          canWrite ? button("과목 삭제", "btn danger", "button", () => deleteCurriculumAdminSubject(subject)) : null,
        ].filter(Boolean)),
      ]),
      el("div", { className: "curriculum-admin-fields" }, [
        curriculumAdminField("과목명", subject.name, "예: 형사법", (value) => { subject.name = value; }),
        curriculumAdminField("짧은 이름", subject.shortName, "최대 12자", (value) => { subject.shortName = value; }, 12),
        curriculumAdminSelectField("색상", subject.tone, [
          { value: "indigo", label: "네이비" },
          { value: "teal", label: "민트" },
          { value: "violet", label: "보라" },
        ], (value) => { subject.tone = value; }),
        curriculumAdminField("적용 직렬 (쉼표 구분)", subject.targetTracks.join(", "), "예: 경찰직 - 공채(순경) · 전체는 *", (value) => {
          subject.targetTracks = [...new Set(value.split(",").map((track) => track.trim()).filter(Boolean))];
        }, 500),
        curriculumAdminToggle("학생에게 공개", subject.isPublished !== false, (checked) => { subject.isPublished = checked; }),
      ]),
    ]),
    el("div", { className: "curriculum-admin-stage-workspace" }, [
      renderCurriculumAdminStageRail(subject, selectedStage, canWrite),
      selectedStage
        ? renderCurriculumAdminStageEditor(subject, selectedStage, canWrite)
        : el("div", { className: "curriculum-admin-empty" }, [el("strong", {}, "회차를 추가해주세요"), el("p", {}, "각 회차 안에 실제 수강할 강의를 등록할 수 있습니다.")]),
    ]),
  ]);
}

function renderCurriculumAdminStageRail(subject, selectedStage, canWrite) {
  return el("aside", { className: "curriculum-admin-stage-rail" }, [
    el("div", { className: "curriculum-admin-rail-title" }, [
      el("strong", {}, "회차"),
      el("span", {}, `${subject.stages.length}개`),
    ]),
    el("div", { className: "curriculum-admin-stage-list" }, subject.stages.map((stage, index) => button(
      "",
      `curriculum-admin-stage ${selectedStage?.id === stage.id ? "active" : ""}`,
      "button",
      () => {
        curriculumAdminState.selectedStageId = stage.id;
        render();
      },
      [
        el("span", {}, String(index + 1).padStart(2, "0")),
        el("span", {}, [el("strong", {}, stage.title), el("small", {}, `${stage.lectures.length}강 · 기출 분석/학습 · MBT`)]),
      ]
    ))),
    canWrite ? button("+ 회차 추가", "curriculum-admin-add-stage", "button", () => addCurriculumAdminStage(subject)) : null,
  ].filter(Boolean));
}

function renderCurriculumAdminStageEditor(subject, stage, canWrite) {
  const stageIndex = subject.stages.findIndex((item) => item.id === stage.id);
  return el("section", { className: "curriculum-admin-stage-editor" }, [
    el("div", { className: "curriculum-admin-section-head" }, [
      el("div", {}, [el("span", {}, `${stageIndex + 1}회차`), el("h3", {}, stage.title)]),
      canWrite ? el("div", { className: "curriculum-admin-actions compact" }, [
        button("↑", "mini-btn", "button", () => moveCurriculumAdminItem(subject.stages, stageIndex, -1, subject)),
        button("↓", "mini-btn", "button", () => moveCurriculumAdminItem(subject.stages, stageIndex, 1, subject)),
        button("회차 삭제", "mini-btn danger", "button", () => deleteCurriculumAdminStage(subject, stage)),
      ]) : null,
    ].filter(Boolean)),
    el("div", { className: "curriculum-admin-stage-fields" }, [
      curriculumAdminReadOnlyField("회차명", stage.title, "강의명에 따라 자동 작성됩니다."),
      curriculumAdminToggle("학생에게 공개", stage.isPublished !== false, (checked) => { stage.isPublished = checked; }),
      curriculumAdminToggle("기출 분석/학습 사용", stage.requiresWrapUp !== false, (checked) => { stage.requiresWrapUp = checked; }),
    ]),
    el("div", { className: "curriculum-admin-lecture-head" }, [
      el("div", {}, [el("strong", {}, "강의 구성"), el("span", {}, `${stage.lectures.length}강`)]),
      canWrite ? button("+ 강의 추가", "btn secondary", "button", () => addCurriculumAdminLecture(stage)) : null,
    ].filter(Boolean)),
    stage.lectures.length
      ? el("div", { className: "curriculum-admin-lecture-list" }, stage.lectures.map((lecture, index) => renderCurriculumAdminLectureRow(subject, stage, lecture, index, canWrite)))
      : el("div", { className: "curriculum-admin-empty lecture" }, [el("strong", {}, "등록된 강의가 없습니다."), el("p", {}, "강의 추가 버튼으로 이 회차의 체크리스트를 구성하세요.")]),
    stage.requiresWrapUp === false ? el("div", { className: "curriculum-admin-fixed-tasks disabled" }, [
      el("span", {}, "오리엔테이션 회차"),
      el("strong", {}, "기출 분석/학습 없음"),
    ]) : el("div", { className: "curriculum-admin-fixed-tasks" }, [
      el("span", {}, "회차 공통 과업"),
      el("strong", {}, subject.id === "criminal-law" ? "기출 분석 및 OX 학습" : "기출 분석 및 단권화"),
      el("strong", {}, "MBT 풀이"),
    ]),
    canWrite ? button("변경사항 저장", "btn curriculum-admin-save-bottom", "button", () => saveCurriculumAdminSubject(subject)) : null,
  ]);
}

function renderCurriculumAdminLectureRow(subject, stage, lecture, index, canWrite) {
  const numberInput = el("input", { type: "text", value: lecture.no, maxLength: 30, disabled: !canWrite, ariaLabel: `${index + 1}번째 강의 번호` });
  const titleInput = el("input", { type: "text", value: lecture.title, maxLength: 240, disabled: !canWrite, ariaLabel: `${index + 1}번째 강의 제목` });
  numberInput.addEventListener("change", () => { lecture.no = numberInput.value.trim(); });
  titleInput.addEventListener("change", () => {
    lecture.title = titleInput.value.trim();
    stage.title = deriveCurriculumAdminStageTitle(stage);
    render();
  });
  return el("div", { className: "curriculum-admin-lecture-row" }, [
    el("span", { className: "curriculum-admin-drag-index" }, String(index + 1).padStart(2, "0")),
    numberInput,
    titleInput,
    canWrite ? el("div", { className: "curriculum-admin-row-actions" }, [
      button("↑", "mini-btn", "button", () => moveCurriculumAdminItem(stage.lectures, index, -1, subject)),
      button("↓", "mini-btn", "button", () => moveCurriculumAdminItem(stage.lectures, index, 1, subject)),
      button("삭제", "mini-btn danger", "button", () => {
        stage.lectures.splice(index, 1);
        stage.title = deriveCurriculumAdminStageTitle(stage, stage.title);
        render();
      }),
    ]) : null,
  ].filter(Boolean));
}

function curriculumAdminField(label, value, placeholder, onChange, maxLength = 60) {
  const control = el("input", { type: "text", value, placeholder, maxLength, disabled: !hasTeacherPermission("curriculum.write") });
  control.addEventListener("change", () => onChange(control.value.trim()));
  return el("label", { className: "curriculum-admin-field" }, [el("span", {}, label), control]);
}

function curriculumAdminReadOnlyField(label, value, title) {
  const control = el("input", { type: "text", value, readOnly: true, title, ariaLabel: `${label} (${title})` });
  return el("label", { className: "curriculum-admin-field" }, [el("span", {}, label), control]);
}

function curriculumAdminSelectField(label, value, options, onChange) {
  const control = el("select", { disabled: !hasTeacherPermission("curriculum.write") }, options.map((option) => el("option", { value: option.value, selected: option.value === value }, option.label)));
  control.addEventListener("change", () => { onChange(control.value); render(); });
  return el("label", { className: "curriculum-admin-field" }, [el("span", {}, label), control]);
}

function curriculumAdminToggle(label, checked, onChange) {
  const control = el("input", { type: "checkbox", checked, disabled: !hasTeacherPermission("curriculum.write") });
  control.addEventListener("change", () => { onChange(control.checked); render(); });
  return el("label", { className: "curriculum-admin-toggle" }, [control, el("span", {}, label)]);
}

function renderCurriculumAdminEmpty() {
  return el("div", { className: "curriculum-admin-empty subject" }, [el("strong", {}, "과목이 없습니다."), el("p", {}, "과목을 추가해 첫 커리큘럼을 만들어주세요.")]);
}

async function loadCurriculumAdmin() {
  curriculumAdminState.loading = true;
  curriculumAdminState.error = "";
  render();
  try {
    await loadAppSettingsFromApi();
    const data = await curriculumAdminRequest(null, true);
    curriculumAdminState.subjects = Array.isArray(data.subjects) && data.subjects.length
      ? data.subjects.map(normalizeCurriculumAdminSubject)
      : buildBundledCurriculumAdminCatalog();
    curriculumAdminState.usingBundledDefaults = !Array.isArray(data.subjects) || !data.subjects.length;
    curriculumAdminState.selectedSubjectId = curriculumAdminState.subjects[0]?.id || "";
    curriculumAdminState.selectedStageId = curriculumAdminState.subjects[0]?.stages?.[0]?.id || "";
  } catch (error) {
    curriculumAdminState.error = curriculumAdminErrorMessage(error);
  } finally {
    curriculumAdminState.loading = false;
    curriculumAdminState.loaded = true;
    if (currentRoute === "curriculum-admin") render();
  }
}

function buildBundledCurriculumAdminCatalog() {
  return CURRICULUM_QUEST_SUBJECTS.map((subject, subjectIndex) => normalizeCurriculumAdminSubject({
    ...subject,
    sortOrder: subjectIndex + 1,
    isPublished: true,
    targetTracks: Array.isArray(subject.targetTracks) ? subject.targetTracks : ["경찰직 - 공채(순경)"],
    stages: subject.stageTitles.map((title, index) => ({
      id: `${subject.id}-stage-${index + 1}`,
      stageNumber: index + 1,
      title,
      sortOrder: index + 1,
      isPublished: true,
      requiresWrapUp: !/^(?:전과목)?OT(?:-|$)/i.test(String(window.CURRICULUM_QUEST_LECTURES?.[subject.id]?.[String(index + 1)]?.[0]?.title || "")),
      lectures: (window.CURRICULUM_QUEST_LECTURES?.[subject.id]?.[String(index + 1)] || []).map((lecture, lectureIndex) => ({
        id: `${subject.id}-stage-${index + 1}-lecture-${lectureIndex + 1}`,
        no: lecture.no,
        title: lecture.title,
        sortOrder: lectureIndex + 1,
      })),
    })),
  }));
}

function normalizeCurriculumAdminSubject(subject) {
  const stages = Array.isArray(subject.stages) ? subject.stages : [];
  return {
    id: subject.id,
    name: subject.name || "새 과목",
    shortName: subject.shortName || "과목",
    tone: subject.tone || "indigo",
    sortOrder: Number(subject.sortOrder) || 1,
    isPublished: subject.isPublished !== false,
    targetTracks: Array.isArray(subject.targetTracks) ? subject.targetTracks : ["경찰직 - 공채(순경)"],
    stages: stages.map((stage, stageIndex) => {
      const lectures = (Array.isArray(stage.lectures) ? stage.lectures : []).map((lecture, lectureIndex) => ({
        id: lecture.id || createCurriculumAdminId("lecture"),
        no: lecture.no || `${lectureIndex + 1}강`,
        title: lecture.title || "새 강의",
        sortOrder: lectureIndex + 1,
      }));
      return {
        id: stage.id || createCurriculumAdminId(`${subject.id}-stage`),
        stageNumber: stageIndex + 1,
        title: deriveCurriculumAdminStageTitle({ lectures }, stage.title || `${stageIndex + 1}회차`),
        sortOrder: stageIndex + 1,
        isPublished: stage.isPublished !== false,
        requiresWrapUp: stage.requiresWrapUp !== false,
        lectures,
      };
    }),
  };
}

function getSelectedCurriculumAdminSubject() {
  return curriculumAdminState.subjects.find((subject) => subject.id === curriculumAdminState.selectedSubjectId) || curriculumAdminState.subjects[0] || null;
}

function getSelectedCurriculumAdminStage(subject) {
  return subject?.stages?.find((stage) => stage.id === curriculumAdminState.selectedStageId) || subject?.stages?.[0] || null;
}

function addCurriculumAdminSubject() {
  const subject = normalizeCurriculumAdminSubject({
    id: createCurriculumAdminId("subject"),
    name: "새 과목",
    shortName: "과목",
    tone: "indigo",
    sortOrder: curriculumAdminState.subjects.length + 1,
    isPublished: false,
    targetTracks: ["경찰직 - 공채(순경)"],
    stages: [],
  });
  curriculumAdminState.subjects.push(subject);
  curriculumAdminState.selectedSubjectId = subject.id;
  curriculumAdminState.selectedStageId = "";
  render();
}

function addCurriculumAdminStage(subject) {
  const stage = {
    id: createCurriculumAdminId(`${subject.id}-stage`),
    stageNumber: subject.stages.length + 1,
    title: `${subject.stages.length + 1}회차`,
    sortOrder: subject.stages.length + 1,
    isPublished: true,
    requiresWrapUp: true,
    lectures: [],
  };
  subject.stages.push(stage);
  curriculumAdminState.selectedStageId = stage.id;
  render();
}

function addCurriculumAdminLecture(stage) {
  stage.lectures.push({
    id: createCurriculumAdminId("lecture"),
    no: `${stage.lectures.length + 1}강`,
    title: "새 강의",
    sortOrder: stage.lectures.length + 1,
  });
  stage.title = deriveCurriculumAdminStageTitle(stage);
  render();
}

function moveCurriculumAdminItem(items, index, offset, subject) {
  const nextIndex = index + offset;
  if (nextIndex < 0 || nextIndex >= items.length) return;
  [items[index], items[nextIndex]] = [items[nextIndex], items[index]];
  items.forEach((item, itemIndex) => {
    item.sortOrder = itemIndex + 1;
    if (Object.prototype.hasOwnProperty.call(item, "stageNumber")) item.stageNumber = itemIndex + 1;
  });
  if (subject) subject.stages.forEach((stage, stageIndex) => {
    stage.stageNumber = stageIndex + 1;
    stage.sortOrder = stageIndex + 1;
    stage.title = deriveCurriculumAdminStageTitle(stage, stage.title);
  });
  render();
}

function deleteCurriculumAdminStage(subject, stage) {
  if (!confirm(`'${stage.title}' 회차를 삭제할까요?`)) return;
  const index = subject.stages.findIndex((item) => item.id === stage.id);
  subject.stages.splice(index, 1);
  subject.stages.forEach((item, itemIndex) => { item.stageNumber = itemIndex + 1; item.sortOrder = itemIndex + 1; });
  curriculumAdminState.selectedStageId = subject.stages[Math.max(0, index - 1)]?.id || "";
  render();
}

async function saveCurriculumAdminSubject(subject) {
  if (curriculumAdminState.saving) return;
  subject.stages.forEach((stage) => { stage.title = deriveCurriculumAdminStageTitle(stage, stage.title); });
  if (!subject.name.trim() || !subject.shortName.trim()) return notify("과목명과 짧은 이름을 입력해주세요.");
  if (subject.stages.some((stage) => !stage.title.trim() || stage.lectures.some((lecture) => !lecture.no.trim() || !lecture.title.trim()))) {
    return notify("비어 있는 회차명 또는 강의 정보를 확인해주세요.");
  }
  curriculumAdminState.saving = true;
  render();
  try {
    const subjectsToSave = curriculumAdminState.usingBundledDefaults ? curriculumAdminState.subjects : [subject];
    for (const item of subjectsToSave) await curriculumAdminRequest({ action: "save_subject", subject: serializeCurriculumAdminSubject(item) });
    curriculumAdminState.usingBundledDefaults = false;
    curriculumAdminState.error = "";
    notify("커리큘럼을 저장했습니다.");
  } catch (error) {
    curriculumAdminState.error = curriculumAdminErrorMessage(error);
    notify(curriculumAdminState.error);
  } finally {
    curriculumAdminState.saving = false;
    render();
  }
}

async function deleteCurriculumAdminSubject(subject) {
  if (!confirm(`'${subject.name}' 과목을 삭제할까요? 학생 화면에서는 더 이상 표시되지 않습니다.`)) return;
  curriculumAdminState.saving = true;
  try {
    if (curriculumAdminState.usingBundledDefaults) {
      const remaining = curriculumAdminState.subjects.filter((item) => item.id !== subject.id);
      for (const item of remaining) await curriculumAdminRequest({ action: "save_subject", subject: serializeCurriculumAdminSubject(item) });
    } else {
      await curriculumAdminRequest({ action: "delete_subject", subjectId: subject.id });
    }
    curriculumAdminState.subjects = curriculumAdminState.subjects.filter((item) => item.id !== subject.id);
    curriculumAdminState.usingBundledDefaults = false;
    curriculumAdminState.selectedSubjectId = curriculumAdminState.subjects[0]?.id || "";
    curriculumAdminState.selectedStageId = curriculumAdminState.subjects[0]?.stages?.[0]?.id || "";
    notify("과목을 삭제했습니다.");
  } catch (error) {
    curriculumAdminState.error = curriculumAdminErrorMessage(error);
    notify(curriculumAdminState.error);
  } finally {
    curriculumAdminState.saving = false;
    render();
  }
}

function serializeCurriculumAdminSubject(subject) {
  return {
    ...subject,
    totalStages: subject.stages.length,
    stages: subject.stages.map((stage, stageIndex) => ({
      ...stage,
      title: deriveCurriculumAdminStageTitle(stage, stage.title),
      stageNumber: stageIndex + 1,
      sortOrder: stageIndex + 1,
      lectures: stage.lectures.map((lecture, lectureIndex) => ({ ...lecture, sortOrder: lectureIndex + 1 })),
    })),
  };
}

function deriveCurriculumAdminStageTitle(stage, fallback = "") {
  const title = (Array.isArray(stage?.lectures) ? stage.lectures : [])
    .map((lecture) => String(lecture?.title || "").trim())
    .filter(Boolean)
    .join(", ");
  return title || String(fallback || "").trim();
}

async function curriculumAdminRequest(payload, adminList = false) {
  const response = await fetch(adminList ? "/api/curriculum?admin=1" : "/api/curriculum", {
    method: payload ? "POST" : "GET",
    credentials: "same-origin",
    headers: payload ? { "Content-Type": "application/json" } : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) {
    const error = new Error(data.error || "curriculum_request_failed");
    error.status = response.status;
    throw error;
  }
  return data;
}

function createCurriculumAdminId(prefix) {
  const suffix = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${String(prefix || "item").replace(/[^a-zA-Z0-9_-]/g, "-")}-${suffix}`;
}

function countCurriculumAdminLectures(subject) {
  return subject.stages.reduce((total, stage) => total + stage.lectures.length, 0);
}

function curriculumAdminErrorMessage(error) {
  if (error?.status === 401) return "관리자 로그인이 필요합니다.";
  if (error?.status === 403) return "커리큘럼 관리 권한이 없습니다.";
  if (error?.message === "service_role_not_configured") return "커리큘럼 저장소가 아직 연결되지 않았습니다.";
  return "커리큘럼을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.";
}
