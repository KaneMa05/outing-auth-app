const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const titles={introduction:'자기소개',motivation:'지원동기',public_service:'공직관',core:'핵심 30제'};
const statuses={draft:'임시저장',saved:'저장 완료',needs_revision:'보완 필요',approved:'강사 확인'};
const submissionLabels={submitted:'교사 확인 대기',needs_revision:'보완 필요',approved:'확인 완료'};
const submittedDate=v=>new Date(v).toLocaleString('ko-KR');
export const writingFeedbackTitle=saved=>`${saved.feedback_revision!==saved.submitted_revision?'이전 제출 · ':''}${saved.feedback_round?`${saved.feedback_round}차 `:''}교사 피드백`;

// Load a single answer's history only on request; pending responses cannot
// populate another student/question after navigation or logout.
export function mountWritingHistory(host,{request,admin=false,studentId='',kind,itemId=''}){
 let destroyed=false,busy=false,page=0,loaded=false;
 host.innerHTML='<details class="ip-writing-history"><summary>회차별 제출·피드백 기록</summary><div data-rounds-content></div></details>';
 const details=host.querySelector('details'),box=host.querySelector('[data-rounds-content]');
 async function load(){
  if(busy||destroyed)return;busy=true;
  box.innerHTML='<p role="status">제출 기록을 불러오는 중…</p>';
  try{
   const result=await request(admin?'admin_writing_history':'writing_history',{kind,itemId,page,...(admin?{targetStudentId:studentId}:{})});
   if(destroyed)return;
   box.innerHTML=result.rounds.map((r,i)=>`<details class="ip-writing-round" ${i===0?'open':''}><summary><strong>${r.round}차 제출 · ${submissionLabels[r.status]}</strong></summary><p class="ip-help">제출일 ${esc(submittedDate(r.submitted_at))}</p><h4>제출한 답변</h4><p class="ip-writing-text">${esc(r.submitted_body)}</p>${r.feedback?`<div class="ip-feedback"><strong>${r.round}차 교사 피드백</strong><p>${esc(r.feedback)}</p><small>${r.feedback_at?'피드백 수정일 '+esc(submittedDate(r.feedback_at)):'피드백 날짜 기록 없음'}</small></div>`:'<p class="ip-help">이 회차에 등록된 피드백이 없습니다.</p>'}</details>`).join('')||'<p>아직 제출 기록이 없습니다.</p>';
   box.insertAdjacentHTML('beforeend',`<div class="ip-toolbar"><button class="ip-btn" type="button" data-round-page="prev" ${page===0?'disabled':''}>이전</button><span>${page+1} / ${Math.max(1,Math.ceil(result.total/result.pageSize))}</span><button class="ip-btn" type="button" data-round-page="next" ${(page+1)*result.pageSize>=result.total?'disabled':''}>다음</button></div>`);
   loaded=true;
  }catch(e){if(!destroyed)box.innerHTML='<p role="alert">제출 기록을 불러오지 못했습니다.</p><button class="ip-btn" type="button" data-round-retry>다시 시도</button>';}
  finally{busy=false;}
 }
 details.ontoggle=()=>{if(details.open&&!loaded)load();};
 host.onclick=e=>{
  e.stopPropagation();const n=e.target.closest('[data-round-page],[data-round-retry]');if(!n||n.disabled||busy)return;
  if(n.dataset.roundPage)page+=n.dataset.roundPage==='next'?1:-1;
  load();
 };
 return {destroy(){destroyed=true;details.ontoggle=null;host.onclick=null;}};
}
const error=e=>({
 revision_conflict:'다른 곳에서 내용이 변경되었습니다. 입력을 복사해 보관한 뒤 페이지를 새로고침해주세요.',
 question_unavailable:'현재 공개되지 않은 질문입니다. 입력을 복사해 보관한 뒤 페이지를 새로고침해주세요.',
 invalid_request:'내용을 입력해주세요. 최대 10,000자까지 저장할 수 있습니다.',
 not_enrolled:'면접반 이용 등록과 기간을 확인해주세요.',unauthorized:'다시 로그인해주세요.',
 not_submitted:'학생이 교사에게 제출한 답변에 피드백을 남길 수 있습니다.',
 forbidden:'이 내용을 볼 권한이 없습니다.'
}[e.code||e.message]||'저장하지 못했습니다. 입력은 유지됩니다. 잠시 후 다시 시도해주세요.');

