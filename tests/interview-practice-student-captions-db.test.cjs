'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID}=require('node:crypto');
const {createPracticeDb}=require('./helpers/practice-archive-db.cjs');
(async()=>{
 const db=await createPracticeDb(),runId=randomUUID(),hash='a'.repeat(64),actor={type:'student',id:'a'};
 try{
  const file=fs.readdirSync('supabase/migrations').find(f=>f.endsWith('_interview_practice_student_captions.sql'));
  await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
  const read=async(who=actor,id=runId)=>(await db.query('select public.ip_practice_student_captions($1,$2) result',[who,id])).rows[0].result;
  await db.exec('set role service_role');
  await db.query('select public.ip_practice_service($1,$2,$3)',['sync',actor,{runId,mode:'job',track:'공채',recordedAt:new Date().toISOString(),questionCount:2,finished:true,completed:true,
   turns:[1,2].map(number=>({number,questionId:'q'+number,question:'질문 '+number,answer:'기기 답변',duration:60,audioBytes:1000,audioHash:hash}))}]);
  assert.deepEqual((await read()).captions.map(c=>c.status),['uploading','uploading']);
  await assert.rejects(read({type:'student',id:'b'}),/not_found/);
  await assert.rejects(read({type:'admin',id:'admin'}),/forbidden/);
  await assert.rejects(read(actor,randomUUID()),/not_found/);
  await db.query('select public.ip_practice_service($1,$2,$3)',['uploaded',actor,{runId,number:1,audioHash:hash}]);
  assert.equal((await read()).captions[0].status,'pending');
  await db.exec('reset role');
  await db.query("update public.ip_practice_transcriptions set status='completed',transcript='원래 녹음 자막',corrected_text='검수 수정본',review_note='관리자 메모',reviewed_by='admin',transcribed_at=now() where run_id=$1",[runId]);
  await db.exec('set role service_role');
  assert.deepEqual(await read(),{ok:true,mode:'job',captions:[{number:1,status:'completed',text:'원래 녹음 자막'},{number:2,status:'uploading',text:''}]});
  await db.exec("reset role;update public.ip_members set enabled=false where student_id='a';set role service_role");
  await assert.rejects(read(),/not_enrolled/);
  await db.exec('reset role');
  for(const role of ['anon','authenticated']){
   await db.exec('set role '+role);await assert.rejects(read(),/permission denied/);await assert.rejects(db.query('select * from public.ip_practice_transcriptions'),/permission denied/);await db.exec('reset role');
  }
  console.log('PASS student captions: ownership, enrollment, service-only access, pending/completed states and private review exclusion');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
