const QUESTION_BOARD_DEFAULT_SUBJECTS = [
  "해양경찰학개론",
  "해사법규",
  "형사법",
  "해사영어",
  "항해학",
  "기관학",
  "형사법(공판)",
];

const questionBoardState = {
  studentId: "",
  subjects: [...QUESTION_BOARD_DEFAULT_SUBJECTS],
  posts: [],
  detail: null,
  mode: "list",
  search: "",
  subject: QUESTION_BOARD_DEFAULT_SUBJECTS[0],
  status: "",
  loading: false,
  loaded: false,
  error: "",
  editingPost: null,
  draftSubject: "",
  subjectPickerReturnMode: "list",
};

const questionBoardAdminState = {
  subjects: [],
  posts: [],
  reports: [],
  detail: null,
  mode: "list",
  search: "",
  subject: "",
  status: "",
  loading: false,
  loaded: false,
  error: "",
};
let questionBoardSearchTimer = null;

function renderQuestionBoard() {
  const student = getAuthedStudent();
  if (!student || getStudentCategory(student) !== "lecture") {
    syncQuestionWriteButton();
    return el("div", { className: "grid student-view" }, [
      panel("게시판", [el("div", { className: "empty" }, "인강생만 이용할 수 있습니다.")]),
    ]);
  }
  if (questionBoardState.studentId !== student.id) resetQuestionBoardState(student.id);
  syncQuestionWriteButton();
  if (!questionBoardState.loaded && !questionBoardState.loading) loadQuestionBoardHome();

  if (questionBoardState.mode === "subject-picker") {
    const pickerBackground = questionBoardState.subjectPickerReturnMode === "form"
      ? renderQuestionPostForm()
      : renderQuestionPostList();
    return el("div", { className: "question-subject-picker-context" }, [pickerBackground, renderQuestionSubjectPicker()]);
  }
  if (questionBoardState.mode === "form") return renderQuestionPostForm();
  if (questionBoardState.mode === "detail") return renderQuestionPostDetail();
  return renderQuestionPostList();
}

function resetQuestionBoardState(studentId) {
  Object.assign(questionBoardState, {
    studentId,
    subjects: [...QUESTION_BOARD_DEFAULT_SUBJECTS],
    posts: [],
    detail: null,
    mode: "list",
    search: "",
    subject: QUESTION_BOARD_DEFAULT_SUBJECTS[0],
    status: "",
    loading: false,
    loaded: false,
    error: "",
    editingPost: null,
    draftSubject: "",
    subjectPickerReturnMode: "list",
  });
}

async function loadQuestionBoardHome({ silent = false } = {}) {
  questionBoardState.loading = !silent;
  questionBoardState.error = "";
  if (!silent) render();
  try {
    const subjectData = await requestQuestionBoard("subjects");
    questionBoardState.subjects = [...new Set([
      ...(Array.isArray(subjectData.subjects) ? subjectData.subjects : []),
      ...QUESTION_BOARD_DEFAULT_SUBJECTS,
    ])];
    if (!questionBoardState.subject && questionBoardState.subjects.length) {
      questionBoardState.subject = questionBoardState.subjects[0];
    }
    const listData = await requestQuestionBoard("list", questionBoardFilters(questionBoardState));
    questionBoardState.posts = Array.isArray(listData.posts) ? listData.posts : [];
    questionBoardState.loaded = true;
  } catch (error) {
    console.error(error);
    questionBoardState.error = questionBoardErrorMessage(error);
  } finally {
    questionBoardState.loading = false;
    questionBoardState.loaded = true;
    if (currentRoute === "question-board") render();
  }
}

async function refreshQuestionBoardList() {
  questionBoardState.loading = true;
  questionBoardState.error = "";
  render();
  try {
    const data = await requestQuestionBoard("list", questionBoardFilters(questionBoardState));
    questionBoardState.posts = Array.isArray(data.posts) ? data.posts : [];
    questionBoardState.loaded = true;
  } catch (error) {
    questionBoardState.error = questionBoardErrorMessage(error);
  } finally {
    questionBoardState.loading = false;
    if (currentRoute === "question-board") render();
  }
}

