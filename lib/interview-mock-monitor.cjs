'use strict';
const {configured,selected}=require('./interview-mock-cli-queue.cjs');
const iso=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))?new Date(v).toISOString():null;
const count=v=>Number.isSafeInteger(v)&&v>=0?v:null;
const recent=(value,time,age)=>{const stamp=Date.parse(value);return Number.isFinite(stamp)&&stamp<=time+5000&&stamp>=time-age;};
const definitions=[['job','전공·직무 시험'],['personality','인성 연습'],['live','실전 AI 면접'],['report','종합 분석']];
function settings(kind,env){
 const pc=kind==='report'||selected(kind,env),storage=!!(env.SUPABASE_URL&&env.SUPABASE_SERVICE_ROLE_KEY&&env.CRON_SECRET?.length>=32);
 const enabled=kind==='report'?selected('report',env):env[{job:'INTERVIEW_JOB_EXAM_ENABLED',personality:'INTERVIEW_PERSONALITY_ENABLED',live:'INTERVIEW_LIVE_ENABLED'}[kind]]==='true';
 let checks;
 if(kind==='live')checks=[{label:'음성 서버 설정',ok:require('../api/interview-live').configuration(env).configured}];
 else if(pc)checks=[{label:'PC 연결 설정',ok:configured(env)},...(kind==='report'?[]:[{label:'음성 보관 설정',ok:storage},{label:'음성 전사 사용 준비',ok:env.INTERVIEW_MOCK_CLI_AUDIO_READY==='true'}])];
 else checks=[{label:'AI 연결 설정',ok:kind==='job'?require('./interview-exam-provider').configuration(env).ready:require('./interview-personality-provider.cjs').configuration(env).ready},{label:'음성 보관 설정',ok:storage}];
 return {enabled,transport:kind==='live'?'live':pc?'pc':'api',checks};
}
function classify(mode,{time,metricsAvailable,worker}){
 if(!mode.enabled)return {state:'disabled',message:mode.globalDisabled?'면접반 전체 이용이 꺼져 있습니다.':mode.queued||mode.running?'신규 접수가 꺼져 있습니다. 이미 접수한 작업은 별도로 확인해주세요.':'신규 이용이 꺼져 있습니다.'};
 if(mode.checks.some(c=>!c.ok))return {state:'configuration',message:'준비 상태 상세에서 미완료 설정을 확인해주세요.'};
 if(!metricsAvailable)return {state:'unavailable',message:'처리 집계를 확인하지 못했습니다. 연결 또는 모니터링 적용 상태를 확인해주세요.'};
 if(mode.transport==='pc'){
  if(!worker.connected)return {state:'disconnected',message:worker.lastSeenAt?'분석 PC의 접속 신호가 지연되고 있습니다.':'분석 PC의 접속 기록이 없습니다.'};
  if(!worker.healthFresh)return {state:'health_unknown',message:'PC는 연결되어 있으나 실행 준비 상태를 확인하지 못했습니다.'};
  if(worker.health.blockedReason)return {state:'blocked',message:({execution_needs_review:'이전 실행의 종료·결과 확인이 필요합니다.',delivery_pending:'완료 결과의 서버 전송을 확인해야 합니다.',lease_lost:'작업 배정 상태를 확인해야 합니다.',processing_unavailable:'PC 처리 오류를 확인해야 합니다.'})[worker.health.blockedReason]||'PC 처리 상태를 확인해주세요.'};
  if(!worker.health.cliReady)return {state:'login_required',message:'분석 PC의 CLI 로그인을 확인해주세요.'};
  if(mode.kind!=='report'&&!worker.health.transcriptionConfigured)return {state:'transcription_required',message:'분석 PC의 음성 전사 실행 설정을 확인해주세요.'};
  if(mode.kind==='job'&&!worker.health.verificationConfigured)return {state:'verification_required',message:'서로 다른 판정·검증 모델 구성이 필요합니다.'};
  if(mode.kind!=='job'&&!worker.health.analysisConfigured)return {state:'configuration',message:'분석 PC의 분석 모델 구성을 확인해주세요.'};
 }
 if(mode.attention>0)return {state:'attention',message:'실패·불명확·지연된 작업을 확인해주세요. 상태 조회는 작업을 다시 실행하지 않습니다.'};
 if(mode.kind==='live'&&mode.recordingPending>0)return {state:'recording_pending',message:'종료한 면접의 음성 저장 여부를 확인하고 있습니다.'};
 const minimum=mode.kind==='live'?3:1;
 if(mode.questionCount!==null&&mode.questionCount<minimum)return {state:'questions_required',message:'공개 승인 및 검토 완료된 출제 문항을 준비해주세요.'};
 if(mode.running>0)return {state:'running',message:'진행 중인 처리가 있습니다. 완료 기록과 오류 상태를 함께 확인하세요.'};
 if(mode.queued>0)return {state:'queued',message:'접수한 작업이 처리 순서를 기다리고 있습니다.'};
 if(recent(mode.lastFailedAt,time,86400000)&&(!mode.lastCompletedAt||Date.parse(mode.lastFailedAt)>Date.parse(mode.lastCompletedAt)))return {state:'recent_failure',message:'최근 완료 기록보다 새로운 오류 기록이 있습니다.'};
 if(recent(mode.lastCompletedAt,time,86400000))return {state:'completed',message:'최근 24시간 내 처리 완료 기록이 있습니다.'};
 return {state:'ready',message:'설정은 준비되어 있습니다. 최근 24시간의 실제 처리 완료는 확인되지 않았습니다.'};
}
function buildStatus(snapshot,{env=process.env,now=Date.now,metricsAvailable=true}={}){
 const globalEnabled=typeof snapshot?.access?.enabled==='boolean'?snapshot.access.enabled:null;
 const time=now(),lastSeenAt=iso(snapshot?.cli?.lastSeenAt),healthCheckedAt=iso(snapshot?.cli?.healthCheckedAt),raw=snapshot?.cli?.health;
 const health=raw&&['cliReady','transcriptionConfigured','verificationConfigured','analysisConfigured'].every(k=>typeof raw[k]==='boolean')&&typeof raw.blockedReason==='string'?
  Object.fromEntries(['cliReady','transcriptionConfigured','verificationConfigured','analysisConfigured','blockedReason'].map(k=>[k,raw[k]])):null;
 const worker={lastSeenAt,healthCheckedAt,health,connected:recent(lastSeenAt,time,45000),healthFresh:!!health&&recent(healthCheckedAt,time,120000)};
 const modes=definitions.map(([kind,label])=>{
  const config=settings(kind,env),stats=kind==='live'?snapshot?.live:config.transport==='pc'?snapshot?.cli?.stats?.[kind]:snapshot?.api?.[kind];
  const available=metricsAvailable&&stats&&['queued','running','attention','completed24h','failed24h'].every(k=>count(stats[k])!==null);
  const metrics=Object.fromEntries(['queued','running','attention','held','completed24h','failed24h','interrupted','recordingPending'].map(k=>[k,available?count(stats[k]):null]));
  if(available&&config.transport==='pc'&&kind!=='report')metrics.attention+=(count(snapshot?.api?.[kind]?.uploadFailed)||0)+(count(snapshot?.api?.[kind]?.untrackedUnknown)||0);
  const mode={kind,label,...config,enabled:config.enabled&&globalEnabled!==false,accepting:config.enabled?globalEnabled:false,globalDisabled:globalEnabled===false,...metrics,metricsAvailable:!!available,questionCount:kind==='report'?null:available?count(snapshot?.questions?.[kind]):null,
   lastCompletedAt:available?iso(stats.lastCompletedAt):null,lastFailedAt:available?iso(stats.lastFailedAt):null,
   lastSeenAt:config.transport==='pc'?lastSeenAt:null};
  const runtimeChecks=config.transport==='pc'?[{label:'PC 접속 신호',ok:worker.connected},{label:'CLI 로그인',ok:worker.healthFresh?health.cliReady:null},
   ...(kind==='report'?[]:[{label:'음성 전사 실행 설정',ok:worker.healthFresh?health.transcriptionConfigured:null}]),
   {label:kind==='job'?'판정·검증 모델 구성':'분석 모델 구성',ok:worker.healthFresh?(kind==='job'?health.verificationConfigured:health.analysisConfigured):null}]:[];
  return {...mode,runtimeChecks:[{label:'면접반 전체 이용 설정',ok:globalEnabled},...runtimeChecks],...classify(mode,{time,metricsAvailable:available,worker})};
 });
 return {ok:true,checkedAt:new Date(time).toISOString(),metricsAvailable,modes};
}
async function monitorStatus(body,actor,read,options={}){
 if(actor?.type!=='admin'||!actor.id)throw Error('forbidden');
 if(Object.keys(body).length)throw Error('invalid_request');
 try{const data=await read('POST','rpc/ip_mock_operations_snapshot',{});if(typeof data?.access?.enabled!=='boolean'||!data.api||!data.cli||!data.live||!data.questions)throw Error('status_unavailable');return buildStatus(data,options);}
 catch{return buildStatus(null,{...options,metricsAvailable:false});}
}
module.exports={monitorStatus,buildStatus,settings,classify};
