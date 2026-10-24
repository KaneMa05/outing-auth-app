const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {createDb}=require('./helpers/interview-db.cjs');
const {createHandler}=require('../api/interview-prep'),auth=require('../api/teacher-auth-utils');
(async()=>{
 const source=fs.readFileSync('supabase/seeds/interview-corpus.json'),corpus=JSON.parse(source);
 const data=JSON.parse(fs.readFileSync('supabase/seeds/interview-personality-analysis.json','utf8'));
 assert.equal(data.report.source_sha256,crypto.createHash('sha256').update(source).digest('hex'));
 assert.equal(data.analyses.length,2952);assert.equal(data.elements.length,31);
 assert.equal(new Set(data.elements.map(e=>e.topic_id)).size,13);
 assert.equal(new Set(data.analyses.map(a=>a.question_id)).size,2952);
 const ids=new Set(data.elements.map(e=>e.id)),qs=new Map(corpus.questions.map(q=>[q.id,q]));
 for(const a of data.analyses){
   assert.equal(qs.get(a.question_id).category,'personality');
   assert.equal(qs.get(a.question_id).prompt,a.source_prompt);
   assert.equal(a.status,'draft');
   assert(a.element_ids.every(id=>ids.has(id)));
   assert(a.evidence.every(e=>a.source_prompt.includes(e.quote)));
   if(a.disposition==='personal')assert(a.element_ids.length>0);
 }
 const find=prompt=>data.analyses.find(a=>a.source_prompt===prompt);
 assert.equal(find('개인정보 보호법을 설명해보세요.').disposition,'knowledge_review');
 assert.equal(find('식사여부').disposition,'rapport');
 assert(find('탕비실에서 직원이 일주일 굶었다 이 직원이 탕비실에 물건을 집에 가져가려는데 다른 직원과 마주쳐서 싸운다. 지원자는 중재를 어떻게?').element_ids.includes('conflict-mediation'));
 assert.equal(find('이유는요?').disposition,'context_needed');
 const {db,invoke}=await createDb(),admin={type:'admin',id:'qa'},student={type:'student',id:'ip-a'};
 try{
   await db.exec(fs.readFileSync('supabase/seeds/interview-corpus.sql','utf8'));
   const seed=fs.readFileSync('supabase/seeds/interview-personality-analysis.sql','utf8');
   await db.exec(seed);await db.exec(seed);
   assert.equal(Number((await db.query('select count(*) n from ip_question_analysis')).rows[0].n),2952);
   const catalog=await invoke('admin_analysis_catalog',admin);
   assert.equal(catalog.elements.length,31);assert.equal(catalog.reviewed,0);
   assert.equal(Object.values(catalog.counts).reduce((a,b)=>a+b,0),2952);
   assert.equal((await invoke('admin_analysis_questions',admin,{search:'개인정보 보호법을 설명'})).questions[0].disposition,'knowledge_review');
   const q=(await invoke('admin_analysis_questions',admin,{elementId:'shared-goal'})).questions[0];
   const detail=await invoke('admin_analysis_detail',admin,{id:q.id});assert(detail.analysis.evidence.length);
   const payload={id:q.id,revision:1,questionRevision:q.question_revision,elementIds:['shared-goal','mutual-support'],
     disposition:'personal',answerForm:'experience',rationale:'본인의 역할과 동료 지원 행동, 공동 결과를 구분하여 확인합니다.',status:'reviewed'};
   await invoke('admin_analysis_save',admin,payload);
   assert.equal((await invoke('admin_analysis_catalog',admin)).reviewed,1);
   // Approval does not publish questions or alter the student notebook.
   assert.equal((await invoke('admin_question_detail',admin,{id:q.id})).question.status,'draft');
   assert.equal(Number((await db.query('select count(*) n from ip_notes')).rows[0].n),0);
   await db.exec(seed);assert.equal((await invoke('admin_analysis_detail',admin,{id:q.id})).analysis.revision,2);
   await assert.rejects(invoke('admin_analysis_save',admin,payload),/revision_conflict/);
   await assert.rejects(invoke('admin_analysis_save',admin,{...payload,revision:2,elementIds:['invalid']}),/invalid_request/);
   await assert.rejects(invoke('admin_analysis_save',admin,{...payload,revision:2,elementIds:[]}),/invalid_request/);
   await assert.rejects(invoke('admin_analysis_save',admin,{...payload,revision:2,disposition:'unresolved'}),/invalid_request/);
   const existing=detail.question;
   await invoke('admin_question_save',admin,{id:q.id,revision:existing.revision,prompt:'질문이 바뀌었으니 의미를 다시 확인해주세요.',
     category:'personality',topicIds:['teamwork'],tracks:existing.tracks,status:'draft'});
   const stale=await invoke('admin_analysis_detail',admin,{id:q.id});
   assert(stale.stale);assert.equal(stale.analysis.status,'draft');assert.equal(stale.analysis.revision,3);
   assert.equal((await invoke('admin_analysis_catalog',admin)).reviewed,0);
   assert((await invoke('admin_analysis_questions',admin,{analysisStatus:'stale'})).questions.some(row=>row.id===q.id));
   await assert.rejects(invoke('admin_analysis_save',admin,{...payload,revision:3}),/revision_conflict/);
   await invoke('admin_analysis_save',admin,{...payload,revision:3,questionRevision:stale.question.revision});
   const renewed=await invoke('admin_analysis_detail',admin,{id:q.id});
   assert(!renewed.stale);assert.deepEqual(renewed.analysis.evidence,[],'Old wording evidence must not survive new text');
   const job=(await invoke('admin_questions',admin,{category:'job'})).questions[0];
   await assert.rejects(invoke('admin_analysis_detail',admin,{id:job.id}),/question_unavailable/);
   await assert.rejects(invoke('admin_analysis_save',admin,{...payload,id:job.id}),/question_unavailable/);
   for(const action of ['admin_analysis_catalog','admin_analysis_questions','admin_analysis_detail','admin_analysis_save'])
     await assert.rejects(invoke(action,student,{id:q.id}),/forbidden/);
   for(const role of ['anon','authenticated']){
     await db.exec('set role '+role);
     await assert.rejects(db.query('select * from ip_question_analysis'),/permission denied/);
     await assert.rejects(db.query('select * from ip_elements'),/permission denied/);
     await assert.rejects(invoke('admin_analysis_catalog',admin),/permission denied/);
     await db.exec('reset role');
   }
   assert((await db.query("select relrowsecurity from pg_class where relname in ('ip_elements','ip_question_analysis')")).rows.every(x=>x.relrowsecurity));
   await db.exec('set role service_role');assert.equal((await invoke('admin_analysis_catalog',admin)).ok,true);await db.exec('reset role');
   // Signed admin permissions remain the HTTP boundary for the new RPC.
   process.env.TEACHER_SESSION_SECRET='analysis-test-only';
   const handler=createHandler({invoke,authenticate:async()=>({id:'18120'})});
   const call=async(body,permissions)=>{let code;const cookie=permissions?auth.COOKIE_NAME+'='+auth.createSessionToken(process.env.TEACHER_SESSION_SECRET,{username:'qa',role:'admin',permissions}):'';
     await handler({method:'POST',headers:{host:'localhost',cookie},body},{setHeader(){},status(c){code=c;return this;},json(){}});return code;};
   assert.equal(await call({action:'admin_analysis_catalog'}),401);
   assert.equal(await call({action:'admin_analysis_catalog'},['interview.read']),200);
   assert.equal(await call({action:'admin_analysis_save',...payload},['interview.read']),403);
   assert.equal(await call({action:'admin_analysis_save'},['interview.write']),400);
   assert.equal(await call({action:'admin_analysis_save',...payload,rationale:'x'.repeat(4001)},['interview.write']),400);
   const history=(await db.query("select count(*) n from ip_history where entity='analysis'")).rows[0].n;
   assert.equal(Number(history),2);
   console.log('PASS personality analysis: 2,952 exact-source records, 31 elements, semantic examples, idempotence, review/edit conflicts, stale invalidation, RLS and admin-only permissions.');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
