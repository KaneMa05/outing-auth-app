const STORAGE_KEY = "ronpark_outing_auth_v2";
const APP_MODE = document.body.dataset.appMode === "teacher" ? "teacher" : "student";

const state = loadState();
let currentRoute = "";
let selectedStudentCohort = "";

const app = document.querySelector("#app");
const title = document.querySelector("#page-title");
const toast = document.querySelector("#toast");
const topActions = document.querySelector(".top-actions");
const seedButton = document.querySelector("#seed-demo");
const resetButton = document.querySelector("#reset-data");
const remoteStore = createRemoteStore();
const localDevStoreUrl = createLocalDevStoreUrl();
const STUDENT_RESUME_REFRESH_DELAY_MS = 1200;
const STUDENT_INTERACTION_PAUSE_MS = 15000;
const STUDENT_FILE_PICKER_PAUSE_MS = 120000;
const STUDENT_PULL_REFRESH_THRESHOLD = 82;
const ATTENDANCE_PHOTO_BUCKET = "attendance-photos";
const DEFAULT_ATTENDANCE_DEADLINE = "08:50";
let isRemoteLoading = false;
let isRemoteSaving = false;
let remoteSaveTimer = null;
let localDevSaveTimer = null;
let hasPendingRemoteSave = false;
let isLocalDevLoading = false;
let isLocalDevSaving = false;
let isRemoteRefreshStarted = false;
let remoteResumeRefreshTimer = null;
let deferredInstallPrompt = null;
let studentFilePickerOpenedAt = 0;
let studentInteractionPausedUntil = 0;
let isStudentInteractionTrackingStarted = false;
let isStudentPullRefreshStarted = false;
let studentPullStartY = 0;
let studentPullDistance = 0;
let studentPullIndicator = null;
const teacherAuth = {
  checked: APP_MODE !== "teacher",
  authenticated: APP_MODE !== "teacher",
  user: null,
};

const routePermissions = {
  home: null,
  outing: "outing.read",
  grades: "grades.read",
  penalties: "penalties.read",
  attendance: "attendance.read",
  students: "students.read",
  duplicates: "outing.audit",
  trash: "outing.delete",
};

function hasTeacherPermission(permission) {
  if (APP_MODE !== "teacher") return true;
  if (!permission) return true;
  const permissions = Array.isArray(teacherAuth.user?.permissions) ? teacherAuth.user.permissions : [];
  return permissions.includes("*") || permissions.includes(permission);
}

function canUseRoute(route) {
  return hasTeacherPermission(routePermissions[route]);
}

function firstAllowedTeacherRoute() {
  return ["home", "outing", "penalties", "attendance", "grades", "students", "duplicates", "trash"].find(canUseRoute) || "home";
}

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
      attendanceDeadline: DEFAULT_ATTENDANCE_DEADLINE,
      attendanceDeadlineEnabled: false,
    },
    students: [],
    outings: [],
    deletedOutings: [],
    attendanceChecks: [],
    penalties: [],
  };
}

function mergeDefaultState(nextState) {
  const defaults = defaultState();
  return {
    ...defaults,
    ...nextState,
    settings: {
      ...defaults.settings,
      ...(nextState?.settings || {}),
    },
    students: Array.isArray(nextState?.students) ? nextState.students : defaults.students,
    outings: Array.isArray(nextState?.outings) ? nextState.outings : defaults.outings,
    deletedOutings: Array.isArray(nextState?.deletedOutings) ? nextState.deletedOutings : defaults.deletedOutings,
    attendanceChecks: Array.isArray(nextState?.attendanceChecks) ? nextState.attendanceChecks : defaults.attendanceChecks,
    penalties: Array.isArray(nextState?.penalties) ? nextState.penalties : defaults.penalties,
  };
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    if (!isStorageQuotaError(error)) throw error;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(makeLocalStorageSafeState()));
  }
  scheduleRemoteSave();
  scheduleLocalDevSave();
}

