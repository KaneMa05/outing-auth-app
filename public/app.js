const STORAGE_KEY = "ronpark_outing_auth_v2";
const APP_MODE = document.body.dataset.appMode === "teacher" ? "teacher" : "student";
const RETURN_QR_ROUTE = "return-qr";

const state = loadState();
let currentRoute = defaultRoute();

const app = document.querySelector("#app");
const title = document.querySelector("#page-title");
const toast = document.querySelector("#toast");
const topActions = document.querySelector(".top-actions");
const seedButton = document.querySelector("#seed-demo");
const resetButton = document.querySelector("#reset-data");
const remoteStore = createRemoteStore();
let isRemoteLoading = false;
let remoteSaveTimer = null;
currentRoute = normalizeRoute(location.hash.replace("#", "") || defaultRoute());

const routeTitles = {
  student: "외출 체크리스트",
  "student-out": "외출 신청",
  "student-verify": "사진 인증",
  "student-return": "복귀 반납",
  teacher: "교사용 관리",
};

document.querySelectorAll("[data-route]").forEach((button) => {
  button.addEventListener("click", () => navigate(button.dataset.route));
});

if (seedButton) {
  seedButton.addEventListener("click", () => {
    seedDemo();
    render();
    notify("샘플 학생과 외출 신청을 추가했습니다.");
  });
}

if (resetButton) {
  resetButton.addEventListener("click", () => {
    if (!confirm("저장된 학생과 외출 기록을 모두 삭제할까요?")) return;
    localStorage.removeItem(STORAGE_KEY);
    Object.assign(state, defaultState());
    render();
    notify("데이터를 초기화했습니다.");
  });
}

window.addEventListener("hashchange", () => {
  currentRoute = normalizeRoute(location.hash.replace("#", "") || defaultRoute());
  render();
});

render();
initRemoteStore();

function normalizeRoute(route) {
  const legacy = {
    dashboard: "teacher",
    out: "student",
    verify: "student",
    return: "student",
    "student-out": "student",
    "student-verify": "student",
    "student-return": "student",
    students: "teacher",
    settings: "teacher",
  };
  const normalized = legacy[route] || route;
  if (APP_MODE === "teacher") return "teacher";
  if (normalized === RETURN_QR_ROUTE) {
    state.settings.returnUnlocked = true;
    state.settings.studentStep = "return";
    saveState();
    return "student";
  }
  return normalized === "student" ? normalized : "student";
}

function defaultRoute() {
  return APP_MODE === "teacher" ? "teacher" : "student";
}

function navigate(route) {
  location.hash = route;
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return saved || defaultState();
  } catch {
    return defaultState();
  }
}

