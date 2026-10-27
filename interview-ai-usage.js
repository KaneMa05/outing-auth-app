const kinds={self_intro:'자기소개',motivation:'지원동기',public_service:'공직관',core30:'핵심 문항'};
const statuses={QUEUED:'대기 중',PROCESSING:'생성 중',COMPLETED:'생성 완료',NEEDS_INPUT:'자료 보완 필요',FAILED:'생성 실패',BLOCKED:'처리 확인 필요',CANCELED:'중단됨'};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=v=>new Date(v).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
export function mountAIUsage(host,{request,studentId,kind}){
 let destroyed=false,version=0;
 async function load(){
  const current=++version;
  host.innerHTML='<p role="status">AI 초안 요청 기록을 확인하는 중…</p>';
  try{
   const data=await request('admin_ai_usage',{targetStudentId:studentId});
   if(destroyed||current!==version)return;
   const key=kind==='introduction'?'self_intro':kind==='core'?'core30':kind;
   host.innerHTML=`<section class="ip-panel" aria-label="AI 초안 요청 기록"><h4>AI 초안 요청 기록</h4><div class="ip-table-wrap"><table class="ip-review-table"><thead><tr><th>항목</th><th>요청 여부</th><th>최근 요청일</th><th>최근 요청의 생성 상태</th></tr></thead><tbody>${data.items.filter(i=>!key||i.kind===key).map(i=>`<tr><td>${esc(kinds[i.kind]||i.kind)}</td><td>${i.requested?'요청됨':'요청 기록 없음'}</td><td>${i.requestedAt?esc(date(i.requestedAt)):'—'}</td><td>${i.requested?[...new Set(i.statuses)].map(s=>esc(statuses[s]||'상태 확인 필요')).join(' · ')||'상태 확인 필요':'—'}</td></tr>`).join('')}</tbody></table></div><p class="ip-help">서버에 접수된 요청 기준입니다. 요청 기록은 제출한 글에 AI 초안을 사용했다는 의미는 아닙니다.</p><button type="button" class="ip-btn" data-ai-usage-refresh>기록 새로고침</button></section>`;
  }catch{if(!destroyed&&current===version)host.innerHTML='<p role="alert">AI 초안 요청 기록을 불러오지 못했습니다.</p><button type="button" class="ip-btn" data-ai-usage-refresh>다시 시도</button>';}
 }
 host.onclick=e=>{if(e.target.closest('[data-ai-usage-refresh]')){e.stopPropagation();load();}};
 const ready=load();return {ready,destroy(){destroyed=true;++version;host.onclick=null;}};
}
