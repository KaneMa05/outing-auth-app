// Opt-in test: disposable database on a loopback PostgreSQL server only.
const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs');
const connectionString=process.env.OX_NATIVE_TEST_URL;
test('committed revision visibility and concurrent saves preserve every change', {skip:!connectionString,timeout:30000},async()=>{
  const url=new URL(connectionString);assert.ok(['127.0.0.1','localhost','[::1]'].includes(url.hostname));
  const {Client}=require(process.env.OX_PG_MODULE||'../.tmp/ox-native-pg/node_modules/pg');
  const admin=new Client({connectionString}),clients=[],database='menu_revision_test_'+process.pid;let created=false;
  try{
    await admin.connect();await admin.query('create database '+database);created=true;url.pathname='/'+database;
    for(let i=0;i<3;i++){const client=new Client({connectionString:url.toString()});await client.connect();clients.push(client);}
    const [db,writer,reader]=clients;
    for(const role of ['anon','authenticated','service_role'])if(!(await db.query('select 1 from pg_roles where rolname=$1',[role])).rowCount)await db.query('create role '+role+(role==='service_role'?' bypassrls':''));
    const fixture=fs.readFileSync('tests/menu-read-optimization-db.test.cjs','utf8').match(/await db.exec\(`([\s\S]*?)`\);/)[1].replace(/create role [^;]+;/g,'');
    await db.query(fixture);
    for(const name of ['notices','track_options','exams','exam_sections','exam_answers','exam_files','exam_subject_settings','outings','outing_photos'])await db.query('create table public.'+name+'(id text primary key)');
    await db.query(fs.readFileSync('supabase/migrations/20261014074256_menu_read_revisions_and_cafe_summary.sql','utf8'));
    const revision=async client=>Number((await client.query("select revision from app_read_revisions where name='exams'")).rows[0].revision);
    await reader.query("set statement_timeout='500ms'");
    await writer.query("begin; insert into exams values('uncommitted')");
    assert.equal(await revision(reader),1,'uncommitted writes do not publish a new revision or block readers');
    assert.equal((await reader.query('select count(*) from exams')).rows[0].count,'0');
    await writer.query('commit');assert.equal(await revision(reader),2);
    await writer.query("begin; update exams set id='rolled-back'");
    assert.equal(await revision(reader),2);await writer.query('rollback');assert.equal(await revision(reader),2);
    await writer.query('begin; update exams set id=id');
    await reader.query("insert into exams values('other-student')");
    assert.equal(await revision(reader),3,'no-op save does not hold the revision row lock');await writer.query('commit');
    const started=performance.now();
    await Promise.all([writer,reader].map((client,i)=>(async()=>{for(let n=0;n<20;n++)await client.query('insert into exams values($1)',[i+'-'+n]);})()));
    assert.equal(await revision(db),43,'concurrent updates cannot lose an invalidation');
    console.log('40 concurrent commits completed in '+(performance.now()-started).toFixed(1)+'ms; readers did not wait for source transactions.');
  }finally{
    await Promise.allSettled(clients.map(client=>client.end()));
    if(created)await admin.query('drop database '+database+' with (force)');
    await admin.end();
  }
});
