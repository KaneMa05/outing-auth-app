const assert=require('node:assert/strict'),fs=require('node:fs');
const {createDb}=require('./helpers/interview-db.cjs');
const {createHandler}=require('../api/interview-prep'),auth=require('../api/teacher-auth-utils');
const blank=()=>({background:'',qualifications:[],affiliations:[],awards:[],experiences:[],none:[]});
(async()=>{
 const {db,invoke}=await createDb(),admin={type:'admin',id:'qa'},a={type:'student',id:'ip-a'},b={type:'student',id:'ip-b'};
 try{
  const catalog=require('../supabase/seeds/interview-life-catalog.json');
  assert.equal(catalog.competencies.length,30);assert.equal(catalog.competencies.reduce((n,c)=>n+c.questions.length,0),51);
  assert(catalog.competencies.every(c=>c.source.sha256===catalog.source.sha256&&c.element_ids.length));
  const seed=fs.readFileSync('supabase/seeds/interview-life-catalog.sql','utf8');
  await db.exec(seed);await db.exec(seed);
  assert.equal(Number((await db.query('select count(*) n from ip_life_competencies')).rows[0].n),30);
  await assert.rejects(invoke('life_get',a),/not_enrolled/);
  for(const id of ['ip-a','ip-b'])await invoke('admin_member_save',admin,{targetStudentId:id,track:'공채',examNumber:id,enabled:true});
  await invoke('admin_enabled',admin,{enabled:true});
  await db.exec("insert into ip_owners(id,name) values('iw-life-new','새 면접반 학생');insert into ip_members(student_id,track,exam_number) values('iw-life-new','공채','NEW-LIFE')");
  assert.equal((await invoke('life_get',{type:'student',id:'iw-life-new'})).member.name,'새 면접반 학생','Portal-only members use the shared student directory');
  const initial=await invoke('life_get',a);
  assert.equal(initial.profile,null);assert.equal(initial.competencies.length,30);
  assert(!JSON.stringify(initial).includes('태풍 피항'),'No worksheet sample answers in student DB');
  const content=blank();
  let r=await invoke('life_save',a,{revision:0,content,status:'draft',targetStudentId:'ip-b'});
  assert.equal(r.profile.student_id,'ip-a');assert.equal(r.profile.revision,1);
  assert.equal((await invoke('life_get',b,{targetStudentId:'ip-a'})).profile,null);
  await assert.rejects(invoke('life_save',a,{revision:0,content,status:'draft'}),/revision_conflict/);
  await assert.rejects(invoke('life_save',a,{revision:1,content,status:'submitted'}),/incomplete_life/);
  await assert.rejects(invoke('admin_life_feedback',admin,{targetStudentId:'ip-a',revision:1,status:'approved',feedback:'좋습니다.'}),/not_submitted/);
  content.background='학교에서 전공을 공부하며 여러 팀 과제를 수행했습니다.';
  content.none=['qualifications','affiliations','awards'];
  content.experiences=[{id:'experience-1',period:'대학교 2학년',affiliation:'수업',title:'팀 과제 갈등 조정',
    situation:'팀원들의 일정과 의견이 달랐습니다.',action:'각자의 사정을 듣고 일정을 조율했습니다.',
    result:'기한 안에 과제를 마쳤습니다.',learning:'일방적인 설득보다 경청이 먼저임을 배웠습니다.',competencyIds:['life-01','life-25']}];
  // New structured input requires both fields on completion; legacy period is preserved.
  const dated=(year,age)=>({...content,experiences:[{...content.experiences[0],year,age}]});
  for(const [year,age] of [['2024',''],['','']])
   await assert.rejects(invoke('life_save',a,{revision:1,content:dated(year,age),status:'submitted'}),/incomplete_experience_date/);
  for(const [year,age] of [['2024','-1'],['2024','121'],['2024','23.5']])
   await assert.rejects(invoke('life_save',a,{revision:1,content:dated(year,age),status:'draft'}),/invalid_experience_date/);
  content.experiences[0].year='2024';content.experiences[0].age='23';
  for(const score of ['-26','26','1.5','-1.5','NaN','999',null,true,25]){
   const invalid={...content,experiences:[{...content.experiences[0],satisfaction:score}]};
   await assert.rejects(invoke('life_save',a,{revision:1,content:invalid,status:'draft'}),/invalid_satisfaction|invalid_request/);
  }
  // The subjective score is optional, integer-only, and owned by this student.
  const graphOwner={type:'student',id:'iw-life-new'};let graphRevision=0;
  for(const score of [undefined,'','-25','-1','0','1','25']){
   const row={...content.experiences[0]};if(score!==undefined)row.satisfaction=score;
   const saved=await invoke('life_save',graphOwner,{revision:graphRevision,content:{...content,experiences:[row]},status:'draft'});
   graphRevision=saved.profile.revision;
   assert.equal(saved.profile.content.experiences[0].satisfaction,score);
   assert.equal((await invoke('admin_life_get',admin,{targetStudentId:graphOwner.id})).profile.content.experiences[0].satisfaction,score);
  }
  const simple={id:'simple-1',age:'23',satisfaction:'10',title:'협력',content:'팀원의 의견을 듣고 일정을 조율해 공동 과제를 마쳤습니다.',appeal:'상대 의견을 경청하고 합의점을 찾는 협동심',competencyIds:[]};
  for(const key of ['age','content','appeal']){
   await assert.rejects(invoke('life_save',graphOwner,{revision:graphRevision,content:{...content,experiences:[{...simple,[key]:''}]},status:'submitted'}),/incomplete_experience_date|incomplete_life/);
  }
  const simpleSaved=await invoke('life_save',graphOwner,{revision:graphRevision,content:{...content,experiences:[simple]},status:'submitted'});
  assert.deepEqual(simpleSaved.profile.content.experiences,[simple],'New experience saves without year or legacy fields');
  const legacyText=(await db.query('select ip_life_experience_text($1::jsonb) r',[content.experiences[0]])).rows[0].r;
  for(const key of ['period','affiliation','situation','action','result'])assert(legacyText.content.includes(content.experiences[0][key]));
  assert.equal(legacyText.appeal,content.experiences[0].learning);
  await db.query("delete from ip_owners where id='iw-life-new'");
  content.experiences[0].satisfaction='25';
  r=await invoke('life_save',a,{revision:1,content,status:'submitted'});
  assert.deepEqual(r.profile.content,content);assert.equal(r.profile.status,'submitted');
  assert.equal(r.profile.content.experiences[0].period,'대학교 2학년');
  assert.equal((await invoke('admin_life_get',admin,{targetStudentId:'ip-a'})).profile.revision,2);
  r=await invoke('admin_life_feedback',admin,{targetStudentId:'ip-a',revision:2,status:'needs_revision',feedback:'구체적으로 어떤 일정 대안을 제시했는지 보완하세요.'});
  await assert.rejects(invoke('life_save',a,{revision:2,content,status:'submitted'}),/revision_conflict/);
  r=await invoke('life_save',a,{revision:3,content:{...content,background:'보완한 이력'},status:'submitted'});
  assert(r.profile.feedback.includes('일정'));assert.equal(r.profile.revision,4);
  await invoke('admin_life_feedback',admin,{targetStudentId:'ip-a',revision:4,status:'approved',feedback:'확인했습니다.'});
  r=await invoke('life_save',a,{revision:5,content,status:'draft'});
  assert.equal(r.profile.status,'draft','Editing must invalidate approval');
  for(const invalid of [
   {...content,secret:'unapproved field'}, {...content,none:['experiences']},
   {...content,experiences:[{...content.experiences[0],competencyIds:['unknown']}]},
   {...content,experiences:[content.experiences[0],content.experiences[0]]},
   {...content,background:null},{...content,experiences:null},
   {...content,qualifications:[{id:'q1',type:'',date:'',name:'license',issuer:'',effort:''}]},
   {...content,none:['affiliations'],awards:[{id:'a1',date:'',name:'award',issuer:'',rank:'',contribution:'101',action:''}]},
   {...content,experiences:[{...content.experiences[0],action:'x'.repeat(2001)}]},
  ])await assert.rejects(invoke('life_save',a,{revision:6,content:invalid,status:'draft'}),/invalid_request/);
  assert.equal((await invoke('life_get',a)).profile.revision,6,'Rejected writes are atomic');
  assert.equal(Number((await db.query("select count(*) n from ip_notes where student_id='ip-a'")).rows[0].n),0,'Life material does not complete 13 notes');
  assert.equal(Number((await db.query("select count(*) n from ip_history where entity='life_profile'")).rows[0].n),6);
  await assert.rejects(invoke('admin_life_get',b,{targetStudentId:'ip-a'}),/forbidden/);
  await assert.rejects(invoke('life_get',admin),/forbidden/);
  for(const role of ['anon','authenticated']){
   await db.exec('set role '+role);
   await assert.rejects(db.query('select * from ip_life_profiles'),/permission denied/);
   await assert.rejects(db.query("insert into ip_life_profiles(student_id,content,status) values('ip-b','{}','draft')"),/permission denied/);
   await assert.rejects(invoke('admin_life_get',admin,{targetStudentId:'ip-a'}),/permission denied/);
   await db.exec('reset role');
  }
  assert((await db.query("select relrowsecurity from pg_class where relname in ('ip_life_profiles','ip_life_competencies')")).rows.every(r=>r.relrowsecurity));
  await db.exec('set role service_role');
  assert.equal((await invoke('life_get',a)).profile.revision,6);await db.exec('reset role');
  // API permissions, forged ownership, and validation.
  process.env.TEACHER_SESSION_SECRET='life-test-only';
  const handler=createHandler({previewAllowed:id=>['ip-a','ip-b'].includes(id),authenticate:async body=>body.deviceToken==='valid'?{id:body.studentId}:null,invoke});
  const call=async(body,headers={})=>{let status,data;await handler({method:'POST',headers:{host:'localhost',...headers},body},{setHeader(){},status(n){status=n;return this;},json(d){data=d;}});return{status,data};};
  const cookie=permissions=>auth.COOKIE_NAME+'='+auth.createSessionToken(process.env.TEACHER_SESSION_SECRET,{username:'qa',role:'admin',permissions});
  assert.equal((await call({action:'life_get',studentId:'ip-b',deviceToken:'valid',targetStudentId:'ip-a',actor:admin})).data.profile,null);
  assert.equal((await call({action:'admin_life_get',targetStudentId:'ip-a'},{cookie:cookie(['interview.read'])})).status,200);
  assert.equal((await call({action:'admin_life_feedback',targetStudentId:'ip-a',revision:6,status:'approved',feedback:'x'},{cookie:cookie(['interview.read'])})).status,403);
  assert.equal((await call({action:'admin_life_get',targetStudentId:'ip-a'})).status,401);
  assert.equal((await call({action:'life_save',studentId:'ip-b',deviceToken:'valid',revision:0,status:'draft',content:[]})).status,400);
  await invoke('admin_member_save',admin,{targetStudentId:'ip-a',track:'공채',examNumber:'A',enabled:true,expiresOn:'2020-01-01'});
  await assert.rejects(invoke('life_get',a),/not_enrolled/);await assert.rejects(invoke('life_save',a,{revision:6,content,status:'draft'}),/not_enrolled/);
  await db.query("delete from students where id='ip-a'");
  assert.equal(Number((await db.query("select count(*) n from ip_life_profiles")).rows[0].n),0);
  assert.equal(Number((await db.query("select count(*) n from ip_history where student_id='ip-a'")).rows[0].n),0);
  console.log('PASS life DB/API: 5 areas, 30 competencies/51 source prompts, empty defaults, student isolation, revisions, feedback/resubmission, validation, RLS/grants, expiry, and deletion cascade.');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
