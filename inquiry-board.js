const INQUIRY_CATEGORIES = ["이용 문의", "플래너", "스터디카페", "타이머", "커리큘럼", "게시판", "알림", "계정·기기"];

const studentInquiryState = {
  studentId: "",
  mode: "list",
  inquiries: [],
  detail: null,
  category: "",
  status: "",
  search: "",
  loading: false,
  loaded: false,
  error: "",
  editing: null,
};

const inquiryAdminState = {
  mode: "list",
  inquiries: [],
  detail: null,
  category: "",
  status: "",
  search: "",
  loading: false,
  loaded: false,
  error: "",
};

function renderStudentInquiryBoard() {
  const student = getAuthedStudent();
  if (!student || getStudentCategory(student) !== "lecture") {
    return el("div", { className: "grid student-view" }, [
      panel("문의하기", [el("div", { className: "empty" }, "인터넷 수강생만 이용할 수 있습니다.")]),
    ]);
  }
  if (studentInquiryState.studentId !== student.id) resetStudentInquiryState(student.id);
  if (!studentInquiryState.loaded && !studentInquiryState.loading) loadStudentInquiries();
  if (studentInquiryState.mode === "form") return renderStudentInquiryForm();
  if (studentInquiryState.mode === "detail") return renderStudentInquiryDetail();
  return renderStudentInquiryList();
}

function openStudentInquiryList() {
  const student = getAuthedStudent();
  if (student && studentInquiryState.studentId !== student.id) resetStudentInquiryState(student.id);
  studentInquiryState.editing = null;
  studentInquiryState.detail = null;
  studentInquiryState.mode = "list";
  navigate("inquiry-board");
}

function resetStudentInquiryState(studentId) {
  Object.assign(studentInquiryState, {
    studentId,
    mode: "list",
    inquiries: [],
    detail: null,
    category: "",
    status: "",
    search: "",
    loading: false,
    loaded: false,
    error: "",
    editing: null,
  });
}

async function loadStudentInquiries() {
  studentInquiryState.loading = true;
  studentInquiryState.error = "";
  try {
    const data = await requestInquiry("list", inquiryFilters(studentInquiryState));
    studentInquiryState.inquiries = Array.isArray(data.inquiries) ? data.inquiries : [];
  } catch (error) {
    studentInquiryState.error = inquiryErrorMessage(error);
  } finally {
    studentInquiryState.loading = false;
    studentInquiryState.loaded = true;
    if (currentRoute === "inquiry-board") render();
  }
}

function renderStudentInquiryList() {
  return el("div", { className: "student-view inquiry-page" }, [
    button("← 자주 묻는 질문", "inquiry-back-button", "button", () => navigate("faq")),
    el("header", { className: "inquiry-head" }, [
      el("span", {}, "PRIVATE SUPPORT"),
      el("h2", {}, "문의하기"),
      el("p", {}, "문의 내용은 본인과 선생님만 확인할 수 있으며 자유 게시판에는 표시되지 않습니다."),
    ]),
    el("section", { className: "inquiry-list-section" }, [
      el("div", { className: "inquiry-list-head" }, [
        el("strong", {}, "내 문의"),
        el("span", {}, studentInquiryState.loading ? "불러오는 중" : `${studentInquiryState.inquiries.length}개`),
      ]),
      studentInquiryState.loading
        ? renderStudentInquiryListLoading()
        : studentInquiryState.error
          ? renderInquiryError(studentInquiryState.error, refreshStudentInquiries)
          : studentInquiryState.inquiries.length
            ? el("div", { className: "inquiry-list" }, studentInquiryState.inquiries.map(renderStudentInquiryCard))
            : renderInquiryState("아직 등록한 문의가 없습니다."),
    ]),
    button("+ 새 문의", "inquiry-compose-button", "button", () => openStudentInquiryForm()),
  ]);
}

function renderStudentInquiryListLoading() {
  return el("div", { className: "inquiry-skeleton-list", role: "status", ariaLabel: "문의를 불러오는 중입니다." }, [
    ...Array.from({ length: 3 }, () => el("div", { className: "inquiry-skeleton-card", ariaHidden: "true" }, [
      el("span", { className: "inquiry-skeleton-status" }),
      el("span", { className: "inquiry-skeleton-title" }),
      el("span", { className: "inquiry-skeleton-body" }),
      el("span", { className: "inquiry-skeleton-date" }),
    ])),
  ]);
}

