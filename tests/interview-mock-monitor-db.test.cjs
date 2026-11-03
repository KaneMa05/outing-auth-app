'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID}=require('node:crypto');
const {fixture}=require('./helpers/interview-mock-cli-fixture.cjs'),{analyzeTask}=require('../lib/interview-mock-analysis.cjs'),{completion}=require('../lib/interview-mock-cli-queue.cjs');
const worker={type:'worker',id:'monitor-test'};
async function setup(t){const f=await fixture();t.after(()=>f.db.close());await f.db.exec(fs.readFileSync('supabase/migrations/20261103062648_interview_mock_operations_monitor.sql','utf8'));f.snapshot=async()=>(await f.db.query('select ip_mock_operations_snapshot() s')).rows[0].s;return f;}
test('snapshot sees completed PC work and expired leases without mutating jobs or student records',async t=>{
 const f=await setup(t);const submitted=await f.submit('personality');assert.equal(submitted.status,200,JSON.stringify(submitted));const {jobs:[job]}=await f.queue.invoke('poll',worker,{kinds:['personality']});
 const report=await analyzeTask({kind:'personality',audio:f.files.get(job.runId),question:job.snapshot.question},{models:f.models,infer:f.infer,transcribe:async()=>f.personality.transcript});
 await f.queue.invoke('complete',worker,{id:job.id,lease:job.lease,report:completion(job,report)});
 let s=await f.snapshot();assert.equal(s.cli.stats.personality.completed24h,1);assert.equal(s.api.personality.completed24h,0);assert.ok(s.cli.stats.personality.lastCompletedAt);assert.equal(s.questions.personality,1);
 const second=await f.submit('job');assert.equal(second.status,200,JSON.stringify(second));const {jobs:[active]}=await f.queue.invoke('poll',worker,{kinds:['job']});
 await f.db.query("update ip_mock_cli_jobs set lease_until=now()-interval '1 second' where id=$1",[active.id]);
 const records=async()=>({jobs:(await f.db.query('select * from ip_mock_cli_jobs order by id')).rows,attempts:(await f.db.query('select * from ip_job_exam_attempts order by id')).rows,presence:(await f.db.query('select * from ip_mock_cli_presence')).rows});
 const before=await records();s=await f.snapshot();await f.snapshot();assert.deepEqual(await records(),before);assert.equal(s.cli.stats.job.stalled,1);assert.equal(s.cli.stats.job.attention,1);assert.equal(s.cli.stats.job.running,0);assert.equal(before.jobs.find(j=>j.id===active.id).state,'running');
 assert.doesNotMatch(JSON.stringify(s),/student_id|ip-a|transcript|snapshot|audio_hash|lease_until|question_id/);
 const columns=(await f.db.query("select column_name from information_schema.columns where table_name='ip_mock_operation_events' order by ordinal_position")).rows.map(r=>r.column_name);assert.deepEqual(columns,['id','kind','transport','event','created_at']);
});
test('events distinguish API work, intentional live interruptions and missing recordings',async t=>{
 const f=await setup(t),job=await f.submit('job');assert.equal(job.status,200);
 // This source has a queue: its completion must count as PC, exactly once.
 await f.db.query("update ip_job_exam_attempts set state='completed',report='{\"suggestion\":null,\"status\":\"review_required\",\"grade\":null,\"score\":null}' where id=$1",[job.data.run.id]);
 await f.db.query("update ip_job_exam_attempts set state='completed' where id=$1",[job.data.run.id]);
 const id=randomUUID();await f.db.query("insert into ip_live_runs(id,student_id,request_key,state,questions,retain_until) values($1,'ip-a',$2,'active','[]',now()+interval '30 days')",[id,randomUUID()]);
 await f.db.query("update ip_live_runs set state='interrupted',recording_state='ready' where id=$1",[id]);let s=await f.snapshot();assert.equal(s.live.interrupted,1);assert.equal(s.live.failed24h,0);
 await f.db.query("update ip_live_runs set recording_state='missing' where id=$1",[id]);s=await f.snapshot();assert.equal(s.live.attention,1);assert.equal(s.live.failed24h,1);assert.equal(s.cli.stats.job.completed24h,1);
 // Remove only the fictional job's queue to exercise the existing API transport.
 await f.db.query('delete from ip_mock_cli_jobs where run_id=$1',[job.data.run.id]);await f.db.query("update ip_job_exam_attempts set state='unknown' where id=$1",[job.data.run.id]);s=await f.snapshot();assert.equal(s.api.job.failed24h,1);assert.equal(s.api.job.untrackedUnknown,1);
 await f.db.query("update ip_live_runs set state='completed',recording_state='ready' where id=$1",[id]);s=await f.snapshot();assert.equal(s.live.completed24h,1);assert.ok(s.live.lastCompletedAt);
});
test('fresh worker health cannot be overwritten by an older report; no public monitoring access',async t=>{
 const f=await setup(t);assert.equal((await f.snapshot()).access.enabled,true);await f.db.exec('update ip_settings set enabled=false');assert.equal((await f.snapshot()).access.enabled,false);await f.queue.invoke('heartbeat',worker,{});
 const time=(await f.db.query('select now() n')).rows[0].n,health={checkedAt:new Date(time).toISOString(),cliReady:true,transcriptionConfigured:false,verificationConfigured:true,analysisConfigured:true,blockedReason:''};
 const report=h=>f.db.query('select ip_mock_cli_report_health($1::jsonb)',[JSON.stringify(h)]);
 await report(health);await report({...health,cliReady:false});await report({...health,checkedAt:new Date(new Date(time).getTime()-10000).toISOString(),cliReady:false});assert.equal((await f.snapshot()).cli.health.cliReady,true);
 for(const h of [{...health,secret:'bad'},{...health,cliReady:'true'},{...health,checkedAt:'2000-01-01T00:00:00Z'},{...health,blockedReason:'secret error'}])await assert.rejects(report(h));
 for(const role of ['anon','authenticated']){await f.db.exec('set role '+role);await assert.rejects(f.snapshot(),/permission denied/);await assert.rejects(report(health),/permission denied/);await assert.rejects(f.db.query('select * from ip_mock_operation_events'),/permission denied/);await f.db.exec('reset role');}
 await f.db.exec('set role service_role');assert.equal((await f.snapshot()).cli.health.cliReady,true);await f.db.exec('reset role');
});
