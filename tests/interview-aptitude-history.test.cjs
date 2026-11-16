'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID}=require('node:crypto');
const {createDb}=require('./helpers/interview-db.cjs');
const historyMigration='supabase/migrations/20261116072310_interview_aptitude_historical_attempts.sql';
const admin={type:'admin',id:'qa'},student=id=>({type:'student',id});
async function fixture(t){
 const {db}=await createDb();t.after(()=>db.close());
 await db.exec("create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]); update ip_settings set enabled=true; insert into ip_members(student_id,track,exam_number,enabled) values('ip-a','공채','a',true),('ip-b','기관','b',true),('ip-c','방제','c',true);");
 for(const file of ['supabase/migrations/20261109053559_interview_aptitude_exams.sql','supabase/migrations/20261112152643_interview_aptitude_results_on_submission.sql'])await db.exec(fs.readFileSync(file,'utf8'));
 const invoke=async(action,actor,body={})=>(await db.query('select ip_aptitude_service($1,$2::jsonb,$3::jsonb) result',[action,JSON.stringify(actor),JSON.stringify(body)])).rows[0].result;
 const exam={id:randomUUID(),revision:0,kind:'half',roundNo:1,title:'하프 1회',state:'open',resultsReleased:true,answerKey:Array(75).fill(1)};
 const historical=async(answers,source='old-1',roundId=exam.id)=>db.query(`insert into ip_aptitude_historical_attempts(round_id,source_id,cohort,display_name,submitted_at,answers,correct_count,source_correct_count,scored_key_revision,source_filename,source_sha256,source_row)
  values($1,$2,'이전 기수','과거 학생','2025-11-05T12:00:00+09:00',$3::jsonb,ip_aptitude_score($3::jsonb,$4::jsonb),ip_aptitude_score($3::jsonb,$4::jsonb),1,'fixture.xlsx',repeat('a',64),2)`,[roundId,source,JSON.stringify(answers),JSON.stringify(exam.answerKey)]);
 const submit=(owner,answers,roundId=exam.id)=>invoke('submit',student(owner),{id:roundId,revision:0,answers,requestKey:randomUUID()});
 await invoke('admin_save',admin,exam);
 return {db,invoke,exam,historical,submit};
}
test('migration preserves current attempts; historical ties contribute to student and administrator rankings without exposing other students',async t=>{
 const f=await fixture(t),a=[2,...Array(74).fill(1)];
 await f.submit('ip-a',a);await f.submit('ip-b',a);
 const before=(await f.db.query('select * from ip_aptitude_attempts order by student_id')).rows;
 await f.db.exec(fs.readFileSync(historyMigration,'utf8'));
 assert.deepEqual((await f.db.query('select * from ip_aptitude_attempts order by student_id')).rows,before);
 assert.equal((await f.invoke('get',student('ip-a'),{id:f.exam.id})).result.participants,2);
 await f.historical(Array(75).fill(1),'best');await f.historical(a,'tie');await f.historical([2,2,...Array(73).fill(1)],'lower');
 const value=await f.invoke('get',student('ip-a'),{id:f.exam.id});
 assert.equal(value.result.rank,2);assert.equal(value.result.participants,5);assert.equal(value.result.historicalParticipants,3);assert.equal(value.result.correctCount,74);
 assert(!JSON.stringify(value).includes('과거 학생'));assert(!JSON.stringify(value).includes('cohort'));
 const report=await f.invoke('admin_report',admin,{id:f.exam.id});
 assert.deepEqual(report.students.filter(s=>s.state==='submitted').map(s=>s.rank).sort((a,b)=>a-b),[1,2,2,2,5]);
 assert.equal(report.students.filter(s=>s.historical).length,3);assert(report.students.filter(s=>s.historical).every(s=>s.name.includes('이전 기수')));
 assert.equal((await f.invoke('admin_get',admin,{id:f.exam.id})).submittedCount,5);
 assert.equal((await f.invoke('get',student('ip-c'),{id:f.exam.id})).result,undefined);
 await f.db.exec("update ip_members set enabled=false where student_id='ip-b'");
 assert.equal((await f.invoke('get',student('ip-a'),{id:f.exam.id})).result.participants,5);
 await assert.rejects(f.invoke('get',student('ip-b'),{id:f.exam.id}),/not_enrolled/);
 for(const role of ['anon','authenticated']){
  await f.db.exec('set role '+role);
  await assert.rejects(f.db.query('select * from ip_aptitude_historical_attempts'),/permission denied/);
  await assert.rejects(f.db.query('select * from ip_aptitude_rankings($1)',[f.exam.id]),/permission denied/);
  await f.db.exec('reset role');
 }
 await f.db.exec('set role service_role');assert.equal((await f.db.query('select * from ip_aptitude_rankings($1)',[f.exam.id])).rows.length,5);await f.db.exec('reset role');
 const other={...f.exam,id:randomUUID(),kind:'full',roundNo:1,title:'본시험',answerKey:Array(150).fill(1)};
 await f.invoke('admin_save',admin,other);await f.submit('ip-c',other.answerKey,other.id);
 assert.equal((await f.invoke('get',student('ip-c'),{id:other.id})).result.participants,1);
});
test('answer corrections regrade both populations atomically and preserve original historical totals',async t=>{
 const f=await fixture(t);await f.db.exec(fs.readFileSync(historyMigration,'utf8'));
 const old=[2,...Array(74).fill(1)];await f.historical(old);await f.submit('ip-a',Array(75).fill(1));
 const answerKey=[2,...Array(74).fill(1)];
 await assert.rejects(f.invoke('admin_save',admin,{...f.exam,revision:1,answerKey}),/correction_reason_required/);
 const changed=await f.invoke('admin_save',admin,{...f.exam,revision:1,answerKey,reason:'원본 정답 정정 확인'});assert.equal(changed.rescored,2);
 const h=(await f.db.query('select * from ip_aptitude_historical_attempts')).rows[0];
 assert.equal(h.correct_count,75);assert.equal(h.source_correct_count,74);assert.equal(h.scored_key_revision,2);
 const result=(await f.invoke('get',student('ip-a'),{id:f.exam.id})).result;assert.equal(result.correctCount,74);assert.equal(result.rank,2);
 await assert.rejects(f.historical(old),/unique constraint/);
 await assert.rejects(f.historical([6,...Array(74).fill(1)],'invalid'),/check constraint/);
 await assert.rejects(f.historical(Array(74).fill(1),'short'),/check constraint/);
 await assert.rejects(f.invoke('admin_save',admin,{...f.exam,revision:2,kind:'full',answerKey:Array(150).fill(1)}),/exam_structure_locked/);
});
test('prepared imports are repeatable, safely quote names, and roll back conflicting reimports',async t=>{
 const {prepare}=require('../scripts/prepare-aptitude-history-import.cjs');
 const f=await fixture(t);await f.db.exec(fs.readFileSync(historyMigration,'utf8'));
 await f.submit('ip-a',f.exam.answerKey);
 const before=(await f.db.query('select * from ip_aptitude_attempts')).rows;
 const payload={roundId:f.exam.id,answerKey:f.exam.answerKey,sourceFilename:"student's grades.xlsx",sourceSha256:'a'.repeat(64),records:[
  {sourceId:'old-1',cohort:'2025',name:"O'Brien",submittedAt:'2025-11-05T12:00:00+09:00',answers:Array(75).fill(1),correctCount:75,sourceRow:2},
  {sourceId:'old-2',cohort:'2026',name:'같은 이름',submittedAt:'2026-06-29T12:00:00.999000+09:00',answers:[2,...Array(74).fill(1)],correctCount:74,sourceRow:3}
 ]};
 await f.db.exec(prepare(payload));await f.db.exec(prepare(payload));
 assert.equal((await f.db.query('select count(*)::int n from ip_aptitude_historical_attempts')).rows[0].n,2);
 assert.equal(new Date((await f.db.query("select submitted_at from ip_aptitude_historical_attempts where source_id='old-2'")).rows[0].submitted_at).toISOString(),'2026-06-29T03:00:00.999Z');
 assert.equal((await f.db.query("select count(*)::int n from ip_aptitude_audit where actor_id='codex:approved-historical-import'")).rows[0].n,1);
 assert.deepEqual((await f.db.query('select * from ip_aptitude_attempts')).rows,before);
 const result=(await f.invoke('get',student('ip-a'),{id:f.exam.id})).result;assert.equal(result.participants,3);assert.equal(result.rank,1);
 const conflict=structuredClone(payload);conflict.records[0].name='변경된 이름';
 await assert.rejects(f.db.exec(prepare(conflict)),/historical_import_existing_record_mismatch/);await f.db.exec('rollback');
 assert.equal((await f.db.query("select display_name from ip_aptitude_historical_attempts where source_id='old-1'")).rows[0].display_name,"O'Brien");
 const wrongKey=structuredClone(payload);wrongKey.answerKey.fill(2);for(const r of wrongKey.records)r.correctCount=r.answers.filter(v=>v===2).length;
 await assert.rejects(f.db.exec(prepare(wrongKey)),/historical_import_round_or_answer_key_mismatch/);await f.db.exec('rollback');
 const duplicate=structuredClone(payload);duplicate.records.push(duplicate.records[0]);assert.throws(()=>prepare(duplicate),/duplicate source identity/);
});
