'use strict';
// USD public Standard rates verified 2026-11-11. Unknown models remain unpriced.
const VERSION='2026-11-11';
const BACKEND_RATES={'gpt-6.1-sol':{input:2,output:10,cachedInput:0.1}};
function voiceEvent(runId,model,seconds,confirmed=false){
 const valid=Number.isFinite(seconds)&&seconds>=0;
 return {runId,eventKey:'voice',kind:'voice',model,status:valid?(confirmed?'reported':'estimated'):'pending',usage:valid?{seconds}:{},
  rates:{version:VERSION,perMinute:model==='gpt-live-1'?0.05:null},usd:valid&&model==='gpt-live-1'?seconds/60*0.05:null};
}
function backendEvent(runId,eventKey,model,usage,responseId){
 const rates=BACKEND_RATES[model],input=usage?.input_tokens,output=usage?.output_tokens,cached=usage?.input_tokens_details?.cached_tokens??0;
 const valid=[input,output,cached].every(n=>Number.isInteger(n)&&n>=0)&&cached<=input;
 const usd=valid&&rates?((input-cached)*rates.input+cached*rates.cachedInput+output*rates.output)/1e6:null;
 return {runId,eventKey,kind:'backend',model,status:valid?(rates?'reported':'unpriced'):'unconfirmed',
  usage:{...(responseId?{responseId}:{}),...(valid?{inputTokens:input,outputTokens:output,cachedInputTokens:cached}:{})},rates:{version:VERSION,...rates},usd};
}
module.exports={voiceEvent,backendEvent};
