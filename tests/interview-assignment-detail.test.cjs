const assert=require('node:assert/strict');
const fs=require('node:fs');
const {assignmentDetail}=require('../lib/interview-assignment-detail.cjs');
const {createDb}=require('./helpers/interview-db.cjs');
(async()=>{
 const {db,invoke}=await createDb();
 try{
  await db.exec(fs.readFileSync('supabase/migrations/20261023064604_interview_preassignments.sql','utf8'));
  const actor={type:'admin',id:'detail-test'};
  await invoke('admin_member_save',actor,{targetStudentId:'ip-a',track:'공채',examNumber:'DETAIL-A',enabled:true});
  await db.query("insert into ip_pa_drafts(student_id,unit_id,fields,revision) values('ip-a','core-01',$1,1)",[JSON.stringify({f1:'저장한 답변'})]);
  const submission=(await db.query("insert into ip_pa_submissions(student_id,unit_id,round,fields,definition,fingerprint,late) select 'ip-a',id,1,$1,to_jsonb(u),'submitted-test',false from ip_pa_units u where id='core-01' returning id",[JSON.stringify({f1:'실제로 제출한 답변'})])).rows[0];
  await db.query("update ip_pa_drafts set latest_id=$1 where student_id='ip-a' and unit_id='core-01'",[submission.id]);
  let reads=0;
  const read=async(method,path)=>{
   reads++;assert.equal(method,'GET');const [table,query]=path.split('?'),q=new URLSearchParams(query);
   if(table==='ip_pa_units')return (await db.query('select id,title,prompt,fields from ip_pa_units order by position limit 100')).rows;
   assert.equal(q.get('student_id'),'eq.ip-a');assert.equal(q.get('limit'),'100');
   assert(q.get('select').includes('ip_pa_submissions!ip_pa_drafts_latest_fk'));
   return (await db.query("select d.unit_id,d.fields,d.revision,d.updated_at,to_jsonb(s) as ip_pa_submissions from ip_pa_drafts d left join ip_pa_submissions s on s.id=d.latest_id where d.student_id=$1 limit 100",[q.get('student_id').slice(3)])).rows;
  };
  await db.exec('set role service_role');
  const result=await assignmentDetail({targetStudentId:'ip-a'},actor,invoke,read);
  assert.equal(result.student.id,'ip-a');assert.equal(result.assignments.length,25);assert.equal(result.assignments[0].draft.fields.f1,'저장한 답변');assert.equal(result.assignments[1].draft,null);assert.equal(reads,2);
  assert.equal(result.assignments[0].draft.ip_pa_submissions.fields.f1,'실제로 제출한 답변');
  assert.equal(result.assignments[0].draft.ip_pa_submissions.round,1);
  reads=0;await assert.rejects(assignmentDetail({targetStudentId:'ip-a'},{type:'student',id:'ip-a'},invoke,read),/forbidden/);assert.equal(reads,0);
  await assert.rejects(assignmentDetail({targetStudentId:'missing'},actor,invoke,read),/student_unavailable/);assert.equal(reads,0);
  console.log('PASS assignment detail: full student detail, 25 units, saved drafts, bounded service-role reads and permission isolation');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
