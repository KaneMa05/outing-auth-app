const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const vm = require("node:vm");
const { notifyApplicationSubmitted } = require("../lib/application-slack");
const lectureHandler = require("../api/lecture-applications");
const { createHandler } = require("../api/interview-auth");

const writtenUrl = "https://hooks.slack.com/services/TTEST/BWRITTEN/test-secret-written";
const interviewUrl = "https://hooks.slack.com/services/TTEST/BINTERVIEW/test-secret-interview";
const env = {
  SLACK_WRITTEN_APPLICATION_WEBHOOK_URL: writtenUrl,
  SLACK_INTERVIEW_APPLICATION_WEBHOOK_URL: interviewUrl,
};
const application = {
  id: "application-test", name: "홍길동 <!channel>", track: "공채", phone: "010-1234-5678",
  course_type: "online_managed", cohort: 18, exam_number: "N-001", revision: 1,
  created_at: "2026-11-05T01:02:03Z", updated_at: "2026-11-05T02:03:04Z",
  birth_date: "2000-01-02", lookup_token_hash: "private-lookup-hash", owner_id: "private-owner",
};
const response = () => ({
  statusCode: 0, headers: {}, payload: null,
  setHeader(name, value) { this.headers[name] = value; },
  status(code) { this.statusCode = code; return this; },
  json(body) { this.payload = body; return this; },
});
function setEnv(t, values) {
  const before = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) process.env[key] = value;
  t.after(() => {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
}
function mockFetch(t, fetcher) {
  const original = global.fetch;
  global.fetch = fetcher;
  t.after(() => { global.fetch = original; });
}

test("each channel receives only selected fields and safely displays applicant text", async () => {
  const calls = [], tasks = [];
  const options = {
    env, schedule: task => tasks.push(task), warn: () => assert.fail("Unexpected delivery failure"),
    fetcher: async (url, init) => { calls.push({ url, init }); return new Response("ok"); },
  };
  await notifyApplicationSubmitted("written", application, options);
  await notifyApplicationSubmitted("interview", { ...application, revision: 3 }, options);
  assert.equal(tasks.length, 2);
  assert.deepEqual(calls.map(call => call.url), [writtenUrl, interviewUrl]);
  const [written, interview] = calls.map(call => JSON.parse(call.init.body));
  assert.match(written.text, /필기반.*신청/);
  assert.match(written.text, /온라인 관리반/);
  assert.match(written.text, /010-\*\*\*\*-5678/);
  assert.match(written.text, /18기/);
  assert.match(written.text, /11:03:04/);
  assert.match(written.text, /&lt;!channel&gt;/);
  assert.equal(written.blocks[0].text.type, "plain_text");
  assert.match(interview.text, /면접반.*신청/);
  assert.match(interview.text, /N-001/);
  assert.match(interview.text, /신청 정보 수정·재신청/);
  assert.doesNotMatch(interview.text, /010-/);
  for (const { init } of calls) {
    assert.equal(init.method, "POST");
    assert.equal(init.redirect, "error");
    assert(init.signal instanceof AbortSignal);
    assert.doesNotMatch(init.body, /2000-01-02|private-lookup-hash|private-owner|1234-5678/);
  }
  for (const [course, label] of [["offline", "오프라인"], ["lecture", "인터넷 수강생"]]) {
    await notifyApplicationSubmitted("written", { ...application, course_type: course }, options);
    const text = JSON.parse(calls.at(-1).init.body).text;
    assert.match(text, new RegExp(label));
  }
});

test("a missing channel stays disabled; invalid destinations and Slack failures stay contained", async () => {
  let calls = 0;
  const warnings = [], tasks = [];
  const options = { env: {}, schedule: task => tasks.push(task),
    fetcher: async () => { calls++; return new Response("ok"); }, warn: warning => warnings.push(warning) };
  assert.equal(notifyApplicationSubmitted("written", application, options), undefined);
  assert.equal(notifyApplicationSubmitted("other", application, { ...options, env }), undefined);
  assert.equal(notifyApplicationSubmitted("written", {}, { ...options, env }), undefined);
  assert.equal(calls, 0);
  assert.equal(tasks.length, 0);
  await notifyApplicationSubmitted("written", application, { ...options, env: { SLACK_INTERVIEW_APPLICATION_WEBHOOK_URL: interviewUrl } });
  assert.equal(calls, 0, "Never fall back to the other channel");
  for (const url of ["not-a-url", "http://hooks.slack.com/services/T/B/S", "https://evil.test/services/T/B/S", writtenUrl + "?secret=test"]) {
    await notifyApplicationSubmitted("written", application, { ...options, env: { SLACK_WRITTEN_APPLICATION_WEBHOOK_URL: url } });
  }
  assert.equal(calls, 0);
  for (const fetcher of [
    async () => new Response("rate_limited", { status: 429 }),
    async () => new Response("invalid_token"),
    async () => { throw Error("network failure with " + writtenUrl); },
    async () => { throw new DOMException("timed out", "TimeoutError"); },
  ]) await notifyApplicationSubmitted("written", application, { ...options, env, fetcher });
  assert.equal(warnings.length, 8);
  assert(warnings.every(warning => warning === "[application-slack] written delivery_failed"));
  await notifyApplicationSubmitted("written", application, {
    ...options, env, schedule: () => { throw Error("no request context"); },
  });
  assert.equal(calls, 1, "A local scheduling error cannot reject the submission");
});

test("written and interview APIs finish saved submissions while Slack is still pending", async t => {
  setEnv(t, { ...env, SUPABASE_URL: "https://database.test", SUPABASE_SERVICE_ROLE_KEY: "test-service-role" });
  const tasks = [], slack = [], complete = [];
  const contextKey = Symbol.for("@vercel/request-context"), previousContext = globalThis[contextKey];
  globalThis[contextKey] = { get: () => ({ waitUntil: task => tasks.push(task) }) };
  t.after(() => {
    if (previousContext === undefined) delete globalThis[contextKey]; else globalThis[contextKey] = previousContext;
  });
  let saved = false, failSave = false;
  mockFetch(t, async (url, init) => {
    if (url.startsWith("https://hooks.slack.com/")) {
      assert(saved, "Notification must follow a successful database save");
      slack.push({ url, init });
      return new Promise(resolve => complete.push(resolve));
    }
    if (url.includes("notices?id=eq.__app_settings__")) return Response.json([{ body: "{\"phoneVerificationEnabled\":false}" }]);
    assert.equal(url, "https://database.test/rest/v1/lecture_applications");
    assert.equal(init.method, "POST");
    if (failSave) return Response.json({ code: "23505" }, { status: 409 });
    saved = true;
    return Response.json([{ ...JSON.parse(init.body), id: "written-test", created_at: application.created_at }], { status: 201 });
  });
  const validBody = {
    name: "필기학생", phone: "010-1234-5678", birthDate: "2000-01-02", gender: "남",
    track: "경찰직 - 공채(순경)", courseType: "offline", referralSource: "naver_cafe",
    privacyConsent: true, termsConsent: true,
  };
  const written = async (body, ip) => {
    const res = response();
    await lectureHandler({ method: "POST", body, headers: { "x-forwarded-for": ip } }, res);
    return res;
  };
  const first = await written(validBody, "10.20.0.1");
  assert.equal(first.statusCode, 201);
  assert.equal(first.payload.applicationId, "written-test");
  assert(first.payload.lookupToken);
  assert.equal(slack.length, 1);
  assert.equal(slack[0].url, writtenUrl);
  assert.equal(tasks.length, 1, "Vercel retains the unfinished background task");
  assert.equal((await written({ ...validBody, name: "" }, "10.20.0.2")).statusCode, 400);
  failSave = true;
  assert.equal((await written(validBody, "10.20.0.3")).statusCode, 409);
  assert.equal(slack.length, 1, "Invalid and duplicate submissions send nothing");

  const cfg = { enabled: true, origin: "https://app.test" };
  let rejectApply = false;
  const handler = createHandler({ getConfig: () => cfg, invoke: async action => {
    assert.equal(action, "apply");
    if (rejectApply) throw Error("revision_conflict");
    return { ok: true, application: { ...application, id: "interview-test" } };
  } });
  const apply = async body => {
    const res = response();
    await handler({ method: "POST", url: "/api/interview-auth", headers: { host: "app.test", origin: cfg.origin }, body }, res);
    return res;
  };
  const body = { action: "apply", name: "면접학생", track: "기관", examNumber: "N-001", revision: 0 };
  const second = await apply(body);
  assert.equal(second.statusCode, 200);
  assert.equal(second.payload.application.id, "interview-test");
  assert.equal(slack.length, 2);
  assert.equal(slack[1].url, interviewUrl);
  assert.equal(tasks.length, 2);
  rejectApply = true;
  assert.equal((await apply(body)).statusCode, 409);
  assert.equal((await apply({ ...body, name: "" })).statusCode, 400);
  assert.equal(slack.length, 2, "Rejected interview saves send nothing");
  complete.forEach(resolve => resolve(new Response("ok")));
  await Promise.all(tasks);
});

test("the public build contains neither channel webhook", () => {
  let output;
  vm.runInNewContext(fs.readFileSync("build-config.js", "utf8"), {
    require: name => name === "./lib/interview-preview-access" ? require("../lib/interview-preview-access")
      : { existsSync: () => true, writeFileSync: (_, value) => { output = value; } },
    process: { env: { ...env, SUPABASE_URL: "https://database.test", SUPABASE_ANON_KEY: "public-key" } },
    console: { log() {} }, URL,
  });
  assert(output);
  assert(!output.includes(writtenUrl));
  assert(!output.includes(interviewUrl));
  assert(!output.includes("SLACK_"));
});
