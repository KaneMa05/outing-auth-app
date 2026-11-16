'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID}=require('node:crypto');
const {fixture}=require('./helpers/interview-mock-cli-fixture.cjs');
const {createHandler}=require('../api/interview-practice-cli');
const {analyzeTask}=require('../lib/interview-mock-analysis.cjs');
const {completion,createQueue}=require('../lib/interview-mock-cli-queue.cjs');
const {wav}=require('./interview-exam.test.cjs');
async function setup(t){
 const f=await fixture();t.after(()=>f.db.close());
 for(const file of ['20261103062648_interview_mock_operations_monitor.sql','20261104053835_iphone_practice_cli.sql','20261104060123_iphone_practice_unlimited_retention.sql'])await f.db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
 let account='ip-a';
 const d={enabled:true,authenticate:async()=>({id:account}),requireAccess:f.deps('job').requireMockAccess,invoke:f.rpc('ip_practice_cli_service'),storage:f.deps('job').storage};
 return {...f,d,handler:createHandler(d),account:id=>account=id,callHandler:(handler,body,headers)=>f.callHandler(handler,{accountId:account,...body},headers),body:()=>({action:'submit',id:randomUUID(),mode:'job',questionId:f.detail.question.id,questionPrompt:f.detail.question.prompt,audioBase64:wav().toString('base64')})};
}
test('native practice uploads once, Windows worker completes, owner can reread and other accounts cannot',async t=>{
 const f=await setup(t),body=f.body();
 assert.equal((await f.callHandler(f.handler,body)).status,200);
 assert.equal((await f.callHandler(f.handler,body)).status,200);
 assert.equal(f.files.size,1);
 assert.equal((await f.callHandler(f.handler,{...body,questionPrompt:'바뀐 질문'})).status,409);
 const worker={type:'worker',id:'test'}, {jobs:[job]}=await f.queue.invoke('poll',worker,{kinds:['practice']});assert.equal(job.kind,'practice');
 const report=await analyzeTask({kind:'practice',question:job.snapshot.question,audio:f.files.get(body.id)},{models:f.models,infer:f.infer,transcribe:async()=>f.personality.transcript});
 const tampered=structuredClone(report);tampered.analysis.strengths[0].quote='만들어낸 답변';assert.throws(()=>completion(job,tampered),/invalid_evidence/);
 await f.queue.invoke('complete',worker,{id:job.id,lease:job.lease,report:completion(job,report)});
 const get={action:'get',id:body.id},saved=await f.callHandler(f.handler,get);
 assert.equal(saved.data.state,'completed');assert.equal(saved.data.report.grade,null);assert.equal(saved.data.report.audit,undefined);
 f.account('ip-b');assert.equal((await f.callHandler(f.handler,get)).status,404);
 f.account('ip-a');await f.db.exec('update ip_members set mock_test_enabled=false');assert.equal((await f.callHandler(f.handler,get)).status,403);
 for(const role of ['anon','authenticated']){await f.db.exec('set role '+role);await assert.rejects(f.db.query('select * from ip_practice_cli_audio_gc'),/permission denied/);await assert.rejects(f.d.invoke('get',{type:'student',id:'ip-a'},{id:body.id}),/permission denied/);await f.db.exec('reset role');}
});
test('readiness requires fresh real STT health; unpublished questions and malformed or foreign-origin submissions fail',async t=>{
 const f=await setup(t),body=f.body();
 assert.equal((await f.callHandler(f.handler,{action:'status'})).data.ready,false);
 await f.queue.invoke('heartbeat',{type:'worker',id:'test'},{});
 const health={checkedAt:new Date().toISOString(),cliReady:true,transcriptionConfigured:true,verificationConfigured:false,analysisConfigured:true,blockedReason:''};
 await f.db.query('select ip_mock_cli_report_health($1::jsonb)',[JSON.stringify(health)]);
 assert.equal((await f.callHandler(f.handler,{action:'status'})).data.ready,true);
 await f.db.exec("update ip_mock_cli_presence set health_checked_at=now()-interval '3 minutes'");
 assert.equal((await f.callHandler(f.handler,{action:'status'})).data.ready,false);
 assert.equal((await f.callHandler(f.handler,body,{origin:'https://evil.example'})).status,403);
 assert.equal((await f.callHandler(f.handler,{...body,accountId:'old-login'})).status,403);
 assert.equal((await f.callHandler(f.handler,{...body,audioBase64:'AAAA'})).status,400);
 await f.db.exec("update ip_questions set status='draft'");assert.equal((await f.callHandler(f.handler,body)).status,409);
});
test('expired practice audio is retained in GC until deletion succeeds; uncertain leases never execute twice',async t=>{
 const f=await setup(t),body=f.body();await f.callHandler(f.handler,body);
 const worker={type:'worker',id:'test'}, {jobs:[job]}=await f.queue.invoke('poll',worker,{kinds:['practice']});
 await f.db.query("update ip_mock_cli_jobs set lease_until=now()-interval '1 second' where id=$1",[job.id]);
 assert.equal((await f.callHandler(f.handler,{action:'get',id:body.id})).data.state,'unknown');
 assert.equal((await f.queue.invoke('poll',worker,{kinds:['practice']})).jobs.length,0);
 await f.db.query("update ip_mock_cli_jobs set retain_until=now()-interval '1 second' where id=$1",[job.id]);
 const invoke=f.rpc('ip_mock_cli_queue_service');
 await assert.rejects(createQueue({invoke,removePracticeAudio:async()=>{throw Error('offline');}}).purge(),/offline/);
 assert.equal((await f.db.query('select count(*)::int n from ip_practice_cli_audio_gc')).rows[0].n,1);
 await createQueue({invoke,removePracticeAudio:async id=>f.files.delete(id)}).purge();assert.equal(f.files.size,0);
 assert.equal((await f.db.query('select count(*)::int n from ip_practice_cli_audio_gc')).rows[0].n,0);
});
test('safe worker restart pauses new claims and waits for existing execution to finish',async t=>{
 const f=await setup(t),body=f.body();await f.callHandler(f.handler,body);
 const worker={type:'worker',id:'test'};
 assert.equal((await f.queue.invoke('pause',worker,{})).busy,false);
 assert.equal((await f.queue.invoke('poll',worker,{kinds:['practice']})).jobs.length,0);
 await f.queue.invoke('resume',worker,{});
 const {jobs:[job]}=await f.queue.invoke('poll',worker,{kinds:['practice']});assert.ok(job);
 assert.equal((await f.queue.invoke('pause',worker,{})).busy,true);
 await f.queue.invoke('fail',worker,{id:job.id,lease:job.lease});
 assert.equal((await f.queue.invoke('pause',worker,{})).busy,false);
 await f.queue.invoke('resume',worker,{});
 await f.db.exec('set role service_role');
 assert.equal((await f.d.invoke('get',{type:'student',id:'ip-a'},{id:body.id})).state,'failed');
 await f.db.exec('reset role');
});

test('approved enrollment without an end date can upload with bounded audio retention',async t=>{
 const f=await setup(t);await f.db.exec("update ip_members set expires_on=null where student_id='ip-a'");
 const body=f.body(),result=await f.callHandler(f.handler,body);assert.equal(result.status,200,JSON.stringify(result));
 const saved=(await f.db.query('select retain_until>now() as live,retain_until<now()+interval \'32 days\' as bounded from ip_mock_cli_jobs where id=$1',[body.id])).rows[0];
 assert.equal(saved.live,true);assert.equal(saved.bounded,true);
});
