// Real PostgreSQL execution in the existing isolated PGlite harness. No remote
// credentials or production records. For native multi-connection checks see docs.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const crypto = require("node:crypto");
const native = process.env.FAST_RPC_NATIVE_DB === "1";
let db, makeClient;
if (native) {
  const { Client } = require(process.env.PG_TEST_MODULE || "../.tmp/pg-rpc-test/node_modules/pg");
  // Deliberately fixed to the disposable loopback database, never DATABASE_URL.
  makeClient = () => new Client({ host: "127.0.0.1", port: 55439, user: "postgres", database: "log_reduction_test" });
  const client = makeClient();
  const ready = client.connect();
  db = { query: async (...args) => { await ready; return client.query(...args); },
    exec: async sql => { await ready; return client.query(sql); }, close: () => client.end() };
} else {
  const { PGlite } = require(process.env.PGLITE_MODULE || "../.tmp/reward-test/node_modules/@electric-sql/pglite");
  db = new PGlite();
}
const q = (sql, args = []) => db.query(sql, args);
const read = file => fs.readFileSync(file, "utf8");
const table = (sql, name) => sql.match(new RegExp(`create table if not exists public\\.${name} \\([\\s\\S]*?\\n\\);`))[0];
const token = "test-device-secret", hash = crypto.createHash("sha256").update(token).digest("hex");
const migration = read("supabase/migrations/20260928042109_study_cafe_heartbeat_fast_path.sql");
const heartbeat = async (id, digest = hash) => (await q("select public.study_cafe_heartbeat($1,$2,'browser','test') as result", [id, digest])).rows[0].result;
const rewardAuth = async (id, digest = hash) => (await q("select public.validate_student_reward_device($1,$2,'browser','test') as result", [id, digest])).rows[0].result;
const sync = async (id, welcome = true) => (await q("select public.sync_student_rewards($1,$2) as result", [id, welcome])).rows[0].result;
async function student(id, category = "lecture", extras = {}) {
  await q(`insert into students(id,name,student_category,account_type,class_name,is_active,app_registered_at,device_token)
    values($1,'Test',$2,$3,$4,$5,now(),$6)`, [id, category, extras.account || "student", extras.className || "test", extras.active !== false, extras.legacy ? token : null]);
  if (!extras.legacy) await q("insert into student_devices(student_id,device_token_hash) values($1,$2)", [id, hash]);
}
async function presence(id, seat = 1) {
  await q(`insert into study_cafe_presence(student_id,seat_number,status,current_subject,last_heartbeat_at,updated_at)
    values($1,$2,'studying','Law',now()-interval '30 seconds',now()-interval '1 minute')`, [id, seat]);
}