function renderStudentInquiryCard(inquiry) {
  return button("", "inquiry-card", "button", () => openStudentInquiry(inquiry.id), [
    el("div", { className: "inquiry-card-tags" }, [renderInquiryStatusBadge(inquiry.status)]),
    el("strong", {}, inquiry.title),
    el("p", {}, compactInquiryText(inquiry.body)),
    el("time", {}, formatInquiryDate(inquiry.updatedAt || inquiry.createdAt)),
  ]);
}

function renderInquiryCategoryFilters(stateObject, admin) {
  return el("nav", { className: "inquiry-filter-scroll", ariaLabel: "문의 카테고리" }, [
    renderInquiryFilterButton("전체", !stateObject.category, () => setInquiryFilter(stateObject, "category", "", admin)),
    ...INQUIRY_CATEGORIES.map((category) => renderInquiryFilterButton(category, stateObject.category === category, () => setInquiryFilter(stateObject, "category", category, admin))),
  ]);
}

function renderInquiryStatusFilters(stateObject, admin) {
  return el("div", { className: "inquiry-status-filters" }, [
    renderInquiryFilterButton("전체", !stateObject.status, () => setInquiryFilter(stateObject, "status", "", admin)),
    renderInquiryFilterButton("답변 대기", stateObject.status === "open", () => setInquiryFilter(stateObject, "status", "open", admin)),
    renderInquiryFilterButton("답변 완료", stateObject.status === "answered", () => setInquiryFilter(stateObject, "status", "answered", admin)),
  ]);
}

function renderInquiryFilterButton(label, active, onClick) {
  const filterButton = button(label, `inquiry-filter-button${active ? " active" : ""}`, "button", onClick);
  filterButton.setAttribute("aria-pressed", String(active));
  return filterButton;
}

function setInquiryFilter(stateObject, key, value, admin) {
  stateObject[key] = value;
  if (admin) refreshInquiryAdmin();
  else refreshStudentInquiries();
}

async function refreshStudentInquiries() {
  studentInquiryState.loaded = false;
  studentInquiryState.loading = true;
  studentInquiryState.error = "";
  if (currentRoute === "inquiry-board" && studentInquiryState.mode === "list") render();
  await loadStudentInquiries();
}

function openStudentInquiryForm(inquiry = null) {
  studentInquiryState.editing = inquiry;
  studentInquiryState.mode = "form";
  render();
  scrollAppToTop();
}

function renderStudentInquiryForm() {
  const editing = studentInquiryState.editing;
  const titleInput = input("title", "text", "문의 제목을 입력하세요", editing?.title || "");
  titleInput.maxLength = 120;
  const bodyInput = el("textarea", { name: "body", rows: 10, maxLength: 5000, placeholder: "사용한 기능과 발생한 상황을 구체적으로 적어주세요." }, editing?.body || "");
  const submitButton = button(editing ? "문의 수정" : "문의 등록", "btn", "submit");
  const form = el("form", { className: "inquiry-form" }, [
    field("제목", titleInput, "", "2~120자로 입력해주세요."),
    field("내용", bodyInput, "", "개인정보나 연락처는 작성하지 마세요."),
    el("div", { className: "inquiry-form-actions" }, [button("취소", "btn secondary", "button", closeStudentInquiryForm), submitButton]),
  ]);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form).entries());
    if (String(values.title || "").trim().length < 2 || String(values.body || "").trim().length < 2) return notify("제목과 문의 내용을 확인해주세요.");
    await runInquiryAction(submitButton, editing ? "수정 중" : "등록 중", async () => {
      const data = await requestInquiry(editing ? "update" : "create", {
        ...(editing ? { inquiryId: editing.id } : {}),
        category: editing?.category || INQUIRY_CATEGORIES[0],
        title: values.title,
        body: values.body,
      });
      studentInquiryState.editing = null;
      await openStudentInquiry(editing?.id || data.inquiryId);
      notify(editing ? "문의를 수정했습니다." : "문의를 등록했습니다.");
    });
  });
  return el("div", { className: "student-view inquiry-page inquiry-form-page" }, [
    button("← 문의 목록", "inquiry-back-button", "button", closeStudentInquiryForm),
    el("section", { className: "inquiry-surface" }, [
      el("span", { className: "inquiry-kicker" }, editing ? "EDIT INQUIRY" : "NEW INQUIRY"),
      el("h2", {}, editing ? "문의 수정" : "새 문의"),
      el("p", {}, "작성한 내용은 본인과 선생님만 확인할 수 있습니다."),
      form,
    ]),
  ]);
}

