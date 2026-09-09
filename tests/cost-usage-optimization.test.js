const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const app = read("app.js");
const index = read("index.html");
const teacher = read("teacher.html");
const serviceWorker = read("sw.js");
const roomApi = read(path.join("api", "study-cafe-rooms.js"));
const studyCafeApi = read(path.join("api", "study-cafe.js"));
const roomSql = read(path.join("supabase", "optimize-study-cafe-room-snapshot.sql"));

assert.match(index, /_vercel\/insights\/script\.js/);
assert.match(index, /window\.vaq?/);
assert.doesNotMatch(teacher, /_vercel\/insights|window\.vaq?/);
assert.match(app, /const STUDY_ROOM_REALTIME_REFRESH_INTERVAL_MS = 15 \* 1000/);
assert.match(app, /const STUDY_ROOM_FALLBACK_REFRESH_INTERVAL_MS = 4000/);
assert.match(app, /status === "SUBSCRIBED"/);
assert.match(roomApi, /callRpc\("get_study_cafe_room_snapshot"/);
assert.match(roomApi, /return loadOwnRoomLegacy\(student\)/);
assert.match(roomApi, /Study room snapshot RPC failed; using legacy reads/);
assert.match(roomApi, /isValidStudyRoomSnapshotPayload\(snapshot\)/);
assert.match(studyCafeApi, /rpc\/get_study_cafe_snapshot_data/);
assert.match(studyCafeApi, /return loadStudyCafeSnapshotRowsLegacy\(studentId, now\)/);
assert.match(studyCafeApi, /Study cafe snapshot RPC failed; using legacy reads/);
assert.match(roomSql, /security invoker/);
assert.match(roomSql, /to service_role/);
assert.match(roomSql, /create or replace function public\.get_study_cafe_snapshot_data/);
assert.match(serviceWorker, /const isStaticAsset = \["style", "script", "font", "image", "manifest"\]/);
assert.match(serviceWorker, /if \(cached\) return cached/);
assert.match(serviceWorker, /url\.pathname\.startsWith\("\/_vercel\/"\)/);
assert.match(serviceWorker, /app\.js\?v=20260909-study-cafe-resume-recovery/);

function pngInfo(name) {
  const file = fs.readFileSync(path.join(root, name));
  assert.equal(file.subarray(1, 4).toString("ascii"), "PNG");
  return {
    width: file.readUInt32BE(16),
    height: file.readUInt32BE(20),
    bytes: file.length,
  };
}

assert.deepEqual(pngInfo("app-icon.png"), { width: 512, height: 512, bytes: fs.statSync(path.join(root, "app-icon.png")).size });
assert.equal(pngInfo("apple-touch-icon.png").width, 180);
assert.equal(pngInfo("icon-192.png").width, 192);
assert.equal(pngInfo("icon-512.png").width, 512);
assert.ok(pngInfo("app-icon.png").bytes < 400 * 1024);
assert.ok(pngInfo("apple-touch-icon.png").bytes < 100 * 1024);

console.log("cost and usage optimization tests passed");
