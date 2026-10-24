'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '../client/interview-ai-client.js'), 'utf8');
(async () => {
  const {createInterviewAI} = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  const storage = new Map();
  global.sessionStorage = {getItem: k => storage.get(k), setItem: (k,v) => storage.set(k,v), removeItem: k => storage.delete(k)};
  const calls = [], updates = [];
  let release, failOnce = false, saved = false;
  const request = async (_, body) => {
    calls.push(body);
    if (body.action === 'prepare') {assert(saved); return {ok:true,enabled:true,ready:true,sourceHash:'a'.repeat(64)};}
    if (body.action === 'generate') {
      if (failOnce) {failOnce = false; throw Error('network_lost');}
      return {ok:true,requestId:'request-1'};
    }
    return {ok:true,items:[{status:'COMPLETED'}]};
  };
  const ai = createInterviewAI({request,onUpdate: x => updates.push(x)});
  const savePending = () => new Promise(resolve => {release = () => {saved = true; resolve();};});
  const first = ai.generate('self_intro',{savePending});
  const duplicate = ai.generate('self_intro',{savePending});
  assert.equal(calls.length,0); release(); await Promise.all([first,duplicate]);
  assert.equal(calls.filter(x=>x.action==='generate').length,1);
  failOnce = true;
  await assert.rejects(ai.generate('motivation',{regenerate:true}),/network_lost/);
  await ai.generate('motivation',{regenerate:true});
  const retried = calls.filter(x=>x.kind==='motivation' && x.action==='generate');
  assert.equal(retried[0].requestKey,retried[1].requestKey);
  await ai.retryItems('request-1','core30',['q2','q1','q2']);
  assert.deepEqual(calls.find(x=>x.action==='retry_items').itemKeys,['q1','q2']);
  ai.destroy();
  await assert.rejects(ai.requests(), /client_destroyed/);

  let resolveRequest;
  const afterLogout = [];
  const later = createInterviewAI({request:()=>new Promise(r=>{resolveRequest=r;}),onUpdate:x=>afterLogout.push(x)});
  const pending = later.generate('self_intro');
  await new Promise(r=>setImmediate(r));
  later.destroy(); resolveRequest({ok:true,enabled:true,ready:true,sourceHash:'b'.repeat(64)});
  await assert.rejects(pending,/client_destroyed/);
  assert.equal(afterLogout.length,0);
  const disabledCalls=[];
  const disabled=createInterviewAI({request:async(_,body)=>{
    disabledCalls.push(body.action);return {ok:true,enabled:false,ready:true};
  }});
  await disabled.generate('self_intro');
  assert.deepEqual(disabledCalls,['prepare'],'ready alone cannot enable a disabled server');
  disabled.destroy();
  const failedSaveCalls=[];
  const failedSave=createInterviewAI({request:async(_,body)=>{failedSaveCalls.push(body.action);}});
  await assert.rejects(failedSave.generate('core30',{savePending:async()=>{throw Error('save_failed');}}),/save_failed/);
  assert.deepEqual(failedSaveCalls,[]);
  failedSave.destroy();
  // An older response must not replace a newly selected request (even the same ID).
  const reads=[],raceUpdates=[];
  const race=createInterviewAI({request:(_,body)=>new Promise(resolve=>reads.push({body,resolve})),onUpdate:x=>raceUpdates.push(x)});
  const oldPoll=race.resume('same-id'),newPoll=race.resume('same-id');
  reads[1].resolve({ok:true,items:[{status:'COMPLETED'}],version:'new'});await newPoll;
  reads[0].resolve({ok:true,items:[{status:'COMPLETED'}],version:'old'});await oldPoll;
  assert.deepEqual(raceUpdates.map(x=>x.version),['new']);
  const logoutPoll=race.resume('same-id');race.destroy();
  reads[2].resolve({ok:true,items:[{status:'COMPLETED'}],version:'logout'});await logoutPoll;
  assert.equal(raceUpdates.length,1);race.destroy();
  // Real Chrome timer wrappers require Window as receiver (an injected fake clock
  // does not expose this regression).
  const nativeSet=globalThis.setTimeout,nativeClear=globalThis.clearTimeout;
  let setCalls=0,clearCalls=0;
  globalThis.setTimeout=function(){assert.equal(this,globalThis);setCalls++;return 99;};
  globalThis.clearTimeout=function(){assert.equal(this,globalThis);clearCalls++;};
  try{
    const binding=createInterviewAI({request:async()=>({ok:true,items:[{status:'PROCESSING'}]})});
    await binding.resume('timer-binding');binding.pause();binding.destroy();
    assert.equal(setCalls,1);assert(clearCalls>=3);
  }finally{globalThis.setTimeout=nativeSet;globalThis.clearTimeout=nativeClear;}
  console.log('PASS button save ordering, double click, regeneration retry key, selected retry, logout isolation');
})().catch(e=>{console.error(e);process.exitCode=1;});
