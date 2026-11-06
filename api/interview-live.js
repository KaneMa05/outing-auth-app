'use strict';
const {bodyOf,sameOrigin,postOnly,sendError}=require('../lib/interview-ai-http');
const {UUID,fail}=require('../lib/interview-ai-validation');
const {sign}=require('../lib/interview-live-policy');
function configuration(env=process.env){
 const openai=require('../lib/interview-openai-config.cjs'),models=openai.models(env);
 const url=env.INTERVIEW_LIVE_WORKER_URL||'',secret=env.INTERVIEW_LIVE_WORKER_SECRET||'';
 if(env.INTERVIEW_LIVE_TRANSPORT==='vercel'){
  const configured=Boolean(env.OPENAI_API_KEY&&models.live&&models.followup&&env.SUPABASE_URL&&env.SUPABASE_SERVICE_ROLE_KEY&&secret.length>=32&&env.CRON_SECRET?.length>=32&&Number(env.INTERVIEW_LIVE_RUNTIME_SECONDS)>=720);
  return {transport:'vercel',secret,configured,enabled:openai.feature('INTERVIEW_LIVE_ENABLED',env)&&configured};
 }
 let valid=false;try{const u=new URL(url);valid=u.protocol==='https:'||(u.protocol==='http:'&&['127.0.0.1','localhost'].includes(u.hostname));}catch{}
 return {url,secret,configured:valid&&secret.length>=32,enabled:openai.feature('INTERVIEW_LIVE_ENABLED',env)&&valid&&secret.length>=32};
}
function defaults(){const auth=require('./teacher-auth-utils');return {
 config:configuration(),cliEnabled:require('../lib/interview-mock-cli-queue.cjs').enabled('report'),queue:()=>require('../lib/interview-mock-cli-queue.cjs').createQueue(),authenticateWeb:require('../lib/interview-web-auth').authenticatePortal,
 openaiReportsEnabled:!!process.env.OPENAI_API_KEY&&require('../lib/interview-openai-config.cjs').feature('INTERVIEW_MOCK_REPORT_ENABLED')&&!!require('../lib/interview-openai-config.cjs').models().report,
 reports:()=>require('../lib/interview-openai-report.cjs').createReports({key:process.env.OPENAI_API_KEY,model:require('../lib/interview-openai-config.cjs').models().report,
  invoke:(action,actor,body)=>require('./curriculum')._private.requestSupabase('POST','rpc/ip_live_openai_report_service',{p_action:action,p_actor:actor,p_body:body})}),
 authenticateDevice:require('./criminal-law-ox')._private.authenticateStudent,
 previewAllowed:require('../lib/interview-preview-access').isPreviewStudent,
 authenticateAdmin:async req=>{const s=auth.readSessionToken(auth.readCookie(req,auth.COOKIE_NAME),auth.getConfig().secret);
  if(!s)fail('unauthorized');if(s.role!=='admin'||!auth.hasPermission(s,'interview.read'))fail('forbidden');return {id:s.username};},fetchImpl:fetch,
 invoke:(action,actor,body)=>require('./curriculum')._private.requestSupabase('POST','rpc/ip_live_service',{p_action:action,p_actor:actor,p_body:body}),
 storage:()=>require('../lib/interview-live-cloud-storage').createCloudStorage({url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY})};}
