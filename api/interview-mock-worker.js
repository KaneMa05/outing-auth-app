'use strict';
const {timingSafeEqual}=require('node:crypto');
const {postOnly,bodyOf,sendError}=require('../lib/interview-ai-http');
const {UUID}=require('../lib/interview-ai-validation');
const {configured,createQueue,completion}=require('../lib/interview-mock-cli-queue.cjs');
const WORKER={type:'worker',id:'mock-cli'};
function defaults(){return {token:process.env.INTERVIEW_MOCK_CLI_WORKER_TOKEN,configured:configured(),queue:createQueue(),
 reportHealth:health=>require('./curriculum')._private.requestSupabase('POST','rpc/ip_mock_cli_report_health',{p_health:health}),
 storage:kind=>require(kind==='personality'?'../lib/interview-personality-storage.cjs':'../lib/interview-job-exam-storage.cjs')[kind==='personality'?'createPersonalityStorage':'createJobExamStorage']({url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY})};}
function createHandler(deps){return async(req,res)=>{try{
 postOnly(req,res);const d=deps||defaults(),token=(req.headers.authorization||'').replace(/^Bearer /,'');
 if(!d.configured||!d.token||Buffer.byteLength(token)!==Buffer.byteLength(d.token)||!timingSafeEqual(Buffer.from(token),Buffer.from(d.token)))throw Error('unauthorized');
 const b=await bodyOf(req,1100000),fields={cleanup:[],pause:[],resume:[],heartbeat:['id','lease','health'],poll:['kinds','health'],complete:['id','lease','report'],fail:['id','lease']};
 if(!fields[b.action]||Object.keys(b).some(k=>!['action',...fields[b.action]].includes(k)))throw Error('invalid_request');
 if(['complete','fail'].includes(b.action)||b.id!==undefined)if(!UUID.test(b.id||'')||!UUID.test(b.lease||''))throw Error('invalid_request');
 if(b.kinds!==undefined&&(!Array.isArray(b.kinds)||!b.kinds.length||b.kinds.some(k=>!['job','personality','report','practice'].includes(k))))throw Error('invalid_request');
 if(b.action==='cleanup'){await d.queue.purge();return res.status(200).json({ok:true});}
 const health=b.health;
 if(health!==undefined){
  if(!health||typeof health!=='object'||Array.isArray(health)||Object.keys(health).length!==6||!['checkedAt','cliReady','transcriptionConfigured','verificationConfigured','analysisConfigured','blockedReason'].every(k=>Object.hasOwn(health,k))||!['cliReady','transcriptionConfigured','verificationConfigured','analysisConfigured'].every(k=>typeof health[k]==='boolean')||typeof health.checkedAt!=='string'||!Number.isFinite(Date.parse(health.checkedAt))||!['','execution_needs_review','delivery_pending','lease_lost','processing_unavailable'].includes(health.blockedReason))throw Error('invalid_request');
  delete b.health;
 }
 if(b.action==='complete'){
  const {job}=await d.queue.invoke('internal_get',WORKER,{id:b.id,lease:b.lease});
  b.report=completion(job,b.report);
 }
 const data=await d.queue.invoke(b.action,WORKER,b);
 if(health!==undefined){try{await d.reportHealth(health);data.healthRecorded=true;}catch{data.healthRecorded=false;}}
 if(b.action==='poll')for(const job of data.jobs){if(job.kind!=='report'){
  const audio=await d.storage(job.kind).read(job.runId);const {digest}=require('../lib/interview-exam-scoring');
  if(digest(audio)!==job.snapshot.audio_hash)throw Error('source_changed');job.audioBase64=audio.toString('base64');
 }}
 res.status(200).json(data);
 }catch(e){sendError(res,e);}};}
module.exports=createHandler();module.exports.createHandler=createHandler;
