const assert = require("node:assert/strict");
const { test } = require("node:test");
const crypto = require("node:crypto");

function response(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status,
    json: async () => payload, text: async () => JSON.stringify(payload) };
}
function fresh(name) {
  delete require.cache[require.resolve(`../api/${name}`)];
  return require(`../api/${name}`);
}
async function invoke(handler, body) {
  const res = { setHeader() {}, status(n) { this.code = n; return this; }, json(v) { this.body = v; } };
  await handler({ method: "POST", body }, res);
  return res;
}
const student = { id: "20001", is_active: true, student_category: "lecture", name: "Test" };
const body = { action: "heartbeat", studentId: student.id, deviceToken: "test-secret" };

test("fast RPC API contracts, absence recovery and no replay of unknown writes", async (t) => {
  const oldFetch = global.fetch, oldWarn = console.warn, oldError = console.error;
  const names = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "STUDY_CAFE_HEARTBEAT_RPC_ENABLED", "STUDENT_REWARDS_SYNC_RPC_ENABLED"];
  const oldEnv = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const oldNow = Date.now;
  let now = oldNow();
  Date.now = () => now;
  process.env.SUPABASE_URL = "https://fast-rpc-test.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  delete process.env.STUDY_CAFE_HEARTBEAT_RPC_ENABLED;
  delete process.env.STUDENT_REWARDS_SYNC_RPC_ENABLED;
  console.warn = console.error = () => {};
  try {
    for (const [name, action, rpc, flag] of [
      ["study-cafe", "heartbeat", "study_cafe_heartbeat", "STUDY_CAFE_HEARTBEAT_RPC_ENABLED"],
      ["student-rewards", "sync", "validate_student_reward_device", "STUDENT_REWARDS_SYNC_RPC_ENABLED"],
    ]) {
      await t.test(`${action}: reduced requests, exact response, token hash and denied devices`, async () => {
        const handler = fresh(name), requests = [];
        let result = action === "heartbeat" ? { ok: true, serverNow: new Date(now).toISOString() }
          : { ok: true, eligible: true, balance: 100, notifications: [{ key: "welcome", amount: 100 }] };
        global.fetch = async (url, options) => {
          requests.push({ url, params: JSON.parse(options.body) });
          assert.ok(url.endsWith(`/rpc/${rpc}`) || (action === "sync" && url.endsWith("/rpc/sync_student_rewards")));
          return response(action === "sync" && url.endsWith(`/rpc/${rpc}`) && result.ok ? { ok: true } : result);
        };
        let res = await invoke(handler, { ...body, action, welcome: true, amount: 999999 });
        assert.equal(res.code, 200);
        assert.deepEqual(res.body, result);
        assert.equal(requests.length, action === "heartbeat" ? 1 : 2);
        assert.equal(requests[0].params.p_device_token_hash, crypto.createHash("sha256").update(body.deviceToken).digest("hex"));
        assert.equal(JSON.stringify(requests).includes(body.deviceToken), false);
        assert.equal(requests[0].params.amount, undefined);
        for (const error of action === "heartbeat" ? ["device_not_active", "online_student_only", "seat_required"] : ["device_not_active", "student_only"]) {
          requests.length = 0;
          result = { ok: false, error };
          res = await invoke(handler, { ...body, action });
          assert.equal(res.code, error === "seat_required" ? 409 : 403);
          assert.deepEqual(res.body, result);
          assert.equal(requests.length, 1);
        }
      });
      await t.test(`${action}: network, 500, malformed and permission failures never replay writes`, async () => {
        for (const failure of [new Error("connection lost after commit"), response({}, 500), response(null), response({ code: "42501" }, 403), response({ code: "other" }, 404)]) {
          const handler = fresh(name);
          let calls = 0;
          global.fetch = async () => { calls++; if (failure instanceof Error) throw failure; return failure; };
          const res = await invoke(handler, { ...body, action });
          assert.ok(res.code >= 500);
          assert.equal(res.body.ok, false);
          assert.equal(calls, 1);
        }
      });
      await t.test(`${action}: absent migration falls back, then recovers after cooldown`, async () => {
        const handler = fresh(name);
        let absent = true;
        const requests = [];
        global.fetch = async (url, options) => {
          requests.push(url);
          if (url.endsWith(`/rpc/${rpc}`)) return absent
            ? response({ code: "PGRST202" }, 404)
            : response(action === "heartbeat" ? { ok: true, serverNow: new Date(now).toISOString() } : { ok: true });
          if (url.endsWith("/rpc/validate_student_device")) return response({ valid: true });
          if (url.includes("/students?")) return response([{ ...student, account_type: "student", class_name: "test" }]);
          if (url.endsWith("/rpc/sync_student_rewards")) return response({ ok: true, balance: 100 });
          if (url.includes("last_heartbeat_at=lt.")) return response([]);
          if (url.includes("/study_cafe_sessions?")) return response([]);
          if (url.includes("/study_cafe_presence?student_id=")) return options.method === "PATCH"
            ? response(null, 204) : response([{ student_id: student.id, seat_number: 1 }]);
          throw new Error(`unexpected: ${url}`);
        };
        assert.equal((await invoke(handler, { ...body, action })).code, 200);
        assert.equal(requests.length, action === "heartbeat" ? 7 : 4);
        requests.length = 0;
        assert.equal((await invoke(handler, { ...body, action })).code, 200);
        assert.equal(requests.length, action === "heartbeat" ? 6 : 3);
        absent = false; now += 60000; requests.length = 0;
        assert.equal((await invoke(handler, { ...body, action })).code, 200);
        assert.equal(requests.length, action === "heartbeat" ? 1 : 2);
        process.env[flag] = "false"; requests.length = 0;
        assert.equal((await invoke(handler, { ...body, action })).code, 200);
        assert.equal(requests.length, action === "heartbeat" ? 6 : 3, "rollback flag preserves original flow");
        delete process.env[flag];
      });
    }
    await t.test("reward settlement failures never replay after authentication succeeded", async () => {
      for (const failure of [new Error("response lost after award"), response({ code: "PGRST202" }, 404), response({}, 500)]) {
        const handler = fresh("student-rewards");
        let calls = 0;
        global.fetch = async (url) => {
          calls++;
          if (url.endsWith("/rpc/validate_student_reward_device")) return response({ ok: true });
          assert.ok(url.endsWith("/rpc/sync_student_rewards"));
          if (failure instanceof Error) throw failure;
          return failure;
        };
        assert.equal((await invoke(handler, { ...body, action: "sync" })).code, 503);
        assert.equal(calls, 2);
      }
    });
    await t.test("heartbeat maintenance keeps legacy rollover and skips duplicate authentication", async () => {
      const handler = fresh("study-cafe");
      const requests = [];
      global.fetch = async (url, options) => {
        requests.push({ url, method: options.method });
        if (url.endsWith("/rpc/study_cafe_heartbeat")) return response({ legacy: true, student });
        assert.equal(url.includes("validate_student_device"), false);
        assert.equal(url.includes("/students?"), false);
        if (url.includes("last_heartbeat_at=lt.")) return response([]);
        if (url.includes("/study_cafe_sessions?")) return response([]);
        if (url.includes("/study_cafe_presence?")) return options.method === "PATCH" ? response(null, 204) : response([{ student_id: student.id }]);
        throw new Error(`unexpected ${url}`);
      };
      const res = await invoke(handler, body);
      assert.equal(res.code, 200);
      assert.equal(requests.length, 5);
      assert.ok(requests[1].url.includes("last_heartbeat_at=lt."), "cleanup precedes session and presence updates");
      for (const invalidStudent of [{ ...student, id: "other" }, { ...student, is_active: false }, { ...student, student_category: "offline" }]) {
        let calls = 0;
        global.fetch = async () => { calls++; return response({ legacy: true, student: invalidStudent }); };
        assert.equal((await invoke(handler, body)).code, 502);
        assert.equal(calls, 1);
      }
    });
  } finally {
    global.fetch = oldFetch; console.warn = oldWarn; console.error = oldError; Date.now = oldNow;
    for (const name of names) if (oldEnv[name] === undefined) delete process.env[name]; else process.env[name] = oldEnv[name];
  }
});
