'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID}=require('node:crypto');
const {createDb}=require('./helpers/interview-db.cjs');
const {createReportRepository}=require('../lib/interview-exam-reports.cjs');
const {createHandler}=require('../api/interview-exam');
const {detail,wav,provider}=require('./interview-exam.test.cjs');
const {rubricSnapshot}=require('../lib/interview-exam-scoring');
const migration=fs.readdirSync('supabase/migrations').find(n=>n.endsWith('_interview_keyword_rules_reports.sql'));
test('local database keyword authoring and persistent validation report API',async t=>{
 const {db,invoke}=await createDb();t.after(()=>db.close());const admin={type:'admin',id:'qa'},d=detail();
 await db.exec(fs.readFileSync('supabase/migrations/'+migration,'utf8'));
 await db.query('insert into ip_questions(id,prompt,category,revision) values($1,$2,$3,$4)',[d.question.id,d.question.prompt,d.question.category,d.question.revision]);
 const criteria=[{label:'통신과 위치',terms:['VHF','브이에이치에프','위치'],match:'all',keywords:[{term:'VHF',aliases:['브이에이치에프']},{term:'위치',aliases:[]}],context:'VHF를 사용해 위치 정보를 교환함',reject_context:'통신이나 정보 교환을 부정함'}];
 const payload={id:d.question.id,revision:0,questionRevision:2,kind:'job_knowledge',rationale:'로컬 테스트용 전공 키워드 기준입니다.',criteria,criticalErrors:['UHF를 사용한다고 주장함'],verificationNote:'테스트 기준이며 운영 출제와 무관합니다.',scoreMap:{O:2,partial:1,X:0},status:'reviewed'};
 await invoke('admin_rubric_save',admin,payload);
 await t.test('authoring round trip preserves all and grouped aliases; malformed direct RPC is rejected',async()=>{
  const saved=await invoke('admin_rubric_detail',admin,{id:d.question.id});assert.deepEqual(saved.rubric.criteria,criteria);assert.equal(rubricSnapshot(saved).criteria[0].match,'all');
  for(const mutate of [c=>c.match='invalid',c=>c.keywords[1].aliases=['VHF'],c=>c.terms.pop()]){const c=structuredClone(criteria);mutate(c[0]);await assert.rejects(invoke('admin_rubric_save',admin,{...payload,revision:1,criteria:c}),/invalid_request/);}
 });
 const call=async(action,actor,body)=>(await db.query('select ip_exam_report_service($1,$2::jsonb,$3::jsonb) result',[action,JSON.stringify(actor),JSON.stringify(body||{})])).rows[0].result;
 const reports=createReportRepository({invoke:call});let inference=0;
 const deps={config:()=>({enabled:true,ready:true}),authenticate:async()=>admin,reports,detail:()=>invoke('admin_rubric_detail',admin,{id:d.question.id}),provider:()=>provider({transcribe:async()=>{inference++;return 'VHF를 사용하고 위치 정보를 교환합니다.';},judge:async()=>({criteria:[{index:0,status:'accepted',quote:'VHF를 사용하고 위치 정보를 교환합니다.',reason:'두 키워드와 관계를 설명함'}],errors:[{index:0,status:'absent',quote:'',reason:'핵심 오류 없음'}],uncertainties:[]})})};
 const body={action:'validate_audio',questionId:d.question.id,questionRevision:2,rubricRevision:1,audioBase64:wav().toString('base64'),requestKey:randomUUID()};
 async function request(handler,body){let status,data;await handler({method:'POST',headers:{host:'localhost'},body},{setHeader(){},status(s){status=s;return this;},json(d){data=d;}});return {status,data};}
 let stored;
 await t.test('API generates then stores immutable report and exact keyword/rubric snapshots',async()=>{
  const response=await request(createHandler(deps),body);assert.equal(response.status,200,JSON.stringify(response.data));assert.equal(response.data.persisted,true);stored=response.data.record;
  assert.equal(stored.report.suggestion.grade,'O');assert.equal(stored.report.grade,null);assert.equal(stored.report.rubric.criteria[0].match,'all');assert.equal(stored.report.keywordResults[0].keywords.length,2);
 });
 await t.test('recreated repository reads history without inference, and same request never invokes AI twice',async()=>{
  const before=inference,newReports=createReportRepository({invoke:call});
  const readDeps={...deps,reports:newReports,config:()=>{throw Error('no inference configuration needed');},provider:()=>{throw Error('must not call AI');}};
  const loaded=await request(createHandler(readDeps),{action:'report_get',id:body.requestKey});assert.equal(loaded.status,200);assert.deepEqual(loaded.data.record.report,stored.report);
  const list=await request(createHandler(readDeps),{action:'report_list',questionId:d.question.id});assert.equal(list.data.reports.length,1);
  const repeated=await request(createHandler(deps),body);assert.equal(repeated.data.persisted,true);assert.equal(inference,before);
  await assert.rejects(newReports.complete(admin,body.requestKey,{...stored.report,suggestion:null}),/conflict/);
 });
 await t.test('changed audio under same request key is rejected before another inference',async()=>{
  const before=inference;const changed=await request(createHandler(deps),{...body,audioBase64:wav(.2).toString('base64')});assert.equal(changed.status,409);assert.equal(inference,before);
 });
 await t.test('original report survives rubric changes and new reports use new versions',async()=>{
  await invoke('admin_rubric_save',admin,{...payload,revision:1,criteria:criteria.map(c=>({...c,match:'any'}))});
  const old=await reports.get(admin,body.requestKey);assert.equal(old.record.report.rubric.criteria[0].match,'all');
  const fresh=await request(createHandler(deps),{...body,requestKey:randomUUID(),rubricRevision:2});assert.equal(fresh.status,200);assert.equal(fresh.data.report.rubric.criteria[0].match,'any');
 });
 await t.test('RLS and RPC grants exclude students and browser roles',async()=>{
  await assert.rejects(call('get',{type:'student',id:'ip-a'},{id:body.requestKey}),/forbidden/);
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(db.query('select * from ip_exam_reports'),/permission denied/);await assert.rejects(call('list',admin,{}),/permission denied/);await db.exec('reset role');}
  assert.equal((await db.query("select relrowsecurity from pg_class where relname='ip_exam_reports'")).rows[0].relrowsecurity,true);
  const functions=await db.query("select prosecdef,proconfig from pg_proc where proname in ('ip_exam_report_service','ip_validate_keyword_rules')");
  assert.equal(functions.rows.length,2);for(const fn of functions.rows){assert.equal(fn.prosecdef,false);assert.ok(fn.proconfig.some(v=>v.startsWith('search_path=')));}
  await assert.rejects(reports.complete(admin,body.requestKey,{...stored.report,grade:'O'}),/invalid_report/);
 });
});
test('reservation and storage failures never silently repeat paid inference',async()=>{
 const d=detail(),body={action:'validate_audio',questionId:d.question.id,questionRevision:2,rubricRevision:3,audioBase64:wav().toString('base64'),requestKey:randomUUID()};let count=0;
 const deps={config:()=>({enabled:true,ready:true}),authenticate:async()=>({type:'admin',id:'qa'}),detail:async()=>d,provider:()=>{count++;return provider();}};
 async function request(reports){let status,data;await createHandler({...deps,reports})({method:'POST',headers:{host:'localhost'},body},{setHeader(){},status(s){status=s;return this;},json(d){data=d;}});return {status,data};}
 const processing=await request({reserve:async()=>({created:false,record:{state:'processing'}})});assert.equal(processing.status,409);assert.equal(count,0);
 const unavailable=await request({reserve:async()=>{throw Error('offline');}});assert.equal(unavailable.status,503);assert.equal(count,0);
 const failed=await request({reserve:async()=>({created:true}),complete:async()=>{throw Error('storage failure');}});assert.equal(failed.status,200);assert.equal(failed.data.persisted,false);assert.equal(failed.data.report.grade,null);assert.equal(failed.data.error,'report_storage_failed');assert.equal(count,1);
});
test('production cookie checks separate report readers from validation writers',async()=>{
 const auth=require('../api/teacher-auth-utils'),old=process.env.TEACHER_SESSION_SECRET;process.env.TEACHER_SESSION_SECRET='keyword-report-local-auth-only';
 try{
  async function request(permissions,body){let code;const cookie=auth.COOKIE_NAME+'='+auth.createSessionToken(process.env.TEACHER_SESSION_SECRET,{username:'qa',role:'admin',permissions});await createHandler()({method:'POST',headers:{host:'localhost',cookie},body},{setHeader(){},status(s){code=s;return this;},json(){}});return code;}
  assert.equal(await request(['interview.read'],{action:'report_get',id:'bad-id'}),400); // passes auth, no database call
  assert.equal(await request(['interview.write'],{action:'report_get',id:'bad-id'}),403);
  assert.equal(await request(['interview.read'],{action:'validate_audio'}),403);
 }finally{if(old===undefined)delete process.env.TEACHER_SESSION_SECRET;else process.env.TEACHER_SESSION_SECRET=old;}
});
