'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID}=require('node:crypto');
const {createDb}=require('./helpers/interview-db.cjs');
const {createHandler,validate}=require('../api/interview-aptitude');
const migration='supabase/migrations/20261109053559_interview_aptitude_exams.sql';
const admin={type:'admin',id:'qa'},student=id=>({type:'student',id});
const subjectScoresMigration='supabase/migrations/20261117122611_interview_aptitude_subject_scores.sql';
const resetMigration='supabase/migrations/20261118084036_interview_aptitude_answer_reset.sql';
async function fixture(t,{resultsOnSubmission=true,subjectScores=true,answerReset=true}={}){
 const {db}=await createDb();t.after(()=>db.close());
 await db.exec("create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]); update ip_settings set enabled=true; insert into ip_members(student_id,track,exam_number,enabled,expires_on) values('ip-a','공채','a',true,null),('ip-b','기관','b',true,'2099-12-01'),('ip-c','방제','c',true,null); insert into ip_owners(id,name) values('web-only','웹 면접반'); insert into ip_members(student_id,track,exam_number,enabled) values('web-only','관제','web',true);");
 await db.exec(fs.readFileSync(migration,'utf8'));
 if(resultsOnSubmission)await db.exec(fs.readFileSync('supabase/migrations/20261112152643_interview_aptitude_results_on_submission.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261116072310_interview_aptitude_historical_attempts.sql','utf8').replace(/\r\n/g,'\n'));
 if(subjectScores)await db.exec(fs.readFileSync(subjectScoresMigration,'utf8'));
 if(answerReset)await db.exec(fs.readFileSync(resetMigration,'utf8'));
 const invoke=async(action,actor,body={})=>(await db.query('select ip_aptitude_service($1,$2::jsonb,$3::jsonb) result',[action,JSON.stringify(actor),JSON.stringify(body)])).rows[0].result;
 const body=(kind='half')=>({id:randomUUID(),revision:0,kind,roundNo:1,title:(kind==='half'?'하프':'본시험')+' 1회',state:'open',resultsReleased:false,opensAt:null,closesAt:null,answerKey:Array(kind==='half'?75:150).fill(1),reason:''});
 const submit=(id,owner,answers,requestKey=randomUUID())=>invoke('submit',student(owner),{id,revision:0,answers,requestKey});
 return {db,invoke,body,submit};
}
test('answer reset upgrade preserves existing answers, student results and server-only invoker permissions',async t=>{
 const f=await fixture(t,{answerReset:false}),exam={...f.body(),resultsReleased:true};
 await f.invoke('admin_save',admin,exam);await f.submit(exam.id,'ip-a',exam.answerKey);
 const before=(await f.db.query('select * from ip_aptitude_attempts')).rows,rounds=(await f.db.query('select * from ip_aptitude_rounds')).rows;
 const studentView=await f.invoke('get',student('ip-a'),{id:exam.id});
 const privileges=()=>f.db.query("select prosecdef,proacl,proconfig from pg_proc where oid='public.ip_aptitude_service(text,jsonb,jsonb)'::regprocedure");
 const beforePrivileges=(await privileges()).rows;
 await f.db.exec(fs.readFileSync(resetMigration,'utf8'));
 assert.deepEqual((await f.db.query('select * from ip_aptitude_attempts')).rows,before);
 assert.deepEqual((await f.db.query('select * from ip_aptitude_rounds')).rows,rounds);
 assert.deepEqual(await f.invoke('get',student('ip-a'),{id:exam.id}),studentView);
 assert.deepEqual((await privileges()).rows,beforePrivileges);
 const report=await f.invoke('admin_report',admin,{id:exam.id});
 assert.equal(report.students.find(s=>s.studentId==='ip-a').attemptRevision,1);
 assert.equal(report.students.find(s=>s.studentId==='ip-b').attemptRevision,0);
 for(const role of ['anon','authenticated']){
  await f.db.exec('set role '+role);
  await assert.rejects(f.invoke('admin_reset_attempt',admin,{id:exam.id,targetStudentId:'ip-a',attemptRevision:1,sections:[0]}),/permission denied/);
  await f.db.exec('reset role');
 }
});