function isStorageQuotaError(error) {
  return (
    error?.name === "QuotaExceededError" ||
    error?.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    error?.code === 22 ||
    error?.code === 1014
  );
}

function makeLocalStorageSafeState() {
  const snapshot = JSON.parse(JSON.stringify(state));
  snapshot.outings = (snapshot.outings || []).slice(0, 30).map(stripPhotoDataForLocalStorage);
  snapshot.attendanceChecks = (snapshot.attendanceChecks || []).slice(0, 120).map(stripAttendancePhotoDataForLocalStorage);
  snapshot.deletedOutings = [];
  return snapshot;
}

function stripPhotoDataForLocalStorage(outing) {
  return {
    ...outing,
    photos: (outing.photos || []).map((photo) => ({
      ...photo,
      dataUrl: "",
    })),
  };
}

function stripAttendancePhotoDataForLocalStorage(check) {
  return {
    ...check,
    photoDataUrl: "",
  };
}

function createRemoteStore() {
  const config = window.OUTING_APP_CONFIG || {};
  const hasConfig = Boolean(config.supabaseUrl && config.supabaseAnonKey);
  const hasSdk = Boolean(window.supabase && window.supabase.createClient);
  if (!hasConfig || !hasSdk) return null;
  return window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
}

function createLocalDevStoreUrl() {
  const isLocalHost = ["localhost", "127.0.0.1", "::1"].includes(location.hostname);
  return isLocalHost ? "/api/local-state" : "";
}

async function initRemoteStore() {
  if (!remoteStore) {
    await initLocalDevStore();
    return;
  }
  isRemoteLoading = true;
  try {
    await loadStateFromRemote();
    const registrationChanged = reconcileStudentRegistrationFromRemote();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (registrationChanged || !shouldPreserveStudentAuthForm()) render();
    startRemoteRefresh();
  } catch (error) {
    console.error(error);
    if (APP_MODE === "teacher") notify("Supabase 불러오기 중 오류가 발생했습니다.");
  } finally {
    isRemoteLoading = false;
  }
}

async function initLocalDevStore() {
  if (!localDevStoreUrl) return;
  isLocalDevLoading = true;
  try {
    const response = await fetch(localDevStoreUrl, { credentials: "same-origin" });
    const data = response.ok ? await response.json() : { ok: false };
    if (data.ok && data.exists && data.state) {
      Object.assign(state, mergeDefaultState(data.state));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      render();
      return;
    }
    if (hasLocalDevStateData(state)) scheduleLocalDevSave();
  } catch (error) {
    console.error(error);
  } finally {
    isLocalDevLoading = false;
  }
}

function startRemoteRefresh() {
  if (!remoteStore || APP_MODE !== "student" || isRemoteRefreshStarted) return;
  isRemoteRefreshStarted = true;
  startStudentInteractionTracking();
  startStudentPullRefresh();
  window.addEventListener("focus", scheduleResumeRemoteRefresh);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) scheduleResumeRemoteRefresh();
  });
}

async function refreshStateFromRemote(options = {}) {
  const force = Boolean(options.force);
  if (!remoteStore || isRemoteLoading || isRemoteSaving || hasPendingRemoteSave) return false;
  if (shouldPauseStudentRemoteRefresh()) {
    if (force) notify("입력 중인 내용이 있어 새로고침을 건너뛰었습니다.");
    return false;
  }
  isRemoteLoading = true;
  try {
    await loadStateFromRemote();
    const registrationChanged = reconcileStudentRegistrationFromRemote();
    const preserveAuthForm = shouldPreserveStudentAuthForm();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (registrationChanged || !preserveAuthForm) render();
    if (registrationChanged) notify("앱 등록이 초기화되었습니다. 다시 등록해주세요.");
    else if (force) notify("새로고침되었습니다.");
    return true;
  } catch (error) {
    console.error(error);
    if (force) notify("새로고침 중 오류가 발생했습니다.");
    return false;
  } finally {
    isRemoteLoading = false;
  }
}

