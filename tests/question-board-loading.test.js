const assert = require("node:assert/strict");
const handler = require("../api/question-board");

const originalFetch = global.fetch;
const originalUrl = process.env.SUPABASE_URL;
const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const calls = [];

function jsonResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
}

function responseRecorder() {
  return {
    statusCode: 0,
    payload: null,
    setHeader() {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
}

(async () => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  global.fetch = async (url, options = {}) => {
    const value = String(url);
    calls.push({ url: value, options });
    if (value.includes("/rest/v1/rpc/validate_student_device")) return jsonResponse({ valid: true });
    if (value.includes("/rest/v1/students?id=eq.student-1")) {
      return jsonResponse([{ id: "student-1", name: "홍길동", track: "해경", student_category: "lecture", account_type: "student", position: "" }]);
    }
    if (value.includes("/rest/v1/exam_subject_settings?")) {
      return jsonResponse([{ subject: "해양경찰학개론", sort_order: 1 }]);
    }
    if (value.includes("/rest/v1/question_posts?")) {
      return jsonResponse([{
        id: "post-1",
        student_id: "student-1",
        subject: "자유",
        title: "빠른 게시판",
        image_paths: [],
        status: "open",
        view_count: 3,
        is_hidden: false,
        hidden_reason: null,
        created_at: "2026-08-28T00:00:00.000Z",
        updated_at: "2026-08-28T00:00:00.000Z",
      }]);
    }
    if (value.includes("/rest/v1/students?id=in.")) {
      return jsonResponse([{ id: "student-1", name: "홍길동", account_type: "student", position: "" }]);
    }
    if (value.includes("/rest/v1/study_cafe_profiles?")) return jsonResponse([]);
    if (value.includes("/rest/v1/question_comments?")) return jsonResponse([]);
    throw new Error(`Unexpected Supabase request: ${value}`);
  };

  const req = {
    method: "POST",
    body: {
      action: "list",
      studentId: "student-1",
      deviceToken: "device-token",
      subject: "자유",
      includeSubjects: true,
    },
  };
  const res = responseRecorder();
  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.ok, true);
  assert.equal(res.payload.posts.length, 1);
  assert.equal(res.payload.subjects[0], "자유");

  const postRequest = calls.find((call) => call.url.includes("/rest/v1/question_posts?"));
  assert.ok(postRequest, "the post list query should run");
  assert.match(postRequest.url, /subject=eq\.%EC%9E%90%EC%9C%A0/);
  assert.match(postRequest.url, /is_hidden=eq\.false/);
  assert.match(postRequest.url, /offset=0/);
  assert.match(postRequest.url, /limit=31/);
  assert.doesNotMatch(postRequest.url, /limit=200/);
  assert.doesNotMatch(postRequest.url, /select=[^&]*body/);

  assert.equal(calls.filter((call) => call.url.includes("rpc/validate_student_device")).length, 1);
  console.log("question board loading tests passed");
})().finally(() => {
  global.fetch = originalFetch;
  if (originalUrl === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = originalUrl;
  if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
});
