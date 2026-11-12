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
 await f.db.exec(fs.readFileSync('supabase/migrations/'+fs.readdirSync('supabase/migrations').find(n=>n.endsWith('_interview_practice_reference_assessment.sql')),'utf8'));
 await f.db.exec(fs.readFileSync('supabase/migrations/'+fs.readdirSync('supabase/migrations').find(n=>n.endsWith('_interview_practice_result_reference_answer.sql')),'utf8'));
 await f.db.exec(fs.readFileSync('supabase/migrations/20261112025510_interview_personality_test_usage.sql','utf8'));
 // Reproduce production: published questions, only draft rubrics, portal-only owner.
 await f.db.exec("update ip_question_rubrics set status='draft';insert into ip_owners(id,name) values('iw_practice_test','가상 면접 전용 계정');insert into ip_members(student_id,track,exam_number,expires_on,mock_test_enabled) values('iw_practice_test','공채','portal-practice-test','2099-01-01',true);");
 await f.db.exec("insert into ip_sources(id,filename,sha256,track) values('practice-source','practice-fixture.hwpx','fixture','공채');");
 await f.db.query("insert into ip_occurrences(id,source_id,question_id,number,locator,original_prompt,answer) values('practice-ref','practice-source',$1,'1','paragraph:1',$2,$3)",[f.detail.question.id,f.detail.question.prompt,'상황을 확인합니다. 동료에게 보고합니다. 조치를 기록합니다.']);
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

test('source-answer criteria are frozen at submission and evidence-backed practice verdict reaches the saved report',async t=>{
 const f=await setup(t),b=f.body(),spoken='상황을 확인합니다. 동료에게 보고합니다. 조치를 기록합니다.';
 f.d.provider=()=>({models:f.models,transcribe:async()=>spoken,infer:async(input,options)=>{
  assert.equal(options.schema.properties.assessment.type,'array');assert.equal(input.criteria.length,3);
  return {summary:'핵심 내용을 설명했습니다.',strengths:[{turnId:'1',quote:spoken,feedback:'조치 순서를 설명했습니다.'}],improvements:[],nextPractice:[],assessment:input.criteria.map(c=>({index:c.index,status:'O',quote:c.claim,reason:'예시답변의 핵심 내용과 일치합니다.'}))};
 }});
 await f.call(b);await f.finish();
 await f.db.exec("update ip_occurrences set answer='나중에 변경한 예시답변' where id='practice-ref'");
 const saved=await f.call({action:'get',id:b.id});assert.equal(saved.data.state,'completed');
 assert.equal(saved.data.report.assessment.length,3);assert.ok(saved.data.report.assessment.every(r=>r.status==='O'));
 assert.equal(saved.data.report.assessment[0].claim,'상황을 확인합니다.');assert.equal(saved.data.report.assessmentBasis,'source_answer');
 assert.equal(saved.data.report.grade,null);assert.equal(saved.data.report.score,null);assert.equal(saved.data.report.audit,undefined);
 assert.equal((await f.db.query("select count(*)::int n from ip_question_rubrics where status='reviewed'")).rows[0].n,0);
});

test('capacity supports twenty-question sessions for one hundred students without repeated submissions consuming extra entries',async t=>{
 const f=await setup(t),status=await f.call({action:'status'});
 assert.equal(status.data.dailyAnswerLimit,100);assert.equal(status.data.dailyServiceAnswerLimit,10000);
 const b=f.body();await f.call(b);await f.finish();
 await f.db.exec("insert into ip_openai_practice_attempts(id,owner_id,mode,question,audio_hash,state,created_at,retain_until) select gen_random_uuid(),'iw_practice_test','job','{}','"+'a'.repeat(64)+"','completed',now(),now()+interval '1 day' from generate_series(1,98)");
 assert.equal((await f.call(b)).status,200);
 const last=f.body();assert.equal((await f.call(last)).status,200);await f.finish();
 assert.equal((await f.call(f.body())).status,429);
});

