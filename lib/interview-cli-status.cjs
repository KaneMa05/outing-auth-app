'use strict';
const {ENGINE_VERSION}=require('./core25-worker-config.cjs');
const {workerStatus:questionStatus}=require('./interview-draft-worker-status.cjs');
const iso=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;
const query=(table,fields)=>table+'?'+new URLSearchParams(fields);
const LIMIT=1000;
function connection(lastSeenAt,time,thresholdSeconds){
 const age=lastSeenAt?time-Date.parse(lastSeenAt):Infinity;
 return age>=-5000&&age<=thresholdSeconds*1000;
}
async function core25Status(read,env,time){
 const checkedAt=new Date(time).toISOString();
 const scope={worker_queued:'eq.true',engine_version:'eq.'+ENGINE_VERSION};
 const active={...scope,status:'eq.running',expires_at:'gt.'+checkedAt,select:'status',limit:String(LIMIT)};
 const [presence,running,queued,completed,failed]=await Promise.all([
  read('GET',query('ip_pa_worker_presence',{select:'seen_at',engine_version:'eq.'+ENGINE_VERSION,limit:'1'})),
  read('GET',query('ip_pa_diagnoses',{...active,worker_lease:'not.is.null'})),
  read('GET',query('ip_pa_diagnoses',{...active,worker_lease:'is.null'})),
  read('GET',query('ip_pa_diagnoses',{...scope,select:'finished_at',status:'eq.completed',order:'finished_at.desc.nullslast',limit:'1'})),
  read('GET',query('ip_pa_diagnoses',{...scope,select:'finished_at',status:'eq.failed',order:'finished_at.desc.nullslast',limit:'1'}))
 ]);
 if(![presence,running,queued,completed,failed].every(Array.isArray))throw Error('status_unavailable');
 const lastSeenAt=iso(presence[0]?.seen_at),thresholdSeconds=60;
 return {enabled:env.INTERVIEW_CORE25_DIAGNOSIS_ENABLED==='true'&&env.INTERVIEW_CORE25_DIAGNOSIS_MODE==='pc'&&/^[A-Za-z0-9_-]{43}$/.test(env.INTERVIEW_CORE25_WORKER_TOKEN||''),
  lastSeenAt,connected:connection(lastSeenAt,time,thresholdSeconds),thresholdSeconds,
  running:running.length,queued:queued.length,countsLimited:running.length===LIMIT||queued.length===LIMIT,
  lastCompletedAt:iso(completed[0]?.finished_at),lastFailedAt:iso(failed[0]?.finished_at)};
}
async function answerStatus(read,time){
 const checkedAt=new Date(time).toISOString();
 const [settings,presence,active,completed,failed]=await Promise.all([
  read('GET','ip_ai_settings?select=enabled&id=eq.true&limit=1'),
  read('GET',query('ip_ai_workers',{select:'last_seen_at',revoked_at:'is.null',expires_at:'gt.'+checkedAt,order:'last_seen_at.desc.nullslast',limit:'1'})),
  read('GET',query('ip_ai_jobs',{select:'status',or:`(status.eq.QUEUED,and(status.eq.PROCESSING,lease_expires_at.gt.${checkedAt}))`,limit:String(LIMIT)})),
  read('GET','ip_ai_jobs?select=updated_at&status=eq.COMPLETED&order=updated_at.desc&limit=1'),
  read('GET','ip_ai_jobs?select=updated_at&status=eq.FAILED&order=updated_at.desc&limit=1')
 ]);
 if(![settings,presence,active,completed,failed].every(Array.isArray))throw Error('status_unavailable');
 // This worker's presence writes are throttled to once a minute.
 const lastSeenAt=iso(presence[0]?.last_seen_at),thresholdSeconds=120;
 return {enabled:settings[0]?.enabled===true,lastSeenAt,connected:connection(lastSeenAt,time,thresholdSeconds),thresholdSeconds,
  running:active.filter(j=>j.status==='PROCESSING').length,queued:active.filter(j=>j.status==='QUEUED').length,countsLimited:active.length===LIMIT,
  lastCompletedAt:iso(completed[0]?.updated_at),lastFailedAt:iso(failed[0]?.updated_at)};
}
async function cliStatus(body,actor,read,{env=process.env,now=Date.now}={}){
 if(actor?.type!=='admin'||!actor.id)throw Error('forbidden');
 const time=now(),checkedAt=new Date(time).toISOString();
 // Read metadata only. A disabled feature can still have a connected PC worker.
 const definitions=[
  {id:'core25',load:()=>core25Status(read,env,time)},
  {id:'questions',load:async()=>({...await questionStatus({},actor,read,{env:{INTERVIEW_DRAFT_QUESTIONS_ENABLED:'true'},now:()=>time}),enabled:env.INTERVIEW_DRAFT_QUESTIONS_ENABLED==='true',thresholdSeconds:45})},
  {id:'answers',load:()=>answerStatus(read,time)}
 ];
 const workers=await Promise.all(definitions.map(async({id,load})=>{
  try{const {ok,checkedAt:ignored,...status}=await load();return {id,available:true,...status};}
  catch{return {id,available:false};}
 }));
 return {ok:true,checkedAt,workers};
}
module.exports={cliStatus};
