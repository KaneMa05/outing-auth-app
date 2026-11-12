'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID}=require('node:crypto');
const {createHandler}=require('../api/interview-app-feedback');
const {feedback,validate}=require('../lib/interview-app-feedback.cjs');
const migration=fs.readFileSync('supabase/migrations/20261112092304_interview_test_app_feedback.sql','utf8');
async function setup(t){
 const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
 const db=new PGlite();t.after(()=>db.close());
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create table public.ip_owners(id text primary key,name text);create table public.students(id text primary key,name text);');await db.exec(migration);
 const read=async(_method,_route,b)=>(await db.query('select public.ip_test_app_feedback_service($1,$2::jsonb,$3::jsonb) result',[b.p_action,JSON.stringify(b.p_actor),JSON.stringify(b.p_body)])).rows[0].result;
 const student={type:'student',id:'qa-student',testApp:true},admin={type:'admin',id:'qa-admin'};
 const body=()=>({requestId:randomUUID(),kind:'bug',content:'재생 상태를 확인해주세요.',screen:'live.result',appVersion:'1.0(1)'});
 return {db,read,student,admin,body};
}
test('test-app-only authenticated creation; repeated submission is idempotent and private',async t=>{
 const f=await setup(t),b=f.body();
 const a=await feedback('create',f.student,b,f.read),again=await feedback('create',f.student,b,f.read);assert.equal(a.id,again.id);
 await assert.rejects(feedback('create',f.student,{...b,content:'다른 내용'},f.read),/request_conflict/);
 await assert.rejects(feedback('create',{...f.student,testApp:false},f.body(),f.read),/forbidden/);
 await assert.rejects(feedback('admin_app_feedback_list',f.student,{},f.read),/forbidden/);
 const list=await feedback('admin_app_feedback_list',f.admin,{},f.read);assert.equal(list.items.length,1);assert.equal(list.items[0].student_id,f.student.id);
 for(const role of ['anon','authenticated']){await f.db.exec('set role '+role);await assert.rejects(f.db.query('select * from ip_test_app_feedback'),/permission denied/);await assert.rejects(f.read('POST','rpc',{p_action:'admin_app_feedback_list',p_actor:f.admin,p_body:{}}),/permission denied/);await f.db.exec('reset role');}
});
test('admin status changes require a current revision and filters reflect saved status',async t=>{
 const f=await setup(t),b=f.body(),a=await feedback('create',f.student,b,f.read);
 await feedback('admin_app_feedback_update',f.admin,{id:a.id,revision:0,status:'reviewing'},f.read);
 await assert.rejects(feedback('admin_app_feedback_update',f.admin,{id:a.id,revision:0,status:'resolved'},f.read),/revision_conflict/);
 assert.equal((await feedback('admin_app_feedback_list',f.admin,{status:'received'},f.read)).items.length,0);
 assert.equal((await feedback('admin_app_feedback_list',f.admin,{status:'reviewing'},f.read)).items[0].revision,1);
});
test('daily limit is enforced after idempotent lookup and invalid actors fail closed',async t=>{
 const f=await setup(t),b=f.body();await feedback('create',f.student,b,f.read);
 for(let i=1;i<20;i++)await feedback('create',f.student,f.body(),f.read);
 await feedback('create',f.student,b,f.read);
 await assert.rejects(feedback('create',f.student,f.body(),f.read),/rate_limited/);
 await assert.rejects(f.read('POST','rpc',{p_action:'admin_app_feedback_list',p_actor:{id:'missing-type'},p_body:{}}),/forbidden/);
});
test('API denies ordinary apps, anonymous requests and invalid bodies before storing',async()=>{
 let stored=0;
 const handler=createHandler({authenticate:async req=>req.headers.login?{id:'qa'}:null,read:async()=>{stored++;return {ok:true};}});
 async function call(body,headers={}){let result;const res={setHeader(){},status(code){this.code=code;return this;},json(data){result={status:this.code,data};}};await handler({method:'POST',headers:{host:'local',origin:'https://local',...headers},body},res);return result;}
 const body={requestId:randomUUID(),kind:'bug',content:'화면 오류',screen:'portal',appVersion:'1'};
 assert.equal((await call(body,{login:'1'})).status,403);assert.equal((await call(body,{'x-interview-test-app':'1'})).status,401);
 assert.equal((await call({...body,studentId:'someone-else'},{login:'1','x-interview-test-app':'1'})).status,400);
 assert.equal(stored,0);assert.equal((await call(body,{login:'1','x-interview-test-app':'1'})).status,200);assert.equal(stored,1);
 assert.throws(()=>validate('create',{...body,content:'x'.repeat(2001)}),/invalid_request/);
});
