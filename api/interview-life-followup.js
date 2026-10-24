'use strict';
const {bodyOf,sameOrigin,postOnly,sendError}=require('../lib/interview-ai-http');
const {generate}=require('../lib/interview-life-followup-engine');
const {UUID,keys,fail}=require('../lib/interview-ai-validation');
const actions={availability:[],start:['experienceId'],get:['sessionId','experienceId'],status:['sessionId'],save_answers:['sessionId','answerRevision','answers'],generate_questions:['sessionId','sourceHash','answerRevision','requestKey'],summarize:['sessionId','sourceHash','answerRevision','requestKey'],apply:['sessionId','sourceHash','profileRevision','answerRevision','outputId','fields'],restore:['sessionId','sourceHash','profileRevision','outputId']};
function validate(b){
 if(!actions[b.action])fail('unsupported_action');
 keys(b,['action','studentId','deviceToken',...actions[b.action]]);
 if(b.sessionId!==undefined&&!UUID.test(b.sessionId))fail('invalid_request');
 if(b.outputId!==undefined&&!UUID.test(b.outputId))fail('invalid_request');
 if(!['availability','start','get'].includes(b.action)&&!b.sessionId)fail('invalid_request');
 if(['start','get'].includes(b.action)&&!b.sessionId&&!/^[a-zA-Z0-9_-]{1,80}$/.test(b.experienceId||''))fail('invalid_request');
 for(const k of ['answerRevision','profileRevision'])if(k in b&&(!Number.isInteger(b[k])||b[k]<0))fail('invalid_request');
 if('sourceHash' in b&&!/^[a-f0-9]{32}$/.test(b.sourceHash))fail('invalid_request');
 if(['generate_questions','summarize'].includes(b.action)&&(!/^[a-f0-9]{32}$/.test(b.sourceHash||'')||!Number.isInteger(b.answerRevision)||typeof b.requestKey!=='string'||b.requestKey.length<8||b.requestKey.length>100))fail('invalid_request');
 if(b.action==='save_answers'&&(!Array.isArray(b.answers)||b.answers.length>15||b.answers.some(a=>!a||!UUID.test(a.questionId)||typeof a.text!=='string'||[...a.text].length>4000||!['answered','unknown','skipped'].includes(a.status))))fail('invalid_request');
}
function remoteProvider(){
 if(process.env.INTERVIEW_LIFE_FOLLOWUP_ENGINE!=='remote')return undefined;
 const endpoint=process.env.INTERVIEW_LIFE_FOLLOWUP_ENGINE_URL,token=process.env.INTERVIEW_LIFE_FOLLOWUP_ENGINE_TOKEN;
 return async(payload,{signal})=>{
  const url=new URL(endpoint);if(url.protocol!=='https:'||url.username||url.password||!token)throw Error('engine_unconfigured');
  const response=await fetch(url,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(payload),signal});
  if(!response.ok)throw Error('engine_failed');
  const raw=await response.text();if(Buffer.byteLength(raw)>100000)throw Error('invalid_output');return JSON.parse(raw);
 };
}
function defaults(){return {
 provider:remoteProvider(),
 enabled:()=>process.env.INTERVIEW_LIFE_FOLLOWUP_ENABLED==='true',
 authenticateWeb:require('../lib/interview-web-auth').authenticatePortal,
 authenticateDevice:require('./criminal-law-ox')._private.authenticateStudent,
 previewAllowed:require('../lib/interview-preview-access').isPreviewStudent,
 invoke:(action,actor,body)=>require('./curriculum')._private.requestSupabase('POST','rpc/ip_life_followup_service',{p_action:action,p_actor:actor,p_body:body})
};}
function createHandler(deps){return async(req,res)=>{try{
 postOnly(req,res);sameOrigin(req);const b=await bodyOf(req,180000);validate(b);const d=deps||defaults();
 let student=await d.authenticateWeb(req);
 if(!student){if(!d.previewAllowed(b.studentId))fail('forbidden',403);student=await d.authenticateDevice({studentId:b.studentId,deviceToken:b.deviceToken});if(!student)fail('unauthorized',401);if(!d.previewAllowed(student.id))fail('forbidden',403);}
 const actor={type:'student',id:student.id};
 if(!d.enabled()){if(b.action==='availability')return res.status(200).json({ok:true,enabled:false,sessions:[]});fail('automation_disabled');}
 const body={...b};delete body.action;delete body.studentId;delete body.deviceToken;
 if(['generate_questions','summarize'].includes(b.action)){
  const claim=await d.invoke('claim',actor,{...body,kind:b.action});
  if(claim.claimed){
   try{
    const snapshot=await d.invoke('get',actor,{sessionId:b.sessionId});
    if(snapshot.sourceHash!==body.sourceHash||snapshot.session.answer_revision!==body.answerRevision)throw Error('source_changed');
    // Bounded engine execution; an optional provider must also cancel its network call.
    const output=await generate(snapshot,b.action,{provider:d.provider});
    await d.invoke('finish',actor,{sessionId:b.sessionId,requestId:claim.request.id,...output});
   }catch(e){await d.invoke('finish',actor,{sessionId:b.sessionId,requestId:claim.request.id,error:e.message==='source_changed'?'source_changed':'generation_failed'});}
  }
  return res.status(200).json(await d.invoke('status',actor,{sessionId:b.sessionId}));
 }
 res.status(200).json(await d.invoke(b.action,actor,body));
 }catch(e){
 const code=['revision_conflict','question_limit','answers_required','invalid_experience_date','incomplete_life'].find(c=>e.message===c||e.message?.includes(`"message":"${c}"`));
 if(code)return res.status(409).json({ok:false,error:code});sendError(res,e);
 }};}
module.exports=createHandler();module.exports.createHandler=createHandler;module.exports.validate=validate;