function closeStudentInquiryForm() {
  studentInquiryState.editing = null;
  studentInquiryState.mode = studentInquiryState.detail ? "detail" : "list";
  render();
}

async function openStudentInquiry(inquiryId) {
  studentInquiryState.mode = "detail";
  studentInquiryState.detail = null;
  studentInquiryState.loading = true;
  render();
  try {
    const data = await requestInquiry("detail", { inquiryId });
    studentInquiryState.detail = { inquiry: data.inquiry, messages: data.messages || [] };
    studentInquiryState.error = "";
  } catch (error) {
    studentInquiryState.error = inquiryErrorMessage(error);
  } finally {
    studentInquiryState.loading = false;
    if (currentRoute === "inquiry-board") {
      render();
      scrollAppToTop();
    }
  }
}

function renderStudentInquiryDetail() {
  if (studentInquiryState.loading) return renderInquiryPageShell(renderInquiryState("문의를 불러오는 중입니다."));
  if (!studentInquiryState.detail) return renderInquiryPageShell(renderInquiryError(studentInquiryState.error || "문의를 찾을 수 없습니다.", closeStudentInquiryDetail));
  const { inquiry, messages } = studentInquiryState.detail;
  const messageInput = el("textarea", { rows: 3, maxLength: 2000, placeholder: "문의에 덧붙일 내용을 입력해주세요." });
  const messageButton = button("내용 추가", "btn", "button", async () => {
    if (!messageInput.value.trim()) return notify("추가할 내용을 입력해주세요.");
    await runInquiryAction(messageButton, "등록 중", async () => {
      await requestInquiry("message_create", { inquiryId: inquiry.id, body: messageInput.value });
      await openStudentInquiry(inquiry.id);
      notify("문의 내용을 추가했습니다.");
    });
  });
  return el("div", { className: "student-view inquiry-page inquiry-detail-page" }, [
    button("← 문의 목록", "inquiry-back-button", "button", closeStudentInquiryDetail),
    el("article", { className: "inquiry-surface" }, [
      el("div", { className: "inquiry-card-tags" }, [renderInquiryStatusBadge(inquiry.status)]),
      el("h2", {}, inquiry.title),
      el("time", {}, formatInquiryDate(inquiry.createdAt)),
      el("div", { className: "inquiry-body" }, inquiry.body),
      el("div", { className: "inquiry-detail-actions" }, [
        button("수정", "mini-btn", "button", () => openStudentInquiryForm(inquiry)),
        button("삭제", "mini-btn danger", "button", () => deleteStudentInquiry(inquiry)),
      ]),
    ]),
    el("section", { className: "inquiry-surface inquiry-conversation" }, [
      el("h3", {}, `답변 및 추가 내용 ${messages.length}`),
      messages.length ? el("div", { className: "inquiry-message-list" }, messages.map(renderInquiryMessage)) : renderInquiryState("아직 등록된 답변이 없습니다."),
      el("div", { className: "inquiry-message-form" }, [messageInput, messageButton]),
    ]),
  ]);
}

function renderInquiryMessage(message) {
  return el("article", { className: `inquiry-message ${message.authorType === "teacher" ? "teacher" : "student"}` }, [
    el("div", {}, [el("strong", {}, message.authorName), message.authorType === "teacher" ? el("span", {}, "선생님 답변") : null, el("time", {}, formatInquiryDate(message.createdAt))].filter(Boolean)),
    el("p", {}, message.body),
  ]);
}

function closeStudentInquiryDetail() {
  studentInquiryState.mode = "list";
  studentInquiryState.detail = null;
  refreshStudentInquiries();
  scrollAppToTop();
}

async function deleteStudentInquiry(inquiry) {
  if (!confirm("이 문의를 삭제할까요?")) return;
  try {
    await requestInquiry("delete", { inquiryId: inquiry.id });
    studentInquiryState.mode = "list";
    studentInquiryState.detail = null;
    await refreshStudentInquiries();
    notify("문의를 삭제했습니다.");
  } catch (error) {
    notify(inquiryErrorMessage(error));
  }
}

