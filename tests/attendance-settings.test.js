const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const settingsHandler = require("../api/app-settings");
const holidayHandler = require("../api/attendance-holidays");
const { COOKIE_NAME, createSessionToken } = require("../api/teacher-auth-utils");

const shared = fs.readFileSync("shared.js", "utf8");
const teacher = fs.readFileSync("teacher.js", "utf8");
function extract(source, name) {
  const match = source.match(new RegExp(`^(?:async )?function ${name}\\([^]*?^}`, "m"));
  assert.ok(match, `${name} exists`);
  return match[0];
}

function createClient() {
  const context = vm.createContext({
    console, Date, Map, Set,
    state: { settings: { attendanceDeadline: "08:50", attendanceDeadlineEnabled: true, attendanceHolidayOverrides: [] }, attendanceHolidays: [] },
    DEFAULT_ATTENDANCE_DEADLINE: "08:50",
    ATTENDANCE_OPEN_OVERRIDE_NOTE: "__open_attendance_day__",
    APP_MODE: "teacher", KOREA_PUBLIC_HOLIDAYS: {},
    attendanceHolidayRevision: 0, attendanceHolidayDraftMonths: new Map(),
    getTodayDateKey: () => "2026-09-11", saveState: () => {},
    isTeacherAdmin: () => true,
    fetch: async () => ({ ok: true, json: async () => ({ ok: true }) }),
  });
  const sharedFunctions = [
    "isValidDateKey", "normalizeDateKeyList", "normalizeAttendanceHolidays", "getCustomAttendanceHolidays",
    "getAttendanceHoliday", "isAttendanceHoliday", "getDefaultAttendanceHoliday", "isAttendanceHolidayOverridden",
    "setAttendanceHolidayOverride", "getKoreaPublicHolidayName", "isWeekendDateKey", "parseDateKeyAsLocalDate",
    "setAttendanceHoliday", "deleteAttendanceHoliday", "saveAttendanceHolidayToRemote", "deleteAttendanceHolidayFromRemote",
    "saveAttendanceHolidayRowsToTeacherApi", "deleteAttendanceHolidayFromTeacherApi", "applyRemoteAttendanceHolidays",
    "loadAttendanceHolidaysFromRemote", "getDateInputValue", "isAttendanceCheckOpen", "formatAttendanceDeadline",
    "getAttendanceDeadlineParts", "normalizeAttendanceDeadlineValue", "normalizeAttendanceDateDeadlines", "isAttendanceDeadlineEnabled",
  ];
  vm.runInContext(sharedFunctions.map((name) => extract(shared, name)).join("\n"), context);
  vm.runInContext(["getAttendanceHolidayMonthDraft", "saveAttendanceHolidayMonth", "renderAttendanceHolidayCalendar"]
    .map((name) => extract(teacher, name)).join("\n"), context);
  return context;
}

function jsonResponse(payload, status = 200) {
  return { ok: status < 300, status, json: async () => payload, text: async () => JSON.stringify(payload) };
}
async function invoke(handler, method, body, token = "") {
  const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.payload = value; }, setHeader() {} };
  await handler({ method, headers: { cookie: `${COOKIE_NAME}=${token}` }, async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(body)); } }, response);
  return response;
}