function defaultState() {
  return {
    settings: {
      appName: "론박스터디 외출 인증",
      className: "오프라인반",
      lastStudentId: "",
      studentStep: "request",
      returnUnlocked: false,
    },
    students: [],
    outings: [],
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  scheduleRemoteSave();
}

function createRemoteStore() {
  const config = window.OUTING_APP_CONFIG || {};
  const hasConfig = Boolean(config.supabaseUrl && config.supabaseAnonKey);
  const hasSdk = Boolean(window.supabase && window.supabase.createClient);
  if (!hasConfig || !hasSdk) return null;
  return window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
}

async function initRemoteStore() {
  if (!remoteStore) return;
  isRemoteLoading = true;
  try {
    await loadStateFromRemote();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    render();
    notify("Supabase 데이터와 연결되었습니다.");
  } catch (error) {
    console.error(error);
    notify("Supabase 연결을 확인해주세요. 임시로 이 기기 저장소를 사용합니다.");
  } finally {
    isRemoteLoading = false;
  }
}

function scheduleRemoteSave() {
  if (!remoteStore || isRemoteLoading) return;
  window.clearTimeout(remoteSaveTimer);
  remoteSaveTimer = window.setTimeout(() => {
    saveStateToRemote().catch((error) => {
      console.error(error);
      notify("Supabase 저장 중 오류가 발생했습니다.");
    });
  }, 250);
}

async function loadStateFromRemote() {
  const [{ data: students, error: studentsError }, { data: outings, error: outingsError }, { data: photos, error: photosError }] =
    await Promise.all([
      remoteStore.from("students").select("*").order("created_at", { ascending: true }),
      remoteStore.from("outings").select("*").order("created_at", { ascending: false }),
      remoteStore.from("outing_photos").select("*").order("uploaded_at", { ascending: true }),
    ]);

  if (studentsError) throw studentsError;
  if (outingsError) throw outingsError;
  if (photosError) throw photosError;

  state.students = (students || []).map((student) => ({
    id: student.id,
    name: student.name,
    className: student.class_name,
    phone: student.phone || "",
    createdAt: student.created_at,
  }));

  state.outings = (outings || []).map((outing) => ({
    id: outing.id,
    studentId: outing.student_id,
    studentName: outing.student_name || "",
    className: outing.class_name || "",
    reason: outing.reason,
    detail: outing.detail || "",
    expectedReturn: outing.expected_return || "",
    status: outing.status,
    decision: outing.decision,
    teacherMemo: outing.teacher_memo || "",
    receiptNote: outing.receipt_note || "",
    photos: (photos || [])
      .filter((photo) => photo.outing_id === outing.id)
      .map((photo) => ({
        id: photo.id,
        type: photo.photo_type,
        name: photo.original_name || "",
        dataUrl: photo.data_url || "",
        uploadedAt: photo.uploaded_at,
      })),
    createdAt: outing.created_at,
    verifiedAt: outing.verified_at,
    returnedAt: outing.returned_at,
  }));
}

async function saveStateToRemote() {
  const studentRows = state.students.map((student) => ({
    id: student.id,
    name: student.name,
    class_name: student.className,
    phone: student.phone || null,
    created_at: student.createdAt || new Date().toISOString(),
  }));

  const outingRows = state.outings.map((outing) => ({
    id: outing.id,
    student_id: outing.studentId,
    student_name: outing.studentName,
    class_name: outing.className,
    reason: outing.reason,
    detail: outing.detail || null,
    expected_return: outing.expectedReturn || null,
    status: outing.status,
    decision: outing.decision,
    receipt_note: outing.receiptNote || null,
    teacher_memo: outing.teacherMemo || null,
    created_at: outing.createdAt,
    verified_at: outing.verifiedAt,
    returned_at: outing.returnedAt,
  }));

  const photoRows = state.outings.flatMap((outing) =>
    outing.photos.map((photo) => ({
      id: photo.id,
      outing_id: outing.id,
      photo_type: photo.type,
      data_url: photo.dataUrl,
      original_name: photo.name || null,
      uploaded_at: photo.uploadedAt,
    }))
  );

  const { error: deletePhotosError } = await remoteStore.from("outing_photos").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (deletePhotosError) throw deletePhotosError;
  const { error: deleteOutingsError } = await remoteStore.from("outings").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (deleteOutingsError) throw deleteOutingsError;
  const { error: deleteStudentsError } = await remoteStore.from("students").delete().neq("id", "__never__");
  if (deleteStudentsError) throw deleteStudentsError;

  if (studentRows.length) {
    const { error } = await remoteStore.from("students").insert(studentRows);
    if (error) throw error;
  }
  if (outingRows.length) {
    const { error } = await remoteStore.from("outings").insert(outingRows);
    if (error) throw error;
  }
  if (photoRows.length) {
    const { error } = await remoteStore.from("outing_photos").insert(photoRows);
    if (error) throw error;
  }
}

function render() {
  if (location.hash !== `#${currentRoute}`) {
    history.replaceState(null, "", `${location.href.split("#")[0]}#${currentRoute}`);
  }

  document.querySelectorAll("[data-route]").forEach((button) => {
    button.classList.toggle("active", button.dataset.route === currentRoute);
  });

  title.textContent = routeTitles[currentRoute] || routeTitles["student-out"];
  if (topActions) topActions.hidden = APP_MODE !== "teacher";

  const routes = {
    student: renderStudentChecklist,
    "student-out": renderStudentOut,
    "student-verify": renderStudentVerify,
    "student-return": renderStudentReturn,
    teacher: renderTeacher,
  };

  app.innerHTML = "";
  app.appendChild((routes[currentRoute] || renderStudentChecklist)());
}

function renderStudentChecklist() {
  const step = state.settings.studentStep || "request";
  if (step === "verify") return studentStepView("사진 인증", createVerifyForm(), "photo-step");
  if (step === "return") return studentStepView("복귀 반납", createReturnForm(), "return-step");
  if (step === "done") return el("div", { className: "grid student-view" }, [panel("복귀 완료", [renderDoneState()])]);
  return studentStepView("외출 신청", createOutForm(), "request-step", false);
}

function studentStepView(heading, content, id, showReset = true) {
  const children = [content];
  if (showReset) children.push(resetStudentButton());
  return el("div", { className: "grid student-view" }, [panel(heading, children, id)]);
}

function renderStudentOut() {
  return studentShell("외출 신청", "학생은 고유번호로 신청만 남깁니다. 승인/반려는 교사용 화면에서 처리합니다.", [
    panel("신청 정보", [createOutForm()]),
    panel("내 진행 상태 확인", [studentLookup("신청 상태 보기")]),
  ]);
}

function createOutForm() {
  const form = el("form", { className: "form-grid" }, [
    field("학생 고유번호", input("studentId", "text", "예: 18004"), "", "예: 18기 4번 → 18004"),
    field("외출 사유", select("reason", ["병원", "은행", "수영레슨", "개인 사유 인증", "기타"])),
    field("예상 복귀 시각", input("expectedReturn", "time")),
    field("상세 사유", textarea("detail", "방문 장소나 필요한 내용을 입력하세요."), "full"),
    el("div", { className: "field full" }, [
      button("외출 신청하기", "btn"),
    ]),
  ]);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = formData(form);
    const student = findStudent(data.studentId);
    if (!student) return notify("등록된 학생 고유번호가 아닙니다. 교사용 관리에서 학생을 먼저 등록해주세요.");
    if (getActiveOuting(data.studentId)) return notify("이미 진행 중인 외출 신청이 있습니다.");

    state.outings.unshift({
      id: createId(),
      studentId: student.id,
      studentName: student.name,
      className: student.className,
      reason: data.reason,
      detail: data.detail.trim(),
      expectedReturn: data.expectedReturn,
      status: "requested",
      decision: "pending",
      teacherMemo: "",
      receiptNote: "",
      photos: [],
      createdAt: new Date().toISOString(),
      verifiedAt: null,
      returnedAt: null,
    });
    state.settings.lastStudentId = student.id;
    state.settings.studentStep = "verify";
    saveState();
    form.reset();
    render();
    notify("외출 신청이 접수되었습니다. 사진 인증을 진행하세요.");
  });

  return form;
}

