// Isolated PostgreSQL/WASM only; never uses a network database or env credentials.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {PGlite}=require(process.env.PGLITE_MODULE || '../.tmp/reward-test/node_modules/@electric-sql/pglite');
const db=new PGlite();
const read=p=>fs.readFileSync(p,'utf8');
const core=read('supabase/migrations/20260911052853_add_study_character_hair.sql').match(/create or replace function public\.get_study_cafe_snapshot_data\([\s\S]*?\n\$\$;/)[0];
const bots=read('supabase/migrations/20260911080239_add_study_cafe_bot_admin.sql').match(/create or replace function public\.study_cafe_bot_appearance\([\s\S]*?\n\$\$;/)[0];
const migration=read('supabase/migrations/20261014023329_study_cafe_snapshot_bundle.sql');
const q=(sql,args=[])=>db.query(sql,args);
(async()=>{
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema private;
    create table students(id text primary key,name text,track text,student_category text,is_active bool);
    create table study_cafe_subjects(student_id text,name text,sort_order int);
    create table study_cafe_todos(student_id text,id text,study_date date,subject_name text,content text,is_completed bool,completed_at timestamptz,created_at timestamptz);
    create table study_cafe_subject_goals(student_id text,study_date date,subject_name text,target_minutes int,result_status text,completed_elapsed_seconds int,completed_at timestamptz);
    create table study_cafe_sessions(id text,student_id text,subject_name text,status text,elapsed_seconds int,started_at timestamptz,active_started_at timestamptz,ended_at timestamptz);
    create table study_cafe_presence(student_id text,seat_number int,status text,current_subject text,avatar_tone text,display_name text,last_heartbeat_at timestamptz,updated_at timestamptz);
    create table study_cafe_profiles(student_id text,avatar_tone text,nickname text,status_message text,hair_style text);
    create table study_cafe_equipment(student_id text,slot text,item_id text,equipped_at timestamptz);
    create table study_cafe_shop_items(id text,slot text,icon text);
    create table private.study_cafe_agents(student_id text,avatar_tone text);
    create table study_cafe_point_wallets(student_id text,balance int);
    insert into students values('20001','One','A','lecture',true),('20002','Two','A','online_managed',true),('1','Bot','A','lecture',true);
    insert into study_cafe_profiles values('20001','blue','One','','wave'),('20002','mint','Two','','default');
    insert into study_cafe_presence values('20001',1,'studying','Law','blue','One',now(),now()),('1',2,'studying','Law','mint','Bot',now(),now());
    insert into study_cafe_sessions values('s','20001','Law','running',60,'2026-10-13T19:00:00Z','2026-10-14T01:00:00Z',null);
    insert into study_cafe_equipment values('20001','chair','chair_premium',now()),('20002','head','head_cap',now()),('1','chair','chair_premium',now());
    insert into study_cafe_shop_items values('chair_premium','chair','icon');
    insert into private.study_cafe_agents values('1','mint');
    insert into study_cafe_point_wallets values('20001',50);
    grant usage on schema public,private to service_role;
    grant select on all tables in schema public,private to service_role;`);
  await db.exec(core);await db.exec(bots);await db.exec(migration);await db.exec(migration);
  const args=['20001','2026-10-14','2026-10-13T19:00:00Z','2026-10-14T19:00:00Z'];
  await db.exec('set role service_role');
  const original=(await q('select get_study_cafe_snapshot_data($1,$2,$3,$4) result',args)).rows[0].result;
  const bundled=(await q('select get_study_cafe_snapshot_bundle($1,$2,$3,$4) result',args)).rows[0].result;
  assert.deepEqual(bundled.snapshot,original);
  assert.deepEqual(bundled.botAppearances,(await q('select study_cafe_bot_appearance() result')).rows[0].result);
  assert.equal(bundled.equipment.length,1);assert.equal(bundled.equipment[0].item_id,'chair_premium');
  assert.equal((await q("select balance from study_cafe_point_wallets where student_id='20001'")).rows[0].balance,50);
  const other=(await q('select get_study_cafe_snapshot_bundle($1,$2,$3,$4) result',['20002',...args.slice(1)])).rows[0].result;
  assert.equal(other.equipment[0].item_id,'head_cap','equipment stays scoped to the requested student');
  await db.exec('reset role');
  const settings=(await q("select prosecdef,provolatile,proconfig from pg_proc where proname='get_study_cafe_snapshot_bundle'")).rows[0];
  assert.equal(settings.prosecdef,false);assert.equal(settings.provolatile,'s');assert.ok(settings.proconfig.includes('search_path=""'));
  for(const role of ['anon','authenticated']){
    await db.exec('set role '+role);
    await assert.rejects(q('select public.get_study_cafe_snapshot_bundle($1,$2,$3,$4)',args),/permission denied/);
    await db.exec('reset role');
  }
  // Optional modules absent: preserve core data and signal existing fallbacks.
  await db.exec('drop function public.study_cafe_bot_appearance(); drop table public.study_cafe_equipment;');
  const partial=(await q('select get_study_cafe_snapshot_bundle($1,$2,$3,$4) result',args)).rows[0].result;
  assert.deepEqual(partial.snapshot,original);assert.equal(partial.equipment,null);assert.equal(partial.botAppearances,null);
  console.log('Bundle DB: original results equal; service-only ACL, read-only behavior, separate users and optional-module fallback verified.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>db.close());
