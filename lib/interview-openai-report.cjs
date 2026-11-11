'use strict';
const {randomUUID}=require('node:crypto');
const {analyzeTask,reportInput}=require('./interview-mock-analysis.cjs');
const {digest}=require('./interview-exam-scoring');
const SERVER={type:'server',id:'openai-mock-report'};
function createOpenAIInference({key,model,fetchImpl=fetch,onUsage=async()=>{},runId}) {
 async function infer(input,{instructions,schema,signal}){
  const eventKey='report:'+randomUUID(),{backendEvent}=require('./interview-live-usage');
  if(runId)await onUsage(backendEvent(runId,eventKey,model,null));
  const response=await fetchImpl('https://api.openai.com/v1/responses',{method:'POST',redirect:'error',signal:signal||AbortSignal.timeout(45000),
   headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({model,store:false,max_output_tokens:4500,
    instructions,input:JSON.stringify(input),text:{format:{type:'json_schema',name:'interview_practice_report',strict:true,schema}}})});
  if(!response.ok)throw Error('provider_unavailable');
  const raw=await response.text();if(raw.length>100000)throw Error('invalid_output');const data=JSON.parse(raw);
  if(runId)await onUsage(backendEvent(runId,eventKey,model,data.usage,data.id));
  const parts=(data.output||[]).filter(row=>row.type==='message').flatMap(row=>row.content||[]);
  const output=parts.filter(row=>row.type==='output_text');
  if(data.status!=='completed'||parts.some(row=>row.type==='refusal')||output.length!==1)throw Error('invalid_output');
  return JSON.parse(output[0].text);
 }
 return infer;
}
function createReports({invoke,key,model,fetchImpl=fetch,onUsage=async()=>{}}){
 return {
  async get(actor,runId){return (await invoke('get',actor,{runId})).processing;},
  async request(actor,run){
   const input=reportInput(run),sourceHash=digest(input),token=randomUUID();
   const claim=await invoke('claim',actor,{runId:run.id,sourceHash,token,turns:run.turns});
   if(!claim.claimed)return claim.processing;
   try{
    const infer=createOpenAIInference({key,model,fetchImpl,onUsage,runId:run.id});
    const report=await analyzeTask({kind:'report',run},{infer,models:{analyzer:model}});
    return (await invoke('complete',SERVER,{runId:run.id,sourceHash,token,report})).processing;
   }catch{
    // A lost paid response must never cause an automatic second inference.
    return (await invoke('unknown',SERVER,{runId:run.id,sourceHash,token})).processing;
   }
  }
 };
}
module.exports={createReports,createOpenAIInference};
