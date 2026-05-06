const STORAGE_KEY = "ronpark_outing_auth_v2";
const APP_MODE = document.body.dataset.appMode === "teacher" ? "teacher" : "student";

const state = loadState();
let currentRoute = "";

const app = document.querySelector("#app");
const title = document.querySelector("#page-title");
const toast = document.querySelector("#toast");
const topActions = document.querySelector(".top-actions");
const seedButton = document.querySelector("#seed-demo");
const resetButton = document.querySelector("#reset-data");
const remoteStore = createRemoteStore();
let isRemoteLoading = false;
let isRemoteSaving = false;
let remoteSaveTimer = null;
let hasPendingRemoteSave = false;
let remoteRefreshTimer = null;
let deferredInstallPrompt = null;
const teacherAuth = {
  checked: APP_MODE !== "teacher",
  authenticated: APP_MODE !== "teacher",
};

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  render();
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  notify("홈화면에 추가되었습니다.");
  render();
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error) => console.error(error));
  });
}

function normalizeCoastGuardTrack(track) {
  const value = String(track || "").trim();
  const aliases = {
    공채: "경찰직 - 공채(순경)",
    해경학과: "경찰직 - 해경학과 항해(경장)",
    함정요원: "경찰직 - 함정요원 항해(경장)",
    구조: "경찰직 - 구조(순경)",
    구급: "경찰직 - 구급(순경)",
    선박교통관제: "일반직 - 선박교통관제(VTS)",
    선박관제: "일반직 - 선박교통관제(VTS)",
    VTS: "경찰직 - 해상교통관제(VTS)(순경)",
    해상교통관제: "경찰직 - 해상교통관제(VTS)(순경)",
    기타: "기타",
  };
  return aliases[value] || value;
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
      studentAuthId: "",
      studentProfiles: {},
      studentStep: "request",
      earlyLeaveMode: false,
      completionType: "",
    },
    students: [],
    outings: [],
    deletedOutings: [],
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
    const registrationChanged = reconcileStudentRegistrationFromRemote();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (registrationChanged || !shouldPreserveStudentAuthForm()) render();
    startRemoteRefresh();
  } catch (error) {
    console.error(error);
    notify("Supabase 저장 중 오류가 발생했습니다.");
  } finally {
    isRemoteLoading = false;
  }
}

function startRemoteRefresh() {
  if (!remoteStore || APP_MODE !== "student" || remoteRefreshTimer) return;
  remoteRefreshTimer = window.setInterval(refreshStateFromRemote, 10000);
  window.addEventListener("focus", refreshStateFromRemote);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshStateFromRemote();
  });
}

async function refreshStateFromRemote() {
  if (!remoteStore || isRemoteLoading || isRemoteSaving || hasPendingRemoteSave) return;
  isRemoteLoading = true;
  try {
    await loadStateFromRemote();
    const registrationChanged = reconcileStudentRegistrationFromRemote();
    const preserveAuthForm = shouldPreserveStudentAuthForm();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (registrationChanged || !preserveAuthForm) render();
    if (registrationChanged) notify("앱 등록이 초기화되었습니다. 다시 등록해주세요.");
  } catch (error) {
    console.error(error);
  } finally {
    isRemoteLoading = false;
  }
}

function reconcileStudentRegistrationFromRemote() {
  if (APP_MODE !== "student") return false;
  const studentId = String(state.settings.studentAuthId || "").trim();
  const profile = getStudentProfile(studentId);
  const student = findStudent(studentId);
  if (!studentId || !profile?.deviceToken || !student || student.appRegisteredAt) return false;
  if (isRecentStudentRegistration(profile)) return false;

  delete state.settings.studentProfiles[studentId];
  state.settings.studentAuthId = "";
  if (state.settings.lastStudentId === studentId) state.settings.lastStudentId = "";
  return true;
}

function isRecentStudentRegistration(profile) {
  const authedAt = profile?.authedAt ? new Date(profile.authedAt).getTime() : 0;
  return authedAt && Date.now() - authedAt < 120000;
}

