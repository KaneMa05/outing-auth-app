'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {buildStatus,monitorStatus}=require('../lib/interview-mock-monitor.cjs');
const {createHealthProbe}=require('../scripts/interview-mock-health.cjs');
const {createHandler}=require('../api/interview-prep'),workerApi=require('../api/interview-mock-worker'),auth=require('../api/teacher-auth-utils');
const now=Date.parse('2026-11-02T09:00:00Z'),stamp=(offset=0)=>new Date(now+offset).toISOString();
const env={INTERVIEW_JOB_EXAM_ENABLED:'true',INTERVIEW_PERSONALITY_ENABLED:'true',INTERVIEW_LIVE_ENABLED:'true',INTERVIEW_JOB_EXAM_MODE:'pc',INTERVIEW_PERSONALITY_MODE:'pc',INTERVIEW_MOCK_REPORT_MODE:'pc',INTERVIEW_MOCK_CLI_WORKER_TOKEN:'x'.repeat(43),INTERVIEW_MOCK_CLI_AUDIO_READY:'true',SUPABASE_URL:'https://example.test',SUPABASE_SERVICE_ROLE_KEY:'secret',CRON_SECRET:'s'.repeat(32),INTERVIEW_LIVE_WORKER_URL:'https://live.example.test',INTERVIEW_LIVE_WORKER_SECRET:'s'.repeat(32)};
function snapshot(){const stats=()=>({queued:0,running:0,attention:0,held:0,interrupted:0,recordingPending:0,completed24h:0,failed24h:0,lastCompletedAt:null,lastFailedAt:null});return {access:{enabled:true},api:{job:stats(),personality:stats()},live:stats(),questions:{job:1,personality:1,live:3},cli:{lastSeenAt:stamp(-10000),healthCheckedAt:stamp(-10000),health:{cliReady:true,transcriptionConfigured:true,verificationConfigured:true,analysisConfigured:true,blockedReason:''},stats:{job:stats(),personality:stats(),report:stats()}}};}
const status=(data=snapshot(),options={})=>buildStatus(data,{env,now:()=>now,...options});
const mode=(data,kind='job')=>status(data).modes.find(m=>m.kind===kind);
async function send(handler,body,headers={}){let status,data;await handler({method:'POST',body,headers},{setHeader(){},status(n){status=n;return this;},json(d){data=d;}});return {status,data};}

