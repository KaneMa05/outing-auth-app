const assert=require('node:assert/strict'),fs=require('node:fs');
const {createDb}=require('./helpers/interview-db.cjs');
(async()=>{
 const core=JSON.parse(fs.readFileSync('supabase/seeds/interview-core30.json','utf8'));
 assert.equal(core.items.length,47);
 assert.equal(core.items.filter(i=>i.kind==='main').length,25);
 assert.equal(core.items.filter(i=>i.kind==='appendix').length,22);
 assert.equal(core.report.new_questions,45);assert.equal(core.report.existing_exact_questions,2);
 assert.equal(new Set(core.items.map(i=>i.question_id)).size,47);
 assert.equal(core.analyses.length,47);assert(core.analyses.every(a=>a.element_ids.length>0&&a.status==='draft'));
 const original=JSON.parse(fs.readFileSync('supabase/seeds/interview-corpus.json','utf8'));
 const originalIds=new Set(original.questions.map(q=>q.id));
 const duplicate=core.questions.find(q=>originalIds.has(q.id));
 const {db,invoke}=await createDb(),admin={type:'admin',id:'qa'},student={type:'student',id:'ip-a'};
 try{
  await db.exec(fs.readFileSync('supabase/seeds/interview-corpus.sql','utf8'));
  await db.exec(fs.readFileSync('supabase/seeds/interview-personality-analysis.sql','utf8'));
  // A reviewed duplicate must remain the user's version after core import.
  const old=(await invoke('admin_question_detail',admin,{id:duplicate.id})).question;
  await invoke('admin_question_save',admin,{id:old.id,revision:old.revision,prompt:old.prompt,
    category:'personality',topicIds:['self'],tracks:[],status:'draft'});
  const oldAnalysis=(await invoke('admin_analysis_detail',admin,{id:old.id})).analysis;
  await invoke('admin_analysis_save',admin,{id:old.id,revision:oldAnalysis.revision,questionRevision:2,
    elementIds:['self-awareness'],disposition:'personal',answerForm:'profile',status:'reviewed',rationale:'기존 관리자가 검토한 질문의 요소 분석을 그대로 보존합니다.'});
  const seed=fs.readFileSync('supabase/seeds/interview-core30.sql','utf8');
  await db.exec(seed);await db.exec(seed);
  assert.equal(Number((await db.query('select count(*) n from ip_questions')).rows[0].n),5128);
  assert.equal(Number((await db.query('select count(*) n from ip_occurrences')).rows[0].n),5481);
  assert.equal(Number((await db.query('select count(*) n from ip_question_analysis')).rows[0].n),2997);
  assert.equal((await invoke('admin_question_detail',admin,{id:old.id})).question.revision,2);
  assert.equal((await invoke('admin_analysis_detail',admin,{id:old.id})).analysis.status,'reviewed');
  const main=await invoke('admin_core_questions',admin,{coreKind:'main'});
  assert.equal(main.questions.length,25);assert.equal(main.questions[0].position,1);assert.equal(main.questions[24].position,25);
  assert(main.questions.every(q=>q.collection_element_ids.length>0&&q.collection_analysis));
  assert.equal((await invoke('admin_core_questions',admin,{coreKind:'appendix'})).questions.length,22);
  assert.equal((await invoke('admin_core_questions',admin,{page:1})).questions.length,17);
  await assert.rejects(invoke('core_questions',student),/not_enrolled/);
  await invoke('admin_member_save',admin,{targetStudentId:'ip-a',track:'공채',examNumber:'test',enabled:true});
  await invoke('admin_enabled',admin,{enabled:true});
  assert.equal((await invoke('core_questions',student)).questions.length,0);
  const first=main.questions[0];
  await invoke('admin_question_save',admin,{id:first.id,revision:first.revision,prompt:first.prompt,category:'personality',
    topicIds:first.topic_ids,tracks:[],status:'published'});
  const visible=(await invoke('core_questions',student)).questions;
  assert.equal(visible.length,1);assert.equal(visible[0].id,first.id);
  for(const key of ['answer','collection_analysis','collection_element_ids','analysis_note'])assert(!(key in visible[0]));
  const detail=await invoke('question_detail',student,{id:first.id});
  assert(detail.sources.some(s=>s.filename===core.report.filename));assert(detail.sources.every(s=>!('answer' in s)));
  const adminDetail=await invoke('admin_question_detail',admin,{id:first.id});
  assert(adminDetail.sources.some(s=>s.answer.includes('연관')&&s.locator.includes('record-offset')));
  await invoke('admin_question_save',admin,{id:first.id,revision:first.revision+1,prompt:first.prompt,category:'job',
    topicIds:[],tracks:[],status:'published'});
  assert.equal((await invoke('core_questions',student)).questions.length,0,'Job category must not appear in personality library');
  await assert.rejects(invoke('admin_core_questions',student),/forbidden/);
  for(const role of ['anon','authenticated']){
    await db.exec('set role '+role);
    await assert.rejects(db.query('select * from ip_collection_items'),/permission denied/);
    await assert.rejects(invoke('admin_core_questions',admin),/permission denied/);
    await db.exec('reset role');
  }
  await db.exec('set role service_role');assert.equal((await invoke('admin_core_questions',admin)).ok,true);await db.exec('reset role');
  await invoke('admin_member_save',admin,{targetStudentId:'ip-a',track:'공채',examNumber:'test',enabled:true,expiresOn:'2020-01-01'});
  await assert.rejects(invoke('core_questions',student),/not_enrolled/);
  // Stable note keys and genuinely distinct prompts across topics/elements.
  const {topicQuestions,elementQuestions}=await import('../interview-prep-prompts.js');
  assert.equal(Object.keys(topicQuestions).length,13);assert.equal(elementQuestions.length,31);
  assert.equal(new Set(elementQuestions.map(e=>e[1])).size,31);
  assert.equal(new Set(elementQuestions.map(e=>e[3])).size,31);
  const keys={experience:['situation','role','action','result','learning'],value:['position','reason','application'],situation:['criteria','steps','caution']};
  for(const t of Object.values(topicQuestions))assert.deepEqual(t.fields.map(f=>f[0]),keys[t.kind]);
  assert.notEqual(topicQuestions.teamwork.fields[2][1],topicQuestions.communication.fields[2][1]);
  console.log('PASS core collection: actual 25+22 source questions, 45 new/2 reused, preserved edits, 47 element mappings, private commentary, student access/category boundaries, and 31 distinct prompts.');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
