'use strict';
const assert=require('node:assert/strict'),{test}=require('node:test'),{randomUUID}=require('node:crypto');
const {createHandler,validate}=require('../api/interview-practice-records');
const {createStorage,objectKey}=require('../lib/interview-practice-storage');
const runId=randomUUID(),hash='a'.repeat(64);
const turn={number:1,question_id:'q1',question:'질문',answer:'',duration:1,audio_bytes:32044,audio_hash:hash,uploaded:false};
const payload={action:'sync',runId,mode:'job',track:'공채',fieldId:'law',fieldLabel:'법규',region:'서해',recordedAt:new Date().toISOString(),questionCount:1,completed:true,finished:true,
 turns:[{number:1,questionId:'q1',question:'질문',answer:'',duration:1,audioBytes:32044,audioHash:hash}]};
async function api(handler,body,headers={}){let code,out;await handler({method:'POST',headers:{host:'app.test',origin:'https://app.test',...headers},body},{setHeader(){},status(c){code=c;return this;},json(v){out=v;}});return {code,out};}
function setup(overrides={}){
 const calls=[];const deps={authenticateWeb:async()=>({id:'student-a'}),authenticateAdmin:async()=>({id:'admin'}),
 invoke:async(action,actor,body)=>{calls.push({action,actor,body});return {ok:true,run:{id:runId,student_id:'student-a'},turns:[turn]};},
 transcription:async()=>({ok:true,jobs:[],summaries:[]}),
 storage:{upload:async()=> 'https://test.supabase.co/storage/v1/object/upload/sign/interview-practice/x?token=fake',verify:async()=>{},signed:async()=> 'signed-audio'},...overrides};
 return {calls,deps,handler:createHandler(deps)};
}
test('sync binds identity to login and returns every pending answer without invoking AI',async()=>{
 const h=setup();const r=await api(h.handler,payload);assert.equal(r.code,200);assert.equal(r.out.uploads.length,1);
 assert.deepEqual(h.calls.map(c=>c.action),['sync']);assert.deepEqual(h.calls[0].actor,{type:'student',id:'student-a'});
 assert.equal((await api(h.handler,{...payload,studentId:'victim'})).code,400);
 assert.equal((await api(setup({authenticateWeb:async()=>null}).handler,payload)).code,401);
 assert.equal((await api(h.handler,payload,{origin:'https://evil.test'})).code,403);
});
test('production native practice tokens cannot sync or commit another mode',async()=>{
 const h=setup({authenticateWeb:async()=>null,authenticateNative:async()=>({id:'student-a',practiceMode:'personality'}),requirePracticeAccess:async()=>{}});
 assert.equal((await api(h.handler,payload)).code,403);assert.equal(h.calls.length,0);
 assert.equal((await api(h.handler,{action:'uploaded',runId,number:1,audioHash:hash})).code,403);assert.deepEqual(h.calls.map(c=>c.action),['get']);
});
test('rejects invalid dates, duplicate turns, excess audio, forged object paths and missing turn identity',()=>{
 for(const bad of [{recordedAt:'bad'},{turns:[payload.turns[0],payload.turns[0]]},{turns:[{...payload.turns[0],audioBytes:16777217}]},{turns:[{...payload.turns[0],number:2}]},{turns:[{...payload.turns[0],objectKey:'victim/1.wav'}]}])assert.throws(()=>validate({...payload,...bad}),/invalid_request/);
 assert.throws(()=>validate({action:'uploaded',runId,audioHash:hash}),/invalid_request/);
});
test('upload commit checks owned turn and actual object before marking ready',async()=>{
 let verified=0;const h=setup({storage:{verify:async(id,t)=>{assert.equal(id,runId);assert.equal(t.audio_hash,hash);verified++;}}});
 assert.equal((await api(h.handler,{action:'uploaded',runId,number:1,audioHash:hash})).code,200);
 assert.equal(verified,1);assert.deepEqual(h.calls.map(c=>c.action),['get','uploaded']);
 const failing=setup({storage:{verify:async()=>{throw Error('missing');}}});
 assert.equal((await api(failing.handler,{action:'uploaded',runId,number:1,audioHash:hash})).code,503);
 assert.deepEqual(failing.calls.map(c=>c.action),['get']);
});
test('only an authorized admin can request a ready answer playback URL',async()=>{
 const denied=setup({authenticateAdmin:async()=>{throw Error('forbidden');}});
 assert.equal((await api(denied.handler,{action:'admin_get',runId})).code,403);assert.equal(denied.calls.length,0);
 const waiting=setup();assert.equal((await api(waiting.handler,{action:'admin_audio',runId,number:1})).code,404);
 const ready=setup({invoke:async()=>({ok:true,turns:[{...turn,uploaded:true}]})});
 assert.equal((await api(ready.handler,{action:'admin_audio',runId,number:1})).out.url,'signed-audio');
});
test('private storage signs exact keys, verifies size and limits playback link lifetime',async()=>{
 const calls=[];const storage=createStorage({url:'https://test.supabase.co',key:'server-only',fetchImpl:async(url,options)=>{
  calls.push({url,options});return {ok:true,headers:new Headers({'content-length':'32044'}),json:async()=>url.includes('/upload/sign/')?{url:'/object/upload/sign/interview-practice/'+objectKey(runId,turn)+'?token=fake'}:{signedURL:'/object/sign/interview-practice/'+objectKey(runId,turn)+'?token=fake'}};
 }});
 const url=await storage.upload(runId,turn);assert(url.startsWith('https://test.supabase.co/storage/v1/object/upload/sign/interview-practice/'));
 await storage.verify(runId,turn);await storage.signed(runId,turn);
 assert.equal(calls[1].options.method,'HEAD');assert.equal(JSON.parse(calls[2].options.body).expiresIn,300);
 assert.throws(()=>objectKey('../other',turn),/invalid_request/);
 await assert.rejects(storage.verify(runId,{...turn,audio_bytes:999}),/recording_unavailable/);
});
test('authenticated ordinary students are rejected by the pilot gate before archive or storage work',async()=>{
 const h=setup({requirePracticeAccess:async id=>{assert.equal(id,'student-a');throw Error('forbidden');}});
 assert.equal((await api(h.handler,payload)).code,403);assert.equal(h.calls.length,0);
});
test('device login requires a preview account and authenticated matching device identity',async()=>{
 const h=setup({authenticateWeb:async()=>null,previewAllowed:id=>id==='student-a',authenticateDevice:async b=>b.deviceToken==='valid'?{id:'student-a'}:null,requirePracticeAccess:async()=>{}});
 assert.equal((await api(h.handler,{...payload,studentId:'student-a',deviceToken:'valid'})).code,200);
 assert.equal((await api(h.handler,{...payload,studentId:'student-a',deviceToken:'wrong'})).code,401);
 assert.equal((await api(h.handler,{...payload,studentId:'other',deviceToken:'valid'})).code,403);
});
test('web compressed formats have fixed storage extensions and reject arbitrary MIME',()=>{
 for(const [audio_mime,extension] of [['audio/mp4','m4a'],['audio/webm','webm'],['audio/ogg','ogg']])assert(objectKey(runId,{...turn,audio_mime}).endsWith('.'+extension));
 assert.throws(()=>validate({...payload,turns:[{...payload.turns[0],audioMime:'text/html'}]}),/invalid_request/);
});

