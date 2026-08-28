const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { handleLocalQuestionBoard } = require("./local-question-board");

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);
const LOCAL_STATE_FILE = path.join(ROOT, ".local-dev-state.json");
const LOCAL_LECTURE_APPLICATIONS_FILE = path.join(ROOT, ".local-lecture-applications.json");
const LOCAL_QUESTION_BOARD_FILE = path.join(ROOT, ".local-question-board.json");
const LOCAL_CURRICULUM_FILE = path.join(ROOT, ".local-curriculum.json");
const LOCAL_CURRICULUM_PROGRESS_FILE = path.join(ROOT, ".local-curriculum-progress.json");
const LOCAL_APP_SETTINGS_FILE = path.join(ROOT, ".local-app-settings.json");

loadEnv(path.join(ROOT, ".env"));
loadEnv(path.join(ROOT, ".env.local"));

const apiHandlers = {
  "/api/teacher-login": require("./api/teacher-login"),
  "/api/teacher-session": require("./api/teacher-session"),
  "/api/teacher-logout": require("./api/teacher-logout"),
  "/api/managers": require("./api/managers"),
  "/api/exam-files": require("./api/exam-files"),
  "/api/penalties": require("./api/penalties"),
  "/api/students": require("./api/students"),
  "/api/student-reset-registration": require("./api/student-reset-registration"),
  "/api/student-devices": require("./api/student-devices"),
  "/api/student-push": require("./api/student-push"),
  "/api/study-cafe": require("./api/study-cafe"),
  "/api/study-cafe-rooms": require("./api/study-cafe-rooms"),
  "/api/question-board": require("./api/question-board"),
  "/api/reset-student-registration": require("./api/reset-student-registration"),
};

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json; charset=utf-8",
};

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (url.pathname === "/api/local-state") {
      await handleLocalState(req, res);
      return;
    }
    if (url.pathname === "/api/app-settings") {
      await handleLocalAppSettings(req, res);
      return;
    }
    if (url.pathname === "/api/lecture-applications") {
      await handleLocalLectureApplications(req, res);
      return;
    }
    if (url.pathname === "/api/curriculum") {
      await handleLocalCurriculum(req, res, url);
      return;
    }
    if (url.pathname === "/api/curriculum-progress") {
      await handleLocalCurriculumProgress(req, res);
      return;
    }
    if (url.pathname === "/api/student-push" && req.method === "POST") {
      const body = await readLocalJson(req);
      if (body.action === "inbox") {
        const localStudent = getLocalPreviewStudent(body);
        if (!localStudent) return sendLocalJson(res, 403, { ok: false, error: "device_not_active" });
        return sendLocalJson(res, 200, { ok: true, messages: [], localPreview: true });
      }
      req.body = body;
    }
    if (url.pathname === "/api/question-board" && req.method === "POST") {
      const body = await readLocalJson(req);
      const localStudent = getLocalPreviewStudent(body);
      if (localStudent) {
        const result = handleLocalQuestionBoard({ body, student: localStudent, filePath: LOCAL_QUESTION_BOARD_FILE });
        sendLocalJson(res, result.status, result.payload);
        return;
      }
      req.body = body;
    }
    const handler = apiHandlers[url.pathname];
    if (handler) {
      await runApiHandler(handler, req, res);
      return;
    }
    serveStatic(url.pathname, res);
  })
  .listen(PORT, () => {
    console.log(`Local dev server running at http://localhost:${PORT}/`);
  });

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const separator = trimmed.indexOf("=");
    if (separator < 1) return;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  });
}

