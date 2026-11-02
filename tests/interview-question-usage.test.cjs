'use strict';
const assert=require('node:assert/strict');
const {questionUsage,savedAnswers}=require('../lib/interview-question-usage.cjs');
const {usage}=require('../lib/interview-ai-usage.cjs');
(async()=>{
 const q1='왜 (A+B)를 선택했나요?',q2='그 결과는 무엇인가요?';
 const content=`경험 원문에 ${q1}라는 문장이 있습니다.\n\n질문: ${q1}\n첫 줄 답변\n두 번째 줄 답변\n\n질문: ${q2}\n`;
 assert.deepEqual(savedAnswers(content,q1),['첫 줄 답변\n두 번째 줄 답변']);assert.deepEqual(savedAnswers(content,q2),['']);
 assert.deepEqual(savedAnswers(`경험 속 질문: ${q1}\n잘못 연결하면 안 되는 글`,q1),[]);
 assert.deepEqual(savedAnswers(`질문: ${q1}라는 다른 질문\n다른 답변`,q1),[]);
 assert.deepEqual(savedAnswers(`질문: ${q1}\r\nCRLF 답변\r\n\r\n질문: ${q2}\r\n다른 답변`,q1),['CRLF 답변']);
 assert.deepEqual(savedAnswers('질문: 첫 문장\n둘째 문장\n여러 줄 질문의 답변','첫 문장\n둘째 문장'),['여러 줄 질문의 답변']);
 const profile={student_id:'a',updated_at:'2026-11-02T00:00:00Z',experiences:[{id:'e1',title:'첫 경험',content,appeal:'나의 강점'},{id:'e2',title:'다른 경험',content:`질문: ${q1}\n다른 경험의 답변`}]};
 const analysed=questionUsage([q1,q2,'아직 넣지 않은 질문'],profile);
 assert.equal(analysed.savedAnswerCount,1);assert.equal(analysed.addedQuestionCount,2);assert.equal(analysed.questions[0].matches.length,2);assert.equal(analysed.questions[1].matches[0].answer,'');assert.deepEqual(analysed.questions[2].matches,[]);
 assert.equal(questionUsage([q1],undefined).profileAvailable,false);
 assert.match(questionUsage([], {experiences:[{title:'옛 경험',situation:'상황 원문',action:'행동 원문',learning:'배운 점'}]}).experiences[0].content,/상황: 상황 원문/);
 const actor={type:'admin',id:'reader'},id='00000000-0000-0000-0000-000000000001',calls=[];
 const rows=[{id,student_id:'a',state:'completed',questions:[q1,q2],created_at:'2026-11-01T00:00:00Z'}];
 const read=async(method,path)=>{
  assert.equal(method,'GET');const [table,search]=path.split('?'),q=new URLSearchParams(search);calls.push({table,q});
  if(table==='ip_draft_question_jobs')return rows.filter(r=>(!q.get('id')||q.get('id')==='eq.'+r.id)&&(!q.get('student_id')||q.get('student_id')==='eq.'+r.student_id));
  if(table==='ip_student_directory')return [{id:'a',name:'학생 A'}];
  if(table==='ip_life_profiles'){assert.equal(q.get('select'),'student_id,updated_at,experiences:content->experiences');assert(['eq.a','in.("a")'].includes(q.get('student_id')));return [profile];}
  return [];
 };
 const list=await usage({source:'questions'},actor,read);assert.equal(list.records[0].studentUsage.savedAnswerCount,1);
 assert(!JSON.stringify(list).includes('첫 줄 답변'),'List exposes counts, not answer bodies');assert.equal(calls.filter(c=>c.table==='ip_life_profiles').length,1);
 const detail=await usage({source:'questions',targetStudentId:'a',recordId:id},actor,read);assert.equal(detail.studentUsage.questions[0].matches[0].answer,'첫 줄 답변\n두 번째 줄 답변');
 const before=calls.filter(c=>c.table==='ip_life_profiles').length;
 await assert.rejects(usage({source:'questions',targetStudentId:'b',recordId:id},actor,read),/not_found/);assert.equal(calls.filter(c=>c.table==='ip_life_profiles').length,before);
 await assert.rejects(usage({source:'questions'},actor,async(method,path)=>{if(path.startsWith('ip_life_profiles'))throw Error('profile_read_failed');return read(method,path);}),/profile_read_failed/);
 const structured=await usage({source:'followup',targetStudentId:'a',recordId:id},actor,async(method,path)=>{
  assert.equal(method,'GET');const [table,search]=path.split('?'),q=new URLSearchParams(search);
  if(table==='ip_life_followup_requests'){assert.equal(q.get('student_id'),'eq.a');return [{id,student_id:'a',session_id:id,source_hash:'hash',answer_revision:4,action:'generate_questions',state:'completed',created_at:'2026-11-01T00:00:00Z'}];}
  assert.equal(table,'ip_life_followup_questions');assert.equal(q.get('session_id'),'eq.'+id);assert.equal(q.get('source_hash'),'eq.hash');assert.equal(q.get('answer_revision'),'eq.4');assert(q.get('select').includes('answer:ip_life_followup_answers'));
  return [{text:q1,answer:{text:'별도 문답 패널에서 저장한 답변',status:'answered',updated_at:'2026-11-02T01:00:00Z'}},{text:q2,answer:{text:'',status:'skipped'}}];
 });
 assert.equal(structured.sections[0].value[0].studentAnswer,'별도 문답 패널에서 저장한 답변');assert.equal(structured.sections[0].value[1].answerState,'건너뜀');
 console.log('PASS saved question answers: boundaries, blank and repeated answers, multiline/CRLF, legacy content, bounded profile reads, list privacy, owner scope and error honesty');
})().catch(e=>{console.error(e);process.exitCode=1;});
