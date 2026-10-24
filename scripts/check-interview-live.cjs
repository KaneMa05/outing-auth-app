'use strict';
// Read-only connection checks. Never create a paid session or print credentials.
const fs=require('node:fs'),path=require('node:path'),{parseEnv}=require('node:util');
const ROOT=path.resolve(__dirname,'..');
function readEnvironment(root=ROOT,inherited=process.env){
 const env={};
 for(const name of ['.env','.env.local']){
  const file=path.join(root,name);
  if(fs.existsSync(file))Object.assign(env,parseEnv(fs.readFileSync(file,'utf8')));
 }
 return {...env,...inherited};
}
function baseUrl(value){
 try{const u=new URL(value);return !u.username&&!u.password&&!u.search&&!u.hash&&u.pathname==='/'&&
  (u.protocol==='https:'||(u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname)))?u.origin:null;}catch{return null;}
}
async function check(env,{remote=false,fetchImpl=fetch}={}){
 const checks=[];
 const add=(name,ok,detail)=>checks.push({name,ok:Boolean(ok),detail});
 for(const name of ['OPENAI_API_KEY','INTERVIEW_LIVE_FOLLOWUP_MODEL','SUPABASE_SERVICE_ROLE_KEY'])
  add(name,Boolean(env[name]?.trim())&&!/[<>\r\n]/.test(env[name]),'required_server_setting');
 add('INTERVIEW_LIVE_WORKER_SECRET',(env.INTERVIEW_LIVE_WORKER_SECRET||'').length>=32&&!/[\r\n]/.test(env.INTERVIEW_LIVE_WORKER_SECRET||''),'at_least_32_characters');
 const db=baseUrl(env.SUPABASE_URL),worker=baseUrl(env.INTERVIEW_LIVE_WORKER_URL),vercel=env.INTERVIEW_LIVE_TRANSPORT==='vercel';
 add('SUPABASE_URL',db,'https_origin_or_localhost');
 if(vercel){
  add('CRON_SECRET',(env.CRON_SECRET||'').length>=32,'scheduled_cleanup_authentication');
  add('INTERVIEW_LIVE_RUNTIME_SECONDS',Number(env.INTERVIEW_LIVE_RUNTIME_SECONDS)>=720,'verify_vercel_plan_supports_at_least_720_seconds');
 }else{
  add('INTERVIEW_LIVE_WORKER_URL',worker,'https_origin_or_localhost');
  add('INTERVIEW_LIVE_SPOOL',Boolean(env.INTERVIEW_LIVE_SPOOL)&&path.isAbsolute(env.INTERVIEW_LIVE_SPOOL),'absolute_private_persistent_directory');
 }
 add('INTERVIEW_LIVE_ENABLED',['true','false'].includes(env.INTERVIEW_LIVE_ENABLED),'explicit_feature_flag');
 async function request(name,url,headers,verify=()=>true){
  try{
   const r=await fetchImpl(url,{method:'GET',headers,redirect:'error',signal:AbortSignal.timeout(10000)});
   if(!r.ok){add(name,false,'http_'+r.status);return;}
   add(name,verify(await r.json()),'read_only_check');
  }catch{add(name,false,'connection_or_response_error');}
 }
 if(remote){
  const valid=name=>checks.some(c=>c.name===name&&c.ok);
  const jobs=[];
  if(valid('OPENAI_API_KEY'))for(const model of new Set(['gpt-live-1',...(valid('INTERVIEW_LIVE_FOLLOWUP_MODEL')?[env.INTERVIEW_LIVE_FOLLOWUP_MODEL]:[])]))
   jobs.push(request(model==='gpt-live-1'?'OPENAI_LIVE_MODEL':'OPENAI_FOLLOWUP_MODEL','https://api.openai.com/v1/models/'+encodeURIComponent(model),{Authorization:'Bearer '+env.OPENAI_API_KEY},j=>j.id===model));
  if(db&&valid('SUPABASE_SERVICE_ROLE_KEY')){
   const headers={apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY};
   jobs.push(request('LIVE_TABLE',db+'/rest/v1/ip_live_runs?select=id&limit=0',headers,Array.isArray));
   jobs.push(request('PRIVATE_AUDIO_BUCKET',db+'/storage/v1/bucket/interview-live',headers,j=>j.id==='interview-live'&&j.public===false&&Number(j.file_size_limit)>=30000044&&
    (j.allowed_mime_types===null||Array.isArray(j.allowed_mime_types)&&j.allowed_mime_types.includes('audio/wav'))));
  }
  await Promise.all(jobs);
 }
 return {ok:checks.every(c=>c.ok),mode:remote?'read_only_remote':'local_settings',checks,
  note:'Model visibility does not prove Live session access, billing readiness, RPC permissions, upload/playback, disk durability, or speech quality. No voice session or response was created.'};
}
if(require.main===module)(async()=>{
 if(process.argv.slice(2).some(a=>a!=='--remote'))throw Error('invalid_arguments');
 const result=await check(readEnvironment(),{remote:process.argv.includes('--remote')});
 console.log(JSON.stringify(result,null,2));process.exitCode=result.ok?0:1;
})().catch(()=>{console.error('Live connection check failed. Check local settings; credential values are not logged.');process.exitCode=1;});
module.exports={check,readEnvironment,baseUrl};
