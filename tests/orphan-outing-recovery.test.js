const assert = require("node:assert/strict");
const fs = require("node:fs");

const sharedSource = fs.readFileSync("shared.js", "utf8");
const indexSource = fs.readFileSync("index.html", "utf8");
const teacherSource = fs.readFileSync("teacher.html", "utf8");
const serviceWorkerSource = fs.readFileSync("sw.js", "utf8");

const mergeSource = sharedSource.match(
  /function mergePendingOutingPhotoDrafts\(outings, drafts\) \{[\s\S]*?\r?\n}\r?\n\r?\nfunction hasPersistedOutingPhotoSource/
)?.[0] || "";

assert.match(
  sharedSource,
  /if \(!remoteStore\) throw new Error\("remote_store_unavailable"\);[\s\S]*?\.from\("outings"\)/,
  "new outing requests must fail instead of creating a local-only request when Supabase is unavailable"
);
assert.match(
  mergeSource,
  /return outings\.map\(\(outing\) => \{/,
  "photo drafts should only be merged into outings confirmed by the server"
);
assert.doesNotMatch(
  mergeSource,
  /mergedOutings\.push|drafts\.forEach/,
  "an outing missing from the server must not be restored from a local photo draft"
);
assert.match(indexSource, /shared\.js\?v=20260805-online-managed-toggle/);
assert.match(indexSource, /student\.js\?v=20260730-orphan-outing-recovery/);
assert.match(teacherSource, /shared\.js\?v=20260805-online-managed-toggle/);
assert.match(serviceWorkerSource, /outing-auth-app-v303-lecture-registration-prefill/);

console.log("orphan outing recovery tests passed");