function shouldPreserveStudentAuthForm() {
  if (APP_MODE !== "student" || getAuthedStudent()) return false;
  const authForm = app?.querySelector(".student-auth-card");
  if (!authForm) return false;

  const active = document.activeElement;
  if (active && authForm.contains(active)) return true;

  const textInputs = [...authForm.querySelectorAll("input")].filter((input) =>
    ["studentId", "password", "customTrack"].includes(input.name)
  );
  if (textInputs.some((input) => String(input.value || "").trim())) return true;

  const profileArea = authForm.querySelector(".student-auth-profile");
  return Boolean(profileArea && !profileArea.hidden);
}

function scheduleRemoteSave() {
  if (!remoteStore || isRemoteLoading) return;
  hasPendingRemoteSave = true;
  window.clearTimeout(remoteSaveTimer);
  remoteSaveTimer = window.setTimeout(() => {
    remoteSaveTimer = null;
    hasPendingRemoteSave = false;
    isRemoteSaving = true;
    saveStateToRemote()
      .catch((error) => {
        console.error(error);
        notify("Supabase 저장 중 오류가 발생했습니다.");
      })
      .finally(() => {
        isRemoteSaving = false;
      });
  }, 250);
}

async function loadStateFromRemote() {
  const studentColumns = "id,name,class_name,track,gender,app_registered_at,is_active,created_at";
  const outingColumns = [
    "id",
    "student_id",
    "student_name",
    "class_name",
    "reason",
    "detail",
    "expected_return",
    "status",
    "decision",
    "receipt_note",
    "early_leave_reason",
    "created_at",
    "verified_at",
    "returned_at",
    "deleted_at",
  ].join(",");
  const photoColumns = "id,outing_id,photo_type,data_url,original_name,uploaded_at";
  const [{ data: students, error: studentsError }, { data: outings, error: outingsError }, { data: photos, error: photosError }] =
    await Promise.all([
      remoteStore.from("students").select(studentColumns).order("created_at", { ascending: true }),
      remoteStore.from("outings").select(outingColumns).order("created_at", { ascending: false }),
      remoteStore.from("outing_photos").select(photoColumns).order("uploaded_at", { ascending: true }),
    ]);

  if (studentsError) throw studentsError;
  if (outingsError) throw outingsError;
  if (photosError) throw photosError;

  state.students = (students || []).map((student) => ({
    id: student.id,
    name: student.name,
    className: student.class_name,
    track: normalizeCoastGuardTrack(student.track),
    gender: student.gender || "",
    passwordHash: "",
    appRegisteredAt: student.app_registered_at || "",
    createdAt: student.created_at,
  }));

  const mappedOutings = (outings || []).map((outing) => ({
    id: outing.id,
    studentId: outing.student_id,
    studentName: outing.student_name || "",
    className: outing.class_name || "",
    reason: outing.reason,
    detail: outing.detail || "",
    expectedReturn: outing.expected_return || "",
    status: outing.status,
    decision: outing.decision,
    teacherMemo: "",
    earlyLeaveReason: outing.early_leave_reason || "",
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
    deletedAt: outing.deleted_at || "",
  }));
  state.outings = mappedOutings.filter((outing) => !outing.deletedAt);
  state.deletedOutings = mappedOutings.filter((outing) => outing.deletedAt);
}

