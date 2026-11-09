'use strict';
const crypto=require('node:crypto');
const {postOnly,sameOrigin,bodyOf}=require('../lib/interview-ai-http');
const {MAX,validatePdf}=require('../lib/interview-aptitude-storage.cjs');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fields={list:[],get:['id'],save:['id','revision','answers'],submit:['id','revision','answers','requestKey'],file:['id','fileId'],
 admin_list:[],admin_get:['id'],admin_report:['id'],admin_delete:['id','revision'],admin_save:['id','revision','kind','roundNo','title','state','resultsReleased','opensAt','closesAt','answerKey','reason'],
 admin_upload_prepare:['id','revision','name','bytes'],admin_upload_complete:['id','fileId'],admin_upload_abort:['id','fileId'],admin_file:['id','fileId'],admin_file_delete:['id','fileId','revision']};
const writes=new Set(['admin_save','admin_delete','admin_upload_prepare','admin_upload_complete','admin_upload_abort','admin_file_delete']);
function defaults(){return {
 authenticateWeb:require('../lib/interview-web-auth').authenticatePortal,
 authenticateDevice:require('./criminal-law-ox')._private.authenticateStudent,
 authenticateAdmin:async(req,write)=>{const auth=require('./teacher-auth-utils');const session=auth.readSessionToken(auth.readCookie(req,auth.COOKIE_NAME),auth.getConfig().secret);
  if(!session)throw Error('unauthorized');if(session.role!=='admin'||!auth.hasPermission(session,write?'interview.write':'interview.read'))throw Error('forbidden');return {id:session.username};},
 invoke:(action,actor,body)=>require('./curriculum')._private.requestSupabase('POST','rpc/ip_aptitude_service',{p_action:action,p_actor:actor,p_body:body}),
 storage:()=>require('../lib/interview-aptitude-storage.cjs').createStorage({url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY})
 };}
function validate(b){
 if(!fields[b.action]||Object.keys(b).some(k=>!['action','accountId','studentId','deviceToken','client',...fields[b.action]].includes(k)))throw Error('invalid_request');
 for(const key of ['accountId','studentId','deviceToken'])if(b[key]!==undefined&&(typeof b[key]!=='string'||!b[key]||b[key].length>(key==='deviceToken'?256:200)))throw Error('invalid_request');
 if(!b.action.startsWith('admin_')&&b.action!=='list'&&!b.accountId)throw Error('invalid_request');
 for(const key of ['id','fileId','requestKey'])if(fields[b.action].includes(key)&&!UUID.test(b[key]||''))throw Error('invalid_request');
 if(fields[b.action].includes('revision')&&(!Number.isSafeInteger(b.revision)||b.revision<0))throw Error('invalid_request');
 if(['save','submit'].includes(b.action)&&(!Array.isArray(b.answers)||![75,150].includes(b.answers.length)||b.answers.some(x=>!Number.isInteger(x)||x<0||x>5)))throw Error('invalid_answers');
 if(b.action==='admin_save'){
  const n=b.kind==='full'?150:75;
  if(!['half','full'].includes(b.kind)||!['draft','open','closed'].includes(b.state)||!Number.isInteger(b.roundNo)||b.roundNo<1||b.roundNo>9999||typeof b.title!=='string'||!b.title.trim()||b.title.length>120||typeof b.resultsReleased!=='boolean'||
   !Array.isArray(b.answerKey)||b.answerKey.length!==n||b.answerKey.some(x=>x!==null&&(!Number.isInteger(x)||x<1||x>5))||
   b.reason!==undefined&&(typeof b.reason!=='string'||b.reason.length>1000)||['opensAt','closesAt'].some(k=>b[k]!==null&&b[k]!==''&&(typeof b[k]!=='string'||!Number.isFinite(Date.parse(b[k]))))||b.resultsReleased&&b.state!=='closed')throw Error('invalid_request');
 }
 if(b.action==='admin_upload_prepare'&&(typeof b.name!=='string'||b.name.length>160||!b.name.toLowerCase().endsWith('.pdf')||!Number.isSafeInteger(b.bytes)||b.bytes<10||b.bytes>MAX))throw Error('invalid_file');
}
function createHandler(deps){return async(req,res)=>{try{
 postOnly(req,res);sameOrigin(req);const b=await bodyOf(req,60000);validate(b);const d=deps||defaults();let actor;
 if(b.action.startsWith('admin_')){const user=await d.authenticateAdmin(req,writes.has(b.action));actor={type:'admin',id:user.id};}
 else{const user=await d.authenticateWeb(req)||(b.studentId&&await d.authenticateDevice(b));if(!user)throw Error('unauthorized');if(b.accountId&&b.accountId!==user.id)throw Error('forbidden');actor={type:'student',id:user.id};}
 const payload=Object.fromEntries(fields[b.action].map(k=>[k,b[k]]).filter(([,v])=>v!==undefined));
 const gc=async()=>{const {paths}=await d.invoke('admin_gc',actor,{});for(const objectPath of paths||[])try{await d.storage().remove(objectPath);await d.invoke('admin_gc_ack',actor,{objectPath});}catch{}};
 if(b.action==='admin_upload_prepare'){
  await gc();const {file}=await d.invoke('admin_upload_prepare',actor,payload);
  return res.status(200).json({ok:true,fileId:file.id,uploadUrl:await d.storage().uploadUrl(file.object_path)});
 }
 if(b.action==='admin_upload_complete'){
  const metadata=await d.invoke('admin_upload_probe',actor,payload),bytes=await d.storage().read(metadata.objectPath);validatePdf(bytes,metadata.bytes);
  return res.status(200).json(await d.invoke('admin_upload_commit',actor,{...payload,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')}));
 }
 if(['file','admin_file'].includes(b.action)){
  const record=await d.invoke(b.action,actor,payload);return res.status(200).json({ok:true,url:await d.storage().signed(record.objectPath),name:record.name,expiresIn:60});
 }
 const data=await d.invoke(b.action,actor,payload);if(['admin_file_delete','admin_upload_abort','admin_delete'].includes(b.action))await gc();
 return res.status(200).json(data);
 }catch(error){
 const codes={unauthorized:401,forbidden:403,not_enrolled:403,not_found:404,invalid_request:400,invalid_answers:400,invalid_file:400,
  revision_conflict:409,already_submitted:409,exam_not_open:409,empty_answers:400,answer_key_incomplete:409,exam_structure_locked:409,results_already_released:409,correction_reason_required:400,file_limit:409,file_unavailable:503,request_too_large:413,method_not_allowed:405};
 let code=Object.keys(codes).find(k=>error.message===k||error.message?.includes('"message":"'+k+'"'));
 if(!code&&(error.code==='23505'||/duplicate key value/.test(error.message)))code='round_exists';
 res.status(code==='round_exists'?409:codes[code]||503).json({ok:false,error:code||'aptitude_unavailable'});
 }};}
module.exports=createHandler();module.exports.createHandler=createHandler;module.exports.validate=validate;