test('half/full subject reset preserves other subjects and participants, cancels scores, audits before/after, and permits resubmission',async t=>{
 for(const kind of ['half','full'])await t.test(kind,async t=>{
  const f=await fixture(t),exam={...f.body(kind),resultsReleased:true},per=exam.answerKey.length/5;
  const other={...f.body(kind),roundNo:2};await f.invoke('admin_save',admin,exam);await f.invoke('admin_save',admin,other);
  const answers=Array.from({length:per*5},(_,i)=>1+Math.floor(i/per));
  await f.submit(exam.id,'ip-a',answers);await f.submit(exam.id,'ip-b',exam.answerKey);await f.submit(other.id,'ip-a',answers);
  const untouched=(await f.db.query("select * from ip_aptitude_attempts where not(round_id=$1 and student_id='ip-a') order by round_id,student_id",[exam.id])).rows;
  const rounds=(await f.db.query('select * from ip_aptitude_rounds order by id')).rows;
  const before=(await f.db.query("select * from ip_aptitude_attempts where round_id=$1 and student_id='ip-a'",[exam.id])).rows[0];
  await f.db.exec('set role service_role');
  const reset=await f.invoke('admin_reset_attempt',admin,{id:exam.id,targetStudentId:'ip-a',attemptRevision:1,sections:[0,3]});
  await f.db.exec('reset role');
  assert.equal(reset.attemptRevision,2);assert.deepEqual(reset.sections,[0,3]);
  const own=await f.invoke('get',student('ip-a'),{id:exam.id});
  const expected=answers.map((v,i)=>[0,3].includes(Math.floor(i/per))?0:v);
  assert.equal(own.attempt.state,'draft');assert.deepEqual(own.attempt.answers,expected);assert.equal(own.attempt.revision,2);
  assert.equal(own.attempt.submittedAt,null);assert.equal(own.attempt.requestKey,null);
  for(const key of ['result','correctAnswers','files'])assert.equal(own[key],undefined);
  const report=await f.invoke('admin_report',admin,{id:exam.id}),row=report.students.find(s=>s.studentId==='ip-a');
  assert.equal(row.state,'draft');assert.equal(row.correctCount,null);assert.equal(row.rank,null);assert.equal(row.subjectCorrectCounts,null);assert.equal(row.attemptRevision,2);
  assert.equal((await f.invoke('get',student('ip-b'),{id:exam.id})).result.participants,1);
  const after=(await f.db.query("select * from ip_aptitude_attempts where round_id=$1 and student_id='ip-a'",[exam.id])).rows[0];
  assert.equal(after.correct_count,null);assert.equal(after.scored_key_revision,null);
  const audit=(await f.db.query("select * from ip_aptitude_audit where reason='성적관리 답안지 초기화'")).rows;
  assert.equal(audit.length,1);assert.equal(audit[0].actor_id,'qa');assert.deepEqual(audit[0].before_value.answers,before.answers);
  assert.deepEqual(audit[0].after_value.answers,expected);assert.deepEqual(audit[0].after_value.resetSections,[0,3]);
  await assert.rejects(f.invoke('save',student('ip-a'),{id:exam.id,revision:1,answers}),/revision_conflict/);
  await assert.rejects(f.invoke('admin_reset_attempt',admin,{id:exam.id,targetStudentId:'ip-a',attemptRevision:1,sections:[1]}),/revision_conflict/);
  assert.equal((await f.db.query("select count(*)::int n from ip_aptitude_audit where reason='성적관리 답안지 초기화'")).rows[0].n,1);
  assert.deepEqual((await f.db.query("select * from ip_aptitude_attempts where not(round_id=$1 and student_id='ip-a') order by round_id,student_id",[exam.id])).rows,untouched);
  assert.deepEqual((await f.db.query('select * from ip_aptitude_rounds order by id')).rows,rounds);
  const submitted=await f.invoke('submit',student('ip-a'),{id:exam.id,revision:2,answers:exam.answerKey,requestKey:randomUUID()});
  assert.equal(submitted.result.correctCount,per*5);
  await f.invoke('admin_reset_attempt',admin,{id:exam.id,targetStudentId:'ip-a',attemptRevision:3,sections:[4,3,2,1,0]});
  const all=await f.invoke('get',student('ip-a'),{id:exam.id});assert.deepEqual(all.attempt.answers,Array(per*5).fill(0));assert.equal(all.attempt.revision,4);
  // Draft attempts can also be reset; resetting never changes the round schedule.
  await f.invoke('admin_save',admin,{...exam,revision:1,state:'closed'});
  await f.invoke('admin_reset_attempt',admin,{id:exam.id,targetStudentId:'ip-a',attemptRevision:4,sections:[2]});
  await assert.rejects(f.invoke('submit',student('ip-a'),{id:exam.id,revision:5,answers:exam.answerKey,requestKey:randomUUID()}),/exam_not_open/);
 });
});

