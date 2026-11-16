'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {planCapacity}=require('../lib/interview-ai-capacity.cjs');
(async()=>{
 const plan=planCapacity({students:87,requestsPerDay:40,currentDailyLimit:20});
 assert.equal(plan.requestAllowance,3480);assert.equal(plan.dailyCallLimit,5000);
 assert.equal(planCapacity({students:120,requestsPerDay:40,currentDailyLimit:5000}).dailyCallLimit,6000);
 assert.equal(planCapacity({students:87,requestsPerDay:40,currentDailyLimit:7000}).dailyCallLimit,7000);
 assert.throws(()=>planCapacity({students:201,requestsPerDay:40,currentDailyLimit:20}),/capacity_exceeds_supported_limit/);
 for(const students of [-1,NaN,1.2])assert.throws(()=>planCapacity({students,requestsPerDay:40,currentDailyLimit:20}),/invalid_capacity_settings/);
 const {db}=await require('./helpers/interview-db.cjs').createDb();
 try{
  for(const name of ['20261020063234_interview_ai_pipeline.sql','20261020073140_interview_ai_readiness.sql','20261020074446_interview_ai_load_protection.sql','20261020081526_interview_ai_single_question.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+name,'utf8'));
  const before=(await db.query('select enabled,requests_per_day,requests_per_minute from ip_ai_settings')).rows[0];
  await db.query("select ip_ai_service('admin_configure','{\"type\":\"admin\",\"id\":\"capacity-test\"}',$1::jsonb)",[JSON.stringify({dailyCallLimit:plan.dailyCallLimit})]);
  const after=(await db.query('select enabled,daily_call_limit,requests_per_day,requests_per_minute from ip_ai_settings')).rows[0];
  assert.equal(after.daily_call_limit,5000);assert.equal(after.enabled,before.enabled);assert.equal(after.requests_per_day,before.requests_per_day);assert.equal(after.requests_per_minute,before.requests_per_minute);
  assert.equal((await db.query('select count(*)::int n from ip_ai_executions')).rows[0].n,0);
  console.log('PASS enrollment-based capacity, growth, existing higher caps, supported ceiling and DB configuration without feature activation or generation');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