function scheduleResumeRemoteRefresh() {
  window.clearTimeout(remoteResumeRefreshTimer);
  remoteResumeRefreshTimer = window.setTimeout(refreshStateFromRemote, STUDENT_RESUME_REFRESH_DELAY_MS);
}

function startStudentInteractionTracking() {
  if (isStudentInteractionTrackingStarted || !app) return;
  isStudentInteractionTrackingStarted = true;
  ["focusin", "input", "change", "pointerdown"].forEach((eventName) => {
    app.addEventListener(eventName, (event) => {
      if (isStudentInteractiveTarget(event.target)) markStudentInteraction();
    });
  });
}

function isStudentInteractiveTarget(target) {
  return Boolean(target?.closest?.(".student-view form, .student-auth-card, .photo-input-control"));
}

function markStudentInteraction() {
  studentInteractionPausedUntil = Date.now() + STUDENT_INTERACTION_PAUSE_MS;
}

function startStudentPullRefresh() {
  if (isStudentPullRefreshStarted || !("ontouchstart" in window)) return;
  isStudentPullRefreshStarted = true;
  studentPullIndicator = el("div", { className: "student-refresh-indicator", hidden: true }, "아래로 당겨 새로고침");
  document.body.appendChild(studentPullIndicator);
  window.addEventListener("touchstart", onStudentPullStart, { passive: true });
  window.addEventListener("touchmove", onStudentPullMove, { passive: false });
  window.addEventListener("touchend", onStudentPullEnd);
  window.addEventListener("touchcancel", resetStudentPullRefresh);
}

function onStudentPullStart(event) {
  if (window.scrollY > 0 || shouldPauseStudentRemoteRefresh() || isRemoteLoading || isRemoteSaving || hasPendingRemoteSave) return;
  if (isStudentInteractiveTarget(event.target)) return;
  studentPullStartY = event.touches[0]?.clientY || 0;
  studentPullDistance = 0;
}

function onStudentPullMove(event) {
  if (!studentPullStartY || window.scrollY > 0) return;
  studentPullDistance = Math.max(0, (event.touches[0]?.clientY || 0) - studentPullStartY);
  if (studentPullDistance < 10) return;
  event.preventDefault();
  updateStudentPullIndicator(studentPullDistance);
}

function onStudentPullEnd() {
  if (!studentPullStartY) return;
  const shouldRefresh = studentPullDistance >= STUDENT_PULL_REFRESH_THRESHOLD;
  resetStudentPullGesture();
  if (shouldRefresh) runStudentPullRefresh();
  else hideStudentPullIndicator();
}

async function runStudentPullRefresh() {
  updateStudentPullIndicator(STUDENT_PULL_REFRESH_THRESHOLD, "새로고침 중...");
  await refreshStateFromRemote({ force: true });
  window.setTimeout(hideStudentPullIndicator, 480);
}

function updateStudentPullIndicator(distance, text = "") {
  if (!studentPullIndicator) return;
  const progress = Math.min(1, distance / STUDENT_PULL_REFRESH_THRESHOLD);
  studentPullIndicator.hidden = false;
  studentPullIndicator.textContent = text || (progress >= 1 ? "놓으면 새로고침" : "아래로 당겨 새로고침");
  studentPullIndicator.style.transform = `translate(-50%, ${Math.round(progress * 56)}px)`;
  studentPullIndicator.style.opacity = String(0.35 + progress * 0.65);
}

function hideStudentPullIndicator() {
  if (!studentPullIndicator) return;
  studentPullIndicator.hidden = true;
  studentPullIndicator.style.transform = "";
  studentPullIndicator.style.opacity = "";
}

function resetStudentPullGesture() {
  studentPullStartY = 0;
  studentPullDistance = 0;
}

function resetStudentPullRefresh() {
  resetStudentPullGesture();
  hideStudentPullIndicator();
}

function markStudentFilePickerOpen() {
  markStudentInteraction();
  studentFilePickerOpenedAt = Date.now();
}

