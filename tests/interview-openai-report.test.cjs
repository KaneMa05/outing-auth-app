'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID}=require('node:crypto');
const {createDb}=require('./helpers/interview-db.cjs');
const {createReports}=require('../lib/interview-openai-report.cjs');
const {createHandler}=require('../api/interview-live');
const {digest}=require('../lib/interview-exam-scoring');
const {reportInput}=require('../lib/interview-mock-analysis.cjs');
const owner={type:'student',id:'ip-a'},other={type:'student',id:'ip-b'},server={type:'server',id:'test'};
async function call(handler,body){let status,data;await handler({method:'POST',headers:{host:'localhost',origin:'http://localhost'},body},{setHeader(){},status(n){status=n;return this;},json(d){data=d;}});return {status,data};}
test('OpenAI reports persist once, validate quotes, protect ownership and never retry uncertain paid work',async t=>{
 const {db,invoke:prep}=await createDb();let paidCalls=0,invalidQuote=false;
 try{
  for(const file of ['20261021060740_interview_live_sessions.sql','20261103062625_interview_live_result_reports.sql','20261106054452_interview_openai_live_reports.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
  await prep('admin_member_save',{type:'admin',id:'qa'},{targetStudentId:'ip-a',track:'공채',examNumber:'QA',enabled:true,expiresOn:'2099-12-01'});await prep('admin_enabled',{type:'admin',id:'qa'},{enabled:true});
  const invoke=async(action,actor,body={})=>(await db.query('select ip_live_openai_report_service($1,$2::jsonb,$3::jsonb) result',[action,JSON.stringify(actor),JSON.stringify(body)])).rows[0].result;
  const insert=async()=>{
   const turns=[{question:'협업 경험을 말씀해주세요.',answer:'역할을 나누고 매일 진행 상황을 확인했습니다.',complete:true,kind:'initial'}];
   return (await db.query("insert into ip_live_runs(student_id,request_key,state,questions,turns,retain_until) values('ip-a',$1,'completed','[]',$2,now()+interval '1 day') returning *",[randomUUID(),JSON.stringify(turns)])).rows[0];
  };
  const reports=createReports({invoke,key:'server-only-synthetic-key',model:'configured-report-model',fetchImpl:async(url,options)=>{
   paidCalls++;assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(options.redirect,'error');
   const body=JSON.parse(options.body);assert.equal(body.model,'configured-report-model');assert.equal(body.store,false);assert(body.text.format.strict);assert.equal(body.max_output_tokens,4500);
   const analysis={summary:'행동을 구체적으로 설명했습니다.',strengths:[{turnId:'1',quote:invalidQuote?'답변에 없는 인용':'매일 진행 상황을 확인했습니다.',feedback:'본인의 행동이 드러납니다.'}],improvements:[],nextPractice:[]};
   return {ok:true,text:async()=>JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(analysis)}]}]})};
  }});
  const run=await insert();
  await t.test('concurrent requests and repeated reads produce exactly one inference',async()=>{
   assert.equal(await reports.get(owner,run.id),null);
   await Promise.all([reports.request(owner,run),reports.request(owner,run)]);
   const result=await reports.get(owner,run.id);assert.equal(result.state,'completed');assert.equal(result.report.grade,null);assert.equal(result.report.score,null);assert.equal(result.report.audit.sourceHash,digest(reportInput(run)));assert.equal(paidCalls,1);
   assert.equal((await reports.request(owner,run)).state,'completed');assert.equal(paidCalls,1);
   assert(!JSON.stringify(result).includes('execution_token'));assert(!JSON.stringify(result).includes('server-only-synthetic-key'));
  });
  await t.test('fabricated evidence becomes unknown and cannot be rerun',async()=>{
   invalidQuote=true;const held=await insert();assert.equal((await reports.request(owner,held)).state,'unknown');assert.equal(paidCalls,2);
   assert.equal((await reports.request(owner,held)).state,'unknown');assert.equal(paidCalls,2);invalidQuote=false;
  });
  await t.test('expired ownership, browser roles and forged completion cannot access or replace reports',async()=>{
   await assert.rejects(reports.get(other,run.id),/not_found/);
   await assert.rejects(invoke('complete',owner,{runId:run.id}),/forbidden/);
   await assert.rejects(invoke('complete',server,{runId:run.id,token:randomUUID(),sourceHash:digest(reportInput(run))}),/execution_mismatch/);
   await db.exec('set role anon');await assert.rejects(db.query('select * from ip_live_openai_reports'),/permission denied/);await assert.rejects(invoke('get',owner,{runId:run.id}),/permission denied/);await db.exec('reset role');
   const expired=await insert();await db.query("update ip_live_runs set retain_until=now()-interval '1 second' where id=$1",[expired.id]);await assert.rejects(reports.get(owner,expired.id),/not_found/);
   const functionRow=(await db.query("select prosecdef from pg_proc where proname='ip_live_openai_report_service'")).rows[0];assert.equal(functionRow.prosecdef,false);
  });
  await t.test('abandoned execution becomes unknown without a new inference',async()=>{
   const held=await insert();await invoke('claim',owner,{runId:held.id,sourceHash:digest(reportInput(held)),token:randomUUID(),turns:held.turns});
   await db.query("update ip_live_openai_reports set created_at=now()-interval '3 minutes' where run_id=$1",[held.id]);assert.equal((await reports.get(owner,held.id)).state,'unknown');assert.equal((await reports.request(owner,held)).state,'unknown');assert.equal(paidCalls,2);
  });
  await t.test('source changes are rejected before inference and expired run deletion removes its report',async()=>{
   const changed=await insert(),old=JSON.parse(JSON.stringify(changed));
   await db.query("update ip_live_runs set turns='[]' where id=$1",[changed.id]);
   await assert.rejects(reports.request(owner,old),/report_not_ready|source_changed/);assert.equal(paidCalls,2);
   const saved=await insert();await reports.request(owner,saved);assert.equal(paidCalls,3);
   await db.query("update ip_live_runs set retain_until=now()-interval '1 second' where id=$1",[saved.id]);
   await assert.rejects(reports.get(owner,saved.id),/not_found/);
   await db.query('delete from ip_live_runs where id=$1',[saved.id]);assert.equal((await db.query('select count(*)::int total from ip_live_openai_reports where run_id=$1',[saved.id])).rows[0].total,0);
  });
  await t.test('existing authenticated API exposes the saved report without requiring a PC worker',async()=>{
   const handler=createHandler({requireMockAccess:async()=>{},config:{enabled:false,configured:true,transport:'vercel'},openaiReportsEnabled:true,reports:()=>reports,authenticateWeb:async()=>owner,
    invoke:async(_action,actor,body)=>{assert.equal(actor.id,owner.id);return {ok:true,run:(await db.query('select * from ip_live_runs where id=$1',[body.runId])).rows[0]};}});
   const result=await call(handler,{action:'analysis_request',runId:run.id});assert.equal(result.status,200);assert.equal(result.data.processing.state,'completed');assert.equal(paidCalls,3);
   const saved=await call(handler,{action:'get',runId:run.id});assert.equal(saved.status,200);assert.equal(saved.data.analysisEnabled,true);assert.equal(saved.data.processing.state,'completed');
   assert.equal((await call(handler,{action:'analysis_get',runId:run.id,model:'forged'})).status,400);
  });
 }finally{await db.close();}
});
