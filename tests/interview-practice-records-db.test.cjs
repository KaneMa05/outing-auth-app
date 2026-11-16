'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID}=require('node:crypto');
const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
(async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema storage;
   create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   create table public.students(id text primary key,name text,is_active boolean default true,account_type text default 'student');
   create table public.ip_owners(id text primary key,legacy_student_id text references students(id),name text,active boolean default true);
   create view public.ip_student_directory with(security_invoker=true) as select id,name,is_active,account_type from students union all select id,name,active,'student'::text from ip_owners where legacy_student_id is null;
   create table public.ip_members(student_id text primary key,exam_number text,enabled boolean,expires_on date);
   insert into students(id,name) values('a','학생 가'),('b','학생 나');
   insert into ip_owners values('a','a','학생 가',true),('b','b','학생 나',true),('iw_web',null,'카카오 신규 학생',true);
   insert into ip_members values('a','A-1',true,current_date+30),('b','B-1',true,current_date+30),('iw_web','W-1',true,null);
   grant select on students,ip_owners,ip_student_directory,ip_members to service_role;`);
  const migration=fs.readdirSync('supabase/migrations').find(f=>f.endsWith('_interview_practice_admin_records.sql'));
  await db.exec(fs.readFileSync('supabase/migrations/'+migration,'utf8'));
  const invoke=async(action,actor,body={})=>(await db.query('select ip_practice_service($1,$2::jsonb,$3::jsonb) result',[action,JSON.stringify(actor),JSON.stringify(body)])).rows[0].result;
  const a={type:'student',id:'a'},b={type:'student',id:'b'},admin={type:'admin',id:'admin'},id=randomUUID(),hash='a'.repeat(64);
  const body={runId:id,mode:'job',track:'공채',fieldId:'law',fieldLabel:'법규',region:'서해',recordedAt:new Date().toISOString(),questionCount:2,finished:false,completed:false,
   turns:[{number:1,questionId:'q',question:'첫 질문',answer:'',duration:1,audioBytes:32044,audioHash:hash},{number:2,questionId:'q2',question:'다음 질문',answer:'',duration:2,audioBytes:64044,audioHash:'b'.repeat(64)}]};
  await db.exec('set role service_role');
  let r=await invoke('sync',a,body);assert.equal(r.turns.length,2);assert.equal(r.turns[0].uploaded,false);
  await invoke('sync',a,body);assert.equal((await db.query('select count(*) n from ip_practice_turns')).rows[0].n,2);
  await assert.rejects(invoke('sync',b,body),/not_found/);
  await assert.rejects(invoke('get',b,{runId:id}),/not_found/);
  await assert.rejects(invoke('admin_list',a,{}),/forbidden/);
  await assert.rejects(invoke('sync',a,{...body,turns:[{...body.turns[0],audioHash:'c'.repeat(64)}]}),/idempotency_conflict/);
  await invoke('uploaded',a,{runId:id,number:1,audioHash:hash});
  await invoke('sync',a,{...body,completed:true,finished:true});await invoke('sync',a,body);
  r=await invoke('admin_get',admin,{runId:id});assert.equal(r.run.completed,true);assert.equal(r.run.finished,true);assert.equal(r.turns[0].uploaded,true);
  r=await invoke('admin_list',admin,{search:'학생 가',mode:'job',page:0});assert.equal(r.runs.length,1);assert.equal(r.runs[0].answer_count,2);assert.equal(r.runs[0].uploaded_count,1);assert.equal(r.runs[0].answer_seconds,3);
  assert.equal((await invoke('admin_list',admin,{search:'학생 나'})).runs.length,0);
  assert.equal((await invoke('admin_list',admin,{mode:'personality'})).runs.length,0);
  const webId=randomUUID();
  await invoke('sync',{type:'student',id:'iw_web'},{...body,runId:webId});
  assert.equal((await invoke('admin_list',admin,{search:'카카오 신규'})).runs.length,1);
  await db.exec('reset role;set role authenticated');
  await assert.rejects(db.query('select * from ip_practice_runs'),/permission denied/);
  await assert.rejects(invoke('admin_list',admin,{}),/permission denied/);
  await db.exec('reset role');
  assert.equal((await db.query("select public from storage.buckets where id='interview-practice'")).rows[0].public,false);
  assert.equal((await db.query("select count(*) n from pg_class where relname in ('ip_practice_runs','ip_practice_turns') and relrowsecurity")).rows[0].n,2);
  console.log('PASS practice archive SQL: identity isolation, idempotency, immutable audio, monotone completion, admin filters/counts, Kakao-only owners, private bucket and service-only RLS');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
