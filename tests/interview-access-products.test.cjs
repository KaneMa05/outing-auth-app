'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {randomUUID}=require('node:crypto');
const {createDb}=require('./helpers/interview-db.cjs');
const webAuth=require('../lib/interview-web-auth');
const admin={type:'admin',id:'product-qa'},student=id=>({type:'student',id});
const migration='supabase/migrations/20261110074450_interview_access_products.sql';

async function fixture(t){
 const {db,invoke}=await createDb();t.after(()=>db.close());
 await db.exec("create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]); update ip_settings set enabled=true;");
 await invoke('admin_member_save',admin,{targetStudentId:'ip-a',track:'공채',examNumber:'existing',enabled:true,expiresOn:''});
 for(const file of ['20261030140517_interview_mock_test_access.sql','20261031052127_fix_mock_access_portal_accounts.sql','20261109053559_interview_aptitude_exams.sql','20261109054842_interview_apple_login.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
 await db.exec(fs.readFileSync(migration,'utf8'));
 const call=async(fn,action,actor,body={})=>(await db.query('select '+fn+'($1,$2::jsonb,$3::jsonb) result',[action,JSON.stringify(actor),JSON.stringify(body)])).rows[0].result;
 return {db,invoke,portal:(action,body)=>call('ip_portal_service',action,{type:'server'},body),mock:(action,actor,body)=>call('ip_mock_access_service',action,actor,body),aptitude:(action,actor,body)=>call('ip_aptitude_service',action,actor,body)};
}

test('application product is pending until approval; aptitude members can take exams and cannot access package data',async t=>{
 const f=await fixture(t),token='x'.repeat(43),sessionHash=webAuth.hash(token);
 await f.db.exec("insert into ip_owners(id,name) values('product-web','단과 신청자')");
 await f.db.query("insert into ip_web_sessions(token_hash,owner_id) values($1,'product-web')",[sessionHash]);
 const cfg={enabled:true,origin:'https://app.test',clientId:''};
 const auth=require('../api/interview-auth').createHandler({getConfig:()=>cfg,invoke:f.portal});
 const post=async body=>{let status,data;await auth({method:'POST',url:'/api/interview-auth',headers:{host:'app.test',origin:cfg.origin,cookie:webAuth.COOKIE+'='+token},body},{setHeader(){},status(n){status=n;return this;},json(d){data=d;}});return {status,data};};
 assert.equal((await post({action:'apply',name:'단과 신청자',track:'공채',examNumber:'A-1',revision:0,accessProduct:'unknown'})).status,400);
 let response=await post({action:'apply',name:'단과 신청자',track:'공채',examNumber:'A-1',revision:0,accessProduct:'aptitude_only',enabled:true,actor:admin});
 assert.equal(response.status,200);let application=response.data.application;
 assert.equal(application.access_product,'aptitude_only');
 assert.equal((await f.portal('session',{sessionHash})).available,false);
 await assert.rejects(f.aptitude('list',student('product-web')),/not_enrolled/);
 await assert.rejects(f.invoke('admin_application_decide',student('product-web'),{id:application.id,revision:1,status:'approved',reviewNote:''}),/forbidden/);
 // Rejection, editing and old callers retain the selected product until approval.
 await f.invoke('admin_application_decide',admin,{id:application.id,revision:1,status:'rejected',reviewNote:'구매 확인 필요'});
 response=await post({action:'apply',name:'단과 신청자',track:'공채',examNumber:'A-2',revision:2});
 application=response.data.application;assert.equal(application.access_product,'aptitude_only');
 await f.invoke('admin_application_decide',admin,{id:application.id,revision:3,status:'approved',reviewNote:'구매 확인',expiresOn:'2099-12-31',accessProduct:'interview_package'});
 const session=await f.portal('session',{sessionHash});
 assert.equal(session.available,true);assert.equal(session.member.access_product,'aptitude_only');
 assert.equal(session.account.ownerId,'product-web');assert.equal(session.account.appleLinked,false);
 const actor=student('product-web'),status=await f.invoke('status',actor);
 assert.equal(status.appEnabled,true);assert.equal(status.enabled,false);assert.equal(status.accessProduct,'aptitude_only');
 for(const action of ['bootstrap','questions','life_get','writing_list','core_questions'])await assert.rejects(f.invoke(action,actor),/not_enrolled/);
 await f.mock('admin_member_save',admin,{targetStudentId:actor.id,track:'공채',examNumber:'A-2',enabled:true,mockTestEnabled:true,expiresOn:'2099-12-31'});
 assert.equal((await f.mock('admin_members',admin,{search:'단과'})).members[0].access_product,'aptitude_only');
 assert.equal((await f.mock('mock_status',actor)).allowed,false,'Mock flag must not override the package');
 const authenticateWeb=req=>webAuth.authenticatePortal(req,{getConfig:()=>cfg,call:f.portal});
 const handler=require('../api/interview-prep').createHandler({authenticateWeb,invoke:f.invoke});
 let deniedStatus;await handler({method:'POST',headers:{host:'app.test',origin:cfg.origin,cookie:webAuth.COOKIE+'='+token},body:{action:'bootstrap'}},{setHeader(){},status(n){deniedStatus=n;return this;},json(){}});
 assert.equal(deniedStatus,403,'The authenticated preparation API denies unit accounts');
 let apiStatus;await handler({method:'POST',headers:{host:'app.test',origin:cfg.origin,cookie:webAuth.COOKIE+'='+token},body:{action:'bootstrap',accessProduct:'interview_package'}},{setHeader(){},status(n){apiStatus=n;return this;},json(){}});
 assert.equal(apiStatus,400,'Student product overrides are rejected at the API boundary');
 const exam={id:randomUUID(),revision:0,kind:'half',roundNo:1,title:'단과 검증',state:'open',resultsReleased:false,opensAt:null,closesAt:null,answerKey:Array(75).fill(1),reason:''};
 await f.aptitude('admin_save',admin,exam);
 assert.equal((await f.aptitude('list',actor)).rounds.length,1);
 const submitted=await f.aptitude('submit',actor,{id:exam.id,revision:0,answers:Array(75).fill(1),requestKey:randomUUID()});
 assert.equal(submitted.ok,true);assert.equal(submitted.result,undefined);
 await f.aptitude('admin_save',admin,{...exam,revision:1,state:'closed',resultsReleased:true});
 assert.equal(Number((await f.aptitude('get',actor,{id:exam.id})).result.correctCount),75);
 assert.equal((await post({action:'apply',name:'단과 신청자',track:'공채',examNumber:'A-2',revision:4,accessProduct:'interview_package'})).data.error,'already_enrolled');
 await f.mock('admin_member_save',admin,{targetStudentId:actor.id,track:'공채',examNumber:'A-2',enabled:true,accessProduct:'interview_package',expiresOn:'2099-12-31'});
 assert.equal((await f.invoke('bootstrap',actor)).member.access_product,'interview_package');
 assert.equal((await f.mock('mock_status',actor)).allowed,true);
 assert.equal(Number((await f.aptitude('get',actor,{id:exam.id})).result.correctCount),75,'Changing product preserves exam history');
 assert.equal((await f.db.query("select count(*)::int n from students where id='product-web'")).rows[0].n,0);
});

test('existing package members, missing product fields, expiry, suspension and server-only privileges are preserved',async t=>{
 const f=await fixture(t),actor=student('ip-a');
 assert.equal((await f.invoke('bootstrap',actor)).member.access_product,'interview_package');
 assert.equal((await f.invoke('status',actor)).enabled,true);
 const save={targetStudentId:'ip-a',track:'공채',examNumber:'existing',enabled:true,accessProduct:'aptitude_only',expiresOn:''};
 await f.mock('admin_member_save',admin,save);
 await assert.rejects(f.mock('admin_member_save',admin,{...save,accessProduct:'invalid'}),/invalid_request/);
 const {accessProduct,...oldSave}=save;await f.mock('admin_member_save',admin,oldSave);
 assert.equal((await f.invoke('status',actor)).accessProduct,'aptitude_only');
 await f.mock('admin_member_save',admin,{...save,expiresOn:'2000-01-01'});
 assert.equal((await f.invoke('status',actor)).appEnabled,false);
 await assert.rejects(f.aptitude('list',actor),/not_enrolled/);
 await f.mock('admin_member_save',admin,{...save,enabled:false});
 await assert.rejects(f.aptitude('list',actor),/not_enrolled/);
 await f.mock('admin_member_save',admin,save);await f.db.exec('update ip_settings set enabled=false');
 assert.equal((await f.invoke('status',actor)).appEnabled,false);await assert.rejects(f.aptitude('list',actor),/not_enrolled/);
 for(const role of ['anon','authenticated']){
  await f.db.exec('set role '+role);
  await assert.rejects(f.invoke('status',actor),/permission denied/);
  await assert.rejects(f.db.query('select access_product from ip_members'),/permission denied/);
  await f.db.exec('reset role');
 }
});
