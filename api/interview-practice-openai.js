'use strict';
const {randomUUID,timingSafeEqual}=require('node:crypto');
const {postOnly,sameOrigin,bodyOf}=require('../lib/interview-ai-http');
const {inspectWav}=require('../lib/interview-exam-audio');
const {digest}=require('../lib/interview-exam-scoring');
const {validate}=require('./interview-practice-cli');
const {analyzeTask}=require('../lib/interview-mock-analysis.cjs');
const SERVER={type:'server',id:'openai-practice'};
function defaults(){
 const settings=require('../lib/interview-openai-config.cjs'),models=settings.models(),env=process.env;
 const enabled=settings.feature('INTERVIEW_JOB_EXAM_ENABLED')&&settings.feature('INTERVIEW_PERSONALITY_ENABLED')&&!!env.OPENAI_API_KEY&&!!models.transcriber&&!!models.report&&!!env.SUPABASE_URL&&!!env.SUPABASE_SERVICE_ROLE_KEY&&env.CRON_SECRET?.length>=32;
 return {enabled,authenticate:require('../lib/interview-web-auth').authenticatePortal,requireAccess:require('../lib/interview-mock-access').requireMockAccess,
  invoke:(action,actor,body={})=>require('./curriculum')._private.requestSupabase('POST','rpc/ip_openai_practice_service',{p_action:action,p_actor:actor,p_body:body}),
  storage:()=>require('../lib/interview-job-exam-storage.cjs').createJobExamStorage({url:env.SUPABASE_URL,key:env.SUPABASE_SERVICE_ROLE_KEY,prefix:'openai-practice/'}),
  schedule:require('@vercel/functions').waitUntil,secret:env.CRON_SECRET||'',
  provider:()=>{
   const asr=require('../lib/interview-exam-provider').createProvider({config:{enabled:true,ready:true,key:env.OPENAI_API_KEY,models:{transcriber:models.transcriber},transcriptionContext:'한국어 해양경찰 면접 연습 녹음입니다. 들리는 발화를 원문 그대로 전사합니다. 부정 표현, 숫자, 단위, 전문용어, 말의 정정과 반복을 보존하며 들리지 않는 내용은 추측하거나 보충하지 않습니다.'}});
   return {models:{transcriber:models.transcriber,analyzer:models.report},transcribe:(audio,{pass})=>asr.transcribe(audio,pass),
    infer:require('../lib/interview-openai-report.cjs').createOpenAIInference({key:env.OPENAI_API_KEY,model:models.report})};
  }};
}
async function cleanup(deps=defaults()){
 const {runs}=await deps.invoke('sweep',SERVER,{});let removed=0;
 for(const run of runs){await deps.storage().remove(run.id);await deps.invoke('purge',SERVER,{id:run.id});removed++;}
 return {ok:true,removed};
}
async function processClaim(d,{id,token,question,audio}){
 try{
  const provider=d.provider(),prepared=require('../lib/interview-practice-audio.cjs').preparePracticeAudio(audio);
  const report=await analyzeTask({kind:'practice',question,audio},{...provider,transcribe:(_,options)=>provider.transcribe(prepared.audio,options),parallelTranscription:true,practiceReference:true});
  report.audit.audioPreparation={gain:prepared.gain,quality:prepared.quality};
  await d.invoke('complete',SERVER,{id,token,report});
 }catch{
  // Provider/response uncertainty never creates a second paid execution.
  try{await d.invoke('unknown',SERVER,{id,token});}catch{}
 }
}
function createHandler(deps){return async(req,res)=>{
 try{
  postOnly(req,res);sameOrigin(req);const b=await bodyOf(req,4100000),d=deps||defaults();
  if(b.action==='cleanup'){
   const expected='Bearer '+d.secret,actual=req.headers.authorization||'';
   if(!d.secret||d.secret.length<32||Buffer.byteLength(actual)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(actual),Buffer.from(expected)))throw Error('unauthorized');
   if(Object.keys(b).some(k=>k!=='action'))throw Error('invalid_request');
   return res.status(200).json(await cleanup(d));
  }
  validate(b);if(b.action==='submit'&&!['job','personality'].includes(b.mode))throw Error('invalid_request');
  const account=await d.authenticate(req);if(!account)throw Error('unauthorized');if(account.id!==b.accountId)throw Error('forbidden');
  await d.requireAccess(account.id);const actor={type:'student',id:account.id,...require('../lib/interview-test-app.cjs').testAppFields(req)};
  // Saved reports remain readable even if generation is temporarily disabled.
  if(b.action==='get')return res.status(200).json(await d.invoke('get',actor,{id:b.id}));
  if(!d.enabled){if(b.action==='status')return res.status(200).json({ok:true,ready:false,provider:'openai',liveCaptions:false,reason:'practice_not_configured'});throw Error('practice_not_configured');}
  if(b.action==='status')return res.status(200).json(await d.invoke('status',actor,{}));
  const audio=Buffer.from(b.audioBase64,'base64');if(audio.toString('base64')!==b.audioBase64)throw Error('invalid_audio');inspectWav(audio);
  const audioHash=digest(audio),created=await d.invoke('create',actor,{id:b.id,mode:b.mode,questionId:b.questionId,questionPrompt:b.questionPrompt,audioHash});
  if(created.audioNeeded){
   await d.storage().put(b.id,audio);
   const token=randomUUID(),claim=await d.invoke('claim',SERVER,{id:b.id,audioHash,token});
   if(claim.claimed)d.schedule(processClaim(d,{id:b.id,token,question:claim.question,audio}));
  }
  return res.status(200).json(await d.invoke('get',actor,{id:b.id}));
 }catch(error){
  const statuses={unauthorized:401,forbidden:403,method_not_allowed:405,request_too_large:413,invalid_request:400,invalid_audio:400,not_found:404,practice_not_configured:409,question_unavailable:409,idempotency_conflict:409,queue_full:429,daily_limit:429,recording_unavailable:503};
  const code=Object.keys(statuses).find(k=>error.message===k||error.code===k||error.message?.includes('"message":"'+k+'"'))||'practice_unavailable';
  return res.status(statuses[code]||503).json({ok:false,error:code});
 }
};}
module.exports=createHandler();module.exports.createHandler=createHandler;module.exports.cleanup=cleanup;