function renderInquiryAdmin() {
  if (!hasTeacherPermission("inquiries.read")) return renderForbidden();
  if (!inquiryAdminState.loaded && !inquiryAdminState.loading) loadInquiryAdmin();
  if (inquiryAdminState.mode === "detail") return renderInquiryAdminDetail();
  const searchInput = input("adminInquirySearch", "search", "문의 제목이나 내용을 검색", inquiryAdminState.search);
  const searchForm = el("form", { className: "teacher-search inquiry-admin-search" }, [searchInput, button("검색", "btn secondary")]);
  searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    inquiryAdminState.search = searchInput.value.trim();
    refreshInquiryAdmin();
  });
  return el("div", { className: "grid inquiry-admin-page" }, [
    panel("문의 관리", [
      el("p", { className: "subtle" }, "수강생의 비공개 문의를 확인하고 답변합니다. 자유 게시판과는 별도로 운영됩니다."),
      searchForm,
      renderInquiryCategoryFilters(inquiryAdminState, true),
      renderInquiryStatusFilters(inquiryAdminState, true),
    ]),
    panel("문의 목록", [
      inquiryAdminState.loading
        ? renderInquiryState("문의를 불러오는 중입니다.")
        : inquiryAdminState.error
          ? renderInquiryError(inquiryAdminState.error, refreshInquiryAdmin)
          : inquiryAdminState.inquiries.length
            ? el("div", { className: "inquiry-admin-list" }, inquiryAdminState.inquiries.map(renderInquiryAdminCard))
            : el("div", { className: "empty" }, "조건에 맞는 문의가 없습니다."),
    ]),
  ]);
}

async function loadInquiryAdmin() {
  inquiryAdminState.loading = true;
  inquiryAdminState.error = "";
  try {
    const data = await requestInquiryAdmin("teacher_list", inquiryFilters(inquiryAdminState));
    inquiryAdminState.inquiries = Array.isArray(data.inquiries) ? data.inquiries : [];
  } catch (error) {
    inquiryAdminState.error = inquiryErrorMessage(error);
  } finally {
    inquiryAdminState.loading = false;
    inquiryAdminState.loaded = true;
    if (currentRoute === "inquiry-board-admin") render();
  }
}

function renderInquiryAdminCard(inquiry) {
  return button("", "inquiry-admin-card", "button", () => openInquiryAdminDetail(inquiry.id), [
    el("div", { className: "inquiry-card-tags" }, [el("span", { className: "inquiry-category-badge" }, inquiry.category), renderInquiryStatusBadge(inquiry.status)]),
    el("strong", {}, inquiry.title),
    el("p", {}, compactInquiryText(inquiry.body)),
    el("small", {}, `${inquiry.studentName} · ${formatInquiryDate(inquiry.updatedAt || inquiry.createdAt)}`),
  ]);
}

async function openInquiryAdminDetail(inquiryId) {
  inquiryAdminState.mode = "detail";
  inquiryAdminState.detail = null;
  inquiryAdminState.loading = true;
  render();
  try {
    const data = await requestInquiryAdmin("teacher_detail", { inquiryId });
    inquiryAdminState.detail = { inquiry: data.inquiry, messages: data.messages || [] };
  } catch (error) {
    inquiryAdminState.error = inquiryErrorMessage(error);
  } finally {
    inquiryAdminState.loading = false;
    if (currentRoute === "inquiry-board-admin") render();
  }
}