test('reset API enforces write permission and rejects invalid targets, empty/duplicate subjects and stale revisions without writes',async t=>{
 const f=await fixture(t),exam=f.body();await f.invoke('admin_save',admin,exam);await f.submit(exam.id,'ip-a',exam.answerKey);
 const payload={action:'admin_reset_attempt',id:exam.id,targetStudentId:'ip-a',attemptRevision:1,sections:[1]};
 for(const patch of [{sections:[]},{sections:[1,1]},{sections:[5]},{sections:[-1]},{sections:['1']},{sections:[1.5]},{sections:null},{targetStudentId:''},{attemptRevision:0},{attemptRevision:'1'},{attemptRevision:null}]){
  assert.throws(()=>validate({...payload,...patch}),/invalid_request/);
  await assert.rejects(f.invoke('admin_reset_attempt',admin,{...payload,...patch}),/invalid_request/);
 }
 await assert.rejects(f.invoke('admin_reset_attempt',student('ip-b'),payload),/forbidden/);
 await assert.rejects(f.invoke('admin_reset_attempt',admin,{...payload,targetStudentId:'ip-c'}),/not_found/);
 let allowWrite=false,invoked=0;
 const handler=createHandler({authenticateAdmin:async(_req,write)=>{assert.equal(write,true);if(!allowWrite)throw Error('forbidden');return {id:'admin-http'};},invoke:async(...args)=>{invoked++;return f.invoke(...args);}});
 assert.equal((await http(handler,payload)).status,403);assert.equal(invoked,0);
 allowWrite=true;
 const conflict=await http(handler,{...payload,attemptRevision:2});assert.equal(conflict.status,409);assert.equal(conflict.data.error,'revision_conflict');
 const reset=await http(handler,payload);assert.equal(reset.status,200);assert.equal(reset.data.attemptRevision,2);
 assert.equal((await http(handler,payload)).status,409,'retry must not reset newer student input');
 assert.equal((await f.db.query("select count(*)::int n from ip_aptitude_audit where reason='성적관리 답안지 초기화'")).rows[0].n,1);
});
test('reset preserves actual historical records, subject scores and rankings',async t=>{
 const f=await fixture(t),exam={...f.body(),resultsReleased:true};
 await f.invoke('admin_save',admin,exam);await f.submit(exam.id,'ip-a',exam.answerKey);await f.submit(exam.id,'ip-b',Array(75).fill(2));
 const historyId=randomUUID();await f.db.query(`insert into ip_aptitude_historical_attempts(id,round_id,source_id,cohort,display_name,submitted_at,answers,correct_count,source_correct_count,scored_key_revision,source_filename,source_sha256,source_row) values($1,$2,'reset-history','지난 기수','면접학생 A',now(),$3::jsonb,75,75,1,'fixture.xlsx',repeat('a',64),2)`,[historyId,exam.id,JSON.stringify(exam.answerKey)]);
 const stored=(await f.db.query('select * from ip_aptitude_historical_attempts')).rows;
 const before=await f.invoke('admin_report',admin,{id:exam.id}),history=before.students.find(s=>s.historical);
 assert.equal(history.attemptRevision,null);assert.deepEqual(history.subjectCorrectCounts,[15,15,15,15,15]);
 await assert.rejects(f.invoke('admin_reset_attempt',admin,{id:exam.id,targetStudentId:history.studentId,attemptRevision:1,sections:[0]}),/not_found/);
 await f.invoke('admin_reset_attempt',admin,{id:exam.id,targetStudentId:'ip-a',attemptRevision:1,sections:[0]});
 const after=await f.invoke('admin_report',admin,{id:exam.id});
 assert.deepEqual(after.students.find(s=>s.historical),history);assert.equal(after.students.find(s=>s.studentId==='ip-b').rank,2);
 assert.deepEqual((await f.db.query('select * from ip_aptitude_historical_attempts')).rows,stored);
});

