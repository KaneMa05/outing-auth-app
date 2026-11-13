'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {randomUUID}=require('node:crypto');
const {createDb}=require('./helpers/interview-db.cjs');
const admin={type:'admin',id:'application-product-qa'},action='admin_application_product_save';
const migration='supabase/migrations/20261113065149_interview_application_product_changes.sql';

async function fixture(t){
 const {db,invoke}=await createDb();t.after(()=>db.close());
 await db.exec("create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);update ip_settings set enabled=true;");
 for(const file of ['20261030140517_interview_mock_test_access.sql','20261031052127_fix_mock_access_portal_accounts.sql','20261109053559_interview_aptitude_exams.sql','20261109054842_interview_apple_login.sql','20261110074450_interview_access_products.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8').replace(/\r\n/g,'\n'));
 await db.exec(fs.readFileSync(migration,'utf8').replace(/\r\n/g,'\n'));
 await db.exec("insert into ip_owners(id,legacy_student_id,name) values('ip-a','ip-a','신청 학생')");
 const application=(await db.query("insert into ip_applications(owner_id,name,track,exam_number) values('ip-a','신청 학생','공채','0001') returning *")).rows[0];
 const save=(accessProduct,revision,expectedProduct='interview_package')=>invoke(action,admin,{id:application.id,revision,accessProduct,expectedProduct});
 const current=async()=>(await invoke('admin_applications',admin,{})).applications.find(a=>a.id===application.id);
 return {db,invoke,application,save,current};
}

test('pending/rejected product changes do not approve applicants; approval uses the corrected product',async t=>{
 const f=await fixture(t);
 let result=await f.save('aptitude_only',1);
 assert.equal(result.application.status,'pending');assert.equal(result.application.revision,2);
 assert.equal((await f.current()).current_access_product,'aptitude_only');
 assert.equal((await f.db.query("select count(*)::int n from ip_members where student_id='ip-a'")).rows[0].n,0);
 await f.invoke('admin_application_decide',admin,{id:f.application.id,revision:2,status:'rejected',reviewNote:'등록 확인 필요'});
 result=await f.save('interview_package',3,'aptitude_only');
 assert.equal(result.application.status,'rejected');assert.equal(result.application.review_note,'등록 확인 필요');
 assert.equal((await f.db.query("select count(*)::int n from ip_members where student_id='ip-a'")).rows[0].n,0);
 await f.db.exec("update ip_applications set status='pending'");
 await f.save('aptitude_only',4);
 await f.invoke('admin_application_decide',admin,{id:f.application.id,revision:5,status:'approved',reviewNote:'등록 확인',expiresOn:'2099-12-31'});
 assert.equal((await f.invoke('status',{type:'student',id:'ip-a'},{})).accessProduct,'aptitude_only');
 assert.equal((await f.current()).access_product,'aptitude_only');
});

test('approved changes synchronize access and application, preserving enrollment settings and saved work',async t=>{
 const f=await fixture(t),student={type:'student',id:'ip-a'};
 await f.invoke('admin_application_decide',admin,{id:f.application.id,revision:1,status:'approved',reviewNote:'기존 승인 안내',expiresOn:'2099-12-31'});
 await f.db.exec("update ip_members set mock_test_enabled=true,enabled=false;insert into ip_notes(student_id,topic_id,fields) values('ip-a','self','{\"situation\":\"보존할 답변\"}');");
 const before=(await f.db.query("select * from ip_members where student_id='ip-a'")).rows[0];
 const approved=await f.current();
 await f.save('aptitude_only',2);
 const after=(await f.db.query("select * from ip_members where student_id='ip-a'")).rows[0];
 for(const key of ['student_id','track','exam_number','enabled','expires_on','mock_test_enabled','created_at'])assert.deepEqual(after[key],before[key],key);
 assert.equal(after.access_product,'aptitude_only');
 assert.equal((await f.invoke('status',student,{})).appEnabled,false,'Product changes never reactivate a suspended member');
 const app=await f.current();assert.equal(app.status,'approved');assert.equal(app.review_note,approved.review_note);assert.equal(app.reviewed_by,approved.reviewed_by);assert.equal(app.reviewed_at,approved.reviewed_at);
 assert.equal(app.current_access_product,'aptitude_only');assert.equal(app.access_product,'aptitude_only');
 await f.save('interview_package',3,'aptitude_only');
 assert.equal((await f.db.query("select fields->>'situation' answer from ip_notes where student_id='ip-a'")).rows[0].answer,'보존할 답변');
 const history=(await f.db.query("select snapshot from ip_history where student_id='ip-a' and snapshot->>'change'='access_product' order by id")).rows;
 assert.equal(history.length,2);assert(history.some(h=>h.snapshot.previous_access_product==='interview_package'&&h.snapshot.access_product==='aptitude_only'));
});