async function handleLocalLectureApplications(req, res) {
  const applications = readLocalLectureApplications();
  if (req.method === "POST") {
    const body = await readLocalJson(req);
    if (body.action === "status") {
      const lookupTokenHash = hashLocalLookupToken(body.lookupToken);
      const application = applications.find(
        (item) => item.id === String(body.applicationId || "") && item.lookup_token_hash === lookupTokenHash
      );
      if (!application) return sendLocalJson(res, 404, { ok: false, error: "application_not_found" });
      return sendLocalJson(res, 200, {
        ok: true,
        application: mapLocalPublicApplicationStatus(application),
      });
    }
    if (body.action === "push-config") {
      return sendLocalJson(res, 200, { ok: true, available: false, publicKey: "", localPreview: true });
    }
    if (body.action === "subscribe" || body.action === "unsubscribe") {
      return sendLocalJson(res, 503, { ok: false, error: "push_not_configured", localPreview: true });
    }

    const now = new Date().toISOString();
    const lookupToken = crypto.randomBytes(32).toString("base64url");
    const application = {
      id: crypto.randomUUID(),
      name: String(body.name || "").trim(),
      phone: String(body.phone || "").trim(),
      birth_date: String(body.birthDate || "").trim(),
      gender: String(body.gender || "").trim(),
      track: String(body.track || "").trim(),
      course_type: ["offline", "online_managed", "lecture"].includes(body.courseType) ? body.courseType : "lecture",
      cohort: null,
      referral_source: String(body.referralSource || "").trim(),
      referral_source_detail: String(body.referralSourceDetail || "").trim(),
      lecture_id: String(body.lectureId || "").trim(),
      lookup_token_hash: hashLocalLookupToken(lookupToken),
      status: "pending",
      rejection_reason: "",
      approved_student_id: "",
      reviewed_at: "",
      reviewed_by: "",
      created_at: now,
      updated_at: now,
    };
    applications.unshift(application);
    writeLocalLectureApplications(applications);
    return sendLocalJson(res, 201, {
      ok: true,
      applicationId: application.id,
      lookupToken,
      status: application.status,
      submittedAt: application.created_at,
      localPreview: true,
    });
  }

  if (req.method === "GET") {
    return sendLocalJson(res, 200, { ok: true, applications });
  }

  if (req.method === "PATCH") {
    const body = await readLocalJson(req);
    const application = applications.find((item) => item.id === String(body.id || ""));
    if (!application) return sendLocalJson(res, 404, { ok: false, error: "application_not_found" });
    application.status = String(body.status || application.status);
    application.rejection_reason = application.status === "rejected" ? String(body.rejectionReason || "") : "";
    if (application.status === "approved" && !application.approved_student_id) {
      if (["offline", "online_managed"].includes(application.course_type)) {
        const registrationNumber = String(body.registrationNumber || "").trim();
        const cohort = String(body.cohort || "").trim();
        if (!/^\d{1,2}$/.test(cohort) || Number(cohort) < 1 || Number(cohort) > 99) {
          return sendLocalJson(res, 400, { ok: false, error: "invalid_cohort" });
        }
        const suffix = registrationNumber.startsWith(cohort) ? registrationNumber.slice(cohort.length) : "";
        if (!registrationNumber) {
          return sendLocalJson(res, 400, { ok: false, error: "registration_number_required" });
        }
        if (!/^\d{3}$/.test(suffix) || Number(suffix) < 1) {
          return sendLocalJson(res, 400, { ok: false, error: "registration_number_cohort_mismatch" });
        }
        const inUse = applications.some((item) => item !== application && item.approved_student_id === registrationNumber);
        if (inUse) return sendLocalJson(res, 409, { ok: false, error: "registration_number_in_use" });
        application.approved_student_id = registrationNumber;
        application.cohort = Number(cohort);
      } else {
        const approvedCount = applications.filter((item) => item.approved_student_id).length;
        application.approved_student_id = String(900001 + approvedCount);
      }
    }
    application.reviewed_at = new Date().toISOString();
    application.reviewed_by = "local-admin";
    application.updated_at = application.reviewed_at;
    writeLocalLectureApplications(applications);
    return sendLocalJson(res, 200, {
      ok: true,
      application,
      notification: { configured: false, sent: 0, failed: 0 },
    });
  }

  res.setHeader("Allow", "GET, POST, PATCH");
  return sendLocalJson(res, 405, { ok: false, error: "method_not_allowed" });
}

