const assert=require('node:assert/strict'),fs=require('node:fs');
const {createDb}=require('./helpers/interview-db.cjs');
const {createHandler}=require('../api/interview-ai');
const {validateResult}=require('../lib/interview-ai-validation');
(async()=>{
 const {db,invoke:base}=await createDb(),student={type:'student',id:'ip-a'},admin={type:'admin',id:'qa'};
 const invoke=async(action,actor,body={})=>(await db.query(action==='materials_save'?
  'select ip_ai_materials_service($1::jsonb,$2::jsonb) result':'select ip_ai_service($1,$2::jsonb,$3::jsonb) result',
  action==='materials_save'?[JSON.stringify(actor),JSON.stringify(body)]:[action,JSON.stringify(actor),JSON.stringify(body)])).rows[0].result;
 const prep=kind=>invoke('prepare',student,{kind});
 const saveLife=async experiences=>base('life_save',student,{revision:(await base('life_get',student)).profile?.revision||0,status:'draft',
  content:{background:'학교에서 맡았던 활동을 정리한 기본 이력입니다.',qualifications:[],affiliations:[],awards:[],none:[],experiences}});
 const experience=i=>({id:'materials-'+i,age:'22',title:'실험 과제 '+i,content:'실험 과제에서 맡은 기록을 직접 확인하고 오류를 수정하여 결과를 마무리했습니다. '+i,
  appeal:'계획한 일을 순서대로 마무리하며 배운 점입니다. '+i,competencyIds:[]});
 try{
  for(const name of ['20261020063234_interview_ai_pipeline.sql','20261020073140_interview_ai_readiness.sql','20261021063447_interview_experience_year_age.sql',
   '20261021065038_interview_life_satisfaction.sql','20261020074446_interview_ai_load_protection.sql','20261020081526_interview_ai_single_question.sql',
   '20261021071011_interview_experience_age_only.sql','20261021082149_interview_basic_fields_followup.sql','20261023052344_interview_applicant_identity.sql',
   '20261024130513_simplify_basic_history_save.sql','20261024133818_interview_school_status.sql','20261102053618_interview_ai_history_and_owners.sql','20261104043227_interview_self_intro_readiness.sql',
   '20261104060256_interview_all_draft_readiness.sql','20261104072421_interview_self_intro_three_body_experiences.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+name,'utf8').replace(/\r?\n/g,'\r\n'));
  await base('admin_enabled',admin,{enabled:true});
  for(const id of ['ip-a','ip-b'])await base('admin_member_save',admin,{targetStudentId:id,track:'공채',examNumber:id,enabled:true});
  await invoke('admin_configure',admin,{enabled:true,bundleHash:'b'.repeat(64)});
  await db.exec("insert into ip_owners(id,name) values('iw_00000000000000000000000000000001','포털 자료 검증');");
  await base('admin_member_save',admin,{targetStudentId:'iw_00000000000000000000000000000001',track:'공채',examNumber:'portal-test',enabled:true});
  await db.exec("insert into ip_life_profiles(student_id,content,status) values('iw_00000000000000000000000000000001','{}','draft');");
  assert.equal(Number((await db.query("select revision from ip_ai_source_versions where student_id='iw_00000000000000000000000000000001'")).rows[0].revision),1,'Portal accounts update versions without a legacy student row');
  await db.exec("delete from ip_owners where id='iw_00000000000000000000000000000001'");
  assert.equal(Number((await db.query("select count(*) n from ip_ai_source_versions where student_id='iw_00000000000000000000000000000001'")).rows[0].n),0,'Owner deletion does not recreate version records');
  await saveLife([experience(0)]);
  assert.equal((await prep('self_intro')).ready,false,'Introduction still needs a material pool of three experiences');
  for(const kind of ['motivation','public_service']){
   const p=await prep(kind);assert.equal(p.minExperienceCount,1);assert.equal(p.materials.fields.length,3);assert(p.missing.length<=3);
   assert(!p.missing.some(t=>t.includes('현재 양식')),'No obsolete 13-topic requirement');
  }
  let p=await prep('motivation');assert.equal(p.ready,false);assert(p.materials.fields.some(f=>!f.ready));
  const versionBefore=(await db.query("select ip_ai_source_version('ip-a') v")).rows[0].v;
  await base('diagnosis_save',student,{topicId:'motivation',revision:0,prompts:['질문 1','질문 2','질문 3','질문 4','질문 5'],
   answers:['해양경찰에 관심을 갖게 된 지원 계기를 직접 경험했습니다.','국민의 안전을 지키는 일에 기여하고 싶어 해양경찰을 선택했습니다.','실제로 관련 교육과 실습을 꾸준히 준비했습니다.','','']});
  p=await prep('motivation');assert.equal(p.ready,true,'Existing diagnostic answers are used before asking more questions');
  assert.notEqual((await db.query("select ip_ai_source_version('ip-a') v")).rows[0].v,versionBefore);
  const evidence=(await db.query("select ip_ai_sources('ip-a','motivation') s")).rows[0].s;
  assert(evidence.some(s=>s.id==='diagnosis:motivation:1'&&s.text.includes('지원 계기')));
  assert(!evidence.some(s=>s.text==='질문 1'),'Question wording must not be mistaken for the student answer');
  const publicTopic=(await base('bootstrap',student)).topics.find(t=>t.id==='public');
  const api=createHandler({authenticateWeb:async()=>({id:'ip-a'}),invoke});
  const request=async body=>{let status,data;await api({method:'POST',headers:{host:'local.test',origin:'https://local.test'},body},
   {setHeader(){},status(n){status=n;return this;},json(d){data=d;}});return {status,data};};
  const body={action:'materials_save',kind:'public_service',topicRevision:publicTopic.revision,revision:0,
   fields:{position:'공직에서 가장 중요하게 생각하는 가치는 책임입니다.',reason:'맡은 일이 다른 사람에게 영향을 주기 때문입니다.',application:'맡은 기록을 끝까지 확인하고 오류를 바로잡은 경험이 있습니다.'}};
  const saved=await request({...body,studentId:'ip-b'});assert.equal(saved.status,200);assert.equal(saved.data.ready,true);
  assert.equal(Number((await db.query("select count(*) n from ip_notes where student_id='ip-b'")).rows[0].n),0,'Web identity owns saved answers');
  assert.equal((await request(body)).status,409,'Stale revisions cannot overwrite answers');
  assert.equal((await request({...body,fields:{...body.fields,student_id:'ip-b'}})).status,400);
  const prior=(await base('bootstrap',student)).notes.find(n=>n.topic_id==='public');
  await request({...body,revision:prior.revision,fields:{position:'제가 중요하게 생각하는 공직 가치는 공정입니다.'}});
  const after=(await base('bootstrap',student)).notes.find(n=>n.topic_id==='public');
  assert.equal(after.fields.reason,prior.fields.reason);assert.equal(after.fields.application,prior.fields.application,'Partial edits preserve existing answers');
  for(const kind of ['motivation','public_service']){
   p=await prep(kind);assert.equal(p.ready,true);assert.equal(p.experienceCount,1);
   const generated=await invoke('generate',student,{kind,sourceHash:p.sourceHash,requestKey:'materials-generate-'+kind});assert(generated.requestId);
   await db.query("update ip_ai_jobs set status='FAILED' where request_id=$1",[generated.requestId]);
   const retry=await invoke('retry_items',student,{requestId:generated.requestId,itemKeys:[kind],sourceHash:p.sourceHash,requestKey:'materials-retry-'+kind});assert.equal(retry.requestId,generated.requestId);
  }
  const other=await invoke('prepare',{type:'student',id:'ip-b'},{kind:'motivation'});assert.equal(other.ready,false);assert.equal(other.experienceCount,0);
  await saveLife([0,1,2].map(experience));assert.equal((await prep('self_intro')).ready,true);
  const sources=(await db.query("select ip_ai_sources('ip-a','self_intro') s")).rows[0].s;
  const used=[0,1,2].map(i=>sources.find(s=>s.id==='life:experiences:materials-'+i+':content'));
  const result={schema_version:'1.0',status:'ready',answer:used.map(s=>s.text).join(' '),missing:[],
   source_refs:used.map(s=>({source_id:s.id,quote:s.text,answer_excerpt:s.text})),
   experience_coverage:used.map(s=>({experience_id:s.experience_id,answer_excerpt:s.text}))};
  validateResult(result,sources,'self_intro');await db.query('select ip_ai_validate_result($1::jsonb,$2::jsonb,$3)',[JSON.stringify(result),JSON.stringify(sources),'self_intro']);
  const rejected=async(candidate,code=/experience_required/)=>{
   assert.throws(()=>validateResult(candidate,sources,'self_intro'),code);
   await assert.rejects(db.query('select ip_ai_validate_result($1::jsonb,$2::jsonb,$3)',[JSON.stringify(candidate),JSON.stringify(sources),'self_intro']),code);
  };
  for(const count of [0,1,2])await rejected({...result,experience_coverage:result.experience_coverage.slice(0,count)});
  await rejected({...result,experience_coverage:result.experience_coverage.map(c=>({...c,experience_id:'materials-0'}))});
  await rejected({...result,experience_coverage:result.experience_coverage.map(c=>({...c,answer_excerpt:result.answer}))});
  const invented=structuredClone(result);invented.experience_coverage[2].experience_id='invented';
  await rejected(invented);
  await rejected({...result,answer:used.slice(0,2).map(s=>s.text).join(' ')},/invalid_evidence/);
  // One grounded experience remains valid for the other two draft types.
  const single={...result,answer:used[0].text,source_refs:result.source_refs.slice(0,1),experience_coverage:result.experience_coverage.slice(0,1)};
  for(const kind of ['motivation','public_service']){
   validateResult(single,sources,kind);
   await db.query('select ip_ai_validate_result($1::jsonb,$2::jsonb,$3)',[JSON.stringify(single),JSON.stringify(sources),kind]);
  }
  const policy=(await db.query("select pg_get_functiondef('public.ip_ai_service(text,jsonb,jsonb)'::regprocedure) definition")).rows[0].definition;
  assert(policy.includes('서로 다른 실제 경험을 최소 3개 포함'));
  assert(!policy.includes('경험 1~2개'));
  assert.equal((await prep('core30')).dbReady,false,'Legacy core preparation is unchanged');
  for(const role of ['anon','authenticated'])for(const fn of ['ip_ai_draft_materials(text,text)','ip_ai_materials_service(jsonb,jsonb)','ip_ai_draft_answer_sources(text,text)'])
   assert.equal((await db.query('select has_function_privilege($1,$2,$3) allowed',[role,fn,'execute'])).rows[0].allowed,false);
  console.log('PASS typed draft materials: short questions, saved DB/diagnosis reuse, own-note merge/revisions, API validation, one-experience motivation/public drafts, three grounded body experiences in JS/SQL, direct generation/retries and private RPCs.');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