function renderQuestionPostList() {
  const searchInput = input("questionSearch", "search", "게시글을 검색해보세요", questionBoardState.search);
  const searchForm = el("form", { className: "question-board-search" }, [
    el("button", { className: "question-board-search-button", type: "submit", ariaLabel: "게시글 검색" }, [
      el("span", { className: "question-board-search-icon", ariaHidden: "true" }),
    ]),
    searchInput,
  ]);
  const submitSearch = (event) => {
    if (event) event.preventDefault();
    if (questionBoardSearchTimer) window.clearTimeout(questionBoardSearchTimer);
    questionBoardState.search = searchInput.value.trim();
    refreshQuestionBoardList();
  };
  searchForm.addEventListener("submit", submitSearch);
  searchInput.addEventListener("input", () => {
    questionBoardState.search = searchInput.value.trim();
    if (questionBoardSearchTimer) window.clearTimeout(questionBoardSearchTimer);
    questionBoardSearchTimer = window.setTimeout(() => {
      questionBoardSearchTimer = null;
      refreshQuestionBoardList();
    }, 450);
  });

  const content = questionBoardState.loading
    ? renderQuestionBoardEmptyState()
    : questionBoardState.error
      ? renderQuestionBoardError(questionBoardState.error, () => loadQuestionBoardHome())
      : questionBoardState.posts.length
        ? el("div", { className: "question-post-list" }, questionBoardState.posts.map(renderQuestionPostCard))
        : renderQuestionBoardEmptyState(Boolean(questionBoardState.search));

  return el("div", { className: "question-board-page student-view" }, [
    el("section", { className: "question-board-head compact" }, [searchForm]),
    renderQuestionSubjectTabs(questionBoardState, false),
    el("section", { className: "question-board-list-section" }, [
      el("div", { className: "question-board-list-head" }, [
        el("strong", {}, questionBoardState.subject || "게시글"),
        el("span", {}, `${questionBoardState.posts.length}개`),
      ]),
      content,
    ]),
  ]);
}

function ensureQuestionWriteButton() {
  let writeButton = document.getElementById("question-board-write-button");
  if (!writeButton) {
    writeButton = button("+ 글쓰기", "question-write-button", "button", () => {
      questionBoardState.editingPost = null;
      questionBoardState.draftSubject = "";
      openQuestionSubjectPicker("list");
    });
    writeButton.id = "question-board-write-button";
    writeButton.hidden = true;
    document.body.appendChild(writeButton);
  }
  return writeButton;
}

function syncQuestionWriteButton() {
  const writeButton = ensureQuestionWriteButton();
  const student = typeof getAuthedStudent === "function" ? getAuthedStudent() : null;
  writeButton.hidden = !(
    currentRoute === "question-board" &&
    questionBoardState.mode === "list" &&
    student &&
    getStudentCategory(student) === "lecture"
  );
}

function renderQuestionBoardEmptyState(searching = false) {
  return el("div", { className: "question-board-empty-stack" }, [
    el("div", { className: "question-board-empty question-board-list-empty" }, [
      el("span", { className: "question-board-empty-icon", ariaHidden: "true" }),
      el("div", {}, [
        el("strong", {}, searching ? "검색 결과가 없습니다." : "등록된 글이 없습니다."),
        el("p", {}, searching ? "다른 검색어로 다시 찾아보세요." : "오른쪽 아래 글쓰기 버튼으로 첫 글을 남겨보세요."),
      ]),
    ]),
    searching ? null : renderQuestionBoardGuide(),
  ].filter(Boolean));
}

function renderQuestionBoardGuide() {
  return el("aside", { className: "question-board-guide" }, [
    el("strong", {}, "게시판 이용 안내"),
    el("p", {}, "과목을 선택해 글을 확인하고, 댓글로 서로의 공부 내용을 나눌 수 있습니다."),
  ]);
}

function renderQuestionSubjectTabs(boardState, admin) {
  const subjects = [...new Set(boardState.subjects.length ? boardState.subjects : boardState.posts.map((post) => post.subject))];
  return el("div", { className: "question-filter-scroll", ariaLabel: "과목 선택" }, [
    ...subjects.map((subject) => questionFilterButton(subject, boardState.subject === subject, () => setQuestionFilter(boardState, "subject", subject, admin))),
  ]);
}

function renderQuestionStatusTabs(boardState, admin) {
  return el("div", { className: "question-status-tabs" }, [
    questionFilterButton("전체", !boardState.status, () => setQuestionFilter(boardState, "status", "", admin)),
    questionFilterButton("답변 대기", boardState.status === "open", () => setQuestionFilter(boardState, "status", "open", admin)),
    questionFilterButton("답변 완료", boardState.status === "answered", () => setQuestionFilter(boardState, "status", "answered", admin)),
  ]);
}