test('monitor separates configured, completed, busy, held, unavailable and disabled states',()=>{
 const data=snapshot();assert.equal(mode(data).state,'ready');
 data.cli.stats.job.lastCompletedAt=stamp(-1000);data.cli.stats.job.completed24h=1;assert.equal(mode(data).state,'completed');
 data.cli.stats.job.held=1;assert.equal(mode(data).held,1);
 data.cli.stats.job.queued=2;assert.equal(mode(data).state,'queued');data.cli.stats.job.running=1;assert.equal(mode(data).state,'running');
 data.cli.stats.job.attention=1;assert.equal(mode(data).state,'attention');
 const unavailable=status(data,{metricsAvailable:false}).modes[0];assert.equal(unavailable.state,'unavailable');assert.equal(unavailable.running,null);assert.equal(unavailable.lastCompletedAt,null);
 assert.equal(status(data,{env:{...env,INTERVIEW_JOB_EXAM_ENABLED:'false'}}).modes[0].state,'disabled');
 data.access.enabled=false;assert.equal(mode(data).state,'disabled');assert.equal(mode(data).accepting,false);data.access.enabled=true;
 assert.equal(status(data,{env:{...env,INTERVIEW_MOCK_CLI_WORKER_TOKEN:''}}).modes[0].state,'configuration');
 assert.doesNotMatch(JSON.stringify(status(data)),/secret|x{43}|student_id|transcript/);
});
test('PC connectivity and fresh execution checks fail closed without implying working AI',()=>{
 for(const lastSeenAt of [stamp(-45001),stamp(6000),null]){const data=snapshot();data.cli.lastSeenAt=lastSeenAt;assert.equal(mode(data).state,'disconnected');}
 for(const checked of [stamp(-120001),stamp(6000),null]){const data=snapshot();data.cli.healthCheckedAt=checked;assert.equal(mode(data).state,'health_unknown');assert.equal(mode(data).runtimeChecks.find(c=>c.label==='CLI 로그인').ok,null);}
 for(const [field,state,kind] of [['cliReady','login_required','job'],['transcriptionConfigured','transcription_required','personality'],['verificationConfigured','verification_required','job'],['analysisConfigured','configuration','report']]){const data=snapshot();data.cli.health[field]=false;assert.equal(mode(data,kind).state,state);}
 const data=snapshot();data.cli.health.blockedReason='delivery_pending';assert.equal(mode(data).state,'blocked');
});
test('question readiness, unknown uploads and recent failures remain visible',()=>{
 const data=snapshot();data.questions.job=0;assert.equal(mode(data).state,'questions_required');data.questions.job=1;
 data.api.job.uploadFailed=1;assert.equal(mode(data).state,'attention');data.api.job.uploadFailed=0;data.api.job.untrackedUnknown=1;assert.equal(mode(data).attention,1);data.api.job.untrackedUnknown=0;
 data.cli.stats.job.lastFailedAt=stamp(-500);assert.equal(mode(data).state,'recent_failure');
 data.cli.stats.job.lastCompletedAt=stamp(-100);assert.equal(mode(data).state,'completed');
 data.cli.stats.job.lastCompletedAt=stamp(6000);data.cli.stats.job.lastFailedAt=null;assert.equal(mode(data).state,'ready');
 data.cli.stats.job.running=-1;assert.equal(mode(data).state,'unavailable');
});
test('live recording and API mode health rely on actual configuration and processing records',()=>{
 const data=snapshot();assert.equal(mode(data,'live').state,'ready');data.live.recordingPending=1;data.live.lastCompletedAt=stamp(-1000);assert.equal(mode(data,'live').state,'recording_pending');
 data.live.attention=1;assert.equal(mode(data,'live').state,'attention');data.live.attention=0;data.live.recordingPending=0;data.questions.live=2;assert.equal(mode(data,'live').state,'questions_required');
 const apiEnv={...env,INTERVIEW_PERSONALITY_MODE:'api',OPENAI_API_KEY:'secret',INTERVIEW_PERSONALITY_ANALYSIS_MODEL:'model-test'};data.api.personality.lastCompletedAt=stamp(-1000);data.cli.lastSeenAt=null;
 const api=status(data,{env:apiEnv}).modes[1];assert.equal(api.transport,'api');assert.equal(api.state,'completed');assert.equal(api.lastSeenAt,null);
 assert.equal(status(data,{env:{...apiEnv,OPENAI_API_KEY:''}}).modes[1].state,'configuration');
});
test('admin action requires interview.read and performs exactly one read-only aggregate',async()=>{
 const previous=process.env.TEACHER_SESSION_SECRET;process.env.TEACHER_SESSION_SECRET='monitor-test';let reads=0;
 const handler=createHandler({read:async(method,path,body)=>{assert.deepEqual([method,path,body],['POST','rpc/ip_mock_operations_snapshot',{}]);reads++;return snapshot();},invoke:()=>{throw Error('must not claim');}});
 const call=user=>send(handler,{action:'admin_mock_monitor'},{host:'local',origin:'http://local',cookie:auth.COOKIE_NAME+'='+(user?auth.createSessionToken('monitor-test',user):'')});
 try{assert.equal((await call(null)).status,401);assert.equal((await call({username:'teacher',role:'teacher',permissions:['interview.read']})).status,403);assert.equal((await call({username:'admin',role:'admin',permissions:[]})).status,403);assert.equal(reads,0);assert.equal((await call({username:'reader',role:'admin',permissions:['interview.read']})).status,200);assert.equal(reads,1);}
 finally{if(previous===undefined)delete process.env.TEACHER_SESSION_SECRET;else process.env.TEACHER_SESSION_SECRET=previous;}
 await assert.rejects(monitorStatus({extra:true},{type:'admin',id:'qa'},async()=>snapshot()),/invalid_request/);
 await assert.rejects(monitorStatus({},{type:'student',id:'qa'},async()=>snapshot()),/forbidden/);
 const failed=await monitorStatus({},{type:'admin',id:'qa'},async()=>{throw Error('database secret');},{env,now:()=>now});assert.equal(failed.modes[0].state,'unavailable');assert.doesNotMatch(JSON.stringify(failed),/database secret/);
});
test('worker health authenticates before writes and telemetry failure preserves a valid heartbeat',async()=>{
 const token='x'.repeat(43),writes=[],calls=[],health={checkedAt:stamp(),cliReady:true,transcriptionConfigured:true,verificationConfigured:true,analysisConfigured:true,blockedReason:''};
 const handler=workerApi.createHandler({token,configured:true,queue:{invoke:async(...args)=>{calls.push(args);return {ok:true};}},reportHealth:async h=>writes.push(h)}),headers={authorization:'Bearer '+token};
 assert.equal((await send(handler,{action:'heartbeat',health})).status,401);assert.equal(writes.length,0);
 assert.equal((await send(handler,{action:'heartbeat',health:{...health,token:'bad'}},headers)).status,400);assert.equal(calls.length,0);
 const success=await send(handler,{action:'heartbeat',health:structuredClone(health)},headers);assert.equal(success.status,200);assert.equal(success.data.healthRecorded,true);assert.equal(writes.length,1);assert.deepEqual(calls[0][2],{action:'heartbeat'});
 const unavailable=workerApi.createHandler({token,configured:true,queue:{invoke:async()=>({ok:true})},reportHealth:async()=>{throw Error('migration missing');}});
 const result=await send(unavailable,{action:'heartbeat',health:structuredClone(health)},headers);assert.equal(result.status,200);assert.equal(result.data.healthRecorded,false);
});
test('health probe only checks saved ChatGPT login, coalesces and caches; excludes API credentials',async()=>{
 let launches=0,time=now,child;
 const previous=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='must-not-forward';
 const probe=createHealthProbe({executable:'codex',models:{judge:'model-a',verifier:'model-b',analyzer:'model-a'},transcriptionConfigured:true,now:()=>time,spawnProcess(executable,args,options){launches++;assert.equal(executable,'codex');assert.deepEqual(args,['login','status']);assert.equal(options.env.OPENAI_API_KEY,undefined);assert.equal(options.windowsHide,true);child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.stdout.setEncoding=child.stderr.setEncoding=()=>{};child.kill=()=>{};return child;}});
 try{const a=probe.check(),b=probe.check();child.stderr.emit('data','Logged in using ChatGPT');child.emit('close',0);assert.equal((await a).cliReady,true);assert.deepEqual(await a,await b);assert.equal((await probe.check()).verificationConfigured,true);assert.equal(launches,1);time+=60001;const next=probe.check();child.stderr.emit('data','Logged in using an API key');child.emit('close',0);assert.equal((await next).cliReady,false);assert.equal(launches,2);}
 finally{if(previous===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=previous;}
});
module.exports={snapshot,env,now};
