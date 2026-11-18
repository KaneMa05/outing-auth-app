'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createPracticeDb}=require('./helpers/practice-archive-db.cjs');
(async()=>{
 const runId=randomUUID(),hash='a'.repeat(64),hash2='b'.repeat(64),admin={type:'admin',id:'admin'},worker={type:'worker',id:'pc'},student={type:'student',id:'a'};
 const body={runId,mode:'job',track:'공채',fieldId:'law',fieldLabel:'법규',region:'서해',recordedAt:new Date().toISOString(),questionCount:2,finished:true,completed:true,
 turns:[{number:1,questionId:'q1',question:'질문 1',answer:'',duration:8,audioBytes:1000,audioHash:hash},{number:2,questionId:'q2',question:'질문 2',answer:'',duration:8,audioBytes:1000,audioHash:hash2}]};
 const db=await createPracticeDb({afterArchive:async db=>{
  await db.query('select ip_practice_service($1,$2,$3)',['sync',student,body]);
  await db.query('select ip_practice_service($1,$2,$3)',['uploaded',student,{runId,number:1,audioHash:hash}]);
 }});
 try{
  const call=async(action,actor=worker,payload={})=>(await db.query('select ip_practice_transcription_service($1,$2,$3) result',[action,actor,payload])).rows[0].result;
  await db.exec('set role service_role');
  assert.equal((await db.query('select count(*) n from ip_practice_transcriptions')).rows[0].n,1,'existing audio backfilled');
  for(let n=0;n<2;n++)await db.query('select ip_practice_service($1,$2,$3)',['uploaded',student,{runId,number:2,audioHash:hash2}]);
  assert.equal((await db.query('select count(*) n from ip_practice_transcriptions')).rows[0].n,2,'uploads enqueue exactly once');
  await assert.rejects(call('claim',student),/forbidden/);
  const first=(await call('claim')).job,second=(await call('claim')).job;
  assert.equal(first.number,1);assert.equal(second.number,2);assert.equal((await call('claim')).job,null);
  const id=j=>({runId:j.runId,number:j.number,audioHash:j.audioHash,leaseId:j.leaseId});
  const result={model:'Whisper large-v3',modelRevision:'e'.repeat(40),engineVersion:'1.2.1',transcript:'3명이 아니다.',segments:[{start:0,end:5,text:'3명이 아니다.'}],processingSeconds:4,decodedSeconds:8};
  await assert.rejects(call('complete',worker,{...id(first),...result,model:'tiny'}),/invalid_output/);
  await assert.rejects(call('complete',worker,{...id(first),...result,segments:[{start:-1,end:5,text:'x'}]}),/invalid_output/);
  await call('heartbeat',worker,id(first));await call('complete',worker,{...id(first),...result});
  await assert.rejects(call('complete',worker,{...id(first),...result,transcript:'overwrite'}),/lease_lost/);
  await call('admin_review',admin,{runId,number:1,revision:1,reviewStatus:'meaning',correctedText:'4명이 아니다.',note:'숫자 수정'});
  await assert.rejects(call('admin_review',admin,{runId,number:1,revision:1,reviewStatus:'ok',correctedText:'stale',note:''}),/revision_conflict/);
  await db.query('select ip_practice_service($1,$2,$3)',['sync',student,{...body,turns:body.turns.map(t=>({...t,answer:'기기 재전송'}))}]);
  let row=(await call('admin_get',admin,{runId})).jobs[0];assert.equal(row.transcript,'3명이 아니다.');assert.equal(row.corrected_text,'4명이 아니다.');assert.equal(row.revision,2);assert.equal('lease_id' in row,false);
  await assert.rejects(call('admin_retry',admin,{runId,number:1}),/report_not_ready/);
  await db.exec(`update ip_practice_transcriptions set lease_until=now()-interval '1 second' where number=2`);
  const recovered=(await call('claim')).job;assert.notEqual(recovered.leaseId,second.leaseId);
  await assert.rejects(call('complete',worker,{...id(second),...result}),/lease_lost/);
  await call('fail',worker,{...id(recovered),errorCode:'audio_mismatch'});
  assert.equal((await call('claim')).job,null,'backoff enforced');
  await db.exec('update ip_practice_transcriptions set next_attempt_at=now() where number=2');
  const last=(await call('claim')).job;await call('fail',worker,{...id(last),errorCode:'transcription_failed'});
  await db.exec('update ip_practice_transcriptions set next_attempt_at=now() where number=2');assert.equal((await call('claim')).job,null,'three attempts bounded');
  const summary=(await call('admin_summaries',admin,{runIds:[runId]})).summaries[0];assert.equal(summary.completed,1);assert.equal(summary.failed,1);assert.equal(summary.reviewed,1);
  await call('admin_retry',admin,{runId,number:2});assert.ok((await call('claim')).job);
  await db.exec('reset role');
  assert.equal((await db.query("select relrowsecurity from pg_class where relname='ip_practice_transcriptions'")).rows[0].relrowsecurity,true);
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(db.query('select * from ip_practice_transcriptions'),/permission denied/);await assert.rejects(call('admin_get',admin,{runId}),/permission denied/);await db.exec('reset role');}
  console.log('PASS transcription SQL: backfill, upload trigger, durable leases/recovery/backoff, model/segment validation, preserved originals, concurrent review protection and service-only access');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
