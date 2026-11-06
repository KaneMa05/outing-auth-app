'use strict';
const {readEnvironment}=require('./check-interview-live.cjs');
const settings=require('../lib/interview-openai-config.cjs');
async function check(env,{remote=false,fetchImpl=fetch}={}){
 const checks=[],add=(name,ok,detail)=>checks.push({name,ok:!!ok,detail});
 const models=settings.models(env);
 add('OPENAI_API_KEY',!!env.OPENAI_API_KEY?.trim(),'server_only');
 for(const [name,model] of Object.entries(models))add('MODEL_'+name,model,'configured_model');
 add('INDEPENDENT_JOB_MODELS',models.judge&&models.verifier&&models.judge!==models.verifier,'two_distinct_models');
 for(const flag of ['INTERVIEW_JOB_EXAM_ENABLED','INTERVIEW_EXAM_VALIDATION_ENABLED','INTERVIEW_PERSONALITY_ENABLED','INTERVIEW_LIVE_ENABLED','INTERVIEW_NATIVE_ENABLED','INTERVIEW_MOCK_REPORT_ENABLED'])add(flag,settings.feature(flag,env),'explicit_activation');
 for(const name of ['INTERVIEW_JOB_EXAM_MODE','INTERVIEW_PERSONALITY_MODE','INTERVIEW_MOCK_REPORT_MODE'])add(name,env[name]==='openai','openai_mode');
 for(const name of ['INTERVIEW_LIVE_WORKER_SECRET','CRON_SECRET'])add(name,env[name]?.length>=32,'server_secret_at_least_32_characters');
 add('DATABASE',env.SUPABASE_URL?.startsWith('https://')&&!!env.SUPABASE_SERVICE_ROLE_KEY,'existing_private_database');
 add('LIVE_RUNTIME',env.INTERVIEW_LIVE_TRANSPORT==='vercel'&&Number(env.INTERVIEW_LIVE_RUNTIME_SECONDS)>=720,'verify_hosting_plan_before_deployment');
 async function get(name,url,headers,verify){
  try{const r=await fetchImpl(url,{method:'GET',headers,redirect:'error',signal:AbortSignal.timeout(10000)});
   if(!r.ok)return add(name,false,'http_'+r.status);
   add(name,verify(await r.json()),'read_only_remote');
  }catch{add(name,false,'connection_or_response_error');}
 }
 if(remote){
  const jobs=[];
  if(env.OPENAI_API_KEY)for(const model of new Set(Object.values(models).filter(Boolean)))jobs.push(get('ACCESS_'+model,'https://api.openai.com/v1/models/'+encodeURIComponent(model),{Authorization:'Bearer '+env.OPENAI_API_KEY},data=>data.id===model));
  if(env.SUPABASE_URL?.startsWith('https://')&&env.SUPABASE_SERVICE_ROLE_KEY){
   const base=env.SUPABASE_URL.replace(/\/$/,''),headers={apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY};
   const tables={ip_live_runs:'id',ip_live_openai_reports:'run_id',ip_job_exam_attempts:'id',ip_personality_attempts:'id',ip_native_launch_codes:'student_id'};
   for(const [table,column] of Object.entries(tables))jobs.push(get(table,base+'/rest/v1/'+table+'?select='+column+'&limit=0',headers,Array.isArray));
   for(const bucket of ['interview-live','interview-job-exam','interview-personality'])jobs.push(get(bucket,base+'/storage/v1/bucket/'+bucket,headers,data=>data.id===bucket&&data.public===false&&
    (data.file_size_limit==null||Number(data.file_size_limit)>=(bucket==='interview-live'?30000044:3000000))&&
    (data.allowed_mime_types==null||Array.isArray(data.allowed_mime_types)&&data.allowed_mime_types.includes('audio/wav'))));
  }
  await Promise.all(jobs);
 }
 return {ok:checks.every(row=>row.ok),models,checks,paidCallsPerformed:false,remoteChangesPerformed:false,
  note:'Model visibility verifies neither live audio quality nor available credits. Database and bucket checks are read-only; no student data is returned.'};
}
if(require.main===module){if(process.argv.slice(2).some(arg=>arg!=='--remote'))throw Error('invalid_arguments');check(readEnvironment(),{remote:process.argv.includes('--remote')}).then(report=>{console.log(JSON.stringify(report,null,2));process.exitCode=report.ok?0:1;}).catch(()=>{console.error('Mock interview preflight failed; credential values are not logged.');process.exitCode=1;});}
module.exports={check};
