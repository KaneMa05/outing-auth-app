'use strict';
const assert=require('node:assert/strict');
const {createPracticeDb}=require('./helpers/practice-archive-db.cjs');
(async()=>{
 const db=await createPracticeDb();
 try{
  const signal=state=>db.query('select ip_practice_asr_presence($1) result',[state]);
  const read=()=>db.query('select state,seen_at from ip_practice_asr_worker_presence');
  assert.equal((await read()).rows.length,0,'no invented connected state before a real worker reports');
  await db.exec('set role service_role');
  for(const state of ['starting','idle','processing','error','stopped']){
   assert((await signal(state)).rows[0].result.ok);assert.equal((await read()).rows[0].state,state);
  }
  await assert.rejects(signal('anything'),/invalid_request/);await assert.rejects(signal(null),/invalid_request/);
  assert.equal((await read()).rows.length,1,'singleton presence stays bounded');
  await db.exec("update ip_practice_asr_worker_presence set seen_at=now()-interval '10 minutes'");
  await signal('idle');assert((await read()).rows[0].seen_at.getTime()>Date.now()-60000,'timestamps come from the database');
  await db.exec('reset role');
  assert.equal((await db.query("select relrowsecurity from pg_class where relname='ip_practice_asr_worker_presence'")).rows[0].relrowsecurity,true);
  assert.equal((await db.query("select prosecdef from pg_proc where proname='ip_practice_asr_presence'")).rows[0].prosecdef,false);
  for(const role of ['anon','authenticated']){
   await db.exec('set role '+role);await assert.rejects(read(),/permission denied/);await assert.rejects(signal('idle'),/permission denied/);await db.exec('reset role');
  }
  console.log('PASS ASR presence SQL: service-only singleton, validated states, server timestamps, RLS and invoker rights');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
