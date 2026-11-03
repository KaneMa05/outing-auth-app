const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const time=value=>value&&Number.isFinite(Date.parse(value))?escape(new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false})):'기록 없음';
const definitions=[['core25','핵심 25제 진단 CLI','핵심 25제 답변 진단'],['questions','경험 질문 생성 CLI','인생그래프 경험의 후속 질문'],['answers','답변 초안 생성 CLI','자기소개·지원동기·공직관·핵심인성 초안']];
const count=value=>Number.isSafeInteger(value)&&value>=0?value.toLocaleString('ko-KR'):'—';
function card(id,title,description,data){
 const unavailable=!data||data.available!==true;
 const label=unavailable?'상태 확인 불가':!data.lastSeenAt?'연결 기록 없음':!data.connected?'연결 확인 지연':data.running?'처리 중':'연결됨 · 요청 대기 중';
 return `<article class="ip-cli-worker" data-cli-worker="${id}" aria-label="${title}"><div class="ip-row"><h4>${title}</h4><span class="ip-badge ${!unavailable&&data.connected?'approved':'needs_revision'}" role="status">${label}</span></div><p class="ip-help">${description}</p>
 ${unavailable?'<p role="alert">실행 상태를 확인하지 못했습니다. 잠시 후 다시 확인합니다.</p>':`
 <p>생성 기능: <strong>${data.enabled?'켜짐':'꺼짐'}</strong></p><p>처리 중 ${count(data.running)}건 · 대기 ${count(data.queued)}건${data.countsLimited?' (일부 작업만 집계됨)':''}</p>
 <p class="ip-help">마지막 접속: ${time(data.lastSeenAt)}<br>최근 완료: ${time(data.lastCompletedAt)}<br>최근 실패: ${time(data.lastFailedAt)}</p>
 ${!data.connected?'<p class="ip-help">작업 PC의 CLI 실행과 네트워크 연결을 확인해주세요.</p>':''}`}</article>`;
}
export function renderCLIStatus(data){
 return `<div class="ip-row"><h3>CLI 실행 상태</h3><button type="button" class="ip-btn" data-cli-refresh>상태 새로고침</button></div><p class="ip-help">전체 CLI 작업기의 서버 접속 신호와 작업 현황입니다. 홈을 보고 있을 때 10초마다 갱신합니다.</p>
 <div class="ip-cli-status-grid">${definitions.map(([id,title,description])=>card(id,title,description,data.workers?.find(w=>w.id===id))).join('')}</div>
 <details class="ip-help"><summary>상태 표시 기준</summary><p>마지막 접속 신호가 핵심 25제 진단은 60초, 경험 질문 생성은 45초, 답변 초안 생성은 120초를 넘으면 연결 확인 지연으로 표시합니다. 처리 중 건수는 유효한 작업 배정 기준이며 실제 CLI 진행률은 아닙니다. 연결됨은 로그인·잔여 한도·생성 성공을 보장하지 않습니다. 생성 기능의 켜짐·꺼짐은 작업기별 설정이며, 수강생 이용 권한은 별도로 적용됩니다.</p></details><small>확인 시각: ${time(data.checkedAt)} (한국 시간)</small>`;
}
export function mountCLIStatus(host,{request,doc=document,schedule=setTimeout,cancel=clearTimeout}={}){
 let destroyed=false,timer=null,busy=false;
 async function refresh(){
  cancel(timer);
  if(destroyed||doc.hidden||busy)return;
  busy=true;const control=host.querySelector('[data-cli-refresh]');if(control)control.disabled=true;
  try{
   const data=await request('admin_cli_status');
   if(!destroyed)host.innerHTML=renderCLIStatus(data);
  }catch{
   if(!destroyed)host.innerHTML=renderCLIStatus({});
  }finally{
   busy=false;
   if(!destroyed&&!doc.hidden)timer=schedule(refresh,10000);
  }
 }
 const visibility=()=>{cancel(timer);if(!doc.hidden)void refresh();};
 doc.addEventListener('visibilitychange',visibility);
 host.onclick=e=>{if(e.target.closest('[data-cli-refresh]')){e.stopPropagation();void refresh();}};
 host.innerHTML='<h3>CLI 실행 상태</h3><p role="status">전체 CLI 실행 상태를 확인하는 중…</p>';
 const ready=refresh();
 return {ready,canLeave:()=>true,destroy(){destroyed=true;cancel(timer);doc.removeEventListener('visibilitychange',visibility);host.onclick=null;}};
}
