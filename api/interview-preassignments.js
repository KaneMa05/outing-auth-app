'use strict';
const {bodyOf,sameOrigin,postOnly}=require('../lib/interview-ai-http');
const {remoteProvider,evaluate,VERSION}=require('../lib/preassignment-diagnosis.cjs');
const {units,studentUnits}=require('../lib/preassignment-catalog.cjs');
const {ENGINE_VERSION}=require('../lib/core25-worker-config.cjs');
const pcEnabled=require('./interview-core25-worker').enabled;
const fields={admin_guidance_list:[],admin_guidance_detail:['unitId'],admin_guidance_save:['unitId','revision','instructions'],admin_guidance_history:['unitId','page'],diagnosis_status:['unitId'],bootstrap:[],detail:['unitId'],diagnose:['unitId','revision'],save:['unitId','revision','fields','requestId'],submit:['unitIds','revisions','fields','requestId'],history:['unitId','page'],admin_list:['search','status','page'],admin_detail:['targetStudentId','unitId'],admin_history:['targetStudentId','unitId','page'],admin_settings:['revision','enabled','dueAt','revisionDueAt','allowLate']};
const errors={diagnosis_worker_offline:409,diagnosis_busy:429,diagnosis_limit:429,criteria_not_ready:409,diagnosis_not_configured:409,invalid_diagnosis:503,diagnosis_unavailable:503,unauthorized:401,forbidden:403,not_enrolled:403,not_found:404,disabled:409,revision_conflict:409,idempotency_conflict:409,incomplete:422,invalid_request:400,deadline_passed:409,unsupported_action:400,method_not_allowed:405,request_too_large:413};
const fail=code=>{throw Error(code);};
function validate(b){
 if(!Object.hasOwn(fields,b.action))fail('unsupported_action');
 if(Object.keys(b).some(k=>!['action','studentId','deviceToken',...fields[b.action]].includes(k)))fail('invalid_request');
 const str=(v,n)=>typeof v==='string'&&v.length<=n;
 if('instructions'in b&&!str(b.instructions,10000))fail('invalid_request');
 for(const key of ['studentId','deviceToken','unitId','targetStudentId','submissionId','requestId','status','search','feedback'])if(key in b&&!str(b[key],key==='feedback'?4000:256))fail('invalid_request');
 for(const key of ['revision','page'])if(key in b&&(!Number.isInteger(b[key])||b[key]<0||b[key]>100000))fail('invalid_request');
 for(const key of ['submissionId'])if(key in b&&!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(b[key]))fail('invalid_request');
 for(const key of ['enabled','allowLate'])if(key in b&&typeof b[key]!=='boolean')fail('invalid_request');
 for(const key of ['dueAt','revisionDueAt'])if(key in b&&(!str(b[key],40)||!Number.isFinite(Date.parse(b[key]))))fail('invalid_request');
 const allowed=b.action.startsWith('admin_')?units:studentUnits;
 if('unitId'in b&&!allowed.some(u=>u.id===b.unitId))fail('invalid_request');
 if('unitIds'in b&&(!Array.isArray(b.unitIds)||!b.unitIds.length||b.unitIds.length!==1||new Set(b.unitIds).size!==b.unitIds.length||b.unitIds.some(id=>!allowed.some(u=>u.id===id))))fail('invalid_request');
 if('fields'in b&&(!b.fields||Array.isArray(b.fields)||typeof b.fields!=='object'||Object.keys(b.fields).length>1||Object.entries(b.fields).some(([k,v])=>k!=='f1'||!str(v,4000))))fail('invalid_request');
 if('revisions'in b&&(!b.revisions||Array.isArray(b.revisions)||typeof b.revisions!=='object'||Object.values(b.revisions).some(v=>!Number.isInteger(v)||v<0)))fail('invalid_request');
 const required={diagnosis_status:['unitId'],admin_guidance_list:[],admin_guidance_detail:['unitId'],admin_guidance_save:['unitId','revision','instructions'],admin_guidance_history:['unitId'],detail:['unitId'],diagnose:['unitId','revision'],save:['unitId','revision','fields','requestId'],submit:['unitIds','revisions','fields','requestId'],history:['unitId'],admin_detail:['targetStudentId','unitId'],admin_history:['targetStudentId','unitId'],admin_settings:['revision','enabled','dueAt','revisionDueAt','allowLate']};
 if((required[b.action]||[]).some(k=>b[k]===undefined||b[k]===null))fail('invalid_request');
 if('requestId'in b&&!/^[a-zA-Z0-9-]{8,100}$/.test(b.requestId))fail('invalid_request');
 if(b.action==='admin_list'&&b.status&&!['submitted','empty','complete'].includes(b.status))fail('invalid_request');
}
function defaults(){
 const auth=require('./teacher-auth-utils');
 const pcMode=pcEnabled(process.env);
 return {pcMode,diagnosisProvider:process.env.INTERVIEW_CORE25_DIAGNOSIS_MODE==='pc'?null:remoteProvider(),
 pcInvoke:(action,actor,body)=>require('./curriculum')._private.requestSupabase('POST','rpc/ip_pa_pc_service',{p_action:action,p_actor:actor,p_body:body}),
 authenticateWeb:require('../lib/interview-web-auth').authenticatePortal,authenticateDevice:require('./criminal-law-ox')._private.authenticateStudent,previewAllowed:require('../lib/interview-preview-access').isPreviewStudent,
 authenticateAdmin:async(req,write)=>{const s=auth.readSessionToken(auth.readCookie(req,auth.COOKIE_NAME),auth.getConfig().secret);if(!s)fail('unauthorized');if(s.role!=='admin'||!auth.hasPermission(s,write?'interview.write':'interview.read'))fail('forbidden');return {id:s.username};},
 invoke:(action,actor,body)=>require('./curriculum')._private.requestSupabase('POST','rpc/'+(action.startsWith('diagnosis_')?'ip_pa_diagnosis_service':action.startsWith('admin_guidance_')?'ip_pa_guidance_service':'ip_preassignment_service'),{p_action:action.startsWith('diagnosis_')?action.slice(10):action,p_actor:actor,p_body:body})};
}
function createHandler(deps){return async(req,res)=>{
 try{
  postOnly(req,res);sameOrigin(req);const body=await bodyOf(req,65000);validate(body);const d=deps||defaults();let actor;
  if(body.action.startsWith('admin_')){const a=await d.authenticateAdmin(req,['admin_settings','admin_guidance_save'].includes(body.action));actor={type:'admin',id:a.id};}
  else {let s=await d.authenticateWeb(req);if(!s){if(!d.previewAllowed(body.studentId))fail('forbidden');s=await d.authenticateDevice({studentId:body.studentId,deviceToken:body.deviceToken});if(!s)fail('unauthorized');if(!d.previewAllowed(s.id))fail('forbidden');}actor={type:'student',id:s.id};}
  const payload={};for(const k of fields[body.action])if(body[k]!==undefined)payload[k]=body[k];
  let result;const engineVersion=d.pcMode?ENGINE_VERSION:d.diagnosisProvider?.version||VERSION;
  if(body.action==='diagnose'&&d.pcMode){
   result=await d.pcInvoke('enqueue',actor,{...payload,engineVersion});
  }else if(body.action==='diagnose'){
   if(!d.diagnosisProvider)fail('diagnosis_not_configured');
   const claim=await d.invoke('diagnosis_claim',actor,{...payload,engineVersion:d.diagnosisProvider.version||VERSION});
   if(claim.claimed){
    let report;
    try{report=await evaluate(d.diagnosisProvider,claim.snapshot);}
    catch{result=await d.invoke('diagnosis_finish',actor,{unitId:payload.unitId,diagnosisId:claim.diagnosisId,error:'diagnosis_unavailable'});}
    if(report)result=await d.invoke('diagnosis_finish',actor,{unitId:payload.unitId,diagnosisId:claim.diagnosisId,report});
   }else result={ok:true,diagnosis:claim.diagnosis};
  }else if(body.action==='diagnosis_status')result=await d.invoke('diagnosis_get',actor,{...payload,engineVersion});
  else result=await d.invoke(body.action,actor,payload);
  if(['bootstrap','admin_list'].includes(body.action)){
   result.catalog=body.action==='bootstrap'?studentUnits:units;result.diagnosisEnabled=!!d.diagnosisProvider;
   if(d.pcMode&&body.action==='bootstrap')try{result.diagnosisEnabled=(await d.pcInvoke('status',actor,{engineVersion})).ready;}catch{result.diagnosisEnabled=false;}
  }
  if(body.action==='detail')result.diagnosis=(await d.invoke('diagnosis_get',actor,{unitId:payload.unitId,engineVersion})).diagnosis;
  // Never return internal claim snapshots or administrator instructions to a student.
  res.status(200).json(result);
 }catch(e){const code=Object.keys(errors).find(c=>e.message===c||e.message?.includes(`"message":"${c}"`));res.status(code?errors[code]:503).json({ok:false,error:code||'preassignment_unavailable'});}
};}
module.exports=createHandler();module.exports.createHandler=createHandler;module.exports.validate=validate;
