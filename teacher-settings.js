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
      const deleteButton = button("삭제", "mini-btn danger", "button", () => deleteTrackOption(option));
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
          deleteButton,
        ]),
      ]);
    }),
    el("div", { className: "track-option-row fixed" }, [
      el("div", { className: "track-option-order" }, String(draftOptions.length + 1)),
      el("div", { className: "track-option-name" }, [
        el("strong", {}, "기타"),
        el("span", {}, "맨 아래 고정"),
      ]),
      renderDisabledTrackOptionActions(),
    ]),
  ]);
  const saveButton = button("저장", "btn", "button", saveTrackOptionDraft);
  saveButton.disabled = !isDirty;
  const resetButton = button("변경 취소", "btn secondary", "button", resetTrackOptionDraft);
  resetButton.disabled = !isDirty;

  return panel("직렬 항목 관리", [
    form,
    el("p", { className: "subtle" }, "이 순서대로 학생 등록 화면의 직렬 드롭다운에 표시됩니다. 기타는 항상 맨 아래에 고정됩니다."),
    optionList,
    el("div", { className: "track-option-savebar" }, [
      el("span", { className: isDirty ? "badge pending" : "badge approved" }, isDirty ? "저장 전 변경사항 있음" : "저장됨"),
      saveButton,
      resetButton,
    ]),
  ]);
}

function renderDisabledTrackOptionActions() {
  const upButton = button("↑", "mini-btn", "button");
  const downButton = button("↓", "mini-btn", "button");
  const deleteButton = button("삭제", "mini-btn danger", "button");
  upButton.disabled = true;
  downButton.disabled = true;
  deleteButton.disabled = true;
  return el("div", { className: "track-option-actions" }, [upButton, downButton, deleteButton]);
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
  const previousOptions = getCoastGuardTrackOptions().filter((option) => option !== "기타");
  const nextSet = new Set(nextOptions);
  const deletedOptions = previousOptions.filter((option) => !nextSet.has(option));
  state.settings.trackOptions = nextOptions;
  saveState({ skipRemote: true });

  if (remoteStore) {
    try {
      await saveTrackOptionsToRemote(nextOptions, deletedOptions);
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
  const cohortInput = input("cohort", "number", "18", selectedStudentCohort || DEFAULT_STUDENT_COHORT);
  const roleInput = input("role", "text", "예: 데스크, 담임, 장학생");
  const memoInput = textarea("memo", "메모 (선택)");
  const form = el("form", { className: "form-grid" }, [
    field("기수", cohortInput),
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

  const rows = getAllActiveManagers().map((manager) =>
    el("tr", {}, [
      el("td", {}, manager.name),
      el("td", {}, manager.cohort ? `${manager.cohort}기` : `${DEFAULT_STUDENT_COHORT}기`),
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
      ["이름", "기수", "역할", "메모", "등록일", "관리"],
      rows.length ? rows : [el("tr", {}, [el("td", { colSpan: 6 }, el("div", { className: "empty table-empty" }, "등록된 담당자가 없습니다."))])]
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

function getActiveManagers(cohort = "") {
  const selectedCohort = String(cohort || selectedStudentCohort || DEFAULT_STUDENT_COHORT).trim();
  return getAllActiveManagers()
    .filter((manager) => !selectedCohort || String(manager.cohort || DEFAULT_STUDENT_COHORT) === selectedCohort);
}

function getAllActiveManagers() {
  return (state.managers || [])
    .filter((manager) => manager.isActive !== false && String(manager.name || "").trim())
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ko-KR"));
}

function managerNameControl() {
  const managers = getActiveManagers();
  const defaultName = String(teacherAuth.user?.username || "").trim();
  const options = managers.map((manager) => el("option", { value: manager.name }, manager.role ? `${manager.name} (${manager.role})` : manager.name));
  const node = el("select", { name: "managerName", required: true }, [
    el("option", { value: "" }, `${selectedStudentCohort || DEFAULT_STUDENT_COHORT}기 담당자 선택`),
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
  const cohort = String(data.cohort || DEFAULT_STUDENT_COHORT).trim();
  const role = String(data.role || "").trim();
  const memo = String(data.memo || "").trim();
  state.managers = state.managers || [];
  const existing = state.managers.find((manager) =>
    manager.isActive !== false &&
    manager.name === name &&
    String(manager.cohort || DEFAULT_STUDENT_COHORT) === cohort
  );
  if (existing) {
    existing.cohort = cohort;
    existing.role = role;
    existing.memo = memo;
    return { created: false, manager: existing };
  }
  const manager = {
    id: createId(),
    name,
    cohort,
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
    cohort: manager.cohort || DEFAULT_STUDENT_COHORT,
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