function readLocalLectureApplications() {
  if (!fs.existsSync(LOCAL_LECTURE_APPLICATIONS_FILE)) return [];
  try {
    const value = JSON.parse(fs.readFileSync(LOCAL_LECTURE_APPLICATIONS_FILE, "utf8") || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeLocalLectureApplications(applications) {
  fs.writeFileSync(LOCAL_LECTURE_APPLICATIONS_FILE, JSON.stringify(applications, null, 2));
}

async function handleLocalCurriculum(req, res, url) {
  const admin = url.searchParams.get("admin") === "1";
  if ((admin || req.method === "POST") && !readLocalTeacherSession(req)) {
    return sendLocalJson(res, 401, { ok: false, error: "unauthorized" });
  }
  const subjects = readLocalCurriculum();
  if (req.method === "GET") {
    const enabled = readLocalAppSettings().curriculumQuestEnabled === true;
    return sendLocalJson(res, 200, {
      ok: true,
      enabled: admin ? undefined : enabled,
      subjects: admin || enabled ? (admin ? subjects : subjects.filter((subject) => subject.isPublished !== false)) : [],
      localPreview: true,
    });
  }
  if (req.method === "POST") {
    const body = await readLocalJson(req);
    if (body.action === "save_subject" && body.subject?.id) {
      const nextSubject = JSON.parse(JSON.stringify(body.subject));
      const index = subjects.findIndex((subject) => subject.id === nextSubject.id);
      if (index >= 0) subjects[index] = nextSubject;
      else subjects.push(nextSubject);
      writeLocalCurriculum(subjects);
      return sendLocalJson(res, 200, { ok: true, subject: nextSubject, localPreview: true });
    }
    if (body.action === "delete_subject") {
      const nextSubjects = subjects.filter((subject) => subject.id !== String(body.subjectId || ""));
      writeLocalCurriculum(nextSubjects);
      return sendLocalJson(res, 200, { ok: true, localPreview: true });
    }
    return sendLocalJson(res, 400, { ok: false, error: "unsupported_action" });
  }
  res.setHeader("Allow", "GET, POST");
  return sendLocalJson(res, 405, { ok: false, error: "method_not_allowed" });
}

function readLocalCurriculum() {
  if (!fs.existsSync(LOCAL_CURRICULUM_FILE)) return [];
  try {
    const value = JSON.parse(fs.readFileSync(LOCAL_CURRICULUM_FILE, "utf8") || "[]");
    return Array.isArray(value) ? value.map((subject) => ({
      ...subject,
      stages: (Array.isArray(subject.stages) ? subject.stages : []).map((stage) => ({
        ...stage,
        title: deriveLocalCurriculumStageTitle(stage.lectures, stage.title),
      })),
    })) : [];
  } catch {
    return [];
  }
}

function deriveLocalCurriculumStageTitle(lectures, fallback = "") {
  const title = (Array.isArray(lectures) ? lectures : [])
    .map((lecture) => String(lecture?.title || "").trim())
    .filter(Boolean)
    .join(", ");
  return title || String(fallback || "").trim();
}

function writeLocalCurriculum(subjects) {
  fs.writeFileSync(LOCAL_CURRICULUM_FILE, JSON.stringify(subjects, null, 2));
}

function readLocalTeacherSession(req) {
  const { COOKIE_NAME, getConfig, readCookie, readSessionToken } = require("./api/teacher-auth-utils");
  const { secret } = getConfig();
  return readSessionToken(readCookie(req, COOKIE_NAME), secret);
}

async function handleLocalCurriculumProgress(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendLocalJson(res, 405, { ok: false, error: "method_not_allowed" });
  }
  if (readLocalAppSettings().curriculumQuestEnabled !== true) {
    return sendLocalJson(res, 404, { ok: false, error: "curriculum_disabled" });
  }
  const body = await readLocalJson(req);
  const student = getLocalPreviewStudent(body);
  if (!student) return sendLocalJson(res, 403, { ok: false, error: "lecture_student_only" });
  const store = readLocalCurriculumProgress();
  const progress = store[student.id] || { lectureIds: [], stages: {} };
  const action = String(body.action || "");
  if (action === "load") {
    return sendLocalJson(res, 200, {
      ok: true,
      subjects: readLocalCurriculum().filter((subject) => subject.isPublished !== false),
      progress: serializeLocalCurriculumProgress(progress),
      localPreview: true,
    });
  }
  if (action === "set_lecture") {
    const lectureId = String(body.lectureId || "").trim();
    progress.lectureIds = [...new Set(progress.lectureIds || [])].filter((id) => id !== lectureId);
    if (body.completed === true && lectureId) progress.lectureIds.push(lectureId);
  } else if (action === "set_stage_task") {
    const stageId = String(body.stageId || "").trim();
    progress.stages[stageId] ||= { consolidation: false, mbt: false, completed: false };
    if (["consolidation", "mbt"].includes(body.task)) progress.stages[stageId][body.task] = body.completed === true;
    if (body.completed !== true) progress.stages[stageId].completed = false;
  } else if (action === "complete_stage") {
    const stageId = String(body.stageId || "").trim();
    progress.stages[stageId] ||= { consolidation: false, mbt: false, completed: false };
    progress.stages[stageId].completed = true;
  } else {
    return sendLocalJson(res, 400, { ok: false, error: "unsupported_action" });
  }
  store[student.id] = progress;
  fs.writeFileSync(LOCAL_CURRICULUM_PROGRESS_FILE, JSON.stringify(store, null, 2));
  return sendLocalJson(res, 200, { ok: true, progress: serializeLocalCurriculumProgress(progress), localPreview: true });
}

async function handleLocalAppSettings(req, res) {
  if (req.method === "GET") {
    return sendLocalJson(res, 200, { ok: true, settings: readLocalAppSettings(), localPreview: true });
  }
  if (req.method === "POST") {
    if (!readLocalTeacherSession(req)) return sendLocalJson(res, 401, { ok: false, error: "unauthorized" });
    const body = await readLocalJson(req);
    const rawSettings = body.settings || body;
    const currentSettings = readLocalAppSettings();
    const settings = {
      ...currentSettings,
      ...(rawSettings && typeof rawSettings === "object" ? rawSettings : {}),
      curriculumQuestEnabled: Object.prototype.hasOwnProperty.call(rawSettings || {}, "curriculumQuestEnabled")
        ? rawSettings.curriculumQuestEnabled === true
        : currentSettings.curriculumQuestEnabled === true,
    };
    fs.writeFileSync(LOCAL_APP_SETTINGS_FILE, JSON.stringify(settings, null, 2));
    return sendLocalJson(res, 200, { ok: true, settings, localPreview: true });
  }
  res.setHeader("Allow", "GET, POST");
  return sendLocalJson(res, 405, { ok: false, error: "method_not_allowed" });
}

function readLocalAppSettings() {
  const defaults = {
    attendanceDeadline: "08:50",
    attendanceDeadlineEnabled: false,
    onlineManagedStudyCafeEnabled: false,
    curriculumQuestEnabled: false,
    studentDday: null,
  };
  if (!fs.existsSync(LOCAL_APP_SETTINGS_FILE)) return defaults;
  try {
    const saved = JSON.parse(fs.readFileSync(LOCAL_APP_SETTINGS_FILE, "utf8") || "{}");
    return { ...defaults, ...(saved && typeof saved === "object" ? saved : {}), curriculumQuestEnabled: saved?.curriculumQuestEnabled === true };
  } catch {
    return defaults;
  }
}

function readLocalCurriculumProgress() {
  if (!fs.existsSync(LOCAL_CURRICULUM_PROGRESS_FILE)) return {};
  try {
    const value = JSON.parse(fs.readFileSync(LOCAL_CURRICULUM_PROGRESS_FILE, "utf8") || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function serializeLocalCurriculumProgress(progress) {
  return {
    lectureIds: [...new Set(progress.lectureIds || [])],
    stages: Object.entries(progress.stages || {}).map(([stageId, value]) => ({ stageId, ...value })),
  };
}

function getLocalPreviewStudent(body) {
  const studentId = String(body.studentId || "").trim();
  const deviceToken = String(body.deviceToken || "").trim();
  if (!fs.existsSync(LOCAL_STATE_FILE)) return null;
  try {
    const state = JSON.parse(fs.readFileSync(LOCAL_STATE_FILE, "utf8") || "null");
    const settings = state?.settings || {};
    const profile = settings.studentProfiles?.[studentId] || {};
    const student = Array.isArray(state?.students)
      ? state.students.find((item) => String(item.id || "") === studentId)
      : null;
    const category = String(student?.studentCategory || student?.student_category || "").trim();
    if (!settings.forceLocalStudentAuth || settings.studentAuthId !== studentId) return null;
    if (!studentId || !deviceToken || profile.deviceToken !== deviceToken) return null;
    if (!student || category !== "lecture" || student.isActive === false) return null;
    return { id: studentId, name: student.name || "수강생 미리보기", track: student.track || profile.track || "" };
  } catch {
    return null;
  }
}

async function readLocalJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function hashLocalLookupToken(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function mapLocalPublicApplicationStatus(application) {
  return {
    applicationId: application.id,
    status: application.status,
    rejectionReason: application.rejection_reason || "",
    approvedStudentId: application.approved_student_id || "",
    reviewedAt: application.reviewed_at || "",
    submittedAt: application.created_at || "",
    updatedAt: application.updated_at || application.created_at || "",
  };
}

function sendLocalJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

async function handleLocalState(req, res) {
  if (req.method === "GET") {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    if (!fs.existsSync(LOCAL_STATE_FILE)) {
      res.end(JSON.stringify({ ok: true, exists: false, state: null }));
      return;
    }
    const state = JSON.parse(fs.readFileSync(LOCAL_STATE_FILE, "utf8") || "null");
    res.end(JSON.stringify({ ok: true, exists: true, state }));
    return;
  }

  if (req.method === "POST") {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    fs.writeFileSync(LOCAL_STATE_FILE, JSON.stringify(body.state || {}, null, 2));
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  res.writeHead(405, { Allow: "GET, POST" });
  res.end(JSON.stringify({ ok: false }));
}

async function runApiHandler(handler, req, res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    if (!res.headersSent) res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(payload));
  };

  try {
    await handler(req, res);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, error: "local_server_error" }));
  }
}

function serveStatic(pathname, res) {
  const safePath = pathname === "/" ? "/index.html" : decodeURIComponent(pathname);
  const absolutePath = path.resolve(ROOT, "." + safePath);
  if (!absolutePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(absolutePath, (error, data) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": mimeTypes[path.extname(absolutePath)] || "application/octet-stream" });
    res.end(data);
  });
}
