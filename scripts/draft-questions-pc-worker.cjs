'use strict';
const path=require('node:path'),{setTimeout:wait}=require('node:timers/promises');
const {createProvider}=require('./core25-diagnosis-cli.cjs');
const {draftQuestions,INSTRUCTIONS,schema}=require('../lib/interview-draft-questions');
async function main(){
 const origin=process.env.INTERVIEW_CORE25_ORIGIN||'https://app.ronparkpass.com',token=process.env.INTERVIEW_CORE25_WORKER_TOKEN;
 if(new URL(origin).protocol!=='https:'||!/^[A-Za-z0-9_-]{43}$/.test(token||''))throw Error('configuration');
 const provider=createProvider({runtimeDir:path.resolve('.tmp/draft-questions-runtime'),instructions:INSTRUCTIONS,outputSchema:schema,effort:'low'});
 const request=async(action,body={})=>{const r=await fetch(new URL('/api/interview-draft-worker',origin),{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action,...body}),signal:AbortSignal.timeout(20000)});const d=await r.json();if(!r.ok||!d.ok)throw Error(d.error||'connection');return d;};
 const log=event=>console.log(JSON.stringify({time:new Date().toISOString(),event}));
 log('worker_started');
 for(;;){try{const {jobs}=await request('poll');for(const job of jobs){
  const ref={id:job.id,lease:job.lease};let questions;
  try{questions=await draftQuestions(job.experience,provider);}catch{await request('fail',ref);log('generation_failed');continue;}
  // Retry only result delivery, never model execution.
  for(let attempt=0;attempt<3;attempt++){try{await request('complete',{...ref,questions});log('questions_completed');break;}catch{if(attempt===2)log('delivery_failed');else await wait(2000);}}
 }}catch{log('connection_unavailable');}await wait(5000);}
}
if(require.main===module)main().catch(()=>{console.error('Worker configuration failed');process.exitCode=1;});