async function testHolidayPersistence() {
  const c = createClient();
  const row = { date_key: "2026-09-12", note: "__open_attendance_day__" };
  c.applyRemoteAttendanceHolidays([row]);
  assert.equal(c.isAttendanceHoliday("2026-09-12"), false);
  assert.equal(c.getAttendanceHolidayMonthDraft("2026-09").checkedDefaultHolidayDates.has("2026-09-12"), false,
    "a fresh browser must show the saved Saturday as an attendance day");
  await c.saveAttendanceHolidayMonth("2026-09", [], [...c.getAttendanceHolidayMonthDraft("2026-09").checkedDefaultHolidayDates]);
  assert.equal(c.isAttendanceHoliday("2026-09-12"), false, "saving without changes must preserve the server override");

  c.fetch = async () => jsonResponse({ ok: false }, 503);
  await assert.rejects(c.setAttendanceHoliday("2026-09-14"));
  assert.equal(c.isAttendanceHoliday("2026-09-14"), false, "failed additions must not appear saved locally");
  await assert.rejects(c.setAttendanceHolidayOverride("2026-09-19", true));
  assert.equal(c.isAttendanceHolidayOverridden("2026-09-19"), false, "failed overrides must not change local flags");
  await assert.rejects(c.setAttendanceHolidayOverride("2026-09-12", false));
  assert.equal(c.isAttendanceHolidayOverridden("2026-09-12"), true, "failed deletion must preserve the stored override");
  c.fetch = async () => jsonResponse({ ok: false });
  await assert.rejects(c.setAttendanceHoliday("2026-09-14"), "HTTP 200 without ok=true is not success");
  c.fetch = async () => jsonResponse({ ok: true });
  await c.setAttendanceHoliday("2026-09-12", "updated note");
  assert.equal(c.state.attendanceHolidays[0].note, "updated note", "updating an existing date must replace its old note");
  c.applyRemoteAttendanceHolidays([], 0);
  assert.equal(c.state.attendanceHolidays.length, 1, "a refresh started before a successful write must not undo that write");
  c.applyRemoteAttendanceHolidays([]);
  assert.equal(c.isAttendanceHolidayOverridden("2026-09-12"), false, "server deletion must clear legacy local overrides");

  // Exercise the actual checkbox change handlers: clicking a weekend must not
  // rebuild the form and discard a weekday choice, even after changing months.
  c.el = (tag, props = {}, children = []) => ({
    tag, ...props, children: Array.isArray(children) ? children : [children], handlers: {},
    addEventListener(event, callback) { this.handlers[event] = callback; },
    classList: { toggle() {} },
    querySelector(tagName) { return this.children.find((child) => child?.tag === tagName); },
  });
  c.document = { querySelector: () => null };
  c.attendanceHolidayDraftMonths.clear();
  let calendar = c.renderAttendanceHolidayCalendar("2026-09");
  const inputFor = (dateKey) => calendar.children.flatMap((cell) => cell.children || []).find((child) => child?.value === dateKey);
  const weekday = inputFor("2026-09-14");
  weekday.checked = true;
  weekday.handlers.change();
  const weekend = inputFor("2026-09-12");
  weekend.checked = false;
  weekend.handlers.change();
  c.renderAttendanceHolidayCalendar("2026-10");
  calendar = c.renderAttendanceHolidayCalendar("2026-09");
  assert.equal(inputFor("2026-09-14").checked, true);
  assert.equal(inputFor("2026-09-12").checked, false);
  const draft = c.getAttendanceHolidayMonthDraft("2026-09");
  await c.saveAttendanceHolidayMonth("2026-09", [...draft.checkedDates], [...draft.checkedDefaultHolidayDates], draft.changedDates);
  assert.equal(c.isAttendanceHoliday("2026-09-14"), true);
  assert.equal(c.isAttendanceHoliday("2026-09-12"), false);
  c.applyRemoteAttendanceHolidays(JSON.parse(JSON.stringify(c.state.attendanceHolidays)));
  assert.equal(c.isAttendanceHoliday("2026-09-14"), true, "holiday survives a reload");
  assert.equal(c.isAttendanceHoliday("2026-09-12"), false, "attendance override survives a reload");

  let pageCalls = 0;
  c.remoteStore = { from() { return { select() { return this; }, order() { return this; }, async range(from, to) {
    pageCalls++;
    assert.equal(to - from, 999);
    return { data: Array.from({ length: from === 0 ? 1000 : 5 }, (_, index) => ({ date_key: `${from + index}` })), error: null };
  } }; } };
  assert.equal((await c.loadAttendanceHolidaysFromRemote("date_key,note")).data.length, 1005);
  assert.equal(pageCalls, 2, "holiday reads must not truncate at 120 or the API's default page size");
  assert.doesNotMatch(extract(shared, "saveStateToRemote"), /saveAttendanceHolidaysToRemote/, "general auto-save must not replay stale holidays");
}

function testDeadlineBehavior() {
  const c = createClient();
  c.state.settings.attendanceDateDeadlines = { "2026-09-11": "10:30", "2026-09-14": "14:00" };
  assert.equal(c.isAttendanceCheckOpen(new Date("2026-09-11T09:30:00")), true);
  assert.equal(c.isAttendanceCheckOpen(new Date("2026-09-11T10:30:00")), true);
  assert.equal(c.isAttendanceCheckOpen(new Date("2026-09-11T10:30:01")), false);
  assert.equal(c.formatAttendanceDeadline("2026-09-14"), "14:00");
  assert.equal(c.isAttendanceCheckOpen(new Date("2026-09-15T09:00:00")), false, "next attendance day uses the default deadline");
  assert.equal(c.formatAttendanceDeadline("2026-09-15"), "08:50");
  c.state.settings.attendanceDeadlineEnabled = false;
  assert.equal(c.isAttendanceCheckOpen(new Date("2026-09-11T11:00:00")), false, "date-specific cutoff applies even if the default is unlimited");
  assert.equal(c.isAttendanceCheckOpen(new Date("2026-09-15T11:00:00")), true);
  c.state.settings.attendanceDateDeadlines["2026-09-12"] = "10:30";
  assert.equal(c.isAttendanceCheckOpen(new Date("2026-09-12T09:00:00")), false, "a date deadline must not open a holiday");
  delete c.state.settings.attendanceDateDeadlines["2026-09-11"];
  assert.equal(c.isAttendanceCheckOpen(new Date("2026-09-11T11:00:00")), true, "deleting an exception restores the default setting");
}

