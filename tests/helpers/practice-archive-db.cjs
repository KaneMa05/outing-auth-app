'use strict';
const fs=require('node:fs');
async function createPracticeDb({afterArchive}={}){
 const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema storage;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table students(id text primary key,name text,is_active boolean default true,account_type text default 'student');
 create table ip_owners(id text primary key,legacy_student_id text references students(id),name text,active boolean default true);
 create view ip_student_directory with(security_invoker=true) as select id,name,is_active,account_type from students;
 create table ip_members(student_id text primary key,exam_number text,enabled boolean,expires_on date,mock_test_enabled boolean default true);
 insert into students(id,name) values('a','검수 학생'),('b','다른 학생');
 insert into ip_owners values('a','a','검수 학생',true),('b','b','다른 학생',true);
 insert into ip_members(student_id,exam_number,enabled,expires_on) values('a','A-1',true,null),('b','B-1',true,null);
 grant select on students,ip_owners,ip_student_directory,ip_members to service_role;`);
 const migration=suffix=>fs.readFileSync('supabase/migrations/'+fs.readdirSync('supabase/migrations').find(f=>f.endsWith(suffix)),'utf8');
 await db.exec(migration('_interview_practice_admin_records.sql'));
 if(afterArchive)await afterArchive(db);
 await db.exec(migration('_interview_practice_transcriptions.sql'));
 await db.exec(migration('_interview_practice_asr_presence.sql'));
 return db;
}
module.exports={createPracticeDb};