function renderInquiryAdminDetail() {
  if (inquiryAdminState.loading) return el("div", { className: "grid" }, [panel("문의 상세", [renderInquiryState("문의를 불러오는 중입니다.")])]);
  if (!inquiryAdminState.detail) return el("div", { className: "grid" }, [panel("문의 상세", [renderInquiryError(inquiryAdminState.error || "문의를 찾을 수 없습니다.", closeInquiryAdminDetail)])]);
  const { inquiry, messages } = inquiryAdminState.detail;
  const replyInput = el("textarea", { rows: 5, maxLength: 2000, placeholder: "수강생에게 전달할 답변을 입력하세요." });
  const replyButton = button("답변 등록", "btn", "button", async () => {
    if (!replyInput.value.trim()) return notify("답변 내용을 입력해주세요.");
    await runInquiryAction(replyButton, "등록 중", async () => {
      await requestInquiryAdmin("teacher_reply", { inquiryId: inquiry.id, body: replyInput.value });
      await openInquiryAdminDetail(inquiry.id);
      notify("답변을 등록했습니다.");
    });
  });
  return el("div", { className: "grid inquiry-admin-detail" }, [
    panel("문의 상세", [
      button("← 목록", "mini-btn", "button", closeInquiryAdminDetail),
      el("div", { className: "inquiry-card-tags" }, [el("span", { className: "inquiry-category-badge" }, inquiry.category), renderInquiryStatusBadge(inquiry.status)]),
      el("h2", {}, inquiry.title),
      el("p", { className: "subtle" }, `${inquiry.studentName} · ${formatInquiryDate(inquiry.createdAt)}`),
      el("div", { className: "inquiry-body" }, inquiry.body),
    ]),
    panel(`답변 및 추가 내용 ${messages.length}`, [
      messages.length ? el("div", { className: "inquiry-message-list" }, messages.map(renderInquiryMessage)) : el("div", { className: "empty" }, "등록된 답변이 없습니다."),
      hasTeacherPermission("inquiries.write") ? el("div", { className: "inquiry-admin-reply" }, [replyInput, replyButton]) : null,
    ].filter(Boolean)),
  ]);
}

function closeInquiryAdminDetail() {
  inquiryAdminState.mode = "list";
  inquiryAdminState.detail = null;
  refreshInquiryAdmin();
}

async function refreshInquiryAdmin() {
  inquiryAdminState.loaded = false;
  await loadInquiryAdmin();
}

function renderInquiryStatusBadge(status) {
  return el("span", { className: `inquiry-status-badge ${status === "answered" ? "answered" : "open"}` }, status === "answered" ? "답변 완료" : "답변 대기");
}

function renderInquiryState(message) {
  return el("div", { className: "inquiry-state" }, message);
}

function renderInquiryError(message, retry) {
  return el("div", { className: "inquiry-state error" }, [el("p", {}, message), retry ? button("다시 시도", "mini-btn", "button", retry) : null].filter(Boolean));
}

function renderInquiryPageShell(content) {
  return el("div", { className: "student-view inquiry-page" }, [button("← 문의 목록", "inquiry-back-button", "button", closeStudentInquiryDetail), content]);
}

function inquiryFilters(stateObject) {
  return { category: stateObject.category || "", status: stateObject.status || "", search: stateObject.search || "" };
}

async function requestInquiry(action, payload = {}) {
  const student = getAuthedStudent();
  const profile = getStudentProfile(student?.id) || {};
  return inquiryFetch({
    action,
    studentId: student?.id || "",
    deviceToken: profile.deviceToken || "",
    client: { displayMode: isStandaloneStudentApp() ? "standalone" : "browser", userAgent: navigator.userAgent || "" },
    ...payload,
  });
}

function requestInquiryAdmin(action, payload = {}) {
  return inquiryFetch({ action, ...payload });
}

async function inquiryFetch(payload) {
  const response = await fetch("/api/inquiries", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) {
    const error = new Error(data.error || "inquiry_error");
    error.status = response.status;
    throw error;
  }
  return data;
}

async function runInquiryAction(actionButton, loadingText, action) {
  const originalText = actionButton.textContent;
  actionButton.disabled = true;
  actionButton.textContent = loadingText;
  try {
    await action();
  } catch (error) {
    notify(inquiryErrorMessage(error));
  } finally {
    actionButton.disabled = false;
    actionButton.textContent = originalText;
  }
}

function inquiryErrorMessage(error) {
  const messages = {
    lecture_student_only: "인터넷 수강생만 문의를 이용할 수 있습니다.",
    inquiry_not_found: "문의를 찾을 수 없습니다.",
    invalid_category: "문의 카테고리를 확인해주세요.",
    invalid_title: "문의 제목을 2자 이상 입력해주세요.",
    invalid_body: "문의 내용을 2자 이상 입력해주세요.",
    invalid_message: "추가 내용을 입력해주세요.",
    inquiry_rate_limited: "하루 문의 등록 횟수를 초과했습니다.",
    message_rate_limited: "잠시 후 다시 등록해주세요.",
    service_role_not_configured: "문의 서비스를 준비하는 중입니다.",
    inquiry_store_unavailable: "문의 서비스를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.",
  };
  return messages[error?.message] || "문의 처리 중 오류가 발생했습니다.";
}

function compactInquiryText(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > 100 ? `${text.slice(0, 100)}…` : text;
}

function formatInquiryDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}
