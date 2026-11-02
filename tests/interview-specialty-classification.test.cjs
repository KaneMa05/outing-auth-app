const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {buildReview}=require('../scripts/prepare-interview-specialty-classification.cjs');
const {reclassificationSql}=require('../scripts/interview-specialty-reclassification.cjs');
const {createPublicationFixture}=require('./helpers/interview-publication-fixture.cjs');
const md5=s=>crypto.createHash('md5').update(s).digest('hex');
const snapshotConflict=error=>{
 if(!/classification_snapshot_conflict/.test(error.message))throw error;
 return true;
};
(async()=>{
 const review=buildReview(),find=text=>review.records.find(q=>q.source_prompt===text);
 assert.equal(review.records.length,5128);
 for(const p of ['해양경찰 함정이 외국 파견나가는 것에 대해 어떻게 생각하는지','해양경찰의 좋은 점과 나쁜 점이 있다면 어떻게 개선하면 좋을지.','검⦁경 수사권 분리에 대해 찬/반 의견과 그 이유는?','4차 산업혁명이란?','해양경찰의 소관 업무는 무엇인가?'])assert.equal(find(p).category,'personality',p);
 for(const p of ['자백보강법칙, 자백배제법칙','공무원의 6대 의무에 대해 말씀해보세요.','개인정보 보호법을 설명해보세요.','승선 중 보일러 점화가 잘 되지 않을 때 어떻게 했었나?','AIS','디젤엔진 실린더헤드 균열이 왜발생한다고 생각하는가?','단묘박/이묘박, 단묘박보다 이묘박의 장점 및 단점','공무원은 국민에 봉사해야 한다는 내용은 어느 법에 근거하는가?'])assert.equal(find(p).category,'job',p);
 assert.equal(review.report.unresolved,54);
 assert.equal(review.report.canonical_changes,430);
 for(const p of ['우리 조직의 홍보 방법에 대해서 말해 보세요.','미투운동이란?','저출산 문제 해결방법','해양경찰의 장단점'])assert.equal(find(p).category,'personality',p);
 assert.equal(find('보완수사권을 설명하고 유지·폐지에 대한 본인의 입장을 말해보세요.').category,'job','Explicit professional explanation remains a major question even with a second opinion part');
 const f=await createPublicationFixture(),{db,invoke,admin}=f;
 try{
  await db.exec("insert into ip_notes(student_id,topic_id,fields) values('ip-a','self','{\"answer\":\"student owned writing\"}');");
  await db.exec("insert into ip_sources(id,filename,sha256,track) values('source1','fixture.hwpx','123','공채'); insert into ip_occurrences(id,source_id,question_id,number,locator,original_prompt,answer) values('occ1','source1','publication-job','1','fixture','원문입니다','원문 해설입니다');");
  await db.exec("insert into ip_question_rubrics(question_id,source_prompt,source_category,kind,rationale,status,reviewer,reviewed_at) select id,prompt,category,'job_knowledge','approved old rubric','reviewed','qa',now() from ip_questions where id='publication-existing';");
  await db.exec("insert into ip_question_analysis(question_id,source_prompt,source_category,disposition,answer_form,method,rationale,status,reviewer,reviewed_at) select id,prompt,category,'knowledge_review','context','test','approved old analysis','reviewed','qa',now() from ip_questions where id='publication-existing';");
  const before=(await db.query('select * from ip_questions order by id')).rows,notes=(await db.query('select * from ip_notes')).rows;
  const sourceHash=md5(['occ1','source1','공채','','원문입니다','원문 해설입니다','1',''].join('\x1f'));
  const changes=before.filter(q=>q.id!=='publication-personality').map(q=>({id:q.id,to:q.category==='job'?'personality':'job',topic_ids:q.category==='job'?['public']:[],revision:q.revision,status:q.status,question_md5:md5([q.prompt,q.category,q.tracks.join('\x1e'),q.topic_ids.join('\x1e'),q.status,String(q.revision)].join('\x1f')),sources_md5:q.id==='publication-job'?sourceHash:null,rationale:'Test exact source classification with current revision and preserved publication.'}));
  const sql=reclassificationSql(changes,{runId:'specialty-v3-test',actorId:'specialty-qa'});
  await db.query("update ip_questions set revision=revision+1 where id='publication-job'");
  await assert.rejects(db.exec(sql),snapshotConflict);await db.exec('rollback');
  assert.equal(Number((await db.query("select count(*) n from ip_history where entity='question_classification'")).rows[0].n),0);
  await db.query("update ip_questions set revision=1 where id='publication-job'");
  await db.query("update ip_occurrences set answer='changed source' where id='occ1'");
  await assert.rejects(db.exec(sql),snapshotConflict);await db.exec('rollback');
  await db.query("update ip_occurrences set answer='원문 해설입니다' where id='occ1'");
  await db.exec(sql);
  const after=(await db.query('select * from ip_questions order by id')).rows;
  for(const b of before){const a=after.find(q=>q.id===b.id),change=changes.find(q=>q.id===b.id);
   if(!change){assert.deepEqual(a,b);continue;}
   assert.equal(a.category,change.to);assert.equal(a.status,b.status);assert.equal(a.prompt,b.prompt);assert.deepEqual(a.tracks,b.tracks);
   assert.equal(a.revision,b.revision+(b.status==='published'?2:1));
  }
  assert.deepEqual((await db.query('select * from ip_notes')).rows,notes);
  assert.equal((await db.query("select answer from ip_occurrences where id='occ1'")).rows[0].answer,'원문 해설입니다');
  assert.equal((await db.query("select status from ip_question_rubrics")).rows[0].status,'draft');
  assert.equal((await db.query("select status from ip_question_analysis")).rows[0].status,'draft');
  assert.equal(Number((await db.query("select count(*) n from ip_history where entity='question_classification'")).rows[0].n),3);
  assert((await invoke('admin_questions',admin,{category:'job'})).questions.some(q=>q.id==='publication-existing'));
  assert((await invoke('questions',f.student,{category:'job'})).questions.some(q=>q.id==='publication-existing'),'Existing published question remains visible after reviewed reclassification');
  await db.query("update ip_question_rubrics set status='reviewed',reviewer='new-reviewer',reviewed_at=now() where question_id='publication-existing'");
  await db.exec(sql);
  assert.deepEqual((await db.query('select * from ip_questions order by id')).rows,after);
  assert.equal((await db.query("select status from ip_question_rubrics")).rows[0].status,'reviewed','A repeated operation must preserve a later review');
  assert.equal(Number((await db.query("select count(*) n from ip_history where entity='question_classification'")).rows[0].n),3);
 }finally{await db.close();}
 console.log('PASS specialty/law classification: 5,128 exact prompts; opinion/organization vs professional/technical/law distinctions; source/revision rollback, archive/publication preservation, audit, review invalidation, student notes and idempotence.');
})().catch(e=>{console.error(e);process.exitCode=1;});
