'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {createDb}=require('./helpers/interview-db.cjs');
const {LiveEngine,SERVER}=require('../tools/interview-live-worker/engine.cjs');
const {createRecorder,removeSpool,wavHeader}=require('../tools/interview-live-worker/storage.cjs');
const {decision,sessionConfig,sign,verify}=require('../lib/interview-live-policy');
const {createHandler,validate}=require('../api/interview-live');
const {createProvider}=require('../tools/interview-live-worker/provider.cjs');
const migration='supabase/migrations/20261021060740_interview_live_sessions.sql';
const a={type:'student',id:'ip-a'},b={type:'student',id:'ip-b'},admin={type:'admin',id:'qa'};
async function api(handler,body){let code,out;await handler({method:'POST',headers:{host:'localhost',origin:'http://localhost'},body},{setHeader(){},status(c){code=c;return this;},json(v){out=v;}});return {code,out};}
(async()=>{
 assert.throws(()=>decision({turnComplete:true,ask:true,question:'무엇을 하셨나요?',evidence:'없는 발언'},'실제 답변'),/invalid_evidence/);
 assert.equal(decision({turnComplete:false,ask:true,question:'무엇인가요?',evidence:'실제'},'실제 답변').ask,false);
 assert.deepEqual(sessionConfig().client.data_channel.allowed_client_events,['session.close']);
 assert(!JSON.stringify(sessionConfig()).includes('criticalErrors'));
 const raw='{"body":1}',secret='x'.repeat(40),signed=sign(raw,secret);
 assert(verify(raw,secret,signed.timestamp,signed.signature));assert(!verify(raw+' ',secret,signed.timestamp,signed.signature));assert(!verify(raw,secret,signed.timestamp,signed.signature,Date.now()+31000));
 assert.throws(()=>validate({action:'start',actor:SERVER,sdp:'v=0',requestKey:randomUUID()}),/invalid_request/);
 const calls=[];
 const handler=createHandler({requireMockAccess:async()=>{},config:{enabled:true,url:'http://localhost',secret},authenticateWeb:async()=>a,
  fetchImpl:async(url,options)=>{const data=JSON.parse(options.body);calls.push(data);assert(verify(options.body,secret,options.headers['X-Live-Time'],options.headers['X-Live-Signature']));return {ok:true,json:async()=>({ok:true,ready:true})};}});
 assert.equal((await api(handler,{action:'ready',studentId:'spoof'})).code,200);assert.equal(calls[0].actor.id,a.id);assert(!calls[0].body.studentId);
 const rejected=createHandler({requireMockAccess:async()=>{},config:{enabled:true},authenticateWeb:async()=>null,previewAllowed:()=>false});
 assert.equal((await api(rejected,{action:'start',sdp:'v=0',requestKey:randomUUID()})).code,403);
 const providerCalls=[];
 const contract=createProvider({key:'test-not-a-key',followupModel:'test-model',WebSocket:class{},fetchImpl:async(url,options)=>{
  const body=JSON.parse(options.body);providerCalls.push({url,body});
  return {ok:true,json:async()=>url.endsWith('/live/sessions')?{session:{id:'live_test'},transport:{sdp:'answer'}}:
   {status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({turnComplete:true,ask:true,question:'어떤 역할을 맡았나요?',evidence:'협업'})}]}]}};
 }});
 await contract.create('v=0 test');assert.equal(providerCalls[0].body.session.model,'gpt-live-1');assert.equal(providerCalls[0].body.session.store,false);assert(!providerCalls[0].body.session.audio.format);
 await contract.followup({answer:'협업 경험',asked:[]});assert.equal(providerCalls[1].body.text.format.strict,true);
 const {db,invoke:prep}=await createDb();
 const invoke=async(action,actor,body={})=>(await db.query('select ip_live_service($1,$2::jsonb,$3::jsonb) result',[action,JSON.stringify(actor),JSON.stringify(body)])).rows[0].result;
 const spool=path.resolve('.tmp/interview-live-tests');fs.mkdirSync(spool,{recursive:true});
 try{
  await db.exec(fs.readFileSync(migration,'utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20261029142215_interview_live_result_reports.sql','utf8'));
  for(const id of ['ip-a','ip-b'])await prep('admin_member_save',admin,{targetStudentId:id,track:'공채',examNumber:'QA',enabled:true,expiresOn:'2099-12-01'});
  await prep('admin_enabled',admin,{enabled:true});
  assert.equal((await invoke('ready',a)).reason,'questions_unavailable');
  await db.exec("insert into ip_questions(id,prompt,category,status) values('live-1','협업 경험을 말해보세요.','personality','published'),('live-2','지원 이유를 말해보세요.','personality','published'),('live-3','갈등 해결 경험을 말해보세요.','personality','published'),('live-private','비공개','job','draft')");
  await db.exec("insert into ip_questions(id,prompt,category,status) values('live-long',repeat('긴질문',200),'personality','published')");
  assert.equal((await invoke('ready',a)).ready,true);
  await db.exec('set role anon');await assert.rejects(invoke('ready',a),/permission denied/);await db.exec('reset role');
  await assert.rejects(invoke('sweep',a),/forbidden/);
  let clock=Date.now(),event,sent=[],followupCalls=0,override;
  const provider={create:async()=>({id:'live_qa',sdp:'answer'}),attach:async(id,fn)=>{event=fn;return {send:e=>{sent.push(e);if(e.type==='session.close')fn({type:'session.closed'});},destroy(){}};},closeSession:async()=>true,
   followup:async c=>{followupCalls++;return override?override(c):{turnComplete:true,ask:true,question:'그 행동의 결과는 무엇이었나요? '+followupCalls,evidence:'경험'};}};
  const storage={upload:async()=>{},signed:async()=>({input:'signed-input',output:'signed-output'}),remove:async()=>{}};
  const engine=new LiveEngine({invoke,provider,storage,spool,now:()=>clock});
  const requestKey=randomUUID(),started=await engine.command(a,{action:'start',requestKey,sdp:'v=0'}),live=engine.sessions.get(started.runId);
  assert.equal(live.run.questions.length,3);assert(live.run.questions.every(q=>!['live-private','live-long'].includes(q.id)));
  await assert.rejects(engine.command(b,{action:'get',runId:started.runId}),/not_found/);
  await assert.rejects(engine.command(a,{action:'start',requestKey,sdp:'v=0'}),/unsafe_retry/);
  await assert.rejects(engine.command(a,{action:'start',requestKey:randomUUID(),sdp:'v=0'}),/admission_busy/);
  await engine.command(a,{action:'begin',runId:started.runId});await engine.command(a,{action:'begin',runId:started.runId});assert.equal(sent.filter(e=>e.type==='session.commentary.append').length,1);
  // A fragment cannot cause a question or grade. Duplicate provider events ignored.
  event({type:'session.input_transcript.delta',event_id:'t1',delta:'경험 답변입니다.'});event({type:'session.input_transcript.delta',event_id:'t1',delta:'경험 답변입니다.'});
  assert.equal(followupCalls,0);assert.equal(live.answer,'경험 답변입니다.');
  for(let n=0;n<9;n++){
   if(n)event({type:'session.input_transcript.delta',event_id:'t'+(n+1),delta:'경험 답변 '+n});
   event({type:'session.input_audio.append',audio:Buffer.alloc(480).toString('base64')});
   clock+=6000;await engine.advance(live,'d'+n,true);
  }
  assert.equal(live.turns.length,9);assert.equal(live.turns.filter(t=>t.kind==='initial').length,3);assert.equal(live.turns.filter(t=>t.kind==='followup').length,6);
  assert(live.turns.every(t=>t.grade===null&&t.score===null&&t.complete));
  assert.equal(live.turns[0].answer,'경험 답변입니다.');assert.equal(live.turns[1].answer,'경험 답변 1');
  assert(live.turns[1].audioStartBytes>=live.turns[0].audioEndBytes);
  await engine.finish(live,'completed');assert.equal(engine.sessions.size,0);
  const saved=await engine.command(a,{action:'get',runId:started.runId});assert.equal(saved.run.turns.length,9);assert.equal(saved.run.result_report.counts.completedAnswers,9);assert.equal(saved.run.result_report.counts.followups,6);assert.deepEqual(saved.run.result_report.turns,saved.run.turns);assert(saved.recordings);assert(!saved.run.provider_id);assert(!saved.run.questions);
  assert.equal((await engine.command(admin,{action:'admin_list'})).runs.length,1);
  assert.equal((await engine.command(b,{action:'list'})).runs.length,0);
  // New speech arriving during generation invalidates the candidate question.
  const second=await engine.command(a,{action:'start',requestKey:randomUUID(),sdp:'v=0'}),live2=engine.sessions.get(second.runId);
  event({type:'session.input_transcript.delta',delta:'경험입니다.'});clock+=6000;
  override=async()=>{event({type:'session.input_transcript.delta',delta:' 아직 이어갑니다.'});return {turnComplete:true,ask:true,question:'폐기할 질문',evidence:'경험'};};
  await engine.advance(live2,'resumed',true);assert.equal(live2.turns.length,0);assert(live2.answer.includes('이어갑니다'));
  await engine.finish(live2,'interrupted');override=null;
  // A failed Storage upload stays retryable on disk, and maintenance completes it.
  const third=await engine.command(a,{action:'start',requestKey:randomUUID(),sdp:'v=0'}),live3=engine.sessions.get(third.runId);
  event({type:'session.input_audio.append',audio:Buffer.alloc(480).toString('base64')});
  const upload=storage.upload;storage.upload=async()=>{throw Error('storage_offline');};
  await engine.finish(live3,'interrupted');assert.equal((await invoke('get',a,{runId:third.runId})).run.recording_state,'pending');
  assert(fs.existsSync(path.join(spool,third.runId,'input.wav')));storage.upload=upload;await engine.tick();
  assert.equal((await invoke('get',a,{runId:third.runId})).run.recording_state,'ready');assert(!fs.existsSync(path.join(spool,third.runId)));
  await assert.rejects(engine.command(a,{action:'start',requestKey:randomUUID(),sdp:'v=0'}),/daily_limit/);
  // Enrollment changes update retention, while expired records are unreadable.
  await db.exec("update ip_members set expires_on='2000-01-01' where student_id='ip-a'");
  await assert.rejects(engine.command(a,{action:'get',runId:started.runId}),/not_found/);
  await engine.tick();assert.equal((await db.query('select count(*) n from ip_live_runs')).rows[0].n,0);
  await db.exec("update ip_members set expires_on=null where student_id='ip-b'");assert.equal((await invoke('ready',b)).reason,'enrollment_end_required');
  await assert.rejects(invoke('reserve',b,{requestKey:randomUUID()}),/not_enrolled/);
  await db.exec("insert into ip_live_runs(student_id,request_key,state,questions,current_question,recording_state,retain_until) select 'ip-b',gen_random_uuid(),'completed','[]','페이지 검사','missing',now()+interval '30 days' from generate_series(1,32)");
  const p1=await invoke('list',b,{page:0}),p2=await invoke('list',b,{page:1});assert.equal(p1.runs.length,30);assert.equal(p1.hasMore,true);assert.equal(p2.runs.length,2);assert.equal(p2.hasMore,false);assert(!p1.runs.some(r=>p2.runs.some(s=>s.id===r.id)));
  // WAV framing and silence gaps are real byte-level checks, no model calls.
  const id=randomUUID(),rec=createRecorder(spool,id);rec.append('input',Buffer.alloc(480,1).toString('base64'));rec.append('output',Buffer.alloc(480,2).toString('base64'),1000);rec.close();
  const audio=fs.readFileSync(path.join(rec.dir,'output.wav'));assert.equal(audio.readUInt32LE(40),48480);assert(audio.subarray(44,48044).every(x=>x===0));assert.equal(wavHeader(480).readUInt32LE(24),24000);removeSpool(spool,id);
  console.log('PASS live auth, DB isolation, admission, retention, grounded followups, turn boundaries, resumed speech, recording and cleanup (no paid API calls).');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
