// Disposable PostgreSQL only. Never connects to production.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require(process.env.PGLITE_MODULE || '../.tmp/reward-test/node_modules/@electric-sql/pglite');
const db = new PGlite();
const read = file => fs.readFileSync(file, 'utf8');
const now = '2026-09-29T03:00:00Z';
const q = (sql, params = []) => db.query(sql, params);
const value = async (sql, params = []) => (await q(sql, params)).rows[0].value;
const award = id => value('select public.award_study_cafe_time_points($1,$2) as value', [id, now]);
const buy = (id, item) => value('select public.purchase_study_cafe_item($1,$2,$3) as value', [id, item, now]);
const equip = (id, item) => value('select public.equip_study_cafe_item($1,$2,$3) as value', [id, item, now]);
const unequip = (id, slot, item) => value('select public.unequip_study_cafe_item($1,$2,$3) as value', [id, slot, item]);
const balance = id => value('select balance as value from public.study_cafe_point_wallets where student_id=$1', [id]);

(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create table students(id text primary key, name text, student_category text, is_active boolean default true);
    create table study_cafe_profiles(student_id text primary key references students(id), avatar_tone text default 'navy',
      nickname text, status_message text, hair_style text not null default 'default', updated_at timestamptz default now());
    create table study_cafe_sessions(student_id text references students(id), status text, elapsed_seconds integer,
      started_at timestamptz, active_started_at timestamptz);`);
  await db.exec(read('supabase/add-study-cafe-shop.sql'));
  await db.exec(read('supabase/expand-study-cafe-shop-category-access.sql'));
  await db.exec(read('supabase/add-study-cafe-hair-shop.sql'));
  await db.exec(`grant usage on schema public to service_role;
    grant all on all tables in schema public to service_role;
    update study_cafe_shop_items set is_active=true where slot='hair';
    insert into students values ('managed','Managed','online_managed',true),('lecture','Lecture','lecture',true),
      ('offline','Offline','offline',true),('inactive','Inactive','online_managed',false);
    insert into study_cafe_point_wallets(student_id,balance) values('managed',1500),('lecture',1500);
    insert into study_cafe_profiles(student_id,avatar_tone,nickname,status_message)
      values('managed','rose','Existing nickname','Existing message');
    insert into study_cafe_sessions values
      ('managed','completed',3600,'2026-09-29T00:00:00Z',null),
      ('lecture','completed',3600,'2026-09-29T00:00:00Z',null);`);
  assert.equal((await award('managed')).error, 'invalid_student_id', 'reproduce current managed points denial');
  assert.equal((await unequip('managed', 'hair', 'hair_sport')).error, 'invalid_student_id');
  const before = await value(`select jsonb_build_object('wallets',(select jsonb_agg(w order by student_id) from study_cafe_point_wallets w),
    'profiles',(select jsonb_agg(p order by student_id) from study_cafe_profiles p),
    'sessions',(select jsonb_agg(s order by student_id) from study_cafe_sessions s)) as value`);
  const migration = read('supabase/expand-study-cafe-managed-shop.sql');
  assert.equal(read('supabase/migrations/20260929063345_study_cafe_managed_shop_access.sql'), migration);
  await db.exec(migration);
  await db.exec(migration); // Reapplying must not alter records or privileges.
  assert.deepEqual(await value(`select jsonb_build_object('wallets',(select jsonb_agg(w order by student_id) from study_cafe_point_wallets w),
    'profiles',(select jsonb_agg(p order by student_id) from study_cafe_profiles p),
    'sessions',(select jsonb_agg(s order by student_id) from study_cafe_sessions s)) as value`), before);
  await db.exec('set role service_role');
  for (const id of ['managed', 'lecture']) {
    assert.equal((await award(id)).balance, 1510);
    assert.equal((await award(id)).awardedNow, 0, 'same study time cannot award twice');
    assert.equal((await equip(id, 'hair_sport')).error, 'item_not_owned');
    assert.equal((await buy(id, 'head_navy_cap')).ok, true);
    assert.equal((await equip(id, 'head_navy_cap')).ok, true);
    assert.equal((await buy(id, 'hair_sport')).balance, 660);
    assert.equal((await buy(id, 'hair_sport')).error, 'already_owned');
    assert.equal(await balance(id), 660, 'duplicate purchase cannot charge twice');
    assert.equal((await buy(id, 'chair_premium')).error, 'insufficient_points');
    assert.equal(await balance(id), 660, 'failed purchase preserves balance');
    assert.equal((await equip(id, 'hair_sport')).ok, true);
    assert.equal(await value('select hair_style as value from study_cafe_profiles where student_id=$1', [id]), 'sport');
    assert.equal((await unequip(id, 'hair', 'hair_sport')).ok, true);
    assert.equal(await value('select hair_style as value from study_cafe_profiles where student_id=$1', [id]), 'default');
    assert.equal((await equip(id, 'hair_sport')).ok, true, 'owned hair is retained and can be re-equipped');
    assert.equal(await value("select count(*)::int as value from study_cafe_equipment where student_id=$1 and slot='head'", [id]), 1);
    assert.equal((await unequip(id, 'head', 'head_navy_cap')).ok, true);
    assert.equal((await unequip(id, 'invalid', 'head_navy_cap')).error, 'invalid_shop_slot');
    assert.equal(await balance(id), 660, 'equip/unequip never spends points');
  }
  assert.equal(await value("select nickname as value from study_cafe_profiles where student_id='managed'"), 'Existing nickname');
  for (const id of ['offline', 'inactive', 'missing']) {
    assert.equal((await award(id)).error, 'invalid_student_id');
    assert.equal((await unequip(id, 'hair', 'hair_sport')).error, 'invalid_student_id');
  }
  await assert.rejects(q("update study_cafe_profiles set hair_style='wave' where student_id='managed'"), /hair_style_not_owned/);
  await db.exec('reset role');
  for (const signature of ['award_study_cafe_time_points(text,timestamptz)', 'purchase_study_cafe_item(text,text,timestamptz)',
    'equip_study_cafe_item(text,text,timestamptz)', 'unequip_study_cafe_item(text,text,text)']) {
    for (const role of ['anon', 'authenticated'])
      assert.equal(await value('select has_function_privilege($1,$2,\'execute\') as value', [role, signature]), false);
    assert.equal(await value('select has_function_privilege(\'service_role\',$1,\'execute\') as value', [signature]), true);
  }
  assert.equal(await value("select count(*)::int as value from study_cafe_point_wallets where student_id in ('offline','inactive')"), 0);
  console.log('Managed/lecture DB: points, preservation, purchase, ownership, hair, unequip and permissions passed');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.close());
