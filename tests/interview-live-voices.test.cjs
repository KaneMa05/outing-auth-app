'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createHandler,validate}=require('../api/interview-live');
const {read}=require('../lib/interview-live-ticket');
const {sessionConfig,TEST_INTERVIEWERS}=require('../lib/interview-live-policy');
const {createProvider}=require('../lib/interview-live-provider');
const {LiveEngine}=require('../lib/interview-live-engine');
const secret='s'.repeat(64),sdp='v=0 test';
test('test avatar identity is validated, signed and ordinary apps cannot change voices',async()=>{
 const requestKey=randomUUID();
 for(const invalid of ['other','__proto__','constructor',[],['interviewer-woman'],null,1])assert.throws(()=>validate({action:'start',requestKey,sdp,interviewer:invalid}),/invalid_request/);
 async function call(testApp,interviewer){let status,data;const handler=createHandler({config:{enabled:true,transport:'vercel',secret},authenticateWeb:async()=>({id:'test'}),requireMockAccess:async()=>{},invoke:async()=>({ready:true})});
 await handler({method:'POST',headers:{host:'localhost',origin:'http://localhost',...(testApp?{'x-interview-test-app':'1'}:{})},body:{action:'start',requestKey,sdp,...(interviewer?{interviewer}:{})}},{setHeader(){},status(n){status=n;return this;},json(v){data=v;}});return {status,data};}
 for(const interviewer of Object.keys(TEST_INTERVIEWERS)){
  const result=await call(true,interviewer);assert.equal(result.status,200);assert.equal(read(result.data.ticket,sdp,secret).actor.interviewer,interviewer);
  assert.equal((await call(false,interviewer)).status,403);
 }
 const ordinary=await call(false);assert.equal(ordinary.status,200);assert.equal(read(ordinary.data.ticket,sdp,secret).actor.interviewer,undefined);
});
test('engine selects a server-owned voice from signed test identity only',async()=>{
 for(const actor of [{id:'t',testApp:true,interviewer:'interviewer-woman'},{id:'t',testApp:true,interviewer:'interviewer-man-1'},{id:'t',testApp:true,interviewer:'interviewer-man-2'},{id:'t',interviewer:'interviewer-man-1'}]){
  let selected;const engine=new LiveEngine({invoke:async()=>({run:{id:randomUUID(),questions:[{id:'q',prompt:'test'}]}}),provider:{create:async(_sdp,voice)=>{selected=voice;throw Error('stop_before_paid_call');}},recorder:()=>({}),cleanup:()=>{}});
  engine.finish=async()=>{};
  await assert.rejects(engine.start(actor,{sdp,interviewer:'interviewer-woman'}),/stop_before_paid_call/);
  assert.equal(selected,actor.testApp?TEST_INTERVIEWERS[actor.interviewer]:'noeul');
 }
});
test('provider passes the selected voice without changing Korean interviewer instructions',async()=>{
 const seen=[];const provider=createProvider({key:'fake',fetchImpl:async(_url,options)=>{seen.push(JSON.parse(options.body));return {ok:true,json:async()=>({session:{id:'live_test'},transport:{sdp:'answer'}})}}});
 await provider.create(sdp,'meridian');await provider.create(sdp,'noeul');
 assert.deepEqual(seen.map(x=>x.session.audio.output.voice),['meridian','noeul']);
 assert(seen.every(x=>x.session.instructions.includes('Speak Korean')));
 assert.equal(sessionConfig().audio.output.voice,'noeul');assert.throws(()=>sessionConfig({voice:'arbitrary'}),/invalid_request/);
});
