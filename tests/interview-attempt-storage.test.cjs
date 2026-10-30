'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {createHash}=require('node:crypto');
const {createAttemptStorage,CHUNK_BYTES}=require('../lib/interview-attempt-storage.cjs');
const {createAttemptHandler}=require('../lib/interview-attempt-http.cjs');
async function fixture(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'attempt-storage-test-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));let clock=1000;const store=createAttemptStorage({root,now:()=>clock});const data=Buffer.alloc(CHUNK_BYTES+71,42),input={id:'test-attempt',mode:'job',state:'recorded',questions:[{id:'q',prompt:'질문'}],mimeType:'audio/webm',bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')};return {root,store,data,input,expire:()=>clock=5000};}
test('resumable chunk upload is idempotent, checks integrity and survives storage recreation',async t=>{
 const {root,store,data,input}=await fixture(t);await store.create('a',input,{retainUntil:4000});
 await assert.rejects(store.finalize('a',input.id),/incomplete/);
 await store.put('a',input.id,0,data.subarray(0,CHUNK_BYTES));await store.put('a',input.id,0,data.subarray(0,CHUNK_BYTES));
 await assert.rejects(store.put('a',input.id,0,Buffer.alloc(CHUNK_BYTES,3)),/conflict/);
 const restarted=createAttemptStorage({root,now:()=>1000});await restarted.put('a',input.id,1,data.subarray(CHUNK_BYTES));
 const done=await restarted.finalize('a',input.id);assert.equal(done.status,'stored');assert.equal(done.grade,null);assert.deepEqual((await restarted.audio('a',input.id)).data,data);
 assert.equal((await restarted.create('a',input,{retainUntil:4000})).status,'stored');
 await assert.rejects(restarted.create('a',{...input,mode:'ai'},{retainUntil:4000}),/conflict/);
});
test('account isolation, path rejection, expiration and physical deletion',async t=>{
 const {store,input,expire,root}=await fixture(t);await store.create('a',input,{retainUntil:4000});
 await assert.rejects(store.get('b',input.id),/not_found/);await assert.rejects(store.get('a','../escape'),/invalid_request/);
 expire();await assert.rejects(store.get('a',input.id),/expired/);assert.equal(await store.sweepExpired(),1);
 const ownerDir=(await fs.readdir(root))[0];assert.deepEqual(await fs.readdir(path.join(root,ownerDir)),[]);
});
test('invalid lengths and checksum never become stored',async t=>{
 const {store,input,data}=await fixture(t);await store.create('a',{...input,sha256:'0'.repeat(64)},{retainUntil:4000});
 await assert.rejects(store.put('a',input.id,0,Buffer.from('short')),/invalid_chunk/);
 await store.put('a',input.id,0,data.subarray(0,CHUNK_BYTES));await store.put('a',input.id,1,data.subarray(CHUNK_BYTES));
 await assert.rejects(store.finalize('a',input.id),/checksum/);assert.equal((await store.get('a',input.id)).status,'uploading');
});
test('HTTP requires exact origin, authenticated identity and server retention policy',async t=>{
 const {store,input}=await fixture(t);let actor={id:'a'};
 const handler=createAttemptHandler({storage:store,origin:'http://localhost:123',authenticate:async()=>actor,authorize:async()=>({retainUntil:4000})});
 async function call(body,headers={origin:'http://localhost:123',host:'localhost:123'}){const res={setHeader(){},writeHead(status){this.status=status;},end(data){this.data=JSON.parse(data);}};await handler({method:'POST',headers,body},res);return res;}
 assert.equal((await call({action:'create',attempt:input})).status,200);
 assert.equal((await call({action:'get',id:input.id},{origin:'http://evil',host:'localhost:123'})).status,403);
 actor=null;assert.equal((await call({action:'get',id:input.id})).status,401);
 actor={id:'b'};assert.equal((await call({action:'get',id:input.id})).status,404);
 assert.equal((await call({action:'get',id:input.id,accountId:'a'})).status,400);
});