function questionFilterButton(label, active, onClick) {
  return button(label, `question-filter-button${active ? " active" : ""}`, "button", onClick);
}

function setQuestionFilter(boardState, key, value, admin) {
  boardState[key] = value;
  if (admin) refreshQuestionBoardAdminList();
  else refreshQuestionBoardList();
}

function renderQuestionPostCard(post) {
  const card = el("button", { className: "question-post-card", type: "button" }, [
    el("div", { className: "question-post-card-top" }, [
      el("span", { className: "question-subject-tag" }, post.subject),
    ]),
    el("strong", { className: "question-post-title" }, post.title),
    el("p", { className: "question-post-preview" }, compactQuestionText(post.body)),
    el("div", { className: "question-post-meta" }, [
      el("span", {}, post.authorName),
      el("span", {}, formatQuestionBoardDate(post.createdAt)),
      el("span", {}, `조회 ${post.viewCount}`),
      el("span", { className: "question-comment-count" }, `댓글 ${post.commentCount}`),
    ]),
  ]);
  card.addEventListener("click", () => openQuestionPost(post.id));
  return card;
}

async function openQuestionPost(postId) {
  questionBoardState.mode = "detail";
  questionBoardState.detail = null;
  questionBoardState.loading = true;
  questionBoardState.error = "";
  render();
  try {
    const data = await requestQuestionBoard("detail", { postId });
    questionBoardState.detail = { post: data.post, comments: data.comments || [] };
  } catch (error) {
    questionBoardState.error = questionBoardErrorMessage(error);
  } finally {
    questionBoardState.loading = false;
    if (currentRoute === "question-board") {
      render();
      scrollAppToTop();
    }
  }
}

function renderQuestionPostDetail() {
  if (questionBoardState.loading) return renderQuestionPageShell(renderQuestionBoardLoading("게시글을 불러오는 중입니다."));
  if (questionBoardState.error || !questionBoardState.detail) {
    return renderQuestionPageShell(renderQuestionBoardError(questionBoardState.error || "게시글을 찾을 수 없습니다.", closeQuestionDetail));
  }
  const { post, comments } = questionBoardState.detail;
  const reply = el("textarea", { name: "body", rows: 3, maxLength: 2000, placeholder: "알고 있는 내용을 댓글로 답변해주세요." });
  const replyButton = button("댓글 등록", "btn", "submit");
  const replyForm = el("form", { className: "question-reply-form" }, [reply, replyButton]);
  replyForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!reply.value.trim()) return notify("댓글 내용을 입력해주세요.");
    await runQuestionAction(replyButton, "등록 중", async () => {
      await requestQuestionBoard("comment_create", { postId: post.id, body: reply.value });
      await reloadQuestionDetail(post.id);
      notify("댓글을 등록했습니다.");
    });
  });

  const actions = [
    post.isOwn ? button("수정", "mini-btn", "button", () => editQuestionPost(post)) : null,
    post.isOwn ? button("삭제", "mini-btn danger", "button", () => deleteQuestionPost(post)) : null,
    !post.isOwn ? button("신고", "mini-btn", "button", () => reportQuestionTarget("post", post.id)) : null,
  ].filter(Boolean);

  return el("div", { className: "question-board-page question-detail-page student-view" }, [
    button("← 목록", "question-back-button", "button", closeQuestionDetail),
    el("article", { className: "question-detail-card" }, [
      el("div", { className: "question-post-card-top" }, [
        el("span", { className: "question-subject-tag" }, post.subject),
      ]),
      el("h2", {}, post.title),
      el("div", { className: "question-post-meta" }, [
        el("span", {}, post.authorName),
        el("span", {}, formatQuestionBoardDate(post.createdAt)),
        el("span", {}, `조회 ${post.viewCount}`),
      ]),
      el("div", { className: "question-detail-body" }, post.body),
      actions.length ? el("div", { className: "question-detail-actions" }, actions) : null,
    ]),
    el("section", { className: "question-comments-section" }, [
      el("div", { className: "question-comments-head" }, [el("strong", {}, `댓글 ${comments.length}`), el("span", {}, "댓글로 답변을 나눠보세요")]),
      comments.length
        ? el("div", { className: "question-comment-list" }, comments.map((comment) => renderQuestionComment(comment, post)))
        : el("div", { className: "question-comment-empty" }, "아직 답변이 없습니다. 첫 댓글을 남겨보세요."),
      replyForm,
    ]),
  ].filter(Boolean));
}

