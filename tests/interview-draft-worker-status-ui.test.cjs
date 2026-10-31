'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const source=fs.readFileSync('interview-draft-worker-status.js','utf8');
let modulePromise;
const load=()=>modulePromise||=(import('data:text/javascript;base64,'+Buffer.from(source).toString('base64')));
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('status labels do not mistake assigned work or API failures for a live worker',async()=>{
 const {renderWorkerStatus}=await load();
 const data={enabled:true,lastSeenAt:'2026-10-31T06:00:00Z',connected:true,running:1,queued:2};
 assert.match(renderWorkerStatus(data),/질문 생성 중/);
 assert.match(renderWorkerStatus({...data,running:0}),/요청 대기 중/);
 assert.match(renderWorkerStatus({...data,connected:false}),/연결 확인 지연/);
 assert.match(renderWorkerStatus({...data,lastSeenAt:null,connected:false}),/연결 기록 없음/);
 assert.match(renderWorkerStatus({enabled:false}),/꺼져/);
 assert.doesNotMatch(renderWorkerStatus({...data,lastFailedAt:'<img onerror=x>'}),/<img/);
});
test('polling pauses when hidden, resumes when visible and ignores destroyed responses',async()=>{
 const {mountDraftWorkerStatus}=await load();
 let listener,next,cancelled=0,calls=0,resolve;
 const doc={hidden:false,addEventListener(name,fn){listener=fn;},removeEventListener(){listener=null;}};
 const host={innerHTML:''};
 const view=mountDraftWorkerStatus(host,{doc,request:async action=>{assert.equal(action,'admin_draft_worker_status');calls++;if(calls===3)return new Promise(r=>resolve=r);if(calls===2)throw Error('offline');return {enabled:true,connected:true,running:0,queued:0};},schedule(fn,ms){assert.equal(ms,10000);next=fn;return 1;},cancel(){cancelled++;}});
 await flush();assert.equal(calls,1);
 doc.hidden=true;listener();await next();assert.equal(calls,1);
 doc.hidden=false;listener();await flush();assert.equal(calls,2);assert.match(host.innerHTML,/상태를 확인하지 못했습니다/);
 const pending=next();view.destroy();const before=host.innerHTML;resolve({enabled:false});await pending;
 assert.equal(host.innerHTML,before);assert.equal(listener,null);assert(cancelled>0);
});
