'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {createDb}=require('./helpers/interview-db.cjs');
const migration='supabase/migrations/20261104043227_interview_self_intro_readiness.sql';
const experience=i=>({id:'intro-'+i,age:'23',title:'경험 '+i,competencyIds:[],
 content:'본인이 직접 역할을 맡아 수행하고 결과를 확인한 서로 다른 실제 경험 '+i+'입니다.',
 appeal:'경험을 통해 배운 책임감과 소통 능력을 설명합니다. '+i});
const content=experiences=>({background:'전공과 주요 이력을 기록한 본인의 기본 이력입니다.',
 qualifications:[],affiliations:[],awards:[],none:[],experiences});
(async()=>{
 const {db,invoke:base}=await createDb(),admin={type:'admin',id:'qa'},student={type:'student',id:'ip-a'};
 const invoke=async(action,actor=student,body={})=>(await db.query('select ip_ai_service($1,$2::jsonb,$3::jsonb) result',
  [action,JSON.stringify(actor),JSON.stringify(body)])).rows[0].result;
 const prepare=kind=>invoke('prepare',student,{kind:kind||'self_intro'});
 const save=async value=>base('life_save',student,{revision:(await base('life_get',student)).profile?.revision||0,status:'draft',content:value});
 try{
  for(const name of ['20261020063234_interview_ai_pipeline.sql','20261020073140_interview_ai_readiness.sql',
   '20261021063447_interview_experience_year_age.sql','20261021065038_interview_life_satisfaction.sql',
   '20261020074446_interview_ai_load_protection.sql','20261020081526_interview_ai_single_question.sql',
   '20261021071011_interview_experience_age_only.sql','20261021082149_interview_basic_fields_followup.sql',
   '20261023052344_interview_applicant_identity.sql',
   '20261024130513_simplify_basic_history_save.sql','20261024133818_interview_school_status.sql'])
   await db.exec(fs.readFileSync('supabase/migrations/'+name,'utf8'));
  await base('admin_enabled',admin,{enabled:true});
  for(const id of ['ip-a','ip-b'])await base('admin_member_save',admin,{targetStudentId:id,track:'공채',examNumber:id,enabled:true});
  await invoke('admin_configure',admin,{enabled:true,bundleHash:'b'.repeat(64)});
  const complete=content([0,1,2].map(experience));await save(complete);
  assert.equal((await prepare()).dbReady,false,'Legacy topic gate is reproduced before migration');
  const preserved=(await db.query('select student_id,content,revision from ip_life_profiles order by student_id')).rows;
  await db.exec(fs.readFileSync(migration,'utf8').replace(/\r?\n/g,'\r\n'));
  assert.deepEqual((await db.query('select student_id,content,revision from ip_life_profiles order by student_id')).rows,preserved);
  let p=await prepare();assert.equal(p.ready,true);assert.equal(p.experienceCount,3);assert.deepEqual(p.missing,[]);
  assert.equal(Number((await db.query('select count(*) n from ip_notes')).rows[0].n),0,'No personality answers are required or fabricated');
  for(const kind of ['motivation','public_service','core30'])assert.equal((await prepare(kind)).dbReady,false,'Other kinds keep their topic gate');
  const other=await invoke('prepare',{type:'student',id:'ip-b'},{kind:'self_intro'});
  assert.equal(other.ready,false);assert.equal(other.experienceCount,0);assert.equal(other.missing.length,2,'Only basic history and experience preparation are listed');
  await save(content([0,1].map(experience)));p=await prepare();
  assert.equal(p.ready,false);assert.equal(p.experienceCount,2);assert.equal(p.missing.length,1);
  const denied=await invoke('generate',student,{kind:'self_intro',sourceHash:p.sourceHash,requestKey:'intro-incomplete'});
  assert.equal(denied.state,'NEEDS_INPUT');assert(!denied.requestId);
  const copied=structuredClone(complete);copied.experiences[2].content=copied.experiences[0].content;
  await save(copied);assert.equal((await prepare()).experienceCount,2,'Changing title or appeal does not make copied content distinct');
  for(const field of ['age','title','content','appeal']){
   const partial=structuredClone(complete);partial.experiences[2][field]='';await save(partial);
   p=await prepare();assert.equal(p.ready,false,field);assert.equal(p.experienceCount,2,field);
  }
  const extra=structuredClone(complete);extra.experiences.push({...experience(3),content:'',appeal:''});
  await save(extra);assert.equal((await prepare()).ready,true,'An unfinished extra experience does not block three complete experiences');
  const noBasic=structuredClone(complete);noBasic.background='';await save(noBasic);
  p=await prepare();assert.equal(p.ready,false);assert.equal(p.experienceCount,3);assert.equal(p.missing.length,1);
  const structured=structuredClone(complete);structured.background='';
  structured.basicInfo=Object.fromEntries(['school','major','clubs','volunteering','internships','company','role'].map(k=>[k,{text:'',none:true}]));
  await save(structured);assert.equal((await prepare()).ready,true,'Explicit none remains valid for basic history');
  const legacy=content([0,1,2].map(i=>({id:'legacy-'+i,age:'22',title:'기존 경험 '+i,competencyIds:[],
   situation:'실제로 겪은 상황 '+i,action:'본인이 직접 실행한 행동 '+i,result:'행동 이후 확인한 결과 '+i,learning:'그 경험에서 배운 내용 '+i})));
  await save(legacy);assert.equal((await prepare()).experienceCount,3,'Legacy experiences remain usable');
  await save(complete);p=await prepare();
  const generated=await invoke('generate',student,{kind:'self_intro',sourceHash:p.sourceHash,requestKey:'intro-complete'});
  assert(generated.requestId,'Three experiences can generate without any of the 13 notes or diagnosis answers');
  await db.query("update ip_ai_jobs set status='FAILED' where request_id=$1",[generated.requestId]);
  await save(content([experience(0),experience(1)]));p=await prepare();
  const retry=()=>invoke('retry_items',student,{requestId:generated.requestId,itemKeys:['self_intro'],sourceHash:p.sourceHash,requestKey:'intro-selected-retry'});
  assert.equal((await retry()).state,'NEEDS_INPUT');
  await assert.rejects(invoke('retry_items',{type:'student',id:'ip-b'},{requestId:generated.requestId,itemKeys:['self_intro'],sourceHash:p.sourceHash,requestKey:'intro-other-owner'}),/not_found/);
  await save(complete);p=await prepare();assert.equal((await retry()).requestId,generated.requestId,'Retry uses the same reduced requirement');
  assert.equal(Number((await db.query('select count(*) n from ip_ai_jobs')).rows[0].n),1,'No extra jobs or AI calls are created');
  for(const role of ['anon','authenticated'])assert.equal((await db.query('select has_function_privilege($1,$2,$3) allowed',
   [role,'ip_ai_draft_readiness(text,text)','execute'])).rows[0].allowed,false);
  await db.exec('set role service_role');assert.equal((await prepare()).ready,true);await db.exec('reset role');
  console.log('PASS self-intro: basic history + 3 complete distinct experiences, at most 2 preparation groups, no 13-topic/4-point gate, other kinds unchanged, direct generation/retry, ownership, legacy data, extra drafts and grants.');
 }finally{await db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
