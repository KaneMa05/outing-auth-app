'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '..');
const APP = process.env.INTERVIEW_APP_ROOT || (fs.existsSync(path.join(ROOT, 'tests/helpers/interview-db.cjs'))
  ? ROOT : 'C:/Users/W11/Desktop/Coding/Codex_Project/outing-auth-app');
const sql = fs.readFileSync(path.join(ROOT, 'supabase/migrations/20261020063234_interview_ai_pipeline.sql'), 'utf8');
async function main() {
  process.chdir(APP);
  const {db, invoke: base} = await require(path.join(APP, 'tests/helpers/interview-db.cjs')).createDb();
  const admin = {type: 'admin', id: 'qa'}, student = id => ({type: 'student', id});
  const invoke = async (action, actor, body = {}) => (await db.query(
    'select ip_ai_service($1,$2::jsonb,$3::jsonb) result', [action, JSON.stringify(actor), JSON.stringify(body)])).rows[0].result;
  const token = 'a'.repeat(64), bundle = 'b'.repeat(64);
  const worker = async (action, body = {}, t = token) => (await db.query(
    'select ip_ai_worker_service($1,$2,$3::jsonb) result', [action, t, JSON.stringify(body)])).rows[0].result;
  const errors = [];
  const check = async (name, run) => { await run(); console.log('PASS', name); };
  try {
    await db.exec(sql);
    await db.exec(fs.readFileSync(path.join(APP,'supabase/migrations/20261020073140_interview_ai_readiness.sql'),'utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261021063447_interview_experience_year_age.sql','utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20261021065038_interview_life_satisfaction.sql','utf8'));
    await db.exec(fs.readFileSync(path.join(ROOT,'supabase/migrations/20261020074446_interview_ai_load_protection.sql'),'utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20261021071011_interview_experience_age_only.sql','utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20261021082149_interview_basic_fields_followup.sql','utf8'));
    // This legacy capacity test intentionally raises limits; defaults are tested separately.
    await invoke('admin_configure',admin,{maxPendingTotal:5000,requestsPerMinute:60});
    await base('admin_enabled', admin, {enabled: true});
    for (const id of ['ip-a', 'ip-b'])
      await base('admin_member_save', admin, {targetStudentId: id, track: '공채', examNumber: id, enabled: true});
    for (const id of ['ip-a','ip-b']) await require(path.join(APP,'tests/helpers/interview-ai-complete-source.cjs'))(base,id);
    const content = {background: '학생 본인의 기록', qualifications: [], affiliations: [], awards: [], none: ['qualifications','affiliations','awards'],
      experiences: [1, 2, 3].map(i => ({id: 'e' + i, year: '2024', age: '23', period: '시기' + i, title: '경험' + i,
        situation: '상황' + i, action: '직접 행동' + i, result: '실제 결과' + i, learning: '배움' + i}))};
    await db.query("insert into ip_life_profiles(student_id,content,status) values('ip-a',$1,'draft'),('ip-b',$2,'draft') on conflict(student_id) do update set content=excluded.content",
      [JSON.stringify(content), JSON.stringify({...content, background: '다른 학생의 비밀'})]);
    await invoke('admin_configure', admin, {bundleHash: bundle, enabled: true, dailyCallLimit: 10000});
    await invoke('admin_register_worker', admin, {label: 'test', tokenHash: token, studentIds: ['ip-a', 'ip-b']});
    await check('source isolation, no teacher feedback, no normal-save generation', async () => {
      const rows = await db.query("select ip_ai_sources('ip-a','self_intro') sources");
      const text = JSON.stringify(rows.rows[0].sources);
      assert(!text.includes('다른 학생의 비밀')); assert(!text.includes('feedback'));
      assert.equal((await db.query('select count(*) n from ip_ai_jobs')).rows[0].n, 0);
    });
    const prep = await invoke('prepare', student('ip-a'), {kind: 'self_intro'});
    assert.equal(prep.experienceCount, 3); assert(prep.ready);
    let request;
    await check('button idempotency and source revision conflict', async () => {
      const payload = {kind: 'self_intro', sourceHash: prep.sourceHash, requestKey: 'request-key-001'};
      request = await invoke('generate', student('ip-a'), payload);
      assert.equal((await invoke('generate', student('ip-a'), payload)).requestId, request.requestId);
      assert.equal((await invoke('generate', student('ip-a'), {...payload, requestKey: 'different-key'})).requestId, request.requestId);
      await assert.rejects(invoke('generate', student('ip-a'), {...payload, sourceHash: 'c'.repeat(64)}), /source_changed/);
      await assert.rejects(invoke('status', student('ip-b'), {requestId: request.requestId}), /not_found/);
    });
    const job = (await worker('claim', {bundleHash: bundle})).job;
    assert(job); const lease = {jobId: job.id, leaseEpoch: job.lease_epoch, leaseToken: job.lease_token};
    const executionId = crypto.randomUUID();
    const result = {schema_version: '1.0', status: 'ready', answer: '직접 행동1, 직접 행동2, 직접 행동3을 했습니다.',
      source_refs: [1, 2, 3].map(i => ({source_id: `life:experiences:e${i}:content`, quote: '직접 행동' + i, answer_excerpt: '직접 행동' + i})),
      experience_coverage: [1, 2, 3].map(i => ({experience_id: 'e' + i, answer_excerpt: '직접 행동' + i})), missing: []};
    await check('single lease, source validation, expiry fencing, immediate student result', async () => {
      assert.equal((await worker('claim', {bundleHash: bundle})).job, null);
      await assert.rejects(worker('renew', {...lease, leaseEpoch: 999}), /lease_lost/);
      await worker('execution_start', {...lease, executionId});
      await worker('execution_start', {...lease, executionId});
      await assert.rejects(worker('complete', {...lease, executionId, result: {...result, source_refs:
        [{source_id: 'other-student', quote: 'x', answer_excerpt: '직접 행동1'}]}}), /invalid_evidence/);
      await assert.rejects(worker('complete', {...lease, executionId, result: {...result, experience_coverage: result.experience_coverage.slice(0, 2)}}),
        /experience_required/);
      await worker('complete', {...lease, executionId, result});
      assert((await worker('complete', {...lease, executionId, result})).reused);
      await assert.rejects(worker('complete', {...lease, executionId, result: {...result, answer: result.answer + 'changed'}}), /idempotency_conflict/);
      const status = await invoke('status', student('ip-a'), {requestId: request.requestId});
      assert.equal(status.items[0].status, 'COMPLETED');
      assert.equal(status.items[0].result.answer, result.answer);
      assert.equal((await db.query('select count(*) n from ip_ai_executions')).rows[0].n, 1);
    });
    let coreRequest;
    await check('core30 exact set and batch partial completion', async () => {
      const ids = Array.from({length: 30}, (_, i) => `ai-q-${i}`);
      for (const id of ids) await db.query("insert into ip_questions(id,prompt,category,status) values($1,$2,'personality','published')", [id, '질문 ' + id]);
      await assert.rejects(invoke('admin_configure', admin, {coreQuestionIds: ids.slice(1)}), /invalid_core30/);
      await invoke('admin_configure', admin, {coreQuestionIds: ids});
      const p = await invoke('prepare', student('ip-a'), {kind: 'core30'});
      const r = await invoke('generate', student('ip-a'), {kind: 'core30', sourceHash: p.sourceHash, requestKey: 'core-request-001'});
      coreRequest = r.requestId;
      const status = await invoke('status', student('ip-a'), {requestId: r.requestId});
      assert.equal(status.items.length, 30);
      assert.equal(status.items[0].key, ids[0]);
      const j = (await worker('claim', {bundleHash: bundle})).job;
      const l = {jobId: j.id, leaseToken: j.lease_token, leaseEpoch: j.lease_epoch}, e = crypto.randomUUID();
      await worker('execution_start', {...l, executionId: e});
      await worker('complete', {...l, executionId: e, result: {
        schema_version: '1.0', status: 'needs_input', answer: '', source_refs: [], experience_coverage: [],
        missing: ['본인의 구체적인 경험을 입력해주세요.']}});
      const after = await invoke('status', student('ip-a'), {requestId: r.requestId});
      assert.equal(after.items.filter(x => x.status === 'NEEDS_INPUT').length, 1);
      assert.equal(after.items.filter(x => x.status === 'QUEUED').length, 29);
    });
    await check('uncertain dispatch is quarantined and blocks replay', async () => {
      const j = (await worker('claim', {bundleHash: bundle})).job;
      const l = {jobId: j.id, leaseToken: j.lease_token, leaseEpoch: j.lease_epoch}, e = crypto.randomUUID();
      await worker('execution_start', {...l, executionId: e});
      await db.query("update ip_ai_jobs set lease_expires_at=now()-interval '1 second' where id=$1", [j.id]);
      assert.equal((await worker('claim', {bundleHash: bundle})).reason, 'worker_busy');
      assert.equal((await worker('inspect', {jobId: j.id})).reason, 'dispatch_unknown');
      await assert.rejects(invoke('admin_retry_job', admin, {jobId: j.id}), /unsafe_retry/);
      await worker('recover', {...l, executionId: e});
      await worker('complete', {...l, executionId: e, result: {...result, experience_coverage: []}});
    });
    await check('retry only missing items with updated own evidence; completed answers retained', async () => {
      const before = await invoke('status', student('ip-a'), {requestId: coreRequest});
      const missing = before.items.find(x => x.status === 'NEEDS_INPUT');
      const complete = before.items.find(x => x.status === 'COMPLETED');
      let p = await invoke('prepare', student('ip-a'), {kind: 'core30'});
      const body = {requestId: coreRequest, itemKeys: [missing.key], sourceHash: p.sourceHash, requestKey: 'retry-item-key'};
      await assert.rejects(invoke('retry_items', student('ip-a'), body), /unsafe_retry/);
      await db.query("update ip_life_profiles set content=jsonb_set(content,'{background}',to_jsonb('추가로 입력한 본인 경험'::text)) where student_id='ip-a'");
      p = await invoke('prepare', student('ip-a'), {kind: 'core30'});
      body.sourceHash = p.sourceHash;
      await invoke('retry_items', student('ip-a'), body);
      assert((await invoke('retry_items', student('ip-a'), body)).reused);
      await assert.rejects(invoke('retry_items', student('ip-b'), body), /not_found/);
      await assert.rejects(invoke('retry_items', student('ip-a'),
        {...body, itemKeys: [complete.key], requestKey: 'retry-completed-key'}), /unsafe_retry/);
      const after = await invoke('status', student('ip-a'), {requestId: coreRequest});
      assert.equal(after.items.length, 30);
      assert.deepEqual(after.items.find(x => x.key === complete.key).result, complete.result);
      assert(after.items.find(x => x.key === complete.key).stale);
      assert(!after.items.find(x => x.key === missing.key).stale);
    });
    await check('operator-confirmed stop and old execution recovery after explicit retry', async () => {
      const j = (await worker('claim', {bundleHash: bundle})).job;
      const l = {jobId: j.id, leaseToken: j.lease_token, leaseEpoch: j.lease_epoch}, e = crypto.randomUUID();
      await worker('execution_start', {...l, executionId: e});
      await worker('report', {...l, reason: 'dispatch_unknown'});
      await assert.rejects(invoke('admin_resolve_unknown', admin, {jobId: j.id, executionId: e, confirmedStopped: false}), /unsafe_retry/);
      await invoke('admin_resolve_unknown', admin, {jobId: j.id, executionId: e, confirmedStopped: true});
      const p = await invoke('prepare', student('ip-a'), {kind: 'core30'});
      await invoke('retry_items', student('ip-a'), {requestId: coreRequest, itemKeys: [j.item_key],
        sourceHash: p.sourceHash, requestKey: 'resolved-retry-key'});
      assert.equal((await worker('inspect', {jobId: j.id, executionId: e})).status, 'CANCELED');
      await assert.rejects(worker('complete', {...l, executionId: e, result}), /forbidden|lease_lost/);
    });
    await check('disabled feature and worker scope prevent claiming', async () => {
      await base('admin_enabled', admin, {enabled: false});
      assert.equal((await worker('claim', {bundleHash: bundle})).reason, 'automation_disabled');
      await base('admin_enabled', admin, {enabled: true});
      await invoke('admin_register_worker', admin, {label: 'limited', tokenHash: 'c'.repeat(64), studentIds: ['ip-b']});
      assert.equal((await worker('claim', {bundleHash: bundle}, 'c'.repeat(64))).job, null);
      await assert.rejects(worker('claim', {bundleHash: 'd'.repeat(64)}), /bundle_mismatch/);
    });
    await check('50 synthetic students queue 1650 answers without model calls', async () => {
      for (let i = 0; i < 50; i++) {
        const id = `ai-load-${i}`;
        await db.query('insert into students(id,name) values($1,$2)', [id, `가상학생 ${i}`]);
        await base('admin_member_save', admin, {targetStudentId: id, track: '공채', examNumber: id, enabled: true});
        await require(path.join(APP,'tests/helpers/interview-ai-complete-source.cjs'))(base,id);
        await db.query("update ip_life_profiles set content=$2 where student_id=$1", [id, JSON.stringify(content)]);
        for (const kind of ['self_intro','motivation','public_service','core30']) {
          const p = await invoke('prepare', student(id), {kind});
          await invoke('generate', student(id), {kind, sourceHash: p.sourceHash, requestKey: `${id}-${kind}`});
        }
      }
      const n = (await db.query("select count(*) n from ip_ai_jobs j join ip_ai_requests r on r.id=j.request_id where r.student_id like 'ai-load-%'")).rows[0].n;
      assert.equal(n, 1650);
    });
    await check('RLS/grants and worker revocation', async () => {
      for (const role of ['anon', 'authenticated']) {
        await db.exec('set role ' + role);
        await assert.rejects(db.query('select * from ip_ai_requests'), /permission denied/);
        await assert.rejects(invoke('prepare', student('ip-a'), {kind: 'self_intro'}), /permission denied/);
        await db.exec('reset role');
      }
      const overview = await invoke('admin_overview', admin);
      await invoke('admin_revoke_worker', admin, {workerId: overview.workers[0].id});
      await assert.rejects(worker('claim', {bundleHash: bundle}), /unauthorized/);
    });
    console.log('PASS PostgreSQL integration suite');
  } finally {await db.close();}
}
main().catch(error => {console.error(error); process.exitCode = 1;});