test('PDF structures, all interview tracks and web-only members; draft keys and all non-member access stay private',async t=>{
 const f=await fixture(t),half=f.body(),full=f.body('full');await f.invoke('admin_save',admin,half);await f.invoke('admin_save',admin,full);
 const list=await f.invoke('list',student('web-only'));assert.deepEqual(list.rounds.map(r=>r.questionCount).sort((a,b)=>a-b),[75,150]);
 assert.deepEqual(list.rounds.find(r=>r.kind==='half').minutes,[8,10,5,8,15]);assert.deepEqual(list.rounds.find(r=>r.kind==='full').minutes,[15,20,10,15,30]);
 for(const owner of ['ip-a','ip-b','ip-c','web-only']){const value=await f.invoke('get',student(owner),{id:half.id});assert.equal(value.answerKey,undefined);assert.equal(value.correctAnswers,undefined);assert.equal(value.result,undefined);assert.equal(value.files,undefined);}
 const draft=f.body();draft.roundNo=2;draft.state='draft';draft.answerKey.fill(null);await f.invoke('admin_save',admin,draft);
 await assert.rejects(f.invoke('get',student('ip-a'),{id:draft.id}),/not_found/);
 await assert.rejects(f.invoke('list',student('not-enrolled')),/not_enrolled/);
 await f.db.exec("update ip_members set expires_on='2000-01-01' where student_id='ip-a'");await assert.rejects(f.invoke('get',student('ip-a'),{id:half.id}),/not_enrolled/);
 await f.db.exec("update students set is_active=false where id='ip-b'");await assert.rejects(f.invoke('get',student('ip-b'),{id:half.id}),/not_enrolled/);
 for(const role of ['anon','authenticated']){await f.db.exec('set role '+role);await assert.rejects(f.db.query('select * from ip_aptitude_rounds'),/permission denied/);await assert.rejects(f.invoke('admin_list',admin),/permission denied/);await assert.rejects(f.db.query("select ip_aptitude_score('[1]'::jsonb,'[1]'::jsonb)"),/permission denied/);await f.db.exec('reset role');}
 assert.equal((await f.db.query("select public from storage.buckets where id='interview-aptitude'")).rows[0].public,false);
});
test('draft revisions and immutable idempotent submissions; published scores rank ties 1,1,3 and corrections rescore atomically',async t=>{
 const f=await fixture(t),exam=f.body();await f.invoke('admin_save',admin,exam);
 const answers=Array(75).fill(1);answers[0]=2;
 const saved=await f.invoke('save',student('ip-a'),{id:exam.id,revision:0,answers});assert.equal(saved.attempt.revision,1);
 await assert.rejects(f.invoke('save',student('ip-a'),{id:exam.id,revision:0,answers:Array(75).fill(2)}),/revision_conflict/);
 const key=randomUUID();const own=await f.invoke('submit',student('ip-a'),{id:exam.id,revision:1,answers,requestKey:key});assert.equal(own.result,undefined);
 await f.invoke('submit',student('ip-a'),{id:exam.id,revision:1,answers,requestKey:key});assert.equal((await f.db.query('select count(*)::int n from ip_aptitude_attempts')).rows[0].n,1);
 await assert.rejects(f.submit(exam.id,'ip-a',Array(75).fill(2),key),/already_submitted/);
 await f.submit(exam.id,'ip-b',answers);const lower=[...answers];lower[1]=2;await f.submit(exam.id,'ip-c',lower);
 await f.invoke('admin_save',admin,{...exam,revision:1,state:'closed',resultsReleased:true});
 const a=await f.invoke('get',student('ip-a'),{id:exam.id}),b=await f.invoke('get',student('ip-b'),{id:exam.id}),c=await f.invoke('get',student('ip-c'),{id:exam.id});
 assert.equal(a.result.rank,1);assert.equal(b.result.rank,1);assert.equal(c.result.rank,3);assert.equal(a.result.participants,3);assert.equal(Number(a.result.correctCount),74);assert.equal(Number(a.result.accuracy),98.67);assert.equal(a.result.totalQuestions,75);const report=await f.invoke('admin_report',admin,{id:exam.id});assert.equal(report.students.find(v=>v.studentId==='ip-a').correctCount,74);assert.equal(report.students.find(v=>v.studentId==='ip-a').accuracy,98.67);
 const changed=[...exam.answerKey];changed[0]=2;
 await assert.rejects(f.invoke('admin_save',admin,{...exam,revision:2,state:'closed',resultsReleased:true,answerKey:changed}),/correction_reason_required/);
 assert.equal(Number((await f.invoke('get',student('ip-a'),{id:exam.id})).result.correctCount),74);
 const corrected=await f.invoke('admin_save',admin,{...exam,revision:2,state:'closed',resultsReleased:true,answerKey:changed,reason:'원문 대조 후 1번 정답을 정정합니다.'});assert.equal(corrected.rescored,3);
 const updated=await f.invoke('get',student('ip-a'),{id:exam.id});assert.equal(Number(updated.result.correctCount),75);assert.equal(updated.result.keyRevision,2);assert.equal(updated.result.accuracy,100);
 const missing=await f.invoke('get',student('web-only'),{id:exam.id});assert.equal(missing.result,undefined);assert.equal(missing.correctAnswers,undefined);
 await assert.rejects(f.invoke('admin_save',admin,{...exam,revision:3,state:'open'}),/results_already_released/);
 assert.equal((await f.db.query('select count(*)::int n from ip_aptitude_audit')).rows[0].n,3);
});
test('administrator subject scores upgrade existing half/full attempts without changing student results, stored data or privileges',async t=>{
 for(const kind of ['half','full'])await t.test(kind,async t=>{
  const f=await fixture(t,{subjectScores:false}),exam={...f.body(kind),resultsReleased:true},perSection=exam.answerKey.length/5;
  const expected=kind==='half'?[0,1,7,14,15]:[0,1,15,29,30];
  const answers=expected.flatMap(count=>Array.from({length:perSection},(_,i)=>i<count?1:i%2?2:0));
  answers[perSection-1]=2;
  await f.invoke('admin_save',admin,exam);await f.submit(exam.id,'ip-a',answers);
  await f.invoke('save',student('ip-b'),{id:exam.id,revision:0,answers:exam.answerKey});
  const beforeStudent=await f.invoke('get',student('ip-a'),{id:exam.id});
  const beforeRounds=(await f.db.query('select * from ip_aptitude_rounds order by id')).rows;
  const beforeAttempts=(await f.db.query('select * from ip_aptitude_attempts order by round_id,student_id')).rows;
  const privileges=()=>f.db.query("select prosecdef,proacl,proconfig from pg_proc where oid='public.ip_aptitude_service(text,jsonb,jsonb)'::regprocedure");
  const beforePrivileges=(await privileges()).rows;
  await f.db.exec(fs.readFileSync(subjectScoresMigration,'utf8'));
  assert.deepEqual((await f.db.query('select * from ip_aptitude_rounds order by id')).rows,beforeRounds);
  assert.deepEqual((await f.db.query('select * from ip_aptitude_attempts order by round_id,student_id')).rows,beforeAttempts);
  assert.deepEqual((await privileges()).rows,beforePrivileges);
  assert.deepEqual(await f.invoke('get',student('ip-a'),{id:exam.id}),beforeStudent);
  await f.db.exec('set role service_role');
  const report=await f.invoke('admin_report',admin,{id:exam.id});
  await f.db.exec('reset role');
  const submitted=report.students.find(s=>s.studentId==='ip-a');
  assert.deepEqual(submitted.subjectCorrectCounts,expected);
  assert.equal(submitted.correctCount,expected.reduce((a,b)=>a+b,0));
  assert.equal(report.round.perSection,perSection);
  for(const s of report.students){
   if(s.state!=='submitted')assert.equal(s.subjectCorrectCounts,null,'Draft and missing attempts have no subject scores');
   assert.equal(s.answers,undefined);assert.equal(s.answerKey,undefined);
  }
  await assert.rejects(f.invoke('admin_report',student('ip-a'),{id:exam.id}),/forbidden/);
  const answerKey=[...exam.answerKey];answerKey[perSection-1]=2;
  await f.invoke('admin_save',admin,{...exam,revision:1,answerKey,reason:'원문 대조 후 과목 마지막 문항 정답을 정정합니다.'});
  const corrected=(await f.invoke('admin_report',admin,{id:exam.id})).students.find(s=>s.studentId==='ip-a');
  assert.deepEqual(corrected.subjectCorrectCounts,[1,...expected.slice(1)]);
  assert.equal(corrected.correctCount,submitted.correctCount+1);
 });
});

