'use strict';
const {bodyOf,postOnly,sameOrigin}=require('../lib/interview-ai-http');
const {configuration,createProvider}=require('../lib/interview-exam-provider');
const {inspectWav}=require('../lib/interview-exam-audio');
const {rubricSnapshot,digest}=require('../lib/interview-exam-scoring');
const {evaluateAudio}=require('../lib/interview-exam-service');
const {timingSafeEqual}=require('node:crypto');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SERVER={type:'server',id:'job-exam'};
function defaults(){return {
 config:()=>({...configuration(),enabled:process.env.INTERVIEW_JOB_EXAM_ENABLED==='true',storageReady:!!(process.env.SUPABASE_URL&&process.env.SUPABASE_SERVICE_ROLE_KEY&&process.env.CRON_SECRET?.length>=32)}),
 authenticateWeb:require('../lib/interview-web-auth').authenticatePortal,
 authenticateDevice:require('./criminal-law-ox')._private.authenticateStudent,
 previewAllowed:require('../lib/interview-preview-access').isPreviewStudent,
 invoke:(action,actor,body={})=>require('./curriculum')._private.requestSupabase('POST','rpc/ip_job_exam_service',{p_action:action,p_actor:actor,p_body:body}),
 provider:config=>createProvider({config}),
 storage:()=>require('../lib/interview-job-exam-storage.cjs').createJobExamStorage({url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY}),
 cronSecret:process.env.CRON_SECRET||''
};}
function validate(b){
 const fields={status:[],questions:['page'],start:['questionId','requestKey'],submit:['id','audioBase64'],get:['id'],list:['page'],cancel:['id'],cleanup:[]};
 if(!fields[b.action]||Object.keys(b).some(k=>!['action','studentId','deviceToken',...fields[b.action]].includes(k)))throw Error('invalid_request');
 if(['get','cancel','submit'].includes(b.action)&&!UUID.test(b.id||''))throw Error('invalid_request');
 if(b.action==='start'&&(!UUID.test(b.requestKey||'')||typeof b.questionId!=='string'||!b.questionId||b.questionId.length>120))throw Error('invalid_request');
 if(b.page!==undefined&&(!Number.isInteger(b.page)||b.page<0||b.page>10000))throw Error('invalid_request');
 if(b.action==='submit'&&(typeof b.audioBase64!=='string'||b.audioBase64.length<60||b.audioBase64.length>4000000||b.audioBase64.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(b.audioBase64)))throw Error('invalid_audio');
}
function createHandler(deps){return async(req,res)=>{
 let actor,id,phase;
 const d=deps||defaults();
 try {
  postOnly(req,res);const b=await bodyOf(req,4100000);validate(b);
  if(b.action==='cleanup'){
   const secret=d.cronSecret,token=(req.headers.authorization||'').replace(/^Bearer /,'');
   if(!secret||secret.length<32||token.length!==secret.length||!timingSafeEqual(Buffer.from(token),Buffer.from(secret)))throw Error('unauthorized');
   const expired=await d.invoke('sweep',SERVER,{});let removed=0;
   for(const r of expired.runs){await d.storage().remove(r.id);await d.invoke('purge',SERVER,{id:r.id});removed++;}
   return res.status(200).json({ok:true,removed});
  }
  sameOrigin(req);
  let student=await d.authenticateWeb(req);
  if(!student){if(!d.previewAllowed(b.studentId))throw Error('forbidden');student=await d.authenticateDevice({studentId:b.studentId,deviceToken:b.deviceToken});if(!student||!d.previewAllowed(student.id))throw Error('unauthorized');}
  actor={type:'student',id:student.id};const config=d.config();
  const enabled=config.enabled&&config.ready&&config.storageReady;
  if(b.action==='status')return res.status(200).json(enabled?await d.invoke('ready',actor,{}):{ok:true,ready:false,reason:'exam_not_configured'});
  if(['questions','start','submit'].includes(b.action)&&!enabled)throw Error('exam_not_configured');
  async function get(runId){const data=await d.invoke('get',actor,{id:runId});
   if(data.run.audioReady){try{data.audioUrl=await d.storage().signed(runId,data.run.retainUntil);}catch{data.audioUnavailable=true;}}
   return data;
  }
  if(b.action==='get')return res.status(200).json(await get(b.id));
  if(['questions','list','cancel'].includes(b.action))return res.status(200).json(await d.invoke(b.action,actor,{id:b.id,page:b.page||0}));
  if(b.action==='start'){
   const data=await d.invoke('start',actor,{questionId:b.questionId,requestKey:b.requestKey});
   const frozen=await d.invoke('internal_get',SERVER,{id:data.run.id});
   try{rubricSnapshot(frozen.run.rubric_detail);}catch(e){await d.invoke('cancel',actor,{id:data.run.id});throw e;}
   return res.status(200).json(data);
  }
  const audio=Buffer.from(b.audioBase64,'base64');if(audio.toString('base64')!==b.audioBase64)throw Error('invalid_audio');inspectWav(audio);
  const claim=await d.invoke('claim',actor,{id:b.id,audioHash:digest(audio)});
  if(!claim.claimed)return res.status(200).json(await get(b.id));
  id=b.id;phase='upload';const frozen=await d.invoke('internal_get',SERVER,{id});rubricSnapshot(frozen.run.rubric_detail);
  await d.storage().put(id,audio);await d.invoke('stored',SERVER,{id});phase='evaluation';
  // Deliberately grade against the start-time snapshot, even if the author later edits a rubric.
  const report=await evaluateAudio({audio,detail:frozen.run.rubric_detail,provider:d.provider(config),loadCurrent:async()=>frozen.run.rubric_detail});
  await d.invoke('complete',SERVER,{id,report});phase='done';return res.status(200).json(await get(id));
 }catch(e){
  if(id&&phase==='upload')try{await d.invoke('upload_failed',SERVER,{id});}catch{}
  if(id&&phase==='evaluation')try{await d.invoke('unknown',SERVER,{id});}catch{}
  const codes={unauthorized:401,forbidden:403,method_not_allowed:405,request_too_large:413,invalid_request:400,invalid_audio:400,not_found:404,not_enrolled:403,exam_not_configured:409,questions_unavailable:409,rubric_not_ready:409,session_expired:409,admission_busy:409,daily_limit:429,queue_full:429,idempotency_conflict:409,unsafe_retry:409,recording_unavailable:503};
  const code=Object.keys(codes).find(c=>c===e.code||c===e.message||e.message?.includes('"message":"'+c+'"'))||'exam_unavailable';
  return res.status(codes[code]||503).json({ok:false,error:code});
 }
};}
module.exports=createHandler();module.exports.createHandler=createHandler;module.exports.validate=validate;
