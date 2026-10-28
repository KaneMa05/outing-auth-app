const assert = require("node:assert/strict");
const { test } = require("node:test");
const crypto = require("node:crypto");
const fs = require("node:fs");
const { createHandler } = require("../api/account-deletion");
const { TITLE, CATEGORY, BODY } = require("../lib/account-deletion-request");

const token = "deletion-test-device-token";
const hash = crypto.createHash("sha256").update(token).digest("hex");
function fixture({ valid = true, category = "offline", failWrite = false } = {}) {
  const rows = [], calls = [];
  const request = async (method, path, body) => {
    calls.push({ method, path, body });
    assert.ok(!["DELETE", "PATCH"].includes(method), "Requesting deletion must not erase data or revoke devices");
    if (path === "rpc/validate_student_device") return { valid: valid && body.p_student_id === "18001" && body.p_device_token_hash === hash };
    if (path.startsWith("students?")) return [{ id: "18001", student_category: category }];
    if (method === "POST" && path === "student_inquiries") {
      if (failWrite) throw new Error("private upstream error must not be exposed");
      const row = { ...body, id: "550e8400-e29b-41d4-a716-446655440000", created_at: "2026-10-28T01:00:00.000Z" };
      rows.push(row); return [row];
    }
    if (path.startsWith("student_inquiries?")) {
      const params = new URLSearchParams(path.split("?")[1]);
      assert.equal(params.get("student_id"), "eq.18001");
      assert.equal(params.get("category"), `eq.${CATEGORY}`);
      assert.equal(params.get("title"), `eq.${TITLE}`);
      assert.equal(params.get("deleted_at"), "is.null");
      return rows;
    }
    if (path.startsWith("student_inquiry_messages?")) {
      assert.ok(path.includes("author_type=eq.teacher"));
      return [{ body: "처리 진행 안내", created_at: "2026-10-28T02:00:00.000Z" }];
    }
    assert.fail(`Unexpected request: ${method} ${path}`);
  };
  const handler = createHandler({ request });
  const invoke = async (body = {}, method = "POST", headers = {}) => {
    const res = { code: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } };
    await handler({ method, headers, body: { action: "status", studentId: "18001", deviceToken: token, ...body } }, res);
    return res;
  };
  return { invoke, rows, calls };
}

test("all three student types can request full deletion in-app and receive the same receipt on retry", async () => {
  for (const category of ["offline", "online_managed", "lecture"]) {
    const f = fixture({ category });
    assert.equal((await f.invoke()).data.request, null);
    const first = await f.invoke({ action: "request", confirmation: "계정 삭제", inquiryId: "someone-else" });
    assert.equal(first.code, 201);
    assert.equal(first.headers["Cache-Control"], "no-store");
    assert.equal(first.data.request.status, "received", "A receipt must not claim actual erasure is complete");
    assert.equal(f.rows[0].student_id, "18001");
    assert.equal(f.rows[0].body, BODY);
    assert.ok(!JSON.stringify(f.rows).includes(token));
    const retry = await f.invoke({ action: "request", confirmation: "계정 삭제" });
    assert.equal(retry.code, 200);
    assert.equal(retry.data.request.id, first.data.request.id);
    assert.equal(f.rows.length, 1);
    assert.equal((await f.invoke()).data.request.replies[0].body, "처리 진행 안내");
  }
});

test("unauthenticated, cross-account, unconfirmed and cross-origin requests cannot create or read receipts", async () => {
  for (const body of [{ deviceToken: "" }, { deviceToken: "bad-token" }, { studentId: "18002" }]) {
    const f = fixture();
    assert.equal((await f.invoke(body)).code, 401);
    assert.ok(!f.calls.some(call => call.path.startsWith("student_inquiries")));
  }
  const f = fixture();
  assert.equal((await f.invoke({ action: "request" })).code, 400);
  assert.equal((await f.invoke({ action: "request", confirmation: true })).code, 400);
  assert.equal((await f.invoke({}, "GET")).code, 405);
  assert.equal((await f.invoke({}, "POST", { origin: "https://evil.test", host: "app.test" })).code, 403);
  assert.equal(f.calls.length, 0);
  assert.equal((await fixture({ valid: false }).invoke()).code, 401);
});

test("storage failures and oversized requests never show a success receipt or leak upstream errors", async () => {
  const f = fixture({ failWrite: true });
  const result = await f.invoke({ action: "request", confirmation: "계정 삭제" });
  assert.equal(result.code, 503);
  assert.equal(result.data.error, "deletion_request_unavailable");
  assert.equal(f.rows.length, 0);
  assert.equal((await fixture().invoke({ padding: "x".repeat(5000) })).code, 413);
});

test("existing inquiry API cannot forge, rewrite or hide a deletion receipt", async () => {
  const handler = require("../api/inquiries");
  const saved = { fetch: global.fetch, url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY, error: console.error };
  let writes = 0;
  try {
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only-key";
    console.error = () => {};
    global.fetch = async (url, options) => {
      let value;
      if (url.includes("rpc/validate_student_device")) value = { valid: true };
      else if (url.includes("/students?")) value = [{ id: "18001" }];
      else if (url.includes("/student_inquiries?")) value = [{ id: "550e8400-e29b-41d4-a716-446655440000", student_id: "18001", title: TITLE, category: CATEGORY }];
      else { writes++; value = []; }
      return { ok: true, status: 200, json: async () => value };
    };
    for (const action of ["update", "delete", "create"]) {
      const res = { setHeader() {}, status(code) { this.code = code; return this; }, json(data) { this.data = data; } };
      await handler({ method: "POST", headers: {}, body: { action, studentId: "18001", deviceToken: token, inquiryId: "550e8400-e29b-41d4-a716-446655440000", category: CATEGORY, title: TITLE, body: "changed" } }, res);
      assert.equal(res.code, action === "create" ? 400 : 403);
    }
    assert.equal(writes, 0);
  } finally {
    global.fetch = saved.fetch; console.error = saved.error;
    if (saved.url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = saved.url;
    if (saved.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = saved.key;
  }
});

test("existing private inbox schema stores the receipt and prevents direct client access", async () => {
  const { PGlite } = require(process.env.PGLITE_MODULE || "C:/Users/Public/Documents/ESTsoft/CreatorTemp/ox-db-tools/node_modules/@electric-sql/pglite");
  const db = new PGlite();
  try {
    await db.exec("create role anon; create role authenticated; create role service_role bypassrls; create table public.students(id text primary key); insert into students values ('18001'), ('18002');");
    await db.exec(fs.readFileSync("supabase/add-inquiry-board.sql", "utf8"));
    await db.exec("set role service_role");
    await db.query("insert into student_inquiries(student_id,category,title,body) values($1,$2,$3,$4)", ["18001", CATEGORY, TITLE, BODY]);
    const result = await db.query("select student_id,title from student_inquiries");
    assert.equal(result.rows[0].student_id, "18001");
    assert.equal(result.rows[0].title, TITLE);
    await db.exec("reset role; set role anon");
    await assert.rejects(db.query("select * from student_inquiries"), /permission denied/);
    await db.exec("reset role; set role authenticated");
    await assert.rejects(db.query("select * from student_inquiries"), /permission denied/);
  } finally { await db.close(); }
});
