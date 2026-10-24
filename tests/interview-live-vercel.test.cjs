'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),http=require('node:http'),{randomUUID}=require('node:crypto'),{once}=require('node:events');
const WebSocket=require('ws');
const {issue,read}=require('../lib/interview-live-ticket');
const {createCloudStorage,createCloudRecorder,CHUNK}=require('../lib/interview-live-cloud-storage');
const {createHandler,configuration}=require('../api/interview-live');
const {attach}=require('../lib/interview-live-socket');
const {LiveEngine,SERVER}=require('../lib/interview-live-engine');
const {cleanup,authorized}=require('../api/interview-live-cleanup');
const {createDb}=require('./helpers/interview-db.cjs');
const actor={type:'student',id:'ip-a'},secret='s'.repeat(64);
function storageFixture(){
 const objects=new Map();let fail=false;
 const store=createCloudStorage({url:'https://example.supabase.co',key:'fake-key',fetchImpl:async(url,options)=>{
  if(fail)return new Response('{}',{status:503});
  const route=new URL(url).pathname.replace('/storage/v1','');
  if(route.startsWith('/object/list/')){const {prefix}=JSON.parse(options.body);return Response.json([...objects.keys()].filter(k=>k.startsWith(prefix)).map(k=>({name:k.slice(prefix.length)})));}
  if(options.method==='DELETE'){for(const key of JSON.parse(options.body).prefixes)objects.delete(key);return Response.json({});}
  const key=route.replace(/^\/object\/(authenticated\/)?interview-live\//,'');
  if(options.method==='POST'){objects.set(key,Buffer.from(options.body));return Response.json({});}
  return objects.has(key)?new Response(objects.get(key)):new Response('{}',{status:404});
 }});return {store,objects,fail(value){fail=value;}};
}
async function call(handler,body){let status,data;await handler({method:'POST',headers:{host:'localhost',origin:'http://localhost'},body},{setHeader(){},status(n){status=n;return this;},json(d){data=d;}});return {status,data};}
(async()=>{
 const requestKey=randomUUID(),sdp='v=0 test',ticket=issue(actor,requestKey,sdp,secret,1000);
 assert.equal(read(ticket,sdp,secret,2000).actor.id,actor.id);
 for(const fn of [()=>read(ticket,sdp+'x',secret,2000),()=>read(ticket,sdp,secret,32000),()=>read(ticket+'x',sdp,secret,2000)])assert.throws(fn,/unauthorized/);
 const env={INTERVIEW_LIVE_TRANSPORT:'vercel',INTERVIEW_LIVE_WORKER_SECRET:secret,INTERVIEW_LIVE_ENABLED:'true',OPENAI_API_KEY:'test-key',INTERVIEW_LIVE_FOLLOWUP_MODEL:'test-model',SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test-key',CRON_SECRET:'c'.repeat(64),INTERVIEW_LIVE_RUNTIME_SECONDS:'800'};
 assert(configuration(env).enabled);assert(!configuration({...env,INTERVIEW_LIVE_RUNTIME_SECONDS:'300'}).enabled);
 const handler=createHandler({config:configuration(env),authenticateWeb:async()=>actor,invoke:async()=>({ok:true,ready:true})});
 const issued=await call(handler,{action:'start',requestKey,sdp,studentId:'spoof'});assert.equal(issued.status,200);assert.equal(read(issued.data.ticket,sdp,secret).actor.id,actor.id);assert.equal(issued.data.url,'/api/interview-live-socket');assert(!JSON.stringify(issued.data).includes('test-key'));
 assert.equal((await call(handler,{action:'begin',runId:randomUUID()})).status,409);
 const f=storageFixture(),id=randomUUID(),rec=createCloudRecorder(f.store,id);
 const pcm=Buffer.alloc(CHUNK+480,7);rec.append('input',pcm.toString('base64'));rec.append('output',Buffer.alloc(480,9).toString('base64'),1000);
 await rec.flush();assert(f.objects.has(id+'/input-000.wav'));assert(f.objects.has(id+'/input-001.wav'));assert(!f.objects.has(id+'/input.wav'));
 assert(await f.store.recover(id));assert((await f.store.get(id,'input.wav')).equals(pcm));const output=await f.store.get(id,'output.wav');assert.equal(output.length,48480);assert(output.subarray(0,48000).every(x=>x===0));
 await f.store.remove(id);assert.equal(f.objects.size,0);
 const id2=randomUUID(),rec2=createCloudRecorder(f.store,id2);rec2.append('input',Buffer.alloc(480,1).toString('base64'));f.fail(true);await assert.rejects(rec2.flush(),/recording_unavailable/);f.fail(false);await rec2.finalize();assert(f.objects.has(id2+'/input.wav'));assert(!f.objects.has(id2+'/input-000.wav'));
 const id3=randomUUID(),rec3=createCloudRecorder(f.store,id3);rec3.append('input',pcm.toString('base64'));await rec3.flush();f.objects.delete(id3+'/input-000.wav');await assert.rejects(f.store.recover(id3),/incomplete_recording/);
 assert(!authorized({headers:{}},undefined));assert(authorized({headers:{authorization:'Bearer '+env.CRON_SECRET}},env.CRON_SECRET));
 const events=[];const expired={id:randomUUID(),state:'unknown',provider_id:null,retain_until:'2000-01-01',recording_state:'pending'};
 await cleanup({invoke:async(action,a,b)=>{events.push(action);return action==='sweep'?{runs:[expired]}:{ok:true};},provider:{closeSession:async()=>assert.fail('No guessed provider ID')},storage:{remove:async()=>events.push('remove')},now:()=>Date.now()});assert.deepEqual(events,['sweep','remove','purge']);
 const {db,invoke:prep}=await createDb();let server,wss,control;
 try{
  await db.exec(fs.readFileSync('supabase/migrations/20261021060740_interview_live_sessions.sql','utf8'));
  await prep('admin_member_save',{type:'admin',id:'qa'},{targetStudentId:'ip-a',track:'공채',examNumber:'QA',enabled:true,expiresOn:'2099-12-01'});await prep('admin_enabled',{type:'admin',id:'qa'},{enabled:true});
  await db.exec("insert into ip_questions(id,prompt,category,status) values('ws1','협업 경험은?','personality','published'),('ws2','지원 동기는?','personality','published'),('ws3','갈등 해결은?','personality','published')");
  const invoke=async(action,actor,body={})=>(await db.query('select ip_live_service($1,$2::jsonb,$3::jsonb) result',[action,JSON.stringify(actor),JSON.stringify(body)])).rows[0].result;
  let current,event,created=0,stopped=0;const cloud=storageFixture();
  function createRuntime(){const recorders=new Map();const engine=new LiveEngine({invoke,spool:'',recorder:(_root,id)=>{const r=createCloudRecorder(cloud.store,id);recorders.set(id,r);return r;},cleanup:(_root,id)=>recorders.delete(id),storage:{signed:async()=>({input:'signed-input',output:'signed-output'}),upload:async id=>recorders.get(id).finalize()},provider:{create:async()=>{created++;return {id:'live_test',sdp:'answer'};},attach:async(id,callback)=>{event=callback;return {send:e=>{if(e.type==='session.close')callback({type:'session.closed'});},destroy(){}};},closeSession:async()=>true,followup:async()=>({turnComplete:true,ask:false,question:'',evidence:''})}});return current={engine,recorders};}
  server=http.createServer();wss=attach(server,{env,createRuntime});server.listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port;
  class Socket extends WebSocket{constructor(url){super(url,{origin});}}
  let peer;class Peer{constructor(){peer=this;this.iceGatheringState='complete';}addTrack(){}createDataChannel(){return this.channel={readyState:'open',send(){},close(){}};}async createOffer(){return {type:'offer',sdp};}async setLocalDescription(d){this.localDescription=d;}async setRemoteDescription(){this.channel.onmessage({data:JSON.stringify({type:'session.started'})});}close(){}}
  const context={URL,location:{origin},setTimeout,clearTimeout,Date,crypto:require('node:crypto').webcrypto,AbortController};vm.createContext(context);vm.runInContext(fs.readFileSync('client/interview-live-client.js','utf8').replace('export async function connectLive','async function connectLive')+'\nglobalThis.connectLive=connectLive;',context);
  const httpHandler=createHandler({config:configuration(env),authenticateWeb:async()=>actor,invoke});
  let startPayload;
  control=await context.connectLive({request:async(action,payload)=>{if(action==='start')startPayload=payload;const r=await call(httpHandler,{...payload,action});if(r.status!==200)throw Error(r.data.error);return r.data;},audio:{pause(){},play:async()=>{},srcObject:null},onEvent(){},onFailure(){},Socket,Peer,mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop(){stopped++;}}]})}});
  assert.equal(created,1);assert(current.engine.sessions.get(control.runId).started);
  event({type:'session.input_audio.append',audio:Buffer.alloc(480,2).toString('base64')});event({type:'session.input_transcript.delta',delta:'실제 시험이 아닌 합성 테스트 답변'});
  const heartbeat=await control.request('heartbeat',{runId:control.runId});assert.equal(heartbeat.run.student_id,'ip-a');
  const runId=control.runId;await control.stop();control=null;assert(stopped>0);const saved=await invoke('get',actor,{runId});assert.equal(saved.run.state,'interrupted');assert.equal(saved.run.recording_state,'ready');assert.equal(saved.run.turns[0].grade,null);assert(cloud.objects.has(runId+'/input.wav'));
  // Reusing a valid ticket cannot create another paid session after completion.
  const retry=new Socket(origin.replace('http:','ws:')+'/api/interview-live-socket');await once(retry,'open');
  const reply=once(retry,'message');retry.send(JSON.stringify({id:1,ticket:issue(actor,startPayload.requestKey,sdp,secret),body:{...startPayload,action:'start'}}));
  assert.equal(JSON.parse(String((await reply)[0])).error,'unsafe_retry');assert.equal(created,1);retry.close();
  const denied=new WebSocket(origin.replace('http:','ws:')+'/api/interview-live-socket',{origin:'https://wrong-origin.example'});
  denied.on('error',()=>{});const rejected=await new Promise(resolve=>denied.on('unexpected-response',(_req,res)=>{res.resume();resolve(res.statusCode);denied.terminate();}));assert.equal(rejected,403);
  // Lost owner: cleanup builds playable files from previously durable pieces.
  const recoveryId=randomUUID(),recoverRec=createCloudRecorder(cloud.store,recoveryId);recoverRec.append('input',Buffer.alloc(480,3).toString('base64'));await recoverRec.flush();
  await db.query("insert into ip_live_runs(id,student_id,request_key,questions,state,provider_id,heartbeat_at,retain_until) values($1,'ip-a',$2,'[]','active','live_lost',now()-interval '2 minutes',now()+interval '1 day')",[recoveryId,randomUUID()]);
  const cleaned=await cleanup({invoke,provider:{closeSession:async()=>true},storage:cloud.store});assert(cleaned.ok);const recovered=(await invoke('get',actor,{runId:recoveryId})).run;assert.equal(recovered.recording_state,'ready');assert(recovered.recording_partial);
  console.log('PASS Vercel ticket scope/replay safeguards, real local WebSocket + WebRTC lifecycle, private chunk recovery, storage failure, cleanup auth and expiration. No paid calls.');
 }finally{await control?.stop().catch(()=>{});for(const client of wss?.clients||[])client.terminate();wss?.close();if(server)await new Promise(r=>server.close(r));await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