function renderStudentVerify() {
  return studentShell("사진 인증", "외출 장소나 영수증 사진을 제출하면 교사용 화면에서 바로 확인됩니다.", [
    panel("인증 제출", [createVerifyForm()]),
    panel("내 진행 상태 확인", [studentLookup("인증 상태 보기")]),
  ]);
}

function createVerifyForm() {
  const form = el("form", { className: "form-grid" }, [
    field("현장 인증 사진", fileInput("sitePhoto"), "full"),
    field("영수증 인증 사진", fileInput("receiptPhoto"), "full"),
    el("div", { className: "field full" }, [button("사진 인증 제출", "btn")]),
  ]);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const outing = getActiveOuting(state.settings.lastStudentId);
    if (!outing) return notify("진행 중인 외출 신청이 없습니다.");

    const sitePhoto = form.elements.sitePhoto.files[0];
    const receiptPhoto = form.elements.receiptPhoto.files[0];
    if (!sitePhoto || !receiptPhoto) return notify("현장 인증 사진과 영수증 인증 사진을 모두 업로드해주세요.");

    outing.photos = outing.photos.filter((photo) => photo.type !== "현장 인증" && photo.type !== "영수증 인증");
    outing.photos.push(
      {
        id: createId(),
        type: "현장 인증",
        name: sitePhoto.name,
        dataUrl: await readFile(sitePhoto),
        uploadedAt: new Date().toISOString(),
      },
      {
        id: createId(),
        type: "영수증 인증",
        name: receiptPhoto.name,
        dataUrl: await readFile(receiptPhoto),
        uploadedAt: new Date().toISOString(),
      }
    );
    outing.receiptNote = "";
    outing.status = outing.status === "returned" ? "returned" : "verified";
    outing.verifiedAt = new Date().toISOString();
    state.settings.lastStudentId = outing.studentId;
    state.settings.studentStep = "return";
    state.settings.returnUnlocked = false;
    saveState();
    form.reset();
    render();
    notify("사진 인증이 제출되었습니다. 복귀 후 반납 처리하세요.");
  });

  return form;
}

function renderStudentReturn() {
  return studentShell("복귀 반납", "복귀 시간을 남기면 교사가 한 페이지에서 최종 상태를 확인할 수 있습니다.", [
    panel("복귀 처리", [createReturnForm()]),
    panel("내 진행 상태 확인", [studentLookup("복귀 상태 보기")]),
  ]);
}