test('stale application revisions and member-editor changes fail without partial updates',async t=>{
 const f=await fixture(t);
 await f.invoke('admin_application_decide',admin,{id:f.application.id,revision:1,status:'approved',reviewNote:''});
 await assert.rejects(f.save('aptitude_only',1),/revision_conflict/);
 await f.invoke('admin_member_save',admin,{targetStudentId:'ip-a',track:'공채',examNumber:'0001',enabled:true,accessProduct:'aptitude_only'});
 assert.equal((await f.current()).current_access_product,'aptitude_only','List displays the current enrolled product');
 await assert.rejects(f.save('interview_package',2),/revision_conflict/);
 assert.equal((await f.current()).revision,2);
 await f.save('interview_package',2,'aptitude_only');
 await assert.rejects(f.save('aptitude_only',2),/revision_conflict/);
 assert.equal((await f.current()).revision,3);
 await f.db.exec("delete from ip_members where student_id='ip-a'");
 await assert.rejects(f.save('aptitude_only',3),/student_unavailable/);
 assert.equal((await f.current()).revision,3);
});

test('administrator write permission, valid products, origin and existing RPC privileges are required',async t=>{
 const f=await fixture(t),auth=require('../api/teacher-auth-utils'),oldSecret=process.env.TEACHER_SESSION_SECRET;
 process.env.TEACHER_SESSION_SECRET='application-product-test-secret';
 t.after(()=>{if(oldSecret===undefined)delete process.env.TEACHER_SESSION_SECRET;else process.env.TEACHER_SESSION_SECRET=oldSecret;});
 const cookie=permissions=>({cookie:auth.COOKIE_NAME+'='+auth.createSessionToken(process.env.TEACHER_SESSION_SECRET,{username:admin.id,role:'admin',permissions})});
 const handler=require('../api/interview-prep').createHandler({invoke:f.invoke,authenticateWeb:async()=>({id:'ip-a'})});
 const body={action,id:f.application.id,revision:1,accessProduct:'aptitude_only',expectedProduct:'interview_package'};
 async function call(data,headers={}){let result;await handler({method:'POST',body:data,headers:{host:'qa.local',...headers}},{setHeader(){},status(status){this.code=status;return this;},json(data){result={status:this.code,data};}});return result;}
 assert.equal((await call(body)).status,401);
 assert.equal((await call(body,cookie(['interview.read']))).status,403);
 assert.equal((await call(body,{...cookie(['interview.write']),origin:'https://other.invalid'})).status,403);
 for(const patch of [{id:'invalid'},{revision:null},{accessProduct:'unknown'},{accessProduct:null},{expectedProduct:null},{expectedProduct:'unknown'}])assert.equal((await call({...body,...patch},cookie(['interview.write']))).status,400);
 for(const key of ['accessProduct','expectedProduct']){const missing={...body};delete missing[key];assert.equal((await call(missing,cookie(['interview.write']))).status,400);}
 await assert.rejects(f.invoke(action,{type:'student',id:'ip-a'},body),/forbidden/);
 await assert.rejects(f.save('invalid',1),/invalid_request/);
 assert.equal((await call({...body,id:randomUUID()},cookie(['interview.write']))).status,404);
 const result=await call(body,cookie(['interview.write']));assert.equal(result.status,200);assert.equal(result.data.application.access_product,'aptitude_only');
 assert.equal((await call(body,cookie(['interview.write']))).status,409);
 for(const role of ['anon','authenticated']){await f.db.exec('set role '+role);await assert.rejects(f.invoke(action,admin,body),/permission denied/);await f.db.exec('reset role');}
 const functionInfo=(await f.db.query("select prosecdef,proconfig from pg_proc where oid='ip_portal_service(text,jsonb,jsonb)'::regprocedure")).rows[0];
 assert.equal(functionInfo.prosecdef,false);assert(functionInfo.proconfig.includes('search_path=public, pg_temp'));
});