test('blank answers, invalid choices, closed windows and concurrent administrative edits cannot overwrite data',async t=>{
 const f=await fixture(t),exam=f.body();await f.invoke('admin_save',admin,exam);
 await assert.rejects(f.submit(exam.id,'ip-a',Array(75).fill(0)),/empty_answers/);
 await assert.rejects(f.submit(exam.id,'ip-a',Array(75).fill(6)),/invalid_answers/);
 const edits=await Promise.allSettled([f.invoke('admin_save',admin,{...exam,revision:1,title:'수정 A'}),f.invoke('admin_save',admin,{...exam,revision:1,title:'수정 B'})]);
 assert.equal(edits.filter(r=>r.status==='fulfilled').length,1);assert.match(edits.find(r=>r.status==='rejected').reason.message,/revision_conflict/);
 await f.invoke('admin_save',admin,{...exam,revision:2,opensAt:'2099-01-01T00:00:00Z'});await assert.rejects(f.submit(exam.id,'ip-a',Array(75).fill(1)),/exam_not_open/);
 await f.invoke('admin_save',admin,{...exam,revision:3,state:'closed'});await assert.rejects(f.submit(exam.id,'ip-a',Array(75).fill(1)),/exam_not_open/);
 const report=await f.invoke('admin_report',admin,{id:exam.id});assert.equal(report.students.length,4);assert(report.students.every(s=>s.state==='not_submitted'));
 const fresh=f.body('full');fresh.state='draft';const simultaneous=await Promise.allSettled([f.invoke('admin_save',admin,fresh),f.invoke('admin_save',admin,{...fresh,title:'겹친 생성 요청'})]);
 assert.equal(simultaneous.filter(r=>r.status==='fulfilled').length,1);assert.match(simultaneous.find(r=>r.status==='rejected').reason.message,/revision_conflict/);
});
async function http(handler,body,headers={}){if(!body.action.startsWith('admin_')&&body.action!=='list')body={accountId:'ip-a',...body};let status,data;await handler({method:'POST',headers:{host:'localhost',origin:'http://localhost',...headers},body},{setHeader(){},status(n){status=n;return this;},json(v){data=v;}});return {status,data};}
test('private PDF upload, verification, results/submission gates and deletion use the same membership and revision controls',async t=>{
 const f=await fixture(t),exam=f.body();await f.invoke('admin_save',admin,exam);let owner='ip-a',canWrite=true;
 const objects=new Map(),removed=[],storage={uploadUrl:async p=>'https://storage.invalid/upload/'+p,read:async p=>objects.get(p),signed:async p=>'https://storage.invalid/signed/'+p,remove:async p=>{removed.push(p);objects.delete(p);}};
 const handler=createHandler({invoke:f.invoke,storage:()=>storage,authenticateWeb:async()=>({id:owner}),authenticateDevice:async()=>null,authenticateAdmin:async(_req,write)=>{if(write&&!canWrite)throw Error('forbidden');return {id:'qa'};}});
 const pdf=Buffer.from('%PDF-1.4\nfictional fixture\n%%EOF');
 const prepared=await http(handler,{action:'admin_upload_prepare',id:exam.id,revision:1,name:'해설지.pdf',bytes:pdf.length});assert.equal(prepared.status,200);
 const fileId=prepared.data.fileId,objectPath=exam.id+'/'+fileId+'.pdf';objects.set(objectPath,pdf);
 const completed=await http(handler,{action:'admin_upload_complete',id:exam.id,fileId});assert.equal(completed.status,200);assert.equal(completed.data.revision,2);
 assert.equal((await http(handler,{action:'file',id:exam.id,fileId})).status,403);
 await f.submit(exam.id,'ip-a',Array(75).fill(1));assert.equal((await http(handler,{action:'file',id:exam.id,fileId})).status,403);
 await f.invoke('admin_save',admin,{...exam,revision:2,state:'closed',resultsReleased:true});
 assert.equal((await http(handler,{action:'file',id:exam.id,fileId})).status,200);
 owner='web-only';assert.equal((await http(handler,{action:'file',accountId:owner,id:exam.id,fileId})).status,403);
 owner='ip-a';await f.db.exec("update ip_members set enabled=false where student_id='ip-a'");assert.equal((await http(handler,{action:'file',id:exam.id,fileId})).status,403);
 canWrite=false;assert.equal((await http(handler,{action:'admin_file_delete',id:exam.id,fileId,revision:3})).status,403);
 canWrite=true;assert.equal((await http(handler,{action:'admin_file_delete',id:exam.id,fileId,revision:3})).status,200);assert.deepEqual(removed,[]);
 assert.equal((await http(handler,{action:'admin_file',id:exam.id,fileId})).status,403);
 // Reclaim after the upload capability expires, so a late PUT cannot recreate an orphan.
 await f.db.exec("update ip_aptitude_file_gc set available_at=now()-interval '1 second'");
 await http(handler,{action:'admin_upload_abort',id:exam.id,fileId});assert.deepEqual(removed,[objectPath]);
});
test('upgrading existing open and closed rounds preserves answer keys, submissions and already published results',async t=>{
 const f=await fixture(t,{resultsOnSubmission:false}),open=f.body(),closed=f.body('full');
 await f.invoke('admin_save',admin,open);await f.submit(open.id,'ip-a',open.answerKey);
 await f.invoke('admin_save',admin,closed);await f.submit(closed.id,'ip-b',closed.answerKey);
 await f.invoke('admin_save',admin,{...closed,revision:1,state:'closed',resultsReleased:true});
 const beforeRounds=(await f.db.query('select * from ip_aptitude_rounds order by id')).rows,beforeAttempts=(await f.db.query('select * from ip_aptitude_attempts order by round_id,student_id')).rows;
 await f.db.exec(fs.readFileSync('supabase/migrations/20261112152643_interview_aptitude_results_on_submission.sql','utf8'));
 assert.deepEqual((await f.db.query('select * from ip_aptitude_rounds order by id')).rows,beforeRounds);
 assert.deepEqual((await f.db.query('select * from ip_aptitude_attempts order by round_id,student_id')).rows,beforeAttempts);
 assert.equal((await f.invoke('get',student('ip-b'),{id:closed.id})).result.correctCount,150);
 assert.equal((await f.invoke('get',student('ip-a'),{id:open.id})).result,undefined,'Waiting results stay hidden through the migration');
 await f.invoke('admin_save',admin,{...open,revision:1,resultsReleased:true});
 const released=await f.invoke('get',student('ip-a'),{id:open.id});assert.equal(released.result.correctCount,75);assert.equal(released.round.accepting,true);
});