function createReturnForm() {
  if (!state.settings.returnUnlocked) {
    return el("div", { className: "qr-lock" }, [
      el("h3", {}, "현장 QR 확인 필요"),
      el("p", { className: "subtle" }, "복귀 반납은 학원 현장에 있는 복귀 QR을 휴대폰 카메라로 찍어 들어온 경우에만 진행할 수 있습니다."),
    ]);
  }

  const form = el("form", { className: "form-grid" }, [
    field("학생 고유번호", input("studentId", "text", "예: 18004", state.settings.lastStudentId || ""), "", "예: 18기 4번 → 18004"),
    el("div", { className: "field full" }, [
      button("복귀 반납 완료", "btn"),
      el("p", { className: "subtle" }, "복귀 후 반드시 반납 완료를 눌러야 교사용 화면에 복귀 시간이 기록됩니다."),
    ]),
  ]);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = formData(form);
    const outing = getActiveOuting(data.studentId);
    if (!outing) return notify("진행 중인 외출 신청이 없습니다.");
    outing.status = "returned";
    outing.returnedAt = new Date().toISOString();
    state.settings.lastStudentId = outing.studentId;
    state.settings.studentStep = "done";
    state.settings.returnUnlocked = false;
    saveState();
    form.reset();
    render();
    notify("복귀 반납이 완료되었습니다.");
  });

  return form;
}

function renderTeacher() {
  const active = state.outings.filter((outing) => outing.status !== "returned");
  const requested = state.outings.filter((outing) => outing.decision === "pending");
  const verified = state.outings.filter((outing) => outing.photos.length > 0 || outing.receiptNote);
  const returnedToday = state.outings.filter((outing) => isToday(outing.returnedAt));

  return el("div", { className: "grid" }, [
    el("div", { className: "grid stats" }, [
      stat("등록 학생", state.students.length),
      stat("처리 대기", requested.length),
      stat("외출 중", active.length),
      stat("오늘 복귀", returnedToday.length),
    ]),
    panel("학생 등록", [teacherStudentForm()]),
    panel("외출 신청 전체 관리", [
      el("p", { className: "subtle" }, "신청 내용, 사진 인증, 복귀 시간, 교사 판단을 한 페이지에서 확인하고 처리합니다."),
      state.outings.length
        ? renderOutingList(state.outings, { teacher: true })
        : el("div", { className: "empty" }, "아직 외출 신청이 없습니다."),
    ]),
    panel("학생용 링크", [
      el("div", { className: "grid two" }, [
        linkBox("학생용 외출 체크리스트", makeStudentUrl("student")),
        linkBox("현장 복귀 QR 주소", makeStudentUrl(RETURN_QR_ROUTE)),
      ]),
    ]),
  ]);
}

function renderDoneState() {
  const outing = getLatestOuting(state.settings.lastStudentId);
  return el("div", { className: "grid" }, [
    outing ? outingCard(outing) : el("div", { className: "empty" }, "완료된 외출 기록을 찾지 못했습니다."),
    resetStudentButton("새 외출 신청"),
  ]);
}

function resetStudentButton(label = "처음부터 다시") {
  return button(label, "btn secondary", "button", () => {
    state.settings.studentStep = "request";
    state.settings.returnUnlocked = false;
    saveState();
    render();
    notify("외출 신청 단계로 돌아왔습니다.");
  });
}

function teacherStudentForm() {
  const form = el("form", { className: "form-grid" }, [
    field("학생 고유번호", input("id", "text", "예: 18004"), "", "예: 18기 4번 → 18004"),
    field("이름", input("name", "text", "예: 홍길동")),
    field("반", input("className", "text", "오프라인반", state.settings.className)),
    field("연락처", input("phone", "tel", "선택 입력")),
    el("div", { className: "field full" }, [button("학생 등록/수정", "btn")]),
  ]);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = formData(form);
    if (!data.id.trim() || !data.name.trim()) return notify("학생 고유번호와 이름을 입력해주세요.");
    const existing = findStudent(data.id);
    const payload = {
      id: data.id.trim(),
      name: data.name.trim(),
      className: data.className.trim() || state.settings.className,
      phone: data.phone.trim(),
      createdAt: existing?.createdAt || new Date().toISOString(),
    };
    if (existing) Object.assign(existing, payload);
    else state.students.push(payload);
    saveState();
    form.reset();
    render();
    notify(existing ? "학생 정보를 수정했습니다." : "학생을 등록했습니다.");
  });

  const rows = state.students.map((student) =>
    el("tr", {}, [
      el("td", {}, student.id),
      el("td", {}, student.name),
      el("td", {}, student.className),
      el("td", {}, student.phone || "-"),
    ])
  );

  return el("div", { className: "grid" }, [
    form,
    rows.length ? table(["고유번호", "이름", "반", "연락처"], rows) : el("div", { className: "empty" }, "등록된 학생이 없습니다."),
  ]);
}

