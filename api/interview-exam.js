'use strict';
// Admin validation only. No student scoring, storage, or grade writes.
const {bodyOf,sameOrigin,postOnly}=require('../lib/interview-ai-http');
const {configuration,createProvider}=require('../lib/interview-exam-provider');
const {MAX_AUDIO_BYTES}=require('../lib/interview-exam-audio');
const {rubricSnapshot}=require('../lib/interview-exam-scoring');
const {evaluateAudio}=require('../lib/interview-exam-service');
const fail=(code,status=400)=>{throw Object.assign(new Error(code),{code,status});};
function defaults(){
  const auth=require('./teacher-auth-utils');
  return {config:configuration,provider:config=>createProvider({config}),
    authenticate:async req=>{
      const s=auth.readSessionToken(auth.readCookie(req,auth.COOKIE_NAME),auth.getConfig().secret);
      if(!s)fail('unauthorized',401);
      if(s.role!=='admin'||!auth.hasPermission(s,'interview.write'))fail('forbidden',403);
      return {type:'admin',id:s.username};
    },
    detail:(actor,id)=>require('./curriculum')._private.requestSupabase('POST','rpc/ip_rubric_service',
      {p_action:'admin_rubric_detail',p_actor:actor,p_body:{id}})};
}
function createHandler(deps){
  // A small per-instance brake for the admin pilot, not a distributed quota system.
  let busy=false,lastStarted=0;
  return async(req,res)=>{
    let admitted=false;
    try{
      postOnly(req,res);sameOrigin(req);
      const d=deps||defaults(),actor=await d.authenticate(req);
      const body=await bodyOf(req,4100000);
      if(!['status','validate_audio'].includes(body.action))fail('unsupported_action');
      const config=d.config();
      if(body.action==='status')return res.status(200).json({ok:true,enabled:config.enabled&&config.ready,mode:'admin_validation',maxAudioBytes:MAX_AUDIO_BYTES,format:'PCM 16-bit mono 16000 Hz WAV',maxSeconds:90});
      if(!config.enabled||!config.ready)fail('validation_not_configured',409);
      if(Object.keys(body).some(k=>!['action','questionId','questionRevision','rubricRevision','audioBase64'].includes(k)) ||
          typeof body.questionId!=='string'||!body.questionId||body.questionId.length>120 ||
          !Number.isInteger(body.questionRevision)||body.questionRevision<1||!Number.isInteger(body.rubricRevision)||body.rubricRevision<1 ||
          typeof body.audioBase64!=='string'||body.audioBase64.length>4000000||!body.audioBase64.length||
          body.audioBase64.length%4!==0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(body.audioBase64))fail('invalid_request');
      const audio=Buffer.from(body.audioBase64,'base64');
      if(audio.length>MAX_AUDIO_BYTES||audio.toString('base64')!==body.audioBase64)fail('invalid_audio');
      if(busy||Date.now()-lastStarted<30000)fail('validation_busy',429);
      busy=true;admitted=true;lastStarted=Date.now();
      const detail=await d.detail(actor,body.questionId),snapshot=rubricSnapshot(detail);
      if(snapshot.questionRevision!==body.questionRevision||snapshot.rubricRevision!==body.rubricRevision)fail('rubric_changed',409);
      const report=await evaluateAudio({audio,detail,provider:d.provider(config),loadCurrent:()=>d.detail(actor,body.questionId)});
      return res.status(200).json({ok:true,report});
    }catch(e){
      const known={unauthorized:401,forbidden:403,method_not_allowed:405,request_too_large:413,invalid_request:400,
        unsupported_action:400,invalid_audio:400,rubric_not_ready:409,rubric_changed:409,validation_not_configured:409,validation_busy:429};
      const code=Object.hasOwn(known,e.code||e.message)?(e.code||e.message):'validation_unavailable';
      if(code==='validation_busy')res.setHeader('Retry-After','30');
      return res.status(known[code]||503).json({ok:false,error:code});
    }finally{if(admitted)busy=false;}
  };
}
module.exports=createHandler();module.exports.createHandler=createHandler;
