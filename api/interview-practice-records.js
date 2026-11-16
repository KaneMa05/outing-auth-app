'use strict';
const {bodyOf,sameOrigin,postOnly,sendError}=require('../lib/interview-ai-http');
const {UUID,fail}=require('../lib/interview-ai-validation');
function defaults(){const auth=require('./teacher-auth-utils');return {
 authenticateWeb:require('../lib/interview-web-auth').authenticatePortal,
 authenticateNative:async req=>{
  if(process.env.INTERVIEW_NATIVE_ENABLED!=='true'||req.headers['x-interview-test-app']!=='1')return null;
  return require('../lib/interview-native-auth').readPractice((req.headers.authorization||'').replace(/^Bearer /,''),process.env.INTERVIEW_LIVE_WORKER_SECRET||'');
 },
 authenticateAdmin:async req=>{
  const session=auth.readSessionToken(auth.readCookie(req,auth.COOKIE_NAME),auth.getConfig().secret);
  if(!session)fail('unauthorized');
  if(session.role!=='admin'||!auth.hasPermission(session,'interview.read'))fail('forbidden');
  return {id:session.username};
 },
 invoke:(action,actor,body)=>require('./curriculum')._private.requestSupabase('POST','rpc/ip_practice_service',{p_action:action,p_actor:actor,p_body:body}),
 storage:require('../lib/interview-practice-storage').createStorage({url:process.env.SUPABASE_URL||'',key:process.env.SUPABASE_SERVICE_ROLE_KEY||''})
};}
function validate(b){
 const fields={sync:['runId','mode','track','fieldId','fieldLabel','region','recordedAt','questionCount','completed','finished','turns'],uploaded:['runId','number','audioHash'],admin_list:['page','search','mode'],admin_get:['runId'],admin_audio:['runId','number']};
 if(!fields[b.action])fail('unsupported_action');
 if(Object.keys(b).some(k=>k!=='action'&&!fields[b.action].includes(k)))fail('invalid_request');
 if(b.action!=='admin_list'&&!UUID.test(b.runId||''))fail('invalid_request');
 if('number' in b&&(!Number.isInteger(b.number)||b.number<1||b.number>20))fail('invalid_request');
 if(['uploaded','admin_audio'].includes(b.action)&&!Number.isInteger(b.number))fail('invalid_request');
 if(b.action==='uploaded'&&!/^[a-f0-9]{64}$/.test(b.audioHash||''))fail('invalid_request');
 if(b.action==='admin_list'){
  if(b.page!==undefined&&(!Number.isInteger(b.page)||b.page<0||b.page>10000))fail('invalid_request');
  if(b.search!==undefined&&(typeof b.search!=='string'||b.search.length>120))fail('invalid_request');
  if(b.mode!==undefined&&!['','job','personality','ai'].includes(b.mode))fail('invalid_request');
 }
 if(b.action==='sync'){
  if(!['job','personality','ai'].includes(b.mode)||!['공채','항해','기관','방제','관제','기타'].includes(b.track)||
   typeof b.recordedAt!=='string'||!Number.isFinite(Date.parse(b.recordedAt))||Date.parse(b.recordedAt)>Date.now()+86400000||
   !Number.isInteger(b.questionCount)||b.questionCount<0||b.questionCount>20||typeof b.completed!=='boolean'||typeof b.finished!=='boolean'||
   !Array.isArray(b.turns)||b.turns.length>20)fail('invalid_request');
  for(const k of ['fieldId','fieldLabel','region'])if(typeof b[k]!=='string'||b[k].length>120)fail('invalid_request');
  const numbers=new Set();
  for(const t of b.turns){
   if(!t||Object.keys(t).some(k=>!['number','questionId','question','answer','duration','audioBytes','audioHash'].includes(k))||
    !Number.isInteger(t.number)||t.number<1||t.number>b.questionCount||numbers.has(t.number)||typeof t.questionId!=='string'||t.questionId.length>120||
    typeof t.question!=='string'||!t.question.length||t.question.length>4000||typeof t.answer!=='string'||t.answer.length>10000||
    !Number.isFinite(t.duration)||t.duration<0||t.duration>3600||!Number.isInteger(t.audioBytes)||t.audioBytes<0||t.audioBytes>16777216||
    (t.audioBytes===0?t.audioHash!=='':t.audioBytes<=44||!/^[a-f0-9]{64}$/.test(t.audioHash||'')))fail('invalid_request');
   numbers.add(t.number);
  }
 }
}
function createHandler(deps){return async(req,res)=>{try{
 postOnly(req,res);sameOrigin(req);const b=await bodyOf(req,1200000);validate(b);const d=deps||defaults();
 const admin=b.action.startsWith('admin_');const user=admin?await d.authenticateAdmin(req):(await d.authenticateWeb(req))||(d.authenticateNative?await d.authenticateNative(req):null);
 if(!user?.id)fail('unauthorized');const actor={type:admin?'admin':'student',id:user.id};
 if(b.action==='uploaded'){
  const data=await d.invoke('get',actor,{runId:b.runId});
  const turn=data.turns.find(t=>t.number===b.number&&t.audio_hash===b.audioHash&&t.audio_bytes>0);
  if(!turn)fail('not_found');
  await d.storage.verify(b.runId,turn);
  await d.invoke('uploaded',actor,b);return res.status(200).json({ok:true});
 }
 const data=await d.invoke(b.action,actor,b);
 if(b.action==='sync'){
  const uploads=[];
  for(const turn of data.turns.filter(t=>!t.uploaded&&t.audio_bytes>0))uploads.push({number:turn.number,audioHash:turn.audio_hash,url:await d.storage.upload(b.runId,turn)});
  return res.status(200).json({ok:true,uploads});
 }
 if(b.action==='admin_audio'){
  const turn=data.turns.find(t=>t.number===b.number&&t.uploaded);
  if(!turn)fail('not_found');return res.status(200).json({ok:true,url:await d.storage.signed(b.runId,turn)});
 }
 return res.status(200).json(data);
 }catch(error){sendError(res,error);}};}
module.exports=createHandler();module.exports.createHandler=createHandler;module.exports.validate=validate;