function studentShell(heading, copy, children) {
  return el("div", { className: "grid student-view" }, [
    el("section", { className: "student-hero" }, [el("h2", {}, heading), el("p", {}, copy)]),
    ...children,
  ]);
}

function studentLookup(buttonText) {
  const form = el("form", { className: "form-grid" }, [
    field("학생 고유번호", input("studentId", "text", "예: 18004"), "", "예: 18기 4번 → 18004"),
    el("div", { className: "field full" }, [button(buttonText, "btn secondary")]),
  ]);
  const result = el("div", { className: "lookup-result" });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = formData(form);
    const outing = getLatestOuting(data.studentId);
    if (outing) {
      state.settings.lastStudentId = outing.studentId;
      saveState();
    }
    result.innerHTML = "";
    result.appendChild(outing ? outingCard(outing) : el("div", { className: "empty" }, "최근 외출 신청을 찾지 못했습니다."));
  });

  return el("div", { className: "grid" }, [form, result]);
}

function renderOutingList(outings, options = {}) {
  return el(
    "div",
    { className: "grid" },
    outings.map((outing) => outingCard(outing, options))
  );
}

function outingCard(outing, options = {}) {
  const nodes = [
    el("div", { className: "outing-head" }, [
      el("div", {}, [
        el("h3", {}, `${outing.studentName} (${outing.studentId})`),
        el("p", { className: "outing-meta" }, [
          `${outing.className} · ${outing.reason}`,
          el("br"),
          `신청 ${formatTime(outing.createdAt)} · 예상 복귀 ${outing.expectedReturn || "-"}`,
          outing.verifiedAt ? ` · 인증 ${formatTime(outing.verifiedAt)}` : "",
          outing.returnedAt ? ` · 복귀 ${formatTime(outing.returnedAt)}` : "",
        ]),
      ]),
      statusBadge(outing),
    ]),
  ];

  nodes.push(
    el("div", { className: "detail-grid" }, [
      detailItem("상세 사유", outing.detail || "-"),
      detailItem("교사 판단", decisionText(outing.decision)),
      detailItem("복귀 상태", outing.status === "returned" ? "복귀 완료" : "복귀 전"),
      detailItem("사진 인증", outing.photos.length ? `${outing.photos.length}장 업로드` : "미제출"),
    ])
  );

  if (outing.photos.length) {
    nodes.push(
      el(
        "div",
        { className: "photo-grid" },
        outing.photos.map((photo) =>
          el("div", { className: "photo-thumb" }, [
            el("img", { src: photo.dataUrl, alt: photo.type }),
            el("span", {}, `${photo.type} · ${photo.name}`),
          ])
        )
      )
    );
  }

  if (options.teacher) {
    nodes.push(
      el("div", { className: "action-row" }, [
        button("승인", "btn secondary", "button", () => decideOuting(outing.id, "approved")),
        button("반려", "btn danger", "button", () => decideOuting(outing.id, "rejected")),
        button("메모", "icon-btn", "button", () => {
          const memo = prompt("교사용 메모", outing.teacherMemo || "");
          if (memo === null) return;
          outing.teacherMemo = memo;
          saveState();
          render();
        }),
      ])
    );
    if (outing.teacherMemo) nodes.push(el("p", { className: "subtle" }, `교사용 메모: ${outing.teacherMemo}`));
  }

  return el("article", { className: "outing-card" }, nodes);
}

function detailItem(label, value) {
  return el("div", { className: "detail-item" }, [el("span", {}, label), el("strong", {}, value)]);
}

function decideOuting(id, decision) {
  const outing = state.outings.find((item) => item.id === id);
  if (!outing) return;
  outing.decision = decision;
  saveState();
  render();
  notify(decision === "approved" ? "승인 처리했습니다." : "반려 처리했습니다.");
}

function stat(label, value) {
  return el("div", { className: "stat" }, [el("span", {}, label), el("strong", {}, String(value))]);
}

function panel(heading, children, id = "") {
  const props = id ? { className: "panel", id } : { className: "panel" };
  return el("section", props, [el("h2", {}, heading), ...children]);
}

