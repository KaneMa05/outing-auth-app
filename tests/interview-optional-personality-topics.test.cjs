'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {createPublicationFixture}=require('./helpers/interview-publication-fixture.cjs');
const migration='supabase/migrations/20261031054439_interview_optional_personality_topics.sql';
(async()=>{
 const f=await createPublicationFixture(),{db,invoke,admin,student,question,publication}=f;
 try{
  const save=(id,topicIds,revision=0)=>invoke('admin_question_save',admin,{id,revision,prompt:'준비 항목 선택 연결을 검증하는 질문입니다.',category:'personality',topicIds,tracks:['공채'],status:'draft'});
  await save('optional-personality',[]);
  assert.deepEqual((await question('optional-personality')).topic_ids,[]);
  let q=(await publication('optional-personality',1,true)).question;
  assert.equal(q.status,'published');
  assert((await invoke('questions',student,{category:'personality'})).questions.some(x=>x.id===q.id));
  assert.equal((await publication(q.id,q.revision,false)).question.status,'draft');
  await db.exec("insert into ip_questions(id,prompt,category,topic_ids,tracks,status) values('legacy-unclassified','분류되지 않은 기존 인성 질문입니다.','personality',array['unclassified'],array['공채'],'draft'); insert into ip_notes(student_id,topic_id,fields) values('ip-a','teamwork','{\"action\":\"기존 학생 노트 보존\"}');");
  const before=(await db.query('select * from ip_notes')).rows;
  const legacy=(await publication('legacy-unclassified',1,true)).question;
  assert.equal(legacy.status,'published');assert.deepEqual(legacy.topic_ids,['unclassified']);
  assert.equal((await db.query("select active from ip_topics where id='unclassified'")).rows[0].active,false);
  await publication(legacy.id,legacy.revision,false);
  await save('optional-linked',['teamwork']);
  const items=await Promise.all(['optional-personality','legacy-unclassified','optional-linked'].map(async id=>{const row=await question(id);return {id,revision:row.revision};}));
  await invoke('admin_question_publish',admin,{items});
  for(const item of items)assert.equal((await question(item.id)).status,'published');
  assert.deepEqual((await question('optional-linked')).topic_ids,['teamwork']);
  q=await question('optional-linked');await save(q.id,[],q.revision);
  q=await question(q.id);assert.equal(q.status,'draft');assert.deepEqual(q.topic_ids,[]);
  await assert.rejects(publication(q.id,q.revision-1,true),/revision_conflict/);
  await assert.rejects(save('unknown-link',['unknown-topic']),/invalid_topic/);
  await db.exec("update ip_topics set active=false where id='stress';");
  await assert.rejects(save('inactive-link',['stress']),/invalid_topic/);
  await assert.rejects(invoke('admin_question_save',admin,{id:'job-invalid',revision:0,prompt:'직무 질문입니다.',category:'job',topicIds:['teamwork'],tracks:['공채'],status:'draft'}),/invalid_topic/);
  await assert.rejects(publication(q.id,q.revision,true,student),/forbidden/);
  await assert.rejects(invoke('note_save',student,{topicId:'unclassified',topicRevision:1,revision:0,fields:{},status:'draft'}),/invalid_topic/);
  const snapshot=(await db.query('select * from ip_questions order by id')).rows;
  await db.exec(fs.readFileSync(migration,'utf8'));
  assert.deepEqual((await db.query('select * from ip_questions order by id')).rows,snapshot,'Migration does not publish or rewrite questions');
  assert.deepEqual((await db.query('select * from ip_notes')).rows,before);
  for(const role of ['anon','authenticated']){
   await db.exec('set role '+role);await assert.rejects(publication(q.id,q.revision,true),/permission denied/);await db.exec('reset role');
  }
  console.log('PASS optional personality links: save/approve/withdraw without links, legacy unclassified approval, mixed batch, linked notes preserved, reapproval/conflicts, invalid links and job validation, authorization, inactive notes and migration preservation.');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
