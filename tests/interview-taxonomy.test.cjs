const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createPublicationFixture}=require('./helpers/interview-publication-fixture.cjs');
const {taxonomySql}=require('../scripts/interview-question-taxonomy.cjs');
const {validateTaxonomy}=require('../lib/interview-taxonomy.cjs');
const seed=require('../supabase/seeds/interview-question-taxonomy.json');
const migration='supabase/migrations/20261102073138_interview_question_taxonomy.sql';
const md5=s=>crypto.createHash('md5').update(s).digest('hex');
(async()=>{
 assert.equal(seed.rows.length,1775);assert.equal(new Set(seed.rows.map(q=>q.id)).size,1775);
 assert.equal(seed.rows.filter(q=>q.target_category==='personality').length,48);assert.equal(seed.rows.filter(q=>q.taxonomy.reviewStatus==='needs_context').length,51);
 const f=await createPublicationFixture(),{db,invoke,admin,student}=f;
 const call=async(action,actor,body={})=>(await db.query('select public.ip_taxonomy_service($1,$2::jsonb,$3::jsonb) result',[action,JSON.stringify(actor),JSON.stringify(body)])).rows[0].result;
 try{
  for(const name of ['20261020063234_interview_ai_pipeline.sql','20261020073140_interview_ai_readiness.sql','20261020074446_interview_ai_load_protection.sql','20261020081526_interview_ai_single_question.sql','20261021060740_interview_live_sessions.sql','20261102055745_interview_original_source_tracks.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+name,'utf8'));
  await db.exec(fs.readFileSync(migration,'utf8'));
  assert.equal((await db.query("select has_table_privilege('anon','public.ip_question_taxonomy','select') ok")).rows[0].ok,false);
  assert.equal((await db.query("select has_table_privilege('authenticated','public.ip_question_taxonomy','update') ok")).rows[0].ok,false);
  assert.equal((await db.query("select has_function_privilege('anon','public.ip_taxonomy_service(text,jsonb,jsonb)','execute') ok")).rows[0].ok,false);
  assert.equal((await db.query("select has_function_privilege('service_role','public.ip_taxonomy_service(text,jsonb,jsonb)','execute') ok")).rows[0].ok,true);
  assert.equal((await db.query("select relrowsecurity from pg_class where oid='public.ip_question_taxonomy'::regclass")).rows[0].relrowsecurity,true);
  for(const actor of [student,{}, {type:'admin',id:''}])await assert.rejects(call('admin_questions',actor,{category:'job'}),/forbidden/);
  const valid={action:'admin_question_taxonomy_save',id:'publication-job',questionRevision:1,revision:0,primaryField:'navigation',relatedFields:['international_maritime_law'],answerFormats:['knowledge','situation'],materialTags:[],reviewStatus:'classified',rationale:'항법 적용을 묻는 전공 지식 문항입니다.',contentNote:''};
  validateTaxonomy(valid);
  for(const patch of [{primaryField:'invented'},{relatedFields:['navigation']},{answerFormats:[]},{reviewStatus:'published'},{materialTags:['invented']},{rationale:'x'},{revision:-1}])assert.throws(()=>validateTaxonomy({...valid,...patch}),/invalid_request/);
  const qBefore=await f.question(valid.id);await call(valid.action,admin,valid);assert.deepEqual(await f.question(valid.id),qBefore,'Taxonomy-only save preserves question and approval');
  assert.equal((await call('admin_questions',admin,{category:'job',taxonomyView:'public_navigation'})).total,1);
  assert.equal((await call('admin_questions',admin,{category:'job',fieldId:'international_maritime_law',answerFormat:'situation'})).questions[0].id,valid.id);
  assert.equal((await call('admin_questions',admin,{category:'job',taxonomyStatus:'unclassified'})).total,1);
  await assert.rejects(call(valid.action,admin,valid),/revision_conflict/);
  await assert.rejects(call(valid.action,admin,{...valid,revision:1,questionRevision:999}),/revision_conflict/);
  await assert.rejects(call(valid.action,admin,{...valid,revision:1,primaryField:''}),/invalid_request/);
  await assert.rejects(call('admin_questions',admin,{category:'job',fieldId:'invented'}),/invalid_request/);
  await invoke('admin_question_save',admin,{id:valid.id,revision:1,prompt:'새 항법 판단 질문입니다.',category:'job',topicIds:[],tracks:['공채'],status:'draft'});
  const stale=(await call('admin_question_detail',admin,{id:valid.id})).question.taxonomy;
  assert.equal(stale.review_status,'needs_context');assert.equal(stale.stale,true);assert.equal(stale.revision,2);
  assert.equal((await call('admin_questions',admin,{category:'job',taxonomyView:'public_navigation'})).total,0);
  await call(valid.action,admin,{...valid,revision:2,questionRevision:2});assert.equal((await call('admin_question_detail',admin,{id:valid.id})).question.taxonomy.stale,false);
  // Import uses separate fixture rows, including published and archived moves.
  await db.exec(`insert into ip_sources(id,filename,sha256,track) values('tax-source','fixture.hwpx','fixture','공채');
   insert into ip_questions(id,prompt,category,tracks,status) values('tax-a','지원동기를 설명해주세요.','job',array['공채'],'published'),('tax-b','보관된 인성 질문입니다.','job',array['공채'],'archived'),('tax-c','기술 용어의 원문이 필요합니다.','job',array['기관'],'draft');
   insert into ip_occurrences(id,source_id,question_id,number,locator,original_prompt,answer) select 'o-'||id,'tax-source',id,'1','paragraph:1',prompt,'원문 해설' from ip_questions where id like 'tax-%';
   insert into ip_question_rubrics(question_id,source_prompt,source_category,kind,rationale,status,reviewer,reviewed_at) select id,prompt,category,'job_knowledge','종전 직무 분류 기준','reviewed','qa',now() from ip_questions where id='tax-a';
   insert into ip_question_analysis(question_id,source_prompt,source_category,disposition,answer_form,method,rationale,status,reviewer,reviewed_at) select id,prompt,'personality','personal','experience','test','종전 분석','reviewed','qa',now() from ip_questions where id='tax-a';`);
  const before=(await db.query('select * from ip_questions order by id')).rows;
  const rows=before.filter(q=>q.id.startsWith('tax-')).map(q=>({id:q.id,prompt:q.prompt,category:q.category,status:q.status,revision:q.revision,tracks:q.tracks,sources_md5:md5(['o-'+q.id,'tax-source','공채','',q.prompt,'원문 해설','1',''].join('\x1f')),target_category:q.id==='tax-c'?'job':'personality',taxonomy:{primaryField:'',relatedFields:[],answerFormats:['knowledge'],materialTags:[],reviewStatus:q.id==='tax-c'?'needs_context':'classified',rationale:'검토한 질문 내용에 따른 분류입니다.',contentNote:''}}));
  const review={run_id:'taxonomy-qa',rows},sql=taxonomySql(review);
  await db.exec("update ip_occurrences set answer='changed' where question_id='tax-c'");await assert.rejects(db.exec(sql),/source_conflict/);await db.exec('rollback');
  assert.deepEqual((await db.query('select * from ip_questions order by id')).rows,before,'Source mismatch rolls back preceding category moves');
  await db.exec("update ip_occurrences set answer='원문 해설' where question_id='tax-c'");
  const wrong=structuredClone(review);wrong.rows[2].revision=999;await assert.rejects(db.exec(taxonomySql(wrong)),/revision_conflict/);await db.exec('rollback');
  await db.exec("update ip_questions set status='published',revision=revision+1 where id='tax-c'");
  before.splice(0,before.length,...(await db.query('select * from ip_questions order by id')).rows);
  await db.exec(sql);const after=(await db.query('select * from ip_questions order by id')).rows;
  for(const b of before){const a=after.find(q=>q.id===b.id);if(['tax-a','tax-b'].includes(b.id)){assert.equal(a.category,'personality');assert.equal(a.status,b.status);assert.equal(a.revision,b.revision+(b.status==='published'?2:1));for(const key of ['prompt','tracks','topic_ids'])assert.deepEqual(a[key],b[key]);}else assert.deepEqual(a,b);}
  assert.equal((await db.query("select status from ip_question_rubrics where question_id='tax-a'")).rows[0].status,'draft');
  assert.equal((await db.query("select status from ip_question_analysis where question_id='tax-a'")).rows[0].status,'draft');
  assert((await invoke('questions',student,{category:'personality'})).questions.some(q=>q.id==='tax-a'));
  await db.exec(sql);assert.deepEqual((await db.query('select * from ip_questions order by id')).rows,after);
  assert.equal(Number((await db.query("select count(*) n from ip_history where entity='question_taxonomy_import'")).rows[0].n),3);
  // Exercise every approved classification through the same guarded import.
  await db.query(`insert into ip_questions(id,prompt,category,tracks,status,revision)
   select id,prompt,category,tracks,status,revision from jsonb_to_recordset($1::jsonb) as r(id text,prompt text,category text,tracks text[],status text,revision integer)`,[JSON.stringify(seed.rows)]);
  await db.exec("insert into ip_sources(id,filename,sha256,track) values('full-source','full-fixture.hwpx','fixture','공채');insert into ip_occurrences(id,source_id,question_id,number,locator,original_prompt,answer) select 'full-'||id,'full-source',id,'1','paragraph:1',prompt,'검증 해설' from ip_questions where id like 'q-%';");
  const full=structuredClone(seed);full.run_id='full-taxonomy-qa';full.rows.forEach(r=>r.sources_md5=md5(['full-'+r.id,'full-source','공채','',r.prompt,'검증 해설','1',''].join('\x1f')));
  const fullBefore=(await db.query("select * from ip_questions where id like 'q-%' order by id")).rows;
  const started=Date.now();await db.exec(taxonomySql(full));
  const fullAfter=(await db.query("select * from ip_questions where id like 'q-%' order by id")).rows;
  const byId=new Map(full.rows.map(r=>[r.id,r]));
  for(let i=0;i<fullBefore.length;i++){const b=fullBefore[i],a=fullAfter[i],r=byId.get(b.id);assert.equal(a.id,b.id);assert.equal(a.category,r.target_category);assert.equal(a.status,b.status);assert.equal(a.prompt,b.prompt);assert.deepEqual(a.tracks,b.tracks);if(r.target_category===b.category)assert.deepEqual(a,b);}
  assert.equal(Number((await db.query("select count(*) n from ip_question_taxonomy where question_id like 'q-%'")).rows[0].n),1775);
  assert.equal(Number((await db.query("select count(*) n from ip_question_taxonomy where question_id like 'q-%' and review_status='needs_context'")).rows[0].n),51);
  assert.equal((await call('admin_questions',admin,{category:'job',taxonomyView:'public_navigation'})).total,16,'15 reviewed source questions plus the navigation fixture');
  console.log('Full approved import: 1,775 classifications, 48 category moves, 51 holds, '+(Date.now()-started)+' ms.');
 }finally{await db.close();}
 console.log('PASS taxonomy: permissions, input validation, filters, stale review, optimistic concurrency, atomic source/revision conflicts, category/publication preservation, rubric invalidation, audit and idempotence.');
})().catch(e=>{console.error(e.stack,e.where||'');process.exitCode=1;});