function renderQuestionComment(comment, post) {
  const actions = [
    comment.isOwn ? button("삭제", "question-comment-action", "button", () => deleteQuestionComment(comment, post.id)) : null,
    !comment.isOwn && comment.authorType !== "teacher" ? button("신고", "question-comment-action", "button", () => reportQuestionTarget("comment", comment.id)) : null,
  ].filter(Boolean);
  return el("article", { className: `question-comment ${comment.authorType === "teacher" ? "teacher" : ""}` }, [
    el("div", { className: "question-comment-head" }, [
      el("strong", {}, comment.authorName),
      comment.authorType === "teacher" ? el("span", { className: "teacher-answer-badge" }, "선생님 답변") : null,
      el("span", {}, formatQuestionBoardDate(comment.createdAt)),
    ].filter(Boolean)),
    el("div", { className: "question-comment-body" }, comment.body),
    actions.length ? el("div", { className: "question-comment-actions" }, actions) : null,
  ].filter(Boolean));
}

function openQuestionSubjectPicker(returnMode = "list") {
  questionBoardState.subjectPickerReturnMode = returnMode;
  questionBoardState.mode = "subject-picker";
  render();
}

function closeQuestionSubjectPicker() {
  questionBoardState.mode = questionBoardState.subjectPickerReturnMode === "form" ? "form" : "list";
  render();
}

function selectQuestionPostSubject(subject) {
  questionBoardState.draftSubject = subject;
  questionBoardState.mode = "form";
  render();
  scrollAppToTop();
}

function renderQuestionSubjectPicker() {
  const subjects = questionBoardState.subjects.length
    ? questionBoardState.subjects
    : QUESTION_BOARD_DEFAULT_SUBJECTS;
  const backdrop = el("button", {
    className: "question-subject-picker-backdrop",
    type: "button",
    ariaLabel: "과목 선택 닫기",
  });
  backdrop.addEventListener("click", closeQuestionSubjectPicker);
  const subjectButtons = subjects.map((subject) => {
    const subjectButton = el("button", { className: "question-subject-option", type: "button" }, [
      el("span", { className: "question-subject-option-copy" }, [
        el("strong", {}, subject),
        el("small", {}, `${subject} 과목의 질문과 학습 이야기를 나눠보세요.`),
      ]),
      el("span", { className: "question-subject-option-arrow", ariaHidden: "true" }, "›"),
    ]);
    subjectButton.addEventListener("click", () => selectQuestionPostSubject(subject));
    return subjectButton;
  });
  return el("div", { className: "question-subject-picker-overlay" }, [
    backdrop,
    el("section", { className: "question-subject-picker-sheet", role: "dialog", ariaModal: "true", ariaLabel: "과목 선택" }, [
      el("span", { className: "question-subject-picker-handle", ariaHidden: "true" }),
      el("div", { className: "question-subject-picker-head" }, [
        el("h2", {}, "과목 선택"),
        button("×", "question-subject-picker-close", "button", closeQuestionSubjectPicker),
      ]),
      el("div", { className: "question-subject-options" }, subjectButtons),
    ]),
  ]);
}

