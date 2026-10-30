'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
async function harness({microphone,requestOverride,waitReady=true,submitError=false,report=null,seedJob=false}={}){
 const {audioBase64}=await import('../client/interview-job-exam-audio.mjs');
 const {createAttempts}=await import('../client/interview-attempts/core.mjs'),{withAttemptLease,recoverAttempts}=await import('../client/interview-attempts/recovery.mjs');
 const nodes=new Map(),host={innerHTML:'',querySelector(s){if(!nodes.has(s))nodes.set(s,{textContent:'',value:'q1'});return nodes.get(s);}};
 const records=new Map(),chunks=new Map();let closed=false,released=0,starts=0;
 const store={create:async r=>{records.set(r.id,structuredClone(r));chunks.set(r.id,[]);},get:async id=>structuredClone(records.get(id)),list:async owner=>[...records.values()].filter(r=>r.accountId===owner),append:async(r,b)=>{records.set(r.id,structuredClone(r));chunks.get(r.id).push(b);},update:async r=>records.set(r.id,structuredClone(r)),chunks:async id=>chunks.get(id)||[],remove:async id=>{records.delete(id);chunks.delete(id);},close(){closed=true;}};
 if(seedJob)records.set('job-preserved',{id:'job-preserved',accountId:'a',mode:'job',state:'recording',questions:[{id:'job',prompt:'기존 전공 녹음'}],createdAt:0,chunks:0,bytes:0});
 const locks={request:async(_,__,fn)=>fn({})},stream={getTracks:()=>[{stop(){released++;}}]};
 let run={id:'17fd429e-5298-4a4b-9384-82c24047e4f0',question:{id:'q1',prompt:'가상 질문'},state:'started',retainUntil:'2099-01-01',deadline:'2099-01-01'};
 const request=async(action,b)=>{
  if(requestOverride)return requestOverride(action,b);
  if(action==='status')return {ready:true};if(action==='questions')return {questions:[{id:'q1',prompt:'가상 질문'}]};if(action==='list')return {runs:[]};
  if(action==='start'){starts++;return {run};}if(action==='get')return {run};if(action==='cancel')return {ok:true};if(action==='submit'){if(submitError)throw Error('network');run={...run,state:'completed',report};return {run};}throw Error(action);
 };
 const context={Blob,URL,crypto:require('node:crypto').webcrypto,console,audioBase64,createAttempts,withAttemptLease,recoverAttempts,window:{addEventListener(){},removeEventListener(){}},setInterval:()=>1,clearInterval(){},confirm:()=>true};vm.createContext(context);
 vm.runInContext(fs.readFileSync('client/interview-personality.mjs','utf8').replace(/^import .*\n/gm,'').replaceAll('export ',''),context);
 const view=context.mountPersonalityPractice(host,{request,accountId:'a',mediaDevices:{getUserMedia:microphone||(async()=>stream)},openStore:async()=>store,openPrepared:async()=>({get:async()=>undefined,put:async(a,id,b)=>b,remove:async()=>{},close(){}}),locks,createRecorder:({attempts,accountId,id})=>({stop:async()=>{await attempts.append(accountId,id,new Blob(['test'],{type:'audio/webm'}));return attempts.finish(accountId,id);},interrupt:async()=>attempts.finish(accountId,id,{interrupted:true})}),convert:async b=>b});
 if(waitReady)await view.ready;
 const click=action=>host.onclick({target:{closest:()=>({disabled:false,dataset:{personalityAction:action}})},stopPropagation(){}});
 return {host,view,click,stream,get released(){return released;},get starts(){return starts;},get closed(){return closed;},records};
}
test('microphone permission resolving after leaving releases capture and never starts a personality practice',async()=>{
 const microphone=deferred(),h=await harness({microphone:()=>microphone.promise});const starting=h.click('start');assert.equal(h.view.canLeave(),false);h.view.destroy();microphone.resolve(h.stream);await starting;
 assert.equal(h.starts,0);assert.ok(h.released>0);
});
test('recording blocks navigation; stop preserves the local answer and releases the lease',async()=>{
 const h=await harness();await h.click('start');assert.equal(h.view.canLeave(),false);assert.equal(h.starts,1);
 await h.click('stop');assert.equal(h.view.canLeave(),true);assert.equal([...h.records.values()][0].state,'recorded');assert.ok(h.released>0);assert.match(h.host.innerHTML,/답변 제출/);h.view.destroy();
});
test('late initial responses cannot reopen a destroyed student screen',async()=>{
 const status=deferred();const h=await harness({waitReady:false,requestOverride:async action=>action==='status'?status.promise:action==='list'?{runs:[]}:Promise.reject(Error('unexpected'))});
 const before=h.host.innerHTML;h.view.destroy();status.resolve({ready:true});await new Promise(resolve=>setImmediate(resolve));assert.equal(h.host.innerHTML,before);
});

test('submission failure keeps the locally recorded answer available',async()=>{
 const h=await harness({submitError:true});await h.click('start');await h.click('stop');await h.click('submit');
 assert.equal([...h.records.values()][0].state,'recorded');assert.match(h.host.innerHTML,/기기 녹음은 보존/);assert.equal(h.view.canLeave(),true);h.view.destroy();
});
test('destroy during recording releases capture and records an interruption before closing storage',async()=>{
 const h=await harness();await h.click('start');h.view.destroy();await new Promise(resolve=>setImmediate(resolve));
 assert.equal([...h.records.values()][0].state,'interrupted');assert.ok(h.released>0);assert.equal(h.closed,true);
});

test('personality report displays four structures without a score and escapes model text',async()=>{
 const {analysis,transcript}=require('./helpers/interview-personality-fixture.cjs');const value=require('../lib/interview-personality-analysis.cjs').validateAnalysis(analysis(),transcript);value.summary='<img src=x onerror=alert(1)>';
 const h=await harness({report:{analysis:value,transcripts:[transcript],grade:null,score:null}});await h.click('start');await h.click('stop');await h.click('submit');
 assert.match(h.host.innerHTML,/결론/);assert.match(h.host.innerHTML,/이유/);assert.match(h.host.innerHTML,/경험/);assert.match(h.host.innerHTML,/마무리/);assert.ok(!h.host.innerHTML.includes('<img'));assert.match(h.host.innerHTML,/&lt;img/);assert.ok(!h.host.innerHTML.includes('제안 판정'));h.view.destroy();
});

test('opening personality practice never recovers or displays another mode local recording',async()=>{
 const h=await harness({seedJob:true});assert.equal(h.records.get('job-preserved').state,'recording');assert.ok(!h.host.innerHTML.includes('기존 전공 녹음'));h.view.destroy();
});
