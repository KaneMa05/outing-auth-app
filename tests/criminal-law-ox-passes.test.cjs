const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {PGlite}=require(process.env.OX_PGLITE_MODULE||'C:/Users/Public/Documents/ESTsoft/CreatorTemp/ox-db-tools/node_modules/@electric-sql/pglite');
const {createHandler,_private:{validate,invokeLearning}}=require('../api/criminal-law-ox');
const auth=require('../api/teacher-auth-utils');
const books=['criminal-law','criminal-procedure-investigation-evidence','criminal-procedure-trial'];

test('Pass-only migration preserves existing access, learning, teacher rules and independent grant lifecycle',async()=>{
 const db=new PGlite(),admin={type:'admin',id:'qa'};
 const rpc=async(fn,action,actor,body={})=>(await db.query(`select ${fn}($1,$2::jsonb,$3::jsonb) result`,[action,JSON.stringify(actor),JSON.stringify(body)])).rows[0].result;
 const core=(a,b={})=>rpc('ox_service',a,admin,b);
 const pass=(a,b={})=>rpc('ox_pass_admin',a,admin,b);
 const grant=(a,b={})=>rpc('ox_grant_admin','admin_grant_'+a,admin,b);
 const learn=(a,id,b={})=>rpc('ox_service',a,{type:'student',id},b);
 const read=n=>fs.readFileSync('supabase/migrations/'+n,'utf8').replace(/\r\n/g,'\n');
 const revision=async id=>(await db.query('select access_revision from ox_members where student_id=$1',[id])).rows[0]?.access_revision||0;
 const setPass=async(id,ids,active=true)=>pass('admin_pass_set',{memberId:id,collectionIds:ids,active,reason:'test pass',revision:await revision(id)});
 try{
  await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create table students(id text primary key,name text default 'fixture',class_name text default 'class',student_category text default 'offline',cohort smallint default 18,account_type text default 'student',is_active boolean default true);grant select on students to service_role;insert into students(id) values('offline'),('blocked'),('inactive'),('nopass');insert into students(id,student_category) values('managed','online_managed'),('lecture','lecture'),('bulk','online_managed');insert into students(id,account_type)values('teacher','teacher');");
  await db.exec(fs.readFileSync('tests/fixtures/ox-app-devices.sql','utf8'));
  await db.exec(fs.readFileSync('supabase/add-student-devices.sql','utf8').replace('create extension if not exists "pgcrypto";',''));
  await db.exec('grant select on student_devices to service_role');
  await db.exec(fs.readFileSync('tests/fixtures/ox-lecture-identities.sql','utf8'));
  for(const file of ['20260917124608_criminal_law_ox.sql','20260917124623_criminal_law_ox_members.sql','20260920114238_ox_progressive_loading.sql','20260921113944_ox_book_access.sql','20260922044735_ox_member_cohort_filter.sql','20260922044751_ox_device_policy.sql','20260922044806_ox_verified_purchase_required.sql','20260922044821_ox_bulk_access_grants.sql'])await db.exec(read(file));
  await db.exec(fs.readFileSync('tests/fixtures/ox-exam-subjects.sql','utf8'));
  for(const file of ['20260922060528_ox_grant_recipient_selection.sql','20260922061015_ox_member_track_filter.sql','20260923022213_ox_teacher_learning_access.sql','20261001082345_ox_managed_grants_and_fast_preview.sql'])await db.exec(read(file));
  await core('admin_import',{collections:books.map((id,i)=>({id,sort_order:i})),chapters:books.map((id,i)=>({id:'c'+i,collection_id:id,sort_order:i})),questions:books.map((id,i)=>({id:'q'+i,chapter_id:'c'+i,prompt:'fixture',context:'',correct_answer:'O',explanation_html:'fixture',source_question_number:String(i),reviewed:true,status:'published'}))});
  await core('admin_enabled',{enabled:true});
  for(const id of ['offline','managed','lecture','blocked','inactive'])await core('admin_book_set',{memberId:id,collectionIds:[books[0]],active:true,purchaseDate:'2026-01-01',reason:'existing',revision:0});
  await core('admin_member_set',{memberId:'blocked',allowed:false,revision:1});
  await db.exec("update students set is_active=false where id='inactive'");
  const batch=(await grant('preview',{cohort:'online_managed',studentIds:['bulk'],collectionIds:[books[0],books[1]],expiresOn:null,reason:'existing batch'})).batchId;
  await grant('issue',{batchId:batch});
  await learn('submit','offline',{questionId:'q0',version:1,answer:'X',submissionId:crypto.randomUUID()});
  await learn('note','offline',{questionId:'q0',version:1,memo:'preserved memo'});
  const before=(await db.query('select student_id,collection_id,active,purchase_date,source from ox_book_access order by student_id,collection_id')).rows;
  await db.exec(read('20261001090401_ox_pass_only_access.sql'));
  assert.deepEqual((await db.query('select student_id,collection_id,active,purchase_date,source from ox_book_access order by student_id,collection_id')).rows,before,'Purchase audit rows are preserved');
  assert.equal((await db.query('select count(*)::int n from ox_individual_passes where active')).rows[0].n,5);
  await db.exec('set role service_role');
  for(const id of ['offline','managed','lecture'])assert.equal((await learn('bootstrap',id)).catalog.chapters.length,1);
  assert.equal((await learn('bootstrap','bulk')).catalog.chapters.length,2);
  assert.equal((await learn('bootstrap','teacher')).catalog.chapters.length,3,'Teacher practice exception preserved');
  assert.equal((await learn('bootstrap','offline')).notes[0].has_memo,true);
  assert.equal((await learn('bootstrap','offline')).progress.length,1);
  assert.equal((await learn('status','blocked')).enabled,false,'Suspension must survive conversion');
  await assert.rejects(learn('bootstrap','inactive'),/unauthorized/);
  await core('admin_book_set',{memberId:'offline',collectionIds:[books[1]],active:true,purchaseDate:'2026-01-01',reason:'old route',revision:1});
  assert.equal((await db.query("select count(*)::int n from ox_individual_passes where student_id='offline' and collection_id=$1",[books[1]])).rows[0].n,1,'Older deployed API instances create passes');
  assert.equal((await db.query("select count(*)::int n from ox_book_access where student_id='offline' and collection_id=$1",[books[1]])).rows[0].n,0,'Older deployed API instances never create purchase entitlements');
  await setPass('offline',[books[1]],false);
  await assert.rejects(rpc('ox_pass_admin','admin_members',{type:'student',id:'offline'},{}),/forbidden/);
  const converted=(await pass('admin_members',{search:'lecture'})).items[0];
  assert.equal(converted.passes[0].origin,'converted');assert.equal(converted.scopes[0].status,'active');
  const bulkEntry=(await pass('admin_members',{search:'bulk',collectionId:books[1],bookStatus:'active'})).items[0];
  assert.equal(bulkEntry.id,'bulk');assert.equal(bulkEntry.passes.length,0);assert.equal(bulkEntry.scopes.filter(s=>s.status==='active').length,2);
  assert.equal((await pass('admin_members',{search:'bulk',collectionId:books[2],bookStatus:'active'})).total,0);
  await setPass('nopass',[books[1]]);assert.equal((await learn('bootstrap','nopass')).catalog.chapters.length,1,'No purchase or purchase date needed');
  await assert.rejects(setPass('nopass',[books[1]]),/book_already_active/);
  await assert.rejects(pass('admin_pass_set',{memberId:'nopass',collectionIds:[books[2]],active:true,revision:0,reason:'stale'}),/access_conflict/);
  await assert.rejects(setPass('teacher',[books[1]]),/student_unavailable/);
  await setPass('bulk',[books[0]]);await setPass('bulk',[books[0]],false);
  assert.equal((await learn('bootstrap','bulk')).catalog.chapters.length,2,'Bulk pass survives individual revocation');
  await setPass('bulk',[books[0]]);await grant('revoke',{batchId:batch,reason:'batch revoke'});
  assert.equal((await learn('bootstrap','bulk')).catalog.chapters.length,1,'Individual pass survives batch revocation');
  assert.equal((await pass('admin_members',{search:'bulk',collectionId:books[1],bookStatus:'stopped'})).total,1,'Revoked bulk scopes remain visible in ended filter');
  await core('admin_member_set',{memberId:'bulk',allowed:false,revision:await revision('bulk')});
  assert.equal((await pass('admin_members',{search:'bulk',collectionId:books[0],bookStatus:'active'})).total,0);
  assert.equal((await pass('admin_members',{search:'bulk',collectionId:books[0],bookStatus:'stopped'})).total,1);
  await db.exec('reset role');
  await db.exec("update ox_book_access set active=false where student_id='lecture';insert into ox_book_access(student_id,collection_id,active,purchase_date,source,updated_by)values('nopass','criminal-procedure-trial',true,'2026-01-01','purchase','fixture');");
  await db.exec('set role service_role');
  assert.equal((await learn('bootstrap','lecture')).catalog.chapters.length,1,'Old purchase changes cannot remove converted access');
  assert.equal((await learn('bootstrap','nopass')).catalog.chapters.length,1,'New purchase audit row cannot create access');
  await setPass('lecture',[books[0]],false);assert.equal((await learn('status','lecture')).enabled,false,'Old purchase row cannot revive a revoked pass');
  for(const role of ['anon','authenticated']){await db.exec('reset role;set role '+role);await assert.rejects(db.query('select * from ox_individual_passes'),/permission denied/);await assert.rejects(pass('admin_members'),/permission denied/);}
 } finally{await db.close();}
});