test('published results and private PDFs become available after each final submission while half and full rounds remain open',async t=>{
 for(const kind of ['half','full'])await t.test(kind,async t=>{
  const f=await fixture(t),exam={...f.body(kind),resultsReleased:true};let owner='ip-a';
  const handler=createHandler({invoke:f.invoke,storage:()=>({signed:async objectPath=>'https://storage.invalid/'+objectPath}),authenticateWeb:async()=>({id:owner}),authenticateDevice:async()=>null,authenticateAdmin:async()=>({id:'qa'})});
  assert.throws(()=>validate({action:'admin_save',...exam,state:'draft'}),/invalid_request/);
  assert.equal((await http(handler,{action:'admin_save',...exam})).status,200,'API accepts open + public');
  const prepared=await f.invoke('admin_upload_prepare',admin,{id:exam.id,revision:1,name:'제출 후 해설.pdf',bytes:100}),fileId=prepared.file.id;
  await f.invoke('admin_upload_commit',admin,{id:exam.id,fileId,bytes:100,sha256:'a'.repeat(64)});
  const hidden=async()=>{
   const response=await http(handler,{action:'get',accountId:owner,id:exam.id});assert.equal(response.status,200);
   for(const key of ['answerKey','correctAnswers','result','files'])assert.equal(response.data[key],undefined,key+' stays private before final submission');
   assert.equal((await http(handler,{action:'file',accountId:owner,id:exam.id,fileId})).status,403);
  };
  await hidden();
  const ownAnswers=Array(exam.answerKey.length).fill(1);ownAnswers[0]=2;
  await f.invoke('save',student(owner),{id:exam.id,revision:0,answers:ownAnswers});await hidden();
  const submitted=await http(handler,{action:'submit',id:exam.id,revision:1,answers:ownAnswers,requestKey:randomUUID()});
  assert.equal(submitted.status,200);assert.equal(submitted.data.round.state,'open');assert.equal(submitted.data.round.accepting,true);
  assert.equal(submitted.data.result.correctCount,ownAnswers.length-1);assert.deepEqual(submitted.data.correctAnswers,exam.answerKey);assert.equal(submitted.data.files[0].id,fileId);
  assert.equal((await http(handler,{action:'file',id:exam.id,fileId})).status,200);
  await assert.rejects(f.submit(exam.id,owner,exam.answerKey),/already_submitted/);
  owner='ip-b';await hidden();
  const second=await f.submit(exam.id,owner,exam.answerKey);assert.equal(second.round.accepting,true);assert.equal(second.result.correctCount,exam.answerKey.length);
  assert.equal((await f.invoke('get',student('ip-a'),{id:exam.id})).result.rank,2,'Rank updates as other students submit');
  const edit={...exam,revision:2,title:'응시 중 공개 회차 수정'};
  assert.equal((await http(handler,{action:'admin_save',...edit})).status,200,'Published open rounds remain editable');
  await f.invoke('admin_save',admin,{...edit,revision:3,resultsReleased:false});owner='ip-a';await hidden();
  await f.invoke('admin_save',admin,{...edit,revision:4});assert.equal((await f.invoke('get',student(owner),{id:exam.id})).result.rank,2);
  await f.invoke('admin_save',admin,{...edit,revision:5,state:'closed'});
  await assert.rejects(f.invoke('admin_save',admin,{...edit,revision:6}),/results_already_released/);
 });
});

