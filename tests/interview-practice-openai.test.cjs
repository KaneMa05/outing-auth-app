'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID}=require('node:crypto');
const {fixture}=require('./helpers/interview-mock-cli-fixture.cjs');
const {createHandler,cleanup}=require('../api/interview-practice-openai');
const {wav}=require('./interview-exam.test.cjs');
const migration=fs.readdirSync('supabase/migrations').find(n=>n.endsWith('_interview_portal_practice_access.sql'));
async function setup(t){
 const f=await fixture();t.after(()=>f.db.close());
 for(const file of ['20261031052127_fix_mock_access_portal_accounts.sql','20261103062648_interview_mock_operations_monitor.sql','20261104053835_iphone_practice_cli.sql','20261104060123_iphone_practice_unlimited_retention.sql'])await f.db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
 await f.db.exec(fs.readFileSync('supabase/migrations/'+migration,'utf8'));
 // Reproduce production: published questions, only draft rubrics, portal-only owner.
 await f.db.exec("update ip_question_rubrics set status='draft';insert into ip_owners(id,name) values('iw_practice_test','가상 면접 전용 계정');insert into ip_members(student_id,track,exam_number,expires_on,mock_test_enabled) values('iw_practice_test','공채','portal-practice-test','2099-01-01',true);");
 let identity='iw_practice_test',enabled=true,uploads=0,providers=0,failUpload=false,failInference=false;
 const tasks=[],invoke=f.rpc('ip_openai_practice_service');
 const d={get enabled(){return enabled;},authenticate:async()=>({id:identity}),requireAccess:f.deps('job').requireMockAccess,invoke,
  storage:()=>({put:async(id,audio)=>{uploads++;if(failUpload)throw Error('recording_unavailable');f.files.set(id,audio);},remove:async id=>{if(failUpload)throw Error('offline');f.files.delete(id);}}),
  schedule:task=>tasks.push(task),provider:()=>{providers++;return {models:f.models,transcribe:async()=>f.personality.transcript,infer:async(...args)=>{if(failInference)throw Error('ambiguous paid response');return f.infer(...args);}};},secret:'s'.repeat(32)};
 const handler=createHandler(d),body=(mode='job')=>({action:'submit',accountId:identity,id:randomUUID(),mode,questionId:mode==='job'?f.detail.question.id:f.personality.question.id,questionPrompt:mode==='job'?f.detail.question.prompt:f.personality.question.prompt,audioBase64:wav().toString('base64')});
 return {...f,d,invoke,body,call:(b,headers)=>f.callHandler(handler,{accountId:identity,...b},headers),finish:()=>Promise.all(tasks),identity:id=>identity=id,enabled:v=>enabled=v,failUpload:v=>failUpload=v,failInference:v=>failInference=v,get providers(){return providers;},get uploads(){return uploads;}};
}
test('portal-only enrolled accounts practice published job/personality questions with draft rubrics and no grade',async t=>{
 const f=await setup(t);assert.equal((await f.call({action:'status'})).data.ready,true);
 for(const mode of ['job','personality']){
  const b=f.body(mode);assert.equal((await f.call(b)).status,200);await f.finish();
  const saved=await f.call({action:'get',id:b.id});assert.equal(saved.data.state,'completed');
  assert.equal(saved.data.report.status,'practice_feedback');assert.equal(saved.data.report.grade,null);assert.equal(saved.data.report.score,null);assert.equal(saved.data.report.audit,undefined);
 }
 assert.equal((await f.db.query("select count(*)::int n from students where id='iw_practice_test'")).rows[0].n,0);
 assert.equal((await f.db.query("select count(*)::int n from ip_question_rubrics where status='reviewed'")).rows[0].n,0);
 assert.equal((await f.db.query('select count(*)::int n from ip_job_exam_attempts')).rows[0].n,0);
 assert.equal((await f.db.query('select count(*)::int n from ip_personality_attempts')).rows[0].n,0);
});
test('concurrent and repeated submissions/rereads execute the provider exactly once',async t=>{
 const f=await setup(t),b=f.body();await Promise.all([f.call(b),f.call(b),f.call(b)]);await f.finish();assert.equal(f.providers,1);
 for(let n=0;n<3;n++){assert.equal((await f.call(b)).status,200);assert.equal((await f.call({action:'get',id:b.id})).data.state,'completed');}
 assert.equal(f.providers,1);f.enabled(false);assert.equal((await f.call({action:'get',id:b.id})).data.state,'completed');
 assert.equal((await f.call({...b,questionPrompt:'위조 질문'})).status,409);
});
test('unapproved or foreign account, unpublished/other-track questions and original-prompt tampering cannot invoke AI',async t=>{
 const f=await setup(t),b=f.body();
 assert.equal((await f.call({...b,accountId:'ip-b'})).status,403);
 assert.equal((await f.call(b,{origin:'https://evil.example'})).status,403);
 assert.equal((await f.call({...b,questionPrompt:'변경 문구'})).status,409);
 await f.db.query("update ip_questions set status='draft' where id=$1",[b.questionId]);assert.equal((await f.call(b)).status,409);
 await f.db.query("update ip_questions set status='published',tracks=array['기관'] where id=$1",[b.questionId]);assert.equal((await f.call(b)).status,409);
 await f.db.exec("update ip_members set mock_test_enabled=false where student_id='iw_practice_test'");assert.equal((await f.call({action:'status'})).status,403);
 assert.equal(f.providers,0);assert.equal(f.uploads,0);
});
test('lost provider response becomes unknown; retries and polling never repeat paid work',async t=>{
 const f=await setup(t);f.failInference(true);const b=f.body();await f.call(b);await f.finish();
 assert.equal((await f.call({action:'get',id:b.id})).data.state,'unknown');await f.call(b);await f.finish();assert.equal(f.providers,1);
});
test('upload failure is retryable before any paid execution using the same request ID',async t=>{
 const f=await setup(t),b=f.body();f.failUpload(true);assert.equal((await f.call(b)).status,503);assert.equal(f.providers,0);
 f.failUpload(false);await f.call(b);await f.finish();assert.equal(f.providers,1);assert.equal((await f.call({action:'get',id:b.id})).data.state,'completed');
});
test('owner isolation, server-only transitions, strict RLS and expiry/cleanup preserve other records',async t=>{
 const f=await setup(t),b=f.body();await f.call(b);await f.finish();
 f.identity('ip-b');assert.equal((await f.call({action:'get',id:b.id})).status,404);f.identity('iw_practice_test');
 await assert.rejects(f.invoke('claim',{type:'student',id:'iw_practice_test'},{id:b.id}),/forbidden/);
 for(const role of ['anon','authenticated']){await f.db.exec('set role '+role);await assert.rejects(f.db.query('select * from ip_openai_practice_attempts'),/permission denied/);await assert.rejects(f.invoke('status',{type:'student',id:'iw_practice_test'}),/permission denied/);await f.db.exec('reset role');}
 await f.db.query("update ip_openai_practice_attempts set retain_until=now()-interval '1 second' where id=$1",[b.id]);assert.equal((await f.call({action:'get',id:b.id})).status,404);
 f.failUpload(true);await assert.rejects(cleanup(f.d),/offline/);assert.equal((await f.db.query('select count(*)::int n from ip_openai_practice_attempts')).rows[0].n,1);
 f.failUpload(false);assert.equal((await cleanup(f.d)).removed,1);assert.equal(f.files.has(b.id),false);
 const flags=(await f.db.query("select prosecdef,proconfig from pg_proc where proname='ip_openai_practice_service'")).rows[0];assert.equal(flags.prosecdef,false);assert.ok(flags.proconfig.some(s=>s.startsWith('search_path=')));
});
test('expired execution is held without another provider call and stale completion cannot overwrite it',async t=>{
 const f=await setup(t),b=f.body(),actor={type:'student',id:'iw_practice_test'},server={type:'server',id:'test'};
 const hash=require('../lib/interview-exam-scoring').digest(wav());
 await f.invoke('create',actor,{id:b.id,mode:b.mode,questionId:b.questionId,questionPrompt:b.questionPrompt,audioHash:hash});const token=randomUUID();assert.equal((await f.invoke('claim',server,{id:b.id,token,audioHash:hash})).claimed,true);
 await f.db.query("update ip_openai_practice_attempts set started_at=now()-interval '5 minutes' where id=$1",[b.id]);assert.equal((await f.call({action:'get',id:b.id})).data.state,'unknown');await f.call(b);assert.equal(f.providers,0);
 await assert.rejects(f.invoke('complete',server,{id:b.id,token,report:{status:'practice_feedback',grade:null,score:null}}),/lease_lost/);
});
test('OpenAI practice audio uses its own private namespace and cannot delete graded exam audio',async()=>{
 const {createJobExamStorage}=require('../lib/interview-job-exam-storage.cjs'),urls=[],id=randomUUID();
 const storage=createJobExamStorage({url:'https://db.example',key:'private-fixture',prefix:'openai-practice/',fetchImpl:async(url,opts)=>{urls.push({url,opts});return {ok:true};}});
 await storage.put(id,Buffer.from('audio'));await storage.remove(id);
 assert.ok(urls[0].url.endsWith('/openai-practice/'+id+'/answer.wav'));assert.deepEqual(JSON.parse(urls[1].opts.body).prefixes,['openai-practice/'+id+'/answer.wav']);
 assert.throws(()=>createJobExamStorage({url:'https://db.example',key:'private-fixture',prefix:'../'}),/invalid_storage_prefix/);
});

test('approved enrollment with no end date still practices with bounded private audio retention',async t=>{
 const f=await setup(t);await f.db.exec("update ip_members set expires_on=null where student_id='iw_practice_test'");
 assert.equal((await f.call({action:'status'})).data.ready,true);
 const b=f.body();assert.equal((await f.call(b)).status,200);await f.finish();
 const row=(await f.db.query('select retain_until from ip_openai_practice_attempts where id=$1',[b.id])).rows[0];
 assert.ok(Date.parse(row.retain_until)>Date.now()+30*86400000);assert.ok(Date.parse(row.retain_until)<Date.now()+32*86400000);
});
