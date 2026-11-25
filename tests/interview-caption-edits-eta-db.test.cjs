'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID}=require('node:crypto');
const {createPracticeDb}=require('./helpers/practice-archive-db.cjs');
(async()=>{
 const db=await createPracticeDb(),a={type:'student',id:'a'},b={type:'student',id:'b'},admin={type:'admin',id:'admin'},hash='a'.repeat(64);
 try{
  for(const suffix of ['_interview_practice_student_captions.sql','_interview_practice_caption_edits_eta.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+fs.readdirSync('supabase/migrations').find(f=>f.endsWith(suffix)),'utf8'));
  await db.exec('grant update on public.ip_members to service_role;set role service_role');
  const seed=async(actor,duration)=>{const id=randomUUID();await db.query('select ip_practice_service($1,$2,$3)',['sync',actor,{runId:id,mode:'job',track:'공채',recordedAt:new Date().toISOString(),questionCount:1,completed:true,finished:true,turns:[{number:1,questionId:'q',question:'질문',answer:'',duration,audioBytes:1000,audioHash:hash}]}]);await db.query('select ip_practice_service($1,$2,$3)',['uploaded',actor,{runId:id,number:1,audioHash:hash}]);return id;};
  const sample=await seed(a,60),ahead=await seed(b,60),runId=await seed(a,60),behind=await seed(b,900);
  const read=async()=>(await db.query('select ip_practice_student_captions($1,$2) r',[a,runId])).rows[0].r;
  const edit=async(actor=a,mode='job',revision=0,text='수강생이 수정한 내용')=>(await db.query('select ip_practice_update_student_caption($1,$2,$3,$4,$5,$6) r',[actor,runId,mode,1,revision,text])).rows[0].r;
  await assert.rejects(edit(),/report_not_ready/);
  await db.exec('reset role');
  await db.query("update ip_practice_transcriptions set status='completed',processing_seconds=30,decoded_seconds=60,transcribed_at=now() where run_id=$1",[sample]);
  await db.query("update ip_practice_transcriptions set created_at=now()-interval '2 minutes' where run_id=$1",[ahead]);
  await db.query("update ip_practice_transcriptions set created_at=now()-interval '1 minute' where run_id=$1",[runId]);
  await db.exec("insert into ip_practice_asr_worker_presence(id,state,seen_at) values(true,'idle',now());set role service_role");
  let eta=(await read()).estimate;assert.equal(eta.state,'pending');assert.equal(eta.minSeconds,64);assert(eta.maxSeconds-eta.minSeconds>=300,'idle queue-check backoff included');
  await db.exec("reset role;update ip_practice_asr_worker_presence set state='processing';set role service_role");
  const active=(await read()).estimate;assert(active.maxSeconds<eta.maxSeconds);assert(active.minSeconds<100,'jobs behind this record are excluded');
  await db.exec('reset role');await db.query('update ip_practice_turns set duration=120 where run_id=$1',[ahead]);await db.exec('set role service_role');
  assert((await read()).estimate.minSeconds>active.minSeconds,'earlier queue workload changes ETA');
  await db.exec("reset role;update ip_practice_asr_worker_presence set seen_at=now()-interval '5 minutes';set role service_role");
  assert.deepEqual((await read()).estimate,{state:'waiting'});
  await db.exec('reset role');await db.query("update ip_practice_transcriptions set status='completed',transcript='자동 생성 원문',corrected_text='관리자 검수본',revision=2,review_note='관리자 비공개 메모',processing_seconds=30,decoded_seconds=60,transcribed_at=now() where run_id=$1",[runId]);await db.exec('set role service_role');
  await assert.rejects(edit(b),/not_found/);await assert.rejects(edit(admin),/forbidden/);await assert.rejects(edit(a,'personality'),/forbidden/);
  const saved=await edit();assert.equal(saved.caption.studentText,'수강생이 수정한 내용');assert.equal(saved.caption.studentRevision,1);assert(saved.caption.studentUpdatedAt);
  await assert.rejects(edit(),/revision_conflict/);
  const reviewed=(await db.query('select ip_practice_transcription_service($1,$2,$3) r',['admin_get',admin,{runId}])).rows[0].r.jobs[0];
  assert.equal(reviewed.student_text,'수강생이 수정한 내용');assert.equal(reviewed.student_updated_by,'a');assert.equal(reviewed.transcript,'자동 생성 원문');assert.equal(reviewed.corrected_text,'관리자 검수본');assert.equal(reviewed.revision,2);
  assert.equal((await read()).captions[0].studentText,'수강생이 수정한 내용');assert.equal((await read()).estimate.state,'completed');
  assert.equal((await edit(a,'job',1,'')).caption.studentText,'','blank correction must not revert to ASR text');
  await assert.rejects(edit(a,'job',2,'x'.repeat(30001)),/invalid_request/);
  await db.exec("reset role;update ip_members set enabled=false where student_id='a';set role service_role");await assert.rejects(edit(a,'job',2),/not_enrolled/);
  await db.exec('reset role');
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(edit(),/permission denied/);await assert.rejects(db.query('select ip_practice_caption_estimate($1)',[runId]),/permission denied/);await db.exec('reset role');}
  console.log('PASS caption edits/ETA: real speed and queue order, idle backoff and offline status, ownership/mode/enrollment, optimistic revisions, blank correction, preserved ASR/admin review and administrator visibility');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
