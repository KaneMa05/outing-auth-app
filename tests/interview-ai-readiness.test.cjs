const assert=require('node:assert/strict'),fs=require('node:fs');
const path=require('node:path'),root=path.resolve(__dirname,'..');
const app=fs.existsSync(path.join(root,'tests/helpers/interview-db.cjs'))?root:'C:/Users/W11/Desktop/Coding/Codex_Project/outing-auth-app';
process.chdir(app);
const {createDb}=require(path.join(app,'tests/helpers/interview-db.cjs'));
(async()=>{
 const {db,invoke:base}=await createDb(),student={type:'student',id:'ip-a'},admin={type:'admin',id:'qa'};
 const invoke=async(action,actor=student,body={})=>(await db.query('select ip_ai_service($1,$2::jsonb,$3::jsonb) result',[action,JSON.stringify(actor),JSON.stringify(body)])).rows[0].result;
 const prepare=kind=>invoke('prepare',student,{kind:kind||'motivation'});
 try{
  await db.exec(fs.readFileSync('supabase/migrations/20261020063234_interview_ai_pipeline.sql','utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20261020073140_interview_ai_readiness.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261021063447_interview_experience_year_age.sql','utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20261021065038_interview_life_satisfaction.sql','utf8'));
  await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/20261020074446_interview_ai_load_protection.sql'),'utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20261021071011_interview_experience_age_only.sql','utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20261021082149_interview_basic_fields_followup.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261023052344_interview_applicant_identity.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261024130513_simplify_basic_history_save.sql','utf8'));
  await base('admin_enabled',admin,{enabled:true});
  for(const id of ['ip-a','ip-b'])await base('admin_member_save',admin,{targetStudentId:id,track:'공채',examNumber:id,enabled:true});
  await invoke('admin_configure',admin,{enabled:true,bundleHash:'b'.repeat(64)});
  let p=await prepare();assert.equal(p.ready,false);assert.equal(p.dbReady,false);assert(p.missing.some(x=>x.includes('기본 정보')));
  await require(path.join(app,'tests/helpers/interview-ai-complete-source.cjs'))(base,'ip-b');
  assert.equal((await prepare()).dbReady,false,'Another student cannot satisfy completeness');
  await require(path.join(app,'tests/helpers/interview-ai-complete-source.cjs'))(base,'ip-a',{experienceCount:1});
  for(const kind of ['motivation','public_service','core30'])assert.equal((await prepare(kind)).ready,true);
  assert.equal((await prepare('self_intro')).ready,false);
  await require(path.join(app,'tests/helpers/interview-ai-complete-source.cjs'))(base,'ip-a');
  assert.equal((await prepare('self_intro')).ready,true);
  const sources=(await db.query("select ip_ai_sources('ip-a','self_intro') as sources")).rows[0].sources;
  assert(!sources.some(s=>s.id.endsWith(':year')));
  assert(sources.some(s=>s.id.endsWith(':content')));assert(sources.some(s=>s.id.endsWith(':appeal')));
  assert(sources.some(s=>s.id.endsWith(':age')&&s.text==='23'));
  let profile=(await base('life_get',student)).profile;
  const copied=structuredClone(profile.content);
  copied.experiences=copied.experiences.map((row,i)=>({...row,content:copied.experiences[0].content,appeal:'다른 어필 '+i}));
  await db.query("update ip_life_profiles set content=$1 where student_id='ip-a'",[copied]);
  assert.equal((await prepare('self_intro')).ready,false,'Copied content with changed labels or appeal does not count as distinct experience');
  await db.query("update ip_life_profiles set content=$1 where student_id='ip-a'",[profile.content]);
  // Every active topic counts, including non-required topics; 10 characters per input.
  const topics=(await base('bootstrap',student)).topics;
  for(const topic of topics){
   const n=(await base('bootstrap',student)).notes.find(n=>n.topic_id===topic.id);
   const key=Object.keys(n.fields)[0];
   await db.query("update ip_notes set fields=jsonb_set(fields,array[$1],$2::jsonb) where student_id='ip-a' and topic_id=$3",[key,JSON.stringify('짧음'),topic.id]);
   p=await prepare();assert.equal(p.dbReady,false);assert(p.missing.some(x=>x.includes(topic.title)));
   const rejected=await invoke('generate',student,{kind:'motivation',sourceHash:p.sourceHash,requestKey:'invalid-'+topic.id});
   assert.equal(rejected.state,'NEEDS_INPUT');assert(!rejected.requestId);
   await db.query("update ip_notes set fields=$1 where student_id='ip-a' and topic_id=$2",[n.fields,topic.id]);
  }
  for(const area of ['qualifications','awards']){
   const content=structuredClone(profile.content);content.none=content.none.filter(x=>x!==area);
   await base('life_save',student,{revision:profile.revision,status:'draft',content});
   assert.equal((await prepare()).dbReady,false);
   profile=(await base('life_get',student)).profile;
   await base('life_save',student,{revision:profile.revision,status:'draft',content:{...content,none:[...content.none,area]}});
   profile=(await base('life_get',student)).profile;
  }
  for(const key of ['age','title','content','appeal']){
   const content=structuredClone(profile.content);content.experiences[0][key]='';
   await db.query("update ip_life_profiles set content=$1 where student_id='ip-a'",[content]);
   assert.equal((await prepare()).dbReady,false,key);
  }
  await db.query("update ip_life_profiles set content=$1 where student_id='ip-a'",[profile.content]);
  const content=structuredClone(profile.content);content.none=content.none.filter(x=>x!=='qualifications');
  content.qualifications=[{id:'q1',type:'자격',date:'2026',name:'검증 자격',issuer:'',effort:'직접 공부한 기록'}];
  await db.query("update ip_life_profiles set content=$1 where student_id='ip-a'",[content]);
  assert((await prepare()).missing.some(x=>x.includes('발급·수여 기관')));
  const simplified=structuredClone(content);
  simplified.basicInfo=Object.fromEntries(['school','major','clubs','volunteering','internships','company','role'].map(k=>[k,{text:'',none:true}]));
  simplified.none=simplified.none.filter(x=>x!=='affiliations');
  simplified.qualifications[0].type='어학';
  const simplifiedSaved=await base('life_save',student,{revision:profile.revision,status:'submitted',content:simplified});
  assert.deepEqual(simplifiedSaved.profile.content,simplified,'No achievement or affiliation requirement; language issuer may be blank');
  assert.equal((await prepare()).dbReady,true,'Removed fields must not leave AI readiness blocked');
  simplified.basicInfo.achievements={text:'기존 성과 기록',none:false};
  const legacySaved=await base('life_save',student,{revision:simplifiedSaved.profile.revision,status:'draft',content:simplified});
  assert.equal(legacySaved.profile.content.basicInfo.achievements.text,'기존 성과 기록','Legacy data stays accepted and preserved');
  content.qualifications[0].issuer='검증 기관';
  await db.query("update ip_life_profiles set content=$1 where student_id='ip-a'",[content]);
  assert.equal((await prepare()).dbReady,true);
  p=await prepare();
  const request=await invoke('generate',student,{kind:'motivation',sourceHash:p.sourceHash,requestKey:'complete-sources'});
  assert(request.requestId);
  await db.query("update ip_life_profiles set content=jsonb_set(content,'{background}','\"\"') where student_id='ip-a'");
  const retry=await invoke('retry_items',student,{requestId:request.requestId,sourceHash:p.sourceHash,itemKeys:['motivation'],requestKey:'incomplete-retry'});
  assert.equal(retry.state,'NEEDS_INPUT');assert(!retry.requestId);
  assert.equal((await db.query("select count(*) n from ip_ai_jobs")).rows[0].n,1);
  const permission=await db.query("select has_function_privilege('anon','ip_ai_readiness(text)','execute') a,has_function_privilege('authenticated','ip_ai_readiness(text)','execute') u");
  assert.equal(permission.rows[0].a,false);assert.equal(permission.rows[0].u,false);
  console.log('PASS readiness: every active topic/field, basic history, explicit none, 3-experience intro, own DB only, direct generate/retry gate, grants.');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
