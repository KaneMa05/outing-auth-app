const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { test } = require("node:test");

const source = fs.readFileSync("shared.js", "utf8");
const helper = source.match(/async function loadTeacherOutingPhotosFromRemote\(columns\) \{[\s\S]*?\n}/)[0];
const refresh = source.match(/async function refreshTeacherOutingsFromRemote\(options = \{\}\) \{[\s\S]*?\n}/)[0];
const columns = "id,outing_id,photo_type,photo_url,uploaded_at";

function setup(count, { failPage = -1, legacy = false } = {}) {
  const rows = Array.from({ length: count }, (_, i) => ({
    id: String(i).padStart(5, "0"), outing_id: "outing", photo_type: "현장 인증",
    uploaded_at: "2026-10-06T00:55:00Z", photo_url: `https://example.test/${i}.jpg`,
  }));
  const calls = [];
  let page = 0;
  const context = {
    APP_MODE: "teacher", teacherAuth: { authenticated: true },
    isTeacherOutingRefreshing: false, isRemoteLoading: false,
    isRemoteSaving: false, hasPendingRemoteSave: false,
    lastTeacherOutingSignature: "", teacherOutingRenderPending: false,
    state: { outings: [{ id: "cached", photos: [{ id: "saved" }] }] },
    console: { error() {} },
    isMissingColumnError: (error, column) => error?.column === column,
    teacherOutingRowsSignature: JSON.stringify,
    mapRemoteOutings: (outings, photos) => outings.map(outing => ({ ...outing, photos })),
    saveStateToLocalStorage() {}, canRenderTeacherOutingRefresh: () => false,
    remoteStore: { from(table) {
      if (table === "outings") return { select: () => ({ order: async () => ({ data: [{ id: "outing" }], error: null }) }) };
      assert.equal(table, "outing_photos");
      let selected;
      const orders = [];
      return {
        select(value) { selected = value; return this; },
        order(column, options) { orders.push([column, options.ascending]); return this; },
        async range(from, to) {
          calls.push({ from, to, selected, orders });
          if (legacy && selected.includes("photo_path")) return { data: null, error: { column: "photo_path" } };
          if (page++ === failPage) return { data: null, error: { message: "connection failed" } };
          const sorted = [...rows].sort((a, b) => a.id.localeCompare(b.id));
          return { data: sorted.slice(from, to + 1), error: null };
        },
      };
    } },
  };
  vm.createContext(context);
  vm.runInContext(helper + "\n" + refresh, context);
  return { context, calls };
}

test("photo archives exceeding 1,000 retain the latest submitted photo", async () => {
  const { context, calls } = setup(1107);
  const result = await context.loadTeacherOutingPhotosFromRemote(columns);
  assert.equal(result.data.length, 1107);
  assert.ok(result.data.some(photo => photo.id === "01104"));
  assert.equal(new Set(result.data.map(photo => photo.id)).size, 1107);
  assert.deepEqual(calls.map(call => [call.from, call.to]), [[0, 999], [1000, 1999]]);
  for (const call of calls) {
    assert.equal(call.selected, columns);
    assert.deepEqual(call.orders, [["uploaded_at", true], ["id", true]]);
    assert.ok(!call.selected.includes("data_url"), "normal list reads must omit full-size legacy images");
  }
});

test("empty and exact-page archives terminate correctly", async () => {
  for (const count of [0, 1000, 2000]) {
    const { context, calls } = setup(count);
    const result = await context.loadTeacherOutingPhotosFromRemote(columns);
    assert.equal(result.data.length, count);
    assert.equal(calls.length, count / 1000 + 1);
  }
});

test("automatic refresh and legacy schema fallback retain all photo metadata", async () => {
  for (const legacy of [false, true]) {
    const { context } = setup(1107, { legacy });
    assert.equal(await context.refreshTeacherOutingsFromRemote(), true);
    assert.equal(context.state.outings[0].photos.length, 1107);
    assert.equal(context.isTeacherOutingRefreshing, false);
  }
});

test("a later-page error leaves the existing administrator state intact", async () => {
  const { context, calls } = setup(1107, { failPage: 1 });
  const previous = context.state.outings;
  assert.equal(await context.refreshTeacherOutingsFromRemote(), false);
  assert.equal(context.state.outings, previous);
  assert.equal(context.state.outings[0].photos[0].id, "saved");
  assert.equal(context.isTeacherOutingRefreshing, false);
  assert.equal(calls.length, 2);
});

test("initial administrator load uses pagination for normal and legacy photo schemas", () => {
  const load = source.match(/async function loadStateFromRemote\(options = \{\}\) \{[\s\S]*?\n}/)[0];
  assert.match(load, /APP_MODE === "teacher"\s*\? loadTeacherOutingPhotosFromRemote\(photoColumns\)/);
  assert.match(load, /APP_MODE === "teacher"\s*\? await loadTeacherOutingPhotosFromRemote\(fallbackPhotoColumns\)/);
  assert.match(load, /\.select\(photoColumns\)\.in\("outing_id", outingIds\)/, "student-scoped reads stay unchanged");
});
