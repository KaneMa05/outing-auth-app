'use strict';
const {createProvider:createExamProvider}=require('./interview-exam-provider');
const {digest}=require('./interview-exam-scoring');
const {schema,INSTRUCTIONS,VERSION}=require('./interview-personality-analysis.cjs');
function configuration(env=process.env){const model=env.INTERVIEW_PERSONALITY_ANALYSIS_MODEL;
 return {enabled:env.INTERVIEW_PERSONALITY_ENABLED==='true',key:env.OPENAI_API_KEY,ready:!!env.OPENAI_API_KEY&&typeof model==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$/.test(model),models:{transcriber:'gpt-transcribe',analyzer:model}};
}
function createProvider({config=configuration(),fetchImpl=fetch,timeoutMs=45000}={}){
 if(!config.enabled||!config.ready)throw Error('practice_not_configured');
 const asr=createExamProvider({config,fetchImpl,timeoutMs});
 return {transcribe:asr.transcribe,models:config.models,promptHash:digest({schema,INSTRUCTIONS,VERSION}),async analyze(transcript,question){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
   const r=await fetchImpl('https://api.openai.com/v1/responses',{method:'POST',redirect:'error',signal:controller.signal,headers:{Authorization:'Bearer '+config.key,'Content-Type':'application/json'},body:JSON.stringify({model:config.models.analyzer,store:false,max_output_tokens:7000,instructions:INSTRUCTIONS,input:JSON.stringify({question:question.prompt,transcript}),text:{format:{type:'json_schema',name:'interview_personality_structure',strict:true,schema}}})});
   if(!r.ok)throw Error('provider_unavailable');const raw=await r.text();if(raw.length>250000)throw Error('invalid_output');const data=JSON.parse(raw);
   if(data.status!=='completed'||!Array.isArray(data.output))throw Error('incomplete_output');
   const content=data.output.filter(o=>o.type==='message').flatMap(m=>m.content||[]);if(content.some(c=>c.type==='refusal'))throw Error('provider_refusal');
   const output=content.filter(c=>c.type==='output_text');if(output.length!==1||typeof output[0].text!=='string')throw Error('invalid_output');return JSON.parse(output[0].text);
  }catch{throw Error('analysis_unavailable');}finally{clearTimeout(timer);}
 }};
}
module.exports={configuration,createProvider};
