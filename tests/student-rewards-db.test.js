// Run after installing @electric-sql/pglite@0.3.14 in .tmp/reward-test (see docs).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { PGlite } = require(process.env.PGLITE_MODULE || "../.tmp/reward-test/node_modules/@electric-sql/pglite");
const db = new PGlite();
const query = (sql, params = []) => db.query(sql, params);
const day = new Date(Date.now() - 12 * 86400000).toISOString().slice(0, 10);
function at(offset, hour = 0, minute = 0, second = 0) {
  return new Date(Date.parse(`${day}T00:00:00+09:00`) + offset * 86400000 + hour * 3600000 + minute * 60000 + second * 1000).toISOString();
}
async function student(id, category = "lecture", account = "student", active = true, className = "테스트반") {
  await query(`insert into students (id,name,student_category,account_type,is_active,class_name,app_registered_at)
    values ($1,'테스트',$2,$3,$4,$5,$6)`, [id, category, account, active, className, at(-1)]);
}
async function sync(id, welcome = true) {
  return (await query("select sync_student_rewards($1,$2) as value", [id, welcome])).rows[0].value;
}
async function session(id, start, end, seconds = (Date.parse(end) - Date.parse(start)) / 1000) {
  const result = await query(`insert into study_cafe_sessions (student_id, subject_name, status, started_at, active_started_at, updated_at)
    values ($1,'국어','running',$2,$2,$2) returning id`, [id, start]);
  const sessionId = result.rows[0].id;
  await query(`update study_cafe_sessions set status='completed', active_started_at=null,
    elapsed_seconds=$2, ended_at=$3, updated_at=$3 where id=$1`, [sessionId, seconds, end]);
  return sessionId;
}
async function days(id) {
  return (await query("select study_date::text, seconds from student_reward_study_days($1) order by study_date", [id])).rows;
}

