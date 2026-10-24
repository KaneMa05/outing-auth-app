const assert=require('node:assert/strict');
const {createDb}=require('./helpers/interview-db.cjs');
(async()=>{
 const {db,invoke}=await createDb(),admin={type:'admin',id:'qa'},a={type:'student',id:'ip-a'},b={type:'student',id:'ip-b'};
 try{
  await assert.rejects(invoke('diagnosis_get',a),/not_enrolled/);
  await invoke('admin_enabled',admin,{enabled:true});for(const id of ['ip-a','ip-b'])await invoke('admin_member_save',admin,{targetStudentId:id,track:'공채',examNumber:id,enabled:true});
  const prompts=['경험은 무엇인가요?','어떤 상황이었나요?','무엇을 했나요?','결과는 무엇인가요?','무엇을 배웠나요?'];
  const input={topicId:'public',revision:0,prompts,answers:['첫 답변','','','','']};
  const first=await invoke('diagnosis_save',a,input);assert.equal(first.answer.revision,1);
  assert.deepEqual((await invoke('diagnosis_get',a)).answers[0].answers,input.answers);
  assert.equal((await invoke('diagnosis_get',b)).answers.length,0);
  assert.equal((await invoke('life_get',a)).profile,null,'Answers do not require/create an experience');
  await assert.rejects(invoke('diagnosis_save',a,input),/revision_conflict/);
  await assert.rejects(invoke('diagnosis_save',a,{...input,revision:1,prompts:['변경된 질문',...prompts.slice(1)]}),/topic_changed/);
  for(const answers of [['개수 부족'],['가'.repeat(2001),'','','',''],[null,'','','','']])await assert.rejects(invoke('diagnosis_save',a,{...input,revision:1,answers}),/invalid_request/);
  const saved=await invoke('diagnosis_save',a,{...input,revision:1,answers:['','둘째 답변','','','']});assert.equal(saved.answer.answers[0],'','Explicitly clearing a saved answer persists');
  await invoke('diagnosis_save',b,{...input,answers:['다른 학생','','','','']});
  assert.equal((await invoke('diagnosis_get',a)).answers[0].answers[1],'둘째 답변');
  for(const role of ['anon','authenticated']){
   assert.equal((await db.query('select has_table_privilege($1,$2,$3) v',[role,'ip_diagnosis_answers','select'])).rows[0].v,false);
   assert.equal((await db.query('select has_function_privilege($1,$2,$3) v',[role,'ip_diagnosis_service(text,jsonb,jsonb)','execute'])).rows[0].v,false);
  }
  await db.exec("delete from students where id='ip-a'");assert.equal(Number((await db.query("select count(*) n from ip_diagnosis_answers where student_id='ip-a'")).rows[0].n),0);
  console.log('PASS direct diagnosis answers: persisted partial answers, owner isolation, conflicts, question pairing, limits, clear/save, grants, cascade and no life-profile side effects.');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
