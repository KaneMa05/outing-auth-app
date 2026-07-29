const assert = require("node:assert/strict");

const {
  parseContentRange,
  parseEnvFile,
  runCheck,
} = require("../scripts/study-cafe-preflight")._private;

assert.deepEqual(
  parseEnvFile([
    "SUPABASE_URL=https://example.supabase.co",
    'SUPABASE_SERVICE_ROLE_KEY="secret-value"',
    "# COMMENT=ignored",
    "INVALID LINE",
  ].join("\n")),
  {
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "secret-value",
  }
);
assert.equal(parseContentRange("0-0/18"), 18);
assert.equal(parseContentRange("*/0"), 0);
assert.equal(parseContentRange(null), 0);

const originalFetch = global.fetch;
(async () => {
  global.fetch = async (url, options) => {
    assert.equal(url, "https://example.supabase.co/rest/v1/students?select=id&limit=1");
    assert.equal(options.headers.apikey, "service-key");
    return {
      ok: true,
      status: 200,
      headers: { get: (name) => name === "content-range" ? "0-0/3" : null },
    };
  };
  const result = await runCheck(
    { SUPABASE_URL: "https://example.supabase.co/", SUPABASE_SERVICE_ROLE_KEY: "service-key" },
    { name: "students", path: "students?select=id&limit=1", required: false, count: true }
  );
  assert.deepEqual(result, {
    name: "students",
    required: false,
    status: "준비됨",
    count: 3,
  });
  console.log("study-cafe-preflight tests passed");
})()
  .finally(() => {
    global.fetch = originalFetch;
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
