const assert=require('node:assert/strict');
const {createDb}=require('./helpers/interview-db.cjs');
(async()=>{
 const {db,invoke}=await createDb(),admin={type:'admin',id:'qa'},student={type:'student',id:'ip-a'};
 try{
  await invoke('admin_member_save',admin,{targetStudentId:'ip-a',track:'공채',examNumber:'TEST',enabled:true});await invoke('admin_enabled',admin,{enabled:true});
  const basicInfo=Object.fromEntries(['school','major','clubs','volunteering','internships','company','role'].map(k=>[k,{text:k==='school'?'기존 학교명':'',none:false}]));
  const content={background:'기존 소개',basicInfo,qualifications:[],affiliations:[],awards:[],experiences:[],none:[]};
  let saved=await invoke('life_save',student,{revision:0,content,status:'draft'});
  assert.equal(saved.profile.content.basicInfo.school.status,undefined);
  for(const [status,label]of [['graduated','졸업'],['enrolled','재학'],['leave','휴학']]){
   content.basicInfo.school.status=status;
   saved=await invoke('life_save',student,{revision:saved.profile.revision,content,status:'draft'});
   for(const [action,actor,payload]of [['life_get',student,{}],['admin_life_get',admin,{targetStudentId:'ip-a'}]]){
    const read=await invoke(action,actor,payload);assert.equal(read.profile.content.basicInfo.school.status,status);assert.equal(read.profile.content.basicInfo.school.text,'기존 학교명');assert.equal(read.profile.content.background,'기존 소개');
   }
   const text=(await db.query('select ip_basic_text($1::jsonb) value',[JSON.stringify(content)])).rows[0].value;assert(text.includes('기존 학교명 · '+label));
  }
  for(const status of ['other',null,1,true,['graduated'],{}]){
   const invalid=structuredClone(content);invalid.basicInfo.school.status=status;
   await assert.rejects(invoke('life_save',student,{revision:saved.profile.revision,content:invalid,status:'draft'}),/invalid_request/);
  }
  const invalid=structuredClone(content);invalid.basicInfo.major.status='graduated';
  await assert.rejects(invoke('life_save',student,{revision:saved.profile.revision,content:invalid,status:'draft'}),/invalid_request/);
  const none=structuredClone(content);none.basicInfo.school.none=true;
  const text=(await db.query('select ip_basic_text($1::jsonb) value',[JSON.stringify(none)])).rows[0].value;assert(text.includes('학교: 해당 없음'));assert(!text.includes('휴학'));
  await assert.rejects(invoke('life_save',student,{revision:0,content,status:'draft'}),/revision_conflict/);
  const perms=await db.query("select p.proname,p.prosecdef,has_function_privilege('anon',p.oid,'EXECUTE') anon,has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated,has_function_privilege('service_role',p.oid,'EXECUTE') service from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('ip_basic_validate','ip_basic_text')");
  for(const row of perms.rows){assert.equal(row.prosecdef,false);assert.equal(row.anon,false);assert.equal(row.authenticated,false);assert.equal(row.service,true);}
  console.log('PASS: three statuses save/read across student and teacher views; old data, validation, revisions and existing permissions preserved');
 }finally{await db.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
