'use strict';
const {test} = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), crypto = require('node:crypto');
const {PGlite} = require(process.env.PGLITE_MODULE || 'C:/Users/Public/Documents/ESTsoft/CreatorTemp/ox-db-tools/node_modules/@electric-sql/pglite');
test('Only an operator-configured review account can use unlimited devices; authentication and normal caps remain enforced', async () => {
  const db = new PGlite(), hash = s => crypto.createHash('sha256').update(s).digest('hex');
  const register = async (id, device, password = 'fixture-password') => (await db.query('select register_student_device($1,$2,$3) result', [id, password, hash(device)])).rows[0].result;
  try {
    await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create table students(id text primary key,name text default '학생',is_active boolean default true);insert into students(id) values('review'),('regular');");
    await db.exec(fs.readFileSync('tests/fixtures/ox-app-devices.sql', 'utf8'));
    await db.exec(fs.readFileSync('supabase/add-student-devices.sql', 'utf8').replace('create extension if not exists "pgcrypto";', ''));
    await register('regular', 'a'); await register('regular', 'b'); await register('review', 'a'); await register('review', 'b');
    await db.exec(fs.readFileSync('supabase/migrations/20261109053915_review_device_policy.sql', 'utf8'));
    assert.equal((await register('regular', 'c')).error, 'device_limit_reached');
    assert.equal((await register('review', 'c')).error, 'device_limit_reached', 'An empty policy changes no existing users');
    await db.exec("insert into student_review_device_limits values('review',5,now()+interval '30 days','App Review demo account');");
    assert.equal((await register('review', 'c', 'wrong')).error, 'password_mismatch');
    assert.equal((await register('review', 'c')).active_count, 3);
    assert.equal((await register('regular', 'c')).error, 'device_limit_reached');
    await db.exec("update students set is_active=false where id='review';");
    assert.equal((await register('review', 'd')).error, 'student_inactive');
    await db.exec("update students set is_active=true where id='review'; update student_review_device_limits set expires_at=now()-interval '1 second';");
    assert.equal((await register('review', 'd')).error, 'device_limit_reached');
    assert.equal((await register('review', 'a')).status, 'already_registered', 'Expiry never logs out already registered devices');
    await db.exec("update student_review_device_limits set max_devices=null,expires_at=null where student_id='review';");
    for(let i=0;i<105;i++)assert.equal((await register('review','unlimited-'+i)).status,'registered');
    assert.equal((await register('regular','still-third')).error,'device_limit_reached');
    assert.equal((await register('review','bad-password','wrong')).error,'password_mismatch');
    await db.exec("update students set is_active=false where id='review';");
    assert.equal((await register('review','inactive')).error,'student_inactive');
    for (const role of ['anon', 'authenticated']) {
      await db.exec('set role ' + role);
      await assert.rejects(db.query('select * from student_review_device_limits'), /permission denied/);
      await assert.rejects(db.exec("insert into student_review_device_limits values('regular',5,now()+interval '1 day','forged')"), /permission denied/);
      await db.exec('reset role');
    }
  } finally { await db.close(); }
});