export function mountWriting(host,{request,kind='introduction',admin=false,studentId='',canWrite=true,hideQuestionPicker=false,initialItemId='',onFeedbackSaved=()=>{}}){
 let rows=[],items=[],selected='',dirty=false,busy=true,destroyed=false,blocked=false;
 let history=null;
 const row=()=>rows.find(r=>r.kind===(admin?items.find(i=>i.key===selected)?.kind:kind)&&r.item_id===(items.find(i=>i.key===selected)?.id||''));
 const item=()=>items.find(i=>i.key===selected);
 const tell=(text,failed=false)=>{const n=host.querySelector('[data-writing-message]');if(n){n.textContent=text;n.dataset.error=String(failed);}};
 const canLeave=()=>{if(busy){tell('저장·불러오기가 끝난 뒤 이동해주세요.');return false;}return !dirty||confirm('저장하지 않은 답변이 있습니다. 변경 내용을 버리고 이동할까요?');};
 const beforeUnload=e=>{if(dirty||busy){e.preventDefault();e.returnValue='';}};
 window.addEventListener('beforeunload',beforeUnload);
 function render(){
  history?.destroy();history=null;
  const current=item(),saved=row();
  host.innerHTML=`${items.length&& (admin||kind==='core'&&!hideQuestionPicker)?`<label class="ip-writing-picker">${admin?'작성 답변 선택':'질문 선택'}<select data-writing-select>${items.map(i=>`<option value="${esc(i.key)}" ${i.key===selected?'selected':''}>${esc(i.label)}${i.retired?' (비공개·기존 답변)':''}</option>`).join('')}</select></label>`:''}
   <p class="ip-message" data-writing-message role="status"></p>
   ${current?`<section class="ip-panel ip-writing-editor"><div class="ip-row"><h3>${esc(current.prompt)}</h3><span class="ip-badge" data-writing-status>${statuses[saved?.status]||'미작성'}</span></div>
    ${saved?.submitted_at?`<div class="ip-writing-submission"><strong>${saved.submission_round||1}차 제출 · ${submissionLabels[saved.submission_status]}</strong><p class="ip-help">제출일 ${esc(submittedDate(saved.submitted_at))}${saved.body!==saved.submitted_body?' · 제출 후 수정한 내용이 있습니다. 다시 제출하면 교사에게 전달됩니다.':''}</p>${!admin?`<details><summary>제출한 답변 보기</summary><p class="ip-writing-text">${esc(saved.submitted_body)}</p></details>`:''}</div>`:'<p class="ip-help">아직 교사에게 제출하지 않은 답변입니다.</p>'}
    ${saved?.feedback?`<div class="ip-feedback"><strong>${writingFeedbackTitle(saved)}</strong><p>${esc(saved.feedback)}</p>${saved.feedback_at?`<small>피드백 수정일 ${esc(submittedDate(saved.feedback_at))}</small>`:''}</div>`:''}
    ${saved?.submitted_at?'<div data-writing-history></div>':''}
    ${admin?`<p class="ip-help">${saved?.submitted_at?'교사에게 제출된 답변':'저장된 답변 · 미제출'}</p><p class="ip-writing-text">${esc(saved?.submitted_body??saved?.body??'작성 내용 없음')}</p>
    <label>${saved?.submission_round||1}차 피드백<textarea data-writing-feedback maxlength="8000" ${canWrite?'':'disabled'}>${esc(saved?.feedback_revision===saved?.submitted_revision?saved?.feedback||'':'')}</textarea></label>
    <label>처리<select data-writing-review ${canWrite?'':'disabled'}><option value="needs_revision">보완 필요</option><option value="approved" ${saved?.submission_status==='approved'?'selected':''}>확인 완료</option></select></label>
    <button type="button" class="ip-btn ip-primary" data-writing-save="feedback" ${canWrite&&saved?.submitted_at?'':'disabled'}>피드백 저장</button><p class="ip-help">피드백을 수정해도 회차는 늘어나지 않습니다.</p>`:
    `<label>나의 답변<textarea data-writing-text maxlength="10000" placeholder="나의 DB에 정리한 경험을 바탕으로 답변을 작성해주세요." ${current.retired?'readonly':''}>${esc(saved?.body||'')}</textarea></label>
    <div class="ip-row ip-help"><span data-writing-count>${(saved?.body||'').length.toLocaleString()} / 10,000자</span><span data-writing-saved>${saved?'서버에 저장됨':'아직 저장된 내용 없음'}</span></div>
    ${current.retired?'<p class="ip-help">현재 비공개인 질문의 기존 답변입니다. 읽기만 가능합니다.</p>':`<div class="ip-toolbar ip-writing-actions"><button type="button" class="ip-btn" data-writing-save="draft">임시저장</button><button type="button" class="ip-btn" data-writing-save="saved">저장</button><button type="button" class="ip-btn ip-primary" data-writing-save="submitted">${saved?.submitted_at?'교사에게 다시 제출':'교사에게 제출'}</button></div>`}`}</section>`:
    `<section class="ip-panel ip-empty">${admin?'이 학생이 저장한 답변이 없습니다.':'관리자가 공개한 핵심인성 질문이 아직 없습니다. 질문이 공개되면 이곳에서 답변을 작성할 수 있습니다.'}</section>`}`;
  const historyHost=host.querySelector('[data-writing-history]');
  if(historyHost)history=mountWritingHistory(historyHost,{request,admin,studentId,kind:admin?current.kind:kind,itemId:current.id});
 }
 async function load(){
  host.innerHTML='<p role="status">작성 내용을 불러오는 중…</p>';
  try{
   rows=(await request(admin?'admin_writing_list':'writing_list',admin?{targetStudentId:studentId}:{})).writings;
   if(destroyed)return;
   if(admin)items=rows.map(r=>({key:r.kind+':'+r.item_id,id:r.item_id,kind:r.kind,prompt:r.prompt_snapshot,label:titles[r.kind]+' · '+r.prompt_snapshot}));
   else if(kind==='core'){
    const questions=[];
    for(let page=0;page<100;page++){
     const batch=(await request('core_questions',{page})).questions;if(destroyed)return;
     questions.push(...batch);if(batch.length<30)break;
    }
    items=questions.map(q=>({key:q.id,id:q.id,prompt:q.prompt,label:(q.kind==='main'?'핵심 ':'추가 ')+q.position+'. '+q.prompt}));
    for(const r of rows.filter(r=>r.kind==='core'&&!items.some(i=>i.id===r.item_id)))items.push({key:r.item_id,id:r.item_id,prompt:r.prompt_snapshot,label:r.prompt_snapshot,retired:true});
   }else items=[{key:kind,id:'',prompt:titles[kind]+' 작성하기',label:titles[kind]}];
   selected=(admin?items.find(i=>i.kind===kind&&i.id===initialItemId):null)?.key||items[0]?.key||'';render();
  }catch(e){if(!destroyed)host.innerHTML=`<p role="alert">${esc(error(e))}</p><button class="ip-btn" type="button" data-writing-retry>다시 시도</button>`;}
  finally{busy=false;}
 }
 host.oninput=e=>{
  e.stopPropagation();if(busy)return;
  if(e.target.matches('[data-writing-text],[data-writing-feedback]')){
   dirty=true;
   const count=host.querySelector('[data-writing-count]');if(count)count.textContent=e.target.value.length.toLocaleString()+' / 10,000자';
   const saved=host.querySelector('[data-writing-saved]');if(saved)saved.textContent='저장하지 않은 변경 내용';
  }
 };
 host.onchange=e=>{
  e.stopPropagation();
  if(e.target.matches('[data-writing-review]'))dirty=true;
  if(e.target.matches('[data-writing-select]')){
   if(!canLeave()){e.target.value=selected;return;}
   selected=e.target.value;dirty=false;blocked=false;render();
  }
 };
 async function save(status){
  if(busy||destroyed)return false;
  if(blocked){tell('입력을 복사해 보관한 뒤 새로고침해주세요.',true);return false;}
  const saved=row(),current=item();
  if(!current||current.retired)return !dirty;
  const payload={kind:admin?current.kind:kind,itemId:current.id,revision:saved?.revision||0,
   ...(admin?{targetStudentId:studentId,status:host.querySelector('[data-writing-review]').value,feedback:host.querySelector('[data-writing-feedback]').value}:
    {status,text:host.querySelector('[data-writing-text]').value})};
  if(!admin&&payload.status!=='draft'&&!payload.text.trim()){tell(payload.status==='submitted'?'답변을 입력한 뒤 제출해주세요.':'답변을 입력한 뒤 저장해주세요.',true);return false;}
  busy=true;const controls=[...host.querySelectorAll('button,select,textarea')].map(n=>[n,n.disabled]);controls.forEach(([n])=>n.disabled=true);
  try{
   const result=await request(admin?'admin_writing_feedback':'writing_save',payload);if(destroyed)return;
   rows=rows.filter(r=>r.kind!==result.writing.kind||r.item_id!==result.writing.item_id).concat(result.writing);
   dirty=false;render();tell(admin?'피드백을 저장했습니다.':payload.status==='submitted'?'교사에게 제출했습니다. 피드백을 기다려주세요.':payload.status==='draft'?'임시저장했습니다.':'저장했습니다.');
   if(admin)onFeedbackSaved(result.writing);
   return true;
  }catch(e){if(!destroyed){if(['revision_conflict','unauthorized','not_enrolled','question_unavailable'].includes(e.code||e.message))blocked=true;tell(error(e),true);controls.forEach(([n,d])=>n.disabled=d);}return false;}
  finally{busy=false;}
 }
 host.onclick=async e=>{
  e.stopPropagation();
  if(e.target.closest('[data-writing-retry]')){if(!busy){busy=true;await load();}return;}
  const target=e.target.closest('[data-writing-save]');if(!target||target.disabled||busy)return;
  await save(target.dataset.writingSave);
 };
 const ready=load();
 return {ready,canLeave,selectQuestion(id){
   if(destroyed||busy||dirty)return false;
   const next=items.find(i=>i.id===id&&!i.retired);if(!next)return false;
   selected=next.key;render();return true;
  },async savePending(){
   if(busy||blocked||destroyed)throw Error('save_failed');
   if(dirty&&!(await save('draft')))throw Error('save_failed');
  },adopt(itemId,text){
   if(admin||busy||blocked||destroyed)return false;
   const next=items.find(i=>i.id===itemId&&!i.retired);if(!next)return false;
   if(!canLeave())return false;
   const previous=rows.find(r=>r.kind===kind&&r.item_id===itemId);
   if(previous?.body&&!confirm('현재 저장된 답변 대신 이 초안을 편집창에 넣을까요? 저장 버튼을 누르기 전까지 DB의 답변과 피드백은 유지됩니다.'))return false;
   selected=next.key;render();
   const field=host.querySelector('[data-writing-text]');field.value=text;
   field.dispatchEvent(new Event('input',{bubbles:true}));
   tell('초안을 내 답변에 넣었습니다. 확인 후 저장하거나 교사에게 제출해주세요.');
   field.focus();return true;
  },destroy(){destroyed=true;history?.destroy();window.removeEventListener('beforeunload',beforeUnload);host.oninput=null;host.onchange=null;host.onclick=null;}};
}
