import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPracticeGateway} from '../client/interview-native-practice.mjs';
function harness(request=async(_url,body)=>({ok:true,accountId:'student-a',mode:body.mode}),onWebRecords){
 const sent=[],calls=[],target={webkit:{messageHandlers:{interviewPractice:{postMessage:body=>sent.push(body)}}}};
 const view=createPracticeGateway({accountId:'student-a',onWebRecords,request:async(...args)=>{calls.push(args);return request(...args);}},target);
 return {view,target,sent,calls};
}
test('ordinary authenticated request closure owns native bootstrap and archives; handoff contains no credentials',async()=>{
 const h=harness(),id=h.view.open('job');assert.deepEqual(Object.keys(h.sent[0]).sort(),['mode','sessionId']);
 assert.equal((await h.target.__ronparkPracticeRequest(id,{action:'practice_bootstrap',mode:'job'})).accountId,'student-a');
 await h.target.__ronparkPracticeRequest(id,{action:'sync',mode:'job'});await h.target.__ronparkPracticeRequest(id,{action:'uploaded'});
 assert.deepEqual(h.calls.map(c=>c[0]),['/api/interview-prep','/api/interview-practice-records','/api/interview-practice-records']);h.view.destroy();
});
test('native gateway rejects AI, administrator, alternate mode and foreign session requests before network access',async()=>{
 const h=harness(),id=h.view.open('personality');assert.throws(()=>h.view.open('ai'));assert.throws(()=>h.view.open('job'));
 for(const body of [{action:'submit',mode:'personality'},{action:'admin_get'},{action:'practice_bootstrap',mode:'job'},{action:'sync',mode:'job'}])await assert.rejects(h.target.__ronparkPracticeRequest(id,body));
 await assert.rejects(h.target.__ronparkPracticeRequest('other',{action:'uploaded'}));assert.equal(h.calls.length,0);h.view.destroy();
});
test('closing/destroying a native session revokes pending responses and a later session uses a new capability',async()=>{
 let resolve;const h=harness(()=>new Promise(r=>resolve=r)),id=h.view.open('job');const pending=h.target.__ronparkPracticeRequest(id,{action:'practice_bootstrap',mode:'job'});
 h.target.__ronparkPracticeClose(id);resolve({ok:true,accountId:'student-a',mode:'job'});await assert.rejects(pending,/expired/);
 const next=h.view.open('personality');assert.notEqual(next,id);await assert.rejects(h.target.__ronparkPracticeRequest(id,{action:'uploaded'}));h.view.destroy();assert.equal(h.target.__ronparkPracticeRequest,undefined);assert.equal(h.target.__ronparkPracticeClose,undefined);
});
test('account or mode changes never reach the native screen',async()=>{
 for(const result of [{ok:true,accountId:'other',mode:'job'},{ok:true,accountId:'student-a',mode:'personality'}]){const h=harness(async()=>result),id=h.view.open('job');await assert.rejects(h.target.__ronparkPracticeRequest(id,{action:'practice_bootstrap',mode:'job'}),/account_changed/);h.view.destroy();}
});

test('web history handoff closes only its current session and rejects pending replies',async()=>{
 let resolve;const modes=[],h=harness(()=>new Promise(r=>resolve=r),mode=>modes.push(mode));
 const id=h.view.open('job'),pending=h.target.__ronparkPracticeRequest(id,{action:'practice_bootstrap',mode:'job'});
 h.target.__ronparkPracticeWebRecords('foreign');assert.deepEqual(modes,[]);
 h.target.__ronparkPracticeWebRecords(id);h.target.__ronparkPracticeWebRecords(id);assert.deepEqual(modes,['job']);
 resolve({ok:true,accountId:'student-a',mode:'job'});await assert.rejects(pending,/expired/);
 await assert.rejects(h.target.__ronparkPracticeRequest(id,{action:'uploaded'}),/expired/);
 const next=h.view.open('personality');assert.notEqual(next,id);h.view.destroy();assert.equal(h.target.__ronparkPracticeWebRecords,undefined);
});

test('native captions use the authenticated archive path and reject a different record mode',async()=>{
 const h=harness(async()=>({ok:true,mode:'job',captions:[]})),id=h.view.open('job');
 await h.target.__ronparkPracticeRequest(id,{action:'captions',runId:'owned'});
 assert.equal(h.calls[0][0],'/api/interview-practice-records');h.view.destroy();
 const foreign=harness(async()=>({ok:true,mode:'personality',captions:[]})),session=foreign.view.open('job');
 await assert.rejects(foreign.target.__ronparkPracticeRequest(session,{action:'captions',runId:'other-mode'}),/mode_changed/);foreign.view.destroy();
});

test('native caption edits require the active session mode and cannot invoke admin review',async()=>{
 const h=harness(async()=>({ok:true,mode:'job'})),id=h.view.open('job');
 await h.target.__ronparkPracticeRequest(id,{action:'caption_update',mode:'job',runId:'owned',number:1,studentRevision:0,text:'수정'});
 await assert.rejects(h.target.__ronparkPracticeRequest(id,{action:'caption_update',mode:'personality'}),/mode_changed/);
 await assert.rejects(h.target.__ronparkPracticeRequest(id,{action:'admin_review',mode:'job'}),/forbidden/);
 assert.equal(h.calls.length,1);h.view.destroy();
});
