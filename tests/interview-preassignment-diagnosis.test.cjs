const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {setup}=require('./interview-preassignments.test.cjs');
const {createHandler}=require('../api/interview-preassignments');
const {VERSION,validateReport,evaluate}=require('../lib/preassignment-diagnosis.cjs');
const rawReport=s=>({summary:'기록한 행동을 바탕으로 답변을 구체화할 수 있습니다.',criteria:s.rubric.criteria.map((c,index)=>({index,state:index===0?'보완':'미확인',quote:index===0?s.answer:'',reason:'작성한 내용에서 기준에 필요한 구체적인 정보를 더 확인해야 합니다.',nextQuestion:c[2]}))});
async function send(handler,body){const res={setHeader(){},status(n){this.statusCode=n;return this;},json(data){this.data=data;return this;}};await handler({method:'POST',headers:{host:'app.test',origin:'https://app.test'},body},res);return res;}
(async()=>{
 const {db,call,admin,a,b}=await setup();let executions=0,lastSnapshot;
 try{
  const rubrics=(await db.query('select * from ip_pa_rubrics order by unit_id')).rows;assert.equal(rubrics.length,25);assert(rubrics.every((r,i)=>r.definition.id===i+1&&r.definition.criteria.length===4));
  assert.equal((await call('admin_guidance_list',admin)).guidelines.filter(g=>g.has_instructions).length,25);
  const provider=async s=>{executions++;lastSnapshot=s;return rawReport(s);};provider.version=VERSION;
  const deps={authenticateWeb:async()=>({id:a.id}),previewAllowed:()=>false,diagnosisProvider:provider,invoke:call};const api=createHandler(deps);
  await call('admin_settings',admin,{revision:(await call('admin_list',admin)).settings.revision,enabled:true,dueAt:'2099-01-01T00:00:00Z',revisionDueAt:'2099-01-02T00:00:00Z',allowLate:true});
  assert.equal((await send(api,{action:'diagnose',unitId:'core-01',revision:0})).statusCode,422);
  await call('save',a,{unitId:'core-01',revision:0,fields:{f1:'저는 일정을 정리하고 동료들과 공유했습니다.'},requestId:crypto.randomUUID()});
  const body={action:'diagnose',unitId:'core-01',revision:1};
  assert.equal((await send(api,{...body,revision:0})).statusCode,409);assert.equal(executions,0);
  let r=await send(api,body);assert.equal(r.statusCode,200);assert.equal(r.data.diagnosis.status,'completed');assert.equal(r.data.diagnosis.report.criteria.length,4);assert.equal(executions,1);
  assert.equal(lastSnapshot.rubric.id,1);assert(!('studentId'in lastSnapshot));assert(lastSnapshot.administratorGuidance.includes('강점의 구체성'));
  assert(!JSON.stringify(r.data).includes('administratorGuidance'));assert(!('score'in r.data.diagnosis.report));
  const cached=await send(api,body);assert.equal(cached.data.diagnosis.id,r.data.diagnosis.id);assert.equal(executions,1);
  assert.equal((await call('diagnosis_get',b,{unitId:'core-01'})).diagnosis,null);
  await assert.rejects(call('diagnosis_finish',b,{unitId:'core-01',diagnosisId:r.data.diagnosis.id,error:'x'}),/not_found/);
  const originalReport=r.data.diagnosis.report;
  await call('save',a,{unitId:'core-01',revision:1,fields:{f1:'저는 회의를 진행하여 역할을 정했습니다.'},requestId:crypto.randomUUID()});
  assert.equal((await call('diagnosis_get',a,{unitId:'core-01'})).diagnosis.stale,true);
  r=await send(api,{...body,revision:2});assert.equal(r.data.diagnosis.stale,false);assert.equal(executions,2);
  await call('admin_guidance_save',admin,{unitId:'core-01',revision:1,instructions:'개인 기여를 구체적으로 확인해주세요.'});
  assert.equal((await call('diagnosis_get',a,{unitId:'core-01'})).diagnosis.stale,true);
  await send(api,{...body,revision:2});assert.equal(executions,3);assert.equal(lastSnapshot.administratorGuidance,'개인 기여를 구체적으로 확인해주세요.');
  assert.deepEqual((await db.query('select report from ip_pa_diagnoses order by created_at limit 1')).rows[0].report,originalReport);
  assert.equal((await call('detail',a,{unitId:'core-01'})).latest,null,'Diagnosis does not submit answers');
  assert.equal((await db.query('select count(*)::int n from ip_pa_submissions')).rows[0].n,0);
  assert.throws(()=>validateReport({...rawReport(lastSnapshot),criteria:rawReport(lastSnapshot).criteria.map(r=>({...r,quote:'없는 내용을 조작한 근거'}))},lastSnapshot),/invalid_diagnosis/);
  assert.throws(()=>validateReport({...rawReport(lastSnapshot),criteria:[rawReport(lastSnapshot).criteria[0]]},lastSnapshot),/invalid_diagnosis/);
  await assert.rejects(evaluate(()=>new Promise(()=>{}),lastSnapshot,{timeoutMs:5}),/diagnosis_timeout/);
  // Independent answer + claims prevent duplicate/concurrent model calls.
  await call('save',b,{unitId:'core-02',revision:0,fields:{f1:'팀을 위해 시간을 더 썼습니다.'},requestId:crypto.randomUUID()});
  const claims=await Promise.all([call('diagnosis_claim',b,{unitId:'core-02',revision:1,engineVersion:VERSION}),call('diagnosis_claim',b,{unitId:'core-02',revision:1,engineVersion:VERSION})]);
  assert.equal(claims.filter(c=>c.claimed).length,1);const claim=claims.find(c=>c.claimed);
  await call('save',b,{unitId:'core-02',revision:1,fields:{f1:'수정한 답변입니다.'},requestId:crypto.randomUUID()});
  const finished=await call('diagnosis_finish',b,{unitId:'core-02',diagnosisId:claim.diagnosisId,report:validateReport(rawReport(claim.snapshot),claim.snapshot)});assert.equal(finished.diagnosis.stale,true);
  const failedApi=createHandler({...deps,authenticateWeb:async()=>({id:b.id}),diagnosisProvider:async()=>{throw Error('secret diagnostic text');}});
  r=await send(failedApi,{action:'diagnose',unitId:'core-02',revision:2});assert.equal(r.data.diagnosis.status,'failed');assert(!JSON.stringify(r.data).includes('secret'));
  const noProvider=createHandler({...deps,diagnosisProvider:null});assert.equal((await send(noProvider,body)).data.error,'diagnosis_not_configured');
  await assert.rejects(call('diagnosis_claim',a,{unitId:'other',revision:0,engineVersion:VERSION}),/invalid_request/);
  await db.exec("set role anon");await assert.rejects(db.query('select * from ip_pa_diagnoses'),/permission denied/);await assert.rejects(call('diagnosis_get',a,{unitId:'core-01'}),/permission denied/);await db.exec('reset role');
  await db.exec('set role service_role');assert.equal((await call('diagnosis_get',a,{unitId:'core-01'})).diagnosis.status,'completed');await db.exec('reset role');
  const expired=await call('diagnosis_claim',b,{unitId:'core-02',revision:2,engineVersion:VERSION});assert(expired.claimed);
  await db.query("update ip_pa_diagnoses set expires_at=now()-interval '1 second' where id=$1",[expired.diagnosisId]);
  assert.equal((await call('diagnosis_get',b,{unitId:'core-02'})).diagnosis.status,'failed');
  assert.equal((await call('diagnosis_finish',b,{unitId:'core-02',diagnosisId:expired.diagnosisId,report:validateReport(rawReport(expired.snapshot),expired.snapshot)})).diagnosis.status,'failed');
  await db.query("insert into ip_pa_diagnoses(student_id,unit_id,answer_revision,answer_hash,criteria_hash,engine_version,snapshot,status) select $1,'core-02',1,'quota','quota','quota','{}','failed' from generate_series(1,40)",[b.id]);
  await assert.rejects(call('diagnosis_claim',b,{unitId:'core-02',revision:2,engineVersion:VERSION}),/diagnosis_limit/);
  console.log('PASS diagnosis: 25 rubrics/100 criteria, private seeded guidance, exact evidence, saved reports, cache, answer/guidance revisions, ownership, duplicate claims, failure, timeout, no automatic submission, RLS.');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={rawReport};
