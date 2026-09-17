const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require(process.env.PGLITE_MODULE || '../.tmp/reward-test/node_modules/@electric-sql/pglite');
const db = new PGlite();
(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create table public.students(id text primary key); insert into students values ('18001');
    create table public.final_exam_scores(id text primary key, score int); insert into final_exam_scores values ('round-1-existing',90);`);
  await db.exec(fs.readFileSync('supabase/migrations/20260917025621_final_score_lecture_identities.sql', 'utf8'));
  for (const role of ['anon', 'authenticated']) {
    const result = await db.query(`select has_table_privilege($1,'public.final_score_identities','select') as can_read, has_table_privilege($1,'public.final_score_identities','insert') as can_write`, [role]);
    assert.deepEqual(result.rows[0], { can_read: false, can_write: false });
    await db.exec(`set role ${role}`);
    await assert.rejects(db.query('select * from public.final_score_identities'), /permission denied/);
    await db.exec('reset role');
  }
  const rls = await db.query("select relrowsecurity from pg_class where oid='public.final_score_identities'::regclass");
  assert.equal(rls.rows[0].relrowsecurity, true);
  await db.exec('set role service_role');
  await db.query("insert into final_score_identities(cohort,lecture_id_normalized,participant_id,student_id,created_by) values ('18','offline','18001','18001','admin'),('18','online','external-opaque',null,'admin')");
  await assert.rejects(db.query("insert into final_score_identities(cohort,lecture_id_normalized,participant_id,student_id,created_by) values ('18','other','18001','18001','admin')"), /duplicate key/);
  await assert.rejects(db.query("insert into final_score_identities(cohort,lecture_id_normalized,participant_id,created_by) values ('18','online','external-another','admin')"), /duplicate key/);
  assert.equal((await db.query('select count(*)::int as n from final_score_identities')).rows[0].n, 2);
  await db.exec('reset role');
  assert.deepEqual((await db.query('select * from final_exam_scores')).rows, [{ id: 'round-1-existing', score: 90 }]);
  await db.exec("delete from students where id='18001'");
  assert.equal((await db.query("select student_id from final_score_identities where lecture_id_normalized='offline'")).rows[0].student_id, null, 'identity mappings must not block existing student deletion');
  assert.equal((await db.query("select has_table_privilege('service_role','public.final_score_identities','update') as can_update")).rows[0].can_update, false);
  console.log('final score identity DB privacy and uniqueness tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.close());
