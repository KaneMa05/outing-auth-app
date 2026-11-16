'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createHandler}=require('../api/interview-live');
const now=Date.parse('2026-11-11T06:20:00Z');
async function request({runs=[],testApp=true,action='ready',ready=true}={}){
 const calls=[],handler=createHandler({now:()=>now,requireMockAccess:async()=>{},config:{enabled:true,transport:'vercel',secret:'s'.repeat(64)},authenticateWeb:async()=>({id:'test'}),invoke:async action=>{calls.push(action);return action==='list'?{runs}:{ok:true,ready,reason:ready?'':'not_enrolled'};}});
 let status,data;await handler({method:'POST',headers:{host:'localhost',origin:'http://localhost',...(testApp?{'x-interview-test-app':'1'}:{})},body:{action,...(action==='start'?{requestKey:randomUUID(),sdp:'v=0'}:{})}},{setHeader(){},status(n){status=n;return this;},json(v){data=v;}});return {status,data,calls};
}
const today=()=>({state:'interrupted',created_at:'2026-11-11T01:00:00Z'});
test('marked test app remains ready and receives a ticket beyond three daily attempts',async()=>{
 const runs=Array.from({length:6},today),ready=await request({runs});
 assert.equal(ready.data.ready,true);assert.equal(ready.data.unlimited,true);assert.equal(ready.data.dailyLimit,null);assert.equal(ready.data.remainingToday,null);
 const start=await request({runs,action:'start'});assert.equal(start.status,200);assert.equal(typeof start.data.ticket,'string');
});
test('an active or unconfirmed interview blocks a duplicate connection',async()=>{
 for(const state of ['starting','active','closing','unknown'])assert.equal((await request({runs:[{state,created_at:'2026-11-10T00:00:00Z'}]})).data.reason,'admission_busy');
});
test('ordinary app readiness and enrollment failure do not gain history queries',async()=>{
 const ordinary=await request({testApp:false,runs:[today(),today(),today()]});assert.deepEqual(ordinary.calls,['ready']);assert.equal(ordinary.data.ready,true);
 const denied=await request({ready:false});assert.deepEqual(denied.calls,['ready']);assert.equal(denied.data.reason,'not_enrolled');
});
test('database allows repeated test-app attempts while ordinary daily quota and active-session guard remain',async t=>{
 const fs=require('node:fs'),{fixture}=require('./helpers/interview-mock-cli-fixture.cjs');
 const f=await fixture();t.after(()=>f.db.close());
 await f.db.exec("insert into ip_questions(id,prompt,category,status,tracks) values('extra-live','추가 테스트 질문','job','published',array['공채'])");
 await f.db.exec(fs.readFileSync('supabase/migrations/20261111062812_interview_test_live_unlimited.sql','utf8'));
 const live=f.rpc('ip_live_service'),actor={type:'student',id:'ip-a',testApp:true};
 for(let i=0;i<5;i++){
  const {run}=await live('reserve',actor,{requestKey:randomUUID()});
  await assert.rejects(live('reserve',actor,{requestKey:randomUUID()}),/admission_busy/);
  await f.db.query("update ip_live_runs set state='interrupted' where id=$1",[run.id]);
 }
 for(const marker of [undefined,false,'true'])await assert.rejects(live('reserve',{type:'student',id:'ip-a',testApp:marker},{requestKey:randomUUID()}),/daily_limit/);
 assert.equal((await f.db.query("select count(*)::integer n from ip_live_runs where student_id='ip-a'")).rows[0].n,5,'attempt history is preserved');
});
