'use strict';
const {rubricSnapshot,decide,digest}=require('./interview-exam-scoring');
const {validateAnalysis}=require('./interview-personality-analysis.cjs');
const {reportInput,validateReport,VERSION}=require('./interview-mock-analysis.cjs');
const SERVER={type:'server',id:'mock-cli'};
function configured(env=process.env){return typeof env.INTERVIEW_MOCK_CLI_WORKER_TOKEN==='string'&&/^[A-Za-z0-9_-]{43}$/.test(env.INTERVIEW_MOCK_CLI_WORKER_TOKEN);}
function selected(kind,env=process.env){return env[{job:'INTERVIEW_JOB_EXAM_MODE',personality:'INTERVIEW_PERSONALITY_MODE',report:'INTERVIEW_MOCK_REPORT_MODE'}[kind]]==='pc';}
function enabled(kind,env=process.env){return configured(env)&&selected(kind,env);}
function audioConfiguration(kind,env=process.env){return selected(kind,env)?{mode:'pc',ready:configured(env)&&env.INTERVIEW_MOCK_CLI_AUDIO_READY==='true'}:{};}
function createQueue({invoke=(action,actor,body)=>require('../api/curriculum')._private.requestSupabase('POST','rpc/ip_mock_cli_queue_service',{p_action:action,p_actor:actor,p_body:body})}={}){
 return {invoke,enqueue:(kind,runId,actor=SERVER)=>invoke('enqueue',actor,{kind,runId}),
  get:async(kind,runId,actor=SERVER)=>(await invoke('get',actor,{kind,runId})).processing,
  status:()=>invoke('status',SERVER,{}),purge:()=>invoke('purge',SERVER,{})};
}
function completion(job,report){
 const src=job.snapshot;if(!report||report.grade!==null||report.score!==null)throw Error('invalid_output');
 if(job.kind==='report'){
  const input=reportInput(src);if(report.audit?.sourceHash!==digest(input))throw Error('source_changed');
  return {status:'practice_feedback',grade:null,score:null,analysis:validateReport(report.analysis,input),transcriptConfirmed:false,
   completedAnswers:input.turns.filter(t=>t.complete&&t.answer.trim()).length,interrupted:input.state==='interrupted',audit:{version:VERSION,sourceHash:digest(input),models:report.audit.models}};
 }
 if(report.audit?.audioHash!==src.audio_hash||report.audit?.questionId!==src.question_id||report.audit?.questionRevision!==src.question.revision||report.audit?.transcriptSource!=='audio')throw Error('invalid_output');
 if(job.kind==='job'){
  const result=decide({rubric:rubricSnapshot(src.rubric_detail),transcripts:report.transcripts,judgments:report.judgments,qualityReasons:report.quality?.reasons||[],audioHash:src.audio_hash,models:report.audit.models});
  if(!report.audit.models?.judge||!report.audit.models?.verifier||report.audit.models.judge===report.audit.models.verifier){result.suggestion=null;result.reasons.push('model_diversity_missing');}
  result.audit.engine=VERSION;result.audit.transcriptSource='audio';return result;
 }
 let analysis=null;
 if(report.analysis){
  const a=report.analysis;
  if(!Array.isArray(report.transcripts)||report.transcripts.length!==2||report.transcripts[0]!==report.transcripts[1])throw Error('invalid_output');
  analysis=validateAnalysis({components:Object.fromEntries(a.components.map(({id,presence,quality,quote,feedback})=>[id,{presence,quality,quote,feedback}])),
   experienceEvidence:Object.fromEntries(Object.entries(a.experienceEvidence).map(([id,e])=>[id,e.quote])),connections:a.connections.map(({from,to,status,quote,feedback})=>({from,to,status,quote,feedback})),
   issues:a.issues.map(({kind,firstQuote,secondQuote,feedback})=>({kind,firstQuote,secondQuote,feedback})),summary:a.summary,nextPractice:a.nextPractice},report.transcripts[0]);
 }
 if(!Array.isArray(report.reasons)||report.reasons.some(r=>typeof r!=='string'||r.length>100)||report.audit.version!==src.analysis_version)throw Error('invalid_output');
 return {status:analysis?'practice_feedback':'review_required',grade:null,score:null,analysis,reasons:report.reasons,transcripts:report.transcripts,
  audit:{version:src.analysis_version,engine:VERSION,audioHash:src.audio_hash,questionId:src.question_id,questionRevision:src.question.revision,transcriptSource:'audio',models:report.audit.models}};
}
module.exports={configured,selected,enabled,audioConfiguration,createQueue,completion,SERVER};
