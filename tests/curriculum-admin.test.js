const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const handler = require("../api/curriculum");
const { COOKIE_NAME, createSessionToken } = require("../api/teacher-auth-utils");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const appSource = read("app.js");
const adminSource = read("curriculum-admin.js");
const teacherHtml = read("teacher.html");
const sharedSource = read("shared.js");
const schemaSource = read("supabase/add-curriculum-management.sql");
const localServerSource = read("local-dev-server.js");
const localSetupSource = read("scripts/setup-local-curriculum.js");
const stageTitleUpdateSql = read("supabase/update-curriculum-stage-titles.sql");
const packageJson = JSON.parse(read("package.json"));
const { restructureCurriculumIntoSessions } = require("../scripts/curriculum-sessions");

assert.match(appSource, /"curriculum-admin": renderCurriculumAdmin/);
assert.match(appSource, /loadCurriculumQuestCatalog/);
assert.doesNotMatch(appSource, /renderCurriculumQuestHomeCard|lecture-home-summary-card/);
assert.match(appSource, /route !== "curriculum"/);
assert.match(adminSource, /function renderCurriculumAdmin\(/);
assert.match(adminSource, /function addCurriculumAdminSubject\(/);
assert.match(adminSource, /function addCurriculumAdminStage\(/);
assert.match(adminSource, /function addCurriculumAdminLecture\(/);
assert.match(adminSource, /action: "save_subject"/);
assert.match(adminSource, /action: "delete_subject"/);
assert.match(adminSource, /curriculumQuestEnabled/);
assert.match(adminSource, /학생 공개/);
assert.match(adminSource, /function deriveCurriculumAdminStageTitle\(/);
assert.match(adminSource, /curriculumAdminField\("회차명", stage\.title, "회차 제목", \(value\) => \{ stage\.title = value; \}, 1000\)/);
assert.doesNotMatch(adminSource, /curriculumAdminReadOnlyField/);
assert.match(adminSource, /title: String\(stage\.title \|\| ""\)\.trim\(\) \|\| deriveCurriculumAdminStageTitle\(stage\)/);
assert.match(read("scripts/generate-curriculum-seed.js"), /const stageTitle = lectures\.map/);
assert.match(
  read("supabase/seed-curriculum-public-recruitment.sql"),
  /'criminal-law-stage-11'.*'살인의 죄, 폭행죄, 협박의 죄, 체포와 감금의 죄, 강간과 추행의 죄'/
);
assert.match(teacherHtml, /data-route="curriculum-admin"/);
assert.match(teacherHtml, /curriculum-admin\.js/);
assert.match(sharedSource, /"curriculum-admin": "curriculum\.read"/);
assert.match(schemaSource, /alter table public\.curriculum_subjects enable row level security/);
assert.match(schemaSource, /revoke all on public\.curriculum_subjects from anon, authenticated/);
assert.match(schemaSource, /curriculum_stages_subject_sort_idx/);
assert.match(schemaSource, /target_tracks text\[\]/);
assert.match(schemaSource, /requires_wrap_up boolean/);
assert.match(schemaSource, /char_length\(title\) between 1 and 1000/);
assert.match(stageTitleUpdateSql, /string_agg\(title, ', ' order by sort_order, id\)/);
assert.match(stageTitleUpdateSql, /where stage\.id = lecture_titles\.stage_id/);
assert.doesNotMatch(stageTitleUpdateSql, /subject_id\s*=/);
assert.match(localServerSource, /handleLocalCurriculum/);
assert.match(localServerSource, /curriculum_disabled/);
assert.match(sharedSource, /createLocalDevStoreUrl\(\) \|\| !loadedAppSettingsFromNotices/);
assert.match(sharedSource, /Object\.assign\(state, mergeDefaultState\(data\.state\)\);[\s\S]*?await loadAppSettingsFromApi\(\);[\s\S]*?saveStateToLocalStorage\(\);/);
assert.match(localSetupSource, /includeUnpublished: true/);
assert.match(localSetupSource, /curriculumQuestEnabled: true/);
assert.match(localSetupSource, /localState\.settings = \{ \.\.\.\(localState\.settings \|\| \{\}\), curriculumQuestEnabled: true \}/);
assert.equal(packageJson.scripts["curriculum:local"], "node scripts/setup-local-curriculum.js");
assert.equal(packageJson.scripts["dev:local"], "node local-dev-server.js");
assert.doesNotMatch(read("index.html"), /curriculum-data\.js/);

const sessionCatalog = restructureCurriculumIntoSessions([{
  id: "subject-a",
  stages: [{
    id: "unit-1",
    isPublished: true,
    requiresWrapUp: true,
    lectures: [
      { id: "lecture-1", no: "1강", title: "첫 강의", sortOrder: 1 },
      { id: "lecture-2", no: "2강", title: "둘째 강의", sortOrder: 2 },
    ],
  }],
}], { "subject-a": [{ date: "2026-06-21", end: 2 }] });
assert.equal(sessionCatalog[0].totalStages, 1);
assert.equal(sessionCatalog[0].stages[0].id, "subject-a-session-1");
assert.equal(sessionCatalog[0].stages[0].scheduledDate, "2026-06-21");
assert.equal(sessionCatalog[0].stages[0].title, "첫 강의, 둘째 강의");
assert.equal(sessionCatalog[0].stages[0].lectures[1].id, "lecture-2");

const normalized = handler._test.normalizeSubject({
  id: "criminal-law",
  name: "형사법",
  shortName: "형사",
  stages: [{
    id: "criminal-law-stage-1",
    title: "형법 총론",
    lectures: [{ id: "lecture-1", no: "1강", title: "형법의 기초" }],
  }],
});
assert.equal(normalized.totalStages, 1);
assert.equal(normalized.stages[0].stageNumber, 1);
assert.equal(normalized.stages[0].title, "형법 총론");
assert.equal(normalized.stages[0].lectures[0].sortOrder, 1);

function createResponse() {
  return {
    headers: {},
    statusCode: 200,
    payload: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

async function invoke({ method = "GET", body, admin = false, token = "" } = {}) {
  const req = {
    method,
    body,
    query: admin ? { admin: "1" } : {},
    headers: token ? { cookie: `${COOKIE_NAME}=${token}` } : {},
  };
  const res = createResponse();
  await handler(req, res);
  return res;
}

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
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
  process.env.TEACHER_SESSION_SECRET = "curriculum-test-secret";
  const adminToken = createSessionToken(process.env.TEACHER_SESSION_SECRET, {
    username: "admin",
    role: "admin",
    permissions: ["*"],
  });
  const viewerToken = createSessionToken(process.env.TEACHER_SESSION_SECRET, {
    username: "viewer",
    role: "student_manager",
    permissions: ["curriculum.read"],
  });

  global.fetch = async () => { throw new Error("fetch should not run"); };
  const unauthorizedAdmin = await invoke({ admin: true });
  assert.equal(unauthorizedAdmin.statusCode, 401);

  const forbiddenWrite = await invoke({ method: "POST", token: viewerToken, body: { action: "delete_subject", subjectId: "criminal-law" } });
  assert.equal(forbiddenWrite.statusCode, 403);

  global.fetch = async (url) => {
    if (url.includes("notices?id=eq.__app_settings__")) return jsonResponse([{ body: JSON.stringify({ curriculumQuestEnabled: false }) }]);
    throw new Error(`unexpected request: ${url}`);
  };
  const hiddenCatalog = await invoke();
  assert.equal(hiddenCatalog.statusCode, 200);
  assert.equal(hiddenCatalog.payload.enabled, false);
  assert.deepEqual(hiddenCatalog.payload.subjects, []);

  global.fetch = async (url) => {
    if (url.includes("notices?id=eq.__app_settings__")) return jsonResponse([{ body: JSON.stringify({ curriculumQuestEnabled: true }) }]);
    if (url.includes("curriculum_subjects?")) return jsonResponse([{ id: "criminal-law", name: "형사법", short_name: "형사", tone: "indigo", sort_order: 1, is_published: true }]);
    if (url.includes("curriculum_stages?")) return jsonResponse([{ id: "stage-1", subject_id: "criminal-law", stage_number: 1, title: "형법 총론", sort_order: 1, is_published: true }]);
    if (url.includes("curriculum_lectures?")) return jsonResponse([{ id: "lecture-1", stage_id: "stage-1", lecture_number: "1강", title: "형법의 기초", sort_order: 1 }]);
    throw new Error(`unexpected request: ${url}`);
  };
  const publicCatalog = await invoke();
  assert.equal(publicCatalog.statusCode, 200);
  assert.equal(publicCatalog.payload.subjects[0].stages[0].title, "형법 총론");
  assert.equal(publicCatalog.payload.subjects[0].stages[0].lectures[0].title, "형법의 기초");

  const requests = [];
  global.fetch = async (url, options = {}) => {
    requests.push({ url, options });
    if (options.method === "GET") return jsonResponse([]);
    return jsonResponse(null, 204);
  };
  const saved = await invoke({
    method: "POST",
    token: adminToken,
    body: { action: "save_subject", subject: normalized },
  });
  assert.equal(saved.statusCode, 200);
  assert.ok(requests.some((request) => request.url.includes("curriculum_subjects?on_conflict=id")));
  assert.ok(requests.some((request) => request.url.includes("curriculum_stages?on_conflict=id")));
  assert.ok(requests.some((request) => request.url.includes("curriculum_lectures?on_conflict=id")));

  console.log("curriculum admin tests passed");
})().finally(() => {
  global.fetch = originalFetch;
  if (originalEnv.url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = originalEnv.url;
  if (originalEnv.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = originalEnv.key;
  if (originalEnv.secret === undefined) delete process.env.TEACHER_SESSION_SECRET; else process.env.TEACHER_SESSION_SECRET = originalEnv.secret;
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