test('API rejects forged actors, unsupported fields and non-PDF payloads before they can reach data',async()=>{
 assert.throws(()=>validate({action:'get',id:randomUUID(),actor:admin}),/invalid_request/);
 let invoked=0;const handler=createHandler({authenticateWeb:async()=>null,authenticateDevice:async()=>null,authenticateAdmin:async()=>{throw Error('unauthorized');},invoke:async()=>{invoked++;}});
 assert.equal((await http(handler,{action:'get',id:randomUUID()})).status,401);assert.equal((await http(handler,{action:'admin_list'})).status,401);assert.equal(invoked,0);
 assert.equal((await http(handler,{action:'list'},{origin:'https://evil.invalid'})).status,403);
 const switched=createHandler({authenticateWeb:async()=>({id:'ip-b'}),invoke:async()=>{invoked++;}});
 assert.equal((await http(switched,{action:'get',accountId:'ip-a',id:randomUUID()})).status,403);assert.equal(invoked,0);
 const {validatePdf}=require('../lib/interview-aptitude-storage.cjs');assert.throws(()=>validatePdf(Buffer.from('<script>alert(1)</script>'),25),/invalid_file/);
});

test('full exams count every correct answer equally, reject weights, and retry failed storage cleanup',async t=>{
 const f=await fixture(t),exam=f.body('full');await assert.rejects(f.invoke('admin_save',admin,{...exam,points:Array(150).fill(10)}),/invalid_request/);assert.throws(()=>validate({action:'admin_save',...exam,points:Array(150).fill(10)}),/invalid_request/);await f.invoke('admin_save',admin,exam);
 const a=Array(150).fill(0),b=[...a];a[1]=1;b[0]=1;
 await f.submit(exam.id,'ip-a',a);await f.submit(exam.id,'ip-b',b);
 await f.invoke('admin_save',admin,{...exam,revision:1,state:'closed',resultsReleased:true});
 const one=await f.invoke('get',student('ip-a'),{id:exam.id}),two=await f.invoke('get',student('ip-b'),{id:exam.id});
 assert.equal(one.result.correctCount,1);assert.equal(two.result.correctCount,1);assert.equal(one.result.totalQuestions,150);assert.equal(one.result.accuracy,0.67);assert.equal(one.result.rank,1);assert.equal(two.result.rank,1);
 const file=await f.invoke('admin_upload_prepare',admin,{id:exam.id,revision:2,name:'업로드 실패.pdf',bytes:100});
 await f.invoke('admin_upload_abort',admin,{id:exam.id,fileId:file.file.id});
 assert.equal((await f.db.query("select state from ip_aptitude_files where id=$1",[file.file.id])).rows[0].state,'deleted');
 assert.deepEqual((await f.invoke('admin_gc',admin)).paths,[]);
 await f.db.exec("update ip_aptitude_file_gc set available_at=now()-interval '1 second'");
 const gc=await f.invoke('admin_gc',admin);assert.deepEqual(gc.paths,[file.file.object_path]);
 await assert.rejects(f.invoke('file',student('ip-a'),{id:exam.id,fileId:file.file.id}),/forbidden/);
 await f.invoke('admin_gc_ack',admin,{objectPath:file.file.object_path});assert.deepEqual((await f.invoke('admin_gc',admin)).paths,[]);
 const draft=f.body();draft.roundNo=99;draft.state='draft';await f.invoke('admin_save',admin,draft);
 await f.invoke('admin_delete',admin,{id:draft.id,revision:1});await assert.rejects(f.invoke('admin_get',admin,{id:draft.id}),/not_found/);
 await assert.rejects(f.invoke('admin_delete',admin,{id:exam.id,revision:2}),/exam_structure_locked/);
});

