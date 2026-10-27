import {mountAIUsage} from './interview-ai-usage.js?v=20261027';
import {mountWriting} from './interview-writing-ui.js?v=20261024-colors';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const kinds={introduction:'자기소개',motivation:'지원동기',public_service:'공직관'};
const statuses={submitted:'확인 대기',needs_revision:'보완 필요',approved:'확인 완료'};
const date=v=>v?new Date(v).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';
export function mountWritingBoard(host,{request,canWrite=false}){
 let destroyed=false,version=0,page=0,data=null,editor=null,selected=null,loading=false,filter={search:'',kind:'',status:''};
 let aiUsage=null;
 const canLeave=()=>!editor||editor.canLeave();
 const close=()=>{aiUsage?.destroy();aiUsage=null;editor?.destroy();editor=null;selected=null;host.querySelector('[data-board-detail]').replaceChildren();};
 host.innerHTML=`<section class="ip-panel"><div class="ip-row"><div><h3>제출물 첨삭 게시판</h3><p class="ip-help">제출한 답변을 열어 원문에 표시하고 학생에게 전달하세요. 학생별 최신 제출이 한 줄씩 표시됩니다.</p></div></div>
  <form data-board-filter class="ip-board-filter"><label>제목 · 학생 검색<input name="search" maxlength="200" placeholder="제목, 이름, 수험번호 또는 학생 ID"></label><label>제출 항목<select name="kind"><option value="">전체 항목</option>${Object.entries(kinds).map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></label><label>처리 상태<select name="status"><option value="">전체 상태</option>${Object.entries(statuses).map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></label><button class="ip-btn ip-primary">검색</button><button type="button" class="ip-btn" data-board-action="reset">초기화</button></form></section>
  <div data-board-results aria-live="polite"></div><div data-board-detail></div>`;
 const results=host.querySelector('[data-board-results]');
 const fail=()=>{results.innerHTML='<p role="alert">제출 목록을 불러오지 못했습니다. 다시 시도해주세요.</p><button type="button" class="ip-btn" data-board-action="reload">다시 시도</button>';};
 function render(){
  results.innerHTML=`<div class="ip-review-summary"><span>확인 대기<strong>${data.pending}</strong></span><span>보완 필요<strong>${data.revision}</strong></span><span>확인 완료<strong>${data.approved}</strong></span></div><div class="ip-row"><p>검색 결과 <strong>${data.total}건</strong></p><button type="button" class="ip-btn" data-board-action="reload">목록 새로고침</button></div>
   <div class="ip-panel ip-table-wrap"><table class="ip-board-table"><caption class="ip-help">최근 제출 순 · 첨삭 또는 조회 버튼으로 답변 열기</caption><thead><tr><th scope="col">번호</th><th scope="col">항목</th><th scope="col">제목</th><th scope="col">학생</th><th scope="col">처리 상태</th><th scope="col">제출일</th><th scope="col">관리</th></tr></thead><tbody>${data.submissions.map((s,i)=>`<tr ${selected?.student_id===s.student_id&&selected?.kind===s.kind?'class="is-selected"':''}><td>${data.total-page*data.pageSize-i}</td><td>${kinds[s.kind]}</td><td><button type="button" class="ip-board-title" data-board-open="${i}">${esc(s.prompt_snapshot)} · ${s.submission_round}차 제출</button></td><td><strong>${esc(s.name)}</strong><small>${esc(s.track)} · ${esc(s.exam_number)}</small></td><td><span class="ip-badge ${s.submission_status}">${statuses[s.submission_status]}</span></td><td>${esc(date(s.submitted_at))}</td><td><button type="button" class="ip-btn" data-board-open="${i}">${canWrite?'첨삭':'조회'}</button></td></tr>`).join('')||'<tr><td colspan="7" class="ip-empty">조건에 맞는 제출물이 없습니다.</td></tr>'}</tbody></table></div>
   <div class="ip-toolbar"><button type="button" class="ip-btn" data-board-action="prev" ${page===0?'disabled':''}>이전</button><span>${page+1} / ${Math.max(1,Math.ceil(data.total/data.pageSize))} 페이지</span><button type="button" class="ip-btn" data-board-action="next" ${(page+1)*data.pageSize>=data.total?'disabled':''}>다음</button></div>`;
 }
 async function load({keepEditor=false}={}){
  const current=++version;loading=true;if(!keepEditor)close();
  results.setAttribute('aria-busy','true');
  try{
   const next=await request('admin_writing_board',{...filter,page});if(destroyed||current!==version)return;
   if(page>0&&page*next.pageSize>=next.total){page=Math.max(0,Math.ceil(next.total/next.pageSize)-1);return load({keepEditor});}
   data=next;render();
  }catch(e){if(!destroyed&&current===version)fail();}
  finally{if(current===version){loading=false;results.removeAttribute('aria-busy');}}
 }
 function open(index){
  const submission=data?.submissions[index];if(!submission)return;
  close();selected=submission;render();
  const box=host.querySelector('[data-board-detail]');
  box.innerHTML=`<section class="ip-panel ip-board-detail"><div class="ip-row"><h3 tabindex="-1">${esc(submission.name)} · ${kinds[submission.kind]} 첨삭</h3><button type="button" class="ip-btn" data-board-action="close">목록으로</button></div><div data-board-ai-usage></div><div data-board-editor></div></section>`;
  aiUsage=mountAIUsage(box.querySelector('[data-board-ai-usage]'),{request,studentId:submission.student_id,kind:submission.kind});
  editor=mountWriting(box.querySelector('[data-board-editor]'),{request,admin:true,studentId:submission.student_id,kind:submission.kind,initialItemId:submission.item_id,canWrite,hideQuestionPicker:true,onFeedbackSaved(){load({keepEditor:true});}});
  box.querySelector('h3').focus({preventScroll:true});box.scrollIntoView({block:'start',behavior:'smooth'});
 }
 host.onsubmit=e=>{e.preventDefault();e.stopPropagation();if(!e.target.matches('[data-board-filter]')||!canLeave())return;filter=Object.fromEntries(new FormData(e.target));page=0;load();};
 host.onclick=e=>{
  e.stopPropagation();const b=e.target.closest('[data-board-action],[data-board-open]');if(!b||b.disabled||loading||!canLeave())return;
  if(b.dataset.boardOpen!==undefined){open(Number(b.dataset.boardOpen));return;}
  switch(b.dataset.boardAction){
   case 'reset':host.querySelector('form').reset();filter={search:'',kind:'',status:''};page=0;load();break;
   case 'prev':if(page>0){page--;load();}break;
   case 'next':if(data&&(page+1)*data.pageSize<data.total){page++;load();}break;
   case 'reload':load();break;
   case 'close':close();render();results.querySelector('button')?.focus();results.scrollIntoView({block:'start',behavior:'smooth'});break;
  }
 };
 host.oninput=e=>e.stopPropagation();host.onchange=e=>e.stopPropagation();
 const ready=load();
 return {ready,canLeave,destroy(){aiUsage?.destroy();destroyed=true;++version;editor?.destroy();host.onclick=null;host.onsubmit=null;host.oninput=null;host.onchange=null;}};
}
