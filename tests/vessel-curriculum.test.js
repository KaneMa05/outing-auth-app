const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const sql = read("supabase/seed-curriculum-vessel-crew-patrol.sql");
const publicSql = read("supabase/seed-curriculum-public-recruitment.sql");
const generator = read("scripts/generate-curriculum-vessel-crew-seed.js");
const appSource = read("app.js");
const progressHandler = require("../api/curriculum-progress");

assert.match(sql, /'navigation-technique', '항해술', '항해'/);
assert.match(sql, /'marine-engineering', '기관술', '기관'/);
assert.match(sql, /'maritime-english', '해사영어', '영어'/);
assert.match(sql, /경찰직 - 함정요원 항해\(순경\)/);
assert.match(sql, /경찰직 - 함정요원 기관\(순경\)/);
assert.doesNotMatch(
  sql.match(/insert into public\.curriculum_subjects[\s\S]*?on conflict \(id\)/)?.[0] || "",
  /함정요원 .*\(경장\)/
);
assert.equal((sql.match(/-stage-\d+',/g) || []).length >= 42, true);
assert.equal((sql.match(/-lecture-\d+',/g) || []).length, 196);
assert.equal((sql.match(/false\),\n|false\)\n/g) || []).length >= 3, true);
assert.match(sql, /where id = 'coast-guard-intro'/);
assert.match(sql, /where id = 'maritime-law'/);
assert.match(publicSql, /함정요원 항해\(순경\)/);
assert.match(publicSql, /함정요원 기관\(순경\)/);
assert.match(generator, /row\.period === "25하반기"/);
assert.match(generator, /const stageTitle = stageLectures\.map/);
assert.match(generator, /quote\(stageTitle\)/);
assert.match(generator, /string_agg\(title, ', ' order by sort_order, id\)/);
assert.match(sql, /string_agg\(title, ', ' order by sort_order, id\)/);
assert.match(appSource, /normalizeCoastGuardTrack\(student\.track\) !== "경찰직 - 공채\(순경\)"/);
assert.match(appSource, /return "함정요원·항해"/);
assert.match(appSource, /return "함정요원·기관"/);

const trackCatalog = [
  { id: "criminal-law", targetTracks: ["경찰직 - 공채(순경)"] },
  { id: "navigation-technique", targetTracks: ["경찰직 - 함정요원 항해(순경)"] },
  { id: "marine-engineering", targetTracks: ["경찰직 - 함정요원 기관(순경)"] },
  { id: "maritime-english", targetTracks: ["경찰직 - 함정요원 항해(순경)", "경찰직 - 함정요원 기관(순경)"] },
  { id: "coast-guard-intro", targetTracks: ["경찰직 - 공채(순경)", "경찰직 - 함정요원 항해(순경)", "경찰직 - 함정요원 기관(순경)"] },
  { id: "maritime-law", targetTracks: ["경찰직 - 공채(순경)", "경찰직 - 함정요원 항해(순경)", "경찰직 - 함정요원 기관(순경)"] },
];
assert.deepEqual(
  progressHandler._test.filterCatalogForTrack(trackCatalog, "경찰직 - 함정요원 항해(순경)").map((subject) => subject.id),
  ["navigation-technique", "maritime-english", "coast-guard-intro", "maritime-law"]
);
assert.deepEqual(
  progressHandler._test.filterCatalogForTrack(trackCatalog, "경찰직 - 함정요원 기관(순경)").map((subject) => subject.id),
  ["marine-engineering", "maritime-english", "coast-guard-intro", "maritime-law"]
);
assert.deepEqual(
  progressHandler._test.filterCatalogForTrack(trackCatalog, "경찰직 - 함정요원 항해(경장)").map((subject) => subject.id),
  []
);

console.log("vessel curriculum tests passed");
