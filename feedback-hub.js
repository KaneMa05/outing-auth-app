// Shared student/admin hub. Each board keeps its own existing private/reply controls.
function openStudyCafeFeedbackPage() { navigate("feedback"); }

async function requestFeedbackHub(action, payload = {}, admin = false) {
  let data;
  if (admin) {
    const response = await fetch("/api/study-cafe-admin", {
      method: "POST", credentials: "same-origin", signal: AbortSignal.timeout(20000),
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...payload }),
    });
    data = await response.json();
    if (!response.ok) throw new Error(data.error || "request_failed");
  } else data = await requestStudyCafeAction(action, payload);
  if (!data.ok) throw new Error(data.error || "request_failed");
  return data;
}

function feedbackHubError(error) {
  if (error.message === "feature_not_found") return "공개가 종료되었거나 찾을 수 없는 소개글입니다.";
  if (error.message === "forbidden" || error.message === "unauthorized") return "로그인 상태와 관리자 권한을 확인해주세요.";
  if (/image/.test(error.message)) return "사진을 확인해주세요. JPG, PNG, WebP 사진을 최대 3장까지 첨부할 수 있습니다.";
  return "요청을 처리하지 못했어요. 잠시 후 다시 시도해주세요.";
}

function renderStudentFeedbackHub() {
  const page = el("div", { className: "feedback-hub-page" }, [
    button("‹ 스터디카페", "feedback-hub-back", "button", () => navigate("study-cafe")),
    el("h2", {}, "의견 나누기"),
    el("p", { className: "feedback-hub-lead" }, "새 기능에 대한 생각이나 새로운 아이디어를 들려주세요."),
  ]);
  const hub = createFeedbackHub(false);
  page.appendChild(hub.element);
  queueMicrotask(hub.start);
  return page;
}

function openStudyCafeFeedbackAdminHub() {
  if (!isTeacherAdmin()) return;
  const hub = createFeedbackHub(true);
  openInfoModal({ title: "의견 · 새 기능 관리", className: "feedback-hub-admin study-cafe-feedback-admin-modal", content: hub.element, confirmLabel: "닫기" });
  hub.start();
}

