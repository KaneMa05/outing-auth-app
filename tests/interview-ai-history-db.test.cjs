'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
(async()=>{
 const {db}=await require('./helpers/interview-db.cjs').createDb();
 try{
  for(const name of ['20261020063234_interview_ai_pipeline.sql','20261020073140_interview_ai_readiness.sql','20261020074446_interview_ai_load_protection.sql','20261102053618_interview_ai_history_and_owners.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+name,'utf8'));
  await db.exec("insert into ip_owners(id,name) values('new-interview-only','면접 전용'),('new-interview-next','다음 등록');insert into ip_members(student_id,track,exam_number,enabled) values('new-interview-only','공채','1',true),('new-interview-next','공채','2',true);update ip_settings set enabled=true;update ip_ai_settings set enabled=true,bundle_hash=repeat('b',64);grant select on ip_student_directory to service_role;");
  const token='a'.repeat(64),workerId=crypto.randomUUID(),requestId=crypto.randomUUID();
  await db.query("insert into ip_ai_workers(id,label,token_hash,student_ids,expires_at) values($1,'qa',$2,array['ip-a'],now()+interval '1 day')",[workerId,token]);
  await db.query("insert into ip_ai_requests(id,student_id,kind,request_key,fingerprint,source_hash,sources,bundle_hash) values($1,'new-interview-only','motivation','history-test','fp','hash','[{\"text\":\"원본 자료\"}]',repeat('b',64))",[requestId]);
  await db.query("insert into ip_ai_jobs(request_id,item_key,position,question) values($1,'motivation',1,'지원동기')",[requestId]);
  const claim=async()=> (await db.query("select ip_ai_worker_service('claim',$1,jsonb_build_object('bundleHash',repeat('b',64))) r",[token])).rows[0].r;
  assert.equal((await claim()).job,null,'Existing scoped worker must not gain extra students');
  await db.query('update ip_ai_workers set all_enrolled=true where id=$1',[workerId]);
  const job=(await claim()).job;assert(job,'Interview-only student must be admitted');
  assert.equal((await db.query("select count(*)::int n from students where id='new-interview-only'")).rows[0].n,0);
  const execution=crypto.randomUUID(),lease={jobId:job.id,leaseToken:job.lease_token,leaseEpoch:job.lease_epoch,executionId:execution};
  await db.exec('set role service_role');
  await db.query("select ip_ai_worker_service('execution_start',$1,$2::jsonb)",[token,JSON.stringify(lease)]);
  await db.query("select ip_ai_worker_service('complete',$1,$2::jsonb)",[token,JSON.stringify({...lease,result:{schema_version:'1.0',status:'needs_input',answer:'',missing:['첫 보완 질문'],source_refs:[],experience_coverage:[]}})]);
  await db.exec('reset role');
  await db.query("update ip_ai_jobs set status='QUEUED',result=null,sources_override='[{\"text\":\"보완한 자료\"}]' where id=$1",[job.id]);
  await db.query("update ip_ai_jobs set status='COMPLETED',result='{\"answer\":\"새로운 답변\"}',attempts=2 where id=$1",[job.id]);
  await db.query('update ip_ai_jobs set updated_at=now() where id=$1',[job.id]);
  const history=(await db.query('select * from ip_ai_job_history order by id')).rows;
  assert.equal(history.length,2);assert.equal(history[0].result.missing[0],'첫 보완 질문');assert.equal(history[0].sources[0].text,'원본 자료');assert.equal(history[1].result.answer,'새로운 답변');assert.equal(history[1].sources[0].text,'보완한 자료');
  assert.equal((await db.query("select relrowsecurity from pg_class where oid='ip_ai_job_history'::regclass")).rows[0].relrowsecurity,true);
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(db.query('select * from ip_ai_job_history'),/permission denied/);await db.exec('reset role');}
  await db.exec('set role service_role');assert.equal((await db.query('select count(*)::int n from ip_ai_job_history')).rows[0].n,2);await assert.rejects(db.query('delete from ip_ai_job_history'),/permission denied/);await db.exec('reset role');
  console.log('PASS interview-only worker enrollment, existing scope isolation, result/source history across retries, idempotent snapshots and server-only read access');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
