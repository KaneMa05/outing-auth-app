'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID}=require('node:crypto');
const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const admin={type:'admin',id:'course-home-qa'},actor=id=>({type:'student',id});
async function fixture(t){
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table students(id text primary key,name text,is_active boolean default true,account_type text default 'student',password_hash text);grant select on students to service_role;insert into students(id,name) values('package','패키지 학생'),('interview','면접 학생'),('aptitude','인적성 학생'),('unregistered','미등록 학생');`);
 const read=file=>fs.readFileSync('supabase/migrations/'+file,'utf8').replace(/\r\n/g,'\n');
 for(const file of fs.readdirSync('supabase/migrations').filter(f=>/^\d{14}_(interview_.*|iphone_practice_.*)\.sql$/.test(f)).sort()){
  if(file.endsWith('_interview_mock_test_question_scope.sql'))for(const q of require('../lib/interview-test-question-scope.json').questions)await db.query("insert into ip_questions(id,prompt,category,status,tracks) values($1,$2,$3,'published',array['공채'])",[q.id,q.prompt,q.category]);
  await db.exec(read(file));
 }
 const rpc=async(fn,action,who,body={})=>(await db.query('select '+fn+'($1,$2::jsonb,$3::jsonb) result',[action,JSON.stringify(who),JSON.stringify(body)])).rows[0].result;
 for(const [id,accessProduct]of [['package','interview_package'],['interview','interview_only'],['aptitude','aptitude_only']])await rpc('ip_service','admin_member_save',admin,{targetStudentId:id,track:'공채',examNumber:id,enabled:true,expiresOn:'2099-12-31',accessProduct});
 await db.exec('update ip_settings set enabled=true');
 return {db,rpc,prep:(action,who,body)=>rpc('ip_service',action,who,body),practice:(action,who,body)=>rpc('ip_practice_service',action,who,body)};
}
const run=(mode='job')=>({runId:randomUUID(),mode,track:'공채',fieldId:'',fieldLabel:'',region:'',recordedAt:new Date().toISOString(),questionCount:1,finished:true,completed:true,turns:[{number:1,questionId:'local-qa',question:'비교용 질문',answer:'',duration:1,audioBytes:96,audioHash:'a'.repeat(64),audioMime:'audio/webm'}]});

test('course home and practice gates preserve student isolation and existing product boundaries',async t=>{
 const f=await fixture(t);
 await t.test('all active courses can read only their own home enrollment summary',async()=>{
  for(const id of ['package','interview','aptitude']){
   const result=await f.prep('home',actor(id));assert.equal(result.ok,true);assert.equal(result.member.exam_number,id);
   assert.deepEqual(Object.keys(result).sort(),['member','ok']);assert.deepEqual(Object.keys(result.member).sort(),['access_product','exam_number','track']);
  }
  await assert.rejects(f.prep('home',actor('unregistered')),/not_enrolled/);
  await assert.rejects(f.prep('home',admin),/forbidden/);
  await assert.rejects(f.prep('bootstrap',actor('aptitude')),/not_enrolled/);
  for(const action of ['questions','life_get','writing_list']){
   const fn=action==='life_get'?'ip_life_service':action==='writing_list'?'ip_writing_service':'ip_service';
   await assert.rejects(f.rpc(fn,action,actor('aptitude')),/not_enrolled/);
  }
 });
 await t.test('the home API returns published notices only after enrollment checks, without loading interview data',async()=>{
  let user='aptitude',reads=0;const actions=[];
  const handler=require('../api/interview-prep').createHandler({authenticateWeb:async()=>({id:user}),invoke:async(action,who,body)=>{actions.push(action);return f.prep(action,who,body);},read:async(method,url)=>{reads++;assert.equal(method,'GET');assert(url.startsWith('interview_notices?'));return [{id:'notice',title:'공지 확인',body:'적성 모의고사 안내',is_published:true,target_audience:'interview'}];}});
  async function call(body){let result;await handler({method:'POST',headers:{host:'qa.local',origin:'https://qa.local'},body},{setHeader(){},status(status){this.code=status;return this;},json(data){result={status:this.code,data};}});return result;}
  let response=await call({action:'home',studentId:'package'});assert.equal(response.status,200);assert.equal(response.data.member.exam_number,'aptitude');assert.equal(response.data.notices[0].title,'공지 확인');assert.deepEqual(actions,['home']);assert.equal(reads,1);
  user='unregistered';response=await call({action:'home'});assert.equal(response.status,403);assert.equal(reads,1);
  user='aptitude';response=await call({action:'home',accessProduct:'interview_package'});assert.equal(response.status,400);assert.equal(reads,1);
 });
 await t.test('interview-only and package students can sync, upload and read job/personality recordings',async()=>{
  for(const id of ['package','interview'])for(const mode of ['job','personality']){
   const body=run(mode),who=actor(id),result=await f.practice('sync',who,body);assert.equal(result.turns[0].uploaded,false);
   await f.practice('uploaded',who,{runId:body.runId,number:1,audioHash:'a'.repeat(64)});
   assert.equal((await f.practice('get',who,{runId:body.runId})).turns[0].uploaded,true);
   await assert.rejects(f.practice('get',actor(id==='package'?'interview':'package'),{runId:body.runId}),/not_enrolled|not_found/);
  }
  await assert.rejects(f.practice('sync',actor('aptitude'),run()),/not_enrolled/);
  for(const id of ['package','interview'])await assert.rejects(f.practice('sync',actor(id),run('ai')),/not_enrolled/);
 });
 await t.test('the recording HTTP adapter now accepts an ordinary interview-only beta member',async()=>{
  const handler=require('../api/interview-practice-records').createHandler({authenticateWeb:async()=>({id:'interview'}),requirePracticeAccess:async id=>{assert.equal((await f.rpc('ip_mock_access_service','beta_status',actor(id))).allowed,true);},invoke:f.practice,storage:{upload:async()=> 'https://local.invalid/qa-upload'}});
  let result;await handler({method:'POST',headers:{host:'qa.local',origin:'https://qa.local'},body:{action:'sync',...run()}},{setHeader(){},status(status){this.code=status;return this;},json(data){result={status:this.code,data};}});
  assert.equal(result.status,200);assert.equal(result.data.uploads.length,1);
 });
 await t.test('new home and archive access respect interview/app termination and restoration',async()=>{
  for(const scope of ['interview','app']){
   await f.db.query("insert into ip_member_access(student_id,scope) values('interview',$1) on conflict(student_id) do update set scope=excluded.scope",[scope]);
   await assert.rejects(f.prep('home',actor('interview')),/not_enrolled/);
   await assert.rejects(f.practice('sync',actor('interview'),run()),/not_enrolled/);
   assert.equal((await f.rpc('ip_mock_access_service','beta_status',actor('interview'))).allowed,false);
  }
  await f.db.exec("update ip_member_access set scope='active' where student_id='interview'");
  assert.equal((await f.prep('home',actor('interview'))).ok,true);
  assert.equal((await f.practice('sync',actor('interview'),run())).ok,true);
 });
 await t.test('expiry, suspension, inactive accounts and global closure still deny home and recording access',async()=>{
  for(const change of ["expires_on='2000-01-01'","enabled=false"]){
   await f.db.exec('update ip_members set '+change+" where student_id='interview'");
   await assert.rejects(f.prep('home',actor('interview')),/not_enrolled/);await assert.rejects(f.practice('sync',actor('interview'),run()),/not_enrolled/);
   await f.db.exec("update ip_members set enabled=true,expires_on='2099-12-31' where student_id='interview'");
  }
  await f.db.exec("update students set is_active=false where id='interview'");await assert.rejects(f.prep('home',actor('interview')),/not_enrolled/);await f.db.exec("update students set is_active=true where id='interview'");
  await f.db.exec('update ip_settings set enabled=false');await assert.rejects(f.prep('home',actor('aptitude')),/not_enrolled/);await assert.rejects(f.practice('sync',actor('interview'),run()),/not_enrolled/);await f.db.exec('update ip_settings set enabled=true');
 });
 await t.test('existing invoker execution and service-only RPC privileges are retained',async()=>{
  for(const role of ['anon','authenticated']){await f.db.exec('set role '+role);await assert.rejects(f.prep('home',actor('aptitude')),/permission denied/);await assert.rejects(f.practice('sync',actor('interview'),run()),/permission denied/);await f.db.exec('reset role');}
  const functions=(await f.db.query("select prosecdef,proconfig from pg_proc where oid in ('ip_service(text,jsonb,jsonb)'::regprocedure,'ip_practice_service(text,jsonb,jsonb)'::regprocedure)")).rows;
  assert(functions.every(f=>!f.prosecdef&&f.proconfig.some(c=>c.startsWith('search_path='))));
 });
});
