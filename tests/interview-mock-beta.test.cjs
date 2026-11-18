'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID}=require('node:crypto');
const {createDb}=require('./helpers/interview-db.cjs');
const admin={type:'admin',id:'beta-qa'},student=id=>({type:'student',id});
const migration='supabase/migrations/20261118085526_interview_job_personality_beta.sql';
const recording=mode=>({runId:randomUUID(),mode,track:'공채',fieldId:'',fieldLabel:'',region:'',recordedAt:new Date().toISOString(),questionCount:1,completed:true,finished:true,
 turns:[{number:1,questionId:'q',question:'가상 연습 질문',answer:'',duration:2,audioBytes:100,audioHash:'a'.repeat(64),audioMime:'audio/webm'}]});
async function respond(handler,body,headers={}){let status,data;await handler({method:'POST',headers:{host:'localhost',...headers},body},{setHeader(){},status(n){status=n;return this;},json(d){data=d;}});return {status,data};}

test('package beta opens recording practice without granting AI, native or graded test access',async t=>{
 const {db,invoke:prep}=await createDb();t.after(()=>db.close());
 const load=async suffix=>db.exec(fs.readFileSync('supabase/migrations/'+fs.readdirSync('supabase/migrations').find(f=>f.endsWith(suffix)),'utf8'));
 for(const suffix of ['_interview_mock_test_access.sql','_fix_mock_access_portal_accounts.sql'])await load(suffix);
 await db.exec("alter table ip_members add column access_product text not null default 'interview_package'; create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]); update ip_settings set enabled=true; insert into ip_owners(id,name) values('portal-only','카카오 수강생');");
 await load('_interview_practice_admin_records.sql');
 for(const id of ['ip-a','ip-b','portal-only'])await prep('admin_member_save',admin,{targetStudentId:id,track:'공채',examNumber:'QA-'+id,enabled:true,expiresOn:''});
 await db.exec("update ip_members set access_product='aptitude_only' where student_id='ip-b'");
 const grantsBefore=(await db.query('select student_id,mock_test_enabled from ip_members order by student_id')).rows;
 await db.exec(fs.readFileSync(migration,'utf8'));
 const invoke=async(fn,action,actor,body={})=>(await db.query('select '+fn+'($1,$2::jsonb,$3::jsonb) result',[action,JSON.stringify(actor),JSON.stringify(body)])).rows[0].result;
 const access=(id,action='mock_status')=>invoke('ip_mock_access_service',action,student(id));
 const archive=(action,id,body)=>invoke('ip_practice_service',action,student(id),body);

 await t.test('active package and portal-only members receive beta while test grants stay unchanged',async()=>{
  for(const id of ['ip-a','portal-only']){assert.deepEqual(await access(id),{ok:true,allowed:false,betaAllowed:true});assert.equal((await access(id,'beta_status')).allowed,true);}
  assert.deepEqual((await db.query('select student_id,mock_test_enabled from ip_members order by student_id')).rows,grantsBefore);
  for(const id of ['ip-b','ip-c','nonexistent'])assert.equal((await access(id)).betaAllowed,false);
  await assert.rejects(invoke('ip_mock_access_service','beta_status',admin),/forbidden/);
 });
 await t.test('expiry, disabled membership/account and global shutdown deny beta and archive writes',async()=>{
  for(const statement of ["update ip_members set expires_on=(now() at time zone 'Asia/Seoul')::date-1 where student_id='ip-a'","update ip_members set enabled=false where student_id='ip-a'","update students set is_active=false where id='ip-a'","update ip_settings set enabled=false"]){
   await db.exec('begin;'+statement);
   try{assert.equal((await access('ip-a','beta_status')).allowed,false);await assert.rejects(archive('sync','ip-a',recording('job')),/not_enrolled/);}finally{await db.exec('rollback');}
  }
  await db.exec("update ip_owners set active=false where id='portal-only'");assert.equal((await access('portal-only')).betaAllowed,false);await db.exec("update ip_owners set active=true where id='portal-only'");
 });
 await t.test('job/personality recordings sync, upload and remain private for portal-only and legacy members',async()=>{
  for(const mode of ['job','personality'])for(const id of ['ip-a','portal-only']){
   const payload=recording(mode),saved=await archive('sync',id,payload);assert.equal(saved.run.mode,mode);assert.equal(saved.turns[0].audio_mime,'audio/webm');
   await archive('uploaded',id,{runId:payload.runId,number:1,audioHash:'a'.repeat(64)});assert.equal((await archive('get',id,{runId:payload.runId})).turns[0].uploaded,true);
   await assert.rejects(archive('get',id==='ip-a'?'portal-only':'ip-a',{runId:payload.runId}),/not_enrolled|not_found/);
  }
  await assert.rejects(archive('sync','ip-b',recording('job')),/not_enrolled/);await assert.rejects(archive('sync','portal-only',recording('ai')),/not_enrolled/);
 });
 await t.test('AI archives reject forged read modes and attempts to change a run mode',async()=>{
  const payload=recording('ai');await db.exec("update ip_members set mock_test_enabled=true where student_id='portal-only'");await archive('sync','portal-only',payload);await db.exec("update ip_members set mock_test_enabled=false where student_id='portal-only'");
  for(const action of ['get','uploaded'])await assert.rejects(archive(action,'portal-only',{runId:payload.runId,mode:'job',number:1,audioHash:'a'.repeat(64)}),/not_enrolled/);
  await assert.rejects(archive('sync','portal-only',{...payload,mode:'job'}),/conflict/);
 });
 await t.test('API binds bootstrap to verified identity and restricts beta to the two recording modes',async()=>{
  const handler=require('../api/interview-prep').createHandler({authenticateWeb:async()=>({id:'portal-only'}),invoke:async(action,actor,body)=>action==='mock_status'?invoke('ip_mock_access_service',action,actor,body):{member:{track:'공채'}},read:async()=>[]});
  for(const mode of ['job','personality'])assert.equal((await respond(handler,{action:'practice_bootstrap',mode,pilot:true,studentId:'ip-b',actor:admin})).status,200);
  assert.equal((await respond(handler,{action:'practice_bootstrap',mode:'ai'})).status,403);
  assert.equal((await respond(handler,{action:'practice_bootstrap',mode:'job'},{origin:'https://evil.invalid'})).status,403);
 });
 await t.test('real archive access uses beta_status; Live and graded practice retain mock_status',async()=>{
  const calls=[];t.mock.method(require('../api/curriculum')._private,'requestSupabase',async(method,path,payload)=>{assert.equal(method,'POST');assert.equal(path,'rpc/ip_mock_access_service');calls.push(payload.p_action);return invoke('ip_mock_access_service',payload.p_action,payload.p_actor,payload.p_body);});
  const requireAccess=require('../lib/interview-mock-access').requireMockAccess;
  const archiveHandler=require('../api/interview-practice-records').createHandler({authenticateWeb:async()=>({id:'portal-only'}),requirePracticeAccess:id=>requireAccess(id,{practiceOnly:true}),invoke:(a,actor,b)=>invoke('ip_practice_service',a,actor,b),storage:{upload:async()=> 'https://example.invalid/private'}});
  assert.equal((await respond(archiveHandler,{action:'sync',...recording('job')})).status,200);assert.equal(calls.at(-1),'beta_status');
  for(const endpoint of ['job-exam','personality','live']){
   const handler=require('../api/interview-'+endpoint).createHandler({authenticateWeb:async()=>({id:'portal-only'}),config:endpoint==='live'?{enabled:true,configured:true,transport:'vercel'}:()=>({enabled:false})});
   assert.equal((await respond(handler,{action:endpoint==='live'?'list':'status'})).status,403);assert.equal(calls.at(-1),'mock_status');
  }
 });
 await t.test('existing AI grants and service-only RPC/table privileges stay intact',async()=>{
  await db.exec("update ip_members set mock_test_enabled=true where student_id='ip-a'");assert.equal((await access('ip-a')).allowed,true);await archive('sync','ip-a',recording('ai'));
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);try{await assert.rejects(access('ip-a','beta_status'),/permission denied/);await assert.rejects(db.query('select * from ip_practice_runs'),/permission denied/);}finally{await db.exec('reset role');}}
  for(const row of (await db.query("select prosecdef,proconfig from pg_proc where proname in ('ip_mock_access_service','ip_practice_service')")).rows){assert.equal(row.prosecdef,false);assert(row.proconfig.some(p=>p.startsWith('search_path=')));}
 });
});
