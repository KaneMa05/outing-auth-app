const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {createDb}=require('./helpers/interview-db.cjs');
const {createHandler,_private}=require('../api/interview-prep'),auth=require('../api/teacher-auth-utils');
(async()=>{
 const corpus=JSON.parse(fs.readFileSync('supabase/seeds/interview-corpus.json','utf8'));
 const bundle=JSON.parse(fs.readFileSync('supabase/seeds/interview-rubric-drafts.json','utf8'));
 const qs=new Map(corpus.questions.map(q=>[q.id,q])),occ=new Map(corpus.occurrences.map(o=>[o.id,o]));
 assert.equal(bundle.report.source_sha256,crypto.createHash('sha256').update(fs.readFileSync('supabase/seeds/interview-corpus.json')).digest('hex'));
 assert.equal(bundle.records.length,2519);assert.equal(new Set(bundle.records.map(r=>r.question_id)).size,2519);
 assert.equal(bundle.report.with_authored_criteria,10);
 for(const r of bundle.records){
  assert.equal(qs.get(r.question_id).prompt,r.source_prompt);assert.equal(r.status,'draft');assert.equal(r.score_map,null);
  assert(r.source_prompt.includes(r.classification.quote));
  for(const a of r.source_answers){assert.equal(occ.get(a.occurrence_id).question_id,r.question_id);assert.equal(occ.get(a.occurrence_id).answer,a.text);}
  for(const t of r.term_candidates)assert(occ.get(t.occurrence_id).answer.includes(t.quote));
  for(const c of r.criteria)assert(r.source_answers.some(a=>a.text.includes(c.source_quote)));
  for(const p of r.provenance)for(const n of p.neighbors){assert.equal(n.source_id,p.source_id);assert.equal(occ.get(n.occurrence_id).original_prompt,n.prompt);assert.equal(n.relation,'source_neighbor_not_confirmed_parent');}
 }
 const kind=p=>bundle.records.find(r=>r.source_prompt===p)?.classification.kind;
 assert.equal(kind('개인정보 보호법을 설명해보세요.'),'job_knowledge');
 assert.equal(kind('검언유착과 관련된 본인의 생각을 말해보시오.'),'personality_opinion');
 assert.equal(kind('실습한 선박 엔진타입'),'profile');assert.equal(kind('이유는요?'),'followup');
 const {db,invoke}=await createDb(),admin={type:'admin',id:'rubric-qa'};
 try{
  await db.exec(fs.readFileSync('supabase/seeds/interview-corpus.sql','utf8'));
  const seed=fs.readFileSync('supabase/seeds/interview-rubric-drafts.sql','utf8');await db.exec(seed);await db.exec(seed);
  assert.equal(Number((await db.query('select count(*) n from ip_question_rubrics')).rows[0].n),2519);
  assert.equal((await invoke('admin_rubric_list',admin)).reviewed,0);
  const sample=bundle.records.find(r=>r.criteria.length),detail=await invoke('admin_rubric_detail',admin,{id:sample.question_id});
  assert.equal(detail.sources.length,sample.provenance.length);
  const payload={id:sample.question_id,revision:1,questionRevision:detail.question.revision,kind:'job_knowledge',rationale:'시험용 필수 표현과 문맥을 테스트용으로 검토합니다.',criteria:sample.criteria,criticalErrors:sample.critical_errors,verificationNote:'테스트용 검증 근거입니다. 실제 출제 승인과 무관합니다.',scoreMap:{O:2,partial:1,X:0},status:'reviewed'};
  await assert.rejects(invoke('admin_rubric_save',admin,{...payload,criteria:[]}),/rubric_incomplete/);
  await assert.rejects(invoke('admin_rubric_save',admin,{...payload,scoreMap:null}),/rubric_incomplete/);
  await assert.rejects(invoke('admin_rubric_save',admin,{...payload,kind:'hold'}),/rubric_incomplete/);
  await assert.rejects(invoke('admin_rubric_save',admin,{...payload,verificationNote:''}),/rubric_incomplete/);
  for(const criteria of [[{label:'a',terms:[],context:'b',reject_context:'c'}],[{label:'a',terms:[''],context:'b',reject_context:'c'}],[{label:'a',terms:[12],context:'b',reject_context:'c'}]])await assert.rejects(invoke('admin_rubric_save',admin,{...payload,criteria}),/invalid_request/);
  await assert.rejects(invoke('admin_rubric_save',admin,{...payload,scoreMap:{O:1,partial:2,X:0}}),/invalid_request/);
  await invoke('admin_rubric_save',admin,payload);
  assert.equal((await invoke('admin_rubric_list',admin)).reviewed,1);
  await assert.rejects(invoke('admin_rubric_save',admin,payload),/revision_conflict/);
  await db.exec(seed);
  const saved=await invoke('admin_rubric_detail',admin,{id:payload.id});assert.equal(saved.rubric.revision,2);assert.equal(saved.rubric.status,'reviewed');
  assert.equal((await invoke('admin_question_detail',admin,{id:payload.id})).question.status,'draft');
  assert.equal(Number((await db.query('select count(*) n from ip_notes')).rows[0].n),0);
  assert.equal(Number((await db.query("select count(*) n from ip_history where entity='rubric'")).rows[0].n),1);
  // Source edits invalidate approval and prevent an old browser from approving stale criteria.
  await invoke('admin_question_save',admin,{id:payload.id,revision:detail.question.revision,prompt:detail.question.prompt+' 추가 질문',category:detail.question.category,topicIds:[],tracks:detail.question.tracks,status:'draft'});
  const changed=await invoke('admin_rubric_detail',admin,{id:payload.id});assert(changed.stale);assert.equal(changed.rubric.status,'draft');assert.equal(changed.rubric.revision,3);
  assert.equal((await invoke('admin_rubric_list',admin,{status:'stale'})).questions[0].id,payload.id);
  await assert.rejects(invoke('admin_rubric_save',admin,{...payload,revision:3}),/revision_conflict/);
  await invoke('admin_rubric_save',admin,{...payload,revision:3,questionRevision:changed.question.revision,status:'draft',scoreMap:null});
  assert(!(await invoke('admin_rubric_detail',admin,{id:payload.id})).stale);
  // Read/write permissions, RLS and per-action authentication.
  for(const action of ['admin_rubric_list','admin_rubric_detail','admin_rubric_save'])await assert.rejects(invoke(action,{type:'student',id:'ip-a'},{id:payload.id}),/forbidden/);
  for(const role of ['anon','authenticated']){
   await db.exec('set role '+role);await assert.rejects(db.query('select * from ip_question_rubrics'),/permission denied/);await assert.rejects(invoke('admin_rubric_list',admin),/permission denied/);await db.exec('reset role');
  }
  await db.exec('set role service_role');assert((await invoke('admin_rubric_list',admin)).ok);await db.exec('reset role');
  process.env.TEACHER_SESSION_SECRET='rubric-local-test';const handler=createHandler({invoke});
  async function call(body,permissions){let code;const cookie=permissions?auth.COOKIE_NAME+'='+auth.createSessionToken(process.env.TEACHER_SESSION_SECRET,{username:'qa',role:'admin',permissions}):'';
   await handler({method:'POST',headers:{host:'localhost',cookie},body},{setHeader(){},status(c){code=c;return this;},json(){}});return code;}
  assert.equal(await call({action:'admin_rubric_list'}),401);
  assert.equal(await call({action:'admin_rubric_list'},['interview.read']),200);
  assert.equal(await call({action:'admin_rubric_save',...payload},['interview.read']),403);
  assert.equal(await call({action:'admin_rubric_save',...payload,criteria:[{label:'x',terms:[''],context:'x',reject_context:'x'}]},['interview.write']),400);
  assert.throws(()=>_private.validate({action:'admin_rubric_save',...payload,scoreMap:undefined}),/invalid_request/);
  assert.throws(()=>_private.validate({action:'admin_rubric_detail'}),/invalid_request/);
  const security=await db.query("select relrowsecurity from pg_class where relname='ip_question_rubrics'");assert(security.rows[0].relrowsecurity);
  console.log('PASS rubric drafts: source evidence, classification, pagination, idempotence, authoring gates, scoring ranges, stale invalidation, admin authorization and RLS.');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
