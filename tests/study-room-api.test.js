const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const handler = require(path.join(root, "api", "study-cafe-rooms.js"));
const {
  hashRoomPassword,
  isValidRoomPassword,
  normalizeMessage,
  normalizeRoomInput,
  normalizeRoomSeat,
  verifyRoomPassword,
} = handler._private;

assert.equal(isValidRoomPassword("1234"), true);
assert.equal(isValidRoomPassword("study99"), true);
assert.equal(isValidRoomPassword("12"), false);
assert.equal(isValidRoomPassword("비밀번호"), false);

const password = hashRoomPassword("1234", "fixed-salt");
assert.notEqual(password.hash, "1234");
assert.equal(verifyRoomPassword("1234", {
  password_hash: password.hash,
  password_salt: password.salt,
}), true);
assert.equal(verifyRoomPassword("9999", {
  password_hash: password.hash,
  password_salt: password.salt,
}), false);

assert.deepEqual(normalizeRoomInput({
  name: "  해경   집중반  ",
  description: "  같이 공부해요  ",
  capacity: 8,
  theme: "dawn",
  accessType: "password",
  password: "1234",
}), {
  name: "해경 집중반",
  description: "같이 공부해요",
  capacity: 8,
  theme: "dawn",
  accessType: "password",
  password: "1234",
});
assert.throws(() => normalizeRoomInput({ name: "한", capacity: 8, accessType: "public" }), /invalid_room_name/);
assert.throws(() => normalizeRoomInput({ name: "스터디방", capacity: 21, accessType: "public" }), /invalid_room_capacity/);
assert.equal(normalizeRoomSeat(8, 8), 8);
assert.throws(() => normalizeRoomSeat(9, 8), /invalid_room_seat/);
assert.equal(normalizeMessage(" 안녕하세요 "), "안녕하세요");
assert.throws(() => normalizeMessage(""), /invalid_room_message/);
assert.throws(() => normalizeMessage("a".repeat(301)), /invalid_room_message/);

const sql = fs.readFileSync(path.join(root, "supabase", "add-study-cafe-rooms.sql"), "utf8");
assert.match(sql, /create table if not exists public\.study_cafe_rooms/);
assert.match(sql, /create table if not exists public\.study_cafe_room_members/);
assert.match(sql, /create table if not exists public\.study_cafe_room_messages/);
assert.match(sql, /theme in \('oak', 'dawn', 'forest', 'night', 'classic'\)/);
assert.match(sql, /alter column theme set default 'oak'/);
assert.match(sql, /unique \(student_id\)/);
assert.match(sql, /study_cafe_room_one_member_per_seat/);
assert.match(sql, /study_cafe_rooms_host_student_idx/);
assert.match(sql, /study_cafe_room_messages_student_idx/);
assert.match(sql, /study_cafe_room_messages_deleted_by_student_idx/);
assert.match(sql, /create or replace function public\.enforce_study_cafe_room_host/);
assert.match(sql, /returns trigger\s+language plpgsql\s+security invoker/);
assert.match(sql, /revoke all on function public\.enforce_study_cafe_room_host\(\) from public, anon, authenticated/);
assert.match(sql, /create constraint trigger study_cafe_rooms_require_host/);
assert.match(sql, /create constraint trigger study_cafe_room_members_require_host/);
assert.match(sql, /active_room_host_required/);
assert.match(sql, /create or replace function public\.create_study_cafe_room/);
assert.match(sql, /create or replace function public\.join_study_cafe_room/);
assert.match(sql, /create or replace function public\.claim_study_cafe_room_seat/);
assert.match(sql, /create or replace function public\.leave_study_cafe_room/);
assert.match(sql, /order by joined_at asc/);
assert.match(sql, /set role = 'host', updated_at = now\(\)/);
assert.match(sql, /set host_student_id = v_next_host, updated_at = now\(\)/);
assert.match(sql, /enable row level security/);
assert.match(sql, /revoke all on public\.study_cafe_room_messages from anon, authenticated/);

console.log("study room API and SQL tests passed");
