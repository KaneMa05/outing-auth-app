const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {createDb}=require('./helpers/interview-db.cjs');
const {units,studentUnits}=require('../lib/preassignment-catalog.cjs');
const migration='supabase/migrations/20261023064604_interview_preassignments.sql';
async function setup({withDiagnosis=true}={}){
 const {db,invoke}=await createDb();await db.exec(fs.readFileSync(migration,'utf8'));await db.exec(fs.readFileSync('supabase/migrations/20261023073656_interview_preassignment_guidance.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261023074848_interview_preassignment_core25_only.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261023130354_interview_preassignment_deadline_nov9.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261024125918_core25_question_one_wording.sql','utf8'));
 if(withDiagnosis)await db.exec(fs.readFileSync('supabase/migrations/20261023124834_interview_preassignment_diagnosis.sql','utf8'));
 const admin={type:'admin',id:'qa'},a={type:'student',id:'ip-a'},b={type:'student',id:'ip-b'};
 for(const id of ['ip-a','ip-b'])await invoke('admin_member_save',admin,{targetStudentId:id,track:'공채',examNumber:id,enabled:true});
 await invoke('admin_enabled',admin,{enabled:true});
 const call=async(action,actor,body={})=>(await db.query('select '+(action.startsWith('diagnosis_')?'ip_pa_diagnosis_service':action.startsWith('admin_guidance_')?'ip_pa_guidance_service':'ip_preassignment_service')+'($1,$2::jsonb,$3::jsonb) result',[action.startsWith('diagnosis_')?action.slice(10):action,JSON.stringify(actor),JSON.stringify(body)])).rows[0].result;
 return {db,invoke,call,admin,a,b};
}
module.exports={setup,migration};
if(require.main===module)(async()=>{
 const {db,invoke,call,admin,a,b}=await setup();
 const req=()=>crypto.randomUUID();const values=id=>Object.fromEntries(units.find(u=>u.id===id).fields.map(f=>[f.id,'실제 경험과 행동을 정리한 답변']));
 try{
  assert.equal(units.filter(u=>u.id.startsWith('core-')).length,25);assert.equal(units.filter(u=>u.id==='other').length,1);
  assert.equal((await call('bootstrap',a)).settings.enabled,false);await assert.rejects(call('save',a,{unitId:'core-01'}),/disabled/);
  await assert.rejects(call('admin_list',a),/forbidden/);await assert.rejects(call('bootstrap',admin),/forbidden/);
  let cfg=(await call('admin_list',admin)).settings;
  assert.equal(Date.parse(cfg.due_at),Date.parse('2026-11-10T00:00:00+09:00'));assert.equal(cfg.due_at,cfg.revision_due_at);
  const boundary=(await db.query("select '2026-11-09T23:59:59.999+09:00'::timestamptz < due_at as last_minute, '2026-11-10T00:00:00+09:00'::timestamptz >= due_at as next_day from ip_pa_settings where id")).rows[0];assert.deepEqual(boundary,{last_minute:true,next_day:true});

  cfg=(await call('admin_settings',admin,{revision:cfg.revision,enabled:true,dueAt:'2099-11-09T00:00:00+09:00',revisionDueAt:'2099-11-10T00:00:00+09:00',allowLate:true})).settings;
  let boot=await call('bootstrap',a);assert.equal(boot.units.length,25);assert(boot.units.every(u=>u.status==='empty'));
  const defs=(await db.query('select id,fields,prompt from ip_pa_units')).rows;for(const u of units){assert.deepEqual(defs.find(d=>d.id===u.id).fields,u.fields);assert.equal(defs.find(d=>d.id===u.id).prompt,u.prompt);assert.equal(u.fields.length,1);assert.equal(u.fields[0].label,'내 답변');}
  let payload={unitId:'core-01',revision:0,fields:{f1:'초안'},requestId:req()};
  await call('save',a,payload);await call('save',a,payload);
  assert.equal((await call('detail',a,{unitId:'core-01'})).draft.revision,1);
  await assert.rejects(call('save',a,{...payload,fields:{f1:'다른 내용'}}),/idempotency_conflict/);
  assert.equal((await call('detail',b,{unitId:'core-01',targetStudentId:'ip-a'})).draft,null);
  await assert.rejects(call('submit',a,{unitIds:['core-01'],revisions:{'core-01':1},fields:{f1:'   '},requestId:req()}),/incomplete/);
  const submitted={unitIds:['core-01'],revisions:{'core-01':1},fields:values('core-01'),requestId:req()};
  let receipt=await call('submit',a,submitted);assert.deepEqual(await call('submit',a,submitted),receipt);
  assert.equal((await call('submit',a,{...submitted,requestId:req()})).receipts[0].reused,true);
  let detail=await call('detail',a,{unitId:'core-01'});const firstId=detail.latest.id;
  assert.equal(detail.latest.round,1);assert.equal(detail.latest.late,false);
  await call('save',a,{unitId:'core-01',revision:detail.draft.revision,fields:{f1:'수정 중인 초안'},requestId:req()});
  assert.deepEqual((await call('detail',a,{unitId:'core-01'})).latest.fields,submitted.fields,'Submitted snapshot is independent');
  assert.equal((await call('admin_detail',admin,{targetStudentId:a.id,unitId:'core-01'})).draft,null,'Teachers only receive submitted answers');
  await assert.rejects(call('submit',a,{...submitted,requestId:req()}),/revision_conflict/,'A stale retry cannot overwrite an edited draft');
  detail=await call('detail',a,{unitId:'core-01'});
  const next={...submitted,revisions:{'core-01':detail.draft.revision},fields:{...submitted.fields,f1:'구체적인 행동을 추가했습니다.'},requestId:req()};
  const results=await Promise.allSettled([call('submit',a,next),call('submit',a,{...next,fields:{...next.fields,f1:'다른 탭 수정'},requestId:req()})]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  const history=await call('history',a,{unitId:'core-01'});assert.equal(history.total,2);assert.deepEqual(history.rounds[1].fields,submitted.fields);
  await assert.rejects(call('admin_review',admin,{submissionId:firstId,revision:0,status:'approved',feedback:''}),/unsupported_action/);
  await assert.rejects(call('submit',a,{unitIds:['core-02','core-03'],revisions:{'core-02':0,'core-03':0},fields:{f1:'답변'},requestId:req()}),/invalid_request/);
  await assert.rejects(call('submit',a,{unitIds:['core-02'],revisions:{'core-02':0},fields:{f1:'답변',f2:'출제 의도'},requestId:req()}),/invalid_request/);
  await assert.rejects(call('submit',a,{unitIds:['core-02'],revisions:{'core-02':0},fields:{},fileIds:['fake'],requestId:req()}),/invalid_request/);
  for(const u of studentUnits){
   let d=await call('detail',a,{unitId:u.id});
   if(!d.latest){await call('submit',a,{unitIds:[u.id],revisions:{[u.id]:d.draft?.revision||0},fields:values(u.id),requestId:req()});d=await call('detail',a,{unitId:u.id});}
  }
  boot=await call('bootstrap',a);assert.equal(boot.units.filter(u=>u.id.startsWith('core-')&&u.round).length,25);assert(!boot.units.some(u=>u.id==='other'));
  assert(boot.units.every(u=>u.status==='submitted'));assert.equal((await call('admin_list',admin,{status:'complete'})).total,1,'Completion requires only 25 core answers');
  assert.equal((await call('admin_list',admin,{status:'empty'})).total,1);
  await db.query("insert into ip_pa_drafts(student_id,unit_id,fields,revision) values($1,'other',$2::jsonb,1)",[a.id,JSON.stringify({f1:'보존할 기존 기타 답변'})]);
  await db.query("insert into ip_pa_submissions(student_id,unit_id,round,fields,definition,fingerprint,late) select $1,'other',1,$2::jsonb,to_jsonb(u),'legacy-other',false from ip_pa_units u where id='other'",[a.id,JSON.stringify({f1:'보존할 기존 기타 답변'})]);
  await db.query("update ip_pa_drafts set latest_id=(select id from ip_pa_submissions where student_id=$1 and unit_id='other') where student_id=$1 and unit_id='other'",[a.id]);
  assert.equal((await call('admin_list',admin,{status:'complete'})).students[0].submitted,25);
  assert.equal((await call('admin_history',admin,{targetStudentId:a.id,unitId:'other'})).rounds[0].fields.f1,'보존할 기존 기타 답변');
  assert(!(await call('detail',a,{unitId:'core-01'})).units.some(u=>u.id==='other'));
  for(const action of ['detail','history','save'])await assert.rejects(call(action,a,{unitId:'other',revision:1,fields:{f1:'수정'},requestId:req()}),/invalid_request/);
  await assert.rejects(call('submit',a,{unitIds:['other'],revisions:{other:1},fields:{f1:'수정'},requestId:req()}),/invalid_request/);

  await call('admin_settings',admin,{revision:cfg.revision,enabled:true,dueAt:'2000-01-01T00:00:00Z',revisionDueAt:'2000-01-02T00:00:00Z',allowLate:false});
  const late={unitIds:['core-25'],revisions:{'core-25':0},fields:{f1:'기한 이후 답변'},requestId:req()};await assert.rejects(call('submit',b,late),/deadline_passed/);
  cfg=(await call('admin_list',admin)).settings;
  await call('admin_settings',admin,{revision:cfg.revision,enabled:true,dueAt:cfg.due_at,revisionDueAt:cfg.revision_due_at,allowLate:true});await call('submit',b,late);
  assert.equal((await call('detail',b,{unitId:'core-25'})).latest.late,true);
  assert.equal((await invoke('writing_list',a)).writings.length,0,'Existing writing records unchanged');
  assert.equal((await invoke('life_get',a)).profile,null,'Existing experience profile unchanged');
  await db.exec('set role anon');await assert.rejects(db.query('select * from ip_pa_submissions'),/permission denied/);await assert.rejects(db.query("select ip_preassignment_service('bootstrap','{}','{}')"),/permission denied/);await db.exec('reset role');
  await db.exec('set role service_role');assert.equal((await call('bootstrap',a)).units.length,25);await db.exec('reset role');
  const rls=(await db.query("select relrowsecurity from pg_class where relname like 'ip_pa_%' and relkind='r'")).rows;assert.equal(rls.length,10);assert(rls.every(x=>x.relrowsecurity));
  console.log('PASS preassignments DB: 25 only, retired other preserved, one answer, disabled gate, snapshots, idempotency, concurrent edits, no teacher review, submission completion, deadlines, RLS and legacy isolation.');
 }finally{await db.close();}
})().catch(e=>{console.error(e.message,e.where||'',e.stack?.split('\n').slice(0,4).join('\n'));process.exitCode=1;});
