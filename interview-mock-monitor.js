const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const stamp=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))?escape(new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false})):'기록 없음';
const number=value=>Number.isSafeInteger(value)&&value>=0?value.toLocaleString('ko-KR'):'—';
const names={job:'전공·직무 시험',personality:'인성 연습',live:'실전 AI 면접',report:'종합 분석'};
const states={disabled:['신규 접수 꺼짐','muted'],configuration:['설정 확인 필요','warning'],unavailable:['확인 불가','error'],disconnected:['PC 연결 확인','error'],health_unknown:['실행 상태 미확인','warning'],blocked:['PC 처리 확인','error'],login_required:['로그인 확인 필요','error'],transcription_required:['음성 전사 설정 필요','warning'],verification_required:['검증 모델 확인','warning'],questions_required:['출제 문항 준비','warning'],attention:['처리 오류 확인','error'],recording_pending:['음성 저장 확인 대기','warning'],running:['처리 중','info'],queued:['처리 대기','info'],recent_failure:['최근 오류 기록','warning'],completed:['최근 처리 완료','success'],ready:['준비됨 · 처리 미확인','info']};
function unavailable(){return {modes:Object.entries(names).map(([kind,label])=>({kind,label,state:'unavailable',message:'현재 상태를 확인하지 못했습니다. 상태 새로고침을 눌러 다시 확인해주세요.',metricsAvailable:false})),metricsAvailable:false};}
export function renderMockMonitor(data){
 if(!data||!Array.isArray(data.modes)||data.modes.length!==4||new Set(data.modes.map(m=>m.kind)).size!==4||data.modes.some(m=>!names[m.kind]||!states[m.state]))data=unavailable();
 return `<div class="ip-mm-heading"><div><h3>모의면접 모니터링</h3><p>모드별 활성화 설정과 접속·처리 기록을 확인합니다.</p></div><button class="ip-btn" type="button" data-mock-monitor-refresh>상태 새로고침</button></div>
 <div class="ip-mm-grid">${data.modes.map(mode=>{
  const [label,level]=states[mode.state];
  return `<article class="ip-mm-card" data-monitor-mode="${escape(mode.kind)}"><div class="ip-mm-card-heading"><h4>${names[mode.kind]}</h4><span class="ip-mm-badge" data-level="${level}">${label}</span></div>
   <p class="ip-mm-route">${typeof mode.accepting!=='boolean'?'접수 가능 여부 미확인':mode.accepting?'신규 접수 켜짐':'신규 접수 꺼짐'}${mode.transport?` · ${escape(({pc:'PC 분석',api:'API 분석',live:'실시간 음성'})[mode.transport]||'')}`:''}</p>
   <p class="ip-mm-message">${escape(mode.message)}</p>
   <dl class="ip-mm-counts">${[['queued','대기'],['running','진행'],[mode.kind==='live'?'interrupted':'held',mode.kind==='live'?'중단 기록':'검토 대기'],['attention','확인 필요']].map(([key,title])=>`<div><dt>${title}</dt><dd>${number(mode[key])}</dd></div>`).join('')}</dl>
   <dl class="ip-mm-times"><div><dt>최근 처리 완료</dt><dd>${stamp(mode.lastCompletedAt)}</dd></div><div><dt>최근 오류 기록</dt><dd>${stamp(mode.lastFailedAt)}</dd></div>${mode.transport==='pc'?`<div><dt>PC 마지막 접속</dt><dd>${stamp(mode.lastSeenAt)}</dd></div>`:''}</dl>
   <p class="ip-mm-small">24시간 완료 ${number(mode.completed24h)}건 · 오류 기록 ${number(mode.failed24h)}건${mode.questionCount!==null&&mode.questionCount!==undefined?` · 승인 문항 ${number(mode.questionCount)}개 (전체)`:''}</p>
   ${mode.kind==='live'&&mode.recordingPending?`<p class="ip-mm-small">음성 저장 확인 대기 ${number(mode.recordingPending)}건</p>`:''}
   ${mode.metricsAvailable===false?'<p class="ip-mm-small" role="status">처리 집계 연결을 확인해주세요.</p>':''}
   ${mode.checks?.length?`<details><summary>준비 상태 상세</summary><ul>${[...mode.checks,...(mode.runtimeChecks||[])].map(c=>`<li>${escape(c.label)} <strong>${c.ok===null?'미확인':c.ok?'확인됨':'확인 필요'}</strong></li>`).join('')}</ul></details>`:''}</article>`;
 }).join('')}</div><div class="ip-mm-footer"><p>홈에 들어올 때 한 번 조회하며, 이후에는 ‘상태 새로고침’을 눌러 갱신합니다. 상태 조회는 AI 분석이나 작업 재실행을 요청하지 않습니다.</p><p>접속·실행 상태는 아래 확인 시각 기준입니다. PC 접속 신호는 45초, 실행 준비 보고는 2분 이내 기준입니다. 최근 처리 완료는 실제 음성 인식·평가 정확도를 보증하지 않습니다.</p><small>확인 시각: ${stamp(data.checkedAt)} (한국 시간)</small></div>`;
}
export function mountMockMonitor(host,{request,doc=document}={}){
 let destroyed=false,busy=false;
 host.classList?.add('ip-mock-monitor');
 if(doc.createElement&&!doc.querySelector('link[data-mock-monitor-style]')){const link=doc.createElement('link');link.rel='stylesheet';link.href='/interview-mock-monitor.css?v=20261102-monitor';link.dataset.mockMonitorStyle='';doc.head.appendChild(link);}
 function paint(data){
  const open=Array.from(host.querySelectorAll?.('[data-monitor-mode] details[open]')||[]).map(detail=>detail.closest('[data-monitor-mode]').dataset.monitorMode);
  host.innerHTML=renderMockMonitor(data);
  for(const kind of open){const detail=host.querySelector?.(`[data-monitor-mode="${kind}"] details`);if(detail)detail.open=true;}
 }
 async function refresh(){
  if(destroyed||busy)return;busy=true;
  const control=host.querySelector?.('[data-mock-monitor-refresh]');if(control)control.disabled=true;
  try{const data=await request('admin_mock_monitor');if(!destroyed)paint(data);}
  catch{if(!destroyed)paint(unavailable());}
  finally{busy=false;}
 }
 host.innerHTML='<h3>모의면접 모니터링</h3><p>모드별 상태를 확인하는 중…</p>';
 host.onclick=e=>{if(e.target.closest('[data-mock-monitor-refresh]')){e.stopPropagation();void refresh();}};
 const ready=refresh();return {ready,canLeave:()=>true,refresh,destroy(){destroyed=true;host.onclick=null;}};
}
