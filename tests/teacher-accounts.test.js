const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { createSessionToken, readSessionToken } = require("../api/teacher-auth-utils");
const managersHandler = require("../api/managers");
const teacherAccountsHandler = require("../api/teacher-accounts");

function request(method, body = null, cookie = "") {
  const payload = body === null ? [] : [Buffer.from(JSON.stringify(body))];
  return {
    method,
    headers: { cookie },
    async *[Symbol.asyncIterator]() { yield* payload; },
  };
}

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

function jsonResponse(status, data) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return data; },
    async text() { return JSON.stringify(data); },
  };
}

(async () => {
  const previousFetch = global.fetch;
  process.env.TEACHER_SESSION_SECRET = "test-session-secret";
  process.env.TEACHER_USERNAME = "bootstrap-admin";
  process.env.TEACHER_PASSWORD = "bootstrap-password";
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test";

  try {
    const migrationSql = fs.readFileSync(path.join(__dirname, "..", "supabase", "add-teacher-app-accounts.sql"), "utf8");
    assert.match(migrationSql, /account_type text not null default 'student'/i);
    assert.match(migrationSql, /account_type = 'teacher'/i);
    assert.match(migrationSql, /id ~ '\^\(10\|\[1-9\]\)\$'/i);
    assert.match(migrationSql, /position = '선생님'/);
    assert.match(migrationSql, /question_comments_author_identity_check/);

    const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
    const sharedSource = fs.readFileSync(path.join(__dirname, "..", "shared.js"), "utf8");
    const indexSource = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
    const teacherHtmlSource = fs.readFileSync(path.join(__dirname, "..", "teacher.html"), "utf8");
    const questionApiSource = fs.readFileSync(path.join(__dirname, "..", "api", "question-board.js"), "utf8");
    const questionUiSource = fs.readFileSync(path.join(__dirname, "..", "question-board.js"), "utf8");
    assert.match(appSource, /function isTeacherAppAccount/);
    assert.match(appSource, /선생님 계정이 확인되었습니다/);
    assert.match(appSource, /선생님으로 로그인했습니다/);
    assert.doesNotMatch(appSource, /location\.(?:href|assign).*teacher\.html/);
    assert.match(questionApiSource, /teacherAccount \? "teacher" : "student"/);
    assert.match(questionApiSource, /formatTeacherName\(student\.name\)/);
    assert.match(questionUiSource, /post\.authorType === "teacher"/);
    assert.match(sharedSource, /\.filter\(\(student\) => student\.id && student\.name && student\.accountType !== "teacher"\)/);
    assert.match(indexSource, /shared\.js\?v=20260819-teacher-reason-photo/);
    assert.match(teacherHtmlSource, /shared\.js\?v=20260819-teacher-reason-photo/);

    const legacyManagerToken = createSessionToken("test-session-secret", {
      username: "manager",
      role: "student_manager",
      permissions: [
        "exam_numbers.read",
        "study_cafe.read",
        "question_board.read",
        "inquiries.read",
        "managers.read",
      ],
    });
    const currentManagerSession = readSessionToken(legacyManagerToken, "test-session-secret");
    assert.deepStrictEqual(currentManagerSession.permissions, ["exam_numbers.read", "manager_names.read"]);
    const managerPermissionBlock = fs.readFileSync(
      path.join(__dirname, "..", "api", "teacher-auth-utils.js"),
      "utf8"
    ).match(/const STUDENT_MANAGER_PERMISSIONS = \[([\s\S]*?)\];/)?.[1] || "";
    assert.doesNotMatch(managerPermissionBlock, /study_cafe\.(?:read|write)/);
    assert.doesNotMatch(managerPermissionBlock, /question_board\.(?:read|write)/);
    assert.doesNotMatch(managerPermissionBlock, /inquiries\.(?:read|write)/);
    assert.doesNotMatch(managerPermissionBlock, /managers\.read/);
    assert.match(managerPermissionBlock, /MANAGER_NAMES_READ_PERMISSION/);

    const token = createSessionToken("test-session-secret", {
      username: "bootstrap-admin",
      role: "admin",
      permissions: ["*"],
    });
    const calls = [];
    global.fetch = async (url, options = {}) => {
      calls.push({ url: String(url), options });
      if (String(url).includes("/rest/v1/managers?")) {
        assert.match(String(url), /select=id,name,cohort,role,is_active,created_at/);
        assert.doesNotMatch(String(url), /select=[^&]*memo/);
        return jsonResponse(200, [{ id: "manager-1", name: "담당자", cohort: "1", role: "교사", is_active: true }]);
      }
      if (String(url).includes("students?id=eq.3&select=")) return jsonResponse(200, []);
      if (options.method === "POST" && String(url).includes("/rest/v1/students?")) {
        const saved = JSON.parse(options.body);
        assert.strictEqual(saved.id, "3");
        assert.strictEqual(saved.name, "홍길동");
        assert.strictEqual(saved.account_type, "teacher");
        assert.strictEqual(saved.position, "선생님");
        assert.strictEqual(saved.student_category, "lecture");
        assert.strictEqual(saved.password_hash, crypto.createHash("sha256").update("safe-password-123").digest("hex"));
        return jsonResponse(201, [{ id: "3", name: "홍길동", position: "선생님", is_active: true }]);
      }
      if (options.method === "PATCH" && String(url).includes("student_devices?student_id=eq.3")) {
        return jsonResponse(204, null);
      }
      throw new Error(`Unexpected request: ${url}`);
    };

    const managerListRes = response();
    await managersHandler(
      request("GET", null, `teacher_session=${legacyManagerToken}`),
      managerListRes
    );
    assert.strictEqual(managerListRes.statusCode, 200);
    assert.strictEqual(managerListRes.body.managers[0].name, "담당자");

    const createRes = response();
    await teacherAccountsHandler(
      request("POST", { registrationNumber: 3, displayName: "홍길동", password: "safe-password-123" }, `teacher_session=${token}`),
      createRes
    );
    assert.strictEqual(createRes.statusCode, 201);
    assert.strictEqual(createRes.body.account.id, "3");
    assert.strictEqual(calls.length, 4);

    const invalidRes = response();
    await teacherAccountsHandler(
      request("POST", { registrationNumber: 11, displayName: "잘못된 번호", password: "safe-password-123" }, `teacher_session=${token}`),
      invalidRes
    );
    assert.strictEqual(invalidRes.statusCode, 400);

    console.log("teacher app account tests passed");
  } finally {
    global.fetch = previousFetch;
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
