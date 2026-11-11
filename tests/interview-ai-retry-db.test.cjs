'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {createDb}=require('./helpers/interview-db.cjs');
const migration='supabase/migrations/20261111084006_interview_ai_retry_eligibility.sql';
(async()=>{
 const {db,invoke:base}=await createDb(),admin={type:'admin',id:'qa'},student={type:'student',id:'ip-a'};
 const invoke=async(action,actor=student,body={})=>(await db.query('select public.ip_ai_service($1,$2::jsonb,$3::jsonb) result',
  [action,JSON.stringify(actor),JSON.stringify(body)])).rows[0].result;
 const worker=async(action,body)=>(await db.query('select public.ip_ai_worker_service($1,$2,$3::jsonb) result',
  [action,'a'.repeat(64),JSON.stringify(body)])).rows[0].result;
 try{
  for(const name of ['20261020063234_interview_ai_pipeline.sql','20261020073140_interview_ai_readiness.sql',
   '20261020074446_interview_ai_load_protection.sql','20261020081526_interview_ai_single_question.sql',
   '20261021063447_interview_experience_year_age.sql','20261021065038_interview_life_satisfaction.sql',
   '20261021071011_interview_experience_age_only.sql','20261021082149_interview_basic_fields_followup.sql',
   '20261023052344_interview_applicant_identity.sql','20261024130513_simplify_basic_history_save.sql',
   '20261024133818_interview_school_status.sql','20261102053618_interview_ai_history_and_owners.sql',
   '20261104043227_interview_self_intro_readiness.sql','20261104060256_interview_all_draft_readiness.sql',
   '20261104072421_interview_self_intro_three_body_experiences.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+name,'utf8'));
  if(process.env.INTERVIEW_RETRY_PRODUCTION_FUNCTIONS){
   for(const row of JSON.parse(fs.readFileSync(process.env.INTERVIEW_RETRY_PRODUCTION_FUNCTIONS,'utf8'))){
    const args=row.proname==='ip_ai_service'?'p_action text,p_actor jsonb,p_body jsonb':'p_action text,p_token_hash text,p_body jsonb';
    await db.exec(`create or replace function public.${row.proname}(${args} default '{}') returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $live$${row.prosrc}$live$`);
   }
  }
  const before=(await db.query('select * from students order by id')).rows;
  const grants=(await db.query("select proacl::text,prosecdef,proconfig from pg_proc where oid='public.ip_ai_service(text,jsonb,jsonb)'::regprocedure")).rows;
  await db.exec(fs.readFileSync(migration,'utf8'));
  assert.deepEqual((await db.query('select * from students order by id')).rows,before);
  assert.deepEqual((await db.query("select proacl::text,prosecdef,proconfig from pg_proc where oid='public.ip_ai_service(text,jsonb,jsonb)'::regprocedure")).rows,grants);
  for(const role of ['anon','authenticated']){
   await db.exec('set role '+role);
   await assert.rejects(db.query("select public.ip_ai_retry_reason('FAILED',null,1,true)"),/permission denied/);
   await db.exec('reset role');
  }
  await base('admin_enabled',admin,{enabled:true});
  for(const id of ['ip-a','ip-b'])await base('admin_member_save',admin,{targetStudentId:id,track:'공채',examNumber:id,enabled:true});
  await require('./helpers/interview-ai-complete-source.cjs')(base,'ip-a');
  await invoke('admin_configure',admin,{enabled:true,bundleHash:'b'.repeat(64),requestsPerMinute:60});
  const prep=await invoke('prepare',student,{kind:'self_intro'});assert(prep.ready);
  const req=await invoke('generate',student,{kind:'self_intro',sourceHash:prep.sourceHash,requestKey:'retry-fixture'});
  const status=()=>invoke('status',student,{requestId:req.requestId});
  const change=async(status,attempts,reason=null)=>db.query('update ip_ai_jobs set status=$1,attempts=$2,reason=$3,updated_at=now() where request_id=$4',[status,attempts,reason,req.requestId]);
  for(const [state,attempts,reason,canRetry,retryReason] of [
   ['QUEUED',0,null,false,'job_not_retryable'],['PROCESSING',1,null,false,'job_not_retryable'],
   ['COMPLETED',1,null,false,'job_not_retryable'],['BLOCKED',1,'dispatch_unknown',false,'job_not_retryable'],
   ['FAILED',1,'invalid_output',true,null],['FAILED',2,'invalid_output',false,'retry_limit'],
   ['NEEDS_INPUT',1,null,false,'source_update_required'],['CANCELED',1,'bundle_changed',false,'job_not_retryable'],
   ['CANCELED',1,'operator_resolved',true,null]]){
   await change(state,attempts,reason);
   const item=(await status()).items[0];assert.equal(item.canRetry,canRetry,state);assert.equal(item.retryReason,retryReason,state);assert.equal(item.attempts,attempts);
  }
  await change('FAILED',2,'invalid_output');
  const exhausted=await status(),snapshot=(await db.query('select * from ip_ai_jobs')).rows;
  const deniedBody={requestId:req.requestId,itemKeys:['self_intro'],sourceHash:prep.sourceHash,requestKey:'retry-denied'};
  for(let i=0;i<3;i++)assert.deepEqual(await invoke('retry_items',student,deniedBody),{ok:false,error:'unsafe_retry',retryReason:'retry_limit'});
  assert.deepEqual((await db.query('select * from ip_ai_jobs')).rows,snapshot);
  assert.equal((await db.query('select count(*)::int n from ip_ai_retries')).rows[0].n,0);
  await db.query("insert into ip_ai_jobs(request_id,item_key,position,question,status,attempts) values($1,'a-valid',2,'보존할 문항','FAILED',1)",[req.requestId]);
  const batchBefore=(await db.query('select * from ip_ai_jobs order by item_key')).rows;
  assert.equal((await invoke('retry_items',student,{...deniedBody,itemKeys:['a-valid','self_intro'],requestKey:'mixed-denied'})).ok,false);
  assert.deepEqual((await db.query('select * from ip_ai_jobs order by item_key')).rows,batchBefore,'A later denied item must not queue the earlier valid item');
  assert.equal((await db.query("select count(*)::int n from ip_ai_events where event='retry_item'")).rows[0].n,0);
  await db.query("delete from ip_ai_jobs where request_id=$1 and item_key='a-valid'",[req.requestId]);
  await assert.rejects(invoke('retry_items',{type:'student',id:'ip-b'},deniedBody),/not_found/);
  await db.query("update ip_life_profiles set content=jsonb_set(content,'{experiences,0,content}',to_jsonb((content#>>'{experiences,0,content}')||' 새로 보완한 실제 행동과 결과')) where student_id='ip-a'");
  const updated=await status();assert(updated.items[0].canRetry);assert.notEqual(updated.version,exhausted.version);
  assert.equal((await invoke('status',student,{requestId:req.requestId,version:exhausted.version})).unchanged,undefined);
  const newPrep=await invoke('prepare',student,{kind:'self_intro'});assert.notEqual(newPrep.sourceHash,prep.sourceHash);
  const body={...deniedBody,sourceHash:newPrep.sourceHash,requestKey:'retry-after-edit'};
  assert.equal((await invoke('retry_items',student,body)).reused,false);
  assert.equal((await invoke('retry_items',student,body)).reused,true);
  assert.equal((await status()).items[0].attempts,0);
  assert.equal((await status()).items[0].canRetry,false);
  await invoke('admin_register_worker',admin,{label:'synthetic-worker',tokenHash:'a'.repeat(64),studentIds:['ip-a']});
  for(const reason of ['invalid_output','invalid_evidence','experience_required','generation_failed']){
   await db.query("update ip_ai_jobs set status='QUEUED',attempts=0,execution_id=null,worker_id=null,lease_token=null,lease_expires_at=null where request_id=$1",[req.requestId]);
   const job=(await worker('claim',{bundleHash:'b'.repeat(64)})).job;
   const lease={jobId:job.id,leaseToken:job.lease_token,leaseEpoch:job.lease_epoch,executionId:crypto.randomUUID()};
   await worker('execution_start',lease);await worker('report',{...lease,reason});
   const row=(await db.query('select status,reason from ip_ai_jobs where id=$1',[job.id])).rows[0];
   assert.deepEqual(row,{status:'FAILED',reason});
   assert.equal((await db.query('select event from ip_ai_events where job_id=$1 order by id desc limit 1',[job.id])).rows[0].event,'failed:'+reason);
  }
  console.log('PASS authoritative retry eligibility, unchanged-source limits, changed-source recovery, no mutation on denial, owner isolation, retained failure codes and RPC privileges');
 }finally{await db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
