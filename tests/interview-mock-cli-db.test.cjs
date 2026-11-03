'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {fixture}=require('./helpers/interview-mock-cli-fixture.cjs');
const {analyzeTask}=require('../lib/interview-mock-analysis.cjs');
const {createHandler}=require('../api/interview-mock-worker');
const worker={type:'worker',id:'qa-worker'},student={type:'student',id:'ip-a'};
test('audio submission queues once; authorized worker completes and student rereads without AI',async t=>{
 const f=await fixture();t.after(()=>f.db.close());const submitted=await f.submit('job');assert.equal(submitted.status,200,JSON.stringify(submitted));assert.equal(submitted.data.processing.state,'queued');
 const run=submitted.data.run;
 const again=await f.callHandler(f.handlers.job,{action:'submit',id:run.id,audioBase64:f.files.get(run.id).toString('base64')});assert.equal(again.status,200);assert.equal((await f.db.query('select count(*)::int n from ip_mock_cli_jobs')).rows[0].n,1);
 const handler=createHandler({token:'x'.repeat(43),configured:true,queue:f.queue,storage:kind=>f.deps(kind).storage()});
 assert.equal((await f.callHandler(handler,{action:'poll'})).status,401);
 const auth={authorization:'Bearer '+'x'.repeat(43)},polled=await f.callHandler(handler,{action:'poll',kinds:['job']},auth);assert.equal(polled.status,200,JSON.stringify(polled));const job=polled.data.jobs[0];assert.ok(job.audioBase64);assert.equal(job.snapshot.student_id,undefined);
 assert.equal((await f.queue.invoke('poll',worker,{})).jobs.length,0);
 const report=await analyzeTask({kind:'job',audio:Buffer.from(job.audioBase64,'base64'),detail:job.snapshot.rubric_detail},{models:f.models,infer:f.infer,transcribe:async()=> 'VHF를 사용하고 위치 정보를 교환합니다.'});
 const complete=await f.callHandler(handler,{action:'complete',id:job.id,lease:job.lease,report},auth);assert.equal(complete.status,200,JSON.stringify(complete));
 assert.equal((await f.callHandler(handler,{action:'complete',id:job.id,lease:job.lease,report},auth)).status,200);
 const saved=await f.callHandler(f.handlers.job,{action:'get',id:run.id});assert.equal(saved.data.run.state,'completed');assert.equal(saved.data.run.report.suggestion.grade,'O');assert.equal(saved.data.run.report.audit,undefined);assert.equal(saved.data.run.report.grade,null);
 f.identity('ip-b');assert.equal((await f.callHandler(f.handlers.job,{action:'get',id:run.id})).status,404);
 for(const role of ['anon','authenticated']){await f.db.exec('set role '+role);await assert.rejects(f.db.query('select * from ip_mock_cli_jobs'),/permission denied/);await assert.rejects(f.queue.get('job',run.id,student),/permission denied/);await f.db.exec('reset role');}
});
test('expired leases are never requeued and revoked accounts cannot publish results',async t=>{
 const f=await fixture();t.after(()=>f.db.close());const submitted=await f.submit('personality'),runId=submitted.data.run.id;
 const {jobs:[job]}=await f.queue.invoke('poll',worker,{kinds:['personality']});assert.ok(job);
 await f.db.query("update ip_mock_cli_jobs set lease_until=now()-interval '1 second' where id=$1",[job.id]);assert.equal((await f.queue.invoke('poll',worker,{})).jobs.length,0);
 assert.equal((await f.queue.get('personality',runId,student)).state,'unknown');assert.equal((await f.callHandler(f.handlers.personality,{action:'get',id:runId})).data.run.state,'unknown');
 await assert.rejects(f.queue.invoke('complete',worker,{id:job.id,lease:job.lease,report:{grade:null,score:null}}),/lease_lost/);
 await f.db.exec('update ip_members set mock_test_enabled=false');assert.equal((await f.callHandler(f.handlers.personality,{action:'get',id:runId})).status,403);
});
test('summary queue is bound to completed owned live records and preserves factual report',async t=>{
 const f=await fixture();t.after(()=>f.db.close());const id=randomUUID();
 await f.db.query("insert into ip_live_runs(id,student_id,request_key,state,questions,turns,retain_until) values($1,'ip-a',$2,'completed','[]',$3::jsonb,now()+interval '30 days')",[id,randomUUID(),JSON.stringify([{question:f.personality.question.prompt,answer:f.personality.transcript,complete:true,kind:'initial'}])]);
 const old=(await f.db.query('select result_report from ip_live_runs where id=$1',[id])).rows[0].result_report;
 await assert.rejects(f.queue.enqueue('report',id,{type:'student',id:'ip-b'}),/not_found/);
 await f.queue.enqueue('report',id,student);const {jobs:[job]}=await f.queue.invoke('poll',worker,{kinds:['report']});
 const report=await analyzeTask({kind:'report',run:job.snapshot},{models:f.models,infer:f.infer});
 const {completion}=require('../lib/interview-mock-cli-queue.cjs');await f.queue.invoke('complete',worker,{id:job.id,lease:job.lease,report:completion({kind:'report',snapshot:job.snapshot},report)});
 const saved=await f.queue.get('report',id,student);assert.equal(saved.report.grade,null);assert.equal(saved.report.analysis.strengths.length,1);assert.equal(saved.report.audit,undefined);assert.deepEqual((await f.db.query('select result_report from ip_live_runs where id=$1',[id])).rows[0].result_report,old);
});

test('personality completion is revalidated and committed to the existing student record',async t=>{
 const f=await fixture();t.after(()=>f.db.close());const submitted=await f.submit('personality'),runId=submitted.data.run.id;
 const {jobs:[job]}=await f.queue.invoke('poll',worker,{kinds:['personality']});
 const report=await analyzeTask({kind:'personality',audio:f.files.get(runId),question:job.snapshot.question},{models:f.models,infer:f.infer,transcribe:async()=>f.personality.transcript});
 const handler=createHandler({token:'x'.repeat(43),configured:true,queue:f.queue,storage:kind=>f.deps(kind).storage()}),auth={authorization:'Bearer '+'x'.repeat(43)};
 const altered=structuredClone(report);altered.analysis.components[0].quote='학생이 하지 않은 말';assert.equal((await f.callHandler(handler,{action:'complete',id:job.id,lease:job.lease,report:altered},auth)).status,422);
 assert.equal((await f.callHandler(handler,{action:'complete',id:job.id,lease:job.lease,report},auth)).status,200);
 const saved=await f.callHandler(f.handlers.personality,{action:'get',id:runId});assert.equal(saved.data.run.state,'completed');assert.equal(saved.data.run.report.analysis.components.length,4);assert.equal(saved.data.run.report.audit,undefined);
});
