'use strict';
const {timingSafeEqual}=require('node:crypto');
const {SERVER}=require('../lib/interview-live-engine');
function authorized(req,secret){const expected='Bearer '+secret,actual=req.headers.authorization||'';return secret?.length>=32&&actual.length===expected.length&&timingSafeEqual(Buffer.from(actual),Buffer.from(expected));}
async function cleanup({invoke,provider,storage,now=Date.now,budgetMs=50000}){
 const started=now();const {runs}=await invoke('sweep',SERVER,{});let processed=0,failed=0;
 for(const run of runs){if(now()-started>budgetMs)break;
  try{
   const active=['starting','active','closing','unknown'].includes(run.state);
   // No operator-free guess after an uncertain create with no provider identifier.
   if(active&&!run.provider_id&&Date.parse(run.retain_until)>now())continue;
   if(active&&run.provider_id){await provider.closeSession(run.provider_id);await invoke('closed',SERVER,{runId:run.id,state:'interrupted',recordingState:run.recording_state});}
   if(Date.parse(run.retain_until)<=now()){
    await storage.remove(run.id);await invoke('purge',SERVER,{runId:run.id});processed++;continue;
   }
   if(run.recording_state==='pending'){
    const ready=await storage.recover(run.id);await invoke('closed',SERVER,{runId:run.id,state:active?'interrupted':run.state,recordingState:ready?'ready':'missing',recordingPartial:ready});
   }
   processed++;
  }catch{failed++;}
 }
 return {ok:failed===0,processed,failed,remaining:runs.length-processed-failed};
}
function createHandler(deps){return async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET'||!authorized(req,deps?.secret||process.env.CRON_SECRET))return res.status(401).json({ok:false});
 // Disabled transport must not sweep a separately operated worker's sessions.
 if(!deps&&process.env.INTERVIEW_LIVE_TRANSPORT!=='vercel')return res.status(200).json({ok:true,skipped:true});
 try{
  const d=deps||{invoke:(action,actor,body)=>require('./curriculum')._private.requestSupabase('POST','rpc/ip_live_service',{p_action:action,p_actor:actor,p_body:body}),
   provider:require('../lib/interview-live-provider').createProvider({key:process.env.OPENAI_API_KEY,followupModel:process.env.INTERVIEW_LIVE_FOLLOWUP_MODEL}),
   storage:require('../lib/interview-live-cloud-storage').createCloudStorage({url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY})};
  const result=await cleanup(d);return res.status(result.ok?200:503).json(result);
 }catch{return res.status(503).json({ok:false,error:'cleanup_unavailable'});}
 };}
module.exports=createHandler();module.exports.createHandler=createHandler;module.exports.cleanup=cleanup;module.exports.authorized=authorized;
