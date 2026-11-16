'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {createDb}=require('./helpers/interview-db.cjs');
const read=name=>JSON.parse(fs.readFileSync(name,'utf8'));
const data=read('supabase/seeds/interview-question-classification.json');
const corpus=read('supabase/seeds/interview-corpus.json');
const additional=read('scripts/data/interview-additional-questions.json').questions;
const all=[...corpus.questions,...additional];
const source=new Map(all.map(q=>[q.id,q]));
const changes=data.records.filter(r=>r.changed);
const find=prompt=>{const row=data.records.find(r=>r.source_prompt===prompt);assert(row,prompt);return row;};
(async()=>{
 assert.equal(data.records.length,5128);
 assert.equal(new Set(data.records.map(r=>r.question_id)).size,5128);
 assert.equal(data.report.source_sha256,crypto.createHash('sha256').update(fs.readFileSync('supabase/seeds/interview-corpus.json')).digest('hex'));
 assert.equal(data.report.version,'interview-intent-v2');
 assert.equal(changes.length,267);
 assert.equal(data.records.filter(r=>r.changed_from_previous).length,74);
 assert.equal(data.records.filter(r=>r.classification_status==='needs_context').length,54);
 for(const r of data.records){
  assert.equal(source.get(r.question_id).prompt,r.source_prompt);
  assert.equal(source.get(r.question_id).category,r.source_category);
  assert.equal(r.changed,r.category!==r.source_category);
  assert(r.rationale.length>20);
  if(r.changed)assert.equal(r.method,'exact-question-reading-v2');
  assert.equal(r.resolved_category,r.classification_status==='needs_context'?null:r.category);
  if(r.classification_status==='needs_context'){
   assert.equal(r.changed,false);assert.equal(r.category,r.source_category);assert.equal(r.standalone_candidate,false);
  }
  assert.equal(r.evidence.quote,r.source_prompt);
  let lastEnd=0;for(const part of r.assessment_parts){const at=r.source_prompt.indexOf(part.quote,lastEnd);assert(at>=0);lastEnd=at+part.quote.length;}
  if(r.changed&&r.category==='personality')assert(r.topic_ids.length&&!r.topic_ids.includes('unclassified'));
  if(r.category==='job')assert.deepEqual(r.topic_ids,[]);
 }
 // Distinguish work settings from technical knowledge and values from statutory recall.
 for(const prompt of ['민원인이 와서 처리를 했는데 알고보니 본인 실수 어떻게 하겠는가','상사의 부당하거나 위법한 지시에 어떻게 대응하겠습니까?','시험에 떨어진다면 5년 뒤 무엇을 하고 있을지 영어로 답변해보세요.','성인지 감수성이 뭐냐','공무원의 덕목 중 가장 중요하다고 생각하는 덕목과 그 이유'])assert.equal(find(prompt).category,'personality',prompt);
 for(const prompt of ['방파제 내 항법?, 추월방법','개인정보 보호법을 설명해보세요.','공무원의 6대 의무에 대해 말씀해보세요.','육자운동이 머냐?','미투운동이란?','해상에서의 음주 규정'])assert.equal(find(prompt).category,'job',prompt);
 // Definitions about public ethics are distinct from statutory duties and criminal elements.
 for(const prompt of ['2차 가해란','성범죄 2차피해 정의와 어떻게 생각하는지','윤리적 소비란?','미투운동의 개인적 견해','최근 승선했던 메인 엔진 모델이랑 메이커는 무엇인가?','해양경찰에서 전문성이 필요한 이유가 뭐냐?','공정에 대해','공통질문으로는 공평과 공정에 대해 이야기 하라고 했습니다.'])assert.equal(find(prompt).category,'personality',prompt);
 assert.equal(find('승선 중 보일러 점화가 잘 되지 않을 때 어떻게 했었나?').category,'job');
 assert.equal(find('익수자를 구조한 경험이 있는데 선박이 익수자를 구조할 때 어떻게 구조할 것입니까?').category,'job');
 assert.equal(find('보완수사권을 설명하고 유지·폐지에 대한 본인의 입장을 말해보세요.').answer_type,'mixed');
 assert.equal(find('보완수사권을 설명하고 유지·폐지에 대한 본인의 입장을 말해보세요.').requires_open_ended_rubric,true);
 assert.deepEqual(find('보완수사권을 설명하고 유지·폐지에 대한 본인의 입장을 말해보세요.').assessment_parts.map(p=>p.answer_type),['knowledge','opinion']);
 assert.deepEqual(find('해양경찰 인재상에 대해 설명해주시고 강점 말해보세요').assessment_parts.map(p=>p.category),['job','personality']);
 assert.equal(find('미투운동').classification_status,'needs_context');
 assert.equal(find('그 사건이 국민들에게 미치는 파장이 어떠한 것 같은가').resolved_category,null);
 assert.equal(find('승선기간은?').standalone_candidate,true,'A complete background question does not need a missing parent');
 assert.equal(find('몇 번째 지원인가?').standalone_candidate,true);
 assert.equal(find('그럼 평소에 유튜브 뭐봐요?').standalone_candidate,true,'A discourse marker alone does not make a question dependent');
 assert.equal(find('동료가 개인적인 이유로 일을 미루는데, 그 이유가 무슨 상황일 것 같고 계속 미루면 어떻게 할 것인가').standalone_candidate,true);
 assert(!find('여성가족부 폐지').flags.includes('sensitive_review'),'A ministry name does not disclose family information');
 assert.equal(find('해양경찰을 홍보해 보아라. 영어, 중국어, 일본어로 편한대로 해보세요.').answer_type,'practical');
 assert(find('시험에 떨어진다면 5년 뒤 무엇을 하고 있을지 영어로 답변해보세요.').flags.includes('language_performance'));
 assert.equal(find('이유는요?').standalone_candidate,false);
 const norm=new Map();for(const row of data.records){const key=row.source_prompt.normalize('NFKC').toLowerCase().replace(/[^가-힣a-z0-9]/g,'');if(key){assert(!norm.has(key)||norm.get(key)===row.category);norm.set(key,row.category);}}
 const sql=fs.readFileSync('supabase/seeds/interview-question-classification.sql','utf8');
 const {db,invoke}=await createDb();
 try{
  await db.exec(fs.readFileSync('supabase/seeds/interview-corpus.sql','utf8'));
  for(const q of additional)await db.query('insert into ip_questions(id,prompt,category,tracks) values($1,$2,$3,$4)',[q.id,q.prompt,q.category,q.tracks]);
  await db.exec("insert into ip_members(student_id,track,exam_number) values('ip-a','공채','classification-qa'); insert into ip_notes(student_id,topic_id,fields) values('ip-a','self','{\"answer\":\"student-owned writing\"}');");
  const notes=(await db.query('select * from ip_notes')).rows;
  // Approved rubrics/analyses must become drafts through the existing triggers.
  const toJob=changes.find(r=>r.category==='job'),toPersonality=changes.find(r=>r.category==='personality');
  for(const r of [toJob,toPersonality])await db.query("insert into ip_question_rubrics(question_id,source_prompt,source_category,kind,rationale,status,reviewer,reviewed_at) values($1,$2,$3,'job_knowledge','before classification','reviewed','qa',now())",[r.question_id,r.source_prompt,r.source_category]);
  await db.query("insert into ip_question_analysis(question_id,source_prompt,source_category,disposition,answer_form,method,rationale,status,reviewer,reviewed_at) values($1,$2,'personality','knowledge_review','context','test-fixture','before classification','reviewed','qa',now())",[toJob.question_id,toJob.source_prompt]);
  // A stale snapshot must abort the entire batch, before even recording history.
  await db.query('update ip_questions set revision=2 where id=$1',[toPersonality.question_id]);
  await assert.rejects(db.exec(sql),/classification_snapshot_conflict/);await db.exec('rollback');
  assert.equal(Number((await db.query("select count(*) n from ip_history where entity='question_classification'")).rows[0].n),0);
  await db.query('update ip_questions set revision=1 where id=$1',[toPersonality.question_id]);
  await db.query('update ip_questions set prompt=prompt||$2 where id=$1',[toPersonality.question_id,' changed']);
  await assert.rejects(db.exec(sql),/classification_snapshot_conflict/);await db.exec('rollback');
  await db.query('update ip_questions set prompt=$2 where id=$1',[toPersonality.question_id,toPersonality.source_prompt]);
  await assert.rejects(db.exec(sql.replace(toPersonality.question_id,'q-missing-classification-source')),/classification_snapshot_conflict/);await db.exec('rollback');
  assert.equal(Number((await db.query("select count(*) n from ip_history where entity='question_classification'")).rows[0].n),0);
  const before=(await db.query('select * from ip_questions order by id')).rows;
  const occurrences=(await db.query('select * from ip_occurrences order by id')).rows;
  await db.exec(sql);
  const after=(await db.query('select * from ip_questions order by id')).rows;
  assert.equal(after.length,before.length);
  const changedIds=new Set(changes.map(r=>r.question_id));
  for(let i=0;i<after.length;i++){
   const a=after[i],b=before[i];assert.equal(a.id,b.id);assert.equal(a.prompt,b.prompt);assert.equal(a.status,b.status);assert.deepEqual(a.tracks,b.tracks);
   if(changedIds.has(a.id)){
    const r=changes.find(r=>r.question_id===a.id);assert.equal(a.category,r.category);assert.deepEqual(a.topic_ids,r.topic_ids);assert.equal(a.revision,b.revision+1);
   }else assert.deepEqual(a,b);
  }
  assert.deepEqual((await db.query('select * from ip_occurrences order by id')).rows,occurrences);
  assert.deepEqual((await db.query('select * from ip_notes')).rows,notes);
  assert((await db.query('select status from ip_question_rubrics')).rows.every(r=>r.status==='draft'));
  assert((await db.query('select status from ip_question_analysis')).rows.every(r=>r.status==='draft'));
  const history=(await db.query("select * from ip_history where entity='question_classification' order by id")).rows;
  assert.equal(history.length,changes.length);
  assert(history.every(h=>h.snapshot.before.prompt&&h.snapshot.before.category!==h.snapshot.category));
  await db.exec(sql);
  assert.deepEqual((await db.query('select * from ip_questions order by id')).rows,after,'Repeat must not advance revisions');
  assert.equal(Number((await db.query("select count(*) n from ip_history where entity='question_classification'")).rows[0].n),changes.length);
  // Existing admin category filters must resolve corrected questions without UI changes.
  for(const r of [toJob,toPersonality]){
   const result=await invoke('admin_questions',{type:'admin',id:'qa'},{category:r.category,search:r.source_prompt});
   assert(result.questions.some(q=>q.id===r.question_id));
  }
  console.log('PASS v2: 5,128 records, 74 revised classifications, 54 unresolved fragments held, 267 guarded corrections; experience/technical/ethics/policy boundaries and mixed parts; complete background questions; rollback, admin filters, approval invalidation, existing student writing and source answers preserved, repeat-safe SQL.');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
