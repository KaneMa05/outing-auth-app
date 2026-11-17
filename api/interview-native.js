'use strict';
const interviewTracks=require('../lib/interview-tracks.json');
const crypto=require('node:crypto');
const {bodyOf,postOnly,sameOrigin,sendError}=require('../lib/interview-ai-http');
const auth=require('../lib/interview-native-auth'),live=require('./interview-live');
function defaults(){return {enabled:require('../lib/interview-openai-config.cjs').feature('INTERVIEW_NATIVE_ENABLED'),secret:process.env.INTERVIEW_LIVE_WORKER_SECRET||'',
 readTrack:async id=>{const rows=await require('./curriculum')._private.requestSupabase('GET','ip_members?select=track&student_id=eq.'+encodeURIComponent(id));return rows[0]?.track||'';},
 practiceBootstrap:async(student,mode)=>{
 const rpc=require('./curriculum')._private.requestSupabase;
 const actor={type:'student',id:student.id,testApp:true};
 const access=await rpc('POST','rpc/ip_mock_access_service',{p_action:'mock_status',p_actor:actor,p_body:{}});
 if(access.allowed!==true)throw Error('forbidden');
 const info=await rpc('POST','rpc/ip_service',{p_action:'bootstrap',p_actor:actor,p_body:{}});
 const pool=await require('../lib/interview-practice-catalog.cjs').practiceCatalog(rpc,{track:info.member.track,mode,testOnly:true});
 return {ok:true,accountId:student.id,track:info.member.track,mode,...pool};
 },live:live.defaults(),invoke:(action,actor,body)=>require('./curriculum')._private.requestSupabase('POST','rpc/ip_native_launch_service',{p_action:action,p_actor:actor,p_body:body})};}
function createHandler(deps){return async(req,res)=>{try{
 postOnly(req,res);sameOrigin(req);const b=await bodyOf(req,68000),d=deps||defaults();
 if(!d.enabled||d.secret.length<32)throw Error('automation_disabled');
 if(b.action==='launch'){
  if(Object.keys(b).some(k=>!['action','studentId','deviceToken'].includes(k)))throw Error('invalid_request');
  let student=await d.live.authenticateWeb(req);
  if(!student){if(!d.live.previewAllowed(b.studentId))throw Error('forbidden');student=await d.live.authenticateDevice({studentId:b.studentId,deviceToken:b.deviceToken});if(!student||!d.live.previewAllowed(student.id))throw Error('unauthorized');}
  await (d.requireMockAccess||require('../lib/interview-mock-access').requireMockAccess)(student.id);
  const code=crypto.randomBytes(32).toString('base64url');await d.invoke('issue',{type:'student',id:student.id,...require('../lib/interview-test-app.cjs').testAppFields(req)},{codeHash:auth.hash(code)});
  return res.status(200).json({ok:true,code,expiresIn:60});
 }
 if(b.action==='exchange'){
  if(Object.keys(b).some(k=>!['action','code','practice'].includes(k))||!/^[A-Za-z0-9_-]{43}$/.test(b.code||''))throw Error('invalid_request');
  if(b.practice!==undefined&&(b.practice!==true||req.headers['x-interview-test-app']!=='1'))throw Error('forbidden');
  const data=await d.invoke('consume',{type:'server',id:'native',...require('../lib/interview-test-app.cjs').testAppFields(req)},{codeHash:auth.hash(b.code)});
  await (d.requireMockAccess||require('../lib/interview-mock-access').requireMockAccess)(data.studentId);
  const track=d.readTrack?await d.readTrack(data.studentId):'';
  return res.status(200).json({ok:true,token:b.practice===true?auth.issuePractice(data.studentId,d.secret):auth.issue(data.studentId,d.secret),accountId:data.studentId,expiresIn:b.practice===true?7200:1800,track:interviewTracks.includes(track)?track:''});
 }
 if(b.action==='practice_bootstrap'){
  if(req.headers['x-interview-test-app']!=='1'||Object.keys(b).some(k=>!['action','mode'].includes(k))||!['job','personality','ai'].includes(b.mode))throw Error('forbidden');
  const student=auth.readPractice((req.headers.authorization||'').replace(/^Bearer /,''),d.secret);
  return res.status(200).json(await d.practiceBootstrap(student,b.mode));
 }
 if(b.action==='command'){
  if(Object.keys(b).some(k=>!['action','command'].includes(k))||!b.command||typeof b.command!=='object'||Array.isArray(b.command))throw Error('invalid_request');
  const student=auth.read((req.headers.authorization||'').replace(/^Bearer /,''),d.secret);
  if(!['ready','start','begin','heartbeat','answer_done','finish','list','get','analysis_request','analysis_get'].includes(b.command.action)||'studentId' in b.command||'deviceToken' in b.command)throw Error('forbidden');
  return live.createHandler({...d.live,requireMockAccess:d.requireMockAccess||d.live.requireMockAccess,authenticateWeb:async()=>student})({method:req.method,headers:req.headers,body:b.command},res);
 }
 throw Error('unsupported_action');
 }catch(e){sendError(res,e);}};}
module.exports=createHandler();module.exports.createHandler=createHandler;
