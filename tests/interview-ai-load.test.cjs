'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'..');
const APP=process.env.INTERVIEW_APP_ROOT||(fs.existsSync(path.join(ROOT,'tests/helpers/interview-db.cjs'))?ROOT:'C:/Users/W11/Desktop/Coding/Codex_Project/outing-auth-app');
const migration='20261020074446_interview_ai_load_protection.sql';
async function main(){
 process.chdir(APP);
 const {db,invoke:base}=await require(path.join(APP,'tests/helpers/interview-db.cjs')).createDb();
 const admin={type:'admin',id:'local-load-test'},student=id=>({type:'student',id});
 const rpc=async(action,actor,body={})=>(await db.query('select ip_ai_service($1,$2::jsonb,$3::jsonb) result',[action,JSON.stringify(actor),JSON.stringify(body)])).rows[0].result;
 const content={background:'가상 학생 기록',qualifications:[],affiliations:[],awards:[],none:['qualifications','affiliations','awards'],
  experiences:[1,2,3].map(i=>({id:'e'+i,year:'2024',age:'23',period:'시기'+i,affiliation:'소속',title:'경험'+i,
   situation:'상황'+i,action:'행동'+i,result:'결과'+i,learning:'배움',competencyIds:[]}))};
 const payload=async(id,kind='self_intro')=>({kind,sourceHash:(await rpc('prepare',student(id),{kind})).sourceHash,requestKey:crypto.randomUUID(),regenerate:true});
 const timed=async(fn)=>{const start=performance.now();await fn();return performance.now()-start;};
 let request;
 try{
  await db.exec(fs.readFileSync(path.join(ROOT,'supabase/migrations/20261020063234_interview_ai_pipeline.sql'),'utf8'));
  await db.exec(fs.readFileSync(path.join(APP,'supabase/migrations/20261020073140_interview_ai_readiness.sql'),'utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261021063447_interview_experience_year_age.sql','utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20261021065038_interview_life_satisfaction.sql','utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20261021071011_interview_experience_age_only.sql','utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20261021082149_interview_basic_fields_followup.sql','utf8'));
  await base('admin_enabled',admin,{enabled:true});
  await base('admin_member_save',admin,{targetStudentId:'ip-a',track:'공채',examNumber:'synthetic',enabled:true});
  await require(path.join(APP,'tests/helpers/interview-ai-complete-source.cjs'))(base,'ip-a');
  await db.query("update ip_life_profiles set content=$1 where student_id='ip-a'",[JSON.stringify(content)]);
  await rpc('admin_configure',admin,{enabled:true,bundleHash:'b'.repeat(64),dailyCallLimit:10000});
  request=await rpc('generate',student('ip-a'),await payload('ip-a'));
  // Existing source snapshots migrate without being falsely marked stale.
  await db.exec(fs.readFileSync(path.join(ROOT,'supabase/migrations',migration),'utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20261021071011_interview_experience_age_only.sql','utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20261021082149_interview_basic_fields_followup.sql','utf8'));
  let view=await rpc('status',student('ip-a'),{requestId:request.requestId});
  assert.equal(view.stale,false);
  await db.exec('begin read only');
  try{
   await rpc('status',student('ip-a'),{requestId:request.requestId});
   await rpc('requests',student('ip-a'));
   await rpc('prepare',student('ip-a'),{kind:'self_intro'});
  }finally{await db.exec('rollback');}
  // A tripwire proves status never extracts evidence or hashes source material.
  const original=(await db.query("select pg_get_functiondef('ip_ai_sources(text,text)'::regprocedure) def")).rows[0].def;
  await db.exec("create or replace function ip_ai_sources(p_student text,p_kind text) returns jsonb language plpgsql as $$ begin raise exception 'evidence_read_on_status'; end $$;");
  await rpc('status',student('ip-a'),{requestId:request.requestId});
  await db.exec(original);
  const unchanged=await rpc('status',student('ip-a'),{requestId:request.requestId,version:view.version});
  assert(unchanged.unchanged);assert(!Object.hasOwn(unchanged,'items'));
  await assert.rejects(rpc('status',student('ip-b'),{requestId:request.requestId,version:view.version}),/not_enrolled|not_found/);
  await db.query("update ip_life_profiles set feedback='교사 피드백만 변경' where student_id='ip-a'");
  assert.equal((await rpc('status',student('ip-a'),{requestId:request.requestId})).stale,false);
  await db.query("update ip_life_profiles set content=jsonb_set(content,'{background}','\"학생 자료 변경\"') where student_id='ip-a'");
  view=await rpc('status',student('ip-a'),{requestId:request.requestId,version:view.version});
  assert.equal(view.stale,true);assert(!view.unchanged);
  console.log('PASS read-only status/history/prepare, no source extraction during polling, snapshot backfill, feedback isolation, source invalidation, owner checks');

  await rpc('admin_configure',admin,{requestsPerMinute:1});
  const repeated=await payload('ip-a');
  await assert.rejects(rpc('generate',student('ip-a'),repeated),/request_rate_limited/);
  await rpc('admin_configure',admin,{requestsPerMinute:60,maxPendingTotal:30});
  const ids=Array.from({length:30},(_,i)=>'load-q-'+i);
  for(const id of ids)await db.query("insert into ip_questions(id,prompt,category,status) values($1,'가상 질문','personality','published')",[id]);
  await rpc('admin_configure',admin,{coreQuestionIds:ids});
  await assert.rejects(rpc('generate',student('ip-a'),await payload('ip-a','core30')),/queue_full/);
  assert.equal(Number((await db.query('select count(*) n from ip_ai_jobs')).rows[0].n),1);
  await db.query("update ip_ai_jobs set status='CANCELED' where request_id=$1",[request.requestId]);
  const p=await payload('ip-a','core30'),core=await rpc('generate',student('ip-a'),p);
  assert.equal((await rpc('generate',student('ip-a'),p)).requestId,core.requestId,'duplicate succeeds even at capacity');
  await assert.rejects(rpc('generate',student('ip-a'),await payload('ip-a')),/queue_full/);
  const one=(await db.query('select id from ip_ai_jobs where request_id=$1 limit 1',[core.requestId])).rows[0].id;
  await db.query("update ip_ai_jobs set status='FAILED' where id=$1",[one]);
  const p2=await payload('ip-a');await rpc('generate',student('ip-a'),p2);
  await assert.rejects(rpc('admin_retry_job',admin,{jobId:one}),/queue_full/);
  console.log('PASS rate limits, 30-item atomic admission, full queue preserves idempotency, admin retry cannot bypass capacity');

  // Existing ordinary life read/save traffic shares the test DB with 50 student status streams.
  await rpc('admin_configure',admin,{maxPendingTotal:300,requestsPerMinute:60});
  const students=[];
  for(let i=0;i<50;i++){
   const id='load-'+i;await db.query("insert into students(id,name) values($1,'가상 학생')",[id]);
   await base('admin_member_save',admin,{targetStudentId:id,track:'공채',examNumber:id,enabled:true});
   await require(path.join(APP,'tests/helpers/interview-ai-complete-source.cjs'))(base,id);
   await db.query("update ip_life_profiles set content=$2 where student_id=$1",[id,JSON.stringify(content)]);
   const req=await rpc('generate',student(id),await payload(id));
   const initial=await rpc('status',student(id),{requestId:req.requestId});
   students.push({id,requestId:req.requestId,version:initial.version});
  }
  const reads=[],writes=[];let lightweight=0;
  for(let round=0;round<6;round++){
   const work=[];
   students.forEach((s,index)=>{
    if(index===25)work.push(timed(async()=>{
     // Each round edits a different student, interleaved with outstanding status reads.
     await base('life_save',student(students[round].id),{content:{...content,background:'저장 '+round},revision:1,status:'draft'});
    }).then(ms=>writes.push(ms)));
    work.push(timed(async()=>{
     const data=await rpc('status',student(s.id),{requestId:s.requestId,version:s.version});
     if(data.unchanged)lightweight++;else s.version=data.version;
    }).then(ms=>reads.push(ms)));
   });
   await Promise.all(work);
  }
  assert.equal(reads.length,300);assert.equal(writes.length,6);assert(lightweight>=294);
  const percentile=(a,p)=>[...a].sort((x,y)=>x-y)[Math.floor((a.length-1)*p)];
  const report={engine:'local PGlite (single DB connection; not production concurrency proof)',
    clients:50,statusRequests:reads.length,ordinarySaves:writes.length,unchangedReplies:lightweight,
    statusP95Ms:Math.round(percentile(reads,.95)),saveP95Ms:Math.round(percentile(writes,.95))};
  fs.writeFileSync(path.join(ROOT,'tests/fixtures/ai-load-report.json'),JSON.stringify(report,null,2)+'\n');
  console.log('PASS mixed 50-client status/save exercise:',JSON.stringify(report));
  const grants=(await db.query("select has_table_privilege('anon','ip_ai_source_versions','select') exposed")).rows[0];
  assert.equal(grants.exposed,false);
  await db.query("delete from students where id='load-49'");
  console.log('PASS new RLS/grants and cascading student deletion');
 }finally{await db.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
