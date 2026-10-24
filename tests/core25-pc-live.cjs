'use strict';
// Opt-in: only this synthetic answer is sent to the user's ChatGPT-backed CLI.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {fixture,send}=require('./core25-pc-worker.test.cjs');
const {createProvider}=require('../scripts/core25-diagnosis-cli.cjs');
const {processJob}=require('../scripts/core25-pc-worker.cjs');
(async()=>{
 console.log('LIVE: preparing isolated fixture');const x=await fixture();
 try{
  const answer='저는 일정이 복잡한 일을 작은 단계로 나눠 누락을 줄이는 일을 잘합니다. 동아리 행사에서 준비물이 빠져 담당자별 체크리스트를 만들고 매일 진행 상황을 확인했습니다. 예산 결정은 회장이 했고 저는 물품과 일정 확인을 맡았습니다. 행사 당일 준비물 누락 없이 시작했습니다. 입직 후에도 장비 점검과 인수인계에서 담당 사항을 기록하고 빠진 점을 확인하겠습니다. 장비 지식은 아직 부족해 교육과 선배의 확인으로 보완하겠습니다.';
  await x.call('save',x.a,{unitId:'core-01',revision:0,fields:{f1:answer},requestId:crypto.randomUUID()});
  await x.request('poll',{capacity:0});
  const enqueued=await send(x.student,{action:'diagnose',unitId:'core-01',revision:1});assert.equal(enqueued.statusCode,200);
  const job=(await x.request('poll',{capacity:1})).jobs[0];assert(job);console.log('LIVE: queued and claimed');
  const cli=createProvider({runtimeDir:path.resolve('.tmp/core25-pc-live'),onEvent:e=>console.log('CLI:',e)});
  const provider=async(...args)=>{console.log('LIVE: model invocation');try{const r=await cli(...args);console.log('LIVE: model returned');fs.writeFileSync('.tmp/core25-pc-live/raw-synthetic-report.json',JSON.stringify(r,null,2));return r;}catch(e){console.log('LIVE: model error',e.diagnostic||e.message);throw e;}};
  await processJob(job,{request:x.request,provider,notify:e=>console.log('LIVE:',e)});
  const diagnosis=(await send(x.student,{action:'diagnosis_status',unitId:'core-01'})).data.diagnosis;
  assert.equal(diagnosis.status,'completed');assert.equal(diagnosis.report.criteria.length,4);assert(diagnosis.report.criteria.every(c=>!c.quote||answer.includes(c.quote)));
  fs.mkdirSync('.tmp/core25-pc-live',{recursive:true});fs.writeFileSync('.tmp/core25-pc-live/verified-report.json',JSON.stringify({synthetic:true,answer,diagnosis},null,2));
  console.log('PASS live PC queue → CLI → validated report → saved result');
 }finally{await x.db.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
