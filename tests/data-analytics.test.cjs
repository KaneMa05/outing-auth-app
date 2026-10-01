const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {PGlite}=require(process.env.OX_PGLITE_MODULE || 'C:/Users/Public/Documents/ESTsoft/CreatorTemp/ox-db-tools/node_modules/@electric-sql/pglite');
const {createHandler,_private:{validate,invokeLearning}}=require('../api/criminal-law-ox');
const auth=require('../api/teacher-auth-utils');
const migration='supabase/migrations/20261001140723_ox_usage_analytics.sql';

test('Analytics SQL: KST boundaries, unique users, zero days, inactive history and read-only access',async()=>{
  const db=new PGlite();
  try {
    await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create table students(id text primary key,account_type text default 'student',is_active boolean default true);grant select on students to service_role;insert into students values('a','student',true),('b','student',false),('t','teacher',true);");
    await db.exec(fs.readFileSync('supabase/migrations/20260917124608_criminal_law_ox.sql','utf8'));
    await db.exec("insert into ox_collections values('book','{}');insert into ox_chapters values('chapter','book','{}');insert into ox_questions(id,chapter_id,entry) values('q','chapter','{\"id\":\"q\",\"chapter_id\":\"chapter\",\"correct_answer\":\"O\",\"prompt\":\"fixture\"}');");
    const entries=[['a','2026-09-17T14:59:59Z'],['a','2026-09-17T15:00:00Z'],['a','2026-09-18T04:00:00Z'],['b','2026-09-18T14:59:59Z'],['t','2026-09-18T04:00:00Z'],['b','2026-09-19T15:00:00Z']];
    for (const [i,[id,date]] of entries.entries()) await db.query("insert into ox_attempts values($1,$2,'q',$3,'O',true,false,$4)",[id,`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`,i+1,date]);
    await db.exec(fs.readFileSync(migration,'utf8'));
    const call=(start='2026-09-17',end='2026-09-19',actor={type:'admin',id:'qa'})=>db.query('select ox_usage_analytics($1::jsonb,$2::date,$3::date) report',[JSON.stringify(actor),start,end]).then(r=>r.rows[0].report);
    await db.exec('set role service_role');
    const report=await call();
    assert.deepEqual(report.summary,{students:2,teachers:1,studentAttempts:4,teacherAttempts:1});
    assert.deepEqual(report.daily,[
      {date:'2026-09-19',students:0,teachers:0,studentAttempts:0,teacherAttempts:0},
      {date:'2026-09-18',students:2,teachers:1,studentAttempts:3,teacherAttempts:1},
      {date:'2026-09-17',students:1,teachers:0,studentAttempts:1,teacherAttempts:0},
    ]);
    assert.equal((await call('2026-09-20','2026-09-20')).summary.students,1,'End date includes the full KST day');
    const empty=await call('2026-09-19','2026-09-19');
    assert.equal(empty.summary.studentAttempts,0);assert.equal(empty.daily.length,1);
    await assert.rejects(call('2026-09-19','2026-09-18'),/invalid_request/);
    await assert.rejects(call(null,'2026-09-18'),/invalid_request/);
    await assert.rejects(call('2026-09-16','2026-09-18'),/invalid_request/);
    await assert.rejects(call('2026-09-17','9999-01-01'),/invalid_request/);
    await assert.rejects(call('2026-09-17','2026-09-18',{type:'student',id:'a'}),/forbidden/);
    await assert.rejects(call('2026-09-17','2026-09-18',{type:'admin'}),/forbidden/);
    for (const role of ['anon','authenticated']) {
      await db.exec('reset role;set role '+role);
      await assert.rejects(call(),/permission denied/);
    }
    await db.exec('reset role');
    assert.equal((await db.query('select count(*)::int n from ox_attempts')).rows[0].n,entries.length);
    const fn=(await db.query("select prosecdef,provolatile from pg_proc where oid='ox_usage_analytics(jsonb,date,date)'::regprocedure")).rows[0];
    assert.equal(fn.prosecdef,false);assert.equal(fn.provolatile,'s');
  } finally { await db.close(); }
});

test('Analytics API validates ranges and enforces separate analysis permission',async()=>{
  const body={action:'admin_analytics',startDate:'2026-09-17',endDate:'2026-09-20'};
  assert.doesNotThrow(()=>validate(body));
  for(const changes of [{startDate:'2026-09-31'},{startDate:null},{endDate:'2026-09-16'},{startDate:'2026-01-01'},{endDate:'9999-01-01'},{startDate:42},{endDate:'2026-9-20'}]) assert.throws(()=>validate({...body,...changes}),/invalid_request/);
  const previous=process.env.TEACHER_SESSION_SECRET;
  process.env.TEACHER_SESSION_SECRET='analytics-fixture-secret';
  try {
    const calls=[];
    const handler=createHandler({invoke:async(...args)=>{calls.push(args);return {ok:true};},authenticate:async()=>assert.fail('Admin analytics must not use student credentials')});
    async function request(account,override={}) {
      const cookie=account?auth.COOKIE_NAME+'='+auth.createSessionToken(process.env.TEACHER_SESSION_SECRET,{username:'qa',role:'teacher',permissions:[],...account}):'';
      const req={method:'POST',headers:{host:'local.test',origin:'http://local.test',cookie},body:{...body,actor:{type:'admin',id:'forged'},...override}};
      const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(value){this.data=value;}};
      await handler(req,res);return res;
    }
    assert.equal((await request(null)).code,401);
    assert.equal((await request({permissions:['criminal_ox.read']})).code,403);
    assert.equal((await request({role:'student_manager',permissions:['*']})).code,403);
    assert.equal(calls.length,0);
    const allowed=await request({permissions:['analytics.read']});
    assert.equal(allowed.code,200);assert.equal(allowed.headers['Cache-Control'],'no-store');
    assert.deepEqual(calls[0],['admin_analytics',{type:'admin',id:'qa'},{startDate:body.startDate,endDate:body.endDate}]);
    assert.equal((await request({role:'admin',permissions:['*']})).code,200);
    const rpc=[];
    await invokeLearning('admin_analytics',{type:'admin',id:'qa'},body,async(...args)=>rpc.push(args));
    assert.deepEqual(rpc[0],['POST','rpc/ox_usage_analytics',{p_actor:{type:'admin',id:'qa'},p_start:body.startDate,p_end:body.endDate}]);
  } finally {
    if(previous===undefined) delete process.env.TEACHER_SESSION_SECRET; else process.env.TEACHER_SESSION_SECRET=previous;
  }
});

test('Analytics navigation is limited to administrator shell and has an explicit permission',()=>{
  const teacher=fs.readFileSync('teacher.html','utf8'),student=fs.readFileSync('index.html','utf8'),shared=fs.readFileSync('shared.js','utf8');
  assert.match(teacher,/data-route="data-analytics"/);assert.match(teacher,/data-analytics-admin\.js/);
  assert.doesNotMatch(student,/data-analytics/);
  assert.match(shared,/"data-analytics": "analytics\.read"/);
});
