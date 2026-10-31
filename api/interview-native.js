'use strict';
const crypto=require('node:crypto');
const {bodyOf,postOnly,sameOrigin,sendError}=require('../lib/interview-ai-http');
const auth=require('../lib/interview-native-auth'),live=require('./interview-live');
function defaults(){return {enabled:process.env.INTERVIEW_NATIVE_ENABLED==='true',secret:process.env.INTERVIEW_LIVE_WORKER_SECRET||'',
 readTrack:async id=>{const rows=await require('./curriculum')._private.requestSupabase('GET','ip_members?select=track&student_id=eq.'+encodeURIComponent(id));return rows[0]?.track||'';},
 live:live.defaults(),invoke:(action,actor,body)=>require('./curriculum')._private.requestSupabase('POST','rpc/ip_native_launch_service',{p_action:action,p_actor:actor,p_body:body})};}
function createHandler(deps){return async(req,res)=>{try{
 postOnly(req,res);sameOrigin(req);const b=await bodyOf(req,68000),d=deps||defaults();
 if(!d.enabled||d.secret.length<32)throw Error('automation_disabled');
 if(b.action==='launch'){
  if(Object.keys(b).some(k=>!['action','studentId','deviceToken'].includes(k)))throw Error('invalid_request');
  let student=await d.live.authenticateWeb(req);
  if(!student){if(!d.live.previewAllowed(b.studentId))throw Error('forbidden');student=await d.live.authenticateDevice({studentId:b.studentId,deviceToken:b.deviceToken});if(!student||!d.live.previewAllowed(student.id))throw Error('unauthorized');}
  await (d.requireMockAccess||require('../lib/interview-mock-access').requireMockAccess)(student.id);
  const code=crypto.randomBytes(32).toString('base64url');await d.invoke('issue',{type:'student',id:student.id},{codeHash:auth.hash(code)});
  return res.status(200).json({ok:true,code,expiresIn:60});
 }
 if(b.action==='exchange'){
  if(Object.keys(b).some(k=>!['action','code'].includes(k))||!/^[A-Za-z0-9_-]{43}$/.test(b.code||''))throw Error('invalid_request');
  const data=await d.invoke('consume',{type:'server',id:'native'},{codeHash:auth.hash(b.code)});
  await (d.requireMockAccess||require('../lib/interview-mock-access').requireMockAccess)(data.studentId);
  const track=d.readTrack?await d.readTrack(data.studentId):'';
  return res.status(200).json({ok:true,token:auth.issue(data.studentId,d.secret),expiresIn:1800,track:['공채','항해','기관','방제','관제','기타'].includes(track)?track:''});
 }
 if(b.action==='command'){
  if(Object.keys(b).some(k=>!['action','command'].includes(k))||!b.command||typeof b.command!=='object'||Array.isArray(b.command))throw Error('invalid_request');
  const student=auth.read((req.headers.authorization||'').replace(/^Bearer /,''),d.secret);
  if(!['ready','start','begin','heartbeat','answer_done','finish','list','get'].includes(b.command.action)||'studentId' in b.command||'deviceToken' in b.command)throw Error('forbidden');
  return live.createHandler({...d.live,requireMockAccess:d.requireMockAccess||d.live.requireMockAccess,authenticateWeb:async()=>student})({...req,body:b.command},res);
 }
 throw Error('unsupported_action');
 }catch(e){sendError(res,e);}};}
module.exports=createHandler();module.exports.createHandler=createHandler;
