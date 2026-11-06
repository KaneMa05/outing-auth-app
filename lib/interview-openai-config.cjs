'use strict';
// Server-owned settings shared by the three mock interview modes.
const DEFAULT_MODELS=Object.freeze({live:'gpt-live-1',transcriber:'gpt-transcribe',followup:'gpt-6.1-sol',judge:'gpt-6.1-sol',verifier:'gpt-6-astra',personality:'gpt-6.1-sol',report:'gpt-6.1-sol'});
const MODEL_ENV={live:'INTERVIEW_LIVE_MODEL',transcriber:'INTERVIEW_TRANSCRIPTION_MODEL',followup:'INTERVIEW_LIVE_FOLLOWUP_MODEL',judge:'INTERVIEW_EXAM_JUDGE_MODEL',verifier:'INTERVIEW_EXAM_VERIFIER_MODEL',personality:'INTERVIEW_PERSONALITY_ANALYSIS_MODEL',report:'INTERVIEW_MOCK_REPORT_MODEL'};
const validModel=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(value);
function models(env=process.env){return Object.fromEntries(Object.entries(MODEL_ENV).map(([name,key])=>{const value=env[key]??DEFAULT_MODELS[name];return [name,validModel(value)?value:null];}));}
function feature(name,env=process.env){return (env[name]??env.INTERVIEW_OPENAI_ENABLED)==='true';}
module.exports={DEFAULT_MODELS,MODEL_ENV,validModel,models,feature};
