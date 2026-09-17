const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { test } = require("node:test");
const share = require("../study-record-share.js");

function fixture() {
  return {
    dateFrom: "2026-09-14", dateTo: "2026-09-20", serverNow: "2026-09-20T09:00:00Z",
    days: [6, 7.5, 5.5, 6.5, 7, 6, 4].map((hours, i) => ({ date: `2026-09-${14 + i}`, totalSeconds: hours * 3600 })),
    summary: { totalSeconds: 153000 },
    subjectTotals: { "해양경찰학": 61200, "해사법규": 52200, "항해학": 39600 },
    studentName: "private name", deviceToken: "private token",
  };
}

test("share model freezes selected records and excludes identifying fields", () => {
  const source = fixture();
  const model = share.createModel(source, "weekly", "2026-09-20");
  source.days[0].totalSeconds = 0;
  source.subjectTotals["해양경찰학"] = 0;
  assert.equal(model.total, 153000);
  assert.equal(model.days[0].totalSeconds, 21600);
  assert.equal(model.subjects[0].seconds, 61200);
  assert.equal(model.studiedDays, 7);
  assert.equal(model.average, 21857);
  assert.equal(model.maximum, 27000);
  assert.ok(!JSON.stringify(model).includes("private"));
  assert.equal(model.completion, null);
});

test("completion is weighted by tasks across a month boundary and excludes future plans", () => {
  const plans = [
    { studyDate: "2026-08-30", total: 50, completed: 50 },
    { studyDate: "2026-08-31", total: 2, completed: 2 },
    { studyDate: "2026-09-01", total: 8, completed: 3 },
    { studyDate: "2026-09-02", total: 10, completed: 10 },
  ];
  assert.deepEqual(share.aggregatePlans(plans, "2026-08-31", "2026-09-06", "2026-09-01"), { total: 10, completed: 5, percent: 50 });
  assert.equal(share.aggregatePlans([], "2026-09-01", "2026-09-30", "2026-09-16"), null);
  assert.deepEqual(share.aggregatePlans([{ studyDate: "2026-09-01", total: 5, completed: 0 }], "2026-09-01", "2026-09-01", "2026-09-01"), { total: 5, completed: 0, percent: 0 });
});

test("unconfirmed, empty and mismatched statistics cannot be exported", () => {
  assert.throws(() => share.createModel({ ...fixture(), localOnly: true }, "weekly", "2026-09-20"), /unconfirmed/);
  assert.throws(() => share.createModel({ ...fixture(), summary: { totalSeconds: 0 } }, "weekly", "2026-09-20"), /invalid_total/);
  assert.throws(() => share.createModel(fixture(), "daily", "2026-09-20"), /invalid_range/);
  const duplicate = fixture(); duplicate.days[1].date = duplicate.days[0].date;
  assert.throws(() => share.createModel(duplicate, "weekly", "2026-09-20"), /invalid_days/);
});

test("daily heading has one date and compact duration preserves minutes", () => {
  const model = share.createModel({ dateFrom: "2026-09-15", dateTo: "2026-09-15", days: [{ date: "2026-09-15", totalSeconds: 27000 }], summary: { totalSeconds: 27000 }, subjectTotals: {} }, "daily", "2026-09-15");
  assert.equal(model.heading, "2026년 9월 15일");
  for (const [seconds, expected] of [[0, "0:00"], [3540, "0:59"], [27000, "7:30"], [43500, "12:05"], [86400, "24:00"]]) assert.equal(share.duration(seconds), expected);
  assert.equal(share.duration(561600, true), "156:00:00");
});

function extract(name) {
  const source = fs.readFileSync("app.js", "utf8");
  const start = source.indexOf(`function ${name}(`);
  const tail = source.slice(start);
  const end = tail.search(/\n(?:async )?function /);
  return tail.slice(0, end);
}

test("share button is confined to statistics and disabled for loading, zero and fallback records", () => {
  const context = {
    el: (tag, props, children) => ({ tag, props, children }),
    studyCafePreviewState: { paused: false },
    studyTimerStatsState: { mode: "timer", cache: {}, error: "" },
    getStudyTimerStatsRange: () => ({ dateFrom: "2026-09-14", dateTo: "2026-09-20" }),
    openStudyTimerRecordShare() {},
  };
  vm.createContext(context);
  vm.runInContext(extract("renderStudyTimerHeaderActions"), context);
  assert.equal(context.renderStudyTimerHeaderActions(false), null);
  context.studyTimerStatsState.mode = "stats";
  assert.equal(context.renderStudyTimerHeaderActions(false).children[0].props.disabled, true);
  context.studyTimerStatsState.cache["2026-09-14:2026-09-20"] = fixture();
  assert.equal(context.renderStudyTimerHeaderActions(true).children[0].props.disabled, false);
  context.studyTimerStatsState.cache["2026-09-14:2026-09-20"].localOnly = true;
  assert.equal(context.renderStudyTimerHeaderActions(false).children[0].props.disabled, true);
});
