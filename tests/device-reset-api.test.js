const assert = require("node:assert/strict");

const studentResetHandler = require("../api/student-reset-registration");
const teacherResetHandler = require("../api/reset-student-registration");
const { COOKIE_NAME, createSessionToken } = require("../api/teacher-auth-utils");

function createRequest(body, headers = {}) {
  const bytes = Buffer.from(JSON.stringify(body));
  return {
    method: "POST",
    headers,
    async *[Symbol.asyncIterator]() {
      yield bytes;
    },
  };
}

function createResponse() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
    setHeader() {},
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
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
  process.env.TEACHER_SESSION_SECRET = "teacher-test-secret";

  let request = null;
  global.fetch = async (url, options) => {
    request = { url, options };
    return { ok: true, status: 200, json: async () => ({ reset: true, revoked_count: 2 }) };
  };

  const studentResponse = createResponse();
  await studentResetHandler(createRequest({
    studentId: "18001",
    passwordHash: "password-hash",
    reason: "new phone",
    client: { displayMode: "standalone", userAgent: "test-agent" },
  }), studentResponse);
  assert.equal(studentResponse.statusCode, 200);
  assert.equal(studentResponse.payload.revokedCount, 2);
  assert.match(request.url, /\/rpc\/reset_student_devices$/);
  assert.equal(JSON.parse(request.options.body).p_actor, "student");

  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ error: "password_mismatch" }),
  });
  const mismatchResponse = createResponse();
  await studentResetHandler(createRequest({
    studentId: "18001",
    passwordHash: "wrong-hash",
    reason: "new phone",
  }), mismatchResponse);
  assert.equal(mismatchResponse.statusCode, 403);

  const teacherToken = createSessionToken("teacher-test-secret", {
    username: "admin",
    role: "admin",
    permissions: ["*"],
  });
  global.fetch = async (url, options) => {
    request = { url, options };
    return { ok: true, status: 200, json: async () => ({ reset: true, revoked_count: 1 }) };
  };
  const teacherResponse = createResponse();
  await teacherResetHandler(
    createRequest({ studentId: "18001" }, { cookie: `${COOKIE_NAME}=${teacherToken}` }),
    teacherResponse
  );
  assert.equal(teacherResponse.statusCode, 200);
  assert.equal(teacherResponse.payload.revokedCount, 1);
  assert.equal(JSON.parse(request.options.body).p_actor, "teacher");

  console.log("device reset API tests passed");
})()
  .finally(() => {
    global.fetch = originalFetch;
    if (originalEnv.url === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalEnv.url;
    if (originalEnv.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalEnv.key;
    if (originalEnv.secret === undefined) delete process.env.TEACHER_SESSION_SECRET;
    else process.env.TEACHER_SESSION_SECRET = originalEnv.secret;
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
