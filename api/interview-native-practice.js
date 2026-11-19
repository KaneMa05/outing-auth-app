'use strict';
const crypto=require('node:crypto');
const {bodyOf,postOnly,sameOrigin,sendError}=require('../lib/interview-ai-http');
const auth=require('../lib/interview-native-practice-auth.cjs');
function defaults(){const rpc=require('./curriculum')._private.requestSupabase;return {
 enabled:process.env.INTERVIEW_NATIVE_PRACTICE_ENABLED!=='false',secret:process.env.INTERVIEW_LIVE_WORKER_SECRET||'',
 authenticateWeb:require('../lib/interview-web-auth').authenticatePortal,
 authenticateDevice:require('./criminal-law-ox')._private.authenticateStudent,
 requireAccess:id=>require('../lib/interview-mock-access').requireMockAccess(id,{practiceOnly:true}),
 // This existing service supports all authenticated portal owners via the internal
 // enrollment compatibility field. Domain-separated hashes cannot be exchanged
 // through live/test endpoints; beta access is rechecked before and after consume.
 invoke:(action,actor,body)=>rpc('POST','rpc/ip_native_launch_service',{p_action:action,p_actor:{...actor,testApp:true},p_body:body}),
 bootstrap:async(student,mode)=>{const info=await rpc('POST','rpc/ip_service',{p_action:'bootstrap',p_actor:{type:'student',id:student.id},p_body:{}});const pool=await require('../lib/interview-practice-catalog.cjs').practiceCatalog(rpc,{track:info.member.track,mode});return {ok:true,accountId:student.id,track:info.member.track,mode,fields:pool.fields||[],questions:pool.questions};}
 };}
function createHandler(deps){return async(req,res)=>{try{
 postOnly(req,res);sameOrigin(req);const b=await bodyOf(req,10000),d=deps||defaults();
 if(!d.enabled||d.secret.length<32)throw Error('automation_disabled');
 if(!auth.validMode(b.mode)||!['launch','exchange','bootstrap'].includes(b.action))throw Error('invalid_request');
 const allowed=b.action==='launch'?['action','mode','studentId','deviceToken']:b.action==='exchange'?['action','mode','code']:['action','mode'];
 if(Object.keys(b).some(key=>!allowed.includes(key)))throw Error('invalid_request');
 if(b.action==='launch'){
  let user=await d.authenticateWeb(req);
  if(user&&('studentId' in b||'deviceToken' in b)&&user.id!==b.studentId)throw Error('forbidden');
  if(!user){if(typeof b.studentId!=='string'||!b.studentId||b.studentId.length>120||typeof b.deviceToken!=='string'||!b.deviceToken||b.deviceToken.length>256)throw Error('unauthorized');user=await d.authenticateDevice({studentId:b.studentId,deviceToken:b.deviceToken});if(!user||user.id!==b.studentId)throw Error('unauthorized');}
  await d.requireAccess(user.id);const code=crypto.randomBytes(32).toString('base64url');
  await d.invoke('issue',{type:'student',id:user.id},{codeHash:auth.codeHash(code,b.mode)});return res.status(200).json({ok:true,code,expiresIn:60});
 }
 if(b.action==='exchange'){
  const data=await d.invoke('consume',{type:'server',id:'native-practice'},{codeHash:auth.codeHash(b.code,b.mode)});
  await d.requireAccess(data.studentId);return res.status(200).json({ok:true,token:auth.issue(data.studentId,b.mode,d.secret),accountId:data.studentId,mode:b.mode,expiresIn:7200});
 }
 const user=auth.read((req.headers.authorization||'').replace(/^Bearer /,''),d.secret);
 if(user.practiceMode!==b.mode)throw Error('forbidden');await d.requireAccess(user.id);
 return res.status(200).json(await d.bootstrap(user,b.mode));
 }catch(error){sendError(res,error);}};}
module.exports=createHandler();module.exports.createHandler=createHandler;
