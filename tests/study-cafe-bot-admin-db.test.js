// Uses an isolated in-memory PostgreSQL instance; no production credentials.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require(process.env.PGLITE_MODULE || '../.tmp/reward-test/node_modules/@electric-sql/pglite');
const db = new PGlite();
const query = (sql, params=[]) => db.query(sql,params);
const read = path => fs.readFileSync(path,'utf8');
const cafe=read('supabase/add-study-cafe.sql'), agents=read('supabase/add-study-cafe-agents.sql');
function table(source, name) {return source.match(new RegExp(`create table if not exists ${name.replaceAll('.','\\.')} \\([\\s\\S]*?\\n\\);`))[0];}
function func(source,name) {return source.match(new RegExp(`create or replace function ${name.replaceAll('.','\\.')}\\([\\s\\S]*?\\n\\$\\$;`))[0];}
let seq=0;
const id = () => `00000000-0000-4000-8000-${String(++seq).padStart(12,'0')}`;
async function rpc(action, sid='29999701', payload={}, req=id()) {
  return (await query('select public.study_cafe_bot_admin($1,$2,$3,$4,$5) as result',[action,sid,payload,'admin-test',req])).rows[0].result;
}
async function session(sid,started,seconds,status='completed') {
  await query(`insert into study_cafe_sessions(student_id,subject_name,status,elapsed_seconds,started_at,active_started_at,ended_at)
    values($1,'해사법규',$4,$3,$2,case when $4='running' then now() else null end,case when $4='completed' then $2::timestamptz+interval '2 hours' else null end)`,[sid,started,seconds,status]);
}
(async()=>{
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema private;
    create table students(id text primary key,name text,student_category text,track text,is_active boolean default true);
    ${table(cafe,'public.study_cafe_profiles')}
    ${table(cafe,'public.study_cafe_subjects')}
    ${table(cafe,'public.study_cafe_sessions')}
    ${table(cafe,'public.study_cafe_presence')}
    ${table(agents,'private.study_cafe_agents')}`);
  await db.exec(read('supabase/add-study-cafe-shop.sql'));
  await db.exec(read('supabase/add-study-cafe-hair-shop.sql'));
  await db.exec("update study_cafe_shop_items set is_active=true where slot='hair'");
  await db.exec(func(agents,'private.study_cafe_agent_jitter'));
  await db.exec(func(agents,'private.finish_study_cafe_agent_session'));
  await db.exec(func(agents,'private.run_study_cafe_agents'));
  for(let i=1;i<=5;i++) {
    const sid=`2999970${i}`;
    await query("insert into students values($1,'Existing','online_managed','기존 직렬',true)",[sid]);
    await query(`insert into private.study_cafe_agents(student_id,name,track,subjects,avatar_tone,preferred_seat,start_1,end_1,start_2,end_2,start_3,end_3)
      values($1,'Existing','기존 직렬',array['해사법규'],'navy',7,158,450,505,828,900,1135)`,[sid]);
  }
  await query("insert into students values('28888000','Real student','lecture','공채',true)");
  await session('29999701','2026-09-01T08:00:00+09:00',7200);
  await session('29999701','2026-09-02T08:00:00+09:00',1799);
  await session('29999701','2026-09-02T10:00:00+09:00',1);
  await session('29999701','2026-09-03T08:00:00+09:00',0,'running');
  await query("insert into study_cafe_point_wallets(student_id,balance,lifetime_earned) values('29999701',100,100)");
  // An earlier shop grant must be deducted from the historical backfill.
  await query(`insert into study_cafe_point_ledger(student_id,source_type,source_key,amount,balance_after)
    values('29999701','study_time','study:2026-09-01:5',5,100)`);
  const before=(await query('select * from private.study_cafe_agents order by student_id')).rows;
  await db.exec(read('supabase/add-study-cafe-bot-admin.sql'));
  await db.exec('grant all on all tables in schema public to service_role; grant usage on schema public to service_role;');
  await db.exec('set role service_role');
  let result=await rpc('list');
  assert.equal(result.bots.length,5);
  assert.equal(result.bots[0].balance,120,'backfill multiple days, subtract previous grant, preserve starting wallet');
  assert.equal((await rpc('list')).bots[0].balance,120,'repeated settlement is idempotent');
  assert.equal((await rpc('detail','28888000')).error,'bot_not_found');
  assert.equal((await rpc('purchase','29999701',{itemId:'head_navy_cap',expectedPrice:800,equip:false})).error,'insufficient_points');
  assert.equal((await rpc('purchase','29999701',{itemId:'hair_sport',expectedPrice:999,equip:false})).error,'price_changed');
  const purchase={itemId:'hair_sport',expectedPrice:50,equip:true}, request=id();
  result=await rpc('purchase','29999701',purchase,request);
  assert.equal(result.ok,true); assert.equal(result.balance,70);
  assert.deepEqual(await rpc('purchase','29999701',purchase,request),result,'lost response retry');
  assert.equal((await rpc('purchase','29999702',purchase,request)).error,'request_conflict');
  assert.equal((await rpc('purchase','29999701',purchase)).error,'already_owned');
  const concurrent = await Promise.all([rpc('purchase','29999701',{itemId:'hair_spiky',expectedPrice:80,equip:false}),rpc('purchase','29999701',{itemId:'hair_spiky',expectedPrice:80,equip:false})]);
  assert(concurrent.every(r=>r.error==='insufficient_points'));
  assert.equal((await query("select hair_style from study_cafe_profiles where student_id='29999701'")).rows[0].hair_style,'sport');
  assert.equal((await rpc('unequip','29999701',{itemId:'hair_sport'})).ok,true,'online_managed bot may unequip');
  assert.equal((await query("select hair_style from study_cafe_profiles where student_id='29999701'")).rows[0].hair_style,'default');
  await db.exec('reset role');
  await query("update study_cafe_point_wallets set balance=20000 where student_id='29999701'");
  await db.exec('set role service_role');
  for(const itemId of ['desk_sprout','desk_lamp','desk_tumbler','desk_clock']) {
    const price=(await query('select price from study_cafe_shop_items where id=$1',[itemId])).rows[0].price;
    assert.equal((await rpc('purchase','29999701',{itemId,expectedPrice:price,equip:true})).ok,true);
  }
  const balance=(await rpc('detail')).wallet.balance;
  result=await rpc('purchase','29999701',{itemId:'desk_coast_patrol_ship',expectedPrice:2400,equip:true});
  assert.equal(result.error,'desk_item_limit');
  let detail=await rpc('detail'); assert.equal(detail.wallet.balance,balance); assert(!detail.inventory.includes('desk_coast_patrol_ship'),'purchase+equip fully rolls back');
  const settings={version:0,name:'수정 봇',nickname:'공부수달',track:'공채',subjects:['해사법규','형사법'],avatarTone:'mint',preferredSeat:10,windows:[[158,450],[505,828],[900,1135]]};
  assert.equal((await rpc('save','29999701',settings)).ok,true);
  assert.equal((await rpc('save','29999701',settings)).error,'settings_conflict');
  assert.equal((await rpc('toggle','29999701',{version:1,enabled:false})).ok,true);
  await db.exec('reset role');
  await query("select private.run_study_cafe_agents('2026-09-11T09:00:00+09:00')");
  assert.equal((await query("select count(*)::int n from study_cafe_presence where student_id='29999701'")).rows[0].n,0,'disabled bot stays out after cron');
  const after=(await query("select * from private.study_cafe_agents where student_id<>'29999701' order by student_id")).rows;
  assert.deepEqual(after.map(({admin_version,...a})=>a),before.slice(1),'other existing bot configurations untouched');
  await db.exec('set role service_role');
  assert.equal((await rpc('toggle','29999701',{version:2,enabled:true})).ok,true);
  await db.exec('reset role');
  await query("select private.run_study_cafe_agents('2026-09-11T09:00:00+09:00')");
  assert.equal((await query("select display_name from study_cafe_presence where student_id='29999701'")).rows[0].display_name,'공부수달','saved nickname survives automation');
  await db.exec('set role service_role');
  const appearance=(await query('select study_cafe_bot_appearance() as result')).rows[0].result;
  assert(appearance.length>0);
  assert(!JSON.stringify(appearance).includes('balance'));
  await db.exec('reset role');
  // Day boundary and missed cron days are caught up without resetting balance.
  await session('29999705','2026-09-07T03:00:00+09:00',1800);
  await session('29999705','2026-09-07T04:00:00+09:00',1800);
  await query("delete from private.study_cafe_bot_settlements where student_id='29999705'");
  await query("select private.settle_study_cafe_bot('29999705','2026-09-07T05:00:00+09:00')");
  assert.equal((await query("select count(*)::int n from study_cafe_point_ledger where student_id='29999705' and source_key like 'bot-study:2026-09-0%'")).rows[0].n,2);
  await session('29999705','2026-09-08T08:00:00+09:00',3600);
  await session('29999705','2026-09-09T08:00:00+09:00',1800);
  await query("select private.settle_study_cafe_bot('29999705','2026-09-10T05:00:00+09:00')");
  const preserved=(await query("select balance from study_cafe_point_wallets where student_id='29999705'")).rows[0].balance;
  assert.equal(preserved,25);
  await query("select private.settle_study_cafe_bot('29999705','2026-09-10T05:00:00+09:00')");
  assert.equal((await query("select balance from study_cafe_point_wallets where student_id='29999705'")).rows[0].balance,preserved);
  const allBefore=(await query('select * from private.study_cafe_agents order by student_id')).rows;
  await db.exec(read('supabase/add-study-cafe-bot-admin.sql'));
  assert.deepEqual((await query('select * from private.study_cafe_agents order by student_id')).rows,allBefore,'reapplying migration never resets existing bots');
  await db.exec('set role anon');
  await assert.rejects(()=>rpc('list'),/permission denied/);
  await db.exec('reset role');
  console.log('Study cafe bot database tests passed: historical settlement, purchase atomicity, ownership, roles, settings and automation.');
})().finally(()=>db.close()).catch(error=>{console.error(error);process.exitCode=1;});
