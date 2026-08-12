const assert = require("node:assert/strict");

const handler = require("../api/app-settings");
const { COOKIE_NAME, createSessionToken } = require("../api/teacher-auth-utils");

function createRequest(method = "GET", body = {}, token = "") {
  const bytes = Buffer.from(JSON.stringify(body));
  return {
    method,
    headers: token ? { cookie: `${COOKIE_NAME}=${token}` } : {},
    async *[Symbol.asyncIterator]() {
      if (method === "POST") yield bytes;
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

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
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
  process.env.TEACHER_SESSION_SECRET = "app-settings-test-secret";

  global.fetch = async () => jsonResponse([{
    body: JSON.stringify({
      attendanceDeadline: "08:50",
      attendanceDeadlineEnabled: false,
      onlineManagedStudyCafeEnabled: true,
    }),
  }]);
  const publicResponse = createResponse();
  await handler(createRequest(), publicResponse);
  assert.equal(publicResponse.statusCode, 200);
  assert.equal(publicResponse.payload.settings.onlineManagedStudyCafeEnabled, true);
  assert.equal(publicResponse.payload.settings.curriculumQuestEnabled, false);

  const managerToken = createSessionToken(process.env.TEACHER_SESSION_SECRET, {
    username: "manager",
    role: "student_manager",
    permissions: ["attendance.write"],
  });
  let fetchCalled = false;
  global.fetch = async () => {
    fetchCalled = true;
    return jsonResponse([]);
  };
  const forbiddenResponse = createResponse();
  await handler(
    createRequest("POST", { settings: { onlineManagedStudyCafeEnabled: true } }, managerToken),
    forbiddenResponse
  );
  assert.equal(forbiddenResponse.statusCode, 403);
  assert.equal(fetchCalled, false);

  const curriculumForbiddenResponse = createResponse();
  await handler(
    createRequest("POST", { settings: { curriculumQuestEnabled: true } }, managerToken),
    curriculumForbiddenResponse
  );
  assert.equal(curriculumForbiddenResponse.statusCode, 403);
  assert.equal(fetchCalled, false);

  const adminToken = createSessionToken(process.env.TEACHER_SESSION_SECRET, {
    username: "admin",
    role: "admin",
    permissions: ["*"],
  });
  let savedSettings = null;
  global.fetch = async (url, options) => {
    if (options.method === "GET") {
      return jsonResponse([{
        body: JSON.stringify({
          attendanceDeadline: "08:50",
          attendanceDeadlineEnabled: false,
          onlineManagedStudyCafeEnabled: false,
        }),
      }]);
    }
    savedSettings = JSON.parse(JSON.parse(options.body).body);
    return jsonResponse(null, 204);
  };
  const adminResponse = createResponse();
  await handler(
    createRequest("POST", { settings: { onlineManagedStudyCafeEnabled: true } }, adminToken),
    adminResponse
  );
  assert.equal(adminResponse.statusCode, 200);
  assert.equal(adminResponse.payload.settings.onlineManagedStudyCafeEnabled, true);
  assert.equal(savedSettings.onlineManagedStudyCafeEnabled, true);

  const curriculumAdminResponse = createResponse();
  await handler(
    createRequest("POST", { settings: { curriculumQuestEnabled: true } }, adminToken),
    curriculumAdminResponse
  );
  assert.equal(curriculumAdminResponse.statusCode, 200);
  assert.equal(curriculumAdminResponse.payload.settings.curriculumQuestEnabled, true);

  console.log("app settings toggle tests passed");
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
