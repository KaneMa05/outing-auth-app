const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const kinds={job_knowledge:'전공 지식형',personality_experience:'인성 경험형',personality_opinion:'의견·가치 판단',profile:'경력·이력 확인',followup:'문맥 의존 꼬리질문',practical:'영어·실무 수행',hold:'추가 문맥 확인'};
const states={draft:'검토 대기',reviewed:'관리자 검토 완료',stale:'질문 변경·재검토'};
const opts=(items,value)=>Object.entries(items).map(([id,label])=>`<option value="${esc(id)}" ${id===value?'selected':''}>${esc(label)}</option>`).join('');
const action=(label,a,extra='')=>`<button type="button" class="ip-btn" data-rubric="${a}" ${extra}>${label}</button>`;
const errorText=e=>({revision_conflict:'다른 관리자가 질문 또는 기준을 변경했습니다. 입력 내용을 보존했습니다. 복사한 뒤 최신 내용을 다시 열어주세요.',rubric_incomplete:'검토 완료에는 검증 근거가 필요합니다. 전공 지식형은 필수 항목·핵심 오류·배점도 모두 입력해주세요.',invalid_request:'입력 항목과 배점을 확인해주세요.',forbidden:'이 작업을 수행할 권한이 없습니다.'}[e.code||e.message]||'불러오거나 저장하지 못했습니다. 입력 내용을 유지했습니다. 다시 시도해주세요.');

