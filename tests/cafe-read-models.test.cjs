const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require(process.env.PGLITE_MODULE || 'C:/Users/Public/Documents/ESTsoft/CreatorTemp/ox-db-tools/node_modules/@electric-sql/pglite');
const { createCafeReadModels, readCafePages } = require('../api/study-cafe-read-model');
const cafe = require('../api/study-cafe')._private;
const admin = require('../api/study-cafe-admin')._private;
const db = new PGlite();
const now = new Date('2026-10-14T07:00:00.500Z');
const range = cafe.normalizeStatsRange('2026-10-01', '2026-10-14');
let calls = [], transferred = 0, emptyPreflight = false;
const q = (sql, args = []) => db.query(sql, args);
const originalFetch = global.fetch;
const env = { ...process.env };
const migration = fs.readFileSync('supabase/migrations/20261014082858_cafe_period_read_models.sql', 'utf8');
function clean(value) {
  return JSON.parse(JSON.stringify(value, (_, item) => item instanceof Date ? item.toISOString() : item));
}
function canonicalTimes(value) {
  return JSON.parse(JSON.stringify(value, (_, item) => typeof item === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(item) ? new Date(item).toISOString() : item));
}
(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create table students(id text primary key,name text,student_category text,is_active bool,account_type text,class_name text,phone text);
    create table study_cafe_sessions(id text primary key,student_id text,subject_name text,status text,elapsed_seconds int,started_at timestamptz,active_started_at timestamptz,ended_at timestamptz,updated_at timestamptz);
    create index session_date on study_cafe_sessions(started_at);
    create index session_student_date on study_cafe_sessions(student_id,started_at);
    create table study_cafe_profiles(student_id text primary key,nickname text,avatar_tone text,hair_style text);
    create table study_cafe_presence(student_id text primary key,display_name text);
    create table study_cafe_shop_items(id text primary key,name text,description text,slot text,icon text,price int,sort_order int,is_active bool);
    create table study_cafe_inventory(student_id text,item_id text,purchased_at timestamptz);
    create table study_cafe_equipment(student_id text,slot text,item_id text,equipped_at timestamptz);
    create table study_cafe_point_ledger(id text,student_id text,source_type text,amount int,balance_after int,item_id text,description text,created_at timestamptz);
    create table lecture_applications(approved_student_id text,phone text,status text,created_at timestamptz,id text);
    insert into students values ('20001','First','lecture',true,'student','','010'),('20002','Second','online_managed',true,'student','',''),('20003','Inactive','lecture',false,'student','',''),('bot','Bot','lecture',true,'teacher','스터디카페 운영계정','');
    insert into study_cafe_profiles values ('20001','First','blue','default'),('20002','Second','mint','default');
    insert into study_cafe_presence values ('20002','Second');
    insert into study_cafe_sessions select 'bulk-'||lpad(i::text,5,'0'), '20001', 'Law', 'completed', 60, '2026-10-10T00:00:00Z'::timestamptz + i*interval '1 second', null, '2026-10-10T02:00:00Z', '2026-10-10T02:00:00Z' from generate_series(1,2401) i;
    insert into study_cafe_sessions values
      ('running','20001',' Law ','running',60,'2026-10-14T00:00:00Z','2026-10-14T06:00:00Z',null,'2026-10-14T06:00:00Z'),
      ('before-boundary','20001','Math','completed',33,'2026-10-13T18:59:59Z',null,'2026-10-13T19:00:00Z','2026-10-13T19:00:00Z'),
      ('at-boundary','20001','Math','paused',45,'2026-10-13T19:00:00Z',null,null,'2026-10-14T01:00:00Z'),
      ('future-active','20002','Law','running',20,'2026-10-14T00:00:00Z','2026-10-14T08:00:00Z',null,'2026-10-14T01:00:00Z'),
      ('inactive','20003','Law','completed',100,'2026-10-12T00:00:00Z',null,'2026-10-12T01:00:00Z','2026-10-12T01:00:00Z'),
      ('zero','bot','Law','completed',0,'2026-10-12T00:00:00Z',null,'2026-10-12T01:00:00Z','2026-10-12T01:00:00Z');
    insert into study_cafe_shop_items values ('chair','Chair','','chair','x',10,1,true),('hidden','Hidden','','head','x',10,2,false);
    insert into study_cafe_inventory values ('20001','chair',now()),('20002','hidden',now());
    insert into study_cafe_equipment values ('20001','chair','chair',now()),('20002','head','hidden',now());
    insert into study_cafe_point_ledger select i::text,'20001','time',1,i,null,'Study','2026-10-14T00:00:00Z'::timestamptz + i*interval '1 second' from generate_series(1,35) i;
    alter table students add column track text;
    alter table study_cafe_presence add column last_heartbeat_at timestamptz, add column seat_number int, add column status text, add column updated_at timestamptz;
    grant usage on schema public to service_role; grant select on all tables in schema public to service_role;`);
  await db.exec(migration);
  process.env.SUPABASE_URL = 'https://read-model-test.invalid'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'fixture';
  global.fetch = async (url, options = {}) => {
    const u = new URL(url); assert.equal(u.hostname, 'read-model-test.invalid');
    const table = u.pathname.split('/').at(-1); calls.push(table);
    let result;
    if (table === 'validate_student_device') result = {valid:true};
    else if (emptyPreflight && table === 'study_cafe_sessions' && u.searchParams.has('status')) result=[];
    else if (table === 'award_study_cafe_time_points') result = { balance: 35, earnedToday: 35, totalStudySeconds: 63000 };
    else if (u.pathname.includes('/rpc/')) {
      const args = JSON.parse(options.body);
      const keys = Object.keys(args); assert.match(table, /^get_study_cafe_/);
      result = (await q(`select public.${table}(${keys.map((key,i) => `${key} => $${i+1}`).join(',')}) as value`, Object.values(args))).rows[0].value;
    } else {
      assert.ok(['study_cafe_sessions','study_cafe_profiles','study_cafe_presence','students','study_cafe_shop_items','study_cafe_inventory','study_cafe_equipment','study_cafe_point_ledger','lecture_applications'].includes(table));
      const args=[], where=[];
      for (const [key, value] of u.searchParams) {
        if (['select','order','offset','limit'].includes(key)) continue;
        assert.match(key,/^[a-z_]+$/);
        if (value === 'not.is.null') { where.push(`${key} is not null`); continue; }
        if (value.startsWith('in.(')) { args.push(value.slice(4,-1).split(',')); where.push(`${key} = any($${args.length})`); continue; }
        const [op,...rest]=value.split('.'); const symbol={eq:'=',gte:'>=',lt:'<'}[op]; assert.ok(symbol,value);
        args.push(rest.join('.')); where.push(`${key} ${symbol} $${args.length}`);
      }
      const order=(u.searchParams.get('order')||'').split(',').filter(Boolean).map(item=>item.replace(/\.(asc|desc)$/, ' $1')).join(',');
      const headerRange=options.headers?.Range?.split('-').map(Number);
      const limit=Number(u.searchParams.get('limit') || (headerRange ? headerRange[1]-headerRange[0]+1 : 1000));
      const offset=Number(u.searchParams.get('offset') || headerRange?.[0] || 0);
      const sql=`select ${u.searchParams.get('select') || '*'} from ${table}${where.length?' where '+where.join(' and '):''}${order?' order by '+order:''} limit ${limit} offset ${offset}`;
      result=clean((await q(sql,args)).rows);
    }
    transferred+=Buffer.byteLength(JSON.stringify(result));
    return {ok:true,status:200,json:async()=>result,text:async()=>JSON.stringify(result)};
  };
  process.env.STUDY_CAFE_READ_MODELS_ENABLED='false';
  calls=[];transferred=0;
  const oldStats=await cafe.loadStudyStats('20001',range,now); const oldStatsBytes=transferred;
  assert.equal(oldStats.summary.sessionCount,2404);
  const oldRanking=await cafe.loadStudyRanking('20001','monthly',now);
  const oldShop=await cafe.loadStudyCafeShop('20001',now);
  const adminRange={...range,startDate:'2026-10-01',endDate:'2026-10-14'};
  const oldAdmin=await admin.loadStudyHistory(adminRange,now);
  process.env.STUDY_CAFE_READ_MODELS_ENABLED='true';
  calls=[];transferred=0;
  assert.deepEqual(await cafe.loadStudyStats('20001',range,now),oldStats);
  const newStatsBytes=transferred; assert.deepEqual(calls,['get_study_cafe_student_stats']);
  calls=[];
  assert.deepEqual(await cafe.loadStudyRanking('20001','monthly',now),oldRanking);
  assert.deepEqual(calls,['get_study_cafe_period_totals']);
  calls=[];
  assert.deepEqual(canonicalTimes(await cafe.loadStudyCafeShop('20001',now)),canonicalTimes(oldShop));
  assert.deepEqual(calls,['award_study_cafe_time_points','get_study_cafe_shop_read_model']);
  assert.deepEqual(await admin.loadStudyHistory(adminRange,now),oldAdmin);
  emptyPreflight=true;
  for(const [action,expectedRequests] of [['ranking',5],['shop_load',6]]) {
    calls=[];const res={setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;}};
    await require('../api/study-cafe')({method:'POST',body:{action,studentId:'20001',deviceToken:'fixture',period:'monthly'}},res);
    assert.equal(res.code,200,JSON.stringify(res.body));assert.equal(calls.length,expectedRequests,action);
  }
  emptyPreflight=false;
  const absent=await cafe.loadStudyStats('absent',range,now); assert.equal(absent.summary.sessionCount,0);
  assert.equal(absent.days.length,14);
  assert.equal(oldStats.days.find(d=>d.date==='2026-10-13').totalSeconds,33);
  assert.equal(oldStats.days.find(d=>d.date==='2026-10-14').totalSeconds,3705);
  await assert.rejects(q('select get_study_cafe_period_totals($1,$2,$3)',['2020-01-01','2026-01-01',now]), /invalid_study_period/);
  for (const role of ['anon','authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(q('select get_study_cafe_shop_read_model($1)',['20001']),/permission denied/);
    await assert.rejects(q('select get_study_cafe_student_stats($1,$2,$3,$4)',['20001',range.start,range.end,now]),/permission denied/);
    await assert.rejects(q('select get_study_cafe_period_totals($1,$2,$3)',[range.start,range.end,now]),/permission denied/);
    await db.exec('reset role');
  }
  await db.exec('set role service_role');
  const shop=(await q('select get_study_cafe_shop_read_model($1) as data',['20001'])).rows[0].data;
  assert.equal(shop.inventory.length,1); assert.equal(shop.history.length,30); assert.equal(shop.items.length,1);
  await db.exec('reset role');
  let probes=0;
  const missing=createCafeReadModels(async()=>{probes++;throw Object.assign(new Error('missing'),{storeStatus:404,detail:'{"code":"PGRST202"}'});});
  assert.equal(await missing('f',{},['rows']),null);assert.equal(await missing('f',{},['rows']),null);assert.equal(probes,1);
  const broken=createCafeReadModels(async()=>{throw Object.assign(new Error('timeout'),{storeStatus:500,detail:'{"code":"57014"}'});});
  await assert.rejects(broken('f',{},['rows']),/timeout/);
  const malformed=createCafeReadModels(async()=>({}));await assert.rejects(malformed('f',{},['rows']),/invalid_response/);
  let smallPageRequests=0;
  const allPages=await readCafePages(async(_,path)=>{
    smallPageRequests++;const offset=Number(new URL('https://fixture/'+path).searchParams.get('offset'));
    const page=Array.from({length:Math.min(100,Math.max(0,203-offset))},(_,i)=>offset+i);
    Object.defineProperty(page,'nextPageOffset',{value:offset+page.length});return page;
  },'rows?order=id.asc');
  assert.equal(allPages.length,203);assert.equal(smallPageRequests,4);
  await db.exec('analyze study_cafe_sessions');
  const plan=(await q('explain (analyze, buffers, format json) select student_id,sum(elapsed_seconds) from study_cafe_sessions where started_at >= $1 and started_at < $2 group by student_id',[range.start,range.end])).rows;
  const nodes=[]; const visit=node=>{nodes.push(node);(node.Plans||[]).forEach(visit);}; visit(plan[0]['QUERY PLAN'][0].Plan);
  assert.ok(nodes.every(node => !node['Disk Usage'] && !node['Temp Written Blocks']), 'aggregation must not spill in this fixture');
  console.log(JSON.stringify({sessions:2404,oldStatsBytes,newStatsBytes,reductionPercent:Math.round((1-newStatsBytes/oldStatsBytes)*10000)/100,results:'stats, ranking, shop, admin summary equivalent; permissions, boundary, missing RPC and timeout passed'}));
  await db.exec(fs.readFileSync('supabase/rollback/20261014_cafe_period_read_models.sql','utf8'));
  assert.equal((await q('select count(*)::int as n from study_cafe_sessions')).rows[0].n,2407);
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  global.fetch=originalFetch;
  for(const key of ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','STUDY_CAFE_READ_MODELS_ENABLED']) if(env[key]===undefined)delete process.env[key];else process.env[key]=env[key];
  await db.close();
});
