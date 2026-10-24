const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const errorText=e=>({revision_conflict:'다른 화면에서 수정된 내용이 있습니다. 입력을 보관한 뒤 최신 내용을 불러와 다시 비교해주세요.',source_changed:'원래 경험이나 답변이 바뀌었습니다. 최신 내용을 불러와 다시 정리해주세요.',answers_required:'아직 답하지 않은 질문에 답하거나, 기억나지 않아요·건너뛰기를 선택해주세요.',question_limit:'추가 질문은 최대 5묶음까지입니다. 답변을 저장하거나 지금까지의 내용을 정리할 수 있습니다.',daily_limit:'오늘의 질문·정리 이용 한도에 도달했습니다. 답변 저장과 직접 반영은 계속할 수 있습니다.',automation_disabled:'추가 질문을 현재 이용할 수 없습니다. 기존 경험은 계속 수정·저장할 수 있습니다.',not_found:'이 경험을 찾을 수 없습니다. 삭제되었는지 확인해주세요.',unauthorized:'로그인이 만료되었습니다. 다시 로그인해주세요.',admission_busy:'다른 질문을 준비하고 있습니다. 잠시 후 다시 확인해주세요.',invalid_request:'입력 내용과 글자 수를 확인해주세요.',experience_required:'당시 나이·키워드·내용을 먼저 저장해주세요.'}[e.code||e.message]||'연결을 확인하고 다시 시도해주세요. 입력한 답변은 화면에 남아 있습니다.');
const btn=(label,action,extra='')=>`<button class="ip-btn" type="button" data-fu-action="${action}" ${extra}>${label}</button>`;
export function mountLifeFollowup(host,{request,experienceId,initialView='questions',onClose,onAdd,onApplied}){
 let data=null,answers={},dirty=false,busy=false,dead=false,timer=null,comparison=null,compareDirty=false,requestKeys=new Map();
 const message=(text,error=false)=>{const el=host.querySelector('[data-fu-message]');if(el){el.textContent=text;el.dataset.error=String(error);}};
 const hasPending=()=>data?.requests.some(r=>r.state==='processing');
 const canLeave=()=>{if(busy){message('저장·반영이 끝난 뒤 이동해주세요.');return false;}return !(dirty||compareDirty)||confirm('저장하지 않은 답변 또는 정리 수정이 있습니다. 나가시겠어요?');};
 const unload=e=>{if(dirty||compareDirty||busy){e.preventDefault();e.returnValue='';}};
 window.addEventListener('beforeunload',unload);
 function accept(result,{preserve=false}={}){
  if(dead||data&&result.session.id===data.session.id&&(result.session.answer_revision<data.session.answer_revision||result.profileRevision<data.profileRevision))return;
  data=result;if(!preserve){answers=Object.fromEntries(data.questions.map(q=>[q.id,{text:q.answer?.text||'',status:q.answer?.status||'answered'}]));dirty=false;}
 }
 function evidence(refs){return `<details class="ip-fu-evidence"><summary>이 내용의 근거 보기</summary>${refs.map(ref=>{const text=ref==='experience:content'?data.experience.content:ref==='experience:appeal'?data.experience.appeal:data.questions.find(q=>'answer:'+q.id===ref)?.answer?.text;return `<p class="ip-life-text">${esc(text||'근거를 찾을 수 없습니다.')}</p>`;}).join('')}</details>`;}
 function render(){
  if(dead)return;
  if(!data){host.innerHTML=`<div class="ip-panel"><p data-fu-message role="status">추가 질문을 불러오는 중…</p>${btn('돌아가기','back')}</div>`;return;}
  const count=data.questions.filter(q=>q.answer).length,pending=hasPending();
  const last=data.requests[0],out=data.outputs.find(o=>!o.applied_at&&o.engine!=='student_reviewed');
  const noMore=data.questions.length>=15||new Set(data.questions.map(q=>q.batch)).size>=5||last?.error==='no_more_questions'&&last.answer_revision===data.session.answer_revision&&last.source_hash===data.sourceHash;
  const applied=data.outputs.find(o=>o.applied_at&&!o.restored_at);
  host.innerHTML=`<section class="ip-fu"><header class="ip-fu-header"><div><p class="ip-help">인생그래프 · ${esc(data.experience.age)}세</p><h3>${esc(data.experience.title)} 경험 자세히 쓰기</h3></div>${btn('돌아가기','back')}</header>
   <p>기억나는 만큼 적어주세요. 모르는 내용은 건너뛸 수 있습니다.</p><p class="ip-help">답변 ${count}개 저장됨 · ${new Set(data.questions.map(q=>q.batch)).size}/5묶음</p>
   <p data-fu-message role="status" class="ip-message">${pending?'질문·정리 내용을 준비하고 있습니다. 다른 화면으로 이동해도 저장된 답변은 유지됩니다.':last?.state==='failed'?'준비하지 못했습니다. 저장된 답변은 유지됩니다. 다시 시도해주세요.':last?.state==='stale'?'이전 입력으로 준비된 결과입니다. 최신 내용으로 다시 요청해주세요.':dirty?'저장하지 않은 답변이 있습니다.':noMore?'추가 질문을 마쳤습니다. 지금까지 작성한 내용을 정리해보세요.':''}</p>
   <details><summary>원래 경험 보기</summary><p class="ip-life-text">${esc(data.experience.content)}</p></details>
   ${data.requests.some(r=>r.engine==='basic_templates')?'<p class="ip-help">검토된 기본 질문입니다. 작성한 답변에 따라 아직 다루지 않은 항목을 묻습니다.</p>':''}
   ${data.questions.map((q,i)=>`<article class="ip-panel ip-fu-question"><h4>${i+1}. ${esc(q.text)}</h4><p class="ip-help">${q.kind==='hypothetical'?'가정 질문 · 실제 경험과 구분해서 작성':q.kind==='interpretation'?'생각과 의미':'실제 경험'}${q.stale?' · 이전 답변 기준':''}</p><label class="ip-sr-only" for="fu-${q.id}">질문 ${i+1} 답변</label><textarea id="fu-${q.id}" data-fu-answer="${q.id}" maxlength="4000" ${answers[q.id].status==='answered'?'':'disabled'}>${esc(answers[q.id].text)}</textarea><div class="ip-life-toolbar">${[['answered','답변하기'],['unknown','기억나지 않아요'],['skipped','건너뛰기']].map(([status,label])=>btn(label,'answer-state',`data-id="${q.id}" data-status="${status}" aria-pressed="${answers[q.id].status===status}"`)).join('')}</div></article>`).join('')}
   <div class="ip-life-toolbar">${btn('답변 저장','save',data.questions.length?'':'disabled')}${btn(data.questions.length?'저장하고 다음 질문':'추가 질문 시작','next',pending||noMore?'disabled':'')}${btn('지금까지 내용 정리','summarize',pending?'disabled':'')}${btn('직접 정리해 반영','manual')}${btn('최신 내용 불러오기','reload')}</div>
   ${out?`<section class="ip-panel"><h3>정리한 내용</h3><p class="ip-help">${out.engine==='basic_extract'?'작성한 원문을 모은 기본 정리입니다. 직접 읽고 다듬어주세요.':'작성한 답변의 근거를 확인하고 다듬어주세요.'}${out.stale?' · 이전 입력 기준':''}</p><h4>확인한 사실</h4>${(out.result.facts||[]).map(f=>`<p class="ip-life-text">${esc(f.text)}</p>${evidence(f.refs)}`).join('')}<h4>어필할 점 후보</h4>${(out.result.appeals||[]).map(f=>`<p class="ip-life-text">${esc(f.text)}</p>${evidence(f.refs)}`).join('')||'<p>아직 작성한 어필 근거가 없습니다. 직접 정리할 수 있습니다.</p>'}<h4>더 확인할 내용</h4>${(out.result.remaining||[]).map(t=>`<p>${esc(t)}</p>`).join('')||'<p>현재 추가 확인 안내가 없습니다.</p>'}${btn('기존 내용과 비교·수정','compare',out.stale?'disabled':'')}</section>`:''}
   ${comparison?`<section class="ip-panel"><h3>인생그래프에 반영하기</h3><p class="ip-help">선택한 항목만 저장됩니다. 현재 만족도와 나이는 유지됩니다.</p>${[['content','내용',12000],['appeal','면접관에게 어필할 점',2000]].map(([key,label,max])=>`<div class="ip-fu-compare"><div><h4>기존 ${label}</h4><p class="ip-life-text">${esc(data.experience[key]||'미작성')}</p></div><div><label><input type="checkbox" data-fu-select="${key}" ${comparison.selected[key]?'checked':''}> ${label}에 반영</label><textarea data-fu-field="${key}" aria-label="반영할 ${label}">${esc(comparison[key])}</textarea><p class="ip-help" data-fu-count="${key}">${[...comparison[key]].length.toLocaleString()} / ${max.toLocaleString()}자</p></div></div>`).join('')}${btn('선택한 내용 저장','apply')}</section>`:''}
   ${applied?`<div class="ip-panel"><p>검토한 내용을 인생그래프에 저장했습니다.</p>${btn('반영 전 내용으로 되돌리기','restore',`data-id="${applied.id}"`)}</div>`:''}
   <div class="ip-life-toolbar">${btn('다른 경험으로 추가하기','add')}</div></section>`;
  if(busy)host.querySelectorAll('button,input,textarea').forEach(n=>n.disabled=true);
 }
 function schedule(){
  clearTimeout(timer);if(dead||!hasPending()||document.hidden)return;
  timer=setTimeout(async()=>{if(dead)return;try{const result=await request('status',{sessionId:data.session.id});if(dead)return;accept(result,{preserve:true});if(!dirty&&!compareDirty&&!busy)render();}catch{if(!dead)message('상태를 확인하지 못했습니다. 연결되면 다시 확인합니다.',true);}schedule();},Math.max(3000,data.pollAfterMs||3000));
 }
 const visibility=()=>{if(document.hidden)clearTimeout(timer);else schedule();};document.addEventListener('visibilitychange',visibility);
 async function save(){
  if(!dirty)return;
  if(data.questions.some(q=>q.answer&&answers[q.id].status==='answered'&&!answers[q.id].text.trim()))throw Error('answers_required');
  const items=data.questions.filter(q=>answers[q.id].text.trim()||answers[q.id].status!=='answered').map(q=>({questionId:q.id,...answers[q.id]}));
  const result=await request('save_answers',{sessionId:data.session.id,answerRevision:data.session.answer_revision,answers:items});if(dead)return;accept(result);
 }
 async function generate(kind){
  await save();if(dead)return;
  const signature=[data.session.id,kind,data.sourceHash,data.session.answer_revision,data.questions.length].join(':');
  if(!requestKeys.has(signature))requestKeys.set(signature,crypto.randomUUID());
  const payload={sessionId:data.session.id,sourceHash:data.sourceHash,answerRevision:data.session.answer_revision,requestKey:requestKeys.get(signature)};
  // Release the panel while generation runs. Its saved state is restored on re-entry.
  busy=false;render();host.querySelectorAll('[data-fu-action=next],[data-fu-action=summarize]').forEach(n=>n.disabled=true);
  message('내용을 준비하고 있습니다…');
  data.requests.unshift({state:'processing'});schedule();
  try{const result=await request(kind,payload);if(dead)return;accept(result,{preserve:dirty});render();schedule();}catch(e){if(dead)return;data.requests=data.requests.filter(r=>r.id);message(errorText(e),true);schedule();throw e;}
 }
 host.oninput=e=>{e.stopPropagation();if(busy||dead)return;const id=e.target.dataset.fuAnswer;if(id){answers[id].text=e.target.value;dirty=true;message('저장하지 않은 답변이 있습니다.');}const key=e.target.dataset.fuField;if(key){comparison[key]=e.target.value;compareDirty=true;host.querySelector(`[data-fu-count="${key}"]`).textContent=`${[...e.target.value].length.toLocaleString()} / ${(key==='content'?12000:2000).toLocaleString()}자`;}};
 host.onchange=e=>{e.stopPropagation();if(e.target.dataset.fuSelect){comparison.selected[e.target.dataset.fuSelect]=e.target.checked;compareDirty=true;}};
 host.onclick=async e=>{
  e.stopPropagation();const target=e.target.closest('[data-fu-action]');if(!target||target.disabled||busy||dead)return;const action=target.dataset.fuAction;
  if(action==='back'||action==='add'){if(canLeave()){dirty=false;compareDirty=false;action==='back'?onClose():onAdd();}return;}
  if(action==='answer-state'){answers[target.dataset.id].status=target.dataset.status;dirty=true;render();return;}
  if(action==='compare'||action==='manual'){
   const out=action==='compare'?data.outputs.find(o=>!o.applied_at&&o.engine!=='student_reviewed'):null;
   comparison={content:out?.result.content??data.experience.content??'',appeal:out?.result.appeal??data.experience.appeal??'',selected:{content:true,appeal:false},outputId:out?.id};compareDirty=false;render();return;
  }
  if(action==='reload'&&(dirty||compareDirty)&&!confirm('저장하지 않은 내용을 버리고 최신 내용을 불러올까요?'))return;
  busy=true;render();
  try{
   if(action==='save'){await save();if(!dead)message('답변을 저장했습니다.');}
   else if(action==='next'||action==='summarize'){await generate(action==='next'?'generate_questions':'summarize');}
   else if(action==='reload'){accept(await request('get',{sessionId:data.session.id}));comparison=null;compareDirty=false;}
   else if(action==='apply'){
    if(dirty)throw Object.assign(Error('답변을 먼저 저장하고 최신 내용으로 다시 비교해주세요.'),{code:'revision_conflict'});
    const fields=Object.fromEntries(['content','appeal'].filter(k=>comparison.selected[k]).map(k=>[k,comparison[k]]));
    if(!Object.keys(fields).length||Object.entries(fields).some(([k,v])=>[...v].length>(k==='content'?12000:2000)))throw Error('invalid_request');
    if(!confirm('선택한 내용으로 인생그래프를 수정해 저장할까요?')){busy=false;render();return;}
    accept(await request('apply',{sessionId:data.session.id,sourceHash:data.sourceHash,profileRevision:data.profileRevision,answerRevision:data.session.answer_revision,...(comparison.outputId?{outputId:comparison.outputId}:{}),fields}));
    comparison=null;compareDirty=false;await onApplied();
   }else if(action==='restore'){
    if(!confirm('추가 질문 내용을 반영하기 전으로 되돌릴까요?')){busy=false;render();return;}
    accept(await request('restore',{sessionId:data.session.id,outputId:target.dataset.id,sourceHash:data.sourceHash,profileRevision:data.profileRevision}));comparison=null;compareDirty=false;await onApplied();
   }
   if(!dead){busy=false;render();if(action==='save')message('답변을 저장했습니다.');schedule();}
  }catch(err){if(!dead){busy=false;render();message(errorText(err),true);}}
  finally{busy=false;if(!dead)host.querySelectorAll('[data-fu-action]').forEach(n=>{if(['back','reload'].includes(n.dataset.fuAction))n.disabled=false;});}
 };
 render();request('start',{experienceId}).then(result=>{if(dead)return;accept(result);render();schedule();if(initialView==='summary'){const target=host.querySelector('[data-fu-action=compare]');if(target&&!target.disabled){target.focus({preventScroll:true});target.closest('section').scrollIntoView({block:'start'});}}}).catch(e=>{if(!dead)message(errorText(e),true);});
 return {canLeave,destroy(){dead=true;clearTimeout(timer);requestKeys.clear();answers={};data=null;comparison=null;host.onclick=null;host.oninput=null;host.onchange=null;window.removeEventListener('beforeunload',unload);document.removeEventListener('visibilitychange',visibility);}};
}
