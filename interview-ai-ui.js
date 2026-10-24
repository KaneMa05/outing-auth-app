import {createInterviewAI} from './client/interview-ai-client.js?v=20261020-single';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const kinds={self_intro:'자기소개',motivation:'지원동기',public_service:'공직관',core30:'핵심 30제'};
const labels={QUEUED:'대기 중',PROCESSING:'생성 중',COMPLETED:'완료',NEEDS_INPUT:'자료 보완 필요',FAILED:'오류',BLOCKED:'처리 확인 필요',CANCELED:'중단됨'};
const messages={
 request_rate_limited:'짧은 시간에 생성 요청이 많습니다. 1분 후 다시 요청해주세요. 작성 내용은 유지됩니다.',
 queue_full:'전체 생성 대기열이 가득 찼습니다. 기존 작업이 처리된 후 다시 요청해주세요. 작성 내용은 유지됩니다.',
 admission_busy:'다른 요청을 접수 중입니다. 잠시 후 다시 눌러주세요. 작성 내용은 유지됩니다.',
 automation_disabled:'초안 생성 기능을 준비 중입니다. 나의 DB 작성과 저장은 계속 사용할 수 있습니다.',
 invalid_core30:'관리자가 확정한 핵심 30문항 목록이 아직 설정되지 않았거나 공개 범위가 변경되었습니다. 관리자에게 30문항 설정을 요청해주세요. 임의의 문항으로 생성하지 않습니다.',
 source_changed:'저장된 자료가 다른 화면에서 변경되었습니다. 최신 내용을 확인한 뒤 다시 요청해주세요.',
 save_failed:'작성 내용을 저장하지 못해 생성을 요청하지 않았습니다. 입력 화면의 저장 안내를 확인해주세요.',
 request_limit:'오늘 요청 한도에 도달했습니다. 다음 날 다시 요청해주세요.',
 daily_limit:'오늘 생성 한도에 도달했습니다. 다음 날 다시 요청해주세요.',
 unsafe_retry:'아직 재요청할 수 없는 문항이 있습니다. 자료 보완 여부와 처리 상태를 새로 확인해주세요.',
 unauthorized:'로그인이 만료되었습니다. 다시 로그인해주세요.',forbidden:'이 요청을 볼 권한이 없습니다.',
 not_enrolled:'면접반 이용 등록과 기간을 확인해주세요.',not_found:'본인 계정에서 확인할 수 없는 요청입니다.',
 bundle_unconfigured:'초안 작성 지침 설정을 준비 중입니다.',dispatch_unknown:'실제 실행 여부를 관리자가 확인 중입니다. 중복 생성을 요청하지 않습니다.',
 automation_unavailable:'생성 서버에 연결할 수 없습니다. 잠시 후 상태를 다시 확인해주세요.',
 connection_error:'상태 조회 연결이 끊겼습니다. 다시 연결되면 조회를 이어갑니다.',
};
export function mountInterviewAI(host,{request,kind='self_intro',savePending,onAdopt=async()=>false,onQuestionChange=async()=>true,onBusy=()=>{},interval}){
 let destroyed=false,busy=false,enabled=null,dbReady=false,experienceCount=0,missing=[],pendingDB=false,availabilityVersion=0,history=[],current=null,selected=new Set(),activeKind='',notice='생성 기능 상태를 확인하고 있습니다.',failed=false;
 const abort=new AbortController();
 let questions=[],questionId='',allHistory=[];
 const transport=request||(async(url,body)=>{
  const response=await fetch(url,{method:'POST',credentials:'same-origin',cache:'no-store',signal:abort.signal,
   headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data=await response.json();
  if(!response.ok||!data.ok)throw Object.assign(Error(data.error||'automation_unavailable'),{code:data.error||'automation_unavailable'});
  return data;
 });
 const ai=createInterviewAI({request:transport,interval,onUpdate:update});
 const retryable=i=>['FAILED','NEEDS_INPUT'].includes(i.status)||(i.status==='CANCELED'&&i.reason==='operator_resolved');
 const running=()=>current?.items?.some(i=>['QUEUED','PROCESSING','BLOCKED'].includes(i.status));
 function availability(data){
  enabled=data.enabled===true;dbReady=data.dbReady===true;experienceCount=data.experienceCount||0;
  missing=Array.isArray(data.missing)?data.missing:[];
  if(kind==='core30'){
   questions=Array.isArray(data.questions)?data.questions:[];
   if(!questions.some(q=>q.key===questionId))questionId=questions[0]?.key||'';
  }
  pendingDB=false;
 }
 function update(data){
  if(destroyed)return;
  if(data.ok===false){notice=messages[data.error]||messages.connection_error;failed=true;render();return;}
  if(Object.hasOwn(data,'enabled')){
   availability(data);
   notice=!enabled?messages.automation_disabled:!dbReady?'자료 보완 필요: 기본 이력과 인성 경험·가치관의 모든 항목을 입력하고 저장해주세요.':activeKind==='self_intro'&&!data.ready?
    `자료 보완 필요: 상황·본인이 한 행동·실제 결과가 모두 있는 서로 다른 경험이 3개 이상 필요합니다. 현재 ${data.experienceCount||0}개입니다. ‘나의 DB 정리하기 → 경험·인생그래프’에서 ${Math.max(0,3-(data.experienceCount||0))}개 이상 보완해주세요. 같은 경험을 복사한 항목은 중복으로 계산합니다.`:
    !data.ready?'자료 보완 필요: 나의 DB에 실제 경험이나 생각을 입력해주세요. 지원동기는 지원 계기·이유·준비 노력, 공직관은 중요하게 여기는 가치·이유·실천 사례를 구체적으로 적어주세요.':'저장된 자료를 확인했습니다.';
   failed=!enabled||!data.ready;
  }
  if(data.requestId&&data.items){
   if(current?.requestId!==data.requestId)selected.clear();
   current=data;
   selected=new Set([...selected].filter(key=>data.items.some(i=>i.key===key&&retryable(i))));
   if(!history.some(h=>h.id===data.requestId))history.unshift({id:data.requestId,kind:data.kind,questionId,createdAt:new Date().toISOString()});
   notice=data.items.some(i=>i.status==='PROCESSING')?'초안을 만들고 있습니다. 완료되면 이 화면에 표시됩니다.':
    data.items.some(i=>i.status==='QUEUED')?'순서대로 초안을 준비하고 있습니다. 완료되면 이 화면에 표시됩니다.':
    data.items.some(i=>i.status==='BLOCKED')?'초안 생성 상태를 확인하고 있습니다. 잠시 후 다시 확인해주세요.':
    data.items.some(i=>i.status==='NEEDS_INPUT')?'자료 보완이 필요한 문항의 안내를 확인해주세요.':
    data.items.every(i=>i.status==='COMPLETED')?'초안이 완성되었습니다. 내 답변에 넣어 수정할 수 있습니다.':'문항별 처리 결과를 확인해주세요.';
   failed=false;
  }
  render();
 }
 function render(){
  if(destroyed)return;
  const items=current?.items||[];
  host.innerHTML=`<section class="ip-panel ip-ai-panel" aria-label="AI 초안" aria-busy="${busy}">
   <div class="ip-row"><h3>${kinds[kind]} 초안</h3><span class="ip-badge">${enabled===true?'AI 초안':enabled===false?'기능 준비 중':'연결 확인 중'}</span></div>
   ${kind==='core30'?`<label class="ip-writing-picker">질문 선택<select data-ai-question ${busy||!questions.length?'disabled':''}>${questions.length?questions.map(q=>`<option value="${esc(q.key)}" ${q.key===questionId?'selected':''}>${q.position}. ${esc(q.question)}</option>`).join(''):'<option>설정된 질문이 없습니다.</option>'}</select></label>`:''}
   <div class="ip-ai-buttons"><button type="button" class="ip-btn" data-ai-generate="${kind}" ${busy||enabled!==true||!dbReady||kind==='core30'&&!questionId||kind==='self_intro'&&experienceCount<3||running()?'disabled':''}>${kind==='core30'?'이 질문 초안 만들기':kinds[kind]+' 초안 만들기'}</button></div>
   ${missing.length?`<details class="ip-ai-missing"><summary>보완할 입력 항목 ${missing.length}개</summary><ul>${missing.map(text=>`<li>${esc(text)}</li>`).join('')}</ul></details>`:''}
   ${kind==='self_intro'&&dbReady&&experienceCount<3?`<p class="ip-help">자기소개는 상황·행동·결과가 있는 서로 다른 경험 3개가 필요합니다. 현재 ${experienceCount}개입니다. 경험·인생그래프를 보완해주세요.</p>`:''}
   <p class="ip-message" data-ai-message role="status" ${failed?'data-error="true"':''}>${esc(notice)}</p>
   ${current?`<details class="ip-ai-results" open><summary>${esc(kinds[current.kind])} 초안 · ${items.filter(i=>i.status==='COMPLETED').length}/${items.length} 완료</summary>
    ${current.stale?'<p class="ip-help">DB 자료가 변경되었습니다. 아래 초안은 이전 자료를 포함할 수 있습니다.</p>':''}
    <div class="ip-ai-items">${items.map((i,index)=>`<article class="ip-ai-item"><div class="ip-row"><h4>${i.position}. ${esc(i.question)}</h4><span class="ip-badge">${esc(labels[i.status]||'상태 확인 필요')}</span></div>
     ${retryable(i)?`<label class="ip-ai-retry-check"><input type="checkbox" data-ai-item="${esc(i.key)}" ${selected.has(i.key)?'checked':''} ${busy?'disabled':''}> 이 문항 재요청 선택</label>`:''}
     ${i.status==='NEEDS_INPUT'?`<ul>${(i.result?.missing||[]).map(text=>`<li>${esc(text)}</li>`).join('')}</ul><p class="ip-help">나의 DB에서 보완한 내용을 저장한 뒤 이 문항만 선택해 재요청하세요.</p>`:''}
     ${i.reason?`<p class="ip-help">${esc(messages[i.reason]||(['FAILED','BLOCKED'].includes(i.status)?'처리를 완료하지 못했습니다. 상태를 확인한 뒤 가능한 문항만 다시 요청해주세요.':'요청 처리가 중단되었습니다.'))}</p>`:''}
     ${i.status==='COMPLETED'&&i.result?.answer?`<p class="ip-ai-answer" data-ai-answer="${index}"></p><div class="ip-toolbar">
      <button type="button" class="ip-btn" data-ai-copy="${index}" ${busy?'disabled':''}>초안 복사</button>
      <button type="button" class="ip-btn" data-ai-regenerate ${busy||enabled!==true||!dbReady||kind==='self_intro'&&experienceCount<3||running()?'disabled':''}>다시 만들기</button>
      <button type="button" class="ip-btn ip-primary" data-ai-adopt="${index}" ${busy?'disabled':''}>내 답변에 넣기</button></div>`:''}
     ${i.stale?'<p class="ip-help">이 문항은 이전 자료로 생성되었습니다.</p>':''}
    </article>`).join('')}</div>
    ${items.some(retryable)?`<button type="button" class="ip-btn" data-ai-retry ${busy||!selected.size||enabled!==true||!dbReady?'disabled':''}>선택한 문항만 재요청 (${selected.size})</button>`:''}
   </details>`:''}</section>`;
  host.querySelectorAll('[data-ai-answer]').forEach(n=>{n.textContent=items[Number(n.dataset.aiAnswer)].result.answer;});
 }
 async function run(task){
  if(busy||destroyed)return;
  busy=true;onBusy(true);render();
  try{await task();}
  catch(e){if(!destroyed){notice=messages[e.code||e.message]||'요청을 처리하지 못했습니다. 작성 내용은 유지됩니다. 상태를 확인한 뒤 다시 시도해주세요.';failed=true;}}
  finally{busy=false;if(!destroyed){onBusy(false);render();}}
 }
 async function refresh(){
  const prep=await ai.prepare(kind);if(destroyed)return;
  availability(prep);
  if(kind==='core30'&&questionId)await onQuestionChange(questionId);
  allHistory=(await ai.requests()).requests;
  history=allHistory.filter(r=>r.kind===kind&&(kind!=='core30'||r.questionId===questionId));
  if(destroyed)return;
  if(current||history.length)await ai.resume(current?.requestId||history[0].id);
  else notice=enabled?(dbReady?'':'기본 이력과 인성 경험·가치관 입력을 완료해주세요.'):messages.automation_disabled;
  if(!enabled)notice=messages.automation_disabled;
  else if(kind==='core30'&&!questions.length)notice=messages.invalid_core30;
 }
 host.onclick=e=>{
  const n=e.target.closest('button');if(!n||n.disabled||busy)return;
  if(n.hasAttribute('data-ai-generate')||n.hasAttribute('data-ai-regenerate'))run(async()=>{
   const regenerate=n.hasAttribute('data-ai-regenerate');
   activeKind=kind;ai.pause();notice='작성 내용 저장 및 생성 가능 여부 확인 중…';failed=false;render();
   await ai.generate(activeKind,{savePending,regenerate,questionId:kind==='core30'?questionId:undefined});
  });
  else if(n.hasAttribute('data-ai-retry'))run(async()=>{
   activeKind=current.kind;ai.pause();await ai.retryItems(current.requestId,current.kind,[...selected],{savePending});
  });
  else if(n.hasAttribute('data-ai-copy'))run(async()=>{
   await navigator.clipboard.writeText(current.items[Number(n.dataset.aiCopy)].result.answer);
   notice='초안을 복사했습니다. 사용할 입력창에 직접 붙여넣어주세요.';failed=false;
  });
  else if(n.hasAttribute('data-ai-adopt'))run(async()=>{
   const chosen=current.items[Number(n.dataset.aiAdopt)];
   const adopted=await onAdopt(current.kind,chosen.key,chosen.result.answer);
   notice=adopted?'초안을 내 답변에 넣었습니다. 확인 후 저장해주세요.':'답변을 변경하지 않았습니다. 질문이 현재 작성 목록에 없다면 초안을 복사해 사용하세요.';failed=false;
  });
 };
 host.onchange=e=>{
  if(e.target.matches('[data-ai-item]')){
   if(e.target.checked)selected.add(e.target.dataset.aiItem);else selected.delete(e.target.dataset.aiItem);
   render();
  }else if(e.target.matches('[data-ai-question]')){const next=e.target.value;run(async()=>{
   ai.pause();await savePending();
   if(!await onQuestionChange(next))throw Error('save_failed');
   questionId=next;current=null;selected.clear();
   allHistory=(await ai.requests()).requests;
   history=allHistory.filter(r=>r.kind===kind&&r.questionId===questionId);
   if(history.length)await ai.resume(history[0].id);else {notice='선택한 질문의 초안을 만들어보세요.';failed=false;}
  });}
 };
 render();const ready=run(refresh);
 return {ready,invalidate(){
   ++availabilityVersion;dbReady=false;pendingDB=true;render();
  },async refreshAvailability(){
   const version=++availabilityVersion;
   try{const prep=await ai.prepare(kind);if(destroyed||version!==availabilityVersion)return;availability(prep);}
   catch{if(destroyed||version!==availabilityVersion)return;dbReady=false;notice='저장했지만 생성 조건을 확인하지 못했습니다. 상태를 다시 확인해주세요.';failed=true;}
   render();
  },destroy(){destroyed=true;++availabilityVersion;abort.abort();ai.destroy();selected.clear();history=[];current=null;host.replaceChildren();host.onclick=null;host.onchange=null;}};
}
