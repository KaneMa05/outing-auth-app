const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {PGlite}=require(process.env.OX_PGLITE_MODULE||'C:/Users/Public/Documents/ESTsoft/CreatorTemp/ox-db-tools/node_modules/@electric-sql/pglite');
const books=['criminal-law','criminal-procedure-investigation-evidence','criminal-procedure-trial'];
const migration='20260923022213_ox_teacher_learning_access.sql';

test('Teachers can learn on verified devices without enrollment; student access, records and statistics remain isolated',async()=>{
 const db=new PGlite(),admin={type:'admin',id:'qa'};
 const actor=(id,device='phone')=>({type:'student',id,deviceHash:crypto.createHash('sha256').update(device).digest('hex')});
 const rpc=async(fn,action,who,body={})=>(await db.query(`select ${fn}($1,$2::jsonb,$3::jsonb) result`,[action,JSON.stringify(who),JSON.stringify(body)])).rows[0].result;
 const core=(action,body={})=>rpc('ox_service',action,admin,body);
 const learn=(action,id,body={},device='phone')=>rpc('ox_device_gateway',action,actor(id,device),body);
 const register=(id,device='phone')=>db.query('select register_student_device($1,$2,$3)',[id,'fixture-password',actor(id,device).deviceHash]);
 const read=name=>fs.readFileSync('supabase/migrations/'+name,'utf8');
 try {
  await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create table students(id text primary key,name text default '학생',class_name text default '반',student_category text default 'offline',cohort smallint default 18,account_type text default 'student',is_active boolean default true);grant select on students to service_role;insert into students(id) values('buyer'),('nonbuyer');insert into students(id,account_type,student_category) values('teacher','teacher','lecture'),('teacher2','teacher','offline');");
  await db.exec(fs.readFileSync('tests/fixtures/ox-app-devices.sql','utf8'));
  await db.exec(fs.readFileSync('supabase/add-student-devices.sql','utf8').replace('create extension if not exists "pgcrypto";',''));
  await db.exec('grant select on student_devices to service_role');
  await db.exec(fs.readFileSync('tests/fixtures/ox-lecture-identities.sql','utf8'));
  for(const name of ['20260917124608_criminal_law_ox.sql','20260917124623_criminal_law_ox_members.sql','20260920114238_ox_progressive_loading.sql','20260921113944_ox_book_access.sql','20260922044735_ox_member_cohort_filter.sql','20260922044751_ox_device_policy.sql','20260922044806_ox_verified_purchase_required.sql','20260922044821_ox_bulk_access_grants.sql'])await db.exec(read(name));
  await db.exec(fs.readFileSync('tests/fixtures/ox-exam-subjects.sql','utf8'));
  await db.exec(read('20260922060528_ox_grant_recipient_selection.sql'));
  await db.exec(read('20260922061015_ox_member_track_filter.sql'));
  await core('admin_import',{collections:books.map((id,i)=>({id,sort_order:i})),chapters:books.map((id,i)=>({id:'c'+i,collection_id:id,sort_order:i})),questions:books.map((id,i)=>({id:'q'+i,chapter_id:'c'+i,prompt:'질문'+i,context:'',correct_answer:'O',explanation_html:'해설',source_question_number:String(i),reviewed:true,status:'published'}))});
  await core('admin_enabled',{enabled:true});
  for(const id of ['buyer','nonbuyer','teacher','teacher2'])await register(id);
  await register('teacher','tablet');
  await core('admin_book_set',{memberId:'buyer',collectionIds:[books[0]],active:true,revision:0,purchaseDate:'2026-01-01',reason:'구매'});
  const previousSession=(await learn('device_start','buyer')).sessionId;
  await learn('submit','buyer',{sessionId:previousSession,questionId:'q0',version:1,answer:'O',submissionId:crypto.randomUUID()});
  const previousRecords=(await db.query('select * from ox_progress')).rows;
  await assert.rejects(learn('status','teacher'),/unauthorized/,'Reproduce the production failure before the migration');
  const priorRoster=await core('admin_members',{registeredOnly:false});
  await db.exec(read(migration));
  await db.exec(read('20260923022226_ox_cumulative_learning_accuracy.sql'));
  assert.deepEqual((await db.query('select * from ox_progress')).rows,previousRecords,'Existing learning records are preserved without a backfill');
  assert.deepEqual(await core('admin_members',{registeredOnly:false}),priorRoster,'Student administration stays unchanged');
  await db.exec('set role service_role');
  assert.equal((await learn('status','teacher')).enabled,true);
  assert.equal((await learn('status','teacher2')).enabled,true);
  assert.equal((await learn('status','nonbuyer')).enabled,false);
  await assert.rejects(learn('device_start','nonbuyer'),/ox_not_registered/);
  const state=await learn('device_state','teacher');
  assert.equal(state.registered,true);assert.equal(state.learningError,null);
  const session=(await learn('device_start','teacher')).sessionId;
  const call=(action,body={})=>learn(action,'teacher',{sessionId:session,...body});
  const boot=await call('bootstrap',{summaryOnly:true});
  assert.equal(boot.catalog.questions.length,3);assert.ok(boot.catalog.collections.every(b=>b.accessible));
  const questions=await call('questions',{questions:books.map((_,i)=>({id:'q'+i,version:1}))});
  assert.equal(questions.questions.length,3);assert.ok(questions.questions.every(q=>!('correct_answer' in q)));
  const submit=await call('submit',{questionId:'q0',version:1,answer:'X',submissionId:crypto.randomUUID()});
  assert.equal(submit.statistics.answered,1,'Only the existing student answer enters the student statistic');
  assert.equal(submit.statistics.wrong,0);
  assert.deepEqual(submit.attemptCounts.q0,{attempts:1,correct:0,wrong:1});
  await call('note',{questionId:'q0',version:1,memo:'교사 개인 메모',bookmark:true});
  const detail=await call('detail',{questionId:'q0',version:1});
  assert.equal(detail.note.memo,'교사 개인 메모');
  await call('submit',{questionId:'q0',version:1,answer:'O',submissionId:crypto.randomUUID()});
  const own=await call('bootstrap',{summaryOnly:true});
  assert.equal(own.progress.length,1);assert.equal(own.todayCount,2);
  assert.deepEqual(own.attemptCounts.q0,{attempts:2,correct:1,wrong:1});
  assert.deepEqual(own.statistics.q0,{answered:1,wrong:0});
  const otherSession=(await learn('device_start','teacher2')).sessionId;
  const other=await learn('bootstrap','teacher2',{sessionId:otherSession,summaryOnly:true});
  assert.equal(other.progress.length,0);assert.equal(other.notes.length,0);
  assert.deepEqual(other.attemptCounts,{});
  // Cumulative accuracy counts every actual attempt, including replays, once.
  for(let i=0;i<28;i++)await learn('submit','teacher2',{sessionId:otherSession,questionId:'q1',version:1,answer:i<8?'X':'O',submissionId:crypto.randomUUID()});
  for(const summaryOnly of [true,false]){
   const totals=(await learn('bootstrap','teacher2',{sessionId:otherSession,summaryOnly})).attemptCounts.q1;
   assert.deepEqual(totals,{attempts:28,correct:20,wrong:8});
   assert.equal(Math.round(totals.correct/totals.attempts*1000)/10,71.4);
  }
  const retryBody={sessionId:otherSession,questionId:'q1',version:1,answer:'O',submissionId:crypto.randomUUID()};
  await learn('submit','teacher2',retryBody);
  assert.deepEqual((await learn('submit','teacher2',retryBody)).attemptCounts.q1,{attempts:29,correct:21,wrong:8},'A retried network submission is not another attempt');
  const buyerSession=(await learn('device_start','buyer')).sessionId;
  const buyerCall=(action,body={})=>learn(action,'buyer',{sessionId:buyerSession,...body});
  const buyer=await buyerCall('bootstrap',{summaryOnly:true});
  assert.equal(buyer.catalog.questions.length,1);
  assert.deepEqual(buyer.attemptCounts,{q0:{attempts:1,correct:1,wrong:0}},'Counts include pre-migration attempts and exclude other learners and locked books');
  await assert.rejects(buyerCall('questions',{questions:[{id:'q1',version:1}]}),/ox_book_required/);
  await assert.rejects(buyerCall('submit',{questionId:'q1',version:1,answer:'O',submissionId:crypto.randomUUID()}),/ox_book_required/);
  const answer=await buyerCall('submit',{questionId:'q0',version:1,answer:'O',submissionId:crypto.randomUUID()});
  assert.equal(answer.statistics.answered,1);assert.equal(answer.statistics.wrong,0);
  for(const summaryOnly of [true,false]){
   const result=await call('bootstrap',{summaryOnly});
   assert.equal(result.statistics.q0.answered,1);assert.equal(result.statistics.q0.wrong,0);
  }
  assert.equal((await call('detail',{questionId:'q0',version:1})).note.memo,'교사 개인 메모');
  await assert.rejects(rpc('ox_service','admin_enabled',actor('teacher'),{enabled:false}),/forbidden/);
  await assert.rejects(learn('admin_device_reset','teacher',{memberId:'buyer'}),/forbidden/);
  await assert.rejects(learn('status','teacher',{},'unknown'),/unauthorized/);
  await assert.rejects(learn('device_start','teacher',{},'tablet'),/device_in_use/);
  await assert.rejects(learn('bootstrap','teacher',{sessionId:crypto.randomUUID(),summaryOnly:true}),/device_session_changed/);
  await core('admin_enabled',{enabled:false});
  assert.equal((await learn('status','teacher')).enabled,false);
  await assert.rejects(call('device_heartbeat'),/ox_disabled/);
  await core('admin_enabled',{enabled:true});
  await db.exec('reset role');
  assert.equal((await db.query("select count(*)::int n from ox_members where student_id like 'teacher%'")).rows[0].n,0);
  assert.equal((await db.query("select count(*)::int n from ox_book_access where student_id like 'teacher%'")).rows[0].n,0);
  await db.exec("update students set account_type='student' where id='teacher'");
  assert.equal((await learn('status','teacher')).enabled,false,'Role removal revokes teacher access immediately');
  await assert.rejects(call('device_heartbeat'),/ox_not_registered/);
  await db.exec("update students set account_type='teacher',is_active=false where id='teacher'");
  await assert.rejects(learn('status','teacher'),/unauthorized/);
  await db.exec("update students set is_active=true where id='teacher';update student_devices set revoked_at=now() where student_id='teacher'");
  await assert.rejects(learn('status','teacher'),/unauthorized/);
  for(const role of ['anon','authenticated']){
   await db.exec('set role '+role);
   await assert.rejects(db.query("select ox_is_teacher('teacher')"),/permission denied/);
   await assert.rejects(db.query("select ox_attempt_counts('teacher')"),/permission denied/);
   await assert.rejects(learn('status','teacher'),/permission denied/);
   await db.exec('reset role');
  }
 } finally {await db.close();}
});