function renderQuestionPostForm() {
  const editing = questionBoardState.editingPost;
  if (!questionBoardState.draftSubject) {
    questionBoardState.draftSubject = editing?.subject || questionBoardState.subject || QUESTION_BOARD_DEFAULT_SUBJECTS[0];
  }
  const subjectButton = button("", "question-write-subject-button", "button", () => openQuestionSubjectPicker("form"));
  subjectButton.replaceChildren(
    el("span", {}, questionBoardState.draftSubject),
    el("span", { className: "question-write-subject-chevron", ariaHidden: "true" }),
  );
  const titleInput = input("title", "text", "제목을 입력하세요", editing?.title || "");
  titleInput.maxLength = 120;
  const bodyInput = el("textarea", { name: "body", rows: 10, maxLength: 5000, placeholder: "문제와 궁금한 부분을 구체적으로 적어주세요." }, editing?.body || "");
  const submitButton = button(editing ? "글 수정" : "등록", "btn", "submit");
  const form = el("form", { className: "question-write-form" }, [
    subjectButton,
    field("제목", titleInput, "", "2~120자로 입력해주세요."),
    field("내용", bodyInput, "", "개인정보나 연락처는 작성하지 마세요."),
    el("div", { className: "question-write-actions" }, [button("취소", "btn secondary", "button", closeQuestionForm), submitButton]),
  ]);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form).entries());
    if (!questionBoardState.draftSubject || String(values.title).trim().length < 2 || String(values.body).trim().length < 2) {
      return notify("과목, 제목, 내용을 확인해주세요.");
    }
    await runQuestionAction(submitButton, editing ? "수정 중" : "등록 중", async () => {
      const submittedSubject = questionBoardState.draftSubject;
      const data = await requestQuestionBoard(editing ? "update" : "create", {
        ...(editing ? { postId: editing.id } : {}),
        subject: submittedSubject,
        title: values.title,
        body: values.body,
      });
      questionBoardState.editingPost = null;
      questionBoardState.subject = submittedSubject;
      questionBoardState.draftSubject = "";
      questionBoardState.loaded = false;
      await loadQuestionBoardHome({ silent: true });
      await openQuestionPost(editing?.id || data.postId);
      notify(editing ? "글을 수정했습니다." : "글을 등록했습니다.");
    });
  });
  return el("div", { className: "question-board-page question-write-page student-view" }, [
    button("← 목록", "question-back-button", "button", closeQuestionForm),
    el("section", { className: "question-write-card" }, [
      el("span", { className: "question-board-kicker" }, editing ? "EDIT POST" : "NEW POST"),
      el("h2", {}, editing ? "글 수정" : "글쓰기"),
      el("p", {}, "선택한 과목 게시판에 글이 등록되며 댓글로 의견을 나눌 수 있습니다."),
      form,
    ]),
  ]);
}

function closeQuestionForm() {
  questionBoardState.editingPost = null;
  questionBoardState.draftSubject = "";
  questionBoardState.mode = questionBoardState.detail ? "detail" : "list";
  render();
  scrollAppToTop();
}

function closeQuestionDetail() {
  questionBoardState.mode = "list";
  questionBoardState.detail = null;
  questionBoardState.error = "";
  refreshQuestionBoardList();
  scrollAppToTop();
}

function editQuestionPost(post) {
  questionBoardState.editingPost = post;
  questionBoardState.draftSubject = post.subject;
  questionBoardState.mode = "form";
  render();
  scrollAppToTop();
}

async function reloadQuestionDetail(postId) {
  const data = await requestQuestionBoard("detail", { postId });
  questionBoardState.detail = { post: data.post, comments: data.comments || [] };
  if (currentRoute === "question-board") render();
}

async function toggleQuestionResolved(post) {
  try {
    await requestQuestionBoard("resolve", { postId: post.id, answered: post.status !== "answered" });
    await reloadQuestionDetail(post.id);
    notify(post.status === "answered" ? "답변 대기로 변경했습니다." : "답변 완료로 표시했습니다.");
  } catch (error) {
    notify(questionBoardErrorMessage(error));
  }
}

async function deleteQuestionPost(post) {
  if (!confirm("이 글과 댓글을 삭제할까요?")) return;
  try {
    await requestQuestionBoard("delete", { postId: post.id });
    questionBoardState.mode = "list";
    questionBoardState.detail = null;
    await refreshQuestionBoardList();
    notify("글을 삭제했습니다.");
  } catch (error) {
    notify(questionBoardErrorMessage(error));
  }
}

async function deleteQuestionComment(comment, postId) {
  if (!confirm("이 댓글을 삭제할까요?")) return;
  try {
    await requestQuestionBoard("comment_delete", { commentId: comment.id });
    await reloadQuestionDetail(postId);
    notify("댓글을 삭제했습니다.");
  } catch (error) {
    notify(questionBoardErrorMessage(error));
  }
}

async function reportQuestionTarget(targetType, targetId) {
  const reason = prompt("신고 사유를 입력해주세요. (2자 이상)", "부적절한 내용입니다.");
  if (reason === null) return;
  if (reason.trim().length < 2) return notify("신고 사유를 2자 이상 입력해주세요.");
  try {
    await requestQuestionBoard("report", { targetType, targetId, reason });
    notify("신고가 접수되었습니다.");
  } catch (error) {
    notify(questionBoardErrorMessage(error));
  }
}

