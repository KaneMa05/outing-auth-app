'use strict';
const {inspectWav}=require('./interview-exam-audio');
const {rubricSnapshot,decide,digest,norm,VERSION}=require('./interview-exam-scoring');
async function evaluateAudio({audio,detail,provider,loadCurrent}) {
  const rubric=rubricSnapshot(detail),quality=inspectWav(audio),audioHash=digest(audio),transcripts=[],judgments=[];
  const finish=reasons=>{
    const result=decide({rubric,transcripts,judgments,qualityReasons:reasons,audioHash,models:provider.models});
    result.quality=quality;result.rubric=rubric;
    result.audit.promptVersion=provider.promptVersion;result.audit.promptHash=provider.promptHash;
    result.audit.pipelineHash=digest({version:VERSION,models:provider.models,promptHash:provider.promptHash});
    return result;
  };
  if(quality.reasons.length)return finish(quality.reasons);
  try {
    // Settle both calls before returning, including on failure; no discarded paid requests.
    const passes=await Promise.allSettled([provider.transcribe(audio,0),provider.transcribe(audio,1)]);
    for(const p of passes){if(p.status==='fulfilled')transcripts.push(p.value);else transcripts.push('');}
    if(passes.some(p=>p.status==='rejected'))return finish(['transcription_failed']);
    if(transcripts.some(t=>typeof t!=='string'||!t.trim()||t.length>12000))return finish(['empty_or_invalid_transcript']);
    if(norm(transcripts[0])!==norm(transcripts[1]))return finish(['transcript_disagreement']);
    // Use the exact primary transcript for both judges. Neither sees the other's answer.
    const checks=await Promise.allSettled([provider.judge(transcripts[0],rubric,0),provider.judge(transcripts[0],rubric,1)]);
    for(const c of checks)if(c.status==='fulfilled')judgments.push(c.value);
    if(checks.some(c=>c.status==='rejected'))return finish(['context_evaluation_failed']);
    // Re-read after slow model calls. Never present a suggestion for an obsolete rubric.
    if(typeof loadCurrent!=='function')return finish(['current_rubric_unverified']);
    try{if(rubricSnapshot(await loadCurrent()).hash!==rubric.hash)return finish(['rubric_changed']);}
    catch{return finish(['rubric_changed']);}
    return finish([]);
  }catch{return finish(['evaluation_failed']);}
}
module.exports={evaluateAudio};
