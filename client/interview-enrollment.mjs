import {interviewProductLabel} from './interview-products.js?v=20261125-product-labels';
import {createRosterWorkbook} from './roster-workbook.mjs?v=20261112-roster-phone';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const scopeLabels={active:'정상',interview:'면접 기능 종료',app:'면접 앱 전체 종료'};
const date=value=>value?new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'—';
const state=member=>member.scope!=='active'?'ended':!member.enabled?'suspended':member.expires_on&&member.expires_on<new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date())?'expired':'active';
const stateLabel=member=>({suspended:'이용 중지',expired:'기간 만료',active:'정상',ended:scopeLabels[member.scope]})[state(member)];
const failure=error=>({revision_conflict:'다른 관리자가 상태를 변경했습니다. 목록을 새로 확인해주세요.',invalid_request:'입력 내용을 확인해주세요.',reason_in_use:'같은 이름의 사유가 있습니다.',not_found:'대상을 찾을 수 없습니다.',forbidden:'관리 권한이 없습니다.'})[error.code||error.message]||'처리하지 못했습니다. 연결을 확인한 후 다시 시도해주세요.';
const token=member=>({id:member.id,revision:member.access_revision,memberUpdatedAt:member.updated_at});
export function mountEnrollment(host,{request,canWrite=false,onSummary=()=>{}}){
 let destroyed=false,busy=false,page=0,filter={},members=[],reasons=[],total=0,version=0,dirty=false,dialogItems=[],selected=new Map();
 host.classList.add('ip-enrollment');
 host.innerHTML='<p data-enrollment-message role="status"></p><div data-enrollment-list></div><section class="ip-panel" data-enrollment-editor hidden></section>';
 const message=(text,error=false)=>{const box=host.querySelector('[data-enrollment-message]');if(box){box.textContent=text;box.setAttribute('role',error?'alert':'status');}};
 const button=(label,action,extra='')=>`<button type="button" class="ip-btn" data-enrollment="${action}" ${extra}>${label}</button>`;
 const canLeave=()=>!busy&&(!dirty||confirm('저장하지 않은 이용 관리 입력이 있습니다. 이동할까요?'));
 const editor=html=>{const box=host.querySelector('[data-enrollment-editor]');box.hidden=false;box.innerHTML=html;dirty=false;box.scrollIntoView({block:'nearest'});};
 const targets=items=>`<ul>${items.map(m=>`<li>${esc(m.name)} · ${esc(m.track)} · ${esc(m.exam_number)} · ${esc(interviewProductLabel(m.access_product))}</li>`).join('')}</ul>`;
 function selection(){const box=host.querySelector('[data-enrollment-selection]');if(box)box.textContent=`선택 ${selected.size}명 (다른 페이지 선택 포함, 최대 100명)`;}
 async function load(){
  const ticket=++version;
  const result=await request('admin_enrollment_list',{...filter,page});
  if(destroyed||ticket!==version)return;
  members=result.members;reasons=result.reasons;total=result.total;onSummary(result.summary);
  const box=host.querySelector('[data-enrollment-list]');
  box.innerHTML=`<p class="ip-help">종료해도 학습 기록은 보존됩니다. 다른 수강생 화면의 이용 권한에는 영향을 주지 않습니다.</p>
   <form data-enrollment-filter class="ip-toolbar"><label>이름·수험번호·학생 ID<input name="search" maxlength="200" value="${esc(filter.search||'')}"></label><label>이용 상태<select name="enrollmentStatus">${[['','전체'],['active','정상'],['ended','종료'],['expired','기간 만료'],['suspended','이용 중지']].map(([id,label])=>`<option value="${id}" ${filter.enrollmentStatus===id?'selected':''}>${label}</option>`).join('')}</select></label><label>종료 사유<select name="reasonId"><option value="">전체 사유</option>${reasons.map(r=>`<option value="${esc(r.id)}" ${filter.reasonId===r.id?'selected':''}>${esc(r.name)}${r.active?'':' (사용 중지)'}</option>`).join('')}</select></label><label>종료 범위<select name="terminationScope"><option value="">전체</option>${['interview','app'].map(id=>`<option value="${id}" ${filter.terminationScope===id?'selected':''}>${scopeLabels[id]}</option>`).join('')}</select></label><button class="ip-btn ip-primary">검색</button></form>
   <div class="ip-toolbar">${button('현재 페이지 선택','select-page',canWrite?'':'disabled')}${button('선택 해제','clear')}${button('선택 학생 이용 종료','end-selected',canWrite?'':'disabled')}${button('종료 사유 관리','reasons',canWrite?'':'disabled')}${button('종료 명단 엑셀 다운로드','export')}</div><p data-enrollment-selection></p><p>검색 결과 ${total}명</p>
   <section class="ip-panel">${members.map(m=>`<article class="ip-question" data-enrollment-member="${esc(m.id)}"><div class="ip-row"><label><input type="checkbox" data-enrollment-select="${esc(m.id)}" ${selected.has(m.id)?'checked':''} ${canWrite&&m.scope==='active'?'':'disabled'}> <strong>${esc(m.name)} · ${esc(m.track)}</strong></label><span class="ip-badge">${esc(stateLabel(m))}</span></div><p>수험번호 ${esc(m.exam_number)} · ${esc(interviewProductLabel(m.access_product))}<br>수강 만료일 ${esc(m.expires_on||'제한 없음')}</p>${m.scope!=='active'?`<p>종료 사유: ${esc(m.reason_name)}<br>종료 처리: ${esc(date(m.ended_at))} · ${esc(m.ended_by)}${m.note?`<br>관리자 비고: ${esc(m.note)}`:''}</p>`:''}<div class="ip-toolbar">${button(m.scope==='active'?'이용 종료':'종료 되돌리기',m.scope==='active'?'end':'restore',`data-id="${esc(m.id)}" ${canWrite?'':'disabled'}`)}${button('처리 이력','history',`data-id="${esc(m.id)}"`)}</div></article>`).join('')||'<p class="ip-empty">검색 결과가 없습니다.</p>'}</section><div class="ip-toolbar">${button('이전','prev',page?'':'disabled')}<span>${page+1} 페이지</span>${button('다음','next',(page+1)*30<total?'':'disabled')}</div>`;
  selection();
 }
 function openEnd(items){
  if(!items.length){message('종료할 학생을 선택해주세요.',true);return;}
  dialogItems=structuredClone(items);
  const allowInterview=items.every(m=>m.access_product!=='aptitude_only');
  editor(`<h3>이용 종료 · ${items.length}명</h3>${targets(items)}<form data-enrollment-end><label>종료 사유<select name="reasonId" required><option value="">사유 선택</option>${reasons.filter(r=>r.active).map(r=>`<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('')}</select></label><p>${button('새 사유 추가·관리','reasons')}</p><label>종료 범위<select name="scope">${allowInterview?'<option value="interview">면접 기능 종료</option>':''}<option value="app">면접 앱 전체 이용 종료</option></select></label>${allowInterview?'':'<p>인적성 단과 학생이 포함되어 면접 앱 전체 종료만 가능합니다.</p>'}<p data-enrollment-impact></p><label>관리자 비고 (기타 사유는 필수)<textarea name="note" maxlength="2000"></textarea></label><p class="ip-help">사유와 비고는 관리자에게만 표시됩니다. 환불은 별도 정산하며, 종료는 즉시 적용됩니다.</p><button class="ip-btn ip-primary" ${canWrite?'':'disabled'}>종료 내용 확인</button>${button('닫기','close')}</form>`);
  impact();
 }
 function impact(){const form=host.querySelector('[data-enrollment-end]');if(!form)return;form.querySelector('[data-enrollment-impact]').textContent=form.elements.scope.value==='app'?'면접 준비와 적성 모의고사·성적 이용이 모두 차단됩니다. 기존 학습 기록은 보존됩니다.':'DB 정리·작성하기·AI 기능·모의면접·녹음·면접 자료 열람이 차단됩니다. 적성 모의고사는 기존 수강 권한과 이용 기간에 따라 유지됩니다.';const reason=reasons.find(r=>r.id===form.elements.reasonId.value);form.elements.note.required=reason?.requires_note===true;}
 async function reasonEditor(){
  editor(`<h3>종료 사유 관리</h3><p>사용한 사유는 삭제하지 않습니다. 이름을 바꿔도 과거 기록의 사유명은 유지됩니다.</p>${reasons.map(r=>`<form data-enrollment-reason data-id="${esc(r.id)}" data-revision="${r.revision}"><label>사유명<input name="name" maxlength="80" required value="${esc(r.name)}"></label><label><input name="active" type="checkbox" ${r.active?'checked':''}> 사용 중</label><label><input name="requiresNote" type="checkbox" ${r.requires_note?'checked':''}> 비고 필수</label><button class="ip-btn">사유 저장</button></form>`).join('')}<form data-enrollment-reason data-revision="0"><h4>새 사유 추가</h4><label>사유명<input name="name" maxlength="80" required></label><input name="active" type="hidden" value="true"><label><input name="requiresNote" type="checkbox"> 비고 필수</label><button class="ip-btn ip-primary">사유 추가</button></form>${button('닫기','close')}`);
 }
 async function click(event){
  const target=event.target.closest('[data-enrollment]');if(!target||target.disabled||busy)return;
  event.stopPropagation();const action=target.dataset.enrollment;
  if(!['select-page','clear'].includes(action)&&!canLeave())return;
  busy=true;target.disabled=true;
  try{
   if(action==='close'){host.querySelector('[data-enrollment-editor]').hidden=true;dirty=false;}
   else if(action==='prev'||action==='next'){page+=action==='next'?1:-1;await load();}
   else if(action==='clear'){selected.clear();await load();}
   else if(action==='select-page'){if(!canWrite)return;for(const m of members)if(m.scope==='active'&&selected.size<100)selected.set(m.id,m);await load();}
   else if(action==='end'||action==='end-selected'){if(!canWrite)return;openEnd(action==='end'?members.filter(m=>m.id===target.dataset.id):[...selected.values()]);}
   else if(action==='reasons'){if(canWrite)await reasonEditor();}
   else if(action==='restore'){
    if(!canWrite)return;dialogItems=members.filter(m=>m.id===target.dataset.id);
    editor(`<h3>종료 되돌리기</h3>${targets(dialogItems)}<p>종료 사유: ${esc(dialogItems[0].reason_name)} · ${esc(date(dialogItems[0].ended_at))}</p><p>현재 수강 과정·수강 만료일·기존 이용 중지와 모의면접 설정에 따라 복구합니다. 수강 기간은 자동 연장되지 않습니다.</p><form data-enrollment-restore><label>복구 비고<textarea name="note" maxlength="2000"></textarea></label><button class="ip-btn ip-primary">복구 확인</button>${button('닫기','close')}</form>`);
   }else if(action==='history'){
    const result=await request('admin_enrollment_history',{targetStudentId:target.dataset.id});if(destroyed)return;
    editor(`<h3>이용 종료·복구 이력</h3>${result.history.map(h=>`<article class="ip-question"><strong>${h.action==='end'?'이용 종료':'종료 되돌리기'} · ${esc(date(h.created_at))}</strong><p>${esc(h.actor_id)} · ${esc(scopeLabels[h.scope])}<br>${esc(h.reason_name||'')}${h.note?`<br>${esc(h.note)}`:''}</p></article>`).join('')||'<p>처리 이력이 없습니다.</p>'}${button('닫기','close')}`);
   }else if(action==='export'){
    const rows=[];for(let i=0;;i++){const r=await request('admin_enrollment_list',{...filter,enrollmentStatus:'ended',page:i});if(destroyed)return;rows.push(...r.members);if(r.members.length<30)break;}
    const workbook=createRosterWorkbook('면접반 종료 명단',[['이름','직렬','수험번호','과정','종료 범위','종료 사유','종료 처리일','처리 관리자','관리자 비고'],...rows.map(m=>[m.name,m.track,m.exam_number,interviewProductLabel(m.access_product),scopeLabels[m.scope],m.reason_name,date(m.ended_at),m.ended_by,m.note])]);
    const url=URL.createObjectURL(workbook),link=document.createElement('a');link.href=url;link.download='면접반_종료명단.xlsx';link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);message(`${rows.length}명의 종료 명단을 다운로드했습니다.`);
   }
  }catch(error){message(failure(error),true);}finally{busy=false;if(target.isConnected)target.disabled=false;}
 }
 async function submit(event){
  event.preventDefault();event.stopPropagation();if(busy)return;
  const form=event.target,f=new FormData(form);
  if(form.matches('[data-enrollment-filter]')){if(!canLeave())return;filter=Object.fromEntries(f);page=0;selected.clear();dirty=false;host.querySelector('[data-enrollment-editor]').hidden=true;busy=true;try{await load();}catch(error){message(failure(error),true);}finally{busy=false;}return;}
  if(!canWrite)return;
  busy=true;const submit=form.querySelector('button[type=submit],button:not([type])');if(submit)submit.disabled=true;
  try{
   if(form.matches('[data-enrollment-reason]')){
    await request('admin_enrollment_reason_save',{id:form.dataset.id||'',revision:Number(form.dataset.revision),name:String(f.get('name')).trim(),active:f.has('active'),requiresNote:f.has('requiresNote')});dirty=false;await load();await reasonEditor();message('종료 사유를 저장했습니다.');return;
   }
   const restore=form.matches('[data-enrollment-restore]');
   if(!restore&&!form.matches('[data-enrollment-end]'))return;
   if(!confirm(restore?`${dialogItems.length}명의 종료를 되돌릴까요? 수강 기간과 기존 제한은 유지됩니다.`:`${dialogItems.length}명의 ${scopeLabels[f.get('scope')]}를 즉시 적용할까요?`))return;
   const result=await request('admin_enrollment_change',{operation:restore?'restore':'end',items:dialogItems.map(token),scope:restore?'active':f.get('scope'),reasonId:restore?'':f.get('reasonId'),note:String(f.get('note')||'').trim()});
   if(destroyed)return;dirty=false;selected.clear();host.querySelector('[data-enrollment-editor]').hidden=true;await load();
   const failed=result.results.filter(r=>!r.ok);message(`처리 완료 ${result.results.length-failed.length}명 · 제외/실패 ${failed.length}명${failed.length?' — '+failed.map(r=>`${r.name||r.id}: ${failure({message:r.error})}`).join(' / '):''}`,failed.length>0);
  }catch(error){message(failure(error),true);}finally{busy=false;if(submit?.isConnected)submit.disabled=false;}
 }
 function change(event){event.stopPropagation();const target=event.target;if(target.dataset.enrollmentSelect){if(target.checked&&selected.size>=100){target.checked=false;message('한 번에 100명까지 선택할 수 있습니다.',true);return;}const m=members.find(m=>m.id===target.dataset.enrollmentSelect);if(target.checked)selected.set(m.id,m);else selected.delete(m.id);selection();}else if(target.closest('[data-enrollment-editor]')){dirty=true;impact();}}
 const input=event=>{event.stopPropagation();if(event.target.closest('[data-enrollment-editor]'))dirty=true;};
 const beforeUnload=event=>{if(dirty){event.preventDefault();event.returnValue='';}};
 window.addEventListener('beforeunload',beforeUnload);
 host.addEventListener('click',click);host.addEventListener('submit',submit);host.addEventListener('change',change);host.addEventListener('input',input);
 const ready=load().catch(error=>message(failure(error),true));
 return {ready,canLeave,destroy(){destroyed=true;++version;window.removeEventListener('beforeunload',beforeUnload);host.removeEventListener('click',click);host.removeEventListener('submit',submit);host.removeEventListener('change',change);host.removeEventListener('input',input);}};
}