test('example answers are available with the submitted result while analysis is running and on legacy records without new inference',async t=>{
 const f=await setup(t),b=f.body(),reference='상황을 확인합니다. 동료에게 보고합니다. 조치를 기록합니다.';
 const submitted=await f.call(b);assert.equal(submitted.data.referenceAnswer,reference);await f.finish();
 await f.db.exec("update ip_openai_practice_attempts set question=question-'reference'");
 const legacy=await f.call({action:'get',id:b.id});assert.equal(legacy.data.referenceAnswer,reference);assert.equal(f.providers,1);
 await f.db.query("update ip_questions set prompt='원문이 바뀐 다른 질문' where id=$1",[b.questionId]);
 assert.equal((await f.call({action:'get',id:b.id})).data.referenceAnswer,null);assert.equal(f.providers,1);
 f.identity('ip-b');assert.equal((await f.call({action:'get',id:b.id})).status,404);
});

test('personality examples can be studied without applying job knowledge verdicts',async t=>{
 const f=await setup(t),b=f.body('personality'),example='본인의 경험과 행동, 결과를 구체적으로 설명하는 예시입니다.';
 await f.db.query("insert into ip_occurrences(id,source_id,question_id,number,locator,original_prompt,answer) values('personality-ref','practice-source',$1,'2','paragraph:2',$2,$3)",[b.questionId,b.questionPrompt,example]);
 const submitted=await f.call(b);assert.equal(submitted.data.referenceAnswer,example);await f.finish();
 const saved=await f.call({action:'get',id:b.id});assert.equal(saved.data.referenceAnswer,example);assert.deepEqual(saved.data.report.assessment,[]);assert.equal(saved.data.report.grade,null);
});

test('only authenticated test-app practice can retain agreed criteria across transcription differences',async t=>{
 const f=await setup(t);let calls=0;
 f.d.provider=()=>({models:f.models,transcribe:async(_audio,{pass})=>pass?'V-PASS로 상황을 확인하고 보고했습니다.':'브이패스로 상황을 확인하고 보고했습니다.',infer:async input=>{
  calls++;return {summary:'상황 확인 및 보고를 설명했습니다.',strengths:[],improvements:[],nextPractice:[],assessment:input.criteria.map(c=>({index:c.index,status:'O',quote:'상황을 확인하고 보고했습니다.',reason:'전사에 직접 근거가 있습니다.'}))};
 }});
 for(const testApp of [false,true]){
  const body=f.body(),headers=testApp?{'x-interview-test-app':'1'}:{};
  assert.equal((await f.call(body,headers)).status,200);await f.finish();
  const saved=await f.call({action:'get',id:body.id},headers);
  assert.equal(saved.data.report.status,testApp?'practice_feedback':'review_required');
  assert.equal(saved.data.report.audit,undefined);
  assert(saved.data.report.assessment.every(r=>r.status===(testApp?'O':'uncertain')));
 }
 assert.equal(calls,2);
});

