const assert=require('node:assert/strict');
const {createDb}=require('./helpers/interview-db.cjs');
(async()=>{
 const {db,invoke}=await createDb();
 try{
  const admin={type:'admin',id:'qa'},a={type:'student',id:'ip-a'},b={type:'student',id:'ip-b'};
  await invoke('admin_enabled',admin,{enabled:true});
  for(const id of [a.id,b.id])await invoke('admin_member_save',admin,{targetStudentId:id,track:'공채',examNumber:id,enabled:true});
  const history=Object.fromEntries(['school','major','clubs','volunteering','internships','company','role','achievements'].map(k=>[k,{text:'',none:true}]));
  const content={background:'기존 소개',basicInfo:{...history,name:{text:'가상 학생',none:false},birthDate:{text:'2000-02-29',none:false},gender:{text:'female',none:false}},qualifications:[],affiliations:[],awards:[],experiences:[],none:[]};
  const saved=(await invoke('life_save',a,{revision:0,status:'draft',content})).profile;
  assert.deepEqual((await invoke('life_get',a)).profile.content,content);
  assert.equal((await invoke('admin_life_get',admin,{targetStudentId:a.id})).profile.content.basicInfo.name.text,'가상 학생');
  assert(!JSON.stringify(await invoke('life_get',b)).includes('가상 학생'));
  for(const [key,text] of [['name','가'.repeat(101)],['birthDate','2001-02-29'],['birthDate','2000-04-31'],['birthDate','0000-01-01'],['birthDate','9999-01-01'],['birthDate','2000/01/01'],['gender','unknown']]){
   const bad=structuredClone(content);bad.basicInfo[key].text=text;
   await assert.rejects(invoke('life_save',a,{revision:saved.revision,status:'draft',content:bad}),/invalid_request/);
  }
  for(const identity of [{},{name:{text:'',none:false},birthDate:{text:'',none:false},gender:{text:'undisclosed',none:false}}]){
   const c={...content,basicInfo:{...history,...identity}};
   assert.equal((await db.query('select ip_basic_validate($1::jsonb) valid,ip_basic_complete($1::jsonb) complete',[c])).rows[0].valid,true);
   assert.equal((await db.query('select ip_basic_complete($1::jsonb) complete',[c])).rows[0].complete,true);
  }
  const source=(await db.query('select ip_basic_text($1::jsonb) value',[content])).rows[0].value;
  assert(!source.includes('2000-02-29'));assert(!source.includes('가상 학생'));assert(!source.includes('female'));
  await assert.rejects(invoke('life_save',a,{revision:0,status:'draft',content}),/revision_conflict/);
  assert.equal((await invoke('life_get',a)).profile.revision,saved.revision);
  console.log('PASS identity fields: save/read/admin, owner isolation, valid dates, enum/length limits, legacy compatibility and unchanged AI readiness/source.');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