async function testSettingsApi() {
  const originalFetch = global.fetch;
  const originalEnv = { ...process.env };
  try {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only-key";
    process.env.TEACHER_SESSION_SECRET = "attendance-test-secret";
    const admin = createSessionToken(process.env.TEACHER_SESSION_SECRET, { username: "admin", role: "admin", permissions: ["*"] });
    const reader = createSessionToken(process.env.TEACHER_SESSION_SECRET, { username: "reader", role: "teacher", permissions: ["students.read"] });
    let saved = { attendanceDeadline: "08:50", attendanceDeadlineEnabled: true, attendanceDateDeadlines: { "2026-09-11": "10:30" }, curriculumQuestEnabled: true };
    let calls = 0;
    global.fetch = async (url, options) => {
      calls++;
      if (options.method === "GET") return jsonResponse([{ body: JSON.stringify(saved) }]);
      saved = JSON.parse(JSON.parse(options.body).body);
      return jsonResponse(null, 204);
    };
    const patch = (dateKey, deadline) => ({ settings: { attendanceDateOverride: { dateKey, deadline } } });
    assert.equal((await invoke(settingsHandler, "POST", patch("2026-09-14", "14:00"))).statusCode, 401);
    assert.equal((await invoke(settingsHandler, "POST", patch("2026-09-14", "14:00"), reader)).statusCode, 403);
    assert.equal(calls, 0, "unauthorized date writes must not reach storage");
    for (const [dateKey, time] of [["2026-02-30", "10:00"], ["2026-09-14", "24:00"], ["2026-09-14", "8:50"], ["bad", null]]) {
      assert.equal((await invoke(settingsHandler, "POST", patch(dateKey, time), admin)).statusCode, 400);
    }
    assert.equal((await invoke(settingsHandler, "POST", { settings: { attendanceDateDeadlines: {} } }, admin)).statusCode, 400);
    assert.equal((await invoke(settingsHandler, "POST", patch("2026-09-14", "14:00"), admin)).statusCode, 200);
    assert.deepEqual(saved.attendanceDateDeadlines, { "2026-09-11": "10:30", "2026-09-14": "14:00" });
    assert.equal(saved.curriculumQuestEnabled, true, "date writes preserve unrelated student settings");
    await invoke(settingsHandler, "POST", { settings: { attendanceDeadline: "09:00" } }, admin);
    assert.equal(saved.attendanceDateDeadlines["2026-09-14"], "14:00", "normal settings saves preserve date exceptions");
    const reload = await invoke(settingsHandler, "GET", {});
    assert.equal(reload.payload.settings.attendanceDateDeadlines["2026-09-14"], "14:00");
    await invoke(settingsHandler, "POST", patch("2026-09-11", null), admin);
    assert.deepEqual(saved.attendanceDateDeadlines, { "2026-09-14": "14:00" });

    const holidayRows = new Map();
    global.fetch = async (url, options) => {
      const path = new URL(url);
      if (options.method === "POST") for (const row of JSON.parse(options.body)) holidayRows.set(row.date_key, row);
      if (options.method === "DELETE") holidayRows.delete(path.searchParams.get("date_key").slice(3));
      return jsonResponse(null, 204);
    };
    assert.equal((await invoke(holidayHandler, "POST", { holidays: [{ dateKey: "2026-09-14" }] }, reader)).statusCode, 403);
    assert.equal((await invoke(holidayHandler, "POST", { holidays: [{ dateKey: "2026-09-14" }] }, admin)).statusCode, 200);
    assert.equal(holidayRows.has("2026-09-14"), true);
    assert.equal((await invoke(holidayHandler, "DELETE", { dateKey: "2026-09-14" }, admin)).statusCode, 200);
    assert.equal(holidayRows.size, 0);
  } finally {
    global.fetch = originalFetch;
    for (const key of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "TEACHER_SESSION_SECRET"]) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
  }
}

(async () => {
  await testHolidayPersistence();
  testDeadlineBehavior();
  await testSettingsApi();
  console.log("attendance settings persistence, calendar, deadline and API tests passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });
