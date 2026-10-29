const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { test } = require("node:test");

test("both mobile interview entry points bypass the cached pre-announcement loaders", () => {
  const index = fs.readFileSync("index.html", "utf8");
  const portal = fs.readFileSync("interview.html", "utf8");
  assert.ok(index.includes("interview-prep.js?v=20261029-home-notices"));
  assert.ok(portal.includes("interview-portal.js?v=20261029-home-notices"));
  for (const file of ["interview-prep.js", "interview-portal.js"]) {
    assert.ok(fs.readFileSync(file, "utf8").includes("interview-app-ui.js?v=20261029-home-notices"));
  }
  assert.ok(!fs.readFileSync("sw.js", "utf8").includes("outing-auth-app-v550-ios-lecture-edges"));
});

test("public safety flag defaults off and follows the server build setting without exposing secrets", () => {
  for (const flag of [undefined, "false", "true"]) {
    let output;
    vm.runInNewContext(fs.readFileSync("build-config.js", "utf8"), {
      require: name => name === './lib/interview-preview-access' ? require('../lib/interview-preview-access') : ({ existsSync: () => true, writeFileSync: (_, value) => { output = value; } }),
      process: { env: { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'public', STUDENT_CONTENT_SAFETY_ENABLED: flag, SUPABASE_SERVICE_ROLE_KEY: 'private-secret' } },
      console: { log() {} }, URL,
    });
    const context={window:{}};vm.runInNewContext(output,context);
    assert.equal(context.window.OUTING_APP_CONFIG.studentContentSafetyEnabled,flag==='true');
    assert.ok(!output.includes('private-secret'));
  }
});

test("deployment with missing configuration fails before replacing the existing config", () => {
  const source = fs.readFileSync("build-config.js", "utf8");
  for (const env of [{ VERCEL: "1" }, { VERCEL_ENV: "production", SUPABASE_URL: "https://example.supabase.co" }, { VERCEL_ENV: "preview", SUPABASE_ANON_KEY: "public-key" }]) {
    let writes = 0;
    assert.throws(() => vm.runInNewContext(source, {
      require: name => name === './lib/interview-preview-access' ? require('../lib/interview-preview-access') : ({ existsSync: () => true, writeFileSync: () => writes++ }),
      process: { env }, console, URL,
    }), /required for deployment/);
    assert.equal(writes, 0);
  }
  for (const supabaseUrl of ["[SENSITIVE]", "http://example.supabase.co", "https://user:password@example.supabase.co"]) {
    assert.throws(() => vm.runInNewContext(source, {
      require: name => name === './lib/interview-preview-access' ? require('../lib/interview-preview-access') : ({ existsSync: () => true, writeFileSync: () => assert.fail("Invalid URL must not replace config") }),
      process: { env: { VERCEL: "1", SUPABASE_URL: supabaseUrl, SUPABASE_ANON_KEY: "public-key" } },
      console, URL,
    }), /valid HTTPS URL/);
  }
  let config = "";
  vm.runInNewContext(source, {
    require: name => name === './lib/interview-preview-access' ? require('../lib/interview-preview-access') : ({ existsSync: () => true, writeFileSync: (_, value) => { config = value; } }),
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
      assert.equal(new Set(urls).size, urls.length, "Duplicate precache URLs prevent service worker installation");
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
      // Optional interview modules load on demand and must not be installed
      // into every student's offline shell.
      if (match[1].startsWith("interview")) {
        assert.equal(stored.has("/" + match[1]), false, "Interview assets must remain optional");
        continue;
      }
      assert.ok(stored.has("/" + match[1]), `${filename}: ${match[1]} missing from precache`);
    }
  }
  // Lazy OX assets need versioned URLs too: an existing worker serves cached
  // unversioned files even while the next worker is still installing.
  const oxAssets = ["app.js", "criminal-law-ox-access.js", "criminal-law-ox-admin.js"].flatMap(file =>
    [...fs.readFileSync(file, "utf8").matchAll(/\.\/((?:criminal-law-ox(?:-[a-z-]+)?|student-device-manager)\.(?:js|css)(?:\?v=[^'"\s]+)?)/g)].map(match => match[1]));
  for(const name of ['criminal-law-ox.js','criminal-law-ox.css','criminal-law-ox-access.js','criminal-law-ox-device-admin.js','criminal-law-ox-grants-admin.js','student-device-manager.js'])
    assert.ok(oxAssets.some(asset=>asset.startsWith(name+'?')), `Missing OX dependency: ${name}`);
  for (const asset of oxAssets) {
    assert.match(asset, /\?v=.+/, "Lazy OX assets must bypass older cached URLs");
    assert.ok(stored.has("/" + asset), `${asset} missing from precache`);
  }
  // Grading textures must be available offline without evaluating SVG filters.
  for (const name of ['circle', 'slash']) {
    const filename = `ox-grade-${name}.png`;
    const png = fs.readFileSync(filename);
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(png.readUInt32BE(16), 108);
    assert.equal(png.readUInt32BE(20), 108);
    assert.equal(png[25], 6, 'Grading textures must preserve their transparent background');
    assert.ok(stored.has(`/${filename}?v=20261013-pencil`), `${filename} missing from precache`);
  }
  for (const [url, method] of [["/api/study-cafe", "POST"], ["/api/app-settings", "GET"]]) {
    handlers.fetch({ request: { url: `https://app.test${url}`, method }, respondWith: () => assert.fail("API must bypass cache") });
  }
  handlers.fetch({ request: { url: "https://app.test/teacher", method: "GET", mode: "navigate" }, respondWith: p => { pending = p; } });
  assert.equal((await pending).cached, "/teacher");
});
