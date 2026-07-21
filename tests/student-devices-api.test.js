const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");

const handler = require("../api/student-devices");

const migrationSql = fs.readFileSync("supabase/add-student-devices.sql", "utf8");
const schemaSql = fs.readFileSync("supabase/schema.sql", "utf8");
assert.match(migrationSql, /pg_advisory_xact_lock\(hashtext\(p_student_id\)::bigint\)/);
assert.match(migrationSql, /if v_active_count >= 2 then/);
assert.match(migrationSql, /encode\(extensions\.digest\(v_legacy_device_token, 'sha256'\), 'hex'\)/);
assert.doesNotMatch(migrationSql, /(?<!\.)\bdigest\(/, "pgcrypto digest calls must use the extensions schema");
assert.doesNotMatch(schemaSql, /(?<!\.)\bdigest\(/, "schema pgcrypto digest calls must use the extensions schema");
assert.match(migrationSql, /create or replace function public\.validate_student_device/);
assert.match(migrationSql, /create or replace function public\.revoke_student_device/);
assert.match(migrationSql, /create or replace function public\.reset_student_devices/);
assert.match(migrationSql, /alter publication supabase_realtime add table public\.students/);
assert.match(migrationSql, /alter publication supabase_realtime add table public\.outings/);
assert.match(
  migrationSql,
  /create or replace function public\.revoke_student_device[\s\S]*update public\.students\s+set app_registered_at = app_registered_at/,
  "individual device revocation must emit a non-sensitive student realtime event"
);

function createResponse() {
  return {
    headers: {},
    statusCode: 200,
    payload: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
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

async function invoke(body, method = "POST") {
  const req = { method, body, headers: {} };
  const res = createResponse();
  await handler(req, res);
  return res;
}

const originalFetch = global.fetch;
const originalUrl = process.env.SUPABASE_URL;
const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

(async () => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";

  let request = null;
  global.fetch = async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      status: 200,
      json: async () => ({ status: "registered", device_id: "device-1", active_count: 2 }),
    };
  };

  const deviceToken = "a".repeat(64);
  const registered = await invoke({
    action: "register",
    studentId: "18001",
    passwordHash: "b".repeat(64),
    deviceToken,
    deviceLabel: "My phone",
    client: { displayMode: "standalone", userAgent: "test-agent" },
  });

  assert.equal(registered.statusCode, 200);
  assert.deepEqual(registered.payload, {
    ok: true,
    status: "registered",
    deviceId: "device-1",
    activeCount: 2,
  });
  assert.equal(request.url, "https://example.supabase.co/rest/v1/rpc/register_student_device");
  const rpcBody = JSON.parse(request.options.body);
  assert.equal(rpcBody.p_device_token_hash, crypto.createHash("sha256").update(deviceToken).digest("hex"));
  assert.equal(rpcBody.p_token_preview, deviceToken.slice(-8));
  assert.equal(rpcBody.p_track, null);
  assert.equal(rpcBody.p_gender, null);
  assert.equal(request.options.body.includes(deviceToken), false, "raw device tokens must not be stored by the RPC");

  global.fetch = async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      status: 200,
      json: async () => ({ valid: true, device_id: "device-1", active_count: 2 }),
    };
  };
  const validated = await invoke({
    action: "validate",
    studentId: "18001",
    deviceToken,
    client: { displayMode: "standalone", userAgent: "test-agent" },
  });
  assert.equal(validated.statusCode, 200);
  assert.deepEqual(validated.payload, {
    ok: true,
    valid: true,
    deviceId: "device-1",
    activeCount: 2,
  });
  assert.equal(request.url, "https://example.supabase.co/rest/v1/rpc/validate_student_device");
  assert.equal(JSON.parse(request.options.body).p_device_token_hash, rpcBody.p_device_token_hash);

  const listRequests = [];
  global.fetch = async (url, options) => {
    listRequests.push({ url, options });
    if (url.includes("/rpc/validate_student_device")) {
      return { ok: true, status: 200, json: async () => ({ valid: true, device_id: "device-1", active_count: 2 }) };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ([{
        id: "11111111-1111-4111-8111-111111111111",
        device_token_hash: rpcBody.p_device_token_hash,
        token_preview: "aaaaaaaa",
        device_label: "My phone",
        client_display_mode: "standalone",
        registered_at: "2026-07-20T00:00:00.000Z",
        last_used_at: "2026-07-20T01:00:00.000Z",
      }]),
    };
  };
  const listed = await invoke({ action: "list", studentId: "18001", deviceToken });
  assert.equal(listed.statusCode, 200);
  assert.equal(listed.payload.devices.length, 1);
  assert.equal(listed.payload.devices[0].isCurrent, true);
  assert.equal(listRequests.length, 2);

  let revokeCall = null;
  global.fetch = async (url, options) => {
    if (url.includes("/rpc/validate_student_device")) {
      return { ok: true, status: 200, json: async () => ({ valid: true, device_id: "device-1", active_count: 2 }) };
    }
    revokeCall = { url, options };
    return { ok: true, status: 200, json: async () => ({ revoked: true, self_revoked: false, active_count: 1 }) };
  };
  const revoked = await invoke({
    action: "revoke",
    studentId: "18001",
    deviceToken,
    targetDeviceId: "11111111-1111-4111-8111-111111111111",
  });
  assert.equal(revoked.statusCode, 200);
  assert.equal(revoked.payload.activeCount, 1);
  assert.match(revokeCall.url, /\/rpc\/revoke_student_device$/);
  assert.equal(JSON.parse(revokeCall.options.body).p_actor, "student");

  const unauthorizedAdmin = await invoke({ action: "admin_list", studentId: "18001" });
  assert.equal(unauthorizedAdmin.statusCode, 401);

  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ error: "device_limit_reached", active_count: 2 }),
  });
  const limited = await invoke({
    studentId: "18001",
    passwordHash: "b".repeat(64),
    deviceToken: "c".repeat(64),
  });
  assert.equal(limited.statusCode, 409);
  assert.deepEqual(limited.payload, { ok: false, error: "device_limit_reached", activeCount: 2 });

  global.fetch = async () => {
    throw new Error("fetch should not be called for invalid input");
  };
  const invalid = await invoke({ studentId: "18001" });
  assert.equal(invalid.statusCode, 400);
  assert.equal(invalid.payload.error, "missing_required_fields");

  const wrongMethod = await invoke({}, "GET");
  assert.equal(wrongMethod.statusCode, 405);
  assert.equal(wrongMethod.headers.Allow, "POST");

  console.log("student-devices-api tests passed");
})()
  .finally(() => {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
