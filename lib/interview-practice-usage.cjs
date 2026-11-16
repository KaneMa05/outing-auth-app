'use strict';
function transcriptionEvent(eventKey,model,usage,submittedSeconds,completed=false){
 const reported=usage?.type==='duration'&&Number.isFinite(usage.seconds)&&usage.seconds>=0;
 const estimate=completed&&Number.isFinite(submittedSeconds)&&submittedSeconds>=0;
 const seconds=reported?usage.seconds:estimate?submittedSeconds:null,perMinute=model==='gpt-transcribe'?0.0045:null;
 return {eventKey,kind:'transcription',model,status:seconds===null?'unconfirmed':perMinute===null?'unpriced':reported?'reported':'estimated',
  usage:{submittedSeconds,...(seconds!==null?{seconds}:{}),...(usage?{providerUsage:usage}:{})},rates:{version:'2026-11-12',perMinute},usd:seconds!==null&&perMinute!==null?seconds/60*perMinute:null};
}
module.exports={transcriptionEvent};