(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema extensions;
    -- PGlite has built-in SHA-256 but no pgcrypto bundle. Adapt only the hash
    -- provider used by the UNMODIFIED production device validator below.
    ${native ? 'create extension pgcrypto with schema extensions;' : `create function extensions.digest(text,text) returns bytea language sql immutable strict
      as 'select sha256(convert_to($1,''UTF8''))';`}
    create table students(id text primary key, name text, track text, student_category text,
      account_type text default 'student', class_name text default 'test', is_active boolean default true,
      app_registered_at timestamptz, created_at timestamptz default now(), device_token text);
    ${table(read("supabase/add-student-devices.sql"), "student_devices")}
    ${table(read("supabase/add-study-cafe.sql"), "study_cafe_sessions")}
    ${table(read("supabase/add-study-cafe.sql"), "study_cafe_presence")}
    ${table(read("supabase/add-study-cafe-rooms.sql"), "study_cafe_rooms")}
    ${table(read("supabase/add-study-cafe-rooms.sql"), "study_cafe_room_members")}
    create unique index study_cafe_one_active_session_per_student on study_cafe_sessions(student_id) where status in ('running','paused');
    create table study_cafe_shop_items(id text primary key);
    ${table(read("supabase/add-study-cafe-shop.sql"), "study_cafe_point_wallets")}
    ${table(read("supabase/add-study-cafe-shop.sql"), "study_cafe_point_ledger")}`);
  // Current category access migration removes these old prefix-only checks.
  await db.exec(`alter table study_cafe_sessions drop constraint study_cafe_sessions_student_id_check;
    alter table study_cafe_presence drop constraint study_cafe_presence_student_id_check;`);
  const roomSql = read("supabase/add-study-cafe-rooms.sql");
  await db.exec(roomSql.slice(roomSql.indexOf("create or replace function public.enforce_study_cafe_room_host()"),
    roomSql.indexOf("create table if not exists public.study_cafe_room_messages")));
  const deviceSql = read("supabase/add-student-devices.sql");
  await db.exec(deviceSql.match(/create or replace function public\.validate_student_device\([\s\S]*?\n\$\$;/)[0]);
  await db.exec(`revoke all on function validate_student_device(text,text,text,text) from public,anon,authenticated;
    grant execute on function validate_student_device(text,text,text,text) to service_role;`);
  await db.exec(read("supabase/migrations/20260911091142_add_student_welcome_rewards.sql"));
  await db.exec(migration);
  await db.exec(migration); // Additive migration remains safe to reapply.
  await db.exec(`grant usage on schema public to service_role;
    grant select,insert,update,delete on all tables in schema public to service_role;`);

  for (const [id, category] of [["21001", "lecture"], ["21002", "online_managed"], ["21003", "offline"], ["21004", null], ["11001", "lecture"], ["11002", null]]) await student(id, category);
  await presence("21001");
  await q(`insert into study_cafe_sessions(student_id,subject_name,status,started_at,active_started_at)
    values('21001','Law','running',now(),now())`);
  const before = (await q("select * from study_cafe_presence where student_id='21001'")).rows[0];
  const sessionsBefore = (await q("select * from study_cafe_sessions order by id")).rows;
  await db.exec("set role service_role");
  const first = await heartbeat("21001");
  assert.equal(first.ok, true);
  assert.ok(Number.isFinite(Date.parse(first.serverNow)));
  const after = (await q("select * from study_cafe_presence where student_id='21001'")).rows[0];
  assert.ok(after.last_heartbeat_at > before.last_heartbeat_at);
  assert.deepEqual({ ...after, last_heartbeat_at: before.last_heartbeat_at }, before, "only heartbeat time changes");
  assert.deepEqual((await q("select * from study_cafe_sessions order by id")).rows, sessionsBefore, "normal heartbeat never changes time records");
  assert.equal((await heartbeat("21001", "0".repeat(64))).error, "device_not_active");
  assert.equal((await heartbeat("21001", null)).error, "device_not_active");
  assert.equal((await heartbeat("missing")).error, "device_not_active");
  assert.equal((await heartbeat("21003")).error, "online_student_only");
  assert.equal((await heartbeat("11002")).error, "online_student_only");
  for (const id of ["21002", "21004", "11001"]) assert.equal((await heartbeat(id)).error, "seat_required", "eligible categories retain access");

  await q("update student_devices set revoked_at=now() where student_id='21001'");
  assert.equal((await heartbeat("21001")).error, "device_not_active", "revocation applies on the next request");
  await q("update student_devices set revoked_at=null where student_id='21001'");
  await q("update students set is_active=false where id='21001'");
  assert.equal((await heartbeat("21001")).error, "device_not_active");
  await q("update students set is_active=true where id='21001'");

  // Exact stale-seat conditions, including the two-minute candidate filter.
  for (const [state, heartbeatAge, activityAge, legacy] of [
    ["seated", "3 minutes", "16 minutes", true],
    ["paused", "3 minutes", "16 minutes", true],
    ["studying", "16 minutes", "1 minute", true],
    ["countdown", "16 minutes", "1 minute", true],
    ["seated", "1 minute", "16 minutes", false],
    ["paused", "3 minutes", "14 minutes", false],
    ["studying", "3 minutes", "16 minutes", false],
  ]) {
    await q("update study_cafe_presence set status=$1,last_heartbeat_at=now()-$2::interval,updated_at=now()-$3::interval where student_id='21001'", [state, heartbeatAge, activityAge]);
    const original = (await q("select * from study_cafe_presence where student_id='21001'")).rows[0];
    const result = await heartbeat("21001");
    assert.equal(result.legacy === true, legacy, `${state}, ${heartbeatAge}, ${activityAge}`);
    if (legacy) {
      assert.equal(result.student.id, "21001");
      assert.equal(Object.hasOwn(result.student, "device_token"), false);
      assert.deepEqual((await q("select * from study_cafe_presence where student_id='21001'")).rows[0], original, "expired seat is not revived");
    }
  }
  // Another student's expired seat still invokes the original global cleanup.
  await presence("21002", 2);
  await q("update study_cafe_presence set last_heartbeat_at=now()-interval '16 minutes' where student_id='21002'");
  assert.equal((await heartbeat("21001")).legacy, true);
  await q("delete from study_cafe_presence where student_id='21002'");
  await q("update study_cafe_sessions set started_at=now()-interval '2 days' where student_id='21001'");
  const dayBefore = (await q("select * from study_cafe_sessions where student_id='21001'")).rows;
  assert.equal((await heartbeat("21001")).legacy, true, "04:00 rollover stays on existing path");
  assert.deepEqual((await q("select * from study_cafe_sessions where student_id='21001'")).rows, dayBefore);
  await q("update study_cafe_sessions set started_at=now() where student_id='21001'");
  await q("update study_cafe_sessions set status='paused',active_started_at=null where student_id='21001'");
  assert.equal((await heartbeat("21001")).ok, true);
  assert.equal((await q("select status from study_cafe_sessions where student_id='21001'")).rows[0].status, "paused");

  // Private seat update, released seat, and public-seat precedence.
  await db.exec("begin");
  const roomId = (await q("insert into study_cafe_rooms(name,capacity,host_student_id) values('Test room',4,'21002') returning id")).rows[0].id;
  await q("insert into study_cafe_room_members(room_id,student_id,role,seat_number,updated_at) values($1,'21002','host',1,now()-interval '30 seconds')", [roomId]);
  await db.exec("commit");
  assert.equal((await heartbeat("21002")).ok, true);
  await q("update study_cafe_room_members set seat_number=null where student_id='21002'");
  assert.equal((await heartbeat("21002")).error, "seat_required");
  await q("update study_cafe_rooms set is_active=false where id=$1", [roomId]);
  await q("delete from study_cafe_room_members where student_id='21002'");
  assert.equal((await heartbeat("21002")).error, "seat_required", "leave/kick cannot recreate membership");
  await db.exec("begin");
  await q("insert into study_cafe_room_members(room_id,student_id,role,seat_number,updated_at) values($1,'21001','host',2,now()-interval '30 seconds')", [roomId]);
  await q("update study_cafe_rooms set is_active=true,host_student_id='21001' where id=$1", [roomId]);
  await db.exec("commit");
  const membership = (await q("select * from study_cafe_room_members where student_id='21001'")).rows;
  assert.equal((await heartbeat("21001")).ok, true);
  assert.deepEqual((await q("select * from study_cafe_room_members where student_id='21001'")).rows, membership);
  await q("delete from study_cafe_presence where student_id='21001'");
  assert.equal((await heartbeat("21001")).ok, true);

  await db.exec("reset role");
  await student("21005", "lecture", { legacy: true });
  await presence("21005", 5);
  assert.equal((await heartbeat("21005")).ok, true, "legacy token migration is preserved");
  assert.equal((await q("select count(*)::int n from student_devices where student_id='21005'")).rows[0].n, 1);

  // Reward eligibility and the original settlement are executed separately.
  await db.exec("set role service_role");
  for (const id of ["21001", "21002", "21003"]) {
    assert.equal((await rewardAuth(id)).ok, true, "all student categories retain rewards");
    assert.equal((await sync(id, false)).balance, 0, "welcome only on home visit");
    assert.equal((await sync(id, true)).balance, 100);
    assert.equal((await sync(id, true)).balance, 100, "no duplicate credit on repeat");
  }
  assert.equal((await rewardAuth("21001", "0".repeat(64))).error, "device_not_active");
  await db.exec("reset role");
  for (const [id, extras] of [["21006", { account: "teacher" }], ["21007", { className: "스터디카페 운영계정" }], ["0001", {}], ["21008", { active: false }]]) {
    await student(id, "lecture", extras);
    assert.equal((await rewardAuth(id)).error, extras.active === false ? "device_not_active" : "student_only");
  }
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    await assert.rejects(() => heartbeat("21001"), /permission denied/);
    await assert.rejects(() => rewardAuth("21001"), /permission denied/);
    await db.exec("reset role");
  }
  const security = (await q("select proname,prosecdef,proconfig from pg_proc where proname in ('study_cafe_heartbeat','validate_student_reward_device')")).rows;
  assert.equal(security.length, 2);
  assert.ok(security.every(row => !row.prosecdef && row.proconfig.includes('search_path=""')));
  assert.match(migration, /for update nowait/);
  assert.match(migration, /exception when lock_not_available then/);
  if (native) {
    const holding = makeClient(), waiting = makeClient();
    await holding.connect(); await waiting.connect();
    try {
      await holding.query("set statement_timeout='5s'");
      await waiting.query("set statement_timeout='5s'");
      await presence("21001", 1);
      // Public seat held by another connection: fast path must immediately
      // delegate instead of holding student -> waiting for seat indefinitely.
      await holding.query("begin");
      await holding.query("select * from study_cafe_presence where student_id='21001' for update");
      await waiting.query("set role service_role");
      let result = (await waiting.query("select study_cafe_heartbeat($1,$2) r", ["21001", hash])).rows[0].r;
      assert.equal(result.legacy, true, "public seat contention delegates without deadlock");
      await holding.query("delete from study_cafe_presence where student_id='21001'");
      await holding.query("commit");
      // Private membership lock has the same nonblocking contract.
      await holding.query("begin");
      await holding.query("select * from study_cafe_room_members where student_id='21001' for update");
      result = (await waiting.query("select study_cafe_heartbeat($1,$2) r", ["21001", hash])).rows[0].r;
      assert.equal(result.legacy, true);
      await holding.query("delete from study_cafe_room_members where student_id='21001'");
      await holding.query("update study_cafe_rooms set is_active=false where id=$1", [roomId]);
      await holding.query("commit");
      assert.equal((await heartbeat("21001")).error, "seat_required", "committed leave cannot be undone");

      // Revocation follows the real validator's student advisory-lock contract.
      await holding.query("begin");
      await holding.query("select pg_advisory_xact_lock(hashtext('21005')::bigint)");
      await holding.query("update student_devices set revoked_at=now() where student_id='21005'");
      const revoked = waiting.query("select study_cafe_heartbeat($1,$2) r", ["21005", hash]);
      await holding.query("commit");
      assert.equal((await revoked).rows[0].r.error, "device_not_active");

      // Repeated simultaneous requests use separate PostgreSQL sessions.
      await holding.query("update student_devices set revoked_at=null where student_id='21005'");
      await holding.query("set role service_role");
      const simultaneous = await Promise.all(Array.from({ length: 12 }, (_, i) =>
        (i % 2 ? holding : waiting).query("select study_cafe_heartbeat($1,$2) r", ["21005", hash])));
      assert.ok(simultaneous.every(x => x.rows[0].r.ok));

      // Authentication must finish (release student row) before settlement
      // contends with another transaction's enrollment/wallet locks.
      await holding.query("begin");
      await holding.query("select * from student_reward_enrollments where student_id='21001' for update");
      assert.equal((await waiting.query("select validate_student_reward_device($1,$2) r", ["21001", hash])).rows[0].r.ok, true);
      const awarding = waiting.query("select sync_student_rewards('21001',true) r");
      await holding.query("select * from students where id='21001' for key share");
      await holding.query("commit");
      assert.equal((await awarding).rows[0].r.balance, 100);
      const credits = await Promise.all([holding.query("select sync_student_rewards('21002',true) r"), waiting.query("select sync_student_rewards('21002',true) r")]);
      assert.ok(credits.every(x => x.rows[0].r.balance === 100));
      assert.equal((await q("select count(*)::int n from study_cafe_point_ledger where student_id='21002'")).rows[0].n, 1);
      console.log("native PostgreSQL concurrency: held public/private seats, leave, device revocation, parallel heartbeats, reward lock ordering and duplicate credits passed");
    } finally {
      await holding.query("rollback").catch(() => {});
      await waiting.query("rollback").catch(() => {});
      await holding.end(); await waiting.end();
    }
  }
  console.log("fast RPC DB: real validator, token migration/revocation, categories, public/private seats, stale cleanup delegation, day rollover delegation, unchanged records, rewards and role permissions passed");
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.close());
