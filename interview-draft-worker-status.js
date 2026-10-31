const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const time=value=>value&&Number.isFinite(Date.parse(value))?escape(new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false})):'기록 없음';
export function renderWorkerStatus(data){
 if(!data.enabled)return '<h3>경험 질문 생성기</h3><p>질문 생성 기능이 꺼져 있습니다.</p>';
 const label=!data.lastSeenAt?'연결 기록 없음':!data.connected?'연결 확인 지연':data.running?'질문 생성 중':'연결됨 · 요청 대기 중';
 const count=value=>Number.isSafeInteger(value)&&value>=0?value.toLocaleString('ko-KR'):'—';
 return `<div class="ip-row"><h3>경험 질문 생성기</h3><strong>${label}</strong></div>
 <p>생성 중 ${count(data.running)}건 · 대기 ${count(data.queued)}건${data.countsLimited?' (일부 작업만 집계됨)':''}</p>
 <p>마지막 접속: ${time(data.lastSeenAt)}<br>최근 생성 완료: ${time(data.lastCompletedAt)}<br>최근 실패: ${time(data.lastFailedAt)}</p>
 ${!data.connected?'<p role="alert">작업기 연결을 확인해주세요. 작업 PC의 절전·종료 또는 네트워크 문제일 수 있습니다. 배정된 작업이 남아 있어도 실제 처리가 멈췄을 수 있습니다.</p>':''}
 <p class="ip-help">화면을 보고 있을 때 10초마다 갱신합니다. 접속 신호가 45초 넘게 없으면 연결 확인 지연으로 표시합니다. 생성 중 건수는 유효한 작업 배정 기준입니다. 연결됨은 AI 생성 성공을 보장하지 않습니다.</p>
 <small>확인 시각: ${time(data.checkedAt)} (한국 시간)</small>`;
}
export function mountDraftWorkerStatus(host,{request,doc=document,schedule=setTimeout,cancel=clearTimeout}={}){
 let destroyed=false,timer=null,busy=false;
 async function refresh(){
  cancel(timer);
  if(destroyed||doc.hidden||busy)return;
  busy=true;
  try{
   const data=await request('admin_draft_worker_status');
   if(!destroyed)host.innerHTML=renderWorkerStatus(data);
  }catch{
   if(!destroyed)host.innerHTML='<h3>경험 질문 생성기</h3><p role="alert">상태를 확인하지 못했습니다. 연결 상태를 다시 확인 중입니다.</p><p class="ip-help">10초 뒤 다시 확인합니다.</p>';
  }finally{
   busy=false;
   if(!destroyed&&!doc.hidden)timer=schedule(refresh,10000);
  }
 }
 const visibility=()=>{cancel(timer);if(!doc.hidden)void refresh();};
 doc.addEventListener('visibilitychange',visibility);
 host.innerHTML='<h3>경험 질문 생성기</h3><p>실행 상태를 확인하는 중…</p>';
 void refresh();
 return {destroy(){destroyed=true;cancel(timer);doc.removeEventListener('visibilitychange',visibility);}};
}
