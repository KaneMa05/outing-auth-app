const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);
const LOCAL_STATE_FILE = path.join(ROOT, ".local-dev-state.json");
const LOCAL_LECTURE_APPLICATIONS_FILE = path.join(ROOT, ".local-lecture-applications.json");

loadEnv(path.join(ROOT, ".env"));

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
  "/api/study-cafe": require("./api/study-cafe"),
  "/api/study-cafe-rooms": require("./api/study-cafe-rooms"),
  "/api/reset-student-registration": require("./api/reset-student-registration"),
};

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json; charset=utf-8",
};

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (url.pathname === "/api/local-state") {
      await handleLocalState(req, res);
      return;
    }
    if (url.pathname === "/api/lecture-applications") {
      await handleLocalLectureApplications(req, res);
      return;
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

    const now = new Date().toISOString();
    const lookupToken = crypto.randomBytes(32).toString("base64url");
    const application = {
      id: crypto.randomUUID(),
      name: String(body.name || "").trim(),
      phone: String(body.phone || "").trim(),
      birth_date: String(body.birthDate || "").trim(),
      gender: String(body.gender || "").trim(),
      track: String(body.track || "").trim(),
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
      const approvedCount = applications.filter((item) => item.approved_student_id).length;
      application.approved_student_id = String(900001 + approvedCount);
    }
    application.reviewed_at = new Date().toISOString();
    application.reviewed_by = "local-admin";
    application.updated_at = application.reviewed_at;
    writeLocalLectureApplications(applications);
    return sendLocalJson(res, 200, { ok: true, application });
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
