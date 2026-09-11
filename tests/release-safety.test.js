const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { test } = require("node:test");

test("deployment with missing configuration fails before replacing the existing config", () => {
  const source = fs.readFileSync("build-config.js", "utf8");
  for (const env of [{ VERCEL: "1" }, { VERCEL_ENV: "production", SUPABASE_URL: "https://example.supabase.co" }, { VERCEL_ENV: "preview", SUPABASE_ANON_KEY: "public-key" }]) {
    let writes = 0;
    assert.throws(() => vm.runInNewContext(source, {
      require: () => ({ existsSync: () => true, writeFileSync: () => writes++ }),
      process: { env }, console, URL,
    }), /required for deployment/);
    assert.equal(writes, 0);
  }
  for (const supabaseUrl of ["[SENSITIVE]", "http://example.supabase.co", "https://user:password@example.supabase.co"]) {
    assert.throws(() => vm.runInNewContext(source, {
      require: () => ({ existsSync: () => true, writeFileSync: () => assert.fail("Invalid URL must not replace config") }),
      process: { env: { VERCEL: "1", SUPABASE_URL: supabaseUrl, SUPABASE_ANON_KEY: "public-key" } },
      console, URL,
    }), /valid HTTPS URL/);
  }
  let config = "";
  vm.runInNewContext(source, {
    require: () => ({ existsSync: () => true, writeFileSync: (_, value) => { config = value; } }),
    process: { env: { VERCEL: "1", SUPABASE_URL: "https://example.supabase.co", SUPABASE_ANON_KEY: "public-key", SUPABASE_SERVICE_ROLE_KEY: "private-secret" } },
    console: { log() {} }, URL,
  });
  const context = { window: {} };
  vm.runInNewContext(config, context);
  assert.equal(context.window.OUTING_APP_CONFIG.supabaseAnonKey, "public-key");
  assert.ok(!config.includes("private-secret"));
});

test("service worker installs every current page asset and never caches API requests or navigates open clients", async () => {
  const handlers = {}, stored = new Map();
  let claimed = 0, waitingSkipped = 0;
  const cache = {
    async addAll(urls) {
      for (const url of urls) {
        const pathname = new URL(url, "https://app.test").pathname;
        const filename = pathname === "/" ? "index.html" : pathname === "/teacher" ? "teacher.html" : pathname.slice(1);
        assert.ok(fs.existsSync(filename), `Missing precache file: ${filename}`);
        stored.set(url, { ok: true, cached: url });
      }
    },
    async put(url, response) { stored.set(url, response); },
  };
  vm.runInNewContext(fs.readFileSync("sw.js", "utf8"), {
    URL,
    self: {
      location: { origin: "https://app.test" },
      addEventListener: (name, handler) => { handlers[name] = handler; },
      skipWaiting: () => { waitingSkipped++; },
      clients: { claim: () => { claimed++; } },
    },
    caches: { open: async () => cache, keys: async () => ["old-version"], delete: async () => true, match: async request => stored.get(request.url?.replace("https://app.test", "") || request) },
    fetch: async () => { throw new Error("offline"); },
  });
  let pending;
  handlers.install({ waitUntil: p => { pending = p; } });
  await pending;
  handlers.activate({ waitUntil: p => { pending = p; } });
  await pending;
  assert.equal(waitingSkipped, 1);
  assert.equal(claimed, 1);
  for (const filename of ["index.html", "teacher.html"]) {
    const html = fs.readFileSync(filename, "utf8");
    for (const match of html.matchAll(/(?:src|href)="\.\/([^"#]+)"/g)) {
      if (match[1].startsWith("config.js")) continue;
      assert.ok(stored.has("/" + match[1]), `${filename}: ${match[1]} missing from precache`);
    }
  }
  for (const [url, method] of [["/api/study-cafe", "POST"], ["/api/app-settings", "GET"]]) {
    handlers.fetch({ request: { url: `https://app.test${url}`, method }, respondWith: () => assert.fail("API must bypass cache") });
  }
  handlers.fetch({ request: { url: "https://app.test/teacher", method: "GET", mode: "navigate" }, respondWith: p => { pending = p; } });
  assert.equal((await pending).cached, "/teacher");
});
