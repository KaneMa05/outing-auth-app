'use strict';
const {bodyOf,sameOrigin,postOnly,sendError}=require('../lib/interview-ai-http');
const {UUID,fail}=require('../lib/interview-ai-validation');
function defaults(){const auth=require('./teacher-auth-utils');return {
 previewAllowed:require('../lib/interview-preview-access').isPreviewStudent,
 authenticateDevice:require('./criminal-law-ox')._private.authenticateStudent,
 requirePracticeAccess:require('../lib/interview-mock-access').requireMockAccess,
 authenticateWeb:require('../lib/interview-web-auth').authenticatePortal,
 authenticateNative:async req=>{
  if(process.env.INTERVIEW_NATIVE_ENABLED!=='true'||req.headers['x-interview-test-app']!=='1')return null;
  return require('../lib/interview-native-auth').readPractice((req.headers.authorization||'').replace(/^Bearer /,''),process.env.INTERVIEW_LIVE_WORKER_SECRET||'');
 },
 authenticateAdmin:async(req,{write=false}={})=>{
  const session=auth.readSessionToken(auth.readCookie(req,auth.COOKIE_NAME),auth.getConfig().secret);
  if(!session)fail('unauthorized');
  if(session.role!=='admin'||!auth.hasPermission(session,write?'interview.write':'interview.read'))fail('forbidden');
  return {id:session.username};
 },
 invoke:(action,actor,body)=>require('./curriculum')._private.requestSupabase('POST','rpc/ip_practice_service',{p_action:action,p_actor:actor,p_body:body}),
 transcription:(action,actor,body)=>require('./curriculum')._private.requestSupabase('POST','rpc/ip_practice_transcription_service',{p_action:action,p_actor:actor,p_body:body}),
 storage:require('../lib/interview-practice-storage').createStorage({url:process.env.SUPABASE_URL||'',key:process.env.SUPABASE_SERVICE_ROLE_KEY||''})
};}
function validate(b){
 const fields={sync:['runId','mode','track','fieldId','fieldLabel','region','recordedAt','questionCount','completed','finished','turns'],uploaded:['runId','number','audioHash'],admin_list:['page','search','mode'],admin_get:['runId'],admin_audio:['runId','number'],admin_review:['runId','number','revision','reviewStatus','correctedText','note'],admin_retry:['runId','number']};
 if(!fields[b.action])fail('unsupported_action');
 if(Object.keys(b).some(k=>k!=='action'&&!fields[b.action].includes(k)))fail('invalid_request');
 if(b.action!=='admin_list'&&!UUID.test(b.runId||''))fail('invalid_request');
 if('number' in b&&(!Number.isInteger(b.number)||b.number<1||b.number>20))fail('invalid_request');
 if(['uploaded','admin_audio','admin_review','admin_retry'].includes(b.action)&&!Number.isInteger(b.number))fail('invalid_request');
 if(b.action==='admin_review'&&(!Number.isInteger(b.revision)||b.revision<1||!['pending','ok','minor','meaning','unclear'].includes(b.reviewStatus)||
  typeof b.correctedText!=='string'||b.correctedText.length>30000||typeof b.note!=='string'||b.note.length>3000||
  (['ok','minor','meaning'].includes(b.reviewStatus)&&!b.correctedText.trim())))fail('invalid_request');
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
   if(!t||Object.keys(t).some(k=>!['number','questionId','question','answer','duration','audioBytes','audioHash','audioMime'].includes(k))||
    !Number.isInteger(t.number)||t.number<1||t.number>b.questionCount||numbers.has(t.number)||typeof t.questionId!=='string'||t.questionId.length>120||
    typeof t.question!=='string'||!t.question.length||t.question.length>4000||typeof t.answer!=='string'||t.answer.length>10000||
    !Number.isFinite(t.duration)||t.duration<0||t.duration>3600||!Number.isInteger(t.audioBytes)||t.audioBytes<0||t.audioBytes>16777216||
    (t.audioBytes===0?t.audioHash!=='':t.audioBytes<=44||!/^[a-f0-9]{64}$/.test(t.audioHash||'')))fail('invalid_request');
   if(t.audioMime!==undefined&&!['audio/mp4','audio/webm','audio/ogg'].includes(t.audioMime))fail('invalid_request');
   numbers.add(t.number);
  }
 }
}
function createHandler(deps){return async(req,res)=>{try{
 postOnly(req,res);sameOrigin(req);const raw=await bodyOf(req,1200000),credentials=('studentId' in raw||'deviceToken' in raw)?{studentId:raw.studentId,deviceToken:raw.deviceToken}:null;
 if(credentials&&(raw.action?.startsWith('admin_')||typeof credentials.studentId!=='string'||credentials.studentId.length>120||typeof credentials.deviceToken!=='string'||credentials.deviceToken.length>256))fail('invalid_request');
 const b={...raw};delete b.studentId;delete b.deviceToken;validate(b);const d=deps||defaults();
 const admin=b.action.startsWith('admin_');let user=admin?await d.authenticateAdmin(req,{write:['admin_review','admin_retry'].includes(b.action)}):(await d.authenticateWeb(req))||(d.authenticateNative?await d.authenticateNative(req):null);
 if(credentials){if(!d.previewAllowed?.(credentials.studentId))fail('forbidden');if(user&&user.id!==credentials.studentId)fail('forbidden');if(!user&&d.authenticateDevice)user=await d.authenticateDevice(credentials);if(user?.id!==credentials.studentId)fail('unauthorized');}
 if(!user?.id)fail('unauthorized');if(!admin&&d.requirePracticeAccess)await d.requirePracticeAccess(user.id);const actor={type:admin?'admin':'student',id:user.id};
 if(b.action==='uploaded'){
  const data=await d.invoke('get',actor,{runId:b.runId});
  const turn=data.turns.find(t=>t.number===b.number&&t.audio_hash===b.audioHash&&t.audio_bytes>0);
  if(!turn)fail('not_found');
  await d.storage.verify(b.runId,turn);
  await d.invoke('uploaded',actor,b);return res.status(200).json({ok:true});
 }
 if(['admin_review','admin_retry'].includes(b.action))return res.status(200).json(await d.transcription(b.action,actor,b));
 const data=await d.invoke(b.action,actor,b);
 if(b.action==='admin_list'){
  const result=await d.transcription('admin_summaries',actor,{runIds:data.runs.map(r=>r.id)});
  data.runs=data.runs.map(r=>({...r,transcription:result.summaries.find(s=>s.run_id===r.id)||{completed:0,processing:0,pending:0,failed:0,reviewed:0}}));
 }
 if(b.action==='admin_get'){
  const result=await d.transcription('admin_get',actor,{runId:b.runId});
  data.turns=data.turns.map(t=>({...t,transcription:result.jobs.find(j=>j.number===t.number)||null}));
 }
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