function createFeedbackHub(admin) {
  const actor = admin ? teacherAuth.user?.username : getAuthedStudent()?.id;
  let revision = 0;
  const content = el("div", { className: "feedback-hub-content" });
  const tabs = el("div", { className: "feedback-hub-tabs", "aria-label": "의견 종류" });
  const element = el("section", { className: "feedback-hub" }, [tabs, content]);
  const current = (ticket) => element.isConnected && revision === ticket && (admin
    ? isTeacherAdmin() && teacherAuth.user?.username === actor : getAuthedStudent()?.id === actor);
  const previewTab = button(admin ? "새 기능 관리" : "새 기능 미리보기", "", "button", () => select("features"));
  const freeTab = button("자유 건의", "", "button", () => select("free"));
  tabs.append(previewTab, freeTab);

  function select(tab) {
    revision++;
    previewTab.setAttribute("aria-pressed", String(tab === "features"));
    freeTab.setAttribute("aria-pressed", String(tab === "free"));
    content.replaceChildren();
    if (tab === "free") mountBoard("", content);
    else showList(!admin);
  }
  function mountBoard(featureId, container) {
    if (admin) openStudyCafeFeedbackAdminModal({ featureId, container });
    else openStudyCafeNoticeModal({ featureId, container });
  }
  function showError(error, retry) {
    content.replaceChildren(el("p", { role: "alert" }, feedbackHubError(error)), button("다시 시도", "btn secondary", "button", retry));
  }
  async function showList(openHighlighted = false) {
    const ticket = ++revision;
    const list = el("div", { className: "feedback-hub-cards" });
    const status = el("p", { role: "status" }, "소개글을 불러오는 중…");
    const more = button("소개글 더 보기", "btn secondary", "button", () => load());
    more.hidden = true;
    content.replaceChildren(...(admin ? [button("+ 새 기능 소개 작성", "btn primary", "button", () => editFeature())] : []), status, list, more);
    let offset = 0, busy = false;
    async function load() {
      if (busy || !current(ticket)) return;
      busy = true;
      more.disabled = true;
      try {
        const data = await requestFeedbackHub("feature_list", { offset }, admin);
        if (!current(ticket)) return;
        if (openHighlighted && data.activeId && offset === 0) { showDetail(data.activeId); return; }
        for (const feature of data.items) {
          list.appendChild(el("article", { className: "feedback-hub-card" }, [
            el("span", { className: "feedback-hub-badge" }, feature.id === data.activeId ? "공지에 연결됨" : feature.isPublished ? "의견 모집 중" : "임시 저장"),
            admin ? el("h3", {}, feature.title) : el("h3", { className: "feedback-hub-card-heading" }, [
              button(feature.title, "feedback-hub-title-button", "button", () => showDetail(feature.id)),
            ]),
            admin ? el("p", {}, feature.description.length > 100 ? feature.description.slice(0, 100) + "…" : feature.description) : null,
            admin ? button("소개 · 의견 확인", "feedback-hub-link", "button", () => showDetail(feature.id)) : null,
          ]));
        }
        offset = data.nextOffset;
        more.textContent = "소개글 더 보기";
        status.textContent = list.children.length ? "" : "아직 등록된 새 기능 소개가 없어요. 자유 건의에서 의견을 남겨주세요.";
        more.hidden = offset === null;
      } catch (error) {
        if (current(ticket)) { status.textContent = feedbackHubError(error); more.textContent = "다시 시도"; more.hidden = false; }
      } finally { busy = false; more.disabled = false; }
    }
    await load();
  }
  async function showDetail(id) {
    const ticket = ++revision;
    content.replaceChildren(el("p", { role: "status" }, "소개글을 불러오는 중…"));
    try {
      const { feature } = await requestFeedbackHub("feature_detail", { featureId: id }, admin);
      if (!current(ticket)) return;
      const board = el("div", { className: "feedback-hub-board" });
      const actions = el("div", { className: "feedback-hub-actions" }, [button("‹ 소개 목록", "feedback-hub-back", "button", () => showList())]);
      const status = el("p", { role: "status" });
      if (admin) {
        actions.appendChild(button("소개 수정", "btn secondary", "button", () => editFeature(feature)));
        if (feature.isPublished) {
          const highlight = button("공지에 연결", "btn secondary", "button", async () => {
            highlight.disabled = true;
            try {
              await requestFeedbackHub("feature_highlight", { featureId: id }, true);
              if (current(ticket)) status.textContent = "스터디카페 공지를 누르면 이 소개글이 열립니다.";
            } catch (error) { if (current(ticket)) status.textContent = feedbackHubError(error); }
            finally { highlight.disabled = false; }
          });
          actions.appendChild(highlight);
        }
      }
      content.replaceChildren(actions, el("article", { className: "feedback-hub-detail" }, [
        el("span", { className: "feedback-hub-badge" }, feature.isPublished ? "의견 모집 중" : "임시 저장 · 관리자만 볼 수 있어요"),
        el("h3", {}, feature.title),
        el("div", { className: "feedback-hub-images" }, feature.images.map((image, i) => el("button", {
          type: "button", ariaLabel: `소개 사진 ${i + 1} 확대`,
          onclick: () => openPhotoModal({ photoUrl: image.url, type: feature.title, uploadedAt: feature.updatedAt }),
        }, [el("img", { src: image.url, alt: `${feature.title} 소개 사진 ${i + 1}`, loading: "lazy" })]))),
        el("p", { className: "feedback-hub-description" }, feature.description),
        el("p", { className: "feedback-hub-question" }, feature.question),
      ]), status, board);
      mountBoard(id, board);
    } catch (error) { if (current(ticket)) showError(error, () => showList()); }
  }
  function editFeature(feature = null) {
    if (!admin) return;
    const ticket = ++revision;
    const id = feature?.id || crypto.randomUUID();
    let pictures = (feature?.images || []).map((image) => ({ ...image }));
    let busy = false;
    const title = el("input", { type: "text", value: feature?.title || "", required: true, minLength: 2, maxLength: 120 });
    const description = el("textarea", { rows: 5, value: feature?.description || "", required: true, minLength: 2, maxLength: 3000, placeholder: "어떤 기능을 만들고 있는지 간략하게 설명해주세요." });
    const question = el("textarea", { rows: 2, value: feature?.question || "어떤 점이 도움이 될까요? 추가로 필요한 점도 알려주세요.", required: true, minLength: 2, maxLength: 300 });
    const published = el("input", { type: "checkbox", checked: feature?.isPublished === true });
    const file = el("input", { type: "file", accept: "image/jpeg,image/png,image/webp", multiple: true });
    const images = el("div", { className: "feedback-hub-image-editor" });
    const status = el("p", { role: "status", "aria-live": "polite" });
    const save = el("button", { className: "btn primary", type: "submit" }, "저장");
    const cancel = button("취소", "btn secondary", "button", () => feature ? showDetail(id) : showList());
    const controls = [title, description, question, published, file, save, cancel, previewTab, freeTab];
    function setBusy(value) { busy = value; controls.forEach((node) => { node.disabled = value; }); renderImages(); }
    function renderImages() {
      images.replaceChildren(...pictures.map((picture, i) => el("div", {}, [
        el("img", { src: picture.url || picture.data, alt: `첨부 사진 ${i + 1}` }),
        el("button", { type: "button", disabled: busy, onclick: () => { pictures.splice(i, 1); renderImages(); } }, "삭제"),
      ])));
    }
    const field = (label, control) => el("label", { className: "feedback-hub-field" }, [el("span", {}, label), control]);
    const form = el("form", { className: "feedback-hub-editor" }, [
      el("h3", {}, feature ? "새 기능 소개 수정" : "새 기능 소개 작성"),
      field("제목", title), field("사진 (최대 3장)", file), images,
      field("기능 설명", description), field("유저에게 묻고 싶은 질문", question),
      el("label", { className: "feedback-hub-publish" }, [published, el("span", {}, "수강생에게 공개")]),
      el("p", {}, "체크를 해제하면 관리자만 볼 수 있는 임시 저장 글이 됩니다. 기존 의견은 보관됩니다."),
      status, el("div", { className: "feedback-hub-actions" }, [save, cancel]),
    ]);
    content.replaceChildren(form);
    renderImages();
    file.addEventListener("change", async () => {
      const files = Array.from(file.files || []);
      if (pictures.length + files.length > 3) { status.textContent = "사진은 최대 3장까지 첨부할 수 있어요."; file.value = ""; return; }
      setBusy(true);
      status.textContent = "사진을 준비하는 중…";
      try {
        const prepared = [];
        for (const selected of files) prepared.push(await prepareQuestionImage(selected));
        if (current(ticket)) { pictures.push(...prepared); status.textContent = ""; }
      } catch (error) { if (current(ticket)) status.textContent = feedbackHubError(error); }
      finally { file.value = ""; setBusy(false); }
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (busy || !current(ticket)) return;
      setBusy(true);
      status.textContent = "저장 중…";
      try {
        const data = await requestFeedbackHub("feature_save", {
          featureId: id, title: title.value, description: description.value, question: question.value,
          isPublished: published.checked, retainedImagePaths: pictures.filter((p) => p.path).map((p) => p.path),
          images: pictures.filter((p) => !p.path).map((p) => ({ data: p.data, contentType: p.contentType })),
        }, true);
        if (current(ticket)) { setBusy(false); await showDetail(data.feature.id); }
      } catch (error) { if (current(ticket)) status.textContent = feedbackHubError(error); }
      finally { setBusy(false); }
    });
  }
  return { element, start: () => select("features") };
}
