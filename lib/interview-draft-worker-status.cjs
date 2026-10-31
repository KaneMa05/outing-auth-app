'use strict';
const iso=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;
async function workerStatus(body,actor,read,{env=process.env,now=Date.now}={}){
 if(actor?.type!=='admin'||!actor.id)throw Error('forbidden');
 const time=now(),checkedAt=new Date(time).toISOString();
 if(env.INTERVIEW_DRAFT_QUESTIONS_ENABLED!=='true')return {ok:true,enabled:false,checkedAt};
 // Select operational metadata only. Reading status must never claim a job.
 const [presence,active,completed,failed]=await Promise.all([
  read('GET','ip_draft_worker_presence?select=seen_at&id=eq.true&limit=1'),
  read('GET',`ip_draft_question_jobs?select=state&state=in.(queued,running)&expires_at=gt.${encodeURIComponent(checkedAt)}&limit=1000`),
  read('GET','ip_draft_question_jobs?select=updated_at&state=eq.completed&order=updated_at.desc&limit=1'),
  read('GET','ip_draft_question_jobs?select=updated_at&state=eq.failed&order=updated_at.desc&limit=1')
 ]);
 if(![presence,active,completed,failed].every(Array.isArray))throw Error('status_unavailable');
 const lastSeenAt=iso(presence[0]?.seen_at);
 const age=lastSeenAt?time-Date.parse(lastSeenAt):Infinity;
 return {ok:true,enabled:true,checkedAt,lastSeenAt,
  connected:age>=-5000&&age<=45000,
  queued:active.filter(j=>j.state==='queued').length,
  running:active.filter(j=>j.state==='running').length,
  countsLimited:active.length===1000,
  lastCompletedAt:iso(completed[0]?.updated_at),lastFailedAt:iso(failed[0]?.updated_at)};
}
module.exports={workerStatus};
