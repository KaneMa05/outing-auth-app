'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID}=require('node:crypto');
const {createDb}=require('./helpers/interview-db.cjs');
const migration='supabase/migrations/20261112020620_interview_test_report_open_enrollment.sql';
test('test reports allow approved open-ended enrollment while preserving ordinary access and once-only claims',async t=>{
 const {db,invoke:prep}=await createDb();t.after(()=>db.close());
 for(const n of ['20261021060740_interview_live_sessions.sql','20261021085929_interview_native_launch.sql','20261103062625_interview_live_result_reports.sql','20261030140517_interview_mock_test_access.sql','20261031052127_fix_mock_access_portal_accounts.sql','20261111021049_interview_native_portal_launch.sql','20261106061004_interview_openai_live_reports.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+n,'utf8'));
 await prep('admin_enabled',{type:'admin',id:'qa'},{enabled:true});
 await db.exec("insert into ip_owners(id,name) values('portal-report','가상 테스트 계정');insert into ip_members(student_id,track,exam_number,enabled,mock_test_enabled) values('portal-report','공채','report-fixture',true,true)");
 const actor={type:'student',id:'portal-report',testApp:true};
 const turns=[{question:'협업 경험은?',answer:'역할을 나누었습니다.',complete:true,kind:'initial'}];
 const insert=async(owner=actor.id)=>(await db.query("insert into ip_live_runs(student_id,request_key,state,questions,turns,retain_until) values($1,$2,'completed','[]',$3,now()+interval '1 day') returning id",[owner,randomUUID(),JSON.stringify(turns)])).rows[0].id;
 const claim=(id,who=actor,body={})=>db.query('select ip_live_openai_report_service($1,$2::jsonb,$3::jsonb) result',['claim',JSON.stringify(who),JSON.stringify({runId:id,sourceHash:'a'.repeat(64),token:randomUUID(),turns,...body})]).then(r=>r.rows[0].result);
 const id=await insert();await assert.rejects(claim(id),/not_enrolled/);
 await db.exec(fs.readFileSync(migration,'utf8'));
 assert.equal((await claim(id)).claimed,true);assert.equal((await claim(id)).claimed,false);
 await assert.rejects(claim(await insert(),{type:'student',id:actor.id}),/forbidden|not_enrolled/);
 for(const change of ["mock_test_enabled=false","enabled=false","expires_on='2000-01-01'"]){
  await db.exec('update ip_members set '+change+" where student_id='portal-report'");await assert.rejects(claim(await insert()),/forbidden|not_enrolled/);
  await db.exec("update ip_members set mock_test_enabled=true,enabled=true,expires_on=null where student_id='portal-report'");
 }
 await assert.rejects(claim(await insert('ip-b')),/not_found/);
 await assert.rejects(claim(await insert(),actor,{turns:[]}),/source_changed/);
 await prep('admin_member_save',{type:'admin',id:'qa'},{targetStudentId:'ip-a',track:'공채',examNumber:'ordinary',enabled:true,expiresOn:'2099-12-01'});
 assert.equal((await claim(await insert('ip-a'),{type:'student',id:'ip-a'})).claimed,true);
 const flags=(await db.query("select prosecdef,has_function_privilege('anon',oid,'execute') as anon_execute,has_function_privilege('service_role',oid,'execute') as service_execute from pg_proc where oid='ip_live_openai_report_service(text,jsonb,jsonb)'::regprocedure")).rows[0];
 assert.equal(flags.prosecdef,false);assert.equal(flags.anon_execute,false);assert.equal(flags.service_execute,true);
});
