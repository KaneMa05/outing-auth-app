const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={received:'접수',reviewing:'검토 중',resolved:'처리 완료'};
export function mountAppFeedback(host,{request,canWrite=false}){
 let destroyed=false,version=0,page=0,status='all';
 const current=t=>!destroyed&&version===t&&host.isConnected;
 async function load(){
  const ticket=++version;
  host.innerHTML='<p role="status">의견을 불러오는 중…</p>';
  try{
   const data=await request('admin_app_feedback_list',{page,status});if(!current(ticket))return;
   const items=(data.items||[]).slice(0,30);
   host.innerHTML=`<section class="ip-panel"><h3>테스트앱 오류·개선 의견</h3><p class="ip-help">관리자 전용 비공개 접수입니다. 녹음과 답변 본문은 자동 수집하지 않습니다.</p><label>처리 상태<select data-status>${[['all','전체'],...Object.entries(labels)].map(([key,label])=>`<option value="${key}" ${key===status?'selected':''}>${label}</option>`).join('')}</select></label><p data-feedback-message role="status"></p><div>${items.length?items.map(item=>`<article class="ip-panel" data-report="${esc(item.id)}"><p><strong>${item.kind==='bug'?'오류 신고':'개선 의견'}</strong> · ${esc(labels[item.status])}</p><p class="ip-help">${esc(item.student_name||item.student_id)} · ${esc(item.screen)} · 앱 ${esc(item.app_version)} · ${esc(new Date(item.created_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}))}</p><p style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(item.content)}</p>${canWrite?`<label>처리 상태<select data-report-status>${Object.entries(labels).map(([key,label])=>`<option value="${key}" ${key===item.status?'selected':''}>${label}</option>`).join('')}</select></label><button class="ip-btn" data-save="${esc(item.id)}">상태 저장</button>`:''}</article>`).join(''):'<p>접수된 의견이 없습니다.</p>'}</div><div class="ip-toolbar"><button class="ip-btn" data-previous ${page===0?'disabled':''}>이전</button><span>${page+1}페이지</span><button class="ip-btn" data-next ${data.hasMore?'':'disabled'}>다음</button></div></section>`;
   host.querySelector('[data-status]').onchange=e=>{status=e.target.value;page=0;void load();};
   host.querySelector('[data-previous]').onclick=()=>{if(page>0){page--;void load();}};
   host.querySelector('[data-next]').onclick=()=>{page++;void load();};
   host.querySelectorAll('[data-save]').forEach(button=>button.onclick=async()=>{
    const row=items.find(item=>item.id===button.dataset.save),value=button.closest('[data-report]').querySelector('[data-report-status]').value;
    button.disabled=true;
    try{await request('admin_app_feedback_update',{id:row.id,revision:row.revision,status:value});if(current(ticket))await load();}
    catch{if(current(ticket)){host.querySelector('[data-feedback-message]').textContent='저장하지 못했습니다. 다른 관리자가 변경했을 수 있으니 새로 확인해주세요.';button.disabled=false;}}
   });
  }catch{if(current(ticket))host.innerHTML='<p role="alert">의견을 불러오지 못했습니다.</p><button class="ip-btn" data-retry>다시 확인</button>';if(current(ticket))host.querySelector('[data-retry]').onclick=()=>void load();}
 }
 const ready=load();return {ready,destroy(){destroyed=true;version++;},canLeave:()=>true};
}