test('storage capabilities remain private, bounded, immutable and restricted to generated PDF paths',async()=>{
 const {createStorage,MAX}=require('../lib/interview-aptitude-storage.cjs'),calls=[],p=randomUUID()+'/'+randomUUID()+'.pdf';
 const store=createStorage({url:'https://example.supabase.co',key:'fixture-service-key',fetchImpl:async(url,options)=>{calls.push({url,options});if(url.includes('/upload/sign/'))return Response.json({url:'/object/upload/sign/interview-aptitude/'+p+'?token=fixture'});if(url.includes('/object/sign/'))return Response.json({signedURL:'/object/sign/interview-aptitude/'+p+'?token=fixture'});return new Response('%PDF-1.4\n%%EOF');}});
 assert((await store.uploadUrl(p)).startsWith('https://example.supabase.co/storage/v1/object/upload/sign/'));
 assert((await store.signed(p)).startsWith('https://example.supabase.co/storage/v1/object/sign/'));
 assert.equal(JSON.parse(calls[1].options.body).expiresIn,60);assert.equal(calls[0].options.headers['x-upsert'],'false');assert(calls.every(c=>c.options.redirect==='error'));
 await assert.rejects(store.signed('../other-file.pdf'),/invalid_file/);
 assert.equal(MAX,20971520);
});
