'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require(process.env.PGLITE_MODULE || 'C:/Users/Public/Documents/ESTsoft/CreatorTemp/ox-db-tools/node_modules/@electric-sql/pglite');
(async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create table public.students(id text primary key,name text,is_active boolean default true,account_type text default 'student',password_hash text);
      grant select on public.students to service_role;
      insert into public.students(id,name,password_hash) values ('release-fixture','Existing learner','preserved');
      create schema storage;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
    const before = (await db.query('select * from public.students')).rows;
    const files = fs.readdirSync('supabase/migrations').filter(name => /^2026102\d+_interview_.*\.sql$/.test(name)).sort();
    assert.ok(files.length >= 28);
    for (const file of files) {
      try { await db.exec(fs.readFileSync('supabase/migrations/' + file, 'utf8')); }
      catch (error) { throw new Error(file + ': ' + error.message, { cause: error }); }
    }
    const seeds = ['interview-corpus.sql', 'interview-personality-analysis.sql', 'interview-core30.sql', 'interview-life-catalog.sql', 'interview-rubric-drafts.sql'];
    for (const file of seeds) {
      try { await db.exec(fs.readFileSync('supabase/seeds/' + file, 'utf8')); }
      catch (error) { throw new Error(file + ': ' + error.message, { cause: error }); }
    }
    const questions = (await db.query("select count(*)::int total, count(*) filter(where status='published')::int published from ip_questions")).rows[0];
    assert.ok(questions.total > 0);
    assert.equal(questions.published, 0, 'Import must not publish unreviewed questions');
    assert.deepEqual((await db.query('select * from public.students')).rows, before);
    const tables = (await db.query("select relname,relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and relname like 'ip\\_%' escape '\\' and relkind='r'")).rows;
    assert.ok(tables.length > 20);
    assert.ok(tables.every(table => table.relrowsecurity), 'Every interview table must enable RLS');
    const exposed = (await db.query("select routine_name,grantee from information_schema.routine_privileges where specific_schema='public' and routine_name like 'ip\\_%' escape '\\' and grantee in ('PUBLIC','anon','authenticated')")).rows;
    assert.deepEqual(exposed, [], 'Browser roles must not execute interview service RPCs');
    const mutablePaths = (await db.query("select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'ip\\_%' escape '\\' and not exists(select 1 from unnest(p.proconfig) c where c like 'search_path=%')")).rows;
    assert.deepEqual(mutablePaths, [], 'Interview functions must pin their search path');
    assert.equal((await db.query('select enabled from ip_settings')).rows[0].enabled, false);
    assert.equal((await db.query('select enabled from ip_pa_settings')).rows[0].enabled, false);
    const bucket = (await db.query("select * from storage.buckets where id='interview-live'")).rows[0];
    assert.equal(bucket.public, false);
    assert.deepEqual(bucket.allowed_mime_types, ['audio/wav']);
    assert.equal((await db.query('select count(*)::int n from ip_pa_rubrics')).rows[0].n, 25);
    console.log(`PASS ${files.length} interview migrations and ${seeds.length} seeds in deployment order; ${questions.total} draft questions, ${tables.length} RLS tables, private audio bucket, server-only RPCs, disabled gates, existing students preserved.`);
  } finally { await db.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
