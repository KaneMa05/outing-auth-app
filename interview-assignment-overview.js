import {mountStudentReview} from './interview-review-ui.js?v=20261027-overview-modal';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const titles=['기본이력','인생그래프','자기소개','지원동기','공직관','핵심 25제'];
const saved=status=>status==='saved'?'작성됨':'미작성';
const writing=value=>value?.submitted?`제출 ${value.submitted}건`:value?.saved?'저장 · 미제출':'미작성';
export function mountAssignmentOverview(host,{request,templates,canWrite=false}){
 let destroyed=false,version=0,page=0,total=0,pageSize=30,filter={search:'',track:''};
 host.innerHTML=`<section class="ip-panel"><h3>전체 학생 과제 현황</h3><p>기본이력·인생그래프는 저장된 작성 여부, 답변 과제는 저장·제출 현황입니다. 교사 검토 여부를 의미하지 않습니다. 임시저장과 이용 중지 계정도 포함합니다.</p><form data-overview-filter class="ip-toolbar"><label>학생 검색<input name="search" maxlength="200" placeholder="이름 · 수험번호 · 학생 ID"></label><label>직렬<select name="track"><option value="">전체 직렬</option>${['공채','항해','기관','방제','관제','기타'].map(t=>`<option>${t}</option>`).join('')}</select></label><button class="ip-btn ip-primary">검색</button><button type="button" class="ip-btn" data-overview-action="reset">초기화</button></form></section><div data-overview-results aria-live="polite"></div>`;
 const results=host.querySelector('[data-overview-results]');
 const detailHost=document.createElement('div');host.append(detailHost);let reader=null;
 function closeReader(){reader?.destroy();reader=null;detailHost.replaceChildren();}

 async function load(){
  closeReader();const ticket=++version;results.setAttribute('aria-busy','true');results.innerHTML='<p role="status">전체 과제 현황을 불러오는 중…</p>';
  try{
   const data=await request('admin_assignment_overview',{...filter,page});
   if(destroyed||version!==ticket)return;
   total=data.total;pageSize=data.pageSize;
   if(page>0&&page*pageSize>=total){page=Math.max(0,Math.ceil(total/pageSize)-1);return load();}
   results.innerHTML=`<section class="ip-panel"><div class="ip-row"><p>총 <strong>${total}명</strong> · ${page+1} / ${Math.max(1,Math.ceil(total/pageSize))}페이지</p><button type="button" class="ip-btn" data-overview-action="reload">현황 새로고침</button></div><p class="ip-help">핵심 25제는 저장 문항 수와 제출 문항 수를 각각 표시합니다. 내용 보기를 누르면 학생의 모든 과제와 AI 초안 요청 기록을 한 창에서 확인할 수 있습니다.</p><div class="ip-table-wrap"><table class="ip-review-table" style="min-width:900px"><caption>학생별 과제 작성·제출 현황</caption><thead><tr><th scope="col">학생</th>${titles.map(t=>`<th scope="col">${t}</th>`).join('')}<th scope="col">조회</th></tr></thead><tbody>${data.students.map(s=>`<tr><th scope="row">${esc(s.name)}<small>${esc(s.track)} · ${esc(s.exam_number)}</small>${!s.enabled||!s.is_active?'<small>이용 중지·비활성</small>':''}</th><td>${saved(s.basic)}</td><td>${saved(s.life)}</td>${['introduction','motivation','public_service'].map(k=>`<td>${writing(s[k])}</td>`).join('')}<td>제출 ${s.core.submitted}/${s.core.total}<small>저장 ${s.core.saved}/${s.core.total}</small></td><td><button type="button" class="ip-btn" data-overview-student="${esc(s.id)}">내용 보기</button></td></tr>`).join('')||'<tr><td colspan="8">검색 조건에 맞는 학생이 없습니다.</td></tr>'}</tbody></table></div><div class="ip-toolbar"><button type="button" class="ip-btn" data-overview-action="prev" ${page===0?'disabled':''}>이전</button><button type="button" class="ip-btn" data-overview-action="next" ${(page+1)*pageSize>=total?'disabled':''}>다음</button></div></section>`;
  }catch{if(!destroyed&&version===ticket)results.innerHTML='<p role="alert">과제 현황을 불러오지 못했습니다.</p><button type="button" class="ip-btn" data-overview-action="reload">다시 시도</button>';}
  finally{if(version===ticket)results.removeAttribute('aria-busy');}
 }
 host.onsubmit=e=>{if(!e.target.matches('[data-overview-filter]'))return;e.preventDefault();e.stopPropagation();filter=Object.fromEntries(new FormData(e.target));page=0;load();};
 host.onclick=e=>{
  if(detailHost.contains(e.target))return;
  e.stopPropagation();const studentButton=e.target.closest('[data-overview-student]');
  if(studentButton){if(reader&&!reader.canLeave())return;closeReader();reader=mountStudentReview(detailHost,{request,templates,canWrite,initialStudentId:studentButton.dataset.overviewStudent,modal:true,onCloseDetail:()=>studentButton.focus({preventScroll:true})});return;}
  const b=e.target.closest('[data-overview-action]');if(!b||b.disabled)return;
  const action=b.dataset.overviewAction;
  if(action==='reset'){host.querySelector('form').reset();filter={search:'',track:''};page=0;}
  if(action==='prev')page=Math.max(0,page-1);
  if(action==='next'&&(page+1)*pageSize<total)page++;
  load();
 };
 const ready=load();
 return {ready,canLeave:()=>!reader||reader.canLeave(),destroy(){closeReader();destroyed=true;++version;host.onclick=null;host.onsubmit=null;}};
}