function markStudentFilePickerClosed() {
  studentFilePickerOpenedAt = 0;
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

function shouldPauseStudentRemoteRefresh() {
  if (APP_MODE !== "student") return false;
  return (
    isStudentInteractionPaused() ||
    isStudentFilePickerOpen() ||
    hasSelectedStudentPhoto() ||
    shouldPreserveStudentAuthForm() ||
    hasActiveStudentForm() ||
    hasUnsavedStudentFormValues()
  );
}

function isStudentInteractionPaused() {
  return Date.now() < studentInteractionPausedUntil;
}

function isStudentFilePickerOpen() {
  return studentFilePickerOpenedAt && Date.now() - studentFilePickerOpenedAt < STUDENT_FILE_PICKER_PAUSE_MS;
}

function hasSelectedStudentPhoto() {
  return [...document.querySelectorAll(".photo-input-control input[type='file']")].some((input) => input.files?.length);
}

function hasActiveStudentForm() {
  const active = document.activeElement;
  return Boolean(active?.closest?.(".student-view form, .student-auth-card"));
}

function hasUnsavedStudentFormValues() {
  return [...document.querySelectorAll(".student-view form, .student-auth-card")].some((form) =>
    [...form.elements].some((fieldNode) => {
      if (!fieldNode.name || fieldNode.disabled) return false;
      if (["button", "submit", "reset"].includes(fieldNode.type)) return false;
      if (fieldNode.type === "file") return Boolean(fieldNode.files?.length);
      if (fieldNode.tagName === "SELECT") return fieldNode.selectedIndex > 0;
      return String(fieldNode.value || "").trim() !== "";
    })
  );
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
        if (APP_MODE === "teacher") notify("Supabase 저장 중 오류가 발생했습니다.");
      })
      .finally(() => {
        isRemoteSaving = false;
      });
  }, 250);
}

function scheduleLocalDevSave() {
  if (!localDevStoreUrl || remoteStore || isLocalDevLoading) return;
  window.clearTimeout(localDevSaveTimer);
  localDevSaveTimer = window.setTimeout(() => {
    localDevSaveTimer = null;
    isLocalDevSaving = true;
    fetch(localDevStoreUrl, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: makeLocalDevSafeState() }),
    })
      .catch((error) => console.error(error))
      .finally(() => {
        isLocalDevSaving = false;
      });
  }, 180);
}

function hasLocalDevStateData(snapshot) {
  return Boolean(
    snapshot?.students?.length ||
    snapshot?.outings?.length ||
    snapshot?.deletedOutings?.length ||
    snapshot?.attendanceChecks?.length ||
    snapshot?.penalties?.length
  );
}

