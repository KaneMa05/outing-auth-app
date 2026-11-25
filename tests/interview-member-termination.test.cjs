'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createDb}=require('./helpers/interview-db.cjs');
const admin={type:'admin',id:'termination-qa'},student=id=>({type:'student',id});
async function fixture(t){
 const {db,invoke}=await createDb();t.after(()=>db.close());
 await db.exec("create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);update ip_settings set enabled=true;");
 for(const file of ['20261030140517_interview_mock_test_access.sql','20261031052127_fix_mock_access_portal_accounts.sql','20261109053559_interview_aptitude_exams.sql','20261109054842_interview_apple_login.sql','20261110074450_interview_access_products.sql','20261112152643_interview_aptitude_results_on_submission.sql','20261113073836_interview_application_product_changes.sql','20261113075252_interview_application_review_products.sql','20261125050455_interview_only_product.sql','20261125054036_interview_member_termination.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8').replace(/\r\n/g,'\n'));
 const rpc=async(fn,action,actor,body={})=>(await db.query('select '+fn+'($1,$2::jsonb,$3::jsonb) result',[action,JSON.stringify(actor),JSON.stringify(body)])).rows[0].result;
 const call=(action,body={})=>rpc('ip_enrollment_service',action,admin,body);
 for(const [id,product] of [['ip-a','interview_package'],['ip-b','interview_only'],['ip-c','aptitude_only']])await rpc('ip_mock_access_service','admin_member_save',admin,{targetStudentId:id,track:'공채',examNumber:id,enabled:true,expiresOn:'2099-12-31',accessProduct:product,mockTestEnabled:true});
 const roster=body=>call('admin_enrollment_list',body);
 const change=async(id,operation='end',scope='interview',reasonId='fitness',note='')=>{
  const m=(await roster()).members.find(m=>m.id===id);
  return call('admin_enrollment_change',{operation,scope,reasonId:operation==='restore'?'':reasonId,note,items:[{id,revision:m.access_revision,memberUpdatedAt:m.updated_at}]});
 };
 return {db,invoke,rpc,call,roster,change};
}
test('interview termination preserves aptitude, purchase, existing notes and other learner accounts; restore respects later expiry and suspension',async t=>{
 const f=await fixture(t),actor=student('ip-a');
 await f.db.exec("insert into ip_notes(student_id,topic_id,fields) values('ip-a','self','{\"situation\":\"보존할 답변\"}');");
 const before=(await f.db.query('select * from students order by id')).rows;
 const result=await f.change('ip-a');assert.equal(result.results[0].ok,true,JSON.stringify(result));
 const status=await f.invoke('status',actor);assert.equal(status.terminationScope,'interview');assert.equal(status.enabled,false);assert.equal(status.appEnabled,true);assert(status.endedAt);
 for(const action of ['bootstrap','life_get','writing_list','core_questions','diagnosis_get'])await assert.rejects(f.invoke(action,actor),/not_enrolled/,action);
 assert.equal((await f.rpc('ip_mock_access_service','mock_status',actor)).allowed,false);
 assert.equal((await f.rpc('ip_aptitude_service','list',actor)).ok,true);
 assert.equal((await f.db.query("select access_product from ip_members where student_id='ip-a'")).rows[0].access_product,'interview_package');
 await f.rpc('ip_mock_access_service','admin_member_save',admin,{targetStudentId:'ip-a',track:'공채',examNumber:'changed',enabled:true,accessProduct:'interview_package'});
 assert.equal((await f.invoke('status',actor)).enabled,false,'Ordinary member edits do not undo termination');
 await f.db.exec("update ip_members set enabled=false,expires_on='2000-01-01' where student_id='ip-a'");
 assert.equal((await f.change('ip-a','restore','active')).results[0].ok,true);
 const restored=await f.invoke('status',actor);assert.equal(restored.terminationScope,'active');assert.equal(restored.enabled,false);assert.equal(restored.appEnabled,false);
 assert.equal((await f.db.query("select fields->>'situation' value from ip_notes where student_id='ip-a'")).rows[0].value,'보존할 답변');
 assert.deepEqual((await f.db.query('select * from students order by id')).rows,before);
 assert.deepEqual((await f.call('admin_enrollment_history',{targetStudentId:'ip-a'})).history.map(h=>h.action),['restore','end']);
});
test('app termination blocks aptitude and reapplication but retains an authenticated session and private admin-only reasons',async t=>{
 const f=await fixture(t),actor=student('ip-c'),hash='a'.repeat(64);
 await f.db.query("insert into ip_web_sessions(token_hash,owner_id) values($1,'ip-c')",[hash]);
 assert.equal((await f.change('ip-c','end','app','refund','관리자 전용 메모')).results[0].ok,true);
 assert.equal((await f.invoke('status',actor)).appEnabled,false);
 await assert.rejects(f.rpc('ip_aptitude_service','list',actor),/not_enrolled/);
 const session=await f.rpc('ip_portal_service','session',{type:'server'},{sessionHash:hash});
 assert.equal(session.authenticated,true);assert.equal(session.available,false);assert.equal(session.access.terminationScope,'app');
 assert(!JSON.stringify(session).includes('관리자 전용 메모'));assert(!JSON.stringify(session).includes('refund'));
 await assert.rejects(f.rpc('ip_portal_service','apply',{type:'server'},{sessionHash:hash,name:'재신청',track:'공채',examNumber:'new',revision:0}),/enrollment_ended/);
 assert.equal((await f.change('ip-b')).results[0].ok,true);assert.equal((await f.invoke('status',student('ip-b'))).appEnabled,true);
 assert.equal((await f.change('ip-c','restore','active')).results[0].ok,true);assert.equal((await f.invoke('status',actor)).appEnabled,true);
});
test('bulk operations detect stale enrollment and duplicate retries; reason rename/archive preserves history',async t=>{
 const f=await fixture(t),list=await f.roster();
 const items=list.members.filter(m=>m.id!=='ip-c').map(m=>({id:m.id,revision:m.access_revision,memberUpdatedAt:m.updated_at}));
 await f.db.exec("update ip_members set updated_at=updated_at+interval '1 second' where student_id='ip-b'");
 const payload={operation:'end',scope:'interview',reasonId:'fitness',note:'일괄 처리',items};
 const result=await f.call('admin_enrollment_change',payload);assert.equal(result.results.filter(r=>r.ok).length,1);assert.equal(result.results.find(r=>r.id==='ip-b').error,'revision_conflict');
 assert.equal((await f.call('admin_enrollment_change',payload)).results.filter(r=>r.ok).length,0);
 assert.equal((await f.call('admin_enrollment_history',{targetStudentId:'ip-a'})).history.length,1);
 await f.call('admin_enrollment_reason_save',{id:'fitness',revision:1,name:'체력시험 불합격',active:false,requiresNote:false});
 assert.equal((await f.roster({enrollmentStatus:'ended'})).members[0].reason_name,'체력 탈락');
 await assert.rejects(f.change('ip-b'),/invalid_request/);
 await assert.rejects(f.call('admin_enrollment_reason_save',{id:'',revision:0,name:'환불',active:true,requiresNote:false}),/reason_in_use/);
 await assert.rejects(f.change('ip-b','end','interview','other'),/invalid_request/);
 const custom=(await f.call('admin_enrollment_reason_save',{id:'',revision:0,name:'추가 사유',active:true,requiresNote:false})).reason;
 assert.equal((await f.change('ip-b','end','interview',custom.id)).results[0].ok,true);
 for(const role of ['anon','authenticated']){await f.db.exec('set role '+role);await assert.rejects(f.roster(),/permission denied/);await assert.rejects(f.db.query('select * from ip_member_access'),/permission denied/);await f.db.exec('reset role');}
 await assert.rejects(f.rpc('ip_enrollment_service','admin_enrollment_list',student('ip-a')),/forbidden/);
});
test('API validates batch limits, duplicate targets, scope, reason and mass-assignment fields',()=>{
 const {validate}=require('../lib/interview-enrollment.cjs');
 const payload={action:'admin_enrollment_change',operation:'end',scope:'interview',reasonId:'fitness',note:'',items:[{id:'ip-a',revision:0,memberUpdatedAt:new Date().toISOString()}]};
 assert.doesNotThrow(()=>validate(payload));
 for(const p of [{...payload,items:[payload.items[0],payload.items[0]]},{...payload,enabled:true},{...payload,scope:'active'},{...payload,reasonId:''},{...payload,items:Array(101).fill(payload.items[0])}])assert.throws(()=>validate(p),/invalid_request/);
});
test('ended live sessions close without requesting another paid follow-up',async()=>{
 const {LiveEngine}=require('../lib/interview-live-engine');let calls=0,closed=0;
 const engine=new LiveEngine({invoke:async()=>{throw Error('not_enrolled');},provider:{followup:async()=>{calls++;}},now:()=>100000});
 engine.finish=async()=>{closed++;};
 const live={run:{id:'ended-run'},actor:student('ended-student'),answer:'저장된 답변',calls:0,lastAttemptAt:0,version:1,turns:[],current:{question:'경험을 말씀해주세요.'},lastInput:0};
 await engine.advance(live,null,true);assert.equal(calls,0);assert.equal(closed,1);
 engine.sessions.set(live.run.id,live);await assert.rejects(engine.command(live.actor,{action:'heartbeat',runId:live.run.id}),/not_enrolled/);assert.equal(closed,2);
});
test('administrator enrollment reads and writes require their respective permissions at the HTTP boundary',async t=>{
 const auth=require('../api/teacher-auth-utils'),previous=process.env.TEACHER_SESSION_SECRET;
 process.env.TEACHER_SESSION_SECRET='enrollment-unit-test-secret';t.after(()=>{if(previous===undefined)delete process.env.TEACHER_SESSION_SECRET;else process.env.TEACHER_SESSION_SECRET=previous;});
 let writes=0;
 const handler=require('../api/interview-prep').createHandler({read:async(method,path,body)=>{assert.equal(path,'rpc/ip_enrollment_service');writes++;return {ok:true};}});
 const call=async(body,permissions)=>{let response;const cookie=permissions?auth.COOKIE_NAME+'='+auth.createSessionToken(process.env.TEACHER_SESSION_SECRET,{username:'qa',role:'admin',permissions}):'';await handler({method:'POST',body,headers:{host:'qa.local',cookie}},{setHeader(){},status(status){this.code=status;return this;},json(data){response={status:this.code,data};}});return response;};
 assert.equal((await call({action:'admin_enrollment_list'})).status,401);
 assert.equal((await call({action:'admin_enrollment_list'},[])).status,403);
 assert.equal((await call({action:'admin_enrollment_list'},['interview.read'])).status,200);
 const save={action:'admin_enrollment_reason_save',id:'',revision:0,name:'사유',active:true,requiresNote:false};
 assert.equal((await call(save,['interview.read'])).status,403);
 assert.equal((await call(save,['interview.write'])).status,200);
 assert.equal(writes,2);
});
test('complete migration chain closes every interview RPC/native entry and prevents queued work from dispatching',async t=>{
 const {PGlite}=require(process.env.PGLITE_MODULE||'C:/Users/Public/Documents/ESTsoft/CreatorTemp/ox-db-tools/node_modules/@electric-sql/pglite');
 const db=new PGlite();t.after(()=>db.close());
 await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create table students(id text primary key,name text,is_active boolean default true,account_type text default 'student',password_hash text);grant select on students to service_role;insert into students(id,name) values('ended-student','종료 검증');create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);");
 const files=fs.readdirSync('supabase/migrations').filter(file=>/^\d{14}_(interview_.*|iphone_practice_.*)\.sql$/.test(file)).sort();
 for(const file of files){
  if(file.endsWith('_interview_mock_test_question_scope.sql'))for(const q of require('../lib/interview-test-question-scope.json').questions)await db.query("insert into ip_questions(id,prompt,category,status,tracks) values($1,$2,$3,'published',array['공채'])",[q.id,q.prompt,q.category]);
  await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8').replace(/\r\n/g,'\n'));
 }
 const rpc=async(fn,action,actor,body={})=>(await db.query('select '+fn+'($1,$2::jsonb,$3::jsonb) result',[action,JSON.stringify(actor),JSON.stringify(body)])).rows[0].result;
 const actor={type:'student',id:'ended-student',testApp:true};
 await db.exec('update ip_settings set enabled=true');
 await rpc('ip_mock_access_service','admin_member_save',admin,{targetStudentId:actor.id,track:'공채',examNumber:'QA',enabled:true,expiresOn:'2099-12-31',mockTestEnabled:true,accessProduct:'interview_package'});
 await rpc('ip_native_launch_service','issue',actor,{codeHash:'e'.repeat(64)});
 await db.query("insert into ip_draft_question_jobs(student_id,source_hash,experience) values($1,'queued-fixture','{}')",[actor.id]);
 const captionRun=require('node:crypto').randomUUID(),audioHash='a'.repeat(64);
 await rpc('ip_practice_service','sync',actor,{runId:captionRun,mode:'personality',track:'공채',recordedAt:new Date().toISOString(),questionCount:1,completed:true,finished:true,turns:[{number:1,questionId:'caption-qa',question:'검증 질문',answer:'',duration:60,audioBytes:1000,audioHash}]});
 await rpc('ip_practice_service','uploaded',actor,{runId:captionRun,number:1,audioHash});
 await db.query("update ip_practice_transcriptions set status='completed',transcript='보존할 녹음 자막' where run_id=$1",[captionRun]);
 assert.equal((await db.query('select ip_practice_student_captions($1::jsonb,$2::uuid) r',[JSON.stringify(actor),captionRun])).rows[0].r.captions[0].text,'보존할 녹음 자막');
 const m=(await rpc('ip_enrollment_service','admin_enrollment_list',admin)).members[0];
 const ended=await rpc('ip_enrollment_service','admin_enrollment_change',admin,{operation:'end',scope:'interview',reasonId:'fitness',note:'',items:[{id:m.id,revision:m.access_revision,memberUpdatedAt:m.updated_at}]});assert.equal(ended.results[0].ok,true);
 for(const [fn,action] of [['ip_service','bootstrap'],['ip_core_service','core_questions'],['ip_life_service','life_get'],['ip_ai_service','status'],['ip_writing_service','writing_list'],['ip_writing_history_service','writing_history'],['ip_diagnosis_service','diagnosis_get'],['ip_life_followup_service','get'],['ip_preassignment_service','bootstrap'],['ip_pa_guidance_service','get'],['ip_pa_diagnosis_service','get'],['ip_draft_question_service','request'],['ip_job_exam_service','ready'],['ip_personality_service','ready'],['ip_practice_cli_service','status'],['ip_openai_practice_service','status'],['ip_live_service','heartbeat'],['ip_live_openai_report_service','get'],['ip_exam_report_service','get'],['ip_test_app_feedback_service','list']])await assert.rejects(rpc(fn,action,actor),/not_enrolled/,fn);
 await assert.rejects(db.query('select ip_ai_materials_service($1::jsonb,$2::jsonb)',[JSON.stringify(actor),'{}']),/not_enrolled/);
 await assert.rejects(rpc('ip_native_launch_service','issue',actor,{codeHash:'d'.repeat(64)}),/not_enrolled/);
 await assert.rejects(rpc('ip_native_launch_service','consume',{type:'server',testApp:true},{codeHash:'e'.repeat(64)}),/not_enrolled/);
 await assert.rejects(db.query('select ip_practice_student_captions($1::jsonb,$2::uuid)',[JSON.stringify(actor),captionRun]),/not_enrolled/);
 await assert.rejects(db.query('select ip_practice_update_student_caption($1::jsonb,$2::uuid,$3,1,0,$4)',[JSON.stringify(actor),captionRun,'personality','금지된 수정']),/not_enrolled/);
 assert.deepEqual((await rpc('ip_draft_question_service','poll',{type:'worker',id:'qa-worker'})).jobs,[]);
 assert.equal((await rpc('ip_aptitude_service','list',actor)).ok,true);
 const info=(await db.query("select prosecdef,proconfig from pg_proc where oid='ip_enrollment_service(text,jsonb,jsonb)'::regprocedure")).rows[0];assert.equal(info.prosecdef,false);assert(info.proconfig.some(path=>path.startsWith('search_path=')));
});
