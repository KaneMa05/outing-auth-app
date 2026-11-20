const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const kinds={introduction:'자기소개',motivation:'지원동기',public_service:'공직관'};
const statuses={submitted:'확인 대기',needs_revision:'보완요청',approved:'첨삭완료 (수고하셨습니다.)'};
const date=v=>v?new Date(v).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';
export function mountWritingBoard(host,{request,canWrite=false}){
 let destroyed=false,version=0,page=0,data=null,loading=false,filter={search:'',kind:'',status:'submitted'};
 const canLeave=()=>true;
 host.innerHTML=`<section class="ip-panel"><div class="ip-row"><div><h3 data-board-heading>제출물 첨삭 게시판</h3><p class="ip-help">제출한 답변을 열어 원문에 표시하고 학생에게 전달하세요. 학생별 최신 제출이 한 줄씩 표시됩니다.</p></div></div>
  <form data-board-filter class="ip-board-filter"><label>제목 · 학생 검색<input name="search" maxlength="200" placeholder="제목, 이름, 수험번호 또는 학생 ID"></label><label>제출 항목<select name="kind"><option value="">전체 항목</option>${Object.entries(kinds).map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></label><label>처리 상태<select name="status">${Object.entries(statuses).map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></label><button class="ip-btn ip-primary">검색</button><button type="button" class="ip-btn" data-board-action="reset">초기화</button></form></section>
  <p class="ip-help">기본 목록에는 관리자가 확인할 제출물만 표시합니다. 보완요청·첨삭완료 건수를 누르면 해당 기록을 확인할 수 있습니다.</p><p data-board-message role="status"></p><div data-board-results aria-live="polite"></div>`;
 const results=host.querySelector('[data-board-results]');
 const fail=()=>{results.innerHTML='<p role="alert">제출 목록을 불러오지 못했습니다. 다시 시도해주세요.</p><button type="button" class="ip-btn" data-board-action="reload">다시 시도</button>';};
 function render(){
  const pending=filter.status==='submitted';
  host.querySelector('[data-board-heading]').textContent=pending?'제출물 첨삭 게시판':filter.status==='needs_revision'?'보완요청 제출물':'첨삭완료 제출물';
  results.innerHTML=`<div class="ip-review-summary">${[['submitted','pending','확인 대기',data.pending],['needs_revision','revision','보완요청',data.revision],['approved','completed','첨삭완료',data.approved]].map(([status,action,label,count])=>`<button type="button" class="ip-board-summary-button" data-board-action="${action}" aria-pressed="${filter.status===status}" aria-label="${label} ${count}건 목록 보기">${label}<strong>${count}</strong></button>`).join('')}</div><div class="ip-row"><p>${pending?'관리자 처리 대기':filter.status==='needs_revision'?'학생 보완 대기':'첨삭완료'} <strong>${data.total}건</strong></p><div class="ip-toolbar">${!pending?'<button type="button" class="ip-btn" data-board-action="active">제출물 게시판으로</button>':''}<button type="button" class="ip-btn" data-board-action="reload">목록 새로고침</button></div></div>
   <div class="ip-panel ip-table-wrap"><table class="ip-board-table"><caption class="ip-help">최근 제출 순 · 첨삭 또는 조회 버튼으로 답변 새 창 열기</caption><thead><tr><th scope="col">번호</th><th scope="col">학생</th><th scope="col">항목</th><th scope="col">차수</th><th scope="col">제출일</th><th scope="col">관리</th><th scope="col">처리상태</th></tr></thead><tbody>${data.submissions.map((s,i)=>`<tr><td>${data.total-page*data.pageSize-i}</td><td><strong>${esc(s.name)}</strong><small>${esc(s.track)} · ${esc(s.exam_number)}</small></td><td>${kinds[s.kind]}</td><td>${s.submission_round}차</td><td>${esc(date(s.submitted_at))}</td><td><div class="ip-board-actions"><button type="button" class="ip-btn" data-board-open="${i}" aria-label="${esc(s.name)} ${kinds[s.kind]} ${canWrite?'첨삭':'조회'} 새 창 열기">${canWrite?'첨삭':'조회'}</button>${canWrite?`<button type="button" class="ip-btn ip-danger" data-board-delete="${i}" aria-label="${esc(s.name)} ${kinds[s.kind]} 제출물 삭제">삭제</button>`:''}</div></td><td><span class="ip-badge ${s.submission_status}">${statuses[s.submission_status]}</span></td></tr>`).join('')||'<tr><td colspan="7" class="ip-empty">조건에 맞는 제출물이 없습니다.</td></tr>'}</tbody></table></div>
   <div class="ip-toolbar"><button type="button" class="ip-btn" data-board-action="prev" ${page===0?'disabled':''}>이전</button><span>${page+1} / ${Math.max(1,Math.ceil(data.total/data.pageSize))} 페이지</span><button type="button" class="ip-btn" data-board-action="next" ${(page+1)*data.pageSize>=data.total?'disabled':''}>다음</button></div>`;
 }
 async function load(){
  const current=++version;loading=true;
  results.setAttribute('aria-busy','true');
  try{
   const next=await request('admin_writing_board',{...filter,page});if(destroyed||current!==version)return;
   if(page>0&&page*next.pageSize>=next.total){page=Math.max(0,Math.ceil(next.total/next.pageSize)-1);return load();}
   data=next;render();
  }catch(e){if(!destroyed&&current===version)fail();}
  finally{if(current===version){loading=false;results.removeAttribute('aria-busy');}}
 }
 function open(index){
  const submission=data?.submissions[index];if(!submission)return;
  const url=new URL('./interview-writing-review.html',location.href);
  url.search=new URLSearchParams({studentId:submission.student_id,kind:submission.kind,itemId:submission.item_id||''}).toString();
  url.hash=new URLSearchParams({name:submission.name}).toString();
  // Open synchronously in the click handler so the browser treats this as a user action.
  const availableWidth=window.screen.availWidth||1120,availableHeight=window.screen.availHeight||900;
  const width=Math.min(1120,availableWidth),height=Math.min(900,availableHeight);
  const left=Math.round((window.screen.availLeft??0)+(availableWidth-width)/2),top=Math.round((window.screen.availTop??0)+(availableHeight-height)/2);
  const popup=window.open(url.href,'_blank',`popup=yes,width=${width},height=${height},left=${left},top=${top}`);
  const message=host.querySelector('[data-board-message]');message.replaceChildren();
  if(popup){popup.opener=null;popup.focus();}
  else{
   message.textContent='팝업이 차단되었습니다. 팝업을 허용하거나 다음 링크를 눌러주세요. ';
   const link=document.createElement('a');link.href=url.href;link.target='_blank';link.rel='noopener';link.textContent='첨삭 새 창 열기';message.append(link);
  }
 }
 async function remove(index){
  const submission=data?.submissions[index];if(!canWrite||!submission)return;
  if(!confirm(`${submission.name} · ${kinds[submission.kind]} 제출물을 게시판에서 삭제할까요?\n학생 원문과 첨삭 이력은 보존됩니다.`))return;
  const message=host.querySelector('[data-board-message]');message.textContent='삭제하는 중…';loading=true;
  host.querySelectorAll('[data-board-delete],[data-board-open]').forEach(n=>n.disabled=true);
  try{
   await request('admin_writing_delete',{targetStudentId:submission.student_id,kind:submission.kind,itemId:submission.item_id||'',revision:submission.revision});
   if(destroyed)return;message.textContent='게시판에서 삭제했습니다.';await load();
  }catch(error){
   if(destroyed)return;
   message.textContent=error.code==='revision_conflict'?'제출물이 변경되었습니다. 목록을 새로고침한 뒤 다시 확인해주세요.':'삭제하지 못했습니다. 잠시 후 다시 시도해주세요.';
   host.querySelectorAll('[data-board-delete],[data-board-open]').forEach(n=>n.disabled=false);
  }finally{loading=false;}
 }
 host.onsubmit=e=>{e.preventDefault();e.stopPropagation();if(!e.target.matches('[data-board-filter]')||!canLeave())return;filter=Object.fromEntries(new FormData(e.target));if(!Object.hasOwn(statuses,filter.status))filter.status='submitted';host.querySelector('[name=status]').value=filter.status;page=0;load();};
 const showStatus=status=>{filter={...filter,status};host.querySelector('[data-board-filter] [name=status]').value=status;page=0;load();};
 host.onclick=e=>{
  e.stopPropagation();const b=e.target.closest('[data-board-action],[data-board-open],[data-board-delete]');if(!b||b.disabled||loading||!canLeave())return;
  if(b.dataset.boardDelete!==undefined){void remove(Number(b.dataset.boardDelete));return;}
  if(b.dataset.boardOpen!==undefined){open(Number(b.dataset.boardOpen));return;}
  switch(b.dataset.boardAction){
   case 'completed':showStatus('approved');break;
   case 'revision':showStatus('needs_revision');break;
   case 'pending':case 'active':showStatus('submitted');break;
   case 'reset':host.querySelector('form').reset();filter={search:'',kind:'',status:'submitted'};page=0;load();break;
   case 'prev':if(page>0){page--;load();}break;
   case 'next':if(data&&(page+1)*data.pageSize<data.total){page++;load();}break;
   case 'reload':load();break;
  }
 };
 host.oninput=e=>e.stopPropagation();host.onchange=e=>e.stopPropagation();
 const refreshOnFocus=()=>{if(!destroyed&&!loading)load();};
 window.addEventListener('focus',refreshOnFocus);
 const ready=load();
 return {ready,canLeave,destroy(){destroyed=true;++version;window.removeEventListener('focus',refreshOnFocus);host.onclick=null;host.onsubmit=null;host.oninput=null;host.onchange=null;}};
}
