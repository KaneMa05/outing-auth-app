'use strict';
const crypto=require('node:crypto');
const {bodyOf,postOnly}=require('../lib/interview-ai-http');
const {UUID}=require('../lib/interview-ai-validation');
function createHandler({env=process.env,read=require('./curriculum')._private.requestSupabase,now=Date.now,invoke=(action,body)=>read('POST','rpc/ip_draft_question_service',{p_action:action,p_actor:{type:'worker'},p_body:body})}={}){
 return async(req,res)=>{try{
  res.setHeader('Cache-Control','no-store');
  postOnly(req,res);if(req.headers.origin)throw Error('forbidden');
  const expected=env.INTERVIEW_CORE25_WORKER_TOKEN;
  if(env.INTERVIEW_DRAFT_QUESTIONS_ENABLED!=='true'||!/^[A-Za-z0-9_-]{43}$/.test(expected||''))throw Error('automation_disabled');
  const token=/^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.headers.authorization||'')?.[1];
  if(!token||!crypto.timingSafeEqual(Buffer.from(token),Buffer.from(expected)))throw Error('unauthorized');
  const b=await bodyOf(req,6000),fields={heartbeat:[],poll:[],complete:['id','lease','questions'],fail:['id','lease']};
  if(!fields[b.action]||Object.keys(b).some(k=>!['action',...fields[b.action]].includes(k))||fields[b.action].some(k=>b[k]===undefined))throw Error('invalid_request');
  if(b.action==='heartbeat'){
   await read('POST','ip_draft_worker_presence?on_conflict=id',{id:true,seen_at:new Date(now()).toISOString()},{Prefer:'resolution=merge-duplicates,return=minimal'});
   res.status(200).json({ok:true});return;
  }
  if(b.action!=='poll'&&(!UUID.test(b.id)||!UUID.test(b.lease)))throw Error('invalid_request');
  res.status(200).json(await invoke(b.action,b));
 }catch(e){const codes={unauthorized:401,forbidden:403,automation_disabled:409,lease_lost:409,invalid_request:400,invalid_output:422,request_too_large:413,method_not_allowed:405};const code=Object.keys(codes).find(c=>e.message===c||e.message?.includes('"message":"'+c+'"'));res.status(codes[code]||503).json({ok:false,error:code||'automation_unavailable'});}};
}
module.exports=createHandler();module.exports.createHandler=createHandler;