test('admin transcription views merge only matching turn results, without invoking ASR',async()=>{
 const actions=[];const h=setup({transcription:async(action,actor,body)=>{actions.push(action);assert.equal(actor.type,'admin');assert.equal(body.runId,runId);return {ok:true,jobs:[{number:1,status:'completed',transcript:'아니다'}]};}});
 const r=await api(h.handler,{action:'admin_get',runId});assert.equal(r.code,200);assert.equal(r.out.turns[0].transcription.transcript,'아니다');assert.deepEqual(actions,['admin_get']);
});
test('transcription edits require write permission and bounded, versioned admin input',async()=>{
 const body={action:'admin_review',runId,number:1,revision:1,reviewStatus:'meaning',correctedText:'아니다',note:''};let writes=[];
 const h=setup({authenticateAdmin:async(_req,{write})=>{writes.push(write);if(write)throw Error('forbidden');return {id:'read-only'};}});
 assert.equal((await api(h.handler,body)).code,403);assert.deepEqual(writes,[true]);assert.equal(h.calls.length,0);
 for(const bad of [{revision:0},{reviewStatus:'graded'},{correctedText:''},{note:'x'.repeat(3001)},{studentId:'victim'}])assert.equal((await api(setup().handler,{...body,...bad})).code,400);
 const allowed=setup({transcription:async(action,actor,value)=>{assert.equal(action,'admin_review');assert.equal(actor.id,'admin');assert.equal(value.correctedText,'아니다');return {ok:true};}});
 assert.equal((await api(allowed.handler,body)).code,200);assert.equal(allowed.calls.length,0);
 assert.equal((await api(allowed.handler,{action:'complete',runId,number:1})).code,400);
});