export function mountRubrics(host,{request,canWrite=true,initialQuestionId=null}){
 let page=0,filter={},rows=[],selected=null,dirty=false,busy=false,destroyed=false,version=0,examValidation=null;
 host.innerHTML='<p class="ip-message" data-rubric-message role="status"></p><div data-rubric-list></div><section class="ip-panel" data-rubric-editor hidden></section>';
 const message=(text,error=false)=>{const n=host.querySelector('[data-rubric-message]');if(n){n.textContent=text;n.classList.toggle('error',error);}};
 const canLeave=()=>{if(examValidation?.isRunning()){message('음성 검증이 진행 중입니다. 완료 후 이동해주세요.',true);return false;}return !dirty||confirm('저장하지 않은 채점 기준이 있습니다. 이동할까요?');};
 const beforeUnload=e=>{if(dirty||examValidation?.isRunning()){e.preventDefault();e.returnValue='';}};
 window.addEventListener('beforeunload',beforeUnload);
 async function load(){
  const token=++version,r=await request('admin_rubric_list',{...filter,page});if(destroyed||token!==version)return;
  rows=r.questions;
  host.querySelector('[data-rubric-list]').innerHTML=`<section class="ip-panel"><h3>질문 분류와 시험 채점 기준</h3>
   <p>원문 분류를 보존하고 시험에 사용할 유형을 별도로 검토합니다. 검토 완료 ${r.reviewed}건.</p>
   <p class="ip-help">추출된 표현은 후보입니다. 필수 정답으로 자동 등록되지 않습니다. 원문 해설의 정확성과 최신성, 인정·불인정 문맥을 검증해주세요. 이 화면의 저장은 학생 공개나 시험 실행을 시작하지 않습니다.</p>
   <div class="ip-summary">${Object.entries(r.counts).map(([k,n])=>`<span><strong>${n}</strong>${esc(kinds[k]||k)}</span>`).join('')}</div></section>
   <form data-rubric-filter class="ip-toolbar"><label>질문 검색<input name="search" maxlength="200" value="${esc(filter.search)}"></label>
   <label>유형<select name="kind">${opts({'':'전체 유형',...kinds},filter.kind||'')}</select></label>
   <label>검토 대상<select name="originDisposition">${opts({'':'전체 대상',job_source:'기존 직무 질문',knowledge_review:'인성의 직무 재분류 68개',context_needed:'문맥 확인 320개'},filter.originDisposition||'')}</select></label>
   <label>상태<select name="status">${opts({'':'전체 상태',...states},filter.status||'')}</select></label><button class="ip-btn ip-primary">검색</button></form>
   <section class="ip-panel">${rows.map(q=>`<article class="ip-question"><strong>${esc(q.prompt)}</strong><p class="ip-help">원문 ${q.category==='job'?'직무':'인성'} · ${esc(q.tracks.join(' · '))}<br>${esc(kinds[q.kind])} · ${esc(states[q.rubric_status])} · 필수 항목 ${q.criteria_count}개${q.flags?.includes('missing_source_answer')?' · 원문 해설 없음':''}</p>${action('분류·채점 기준 검토','edit',`data-id="${esc(q.id)}"`)}</article>`).join('')||'<p>해당 문항이 없습니다. 초기 검수 자료 적용 여부와 검색 조건을 확인해주세요.</p>'}</section>
   <div class="ip-toolbar">${action('이전','prev',page===0?'disabled':'')}<span>${page+1} 페이지</span>${action('다음','next',rows.length<30?'disabled':'')}</div>`;
 }
 function criterion(c={label:'',terms:[],context:'',reject_context:''}){
  return `<fieldset data-criterion class="ip-panel"><legend>필수 평가 항목</legend><label>항목 이름<input name="criterionLabel" maxlength="200" required value="${esc(c.label)}"></label>
   <label>지정 단어와 허용 표현 <small>한 줄에 하나씩 입력합니다. 이 항목 안에서는 하나 이상 충족해야 합니다.</small><textarea name="terms" required>${esc(c.terms.join('\n'))}</textarea></label>
   <label>인정할 문맥<textarea name="context" required maxlength="2000">${esc(c.context)}</textarea></label>
   <label>불인정할 문맥<textarea name="rejectContext" required maxlength="2000">${esc(c.reject_context)}</textarea></label>${action('이 항목 삭제','remove',canWrite?'':'disabled')}</fieldset>`;
 }
 async function edit(id){
  const token=++version,r=await request('admin_rubric_detail',{id});if(destroyed||token!==version)return;
  examValidation?.destroy();examValidation=null;selected=r;dirty=false;const a=r.rubric,draft=a?.source_draft||{};
  const n=host.querySelector('[data-rubric-editor]');n.hidden=false;
  n.innerHTML=`<h3>${esc(r.question.prompt)}</h3>${r.stale?'<p role="alert">질문이 변경되었습니다. 기존 기준을 다시 검토해야 합니다.</p>':''}
   ${draft.source_prompt&&draft.source_prompt!==r.question.prompt?'<p role="alert">아래 추출 후보와 이웃 문항은 변경 전 원문 기준입니다.</p>':''}
   <details><summary>원문 해설과 출처 ${r.sources.length}건</summary>${r.sources.map(s=>`<article class="ip-question"><p>${esc(s.filename)} · ${esc(s.year)} · ${esc(s.locator)}</p><p>${esc(s.original_prompt)}</p><div class="ip-feedback">${esc(s.answer||'원문 해설 없음')}</div></article>`).join('')||'<p>등록된 출처가 없습니다. 별도 검증 근거를 입력해주세요.</p>'}</details>
   <details><summary>해설에서 추출한 표현 후보 ${(draft.term_candidates||[]).length}개</summary><p class="ip-help">일부 전문 표현만 기계적으로 추출했습니다. 빠지거나 중요하지 않은 단어가 있을 수 있으며 정답 기준이 아닙니다.</p>${(draft.term_candidates||[]).map(t=>`<p><strong>${esc(t.term)}</strong> · ${esc(t.occurrence_id)}</p>`).join('')||'<p>추출 후보가 없습니다. 해설에서 직접 기준을 작성해주세요.</p>'}</details>
   <details><summary>원문 앞뒤 문항 확인</summary><p class="ip-help">같은 출처·연도·지역·구역의 이웃 문항입니다. 같은 면접의 부모 질문이라는 뜻은 아닙니다.</p>${(draft.provenance||[]).map(p=>`<article class="ip-question"><strong>${esc(p.filename)} · ${esc(p.year)} · ${esc(p.locator)}</strong>${p.neighbors.map(n=>`<p>${esc(n.prompt)}<br><small>${esc(n.locator)}</small></p>`).join('')||'<p>인접 문항 없음</p>'}</article>`).join('')}</details>
   <form data-rubric-form><label>시험에서의 질문 유형<select name="kind">${opts(kinds,a?.kind||'hold')}</select></label>
   <label>분류 이유<textarea name="rationale" minlength="10" maxlength="4000" required>${esc(a?.rationale||'')}</textarea></label>
   <p class="ip-help">모든 필수 평가 항목을 충족해야 O입니다. 각 항목에 허용 표현을 나눠 등록하세요. 잘못된 문맥이나 핵심 오류는 별도로 판정합니다.</p>
   <div data-criteria>${(a?.criteria||[]).map(criterion).join('')}</div>${action('필수 평가 항목 추가','add',canWrite?'':'disabled')}
   <label>핵심 오류 조건 <small>한 줄에 하나씩. 이 조건에 해당하면 일부 항목을 맞혀도 X입니다.</small><textarea name="criticalErrors">${esc((a?.critical_errors||[]).join('\n'))}</textarea></label>
   <div class="ip-toolbar">${[['O','O'],['partial','△'],['X','X']].map(([k,label])=>`<label>${label} 배점<input type="number" name="score_${k}" min="0" max="10000" step="any" value="${esc(a?.score_map?.[k]??'')}"></label>`).join('')}</div>
   <p class="ip-help">배점은 아직 확정되지 않았으므로 기본값을 넣지 않았습니다. O &gt; △ &gt; X 순서로 설정합니다. 미정이면 모두 비우고 초안으로 저장하세요.</p>
   <label>검증한 근거와 검토 기록<textarea name="verificationNote" maxlength="4000" placeholder="확인한 자료·버전·기준일과 판단 근거를 적어주세요.">${esc(a?.verification_note||'')}</textarea></label>
   <label>상태<select name="status">${opts({draft:'검토 대기',reviewed:'관리자 검토 완료'},a?.status||'draft')}</select></label>
   <p class="ip-help">전공 지식형 검토 완료는 필수 표현·문맥·핵심 오류·배점·검증 근거가 모두 필요합니다. 질문 공개와 자동 채점 연결은 별도입니다.</p>
   <div class="ip-toolbar"><button class="ip-btn ip-primary" data-rubric-save ${canWrite?'':'disabled'}>분류·기준 저장</button>${action('닫기','close')}</div></form>`;
  if(!canWrite)n.querySelectorAll('input,select,textarea').forEach(e=>e.disabled=true);
  n.insertAdjacentHTML('beforeend','<section class="ip-panel" data-exam-validation></section>');
  const {mountExamValidation}=await import('./interview-exam-validation-ui.js?v=20261021');
  if(destroyed||token!==version)return;
  examValidation=mountExamValidation(n.querySelector('[data-exam-validation]'),{detail:r,canWrite,isDirty:()=>dirty});
  n.scrollIntoView({block:'start',behavior:'smooth'});
 }
 host.onclick=async e=>{
  const b=e.target.closest('[data-rubric]');if(!b||b.disabled||busy)return;e.stopPropagation();
  const a=b.dataset.rubric;
  if(a==='add'){if(!canWrite)return;const container=host.querySelector('[data-criteria]');if(container.children.length>=20){message('필수 평가 항목은 최대 20개입니다.',true);return;}container.insertAdjacentHTML('beforeend',criterion());dirty=true;return;}
  if(a==='remove'){if(canWrite){b.closest('[data-criterion]').remove();dirty=true;}return;}
  if(!canLeave())return;
  busy=true;
  try{
   if(a==='edit')await edit(b.dataset.id);
   else if(a==='close'){dirty=false;host.querySelector('[data-rubric-editor]').hidden=true;}
   else{dirty=false;host.querySelector('[data-rubric-editor]').hidden=true;page=Math.max(0,page+(a==='next'?1:-1));await load();}
  }catch(e){message(errorText(e),true);}finally{busy=false;}
 };
 host.oninput=host.onchange=e=>{if(e.target.closest('[data-rubric-form]'))dirty=true;};
 host.onsubmit=async e=>{
  if(!e.target.matches('[data-rubric-filter],[data-rubric-form]'))return;e.preventDefault();e.stopPropagation();if(busy)return;
  if(examValidation?.isRunning()){message('음성 검증이 진행 중입니다. 완료 후 저장하거나 이동해주세요.',true);return;}
  const f=new FormData(e.target),isFilter=e.target.matches('[data-rubric-filter]');
  if(isFilter&&!canLeave())return;if(!isFilter&&!canWrite)return;
  busy=true;const submit=e.target.querySelector('button[type=submit],button:not([type])');if(submit)submit.disabled=true;
  try{
   if(isFilter){filter=Object.fromEntries([...f.entries()].filter(([,v])=>v!==''));page=0;dirty=false;host.querySelector('[data-rubric-editor]').hidden=true;await load();return;}
   const lines=s=>String(s||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
   const criteria=[...e.target.querySelectorAll('[data-criterion]')].map(n=>({label:n.querySelector('[name=criterionLabel]').value.trim(),terms:lines(n.querySelector('[name=terms]').value),context:n.querySelector('[name=context]').value.trim(),reject_context:n.querySelector('[name=rejectContext]').value.trim()}));
   const scoreFields=['O','partial','X'].map(k=>f.get('score_'+k));
   if(scoreFields.some(s=>s!=='')&&scoreFields.some(s=>s==='')){message('배점은 세 값을 모두 입력하거나 모두 비워주세요.',true);return;}
   const scoreMap=scoreFields.every(s=>s==='')?null:Object.fromEntries(['O','partial','X'].map((k,i)=>[k,Number(scoreFields[i])]));
   await request('admin_rubric_save',{id:selected.question.id,revision:selected.rubric?.revision||0,questionRevision:selected.question.revision,kind:f.get('kind'),rationale:f.get('rationale'),criteria,criticalErrors:lines(f.get('criticalErrors')),verificationNote:f.get('verificationNote'),scoreMap,status:f.get('status')});
   const savedId=selected.question.id;dirty=false;await load();await edit(savedId);message('분류와 채점 기준을 저장했습니다. 학생 공개 상태는 유지됩니다.');
  }catch(e){message(errorText(e),true);}finally{busy=false;if(submit)submit.disabled=!canWrite&&!isFilter;}
 };
 const ready=(async()=>{try{if(initialQuestionId)await edit(initialQuestionId);else await load();}catch(e){message(errorText(e),true);}})();
 return {ready,canLeave,destroy(){destroyed=true;version++;examValidation?.destroy();window.removeEventListener('beforeunload',beforeUnload);host.onclick=host.oninput=host.onchange=host.onsubmit=null;}};
}