async function trackedPersonality(f,{fail=false}={}){
 const {createProvider}=require('../lib/interview-exam-provider');
 const {createOpenAIInference}=require('../lib/interview-openai-report.cjs');
 let asrCalls=0,analysisCalls=0;
 f.d.recordUsage=body=>f.rpc('ip_practice_usage_service')('record',{type:'server',id:'fixture'},body);
 const common='제가 역할을 나누고 진행 상황을 확인했습니다.';
 f.d.provider=({onUsage})=>({models:{transcriber:'gpt-transcribe',analyzer:'gpt-6.1-sol'},
  transcribe:async(audio,{pass})=>createProvider({config:{enabled:true,ready:true,key:'fixture',models:{transcriber:'gpt-transcribe'}},onTranscriptionUsage:onUsage,fetchImpl:async()=>{
   asrCalls++;return {ok:true,text:async()=>JSON.stringify({text:(pass?'행사를 준비했습니다. ':'행사 준비를 맡았습니다. ')+common,usage:{type:'duration',seconds:10}})};
  }}).transcribe(audio,pass),
  infer:createOpenAIInference({key:'fixture',model:'gpt-6.1-sol',onMetrics:onUsage,fetchImpl:async()=>{
   analysisCalls++;if(fail)throw Error('lost response');
   const value={strengths:[{quote:common,verificationQuote:common,feedback:'직접 한 행동을 설명했습니다.',agreement:'supported'}],improvements:[],nextPractice:[]};
   return {ok:true,text:async()=>JSON.stringify({id:'fixture-response',status:'completed',usage:{input_tokens:100,output_tokens:50,input_tokens_details:{cached_tokens:20}},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]})};
  }})});
 return ()=>({asrCalls,analysisCalls});
}
test('test personality feedback and every paid call usage are saved privately once',async t=>{
 const f=await setup(t),counts=await trackedPersonality(f),body=f.body('personality'),headers={'x-interview-test-app':'1'};
 assert.equal((await f.call(body,headers)).status,200);await f.finish();
 const saved=(await f.call({action:'get',id:body.id},headers)).data;
 assert.equal(saved.state,'completed');assert.equal(saved.report.status,'practice_feedback');assert.equal(saved.report.analysis.strengths.length,1);
 assert(!JSON.stringify(saved).includes('usageEvents'));assert(!JSON.stringify(saved).includes('usd'));
 const events=Object.values((await f.db.query('select report from ip_openai_practice_attempts where id=$1',[body.id])).rows[0].report.audit.usageEvents);
 assert.equal(events.length,3);assert(events.every(e=>e.status==='reported'));assert(Math.abs(events.reduce((n,e)=>n+e.usd,0)-.002162)<1e-10);
 await f.call(body,headers);await f.finish();assert.deepEqual(counts(),{asrCalls:2,analysisCalls:1});
 await assert.rejects(f.rpc('ip_practice_usage_service')('record',{type:'student',id:'iw_practice_test'},{testApp:true}),/forbidden/);
});
test('lost test personality inference keeps unconfirmed cost and never automatically retries',async t=>{
 const f=await setup(t),counts=await trackedPersonality(f,{fail:true}),body=f.body('personality'),headers={'x-interview-test-app':'1'};
 await f.call(body,headers);await f.finish();const saved=(await f.call({action:'get',id:body.id},headers)).data;
 assert.equal(saved.state,'unknown');assert.equal(saved.report,null);
 const events=Object.values((await f.db.query('select report from ip_openai_practice_attempts where id=$1',[body.id])).rows[0].report.audit.usageEvents);
 assert.equal(events.length,3);assert.equal(events.filter(e=>e.status==='unconfirmed').length,1);assert.equal(events.find(e=>e.kind==='backend').usd,null);
 await f.call(body,headers);await f.finish();assert.deepEqual(counts(),{asrCalls:2,analysisCalls:1});
});

test('practice cost audit requires the execution lease and cannot downgrade confirmed usage',async t=>{
 const f=await setup(t),body=f.body('personality'),token=randomUUID(),server={type:'server',id:'test'};
 const created=await f.invoke('create',{type:'student',id:'iw_practice_test'},{id:body.id,mode:body.mode,questionId:body.questionId,questionPrompt:body.questionPrompt,audioHash:'a'.repeat(64)});
 await f.invoke('claim',server,{id:body.id,audioHash:'a'.repeat(64),token});
 const usage=f.rpc('ip_practice_usage_service'),event={eventKey:'report:'+randomUUID(),kind:'backend',model:'gpt-6.1-sol',status:'reported',usage:{inputTokens:100},rates:{version:'fixture'},usd:.001};
 const payload={id:body.id,token,testApp:true,event};
 await usage('record',server,payload);await usage('record',server,{...payload,event:{...event,status:'unconfirmed',usd:null}});
 const stored=(await f.db.query('select report from ip_openai_practice_attempts where id=$1',[body.id])).rows[0].report.audit.usageEvents[event.eventKey];assert.equal(stored.status,'reported');assert.equal(stored.usd,.001);
 await assert.rejects(usage('record',server,{...payload,token:randomUUID()}),/lease_lost/);
 await assert.rejects(usage('record',server,{...payload,testApp:false}),/forbidden/);
 for(const change of [{status:null},{kind:null},{usd:-1},{model:3}])await assert.rejects(usage('record',server,{...payload,event:{...event,...change}}),/invalid_usage/);
 const flags=(await f.db.query("select prosecdef,has_function_privilege('anon',oid,'execute') as anon from pg_proc where oid='ip_practice_usage_service(text,jsonb,jsonb)'::regprocedure")).rows[0];assert.equal(flags.prosecdef,false);assert.equal(flags.anon,false);
});
