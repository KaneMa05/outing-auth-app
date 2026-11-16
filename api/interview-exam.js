'use strict';
// Admin validation and persisted review reports. No student grade writes.
const {bodyOf,sameOrigin,postOnly}=require('../lib/interview-ai-http');
const {configuration,createProvider}=require('../lib/interview-exam-provider');
const {MAX_AUDIO_BYTES}=require('../lib/interview-exam-audio');
const {rubricSnapshot,digest}=require('../lib/interview-exam-scoring');
const {evaluateAudio}=require('../lib/interview-exam-service');
const fail=(code,status=400)=>{throw Object.assign(new Error(code),{code,status});};
function defaults(){
  const auth=require('./teacher-auth-utils');
  return {config:configuration,provider:config=>createProvider({config}),
    reports:require('../lib/interview-exam-reports.cjs').createReportRepository({invoke:(action,actor,body)=>require('./curriculum')._private.requestSupabase('POST','rpc/ip_exam_report_service',{p_action:action,p_actor:actor,p_body:body})}),
    authenticate:async (req,permission='interview.write')=>{
      const s=auth.readSessionToken(auth.readCookie(req,auth.COOKIE_NAME),auth.getConfig().secret);
      if(!s)fail('unauthorized',401);
      if(s.role!=='admin'||(permission&&!auth.hasPermission(s,permission)))fail('forbidden',403);
      return {type:'admin',id:s.username};
    },
    detail:(actor,id)=>require('./curriculum')._private.requestSupabase('POST','rpc/ip_rubric_service',
      {p_action:'admin_rubric_detail',p_actor:actor,p_body:{id}})};
}
function createHandler(deps){
  // A small per-instance brake for the admin pilot, not a distributed quota system.
  let busy=false,lastStarted=0;
  return async(req,res)=>{
    let admitted=false,reserved=false,finished=false,reportId,actor,d;
    try{
      postOnly(req,res);sameOrigin(req);
      d=deps||defaults();actor=await d.authenticate(req,null);
      const body=await bodyOf(req,4100000);
      if(!['status','validate_audio','report_list','report_get'].includes(body.action))fail('unsupported_action');
      if(['report_list','report_get'].includes(body.action)){
        actor=await d.authenticate(req,'interview.read');
        if(!d.reports)fail('reports_unavailable',503);
        const fields=body.action==='report_get'?['action','id']:['action','questionId','page'];
        if(Object.keys(body).some(k=>!fields.includes(k)))fail('invalid_request');
        if(body.action==='report_get'){
          if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.id||''))fail('invalid_request');
          return res.status(200).json(await d.reports.get(actor,body.id));
        }
        if(body.questionId!==undefined&&(typeof body.questionId!=='string'||!body.questionId||body.questionId.length>120))fail('invalid_request');
        if(body.page!==undefined&&(!Number.isInteger(body.page)||body.page<0||body.page>10000))fail('invalid_request');
        return res.status(200).json(await d.reports.list(actor,body));
      }
      actor=await d.authenticate(req,'interview.write');
      const config=d.config();
      if(body.action==='status')return res.status(200).json({ok:true,enabled:config.enabled&&config.ready,mode:'admin_validation',maxAudioBytes:MAX_AUDIO_BYTES,format:'PCM 16-bit mono 16000 Hz WAV',maxSeconds:90});
      if(!config.enabled||!config.ready)fail('validation_not_configured',409);
      if(Object.keys(body).some(k=>!['action','questionId','questionRevision','rubricRevision','audioBase64','requestKey'].includes(k)) ||
          typeof body.questionId!=='string'||!body.questionId||body.questionId.length>120 ||
          !Number.isInteger(body.questionRevision)||body.questionRevision<1||!Number.isInteger(body.rubricRevision)||body.rubricRevision<1 ||
          typeof body.audioBase64!=='string'||body.audioBase64.length>4000000||!body.audioBase64.length||
          body.audioBase64.length%4!==0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(body.audioBase64))fail('invalid_request');
      const audio=Buffer.from(body.audioBase64,'base64');
      if(audio.length>MAX_AUDIO_BYTES||audio.toString('base64')!==body.audioBase64)fail('invalid_audio');
      if(body.requestKey!==undefined&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.requestKey))fail('invalid_request');
      if(body.requestKey&&!d.reports)fail('reports_unavailable',503);
      if(busy||Date.now()-lastStarted<30000)fail('validation_busy',429);
      busy=true;admitted=true;lastStarted=Date.now();
      const detail=await d.detail(actor,body.questionId),snapshot=rubricSnapshot(detail);
      if(snapshot.questionRevision!==body.questionRevision||snapshot.rubricRevision!==body.rubricRevision)fail('rubric_changed',409);
      if(body.requestKey){
        const reservation=await d.reports.reserve(actor,{id:body.requestKey,questionId:body.questionId,questionRevision:body.questionRevision,rubricRevision:body.rubricRevision,audioHash:digest(audio)});
        reportId=body.requestKey;
        if(!reservation.created){
          if(reservation.record.state==='completed')return res.status(200).json({ok:true,report:reservation.record.report,record:reservation.record,persisted:true});
          fail(reservation.record.state==='processing'?'report_processing':'report_closed',409);
        }
        reserved=true;
      }
      const report=await evaluateAudio({audio,detail,provider:d.provider(config),loadCurrent:()=>d.detail(actor,body.questionId)});
      if(reserved){
        try {
          const saved=await d.reports.complete(actor,reportId,report);finished=true;
          return res.status(200).json({ok:true,report,record:saved.record,persisted:true});
        } catch {
          // Keep the generated result downloadable; never rerun paid inference to retry a save.
          finished=true;
          return res.status(200).json({ok:true,report,persisted:false,reportId,error:'report_storage_failed'});
        }
      }
      return res.status(200).json({ok:true,report,persisted:false});
    }catch(e){
      if(reserved&&!finished)try{await d.reports.fail(actor,reportId);}catch{}
      const known={unauthorized:401,forbidden:403,method_not_allowed:405,request_too_large:413,invalid_request:400,
        unsupported_action:400,invalid_audio:400,rubric_not_ready:409,rubric_changed:409,validation_not_configured:409,validation_busy:429,reports_unavailable:503,not_found:404,report_processing:409,report_closed:409,idempotency_conflict:409};
      const code=Object.keys(known).find(c=>(c===e.code||c===e.message)||e.message?.includes('\"message\":\"'+c+'\"'))||'validation_unavailable';
      if(code==='validation_busy')res.setHeader('Retry-After','30');
      return res.status(known[code]||503).json({ok:false,error:code});
    }finally{if(admitted)busy=false;}
  };
}
module.exports=createHandler();module.exports.createHandler=createHandler;
