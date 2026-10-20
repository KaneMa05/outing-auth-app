const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { test } = require("node:test");

function setup() {
  const downloads = [], notices = [], timers = [];
  const context = vm.createContext({
    Blob, TextEncoder, Uint8Array, DataView,
    state: { students: [], penalties: [] },
    selectedStudentCohort: "18",
    penaltyPeriodFilter: { start: "2026-10-01", end: "2026-10-20" },
    penaltySortMode: "id",
    getStudentCohort: student => String(student.id).slice(0, -3),
    formatStudentNumber: id => String(id).slice(-3),
    isPenaltyDeleted: penalty => Boolean(penalty.deletedAt),
    getTodayDateKey: () => "2026-10-20",
    notify: message => notices.push(message),
    URL: {
      createObjectURL: blob => { downloads.push({ blob }); return "blob:test"; },
      revokeObjectURL: url => { downloads.at(-1).revoked = url; },
    },
    document: { body: { appendChild: link => { downloads.at(-1).link = link; } } },
    setTimeout: callback => timers.push(callback),
    el: (tag, attrs, children) => ({
      tag, attrs, children,
      click() { this.clicked = true; },
      remove() { this.removed = true; },
    }),
  });
  const students = fs.readFileSync("teacher-students.js", "utf8");
  vm.runInContext(students.slice(
    students.indexOf("function createStudentCohortWorkbookBlob("),
    students.indexOf("function openStudentPreview("),
  ), context);
  vm.runInContext(fs.readFileSync("teacher-penalties.js", "utf8"), context);
  return { context, downloads, notices, timers };
}

async function readSheet(blob) {
  assert.equal(blob.type, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  const bytes = Buffer.from(await blob.arrayBuffer());
  assert.equal(bytes.readUInt32LE(0), 0x04034b50);
  let offset = 0;
  while (bytes.readUInt32LE(offset) === 0x04034b50) {
    const size = bytes.readUInt32LE(offset + 18);
    const nameLength = bytes.readUInt16LE(offset + 26);
    const extraLength = bytes.readUInt16LE(offset + 28);
    const name = bytes.toString("utf8", offset + 30, offset + 30 + nameLength);
    const start = offset + 30 + nameLength + extraLength;
    if (name === "xl/worksheets/sheet1.xml") return bytes.toString("utf8", start, start + size);
    offset = start + size;
  }
  assert.fail("Workbook worksheet is missing");
}

test("export includes every displayed student, including no history, rewards and cancelled entries", async () => {
  const { context, downloads, notices, timers } = setup();
  context.state.students = [
    { id: "18001", name: "벌점 학생", className: "A반" },
    { id: "18002", name: "내역 없음", className: "" },
    { id: "18003", name: "상점 학생", className: "온라인" },
    { id: "18004", name: "상쇄 학생", className: "A반" },
    { id: "18005", name: "삭제 & 기간 외", className: "<B반>" },
    { id: "19001", name: "다른 기수", className: "A반" },
  ];
  const penalty = (studentId, points, extras = {}) => ({
    studentId, points, createdAt: "2026-10-10T12:00:00+09:00", ...extras,
  });
  context.state.penalties = [
    penalty("18001", 3), penalty("18001", 2),
    penalty("18003", -2), penalty("18004", 2), penalty("18004", -2),
    penalty("18005", 7, { deletedAt: "2026-10-12T12:00:00+09:00" }),
    penalty("18005", 4, { createdAt: "2026-09-30T12:00:00+09:00" }),
    penalty("18005", 4, { createdAt: "2026-10-21T12:00:00+09:00" }),
    penalty("19001", 9),
  ];
  const summaries = context.getPenaltySummaries(context.getFilteredPenalties("18"), "18");
  assert.equal(summaries.length, 5);
  const before = JSON.stringify(summaries);
  context.downloadPenaltySummaryWorkbook(summaries);
  assert.equal(JSON.stringify(summaries), before, "export must not reorder the screen data");
  const sheet = await readSheet(downloads[0].blob);
  assert.equal([...sheet.matchAll(/<row r=/g)].length - 1, summaries.length);
  assert.match(sheet, /autoFilter ref="A1:G6"/);
  for (const summary of summaries) {
    const row = sheet.match(new RegExp(`<row r="\\d+">(?:(?!</row>)[\\s\\S])*?>${summary.student.id}</t>(?:(?!</row>)[\\s\\S])*</row>`))?.[0];
    assert.ok(row, `Missing student ${summary.student.id}`);
    assert.match(row, new RegExp(`<c r="F\\d+"[^>]*><is><t[^>]*>${summary.total}</t>`));
    assert.match(row, new RegExp(`<c r="G\\d+"[^>]*><is><t[^>]*>${summary.count}</t>`));
  }
  assert.doesNotMatch(sheet, /19001|다른 기수/);
  assert.match(sheet, />001<\/t>/, "leading zeros in student numbers must survive");
  assert.match(sheet, /삭제 &amp; 기간 외/);
  assert.match(sheet, /&lt;B반&gt;/);
  assert.equal(downloads[0].link.attrs.download, "벌점 내역_2026-10-01~2026-10-20.xlsx");
  assert.ok(downloads[0].link.clicked && downloads[0].link.removed);
  assert.match(notices[0], /5명/);
  assert.equal(downloads[0].revoked, undefined, "download URL must stay alive until the browser starts saving");
  timers[0]();
  assert.equal(downloads[0].revoked, "blob:test");
});

test("all-zero roster still has a working download button; empty roster has none", async () => {
  const { context, downloads, notices } = setup();
  const buttons = [];
  Object.assign(context, {
    hasTeacherPermission: () => true,
    selectedStudentCohortCount: () => ({ value: "18" }),
    studentCountStatGroup: () => null,
    statGroup: () => null,
    stat: () => null,
    panel: (title, children) => ({ title, children }),
    penaltyPeriodControls: () => null,
    penaltySortControls: () => null,
    renderPenaltySummaryTable: summaries => summaries,
    button: (label, className, type, callback) => { buttons.push({ label, callback }); return null; },
  });
  context.state.students = [{ id: "18001", name: "내역 없음", className: "" }];
  context.renderPenaltyManagement();
  const download = buttons.find(button => button.label === "엑셀 다운로드");
  assert.ok(download, "students without penalties still need an export");
  download.callback();
  const sheet = await readSheet(downloads[0].blob);
  assert.match(sheet, /autoFilter ref="A1:G2"/);
  assert.match(sheet, /r="F2"[^>]*><is><t[^>]*>0<\/t>/);
  assert.match(sheet, /r="G2"[^>]*><is><t[^>]*>0<\/t>/);
  context.state.students = [];
  buttons.length = 0;
  context.renderPenaltyManagement();
  assert.ok(!buttons.some(button => button.label === "엑셀 다운로드"));
  context.downloadPenaltySummaryWorkbook([]);
  assert.equal(downloads.length, 1);
  assert.equal(notices.at(-1), "다운로드할 학생이 없습니다.");
});