async function saveStateToRemote() {
  const rosterRows = state.students
    .filter((student) => student.id && student.name)
    .map((student) => ({
      id: student.id,
      name: student.name,
      class_name: student.className || state.settings.className || "오프라인반",
      is_active: true,
      created_at: student.createdAt || new Date().toISOString(),
    }));

  if (rosterRows.length) {
    const { error } = await remoteStore
      .from("students")
      .upsert(rosterRows, { onConflict: "id", ignoreDuplicates: true });
    if (error) throw error;
  }

  const registeredStudents = state.students
    .map((student) => {
      const profile = getStudentProfile(student.id) || {};
      return {
        ...student,
        track: normalizeCoastGuardTrack(student.track || profile.track),
        gender: student.gender || profile.gender || "",
        passwordHash: student.passwordHash || profile.passwordHash || "",
        deviceToken: student.deviceToken || profile.deviceToken || "",
        appRegisteredAt: student.appRegisteredAt || profile.authedAt || "",
      };
    })
    .filter((student) => student.passwordHash && student.deviceToken && student.appRegisteredAt);
  for (const student of registeredStudents) {
    const profileUpdate = {
      track: normalizeCoastGuardTrack(student.track) || null,
      gender: student.gender || null,
      password_hash: student.passwordHash,
      device_token: student.deviceToken || null,
      app_registered_at: student.appRegisteredAt,
    };
    const { error } = await remoteStore.from("students").update(profileUpdate).eq("id", student.id);
    if (isMissingColumnError(error, "device_token")) {
      delete profileUpdate.device_token;
      const { error: fallbackError } = await remoteStore.from("students").update(profileUpdate).eq("id", student.id);
      if (fallbackError) throw fallbackError;
      continue;
    }
    if (error) throw error;
  }

  const activeOutings = state.outings.filter((outing) => !outing.deletedAt);
  const newRequestRows = activeOutings
    .filter((outing) => outing.status === "requested" && outing.decision === "pending")
    .map((outing) => ({
      id: outing.id,
      student_id: outing.studentId,
      student_name: outing.studentName,
      class_name: outing.className,
      reason: outing.reason,
      detail: outing.detail || null,
      expected_return: outing.expectedReturn || null,
      status: "requested",
      decision: "pending",
      receipt_note: outing.receiptNote || null,
      created_at: outing.createdAt,
      verified_at: null,
      returned_at: null,
    }));

  if (newRequestRows.length) {
    const { error } = await remoteStore
      .from("outings")
      .upsert(newRequestRows, { onConflict: "id", ignoreDuplicates: true });
    if (error) throw error;
  }

  const statusRows = activeOutings
    .filter((outing) => ["verified", "returned"].includes(outing.status))
    .map((outing) => ({
      id: outing.id,
      status: outing.status,
      receipt_note: outing.receiptNote || null,
      verified_at: outing.verifiedAt,
      returned_at: outing.returnedAt,
    }));

  for (const outing of statusRows) {
    const { error } = await remoteStore
      .from("outings")
      .update({
        status: outing.status,
        receipt_note: outing.receipt_note,
        verified_at: outing.verified_at,
        returned_at: outing.returned_at,
      })
      .eq("id", outing.id);
    if (error) throw error;
  }

  const deletedRows = (state.deletedOutings || [])
    .filter((outing) => outing.id && outing.deletedAt)
    .map((outing) => ({
      id: outing.id,
      deleted_at: outing.deletedAt,
    }));

  for (const outing of deletedRows) {
    const { error } = await remoteStore
      .from("outings")
      .update({
        deleted_at: outing.deleted_at,
      })
      .eq("id", outing.id);
    if (error) throw error;
  }

  const photoRows = activeOutings.flatMap((outing) =>
    outing.photos.map((photo) => ({
      id: photo.id,
      outing_id: outing.id,
      photo_type: photo.type,
      data_url: photo.dataUrl,
      original_name: photo.name || null,
      uploaded_at: photo.uploadedAt,
    }))
  );

  if (photoRows.length) {
    const { error } = await remoteStore
      .from("outing_photos")
      .upsert(photoRows, { onConflict: "id", ignoreDuplicates: true });
    if (error) throw error;
  }
}

function isMissingColumnError(error, columnName) {
  if (!error) return false;
  const text = [error.message, error.details, error.hint, error.code].filter(Boolean).join(" ").toLowerCase();
  return text.includes(columnName.toLowerCase()) && (text.includes("column") || text.includes("schema cache"));
}

function renderOutingList(outings, options = {}) {
  return el(
    "div",
    { className: "grid" },
    outings.map((outing) => outingCard(outing, options))
  );
}

function renderOutingGroupsByDate(outings, options = {}) {
  const groups = outings.reduce((acc, outing) => {
    const key = formatDateKey(outing.createdAt);
    if (!acc.has(key)) acc.set(key, []);
    acc.get(key).push(outing);
    return acc;
  }, new Map());

  return el(
    "div",
    { className: "date-groups" },
    [...groups.entries()].map(([date, items]) =>
      el("section", { className: "date-group" }, [
        el("div", { className: "date-heading" }, [
          el("h3", {}, date),
          el("span", {}, String(items.length) + "건"),
        ]),
        renderOutingList(items, options),
      ])
    )
  );
}

function outingCard(outing, options = {}) {
  const nodes = [
    el("div", { className: "outing-head" }, [
      el("div", {}, [
        el("h3", {}, String(outing.studentName) + " (" + String(outing.studentId) + ")"),
        el("div", { className: "outing-meta-list" }, [
          metaChip("반", outing.className),
          metaChip("사유", outing.reason),
          metaChip("신청", formatTime(outing.createdAt)),
          metaChip("예상 복귀", formatExpectedReturn(outing.expectedReturn)),
          outing.verifiedAt ? metaChip("인증", formatTime(outing.verifiedAt)) : null,
          outing.returnedAt ? metaChip("복귀", formatTime(outing.returnedAt)) : null,
        ]),
      ]),
      statusBadge(outing),
    ]),
  ];

  nodes.push(outingDataTable(outing, options));

  if (outing.photos.length) {
    nodes.push(
      el(
        "div",
        { className: "photo-grid" },
        outing.photos.map((photo) =>
          el("div", { className: "photo-thumb" }, [
            el("img", { src: photo.dataUrl, alt: photo.type }),
            el("span", {}, photo.type),
            el("time", { dateTime: photo.uploadedAt || "" }, formatTime(photo.uploadedAt)),
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
        button("삭제", "icon-btn danger", "button", () => deleteOuting(outing.id)),
      ])
    );
    if (outing.teacherMemo) nodes.push(el("p", { className: "subtle" }, "교사용 메모: " + outing.teacherMemo));
  }

  if (options.trash) {
    nodes.push(
      el("div", { className: "action-row" }, [
        button("복구", "btn secondary", "button", () => restoreOuting(outing.id)),
      ])
    );
  }

  return el("article", { className: "outing-card" }, nodes);
}

function outingDataTable(outing, options = {}) {
  const rows = [
    ["상세 사유", outing.detail || "-"],
    options.hideDecision ? null : ["교사 판단", decisionText(outing.decision)],
    ["복귀 상태", outing.status === "returned" ? "복귀 완료" : "복귀 전"],
    ["사진 인증", outing.photos.length ? String(outing.photos.length) + "장 업로드" : "미제출"],
    outing.earlyLeaveReason ? ["조퇴 사유", outing.earlyLeaveReason] : null,
  ].filter(Boolean);

  return el("table", { className: "outing-data-table" }, [
    el(
      "tbody",
      {},
      rows.map(([label, value]) =>
        el("tr", {}, [
          el("th", {}, label),
          el("td", {}, value),
        ])
      )
    ),
  ]);
}
function detailItem(label, value) {
  return el("div", { className: "detail-item" }, [el("span", {}, label), el("strong", {}, value)]);
}

function metaChip(label, value) {
  return el("span", { className: "meta-chip" }, [el("em", {}, label), String(value || "-")]);
}

function decideOuting(id, decision) {
  const outing = state.outings.find((item) => item.id === id);
  if (!outing) return;
  outing.decision = decision;
  saveState();
  render();
  notify(decision === "approved" ? "승인 처리했습니다." : "반려 처리했습니다.");
}

function deleteOuting(id) {
  const outing = state.outings.find((item) => item.id === id);
  if (!outing) return;
  if (!confirm(String(outing.studentName) + " 학생의 외출 신청 기록을 삭제할까요?")) return;
  outing.deletedAt = new Date().toISOString();
  state.outings = state.outings.filter((item) => item.id !== id);
  state.deletedOutings = [outing, ...(state.deletedOutings || [])];
  saveState();
  render();
  notify("외출 신청 기록을 삭제 내역으로 이동했습니다.");
}

function restoreOuting(id) {
  const outing = (state.deletedOutings || []).find((item) => item.id === id);
  if (!outing) return;
  outing.deletedAt = "";
  state.deletedOutings = (state.deletedOutings || []).filter((item) => item.id !== id);
  state.outings = [outing, ...state.outings].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  saveState();
  render();
  notify("외출 신청 기록을 복구했습니다.");
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
  return el("label", { className: ("field " + extraClass).trim() }, nodes);
}

function input(name, type, placeholder, value = "") {
  return el("input", { name, type, placeholder, value, autocomplete: "off" });
}

function fileInput(name) {
  return el("input", { name, type: "file", accept: "image/*", capture: "environment" });
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

function button(text, className, type = "submit", onClick, children = null) {
  const node = el("button", { className, type }, children || text);
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
  return el("span", { className: "badge " + outing.status }, labels[outing.status] || "신청 대기");
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
  return state.outings.find(
    (outing) =>
      outing.studentId === String(studentId).trim() &&
      outing.status !== "returned" &&
      outing.decision !== "rejected"
  );
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

async function compressImage(file, maxSize = 1280, quality = 0.72) {
  if (!file.type.startsWith("image/")) return readFile(file);

  const dataUrl = await readFile(file);
  const image = await loadImage(dataUrl);
  const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0, width, height);

  return canvas.toDataURL("image/jpeg", quality);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function makeUrl(route) {
  return location.href.split("#")[0] + "#" + route;
}

function makeStudentUrl(route) {
  const base = location.href.split("#")[0].replace(/teacher\.html$/i, "index.html");
  return base + "#" + route;
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

function formatDateKey(value) {
  if (!value) return "?좎쭨 ?놁쓬";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).format(new Date(value));
}

function formatExpectedReturn(value) {
  if (!value) return "-";
  return String(value).slice(0, 5);
}

function formatDateCompact(value) {
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

function openPhotoModal(photo) {
  closePhotoModal();
  const modal = el("div", { className: "photo-modal", role: "dialog", ariaModal: "true" }, [
    el("button", { className: "photo-modal-backdrop", type: "button", ariaLabel: "사진 닫기" }),
    el("div", { className: "photo-modal-panel" }, [
      el("div", { className: "photo-modal-head" }, [
        el("div", {}, [
          el("strong", {}, photo.type || "사진"),
          el("span", {}, formatTime(photo.uploadedAt)),
        ]),
        button("닫기", "mini-btn", "button", closePhotoModal),
      ]),
      el("img", { src: photo.dataUrl, alt: photo.type || "인증 사진" }),
    ]),
  ]);

  modal.querySelector(".photo-modal-backdrop").addEventListener("click", closePhotoModal);
  document.body.appendChild(modal);
  document.addEventListener("keydown", closePhotoModalOnEscape);
}

function openUnreleasedModal(featureName = "해당 기능") {
  openInfoModal({
    title: "준비 중인 기능입니다",
    content: el("p", {}, featureName + " 기능은 추후 업데이트 예정입니다."),
  });
}

function openInfoModal({ title, content, className = "" }) {
  closeInfoModal();
  const modal = el("div", { className: "info-modal", role: "dialog", ariaModal: "true" }, [
    el("button", { className: "info-modal-backdrop", type: "button", ariaLabel: "안내 닫기" }),
    el("div", { className: ("info-modal-panel " + className).trim() }, [
      el("strong", {}, title),
      content,
      button("확인", "btn secondary", "button", closeInfoModal),
    ]),
  ]);
  modal.querySelector(".info-modal-backdrop").addEventListener("click", closeInfoModal);
  document.body.appendChild(modal);
  document.addEventListener("keydown", closeInfoModalOnEscape);
}

function openLoadingModal(title, message) {
  closeLoadingModal();
  const modal = el("div", { className: "loading-modal", role: "alertdialog", ariaModal: "true", ariaLive: "assertive" }, [
    el("div", { className: "loading-modal-backdrop" }),
    el("div", { className: "loading-modal-panel" }, [
      el("span", { className: "loading-spinner", ariaHidden: "true" }),
      el("strong", {}, title || "처리 중"),
      el("p", {}, message || "잠시만 기다려주세요."),
    ]),
  ]);
  document.body.appendChild(modal);
}

function closeLoadingModal() {
  document.querySelector(".loading-modal")?.remove();
}

function closeInfoModal() {
  document.querySelector(".info-modal")?.remove();
  document.removeEventListener("keydown", closeInfoModalOnEscape);
}

function closeInfoModalOnEscape(event) {
  if (event.key === "Escape") closeInfoModal();
}

function closePhotoModal() {
  document.querySelector(".photo-modal")?.remove();
  document.removeEventListener("keydown", closePhotoModalOnEscape);
}

function closePhotoModalOnEscape(event) {
  if (event.key === "Escape") closePhotoModal();
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
      { id: "240001", name: "홍길동", className: "오프라인반", createdAt: new Date().toISOString() },
      { id: "240002", name: "김민지", className: "오프라인반", createdAt: new Date().toISOString() }
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
  return crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + "-" + Math.random().toString(16).slice(2);
}

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([key, value]) => {
    if (key === "className") node.className = value;
    else if (key === "style") node.setAttribute("style", value);
    else if (key === "ariaModal") node.setAttribute("aria-modal", value);
    else if (key === "ariaLabel") node.setAttribute("aria-label", value);
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





