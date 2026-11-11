'use strict';
const {postOnly,sameOrigin,bodyOf}=require('../lib/interview-ai-http');
const {inspectWav}=require('../lib/interview-exam-audio');
const {digest}=require('../lib/interview-exam-scoring');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function defaults(){return {
 enabled:process.env.INTERVIEW_PRACTICE_CLI_ENABLED==='true'&&require('../lib/interview-mock-cli-queue.cjs').configured(),
 authenticate:require('../lib/interview-web-auth').authenticatePortal,
 requireAccess:require('../lib/interview-mock-access').requireMockAccess,
 invoke:(action,actor,body={})=>require('./curriculum')._private.requestSupabase('POST','rpc/ip_practice_cli_service',{p_action:action,p_actor:actor,p_body:body}),
 storage:()=>require('../lib/interview-job-exam-storage.cjs').createJobExamStorage({url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY})
};}
function validate(b){
 const fields={status:[],get:['id'],submit:['id','mode','questionId','questionPrompt','audioBase64']};
 if(!fields[b.action]||typeof b.accountId!=='string'||!b.accountId||b.accountId.length>200||Object.keys(b).some(k=>!['action','accountId',...fields[b.action]].includes(k)))throw Error('invalid_request');
 if(b.action!=='status'&&!UUID.test(b.id||''))throw Error('invalid_request');
 if(b.action==='submit'&&(!['job','personality','ai'].includes(b.mode)||typeof b.questionId!=='string'||!b.questionId||b.questionId.length>120||typeof b.questionPrompt!=='string'||!b.questionPrompt.trim()||b.questionPrompt.length>4000))throw Error('invalid_request');
 if(b.action==='submit'&&(typeof b.audioBase64!=='string'||b.audioBase64.length>4000000||b.audioBase64.length%4||!/^[A-Za-z0-9+/]+={0,2}$/.test(b.audioBase64)))throw Error('invalid_audio');
}
function createHandler(deps){return async(req,res)=>{try{
 postOnly(req,res);sameOrigin(req);const b=await bodyOf(req,4100000);validate(b);const d=deps||defaults();
 const account=await d.authenticate(req);if(!account)throw Error('unauthorized');if(account.id!==b.accountId)throw Error('forbidden');await d.requireAccess(account.id);const actor={type:'student',id:account.id,...require('../lib/interview-test-app.cjs').testAppFields(req)};
 if(b.action==='status'&&!d.enabled)return res.status(200).json({ok:true,ready:false,provider:'windows-cli',liveCaptions:false,reason:'cli_not_configured'});
 if(!d.enabled)throw Error('cli_not_configured');
 if(b.action==='status'||b.action==='get')return res.status(200).json(await d.invoke(b.action,actor,b.action==='get'?{id:b.id}:{}));
 const audio=Buffer.from(b.audioBase64,'base64');if(audio.toString('base64')!==b.audioBase64)throw Error('invalid_audio');inspectWav(audio);
 const audioHash=digest(audio),claim=await d.invoke('create',actor,{id:b.id,mode:b.mode,questionId:b.questionId,questionPrompt:b.questionPrompt,audioHash});
 if(claim.audioNeeded){await d.storage().put(b.id,audio);await d.invoke('stored',{type:'server',id:'practice-cli'},{id:b.id,audioHash});}
 return res.status(200).json(await d.invoke('get',actor,{id:b.id}));
 }catch(e){
 const statuses={unauthorized:401,forbidden:403,method_not_allowed:405,request_too_large:413,invalid_request:400,invalid_audio:400,not_found:404,cli_not_configured:409,question_unavailable:409,idempotency_conflict:409,queue_full:429,daily_limit:429,recording_unavailable:503};
 const code=Object.keys(statuses).find(k=>e.message===k||e.code===k||e.message?.includes('"message":"'+k+'"'))||'practice_unavailable';
 return res.status(statuses[code]||503).json({ok:false,error:code});
 }};}
module.exports=createHandler();module.exports.createHandler=createHandler;module.exports.validate=validate;