test('Pass API validates and routes without requiring purchase data',async()=>{
 const valid={action:'admin_pass_set',memberId:'s',collectionIds:[books[0]],active:true,reason:'support',revision:0};
 assert.doesNotThrow(()=>validate(valid));
 for(const body of [{memberId:''},{collectionIds:[]},{collectionIds:[books[0],books[0]]},{active:'true'},{reason:''},{revision:-1}])assert.throws(()=>validate({...valid,...body}),/invalid_request/);
 const calls=[];await invokeLearning('admin_pass_set',{type:'admin',id:'qa'},valid,async(...args)=>{calls.push(args);return{ok:true};});assert.equal(calls[0][1],'rpc/ox_pass_admin');
 await invokeLearning('admin_members',{type:'admin',id:'qa'},{},async(...args)=>{calls.push(args);return{ok:true};});assert.equal(calls[1][1],'rpc/ox_pass_admin');
 process.env.TEACHER_SESSION_SECRET='pass-only-test';
 const handler=createHandler({invoke:async()=>({ok:true})});
 for(const [permissions,expected] of [[['criminal_ox.read'],403],[['criminal_ox.write'],200]]){
  let status;await handler({method:'POST',headers:{cookie:auth.COOKIE_NAME+'='+auth.createSessionToken(process.env.TEACHER_SESSION_SECRET,{username:'qa',role:'teacher',permissions})},body:valid},{setHeader(){},status(code){status=code;return this;},json(){}});assert.equal(status,expected);
 }
});