function validate(b){
 const fields={analysis_request:['runId'],analysis_get:['runId'],ready:[],start:['requestKey','sdp'],begin:['runId'],heartbeat:['runId'],answer_done:['runId'],finish:['runId'],list:['page'],get:['runId'],admin_list:['page'],admin_get:['runId']};
 if(!fields[b.action])fail('unsupported_action');
 if(Object.keys(b).some(k=>!['action','studentId','deviceToken',...fields[b.action]].includes(k)))fail('invalid_request');
 if(fields[b.action].includes('runId')&&!UUID.test(b.runId||''))fail('invalid_request');
 if('page' in b&&(!Number.isInteger(b.page)||b.page<0||b.page>10000))fail('invalid_request');
 if(b.action==='start'&&(!UUID.test(b.requestKey||'')||typeof b.sdp!=='string'||b.sdp.length>60000||!b.sdp.startsWith('v=0')))fail('invalid_request');
}
function createHandler(deps){return async(req,res)=>{try{
 postOnly(req,res);sameOrigin(req);const b=await bodyOf(req,66000);validate(b);const d=deps||defaults();let actor;
 if(b.action.startsWith('admin_'))actor={type:'admin',id:(await d.authenticateAdmin(req)).id};
 else{let student=await d.authenticateWeb(req);if(!student){if(!d.previewAllowed(b.studentId))fail('forbidden');student=await d.authenticateDevice({studentId:b.studentId,deviceToken:b.deviceToken});if(!student)fail('unauthorized');if(!d.previewAllowed(student.id))fail('forbidden');}await (d.requireMockAccess||require('../lib/interview-mock-access').requireMockAccess)(student.id);actor={type:'student',id:student.id};}
 if(['analysis_request','analysis_get'].includes(b.action)){
  if(!d.cliEnabled&&!d.openaiReportsEnabled)fail('automation_disabled');const data=await d.invoke('get',actor,{runId:b.runId});
  if(d.openaiReportsEnabled){const reports=d.reports();return res.status(200).json({ok:true,processing:b.action==='analysis_request'?await reports.request(actor,data.run):await reports.get(actor,b.runId)});}
  if(b.action==='analysis_request')await d.queue().enqueue('report',b.runId,actor);
  return res.status(200).json({ok:true,processing:await d.queue().get('report',b.runId,actor)});
 }
 async function withAnalysis(data){if(b.action==='get'&&(d.cliEnabled||d.openaiReportsEnabled)&&['completed','interrupted'].includes(data.run?.state)){
  data.analysisEnabled=true;data.processing=d.openaiReportsEnabled?await d.reports().get(actor,b.runId):await d.queue().get('report',b.runId,actor);
 }return data;}
 const config=d.config;if(!config.enabled){if(b.action==='ready')return res.status(200).json({ok:true,ready:false,reason:'live_not_configured'});if(!config.configured||b.action==='start')fail('automation_disabled');}
 const payload={...b};delete payload.studentId;delete payload.deviceToken;
 if(config.transport==='vercel'){
  if(b.action==='start'){
   const ready=await d.invoke('ready',actor,{});if(!ready.ready)fail(ready.reason==='questions_unavailable'?'questions_unavailable':'not_enrolled');
   return res.status(200).json({ok:true,transport:'websocket',url:'/api/interview-live-socket',ticket:require('../lib/interview-live-ticket').issue(actor,b.requestKey,b.sdp,config.secret)});
  }
  if(['begin','answer_done','heartbeat'].includes(b.action))fail('session_expired');
  if(b.action==='finish'){
   // A disconnected control socket is finalized by its owner or the cleanup job.
   await d.invoke('get',actor,{runId:b.runId});return res.status(200).json({ok:true,pending:true});
  }
  const data=await d.invoke(b.action,actor,payload);
  if(data.run?.recording_state==='ready')data.recordings=await d.storage().signed(b.runId,Math.floor((Date.parse(data.run.retain_until)-Date.now())/1000));
  return res.status(200).json(await withAnalysis(data));
 }
 const raw=JSON.stringify({actor,body:payload}),signed=sign(raw,config.secret);
 const r=await d.fetchImpl(config.url.replace(/\/$/,'')+'/command',{method:'POST',redirect:'error',signal:AbortSignal.timeout(55000),headers:{'Content-Type':'application/json','X-Live-Time':signed.timestamp,'X-Live-Signature':signed.signature},body:raw});
 const data=await r.json();if(!r.ok||!data.ok)throw Error(data.error||'automation_unavailable');
 res.status(200).json(await withAnalysis(data));
 }catch(e){sendError(res,e);}};}
module.exports=createHandler();module.exports.createHandler=createHandler;module.exports.validate=validate;module.exports.configuration=configuration;
module.exports.defaults=defaults;
