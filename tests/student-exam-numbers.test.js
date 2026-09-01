const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const handler = require("../api/student-exam-numbers");
const { COOKIE_NAME, createSessionToken } = require("../api/teacher-auth-utils");

function response() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
}

async function invoke(method, body, token = "") {
  const req = {
    method,
    body,
    headers: token ? { cookie: `${COOKIE_NAME}=${token}` } : {},
  };
  const res = response();
  await handler(req, res);
  return res;
}

function jsonResponse(status, data) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
}

const originalFetch = global.fetch;
const originalEnv = {
  url: process.env.SUPABASE_URL,
  key: process.env.SUPABASE_SERVICE_ROLE_KEY,
  secret: process.env.TEACHER_SESSION_SECRET,
};

(async () => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test";
  process.env.TEACHER_SESSION_SECRET = "exam-number-test-secret";
  const adminToken = createSessionToken(process.env.TEACHER_SESSION_SECRET, {
    username: "admin",
    role: "admin",
    permissions: ["*"],
  });
  const managerToken = createSessionToken(process.env.TEACHER_SESSION_SECRET, {
    username: "manager",
    role: "student_manager",
    permissions: ["exam_numbers.read", "exam_numbers.write"],
  });
  const readOnlyToken = createSessionToken(process.env.TEACHER_SESSION_SECRET, {
    username: "viewer",
    role: "student_manager",
    permissions: ["exam_numbers.read"],
  });

  global.fetch = async () => { throw new Error("unauthorized requests must not reach Supabase"); };
  const unauthorized = await invoke("GET");
  assert.equal(unauthorized.statusCode, 401);
  const forbidden = await invoke("GET", null, createSessionToken(process.env.TEACHER_SESSION_SECRET, {
    username: "manager-without-permission",
    role: "student_manager",
    permissions: [],
  }));
  assert.equal(forbidden.statusCode, 403);

  global.fetch = async (url) => {
    if (url.includes("/students?")) {
      assert.match(url, /student_category=eq\.offline/);
      assert.match(url, /is_active=eq\.true/);
      return jsonResponse(200, [{ id: "18001", name: "김학생", cohort: 18, track: "공채" }]);
    }
    if (url.includes("/student_exam_numbers?")) {
      return jsonResponse(200, [{ student_id: "18001", exam_number: "A-100", updated_at: "2026-09-01T00:00:00Z" }]);
    }
    throw new Error(`unexpected GET request: ${url}`);
  };
  const loaded = await invoke("GET", null, adminToken);
  assert.equal(loaded.statusCode, 200);
  assert.deepEqual(loaded.body.students, [{ id: "18001", name: "김학생", cohort: "18", track: "공채" }]);
  assert.equal(loaded.body.examNumbers[0].examNumber, "A-100");
  const managerLoaded = await invoke("GET", null, managerToken);
  assert.equal(managerLoaded.statusCode, 200);

  const requests = [];
  global.fetch = async (url, options = {}) => {
    requests.push({ url, options });
    if (url.includes("/students?")) {
      return jsonResponse(200, [
        { id: "18001", name: "김학생", cohort: 18, track: "공채" },
        { id: "18002", name: "이학생", cohort: 18, track: "기관" },
      ]);
    }
    if (options.method === "POST" && url.includes("student_exam_numbers?on_conflict=student_id")) {
      return jsonResponse(204, null);
    }
    if (options.method === "DELETE" && url.includes("student_exam_numbers?student_id=eq.18002")) {
      return jsonResponse(204, null);
    }
    throw new Error(`unexpected save request: ${options.method} ${url}`);
  };
  const saved = await invoke("POST", {
    entries: [
      { studentId: "18001", examNumber: " A 100 " },
      { studentId: "18002", examNumber: "" },
    ],
  }, managerToken);
  assert.equal(saved.statusCode, 200);
  const upsert = requests.find((request) => request.options.method === "POST");
  assert.equal(JSON.parse(upsert.options.body)[0].exam_number, "A100");
  assert.ok(requests.some((request) => request.options.method === "DELETE"));

  global.fetch = async () => { throw new Error("read-only sessions must not write"); };
  const readOnlySave = await invoke("POST", { entries: [{ studentId: "18001", examNumber: "100" }] }, readOnlyToken);
  assert.equal(readOnlySave.statusCode, 403);

  global.fetch = async (url) => {
    if (url.includes("/students?")) return jsonResponse(200, [{ id: "18001", name: "김학생", cohort: 18, track: "공채" }]);
    throw new Error("ineligible rows must not be written");
  };
  const ineligible = await invoke("POST", { entries: [{ studentId: "20001", examNumber: "999" }] }, adminToken);
  assert.equal(ineligible.statusCode, 400);
  assert.equal(ineligible.body.error, "ineligible_student");

  const migration = fs.readFileSync(path.join(__dirname, "..", "supabase", "add-student-exam-numbers.sql"), "utf8");
  assert.match(migration, /alter table public\.student_exam_numbers enable row level security/i);
  assert.match(migration, /revoke all on table public\.student_exam_numbers from public, anon, authenticated/i);
  assert.match(migration, /grant select, insert, update, delete on table public\.student_exam_numbers to service_role/i);

  const teacherHtml = fs.readFileSync(path.join(__dirname, "..", "teacher.html"), "utf8");
  const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  const studentAdminSource = fs.readFileSync(path.join(__dirname, "..", "teacher-students.js"), "utf8");
  const authSource = fs.readFileSync(path.join(__dirname, "..", "api", "teacher-auth-utils.js"), "utf8");
  const sharedSource = fs.readFileSync(path.join(__dirname, "..", "shared.js"), "utf8");
  assert.match(teacherHtml, /data-route="student-exam-numbers"/);
  assert.match(appSource, /"student-exam-numbers": renderStudentExamNumberAdmin/);
  assert.match(studentAdminSource, /student\.cohort === cohort/);
  assert.match(studentAdminSource, /현재 재원 중인 오프라인 학생만 표시됩니다/);
  assert.match(studentAdminSource, /downloadStudentExamNumberWorkbook\(cohort, students\)/);
  assert.match(studentAdminSource, /hasTeacherPermission\("exam_numbers\.export"\)/);
  assert.match(studentAdminSource, /saveStudentExamNumberChanges\(student\.id, rowSaveButton, examNumberInput\)/);
  assert.match(studentAdminSource, /rowSaveButton\.hidden = Boolean\(savedExamNumber\) && !isDirty/);
  assert.match(studentAdminSource, /rowSaveButton\.disabled = !isDirty/);
  assert.match(studentAdminSource, /rowSaveButton\.hidden = Boolean\(saved\) && normalized === saved/);
  assert.match(studentAdminSource, /_응시번호_명단\.xlsx/);
  assert.match(authSource, /"exam_numbers\.read"/);
  assert.match(authSource, /"exam_numbers\.write"/);
  const managerPermissions = authSource.match(/const STUDENT_MANAGER_PERMISSIONS = \[([\s\S]*?)\];/)?.[1] || "";
  assert.doesNotMatch(managerPermissions, /exam_numbers\.export/);
  assert.match(sharedSource, /"student-exam-numbers": "exam_numbers\.read"/);

  console.log("student exam number tests passed");
})()
  .finally(() => {
    global.fetch = originalFetch;
    for (const [key, value] of Object.entries(originalEnv)) {
      const envName = key === "url" ? "SUPABASE_URL" : key === "key" ? "SUPABASE_SERVICE_ROLE_KEY" : "TEACHER_SESSION_SECRET";
      if (value === undefined) delete process.env[envName];
      else process.env[envName] = value;
    }
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
