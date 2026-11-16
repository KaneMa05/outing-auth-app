'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID}=require('node:crypto');
const {voiceEvent,backendEvent}=require('../lib/interview-live-usage');
const {createProvider}=require('../lib/interview-live-provider');
const {fixture}=require('./helpers/interview-mock-cli-fixture.cjs');
test('voice seconds are cumulative, and cached/reasoning tokens are not double billed',()=>{
 assert.equal(voiceEvent('r','gpt-live-1',240,true).usd,0.2);
 assert.equal(voiceEvent('r','unknown',240,true).usd,null);
 assert.equal(voiceEvent('r','gpt-live-1',null).status,'pending');
 const usage={input_tokens:1000,output_tokens:200,input_tokens_details:{cached_tokens:500},output_tokens_details:{reasoning_tokens:100}};
 assert.equal(backendEvent('r','a','gpt-6.1-sol',usage).usd,0.00305);
 assert.equal(backendEvent('r','a','gpt-6.1-sol',null).usd,null);
 assert.equal(backendEvent('r','a','unknown',usage).status,'unpriced');
});
test('every paid request is recorded before network; usage survives invalid model output and uncertain retries',async()=>{
 const events=[];let calls=0;
 const provider=createProvider({key:'fake',onUsage:async e=>events.push(e),fetchImpl:async()=>{
  calls++;if(calls===2)throw Error('network_timeout');
  return Response.json({id:'resp_test',status:'completed',usage:{input_tokens:1000,output_tokens:200},output:[]});
 }});
 await assert.rejects(provider.followup({answer:'test'},{runId:'r'}),/invalid_output/);
 await assert.rejects(provider.followup({answer:'test'},{runId:'r'}),/network_timeout/);
 assert.equal(events.length,3);assert.equal(events[0].status,'unconfirmed');assert.equal(events[1].status,'reported');assert.equal(events[1].usage.responseId,'resp_test');assert.equal(events[2].usd,null);
 assert.equal(events[0].eventKey,events[1].eventKey);assert.notEqual(events[0].eventKey,events[2].eventKey);
 let network=false;const blocked=createProvider({key:'fake',onUsage:async()=>{throw Error('ledger_unavailable');},fetchImpl:async()=>{network=true;}});
 await assert.rejects(blocked.create('v=0','noeul',{runId:'r'}),/ledger_unavailable/);assert.equal(network,false);
});
test('ledger totals preserve attempts, update cumulative usage once and enforce owner/RLS',async t=>{
 const f=await fixture();t.after(()=>f.db.close());await f.db.exec(fs.readFileSync('supabase/migrations/20261111043100_interview_live_usage_ledger.sql','utf8'));
 const id=randomUUID();await f.db.query("insert into ip_live_runs(id,student_id,request_key,questions,retain_until,current_question) values($1,'ip-a',$2,'[]',now()+interval '1 day','test')",[id,randomUUID()]);
 const rpc=f.rpc('ip_live_usage_service'),server={type:'server',id:'test'},owner={type:'student',id:'ip-a'};
 await rpc('record',server,voiceEvent(id,'gpt-live-1',120));await rpc('record',server,voiceEvent(id,'gpt-live-1',240,true));await rpc('record',server,voiceEvent(id,'gpt-live-1',10));
 const event=backendEvent(id,'backend:1','gpt-6.1-sol',{input_tokens:1000,output_tokens:200});await rpc('record',server,event);await rpc('record',server,event);
 await rpc('record',server,backendEvent(id,'backend:2','gpt-6.1-sol',null));
 const report=await rpc('get',owner,{runId:id});assert.equal(report.events.length,3);assert.equal(report.confirmedUsd,0.204);assert.equal(report.estimatedUsd,0);assert.equal(report.unconfirmedEvents,1);assert.equal(report.fullyConfirmed,false);
 await assert.rejects(rpc('get',{type:'student',id:'other'},{runId:id}),/forbidden/);await assert.rejects(rpc('get',{}, {runId:id}),/forbidden/);await assert.rejects(rpc('record',owner,event),/forbidden/);
 await f.db.exec(fs.readFileSync('supabase/migrations/20261111050000_interview_live_cost_admin_only.sql','utf8'));
 await assert.rejects(rpc('get',owner,{runId:id}),/forbidden/);
 assert.equal((await rpc('get',{type:'admin',id:'qa'},{runId:id})).events.length,3);
 await f.db.exec('set role anon');await assert.rejects(f.db.query('select * from ip_live_usage_events'),/permission denied/);await f.db.exec('reset role');
});
test('unpriced historical usage can be calculated read-only without rewriting confirmation or ledger values',()=>{
 const {calculatedUsage}=require('../lib/interview-live-usage');
 const original={fullyConfirmed:false,totalUsd:null,events:[{kind:'voice',usd:0.2,status:'reported'},{kind:'backend',model:'gpt-6-astra',usd:null,status:'unpriced',usage:{inputTokens:499,outputTokens:61,cachedInputTokens:0}}]};
 const before=JSON.stringify(original),result=calculatedUsage(original);
 assert.equal(JSON.stringify(original),before);assert.equal(result.fullyConfirmed,false);assert.equal(result.totalUsd,null);assert.equal(result.calculationOnly,true);assert(Math.abs(result.calculatedTotalUsd-0.20804)<1e-10);
 assert.equal(calculatedUsage({events:[{status:'unconfirmed',usd:null}]}).calculatedTotalUsd,null);
});
