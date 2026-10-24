'use strict';
const crypto=require('node:crypto');
const {bodyOf,postOnly}=require('../lib/interview-ai-http');
const {validateReport}=require('../lib/preassignment-diagnosis.cjs');
const {ENGINE_VERSION}=require('../lib/core25-worker-config.cjs');
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const enabled=env=>env.INTERVIEW_CORE25_DIAGNOSIS_ENABLED==='true'&&env.INTERVIEW_CORE25_DIAGNOSIS_MODE==='pc'&&/^[A-Za-z0-9_-]{43}$/.test(env.INTERVIEW_CORE25_WORKER_TOKEN||'');
function createHandler({env=process.env,invoke=(action,body)=>require('./curriculum')._private.requestSupabase('POST','rpc/ip_pa_worker_service',{p_action:action,p_body:body})}={}){
 return async(req,res)=>{try{
  postOnly(req,res);
  if(req.headers.origin)throw Error('forbidden');
  if(!enabled(env))throw Error('diagnosis_not_configured');
  const token=/^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.headers.authorization||'')?.[1];
  if(!token||!crypto.timingSafeEqual(Buffer.from(token),Buffer.from(env.INTERVIEW_CORE25_WORKER_TOKEN)))throw Error('unauthorized');
  const b=await bodyOf(req,65000),fields={poll:['capacity'],complete:['id','lease','report'],fail:['id','lease']};
  if(!fields[b.action]||Object.keys(b).some(k=>!['action','engineVersion',...fields[b.action]].includes(k))||fields[b.action].some(k=>b[k]===undefined))throw Error('invalid_request');
  if(b.engineVersion!==ENGINE_VERSION)throw Error('engine_mismatch');
  const common={engineVersion:ENGINE_VERSION};let result;
  if(b.action==='poll'){
   if(!Number.isInteger(b.capacity)||b.capacity<0||b.capacity>3)throw Error('invalid_request');
   result=await invoke('poll',{...common,capacity:b.capacity});
  }else{
   if(!UUID.test(b.id)||!UUID.test(b.lease))throw Error('invalid_request');
   Object.assign(common,{id:b.id,lease:b.lease});
   if(b.action==='fail')result=await invoke('finish',{...common,error:'diagnosis_unavailable'});
   else{const job=await invoke('inspect',common);
    result=job.status==='completed'?{ok:true,status:'completed'}:await invoke('finish',{...common,report:validateReport(b.report,job.snapshot)});
   }
  }
  res.status(200).json(result);
 }catch(e){const errors={forbidden:403,unauthorized:401,diagnosis_not_configured:409,engine_mismatch:409,lease_lost:409,invalid_request:400,invalid_diagnosis:422,request_too_large:413,method_not_allowed:405};
  const code=Object.keys(errors).find(c=>e.message===c||e.message?.includes('"message":"'+c+'"'));
  res.status(errors[code]||503).json({ok:false,error:code||'diagnosis_unavailable'});
 }};
}
module.exports=createHandler();module.exports.createHandler=createHandler;module.exports.enabled=enabled;