function renderQuestionBoardAdmin() {
  if (!hasTeacherPermission("question_board.read")) return renderForbidden();
  if (!questionBoardAdminState.loaded && !questionBoardAdminState.loading) loadQuestionBoardAdmin();
  if (questionBoardAdminState.mode === "detail") return renderQuestionBoardAdminDetail();

  const searchInput = input("adminQuestionSearch", "search", "게시글 제목이나 내용을 검색", questionBoardAdminState.search);
  const searchForm = el("form", { className: "teacher-search question-admin-search" }, [searchInput, button("검색", "btn secondary")]);
  searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    questionBoardAdminState.search = searchInput.value.trim();
    refreshQuestionBoardAdminList();
  });
  return el("div", { className: "grid question-board-admin-page" }, [
    panel("인강생 게시판", [
      el("p", { className: "subtle" }, "과목별 게시글을 확인하고 선생님 댓글을 등록하거나 부적절한 내용을 숨길 수 있습니다."),
      questionBoardAdminState.reports.length
        ? el("div", { className: "question-admin-report-alert" }, `검토 대기 신고 ${questionBoardAdminState.reports.length}건`)
        : null,
      searchForm,
      renderQuestionSubjectTabs(questionBoardAdminState, true),
    ].filter(Boolean)),
    panel("게시글 목록", [
      questionBoardAdminState.loading
        ? renderQuestionBoardLoading("게시글을 불러오는 중입니다.")
        : questionBoardAdminState.error
          ? renderQuestionBoardError(questionBoardAdminState.error, loadQuestionBoardAdmin)
          : questionBoardAdminState.posts.length
            ? el("div", { className: "question-post-list admin" }, questionBoardAdminState.posts.map(renderQuestionAdminCard))
            : el("div", { className: "empty" }, "조건에 맞는 게시글이 없습니다."),
    ]),
    questionBoardAdminState.reports.length
      ? panel("신고 검토", [el("div", { className: "question-admin-report-list" }, questionBoardAdminState.reports.map(renderQuestionAdminReport))])
      : null,
  ].filter(Boolean));
}

async function loadQuestionBoardAdmin() {
  questionBoardAdminState.loading = true;
  questionBoardAdminState.error = "";
  render();
  try {
    const data = await requestQuestionBoardAdmin("teacher_list", questionBoardFilters(questionBoardAdminState));
    questionBoardAdminState.posts = data.posts || [];
    questionBoardAdminState.subjects = [...new Set([
      ...(data.subjects || []),
      ...questionBoardAdminState.posts.map((post) => post.subject),
    ])];
    questionBoardAdminState.reports = data.reports || [];
    questionBoardAdminState.loaded = true;
  } catch (error) {
    questionBoardAdminState.error = questionBoardErrorMessage(error);
  } finally {
    questionBoardAdminState.loading = false;
    questionBoardAdminState.loaded = true;
    if (currentRoute === "question-board-admin") render();
  }
}

function renderQuestionAdminReport(report) {
  return el("article", { className: "question-admin-report-item" }, [
    el("div", {}, [
      el("strong", {}, report.comment_id ? "댓글 신고" : "게시글 신고"),
      el("p", {}, report.reason),
      el("small", {}, formatQuestionBoardDate(report.created_at)),
    ]),
    el("div", { className: "question-detail-actions" }, [
      report.target_post_id ? button("내용 확인", "mini-btn", "button", () => openQuestionAdminPost(report.target_post_id)) : null,
      button("검토 완료", "mini-btn", "button", () => reviewQuestionReport(report, false)),
      button("신고 기각", "mini-btn", "button", () => reviewQuestionReport(report, true)),
    ].filter(Boolean)),
  ]);
}

async function reviewQuestionReport(report, dismissed) {
  try {
    await requestQuestionBoardAdmin("teacher_report_review", { reportId: report.id, dismissed });
    await refreshQuestionBoardAdminList();
    notify(dismissed ? "신고를 기각했습니다." : "신고를 검토 완료했습니다.");
  } catch (error) {
    notify(questionBoardErrorMessage(error));
  }
}

async function refreshQuestionBoardAdminList() {
  questionBoardAdminState.loaded = false;
  await loadQuestionBoardAdmin();
}

function renderQuestionAdminCard(post) {
  const card = renderQuestionPostCard(post);
  card.classList.add("question-admin-card");
  if (post.isHidden) card.classList.add("hidden-content");
  card.addEventListener("click", (event) => {
    event.stopImmediatePropagation();
    openQuestionAdminPost(post.id);
  }, { capture: true });
  if (post.isHidden) card.prepend(el("span", { className: "question-hidden-badge" }, "숨김"));
  return card;
}