(async () => {
  // Real tables from the repo for the wallet/session contract; unrelated tables
  // are kept minimal so no production credentials or database are needed.
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create table students (id text primary key, name text, class_name text not null default '테스트반',
      student_category text default 'lecture', account_type text default 'student', is_active boolean default true,
      app_registered_at timestamptz, created_at timestamptz default now());
    create table student_devices (id uuid default gen_random_uuid(), student_id text references students(id), registered_at timestamptz default now());
    create table study_cafe_shop_items (id text primary key);
    create table study_cafe_presence (student_id text primary key, last_heartbeat_at timestamptz);
    create table study_cafe_room_members (student_id text primary key, seat_number integer, updated_at timestamptz);`);
  const shop = fs.readFileSync("supabase/add-study-cafe-shop.sql", "utf8");
  for (const table of ["study_cafe_point_wallets", "study_cafe_point_ledger"]) {
    await db.exec(shop.match(new RegExp(`create table if not exists public\\.${table} \\([\\s\\S]*?\\n\\);`))[0]);
  }
  const cafe = fs.readFileSync("supabase/add-study-cafe.sql", "utf8");
  await db.exec(cafe.match(/create table if not exists public\.study_cafe_sessions \([\s\S]*?\n\);/)[0]);
  await student("20001");
  await student("20002");
  await query("insert into student_devices(student_id) values ('20002')");
  await query("update students set app_registered_at=null where id='20002'");
  const filename = fs.readdirSync("supabase/migrations").find((name) => name.endsWith("_add_student_welcome_rewards.sql"));
  await db.exec(fs.readFileSync(path.join("supabase/migrations", filename), "utf8"));
  assert.equal((await query("select challenge_points from student_reward_campaign")).rows[0].challenge_points, 300);
  await query("update student_reward_campaign set starts_at=$1", [at(-2)]);
  assert.equal((await sync("20001")).eligible, false, "existing registrations excluded");
  await query("update students set app_registered_at=$1 where id='20002'", [at(0)]);
  assert.equal((await sync("20002")).eligible, false, "device reset cannot re-enroll existing user");

  for (const [id, category] of [["21001", "lecture"], ["21002", "online_managed"], ["21003", "offline"]]) {
    await student(id, category);
    assert.equal((await sync(id, false)).balance, 0, "welcome waits for home visit");
    const results = await Promise.all(Array.from({ length: 8 }, () => sync(id)));
    assert(results.every((result) => result.balance === 100));
    assert.equal((await query("select count(*)::int as n from study_cafe_point_ledger where student_id=$1", [id])).rows[0].n, 1);
  }
  for (const [id, category, account, active, className] of [
    ["21004", "lecture", "teacher", true], ["21005", "lecture", "student", false],
    ["21006", "lecture", "student", true, "스터디카페 운영계정"], ["1", "lecture", "student", true],
  ]) {
    await student(id, category, account, active, className);
    assert.equal((await sync(id)).error, "student_only");
  }
  await query("update students set app_registered_at=null where id='21001'");
  await query("update students set app_registered_at=$1 where id='21001'", [at(0)]);
  assert.equal((await sync("21001")).balance, 100);

  // Multiple blocks add up; exact 5h qualifies, 4:59:59 does not.
  await session("21001", at(0, 8), at(0, 10));
  await session("21001", at(0, 13), at(0, 16));
  await session("21001", at(1, 8), at(1, 13));
  await session("21001", at(2, 8), at(2, 12, 59, 59));
  assert.equal((await sync("21001")).completed, false);
  await session("21001", at(2, 14), at(2, 14, 0, 1));
  const completed = await sync("21001");
  assert.equal(completed.balance, 400);
  assert.equal(completed.completed, true);
  assert.equal((await sync("21001")).balance, 400, "repeat sync never repeats challenge reward");
  await query("update student_reward_receipts set acknowledged_at=now() where student_id='21001'");
  assert.deepEqual((await sync("21001")).notifications, [], "acknowledgements persist across devices");

  // Midnight is 00:00 KST, even though existing cafe totals roll at 04:00.
  await session("21002", at(0, 22), at(1, 3));
  assert.deepEqual((await days("21002")).map((row) => row.seconds), [7200, 10800]);
  const paused = (await query(`insert into study_cafe_sessions(student_id,subject_name,status,started_at,active_started_at,updated_at)
    values ('21002','영어','running',$1,$1,$1) returning id`, [at(2, 22)])).rows[0].id;
  await query("update study_cafe_sessions set status='paused',active_started_at=null,elapsed_seconds=3600,updated_at=$2 where id=$1", [paused, at(2, 23)]);
  await query("update study_cafe_sessions set status='running',active_started_at=$2,updated_at=$2 where id=$1", [paused, at(3, 2)]);
  await query("update study_cafe_sessions set status='completed',active_started_at=null,elapsed_seconds=10800,ended_at=$2,updated_at=$2 where id=$1", [paused, at(3, 4)]);
  assert.deepEqual((await days("21002")).map((row) => row.seconds), [7200, 10800, 3600, 7200], "paused midnight hours excluded");

  // 15h in total and nonconsecutive 5h days are not sufficient. Retry is unlimited.
  await session("21003", at(0, 8), at(0, 14));
  await session("21003", at(1, 8), at(1, 12));
  await session("21003", at(2, 8), at(2, 13));
  assert.equal((await sync("21003")).completed, false);
  await session("21003", at(4, 8), at(4, 13));
  assert.equal((await sync("21003")).completed, false);
  await session("21003", at(5, 8), at(5, 13));
  await session("21003", at(6, 8), at(6, 13));
  assert.equal((await sync("21003")).completed, true);

  // Running interval is included only up to the latest heartbeat + grace.
  await student("21007"); await sync("21007");
  await query(`insert into study_cafe_sessions(student_id,subject_name,status,started_at,active_started_at)
    values ('21007','국어','running',$1,$1)`, [at(0, 8)]);
  await query("insert into study_cafe_presence values ('21007',$1)", [at(0, 8, 1)]);
  assert.equal((await days("21007"))[0].seconds, 90, "abandoned timer cannot accumulate days");
  await query("delete from study_cafe_presence where student_id='21007'");
  await query("insert into study_cafe_room_members values ('21007',1,$1)", [at(0, 9)]);
  assert.equal((await days("21007"))[0].seconds, 3630, "private room heartbeat is recognized");

  await student("21008"); await sync("21008");
  await session("21008", at(0, 8), at(0, 13));
  await session("21008", at(1, 8), at(1, 13));
  const live = (await query(`insert into study_cafe_sessions(student_id,subject_name,status,started_at,active_started_at)
    values ('21008','국어','running',$1,$1) returning id`, [at(2, 8)])).rows[0].id;
  await query("insert into study_cafe_presence values ('21008',$1)", [at(2, 12, 59, 29)]);
  assert.equal((await sync("21008")).completed, false);
  await query("update study_cafe_presence set last_heartbeat_at=$1 where student_id='21008'", [at(2, 12, 59, 30)]);
  assert.equal((await sync("21008")).balance, 400, "third-day live timer awards without requiring stop");
  await query("update study_cafe_sessions set status='completed',active_started_at=null,elapsed_seconds=18000,ended_at=$2,updated_at=$2 where id=$1", [live, at(2, 13)]);
  assert.equal((await sync("21008")).balance, 400, "stopping after the live award does not duplicate it");
  await session("21008", at(0, 9), at(0, 12));
  assert.equal((await days("21008"))[0].seconds, 18000, "overlapping sessions counted once");

  await student("21009");
  await query("insert into study_cafe_point_wallets(student_id,balance) values ('21009',77)");
  await query(`insert into study_cafe_point_ledger(student_id,source_type,source_key,amount,balance_after)
    values ('21009','adjustment','bonus:welcome:v1',1,77)`);
  await assert.rejects(() => sync("21009"), /duplicate key/);
  assert.equal((await query("select balance from study_cafe_point_wallets where student_id='21009'")).rows[0].balance, 77, "failed ledger write rolls back wallet credit");
  assert.equal((await query("select count(*)::int as n from student_reward_receipts where student_id='21009'")).rows[0].n, 0, "failed credit leaves no success receipt");

  // Existing 04:00 rollover produces two sessions within the same calendar day.
  await student("21010"); await sync("21010");
  await session("21010", at(0, 2), at(0, 4));
  await session("21010", at(0, 4), at(0, 7));
  assert.deepEqual((await days("21010")).map((row) => row.seconds), [18000]);

  await db.exec(`grant select, insert, update on students, study_cafe_sessions, study_cafe_presence,
    study_cafe_room_members, study_cafe_point_wallets, study_cafe_point_ledger to service_role;
    set role service_role;`);
  assert.equal((await sync("21008")).balance, 400, "service role can use the invoker RPC");
  await db.exec("reset role");

  // Public roles cannot read records or call reward functions.
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`grant select, update on students to ${role}`);
    await db.exec(`set role ${role}`);
    await assert.rejects(() => query("select * from student_reward_receipts"), /permission denied/);
    await assert.rejects(() => sync("21001"), /permission denied/);
    await query("update students set app_registered_at=app_registered_at where id='21001'");
    await db.exec("reset role");
  }
  const security = (await query(`select proname, prosecdef from pg_proc where proname in
    ('enroll_student_rewards','capture_student_reward_focus','student_reward_study_days','sync_student_rewards')`)).rows;
  assert.equal(security.length, 4);
  assert(security.every((fn) => fn.prosecdef === false));
  assert.equal((await query("select count(*)::int as n from pg_class where relname like 'student_reward_%' and relkind='r' and relrowsecurity")).rows[0].n, 4);
  console.log("student rewards DB: eligibility, retries, atomic credits, thresholds, KST midnight, pauses, streaks, heartbeat caps and permissions passed");
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => db.close());