function makeLocalDevSafeState() {
  const snapshot = JSON.parse(JSON.stringify(state));
  snapshot.outings = (snapshot.outings || []).map(stripPhotoDataForLocalStorage);
  snapshot.deletedOutings = (snapshot.deletedOutings || []).map(stripPhotoDataForLocalStorage);
  snapshot.attendanceChecks = snapshot.attendanceChecks || [];
  snapshot.penalties = snapshot.penalties || [];
  return snapshot;
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
  const attendanceColumns = [
    "id",
    "student_id",
    "student_name",
    "class_name",
    "check_date",
    "status",
    "reason",
    "detail",
    "photo_path",
    "photo_url",
    "photo_data_url",
    "original_name",
    "created_at",
  ].join(",");
  const penaltyColumns = [
    "id",
    "student_id",
    "student_name",
    "class_name",
    "points",
    "reason",
    "manager_name",
    "created_at",
  ].join(",");
  const remoteResults = await Promise.all([
    remoteStore.from("students").select(studentColumns).order("created_at", { ascending: true }),
    remoteStore.from("outings").select(outingColumns).order("created_at", { ascending: false }),
    remoteStore.from("outing_photos").select(photoColumns).order("uploaded_at", { ascending: true }),
    remoteStore.from("attendance_checks").select(attendanceColumns).order("created_at", { ascending: false }),
    remoteStore.from("penalties").select(penaltyColumns).order("created_at", { ascending: false }),
  ]);
  const [{ data: students, error: studentsError }, { data: outings, error: outingsError }, { data: photos, error: photosError }] = remoteResults;
  let attendanceResult = remoteResults[3];
  const penaltyResult = remoteResults[4];
  if (isMissingColumnError(attendanceResult.error, "reason") || isMissingColumnError(attendanceResult.error, "detail")) {
    const fallbackAttendanceColumns = attendanceColumns
      .split(",")
      .filter((column) => !["reason", "detail"].includes(column))
      .join(",");
    attendanceResult = await remoteStore.from("attendance_checks").select(fallbackAttendanceColumns).order("created_at", { ascending: false });
  }

  if (studentsError) throw studentsError;
  if (outingsError) throw outingsError;
  if (photosError) throw photosError;
  if (attendanceResult.error && !isMissingRelationError(attendanceResult.error, "attendance_checks")) throw attendanceResult.error;
  if (penaltyResult.error && !isMissingRelationError(penaltyResult.error, "penalties")) throw penaltyResult.error;

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
  state.attendanceChecks = (attendanceResult.data || []).map(mapAttendanceCheckFromRemote);
  state.penalties = (penaltyResult.data || []).map(mapPenaltyFromRemote);
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
      if (isExpectedProfileRewriteError(fallbackError)) continue;
      if (fallbackError) throw fallbackError;
      continue;
    }
    if (isExpectedProfileRewriteError(error)) continue;
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
      early_leave_reason: outing.earlyLeaveReason || null,
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
    .filter((outing) => outing.decision !== "pending" || ["verified", "returned"].includes(outing.status) || outing.teacherMemo)
    .map((outing) => ({
      id: outing.id,
      status: outing.status,
      decision: outing.decision,
      teacher_memo: outing.teacherMemo || null,
      receipt_note: outing.receiptNote || null,
      verified_at: outing.verifiedAt,
      returned_at: outing.returnedAt,
    }));

  for (const outing of statusRows) {
    const { error } = await remoteStore
      .from("outings")
      .update({
        status: outing.status,
        decision: outing.decision,
        teacher_memo: outing.teacher_memo,
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

  const attendanceRows = (state.attendanceChecks || [])
    .filter((check) => check.id && check.studentId && check.photoPath)
    .map((check) => ({
      id: check.id,
      student_id: check.studentId,
      student_name: check.studentName,
      class_name: check.className || state.settings.className || "오프라인반",
      check_date: check.checkDate,
      status: check.status || "present",
      reason: check.reason || null,
      detail: check.detail || null,
      photo_path: check.photoPath,
      photo_url: check.photoUrl || null,
      photo_data_url: null,
      original_name: check.originalName || null,
      created_at: check.createdAt,
    }));

  if (attendanceRows.length) {
    const { error } = await remoteStore
      .from("attendance_checks")
      .upsert(attendanceRows, { onConflict: "id", ignoreDuplicates: true });
    if (isMissingColumnError(error, "reason") || isMissingColumnError(error, "detail")) {
      const fallbackRows = attendanceRows.map(stripAttendanceReasonColumnsFromRow);
      const { error: fallbackError } = await remoteStore
        .from("attendance_checks")
        .upsert(fallbackRows, { onConflict: "id", ignoreDuplicates: true });
      if (fallbackError && !isMissingRelationError(fallbackError, "attendance_checks")) throw fallbackError;
      return;
    }
    if (error && !isMissingRelationError(error, "attendance_checks")) throw error;
  }

  const penaltyRows = (state.penalties || [])
    .filter((penalty) => penalty.id && penalty.studentId && Number(penalty.points) > 0)
    .map((penalty) => ({
      id: penalty.id,
      student_id: penalty.studentId,
      student_name: penalty.studentName,
      class_name: penalty.className || state.settings.className || "오프라인반",
      points: Number(penalty.points) || 0,
      reason: penalty.reason || null,
      manager_name: penalty.managerName || null,
      created_at: penalty.createdAt,
    }));

  if (penaltyRows.length) {
    const { error } = await remoteStore
      .from("penalties")
      .upsert(penaltyRows, { onConflict: "id", ignoreDuplicates: true });
    if (error && !isMissingRelationError(error, "penalties")) throw error;
  }
}

function stripAttendanceReasonColumnsFromRow(row) {
  const { reason, detail, ...rest } = row;
  return rest;
}

function isMissingColumnError(error, columnName) {
  if (!error) return false;
  const text = [error.message, error.details, error.hint, error.code].filter(Boolean).join(" ").toLowerCase();
  return text.includes(columnName.toLowerCase()) && (text.includes("column") || text.includes("schema cache"));
}

function isExpectedProfileRewriteError(error) {
  if (!error) return false;
  const text = [error.message, error.details, error.hint, error.code].filter(Boolean).join(" ").toLowerCase();
  return text.includes("42501") || text.includes("row-level security") || text.includes("violates row-level security");
}

function isMissingRelationError(error, relationName) {
  if (!error) return false;
  const text = [error.message, error.details, error.hint, error.code].filter(Boolean).join(" ").toLowerCase();
  return text.includes(String(relationName).toLowerCase()) && (text.includes("relation") || text.includes("table") || text.includes("schema cache"));
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
    const canDecide = outing.decision === "pending";
    nodes.push(
      el("div", { className: "action-row" }, [
        canDecide ? button("승인", "btn secondary", "button", () => decideOuting(outing.id, "approved")) : null,
        canDecide ? button("반려", "btn danger", "button", () => decideOuting(outing.id, "rejected")) : null,
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
function stat(label, value, unit = "") {
  return el("div", { className: "stat" }, [
    el("span", {}, label),
    el("strong", {}, [String(value), unit ? el("small", {}, unit) : null].filter(Boolean)),
  ]);
}

function countOutingStudents(outings) {
  return new Set(
    outings
      .map((outing) => String(outing.studentId || "").trim())
      .filter(Boolean)
  ).size;
}

function getStudentCohort(student) {
  const id = String(student?.id || "").trim();
  if (!/^\d{4,}$/.test(id)) return "";
  return id.slice(0, -3);
}

function getStudentCohortStats() {
  const counts = new Map();
  state.students.forEach((student) => {
    const cohort = getStudentCohort(student);
    const key = cohort || "미분류";
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  return [...counts.entries()]
    .sort(([a], [b]) => {
      if (a === "미분류") return 1;
      if (b === "미분류") return -1;
      return Number(a) - Number(b);
    })
    .map(([cohort, count]) => ({
      value: cohort,
      label: cohort === "미분류" ? cohort : cohort + "기",
      count,
    }));
}

function selectedStudentCohortCount() {
  const cohorts = getStudentCohortStats();
  if (!cohorts.length) {
    selectedStudentCohort = "";
    return { label: "선택 기수", count: 0 };
  }
  if (!cohorts.some((cohort) => cohort.value === selectedStudentCohort)) selectedStudentCohort = cohorts[0].value;
  return cohorts.find((cohort) => cohort.value === selectedStudentCohort) || cohorts[0];
}

function statGroup(titleText, stats) {
  return el("section", { className: "stat-group" }, [
    el("h2", {}, titleText),
    el("div", { className: "grid stats" }, stats),
  ]);
}

function studentCountStatGroup() {
  const cohorts = getStudentCohortStats();
  const selected = selectedStudentCohortCount();
  const selectNode = el("select", { className: "cohort-select", ariaLabel: "등록 학생 기수 선택" }, [
    cohorts.map((cohort) => el("option", { value: cohort.value }, cohort.label)),
  ]);
  selectNode.value = selectedStudentCohort;
  selectNode.addEventListener("change", () => {
    selectedStudentCohort = selectNode.value;
    render();
  });

  return el("section", { className: "stat-group" }, [
    el("div", { className: "stat-group-heading" }, [
      el("h2", {}, "인원 현황"),
      el("label", { className: "cohort-filter" }, [
        el("span", {}, "기수"),
        selectNode,
      ]),
    ]),
    el("div", { className: "grid stats" }, [
      stat(selected.label, selected.count, "명"),
    ]),
  ]);
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

function mapAttendanceCheckFromRemote(check) {
  return {
    id: check.id,
    studentId: check.student_id,
    studentName: check.student_name || "",
    className: check.class_name || "",
    checkDate: check.check_date,
    status: check.status || "present",
    reason: check.reason || "",
    detail: check.detail || "",
    photoPath: check.photo_path || "",
    photoUrl: check.photo_url || "",
    photoDataUrl: check.photo_data_url || "",
    originalName: check.original_name || "",
    createdAt: check.created_at,
  };
}

function mapPenaltyFromRemote(penalty) {
  return {
    id: penalty.id,
    studentId: penalty.student_id,
    studentName: penalty.student_name || "",
    className: penalty.class_name || "",
    points: Number(penalty.points) || 0,
    reason: penalty.reason || "",
    managerName: penalty.manager_name || "",
    createdAt: penalty.created_at,
  };
}

function getPenaltiesForStudent(studentId) {
  return (state.penalties || [])
    .filter((penalty) => penalty.studentId === String(studentId || "").trim())
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function getPenaltyTotal(studentId) {
  return getPenaltiesForStudent(studentId).reduce((sum, penalty) => sum + (Number(penalty.points) || 0), 0);
}

function createPenalty(student, points, reason, managerName) {
  if (!student) throw new Error("student_required");
  const penalty = {
    id: createId(),
    studentId: student.id,
    studentName: student.name,
    className: student.className || state.settings.className || "오프라인반",
    points: Number(points) || 0,
    reason: String(reason || "").trim(),
    managerName: String(managerName || "").trim(),
    createdAt: new Date().toISOString(),
  };
  state.penalties = [penalty, ...(state.penalties || [])];
  saveState();
  return penalty;
}

function getTodayDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getAttendanceChecksForDate(dateKey = getTodayDateKey()) {
  return (state.attendanceChecks || []).filter((check) => check.checkDate === dateKey);
}

function getStudentAttendanceForDate(studentId, dateKey = getTodayDateKey()) {
  return getAttendanceChecksForDate(dateKey).find((check) => check.studentId === String(studentId || "").trim());
}

function isAttendanceCheckOpen(now = new Date()) {
  if (!state.settings.attendanceDeadlineEnabled) return true;
  const [hour, minute] = getAttendanceDeadlineParts();
  const deadline = new Date(now);
  deadline.setHours(hour, minute, 0, 0);
  return now <= deadline;
}

function formatAttendanceDeadline() {
  const [hour, minute] = getAttendanceDeadlineParts();
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function getAttendanceDeadlineParts() {
  const value = String(state.settings.attendanceDeadline || DEFAULT_ATTENDANCE_DEADLINE);
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) return [8, 50];
  return [Number(match[1]), Number(match[2])];
}

function setAttendanceDeadline(value, enabled) {
  const nextValue = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || "")) ? String(value) : DEFAULT_ATTENDANCE_DEADLINE;
  state.settings.attendanceDeadline = nextValue;
  state.settings.attendanceDeadlineEnabled = Boolean(enabled);
  saveState();
}

function getAttendancePhotoSrc(check) {
  return check?.photoUrl || check?.photoDataUrl || "";
}

async function createAttendanceCheck(student, file, options = {}) {
  if (!student) throw new Error("student_required");
  if (!file) throw new Error("photo_required");
  const id = createId();
  const createdAt = new Date().toISOString();
  const checkDate = getTodayDateKey();
  const status = options.status || "present";
  const compressedDataUrl = await compressImage(file, 900, 0.64, 180000);
  let photoPath = "";
  let photoUrl = "";
  let photoDataUrl = compressedDataUrl;

  if (remoteStore) {
    const blob = dataUrlToBlob(compressedDataUrl);
    photoPath = createAttendancePhotoPath(student.id, id);
    const { error: uploadError } = await remoteStore.storage
      .from(ATTENDANCE_PHOTO_BUCKET)
      .upload(photoPath, blob, {
        cacheControl: "31536000",
        contentType: blob.type || "image/jpeg",
        upsert: false,
      });
    if (uploadError) throw uploadError;
    const { data } = remoteStore.storage.from(ATTENDANCE_PHOTO_BUCKET).getPublicUrl(photoPath);
    photoUrl = data?.publicUrl || "";
    photoDataUrl = "";
  }

  const check = {
    id,
    studentId: student.id,
    studentName: student.name,
    className: student.className || state.settings.className || "오프라인반",
    checkDate,
    status,
    reason: String(options.reason || "").trim(),
    detail: String(options.detail || "").trim(),
    photoPath,
    photoUrl,
    photoDataUrl,
    originalName: file.name || "",
    createdAt,
  };

  if (remoteStore) {
    const attendanceRow = {
      id: check.id,
      student_id: check.studentId,
      student_name: check.studentName,
      class_name: check.className,
      check_date: check.checkDate,
      status: check.status,
      reason: check.reason || null,
      detail: check.detail || null,
      photo_path: check.photoPath,
      photo_url: check.photoUrl || null,
      photo_data_url: null,
      original_name: check.originalName || null,
      created_at: check.createdAt,
    };
    const { error } = await remoteStore.from("attendance_checks").insert(attendanceRow);
    if (isMissingColumnError(error, "reason") || isMissingColumnError(error, "detail")) {
      const { error: fallbackError } = await remoteStore.from("attendance_checks").insert(stripAttendanceReasonColumnsFromRow(attendanceRow));
      if (fallbackError) throw fallbackError;
    } else if (error) throw error;
  }

  state.attendanceChecks = [
    check,
    ...(state.attendanceChecks || []).filter((item) => !(item.studentId === student.id && item.checkDate === checkDate)),
  ];
  saveState();
  return check;
}

function createPreArrivalReasonCheck(student, file, reason, detail) {
  return createAttendanceCheck(student, file, {
    status: "pre_arrival_reason",
    reason,
    detail,
  });
}

function createAttendancePhotoPath(studentId, checkId) {
  return `${getTodayDateKey()}/${String(studentId || "student")}/${checkId}.jpg`;
}

function dataUrlToBlob(dataUrl) {
  const [meta, content] = String(dataUrl || "").split(",");
  const mime = /data:([^;]+)/.exec(meta || "")?.[1] || "image/jpeg";
  const binary = atob(content || "");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mime });
}

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function compressImage(file, maxSize = 960, quality = 0.68, targetBytes = 240000) {
  if (!file.type.startsWith("image/")) return readFile(file);

  const dataUrl = await readFile(file);
  const image = await loadImage(dataUrl);
  let currentMaxSize = maxSize;
  let currentQuality = quality;
  let output = "";

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const scale = Math.min(1, currentMaxSize / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0, width, height);
    output = canvas.toDataURL("image/jpeg", currentQuality);
    if (estimateDataUrlBytes(output) <= targetBytes) return output;
    currentQuality = Math.max(0.42, currentQuality - 0.08);
    if (attempt >= 3) currentMaxSize = Math.max(520, Math.round(currentMaxSize * 0.82));
  }

  return output;
}

function estimateDataUrlBytes(dataUrl) {
  const base64 = String(dataUrl || "").split(",")[1] || "";
  return Math.ceil((base64.length * 3) / 4);
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
      el("img", { src: photo.dataUrl || photo.photoUrl || photo.photoDataUrl || "", alt: photo.type || "인증 사진" }),
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