async function openQuestionAdminPost(postId) {
  questionBoardAdminState.mode = "detail";
  questionBoardAdminState.detail = null;
  questionBoardAdminState.loading = true;
  render();
  try {
    const data = await requestQuestionBoardAdmin("teacher_detail", { postId });
    questionBoardAdminState.detail = { post: data.post, comments: data.comments || [] };
  } catch (error) {
    questionBoardAdminState.error = questionBoardErrorMessage(error);
  } finally {
    questionBoardAdminState.loading = false;
    if (currentRoute === "question-board-admin") render();
  }
}

function renderQuestionBoardAdminDetail() {
  if (questionBoardAdminState.loading) return el("div", { className: "grid" }, [panel("게시글", [renderQuestionBoardLoading("게시글을 불러오는 중입니다.")])]);
  const detail = questionBoardAdminState.detail;
  if (!detail) return el("div", { className: "grid" }, [panel("게시글", [renderQuestionBoardError(questionBoardAdminState.error || "게시글을 찾을 수 없습니다.", closeQuestionAdminDetail)])]);
  const { post, comments } = detail;
  const reply = el("textarea", { rows: 5, maxLength: 2000, placeholder: "선생님 답변을 입력하세요." });
  const replyButton = button("선생님 답변 등록", "btn", "button", () => submitTeacherQuestionReply(post.id, reply, replyButton));
  return el("div", { className: "grid question-board-admin-detail" }, [
    panel("게시글 상세", [
      button("← 목록", "mini-btn", "button", closeQuestionAdminDetail),
      el("div", { className: "question-admin-detail-head" }, [
        el("span", { className: "question-subject-tag" }, post.subject),
        post.isHidden ? el("span", { className: "question-hidden-badge" }, "숨김") : null,
      ].filter(Boolean)),
      el("h2", {}, post.title),
      el("p", { className: "subtle" }, `${post.authorName} · ${formatQuestionBoardDate(post.createdAt)} · 조회 ${post.viewCount}`),
      el("div", { className: "question-detail-body" }, post.body),
      el("div", { className: "question-detail-actions" }, [
        button(post.isHidden ? "숨김 해제" : "게시글 숨김", post.isHidden ? "mini-btn" : "mini-btn danger", "button", () => toggleAdminPostVisibility(post)),
      ]),
    ]),
    panel(`댓글 ${comments.length}`, [
      comments.length ? el("div", { className: "question-comment-list" }, comments.map((comment) => renderQuestionAdminComment(comment, post.id))) : el("div", { className: "empty" }, "등록된 댓글이 없습니다."),
      hasTeacherPermission("question_board.write") ? el("div", { className: "question-admin-reply" }, [reply, replyButton]) : null,
    ].filter(Boolean)),
  ]);
}

function renderQuestionAdminComment(comment, postId) {
  return el("article", { className: `question-comment ${comment.authorType === "teacher" ? "teacher" : ""} ${comment.isHidden ? "hidden-content" : ""}` }, [
    el("div", { className: "question-comment-head" }, [
      el("strong", {}, comment.authorName),
      comment.authorType === "teacher" ? el("span", { className: "teacher-answer-badge" }, "선생님 답변") : null,
      comment.isHidden ? el("span", { className: "question-hidden-badge" }, "숨김") : null,
      el("span", {}, formatQuestionBoardDate(comment.createdAt)),
    ].filter(Boolean)),
    el("div", { className: "question-comment-body" }, comment.body),
    hasTeacherPermission("question_board.write")
      ? button(comment.isHidden ? "숨김 해제" : "댓글 숨김", "mini-btn", "button", () => toggleAdminCommentVisibility(comment, postId))
      : null,
  ].filter(Boolean));
}

async function submitTeacherQuestionReply(postId, inputNode, actionButton) {
  if (!inputNode.value.trim()) return notify("답변 내용을 입력해주세요.");
  await runQuestionAction(actionButton, "등록 중", async () => {
    await requestQuestionBoardAdmin("teacher_comment_create", { postId, body: inputNode.value });
    await openQuestionAdminPost(postId);
    notify("선생님 답변을 등록했습니다.");
  });
}

async function toggleAdminPostVisibility(post) {
  if (!hasTeacherPermission("question_board.write")) return;
  const reason = post.isHidden ? "" : prompt("숨김 사유를 입력해주세요.", "게시판 운영 기준 위반");
  if (!post.isHidden && reason === null) return;
  try {
    await requestQuestionBoardAdmin("teacher_post_visibility", { postId: post.id, hidden: !post.isHidden, reason });
    await openQuestionAdminPost(post.id);
    notify(post.isHidden ? "게시글 숨김을 해제했습니다." : "게시글을 숨겼습니다.");
  } catch (error) {
    notify(questionBoardErrorMessage(error));
  }
}

