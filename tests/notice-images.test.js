const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const handler = require("../api/notices");
const { normalizeNotice, normalizeNoticeId, normalizeNoticeImage, normalizeNoticeImagePath, normalizeNoticeTargetAudience } = handler._private;

assert.equal(normalizeNoticeId("notice_123"), "notice_123");
assert.throws(() => normalizeNoticeId("../notice"), /invalid_notice_id/);
assert.equal(
  normalizeNoticeImagePath("notice_123/123e4567-e89b-12d3-a456-426614174000.jpg"),
  "notice_123/123e4567-e89b-12d3-a456-426614174000.jpg"
);
assert.throws(() => normalizeNoticeImagePath("other/file.png"), /invalid_image_path/);

const jpeg = normalizeNoticeImage({
  contentType: "image/jpeg",
  data: `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString("base64")}`,
});
assert.equal(jpeg.contentType, "image/jpeg");
assert.throws(() => normalizeNoticeImage({ contentType: "image/png", data: "data:image/png;base64,iVBORw0KGgo=" }), /invalid_image/);
assert.equal(normalizeNotice({
  id: "notice_123",
  title: " 공지 ",
  body: "첫 줄\r\n둘째 줄",
  targetAudience: "lecture",
  isPublished: true,
}).body, "첫 줄\n둘째 줄");
for (const targetAudience of ["academy", "offline", "online_managed", "lecture"]) {
  assert.equal(normalizeNotice({
    id: "notice_123",
    title: "공지",
    body: "내용",
    targetAudience,
  }).target_audience, targetAudience);
}
assert.equal(normalizeNoticeTargetAudience("lecture,offline"), "offline,lecture");
assert.equal(normalizeNoticeTargetAudience("offline,online_managed"), "offline,online_managed");
assert.equal(normalizeNoticeTargetAudience("lecture,online_managed,offline"), "offline,online_managed,lecture");
assert.equal(normalizeNoticeTargetAudience("offline,unknown"), "academy");

const sharedSource = read("shared.js");
const appSource = read("app.js");
const teacherSource = read("teacher-settings.js");
const apiSource = read("api/notices.js");
const schemaSource = read("supabase/schema.sql");
const migrationSource = read("supabase/add-notice-images.sql");
const styleSource = read("styles.css");

for (const source of [schemaSource, migrationSource]) {
  assert.match(source, /image_path text/);
  assert.match(source, /'notice-images'.*true, 1048576, array\['image\/jpeg'\]/s);
}
assert.match(sharedSource, /id,title,body,image_path,target_audience/);
assert.match(sharedSource, /imagePath: notice\.image_path \|\| ""/);
assert.match(sharedSource, /storage\.from\("notice-images"\)\.getPublicUrl/);
assert.match(teacherSource, /accept: "image\/jpeg,image\/png,image\/webp,image\/heic,image\/heif"/);
assert.match(teacherSource, /return requestNoticeApi\(\{/);
assert.match(teacherSource, /fetch\("\/api\/notices"/);
assert.match(apiSource, /hasPermission\(session, "notices\.write"\)/);
assert.match(apiSource, /image_path: nextImagePath \|\| null/);
assert.doesNotMatch(migrationSource, /grant (?:insert|update) \(image_path\) on public\.notices to anon/);
assert.match(appSource, /className: "student-notice-image"/);
assert.match(appSource, /el\("p", \{\}, String\(notice\.body \|\| ""\)\)/);
assert.doesNotMatch(appSource, /function splitNoticeBody/);
assert.match(styleSource, /\.student-notice-body p\s*\{[^}]*white-space: pre-wrap[^}]*overflow-wrap: anywhere/);
assert.match(styleSource, /student-online-mode:not\(\.student-home-route\) \.student-notice-row \.student-notice-title-text\s*\{[^}]*color: #f4f8fb/);

console.log("notice image tests passed");
