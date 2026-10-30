import test from 'node:test';
import assert from 'node:assert/strict';
import {createAttempts} from '../client/interview-attempts/core.mjs';
import {recordAttempt} from '../client/interview-attempts/recorder.mjs';
function fixture() {
 const records = new Map(), chunks = new Map(); let seq = 0;
 const store = {
 async create(r) { records.set(r.id, structuredClone(r)); chunks.set(r.id, []); },
 async get(id) { return structuredClone(records.get(id)); },
 async list(owner) { return [...records.values()].filter(r => r.accountId === owner); },
 async update(r) { records.set(r.id, structuredClone(r)); },
 async append(r,b,index) { assert.equal(index, chunks.get(r.id).length); chunks.get(r.id).push(b); records.set(r.id, structuredClone(r)); },
 async chunks(id) { return chunks.get(id); },
 async remove(id) { records.delete(id); chunks.delete(id); }
 };
 const attempts = createAttempts({store, uuid: () => `attempt-${++seq}`});
 const start = mode => attempts.start({accountId:'student-a', mode, questions:[{id:'q1',prompt:'질문'}]});
 return {attempts,start,store};
}
test('three modes preserve question snapshot and never create grades', async () => {
 const {attempts,start} = fixture();
 for (const mode of ['job','personality','ai']) { const r=await start(mode); assert.equal(r.mode,mode); assert.equal(r.grade,null); r.questions[0].prompt='changed'; assert.equal((await attempts.get('student-a',r.id)).questions[0].prompt,'질문'); }
});
test('serialized chunks precede finish; closed attempt rejects further writes', async () => {
 const {attempts,start}=fixture(), r=await start('job');
 await Promise.all([attempts.append('student-a',r.id,new Blob(['first'],{type:'audio/webm'})),attempts.append('student-a',r.id,new Blob(['last'],{type:'audio/webm'})),attempts.finish('student-a',r.id)]);
 assert.equal(await (await attempts.audio('student-a',r.id)).text(),'firstlast');
 assert.equal((await attempts.get('student-a',r.id)).chunks,2);
 await assert.rejects(attempts.append('student-a',r.id,new Blob(['x'],{type:'audio/webm'})),/closed/);
});
test('ownership checks, interrupted recovery and deletion',async()=>{
 const {attempts,start}=fixture(),r=await start('personality');
 await assert.rejects(attempts.get('student-b',r.id),/not_found/);
 await assert.rejects(attempts.remove('student-b',r.id),/not_found/);
 assert.equal((await attempts.list('student-b')).length,0);
 assert.equal((await attempts.finish('student-a',r.id,{interrupted:true})).state,'interrupted');
 await attempts.remove('student-a',r.id); await assert.rejects(attempts.get('student-a',r.id));
});
test('failed chunk leaves metadata unchanged and allows interruption',async()=>{
 const {attempts,start,store}=fixture(),r=await start('ai');
 store.append=async()=>{throw Error('quota');};
 await assert.rejects(attempts.append('student-a',r.id,new Blob(['x'],{type:'audio/webm'})),/quota/);
 assert.equal((await attempts.get('student-a',r.id)).bytes,0);
 assert.equal((await attempts.finish('student-a',r.id,{interrupted:true})).state,'interrupted');
});
test('recorder waits for final chunk, persists then releases microphone',async()=>{
 const {attempts,start}=fixture(),r=await start('job'); let released=false;
 class Recorder { static isTypeSupported(){return true;} state='inactive'; start(){this.state='recording';} stop(){this.state='inactive'; queueMicrotask(()=>{this.ondataavailable({data:new Blob(['final'],{type:'audio/webm;codecs=opus'})});this.onstop();});} }
 const recording=recordAttempt({attempts,accountId:'student-a',id:r.id,stream:{getTracks:()=>[{stop(){released=true;}}]},MediaRecorder:Recorder});
 assert.equal((await recording.stop()).state,'recorded');assert.ok(released);assert.equal(await (await attempts.audio('student-a',r.id)).text(),'final');
});
test('unsupported recorder releases supplied microphone tracks',()=>{
 let released=false;
 assert.throws(()=>recordAttempt({stream:{getTracks:()=>[{stop(){released=true;}}]},MediaRecorder:{isTypeSupported:()=>false}}),/unsupported/);assert.ok(released);
});
test('recorder storage failure interrupts and releases microphone',async()=>{
 const {attempts,start,store}=fixture(),r=await start('ai');let released=false;
 store.append=async()=>{throw Error('quota');};
 class Recorder {static isTypeSupported(){return true;}state='inactive';start(){this.state='recording';}stop(){this.state='inactive';queueMicrotask(()=>{this.ondataavailable({data:new Blob(['final'],{type:'audio/webm;codecs=opus'})});this.onstop();});}}
 const recorder=recordAttempt({attempts,accountId:'student-a',id:r.id,stream:{getTracks:()=>[{stop(){released=true;}}]},MediaRecorder:Recorder});
 await assert.rejects(recorder.stop(),/quota/);assert.ok(released);assert.equal((await attempts.get('student-a',r.id)).state,'interrupted');
});
test('empty recorder output is interrupted rather than reported as a successful recording',async()=>{
 const {attempts,start}=fixture(),r=await start('job');
 class Recorder {static isTypeSupported(){return true;}state='inactive';start(){this.state='recording';}stop(){this.state='inactive';queueMicrotask(()=>this.onstop());}}
 const recording=recordAttempt({attempts,accountId:'student-a',id:r.id,stream:{getTracks:()=>[{stop(){}}]},MediaRecorder:Recorder});
 await assert.rejects(recording.stop(),/empty_recording/);assert.equal((await attempts.get('student-a',r.id)).state,'interrupted');
});
