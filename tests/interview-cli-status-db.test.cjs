'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {cliStatus}=require('../lib/interview-cli-status.cjs');
const {ENGINE_VERSION}=require('../lib/core25-worker-config.cjs');
(async()=>{
 const {db}=await require('./interview-preassignments.test.cjs').setup();
 const now=Date.now(),at=seconds=>new Date(now+seconds*1000).toISOString();
 try{
  for(const migration of ['20261024111313_interview_core25_pc_worker.sql','20261020063234_interview_ai_pipeline.sql','20261026105057_interview_draft_questions_queue.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+migration,'utf8'));
  await db.query('insert into ip_pa_worker_presence(engine_version,seen_at) values($1,$2),($3,$4)',[ENGINE_VERSION,at(-15),'old-engine',at(0)]);
  await db.query('insert into ip_draft_worker_presence values(true,$1)',[at(-15)]);
  await db.query(`insert into ip_ai_workers(label,token_hash,student_ids,expires_at,revoked_at,last_seen_at) values
   ('current',repeat('a',64),array['ip-a'],$1,null,$2),('expired',repeat('b',64),array['ip-a'],$3,null,$4),('revoked',repeat('c',64),array['ip-a'],$1,$4,$4)`,[at(3600),at(-75),at(-1),at(0)]);
  await db.exec('update ip_ai_settings set enabled=true');
  for(const [status,leased,expires,engine] of [['running',true,120,ENGINE_VERSION],['running',false,120,ENGINE_VERSION],['running',true,-1,ENGINE_VERSION],['running',true,120,'old-engine'],['completed',true,120,ENGINE_VERSION],['failed',true,120,ENGINE_VERSION]]){
   await db.query(`insert into ip_pa_diagnoses(student_id,unit_id,answer_revision,answer_hash,criteria_hash,engine_version,snapshot,status,worker_queued,worker_lease,expires_at,finished_at)
    values('ip-a','core-01',1,'hash','hash',$1,'{}',$2,true,case when $3 then gen_random_uuid() end,$4,$5)`,[engine,status,leased,at(expires),['completed','failed'].includes(status)?at(-100):null]);
  }
  const request=(await db.query(`insert into ip_ai_requests(student_id,kind,request_key,fingerprint,source_hash,sources,bundle_hash) values('ip-a','self_intro','cli-status','fp','hash','[]',repeat('b',64)) returning id`)).rows[0].id;
  let index=0;
  for(const [status,expires] of [['QUEUED',120],['PROCESSING',120],['PROCESSING',-1],['COMPLETED',120],['FAILED',120]])await db.query(`insert into ip_ai_jobs(request_id,item_key,position,question,status,lease_expires_at,updated_at) values($1,$2,$3,'fixture',$4,$5,$6)`,[request,'item-'+index,index++,status,at(expires),at(-100)]);
  for(const [state,expires] of [['running',120],['queued',120],['running',-1],['completed',120],['failed',120]])await db.query(`insert into ip_draft_question_jobs(student_id,source_hash,experience,state,expires_at,updated_at) values('ip-a',$1,'{}',$2,$3,$4)`,['hash-'+index++,state,at(expires),at(-100)]);
  await db.exec('set role service_role');
  // Execute the status reader's projections and REST filters against the real local schema.
  const read=async(method,path)=>{
   assert.equal(method,'GET');const [table,search]=path.split('?'),q=new URLSearchParams(search),values=[],where=[];
   assert(/^ip_[a-z_]+$/.test(table));assert(/^[a-z_,]+$/.test(q.get('select')));
   const parameter=value=>{values.push(value);return '$'+values.length;};
   for(const [column,filter] of q){
    if(['select','order','limit'].includes(column))continue;
    if(column==='or'){
     const match=/^\(status.eq.QUEUED,and\(status.eq.PROCESSING,lease_expires_at.gt.(.+)\)\)$/.exec(filter);assert(match);
     where.push(`(status='QUEUED' or (status='PROCESSING' and lease_expires_at>${parameter(match[1])}))`);continue;
    }
    assert(/^[a-z_]+$/.test(column));
    if(filter==='is.null')where.push(column+' is null');
    else if(filter==='not.is.null')where.push(column+' is not null');
    else if(filter.startsWith('eq.'))where.push(column+'='+parameter(filter.slice(3)));
    else if(filter.startsWith('gt.'))where.push(column+'>'+parameter(filter.slice(3)));
    else if(/^in\.\([a-z,]+\)$/.test(filter))where.push(column+' in ('+filter.slice(4,-1).split(',').map(parameter).join(',')+')');
    else throw Error('Unsupported fixture filter');
   }
   const order=q.get('order')?.split('.');if(order)assert(order.every(s=>/^[a-z_]+$/.test(s)));
   const sql=`select ${q.get('select')} from ${table}${where.length?' where '+where.join(' and '):''}${order?' order by '+order[0]+' '+order[1]+(order[2]==='nullslast'?' nulls last':''):''} limit ${Number(q.get('limit'))}`;
   return JSON.parse(JSON.stringify((await db.query(sql,values)).rows));
  };
  const result=await cliStatus({},{type:'admin',id:'qa'},read,{now:()=>now,env:{INTERVIEW_CORE25_DIAGNOSIS_ENABLED:'true',INTERVIEW_CORE25_DIAGNOSIS_MODE:'pc',INTERVIEW_CORE25_WORKER_TOKEN:'a'.repeat(43),INTERVIEW_DRAFT_QUESTIONS_ENABLED:'true'}});
  assert(result.workers.every(w=>w.available&&w.connected&&w.enabled),JSON.stringify(result.workers));
  assert.deepEqual(result.workers.map(w=>[w.id,w.running,w.queued]),[['core25',1,1],['questions',1,1],['answers',1,1]]);
  assert.equal(result.workers[2].lastSeenAt,at(-75),'Expired and revoked workers must not provide live presence');
  const total=(await db.query("select count(*)::int n from ip_pa_diagnoses where status='running'")).rows[0].n;assert.equal(total,4,'Reading status must not expire or claim jobs');
  console.log('PASS local DB: all CLI status queries under service_role, queue separation, expired jobs, engine scope and revoked/expired worker exclusion');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