async function toggleAdminCommentVisibility(comment, postId) {
  if (!hasTeacherPermission("question_board.write")) return;
  const reason = comment.isHidden ? "" : prompt("숨김 사유를 입력해주세요.", "게시판 운영 기준 위반");
  if (!comment.isHidden && reason === null) return;
  try {
    await requestQuestionBoardAdmin("teacher_comment_visibility", { commentId: comment.id, hidden: !comment.isHidden, reason });
    await openQuestionAdminPost(postId);
    notify(comment.isHidden ? "댓글 숨김을 해제했습니다." : "댓글을 숨겼습니다.");
  } catch (error) {
    notify(questionBoardErrorMessage(error));
  }
}

function closeQuestionAdminDetail() {
  questionBoardAdminState.mode = "list";
  questionBoardAdminState.detail = null;
  questionBoardAdminState.error = "";
  refreshQuestionBoardAdminList();
}

function questionBoardFilters(boardState) {
  return { search: boardState.search || "", subject: boardState.subject || "", status: boardState.status || "" };
}

async function requestQuestionBoard(action, payload = {}) {
  const student = getAuthedStudent();
  const profile = getStudentProfile(student?.id) || {};
  return questionBoardFetch({
    action,
    studentId: student?.id || "",
    deviceToken: profile.deviceToken || "",
    client: {
      displayMode: isStandaloneStudentApp() ? "standalone" : "browser",
      userAgent: navigator.userAgent || "",
    },
    ...payload,
  });
}

function requestQuestionBoardAdmin(action, payload = {}) {
  return questionBoardFetch({ action, ...payload });
}

async function questionBoardFetch(payload) {
  const response = await fetch("/api/question-board", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) {
    const error = new Error(data.error || "question_board_error");
    error.status = response.status;
    throw error;
  }
  return data;
}

async function runQuestionAction(actionButton, loadingText, action) {
  const originalText = actionButton.textContent;
  actionButton.disabled = true;
  actionButton.textContent = loadingText;
  try {
    await action();
  } catch (error) {
    console.error(error);
    notify(questionBoardErrorMessage(error));
  } finally {
    actionButton.disabled = false;
    actionButton.textContent = originalText;
  }
}

function renderQuestionPageShell(content) {
  return el("div", { className: "question-board-page student-view" }, [button("← 목록", "question-back-button", "button", closeQuestionDetail), content]);
}

function renderQuestionBoardLoading(message) {
  return el("div", { className: "question-board-loading" }, [el("span", { className: "spinner", ariaHidden: "true" }), el("span", {}, message)]);
}

function renderQuestionBoardError(message, retry) {
  return el("div", { className: "question-board-empty error" }, [el("strong", {}, message), button("다시 시도", "btn secondary", "button", retry)]);
}

function questionBoardErrorMessage(error) {
  const messages = {
    lecture_student_only: "인강생 인증을 확인할 수 없습니다. 앱을 다시 등록해주세요.",
    service_role_not_configured: "게시판 서버 설정이 아직 완료되지 않았습니다.",
    question_board_store_unavailable: "게시판 데이터베이스 준비가 필요합니다.",
    post_not_found: "삭제되었거나 볼 수 없는 게시글입니다.",
    invalid_subject: "과목을 다시 선택해주세요.",
    invalid_title: "제목을 2자 이상 입력해주세요.",
    invalid_body: "내용을 2자 이상 입력해주세요.",
    invalid_comment: "댓글 내용을 입력해주세요.",
    post_rate_limited: "하루에 게시글은 최대 20개까지 등록할 수 있습니다.",
    comment_rate_limited: "댓글을 너무 빠르게 등록하고 있습니다. 잠시 후 다시 시도해주세요.",
    already_reported: "이미 신고한 내용입니다.",
    forbidden: "이 기능을 사용할 권한이 없습니다.",
    unauthorized: "관리자 로그인이 필요합니다.",
  };
  return messages[error?.message] || "게시판 요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.";
}

function compactQuestionText(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > 110 ? `${text.slice(0, 110)}…` : text;
}

function formatQuestionBoardDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  if (diff >= 0 && diff < 60 * 1000) return "방금 전";
  if (diff >= 0 && diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)}분 전`;
  if (diff >= 0 && diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)}시간 전`;
  return new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric" }).format(date);
}