function linkBox(label, url) {
  return el("div", { className: "outing-card" }, [
    el("h3", {}, label),
    el("p", { className: "subtle" }, url),
    button("주소 복사", "btn secondary", "button", async () => {
      await copyText(url);
      notify("주소를 복사했습니다.");
    }),
  ]);
}

function field(label, control, extraClass = "", hint = "") {
  const nodes = [el("span", {}, label)];
  if (hint) nodes.push(el("small", { className: "field-hint" }, hint));
  nodes.push(control);
  return el("label", { className: `field ${extraClass}`.trim() }, nodes);
}

function input(name, type, placeholder, value = "") {
  return el("input", { name, type, placeholder, value, autocomplete: "off" });
}

function fileInput(name) {
  return el("input", { name, type: "file", accept: "image/*" });
}

function textarea(name, placeholder) {
  return el("textarea", { name, placeholder });
}

function select(name, options) {
  return el(
    "select",
    { name },
    options.map((option) => el("option", { value: option }, option))
  );
}

function button(text, className, type = "submit", onClick) {
  const node = el("button", { className, type }, text);
  if (onClick) node.addEventListener("click", onClick);
  return node;
}

function table(headers, rows) {
  return el("div", { className: "table-wrap" }, [
    el("table", {}, [
      el("thead", {}, [el("tr", {}, headers.map((header) => el("th", {}, header)))]),
      el("tbody", {}, rows),
    ]),
  ]);
}

function statusBadge(outing) {
  if (outing.decision === "approved") return el("span", { className: "badge approved" }, "승인");
  if (outing.decision === "rejected") return el("span", { className: "badge rejected" }, "반려");
  const labels = {
    requested: "신청 대기",
    verified: "인증 제출",
    returned: "복귀 완료",
  };
  return el("span", { className: `badge ${outing.status}` }, labels[outing.status] || "신청 대기");
}

function decisionText(decision) {
  if (decision === "approved") return "승인";
  if (decision === "rejected") return "반려";
  return "대기";
}

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function findStudent(id) {
  return state.students.find((student) => student.id === String(id).trim());
}

function getActiveOuting(studentId) {
  return state.outings.find((outing) => outing.studentId === String(studentId).trim() && outing.status !== "returned");
}

function getLatestOuting(studentId) {
  return state.outings.find((outing) => outing.studentId === String(studentId).trim());
}

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function makeUrl(route) {
  return `${location.href.split("#")[0]}#${route}`;
}

function makeStudentUrl(route) {
  const base = location.href.split("#")[0].replace(/teacher\.html$/i, "index.html");
  return `${base}#${route}`;
}

function formatTime(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function isToday(value) {
  if (!value) return false;
  const date = new Date(value);
  const today = new Date();
  return date.toDateString() === today.toDateString();
}

function notify(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 2400);
}

function focusSection(id) {
  const section = document.getElementById(id);
  if (!section) return;
  section.scrollIntoView({ behavior: "smooth", block: "start" });
  const firstField = section.querySelector("input, select, textarea, button");
  if (firstField) firstField.focus({ preventScroll: true });
}

async function copyText(text) {
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const helper = el("textarea", { value: text, style: "position:fixed;left:-9999px;top:0" });
  document.body.appendChild(helper);
  helper.select();
  document.execCommand("copy");
  helper.remove();
}

function seedDemo() {
  if (!state.students.some((student) => student.id === "240001")) {
    state.students.push(
      { id: "240001", name: "홍길동", className: "오프라인반", phone: "010-0000-0001", createdAt: new Date().toISOString() },
      { id: "240002", name: "김민지", className: "오프라인반", phone: "010-0000-0002", createdAt: new Date().toISOString() }
    );
  }
  if (!state.outings.length) {
    state.outings.push({
      id: createId(),
      studentId: "240001",
      studentName: "홍길동",
      className: "오프라인반",
      reason: "병원",
      detail: "근처 병원 진료",
      expectedReturn: "18:30",
      status: "requested",
      decision: "pending",
      teacherMemo: "",
      receiptNote: "",
      photos: [],
      createdAt: new Date().toISOString(),
      verifiedAt: null,
      returnedAt: null,
    });
  }
  saveState();
}

function createId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([key, value]) => {
    if (key === "className") node.className = value;
    else if (key === "style") node.setAttribute("style", value);
    else if (key in node) node[key] = value;
    else node.setAttribute(key, value);
  });

  const items = Array.isArray(children) ? children : [children];
  items.flat().forEach((child) => {
    if (child === null || child === undefined || child === "") return;
    node.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  });
  return node;
}
