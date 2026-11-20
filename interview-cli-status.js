const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const time=value=>value&&Number.isFinite(Date.parse(value))?escape(new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false})):'기록 없음';
const definitions=[['core25','핵심 25제 진단 CLI','핵심 25제 답변 진단'],['questions','경험 질문 생성 CLI','인생그래프 경험의 후속 질문'],['answers','답변 초안 생성 CLI','자기소개·지원동기·공직관·핵심인성 초안'],['practice_asr','녹음 전사 프로그램','Whisper large-v3 · PC에서 녹음을 순서대로 전사합니다.']];
const count=value=>Number.isSafeInteger(value)&&value>=0?value.toLocaleString('ko-KR'):'—';
function card(id,title,description,data){
 const unavailable=!data||data.available!==true,asr=id==='practice_asr';
 const label=unavailable?'상태 확인 불가':!data.lastSeenAt?'연결 기록 없음':asr?(data.state==='stopped'?'중지됨':!data.connected?'응답 없음':data.state==='error'?'오류 확인 필요':data.state==='starting'?'시작 중':data.state==='processing'?'전사 중':'실행 중 · 녹음 대기'):!data.connected?'연결 확인 지연':data.running?'처리 중':'연결됨 · 요청 대기 중';
 return `<article class="ip-cli-worker" data-cli-worker="${id}" aria-label="${title}"><div class="ip-row"><h4>${title}</h4><span class="ip-badge ${!unavailable&&data.connected&&data.state!=='error'?'approved':'needs_revision'}" role="status">${label}</span></div><p class="ip-help">${description}</p>
 ${unavailable?'<p role="alert">실행 상태를 확인하지 못했습니다. 상태 새로고침을 눌러 다시 확인해주세요.</p>':`
 ${asr?'':`<p>생성 기능: <strong>${data.enabled?'켜짐':'꺼짐'}</strong></p>`}<p>처리 중 ${count(data.running)}건 · 대기 ${count(data.queued)}건${asr?' · 실패 '+count(data.failed)+'건':''}${data.countsLimited?' (일부 작업만 집계됨)':''}</p>
 <p class="ip-help">마지막 접속: ${time(data.lastSeenAt)}<br>최근 완료: ${time(data.lastCompletedAt)}<br>최근 실패: ${time(data.lastFailedAt)}</p>
 ${!data.connected?`<p class="ip-help">${asr?'작업 PC의 전사 프로그램 실행과 네트워크 연결을 확인해주세요.':'작업 PC의 CLI 실행과 네트워크 연결을 확인해주세요.'}</p>`:''}`}</article>`;
}
export function renderCLIStatus(data){
 return `<div class="ip-row"><h3>작업 프로그램 실행 상태</h3><button type="button" class="ip-btn" data-cli-refresh>상태 새로고침</button></div><p class="ip-help">조회 시점의 서버 접속 신호와 작업 현황입니다. 홈에 들어올 때 한 번 조회하며, 이후에는 ‘상태 새로고침’을 눌러 확인하세요.</p>
 <div class="ip-cli-status-grid">${definitions.map(([id,title,description])=>card(id,title,description,data.workers?.find(w=>w.id===id))).join('')}</div>
 <details class="ip-help"><summary>상태 표시 기준</summary><p>전사 프로그램은 대기 중에도 30초마다 접속 신호를 보냅니다. 90초 동안 신호가 없으면 ‘응답 없음’으로 표시합니다. 실패 중 자동 재시도 가능한 녹음은 대기 건수에도 포함됩니다. 실행 상태는 프로그램 접속 기준이며 전사 성공 여부는 녹음별 결과에서 확인하세요.</p><p>마지막 접속 신호가 핵심 25제 진단은 60초, 경험 질문 생성은 45초, 답변 초안 생성은 120초를 넘으면 연결 확인 지연으로 표시합니다. 처리 중 건수는 유효한 작업 배정 기준이며 실제 CLI 진행률은 아닙니다. 연결됨은 로그인·잔여 한도·생성 성공을 보장하지 않습니다. 생성 기능의 켜짐·꺼짐은 작업기별 설정이며, 수강생 이용 권한은 별도로 적용됩니다.</p></details><small>확인 시각: ${time(data.checkedAt)} (한국 시간)</small>`;
}
export function mountCLIStatus(host,{request}={}){
 let destroyed=false,busy=false;
 async function refresh(){
  if(destroyed||busy)return;
  busy=true;const control=host.querySelector('[data-cli-refresh]');if(control)control.disabled=true;
  try{
   const data=await request('admin_cli_status');
   if(!destroyed)host.innerHTML=renderCLIStatus(data);
  }catch{
   if(!destroyed)host.innerHTML=renderCLIStatus({});
  }finally{
   busy=false;
  }
 }
 host.onclick=e=>{if(e.target.closest('[data-cli-refresh]')){e.stopPropagation();void refresh();}};
 host.innerHTML='<h3>작업 프로그램 실행 상태</h3><p role="status">프로그램 실행 상태를 확인하는 중…</p>';
 const ready=refresh();
 return {ready,refresh,canLeave:()=>true,destroy(){destroyed=true;host.onclick=null;}};
}
