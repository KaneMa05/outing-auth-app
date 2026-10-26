const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={empty:'미작성',draft:'작성 중',submitted:'제출 완료',needs_revision:'제출 완료',approved:'제출 완료'};
const errors={diagnosis_worker_offline:'진단 실행기가 연결되어 있지 않습니다. 답변은 저장되어 있으니 잠시 후 다시 요청해주세요.',diagnosis_not_configured:'진단 기준은 등록되어 있습니다. 진단 실행 연결을 확인해주세요.',diagnosis_busy:'다른 진단이 진행 중입니다. 잠시 후 다시 눌러주세요.',diagnosis_limit:'오늘 진단 요청 한도에 도달했습니다. 내일 다시 이용해주세요.',criteria_not_ready:'이 문항의 진단 기준을 확인해주세요.',disabled:'사전과제 제출을 준비하고 있습니다.',revision_conflict:'다른 화면에서 변경되었습니다. 입력 내용을 복사해 보관한 뒤 최신 내용 불러오기를 눌러주세요.',idempotency_conflict:'제출 요청이 변경되었습니다. 최신 내용을 불러온 뒤 다시 시도해주세요.',incomplete:'내 답변을 작성해주세요.',deadline_passed:'제출 기한이 지났습니다. 담당 선생님께 문의해주세요.',not_enrolled:'면접반 등록과 이용 기간을 확인해주세요.',forbidden:'이 자료에 접근할 권한이 없습니다.',unauthorized:'로그인이 만료되었습니다. 다시 로그인해주세요.'};
const date=v=>v?new Date(v).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'—';
const deadlineText=v=>new Date(Date.parse(v)-1).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'long',day:'numeric',hour:'numeric',minute:'2-digit',hour12:true});
const badge=s=>`<span class="pa-badge ${esc(s)}">${labels[s]||'미작성'}</span>`;
const button=(label,action,extra='',primary=false)=>`<button type="button" class="ip-btn ${primary?'ip-primary':''}" data-pa="${action}" ${extra}>${label}</button>`;
async function defaultRequest(action,payload={}){const r=await fetch('/api/interview-preassignments',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,action})});const d=await r.json();if(!r.ok||!d.ok)throw Object.assign(Error(d.error),{code:d.error});return d;}
export async function mountPreassignments(host,{request=defaultRequest,admin=false,canWrite=true}={}){
 let diagnosisTimer;
 function scheduleDiagnosis(remaining=55){
  clearTimeout(diagnosisTimer);
  if(admin||destroyed||detail?.diagnosis?.status!=='running'||remaining<=0)return;
  const unitId=selected,ticket=version;
  diagnosisTimer=setTimeout(async()=>{
   if(destroyed||ticket!==version||unitId!==selected)return;
   if(busy||document.hidden){scheduleDiagnosis(remaining-1);return;}
   try{const result=await request('diagnosis_status',{unitId});
    if(destroyed||ticket!==version||unitId!==selected)return;
    detail.diagnosis=result.diagnosis;
    const panel=host.querySelector('[data-diagnosis]');if(panel)panel.innerHTML=diagnosisHtml(result.diagnosis,dirty);
    if(result.diagnosis?.status==='completed')tell('답변 진단 결과를 저장했습니다.');
    else if(result.diagnosis?.status==='failed')tell('진단을 완료하지 못했습니다. 답변은 저장되어 있습니다.',true);
    scheduleDiagnosis(remaining-1);
   }catch{if(!destroyed&&ticket===version)tell('진단 상태를 확인하지 못했습니다. 결과 확인 버튼으로 다시 확인해주세요.',true);}
  },5000);
 }
 if(!document.querySelector('link[data-pa-style]')){const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('./interview-preassignments.css?v=20261023-pa8',import.meta.url);link.dataset.paStyle='';document.head.append(link);}
 host.classList.add('pa-root');let data,selected='',student='',detail,dirty=false,busy=false,destroyed=false,version=0,page=0,filter={search:'',status:''},historyPage=0,lastMutation=null,guidanceMode=false,guidelines=[],guidance=null;
 const tell=(s,error=false)=>{const n=host.querySelector('[data-pa-message]');if(n){n.textContent=s;n.dataset.error=String(error);}};
 const canLeave=()=>!busy&&(!dirty||confirm('저장하지 않은 사전과제 내용이 있습니다. 이동할까요?'));
 const before=e=>{if(dirty||busy){e.preventDefault();e.returnValue='';}};
 const unit=()=>data.catalog.find(u=>u.id===selected);
 const status=u=>data.units?.find(s=>s.id===u.id)||{};
 function shell(body){clearTimeout(diagnosisTimer);host.innerHTML=`<p class="pa-message" data-pa-message role="status" aria-live="polite"></p><fieldset data-pa-controls>${body}</fieldset>`;}
 function lock(value){busy=value;const form=host.querySelector('[data-pa-controls]');if(form)form.disabled=value;}
 function fieldsHtml(u,values={}){return `<div class="pa-fields"><label>내 답변<textarea data-field="f1" maxlength="4000" rows="10" placeholder="질문에 대한 나의 생각과 경험을 작성해주세요.">${esc(values.f1||'')}</textarea></label><small class="pa-muted">최대 4,000자 · 임시저장 후 이어서 작성할 수 있습니다.</small></div>`;}
 function readFields(){return Object.fromEntries([...host.querySelectorAll('[data-field]')].map(n=>[n.dataset.field,n.value]));}
 function record(s){return `<article class="pa-card"><h3>${s.round}차 제출 ${badge(s.status)}</h3><p class="pa-muted">${date(s.submitted_at)}${s.late?' · 지각 제출':''} · 접수 번호 ${esc(s.id)}</p>${(s.definition?.fields||unit().fields).filter(f=>s.fields[f.id]).map(f=>`<h4>${esc(f.label)}</h4><p class="pa-body">${esc(s.fields[f.id])}</p>`).join('')}</article>`;}
 async function overview(){
  const ticket=++version;const next=await request(admin?'admin_list':'bootstrap',admin?{...filter,page}:{});if(destroyed||ticket!==version)return;
  data=next;selected='';detail=null;dirty=false;guidanceMode=false;
  if(admin){adminOverview();return;}
  if(!data.settings.enabled){shell('<section class="pa-card"><h2>핵심 25제 작성하기</h2><p>사전과제 제출을 준비하고 있습니다.</p>'+button('다시 확인','reload')+'</section>');return;}
  const rows=data.units,core=rows.filter(r=>r.id.startsWith('core-'));
  shell(`<section class="pa-card pa-intro"><small>${esc(data.settings.cohort)} · 사전과제</small><h2>핵심 25제 작성하기</h2><p>질문을 확인하고 <strong>내 답변</strong>을 작성하세요. 진단 버튼을 눌러 강의 기준에 따른 답변 코칭을 받을 수 있습니다.</p><p class="pa-muted">제출 마감 ${deadlineText(data.settings.due_at)}까지 · 한국시간${data.settings.allow_late?' · 기한 후 지각 제출 가능':''}</p></section>
   <section class="pa-stats" aria-label="핵심 25제 진행 현황">${[[`${core.filter(r=>r.revision>0).length}/25`,'저장한 답변'],[`${core.filter(r=>r.round).length}/25`,'제출한 답변'],[data.diagnosisEnabled?'사용 가능':'연결 대기','강의 기반 진단']].map(([v,l])=>`<div class="pa-stat"><strong>${v}</strong><span>${l}</span></div>`).join('')}</section>
   ${rows.some(r=>r.changed)?'<p class="pa-notice">제출 후 수정한 답변이 있습니다. 수정한 답변을 제출하면 제출 이력에 반영됩니다.</p>':''}
   ${[...new Set(data.catalog.map(u=>u.group))].map(group=>`<section class="pa-card"><h3>${esc(group)}</h3><div class="pa-grid">${data.catalog.filter(u=>u.group===group).map(u=>`<button type="button" class="pa-unit" data-pa="open" data-unit="${u.id}"><span><strong>${esc(u.title)}</strong><small>${esc(u.prompt)}</small>${status(u).changed?'<small>수정본 미제출</small>':''}</span>${badge(status(u).status)}</button>`).join('')}</div></section>`).join('')}`);
 }
 function adminOverview(){
  const settings=data.settings;
  shell(`<section class="pa-card pa-intro"><h2>과제 관리</h2><p>핵심인성 25문항 · ${esc(settings.cohort)}</p><p>${settings.enabled?'학생 제출 운영 중':'학생 제출 준비 중'}</p></section>
  <div class="pa-toolbar">${button('질문별 진단 지침','guidelines','',true)}</div>
  ${canWrite?`<details class="pa-card"><summary>제출 운영 설정</summary><div class="pa-fields"><label class="pa-check"><input type="checkbox" data-setting="enabled" ${settings.enabled?'checked':''}>사전과제 제출 열기</label><label>최초 제출 마감 (한국시간, 해당 분까지)<input type="datetime-local" data-setting="dueAt" value="${kstInput(settings.due_at)}"></label><label>수정 답변 제출 마감 (한국시간, 해당 분까지)<input type="datetime-local" data-setting="revisionDueAt" value="${kstInput(settings.revision_due_at)}"></label><label class="pa-check"><input type="checkbox" data-setting="allowLate" ${settings.allow_late?'checked':''}>마감 후 지각 제출 허용</label>${button('운영 설정 저장','settings','',true)}</div></details>`:''}
  <form data-pa-filter class="pa-toolbar"><label>이름·직렬 검색<input name="search" value="${esc(filter.search)}" maxlength="200"></label><label>상태<select name="status">${[['','전체'],['empty','미제출 과제 있음'],['submitted','제출한 과제 있음'],['complete','전체 제출 완료']].map(([v,t])=>`<option value="${v}" ${filter.status===v?'selected':''}>${t}</option>`).join('')}</select></label><button class="ip-btn ip-primary">검색</button></form>
  <p>${data.total}명 · ${page+1}페이지</p><div class="pa-card pa-table-wrap"><table class="pa-table"><thead><tr><th>학생·직렬</th><th>제출</th><th>핵심인성</th><th>기존 기타질문</th><th>답변 보기</th></tr></thead><tbody>${data.students.map(s=>`<tr><td>${esc(s.name)} · ${esc(s.track)}${s.enabled?'':' (이용 중지)'}</td><td>${s.submitted}/${data.catalog.filter(u=>u.id.startsWith('core-')).length}</td><td>제출 ${s.core_submitted}/25</td><td>${badge(s.other_status)}</td><td>${button('답변 보기','student',`data-student="${esc(s.student_id)}"`)}</td></tr>`).join('')||'<tr><td colspan="5">해당 학생이 없습니다.</td></tr>'}</tbody></table></div><div class="pa-toolbar">${button('이전','prev',page===0?'disabled':'')}${button('다음','next',(page+1)*30>=data.total?'disabled':'')}</div>`);
 }
 async function guidanceOverview(){
  const next=await request('admin_guidance_list');if(destroyed)return;
  guidanceMode=true;selected='';guidance=null;guidelines=next.guidelines;dirty=false;
  shell(`<div class="pa-toolbar">${button('제출 현황으로','back')}</div><section class="pa-card pa-intro"><h2>질문별 진단 지침</h2><p>질문마다 답변을 판단할 기준과 피드백 방향을 입력하세요.</p><p class="pa-muted">지침은 관리자만 볼 수 있습니다. 저장한 지침은 해당 문항을 다음에 진단할 때 함께 반영됩니다.</p><p>지침 작성 ${guidelines.filter(g=>g.has_instructions).length}/${data.catalog.length}</p></section><div class="pa-grid">${data.catalog.map(u=>{const g=guidelines.find(g=>g.unit_id===u.id);return `<button type="button" class="pa-unit" data-pa="guidanceOpen" data-unit="${u.id}"><span><strong>${esc(u.title)}</strong><small>${esc(u.prompt)}</small></span><span class="pa-badge">${g?.has_instructions?'지침 작성됨':'지침 미작성'}</span></button>`;}).join('')}</div>`);
 }
 async function openGuidance(id){
  const next=await request('admin_guidance_detail',{unitId:id});if(destroyed)return;
  guidanceMode=true;selected=id;guidance=next.guidance;dirty=false;historyPage=0;
  const u=unit();
  shell(`<div class="pa-toolbar">${button('지침 목록','back')}${button('최신 내용 불러오기','reload')}<label>질문 선택<select data-guidance-select>${data.catalog.map(x=>`<option value="${x.id}" ${x.id===id?'selected':''}>${esc(x.title)}</option>`).join('')}</select></label></div><section class="pa-card pa-intro"><h2>${esc(u.title)} · 진단 지침</h2><p class="pa-body">${esc(u.prompt)}</p><p class="pa-muted">${guidance.revision?`저장 버전 ${guidance.revision} · ${date(guidance.updated_at)} · ${esc(guidance.updated_by)}`:'아직 저장한 지침이 없습니다.'}</p></section><section class="pa-card"><label>진단 지침<textarea data-guidance maxlength="10000" rows="14" ${canWrite?'':'readonly'} placeholder="질문의 의도, 좋은 답변의 기준, 확인할 경험과 행동, 부족한 답변의 판단 기준, 피드백 방향 등을 자유롭게 적어주세요.">${esc(guidance.instructions)}</textarea></label><p class="pa-muted">최대 10,000자 · 학생에게 공개되지 않습니다.</p>${canWrite?button('지침 저장','guidanceSave','',true):'<p>조회 권한으로 접속했습니다.</p>'}</section><section class="pa-card"><h3>지침 수정 이력</h3>${button('수정 이력 불러오기','guidanceHistory')}<div data-guidance-history></div></section>`);
 }
 const kstInput=v=>new Date(Date.parse(v)-60000+9*3600000).toISOString().slice(0,16);
 async function open(id){
  const showSummary=selected!==id||!host.querySelector('[data-summary]')?.hidden;
  const ticket=++version;const next=await request(admin?'admin_detail':'detail',{unitId:id,...(admin?{targetStudentId:student}:{})});if(destroyed||ticket!==version)return;
  selected=id;detail=next;dirty=false;historyPage=0;
  const u=unit(),s=detail.latest;
  shell(`${!admin?`<div class="pa-summary-top">${button('요약서 보기','summary',`aria-expanded="false" aria-controls="pa-summary-${id}"`,true)}</div><section class="pa-card pa-handout" id="pa-summary-${id}" data-summary hidden aria-label="${esc(u.title)} 요약서"></section>`:''}<div class="pa-toolbar">${button(admin?'학생 목록':'과제 목록','back')}${button('최신 내용 불러오기','reload')} ${admin?`<label>조회할 과제<select data-unit-select>${data.catalog.map(x=>`<option value="${x.id}" ${x.id===id?'selected':''}>${x.group} · ${esc(x.title)} · ${labels[detail.units.find(r=>r.id===x.id)?.status]||'미작성'}</option>`).join('')}</select></label>`:''}</div>
   <section class="pa-card pa-intro"><small>${esc(u.group)}${admin?' · '+esc(detail.student?.name):''}</small><h2>${esc(u.title)}</h2><p>${badge(s?.status||(detail.draft?'draft':'empty'))}${s?` · ${s.round}차 제출 · ${date(s.submitted_at)}`:' · 아직 제출하지 않았습니다.'}</p></section>
   <section class="pa-card"><h3>질문</h3><p class="pa-body">${esc(s?.definition?.prompt||u.prompt)}</p></section>
   ${admin?`${s?record(s):'<section class="pa-card">접수된 제출물이 없습니다.</section>'}<p class="pa-muted">진단은 학생이 직접 요청하며 강의 기준에 따른 답변 코칭을 받습니다.</p>`:
   `<section class="pa-card">${fieldsHtml(u,detail.draft?.fields||{})}<div class="pa-toolbar">${button('임시저장','save')}${button(s?'수정 후 다시 제출':'제출하기','submit')}${button('내 답변 진단하기','diagnose','',true)}</div><p class="pa-muted">임시저장은 제출 이력에 포함되지 않습니다. 진단 버튼을 누르면 현재 답변을 먼저 저장합니다.</p></section>
   <section class="pa-card" data-diagnosis aria-live="polite">${diagnosisHtml(detail.diagnosis)}</section>
   ${s?`<details><summary>현재 제출한 답변</summary>${record(s)}</details>`:''}`}

   <section class="pa-card"><h3>제출 이력</h3>${button('이력 불러오기','history')}<div data-history></div></section>`);
  scheduleDiagnosis();
  if(!admin&&showSummary)await toggleSummary();
 }
 async function toggleSummary(){
  const panel=host.querySelector('[data-summary]'),toggle=host.querySelector('[data-pa="summary"]');
  if(!panel||!toggle)return;
  const unitId=selected,ticket=version;
  if(!panel.hidden){panel.hidden=true;toggle.textContent='요약서 보기';toggle.setAttribute('aria-expanded','false');return;}
  if(!panel.dataset.loaded){
   const {summaries,summaryPages}=await import('./interview-core25-summaries.js?v=20261026-no-video-reference');if(destroyed||ticket!==version||unitId!==selected||host.querySelector('[data-summary]')!==panel)return;
   const q=summaries[unitId];if(!q)throw Error('summary_unavailable');
   const pages=summaryPages[unitId];if(!pages?.length)throw Error('summary_unavailable');
   panel.innerHTML=`<div class="pa-handout-caption"><strong class="pa-handout-kicker">핵심인성 ${q.id}번 · 요약서</strong><span>이미지를 누르면 크게 볼 수 있습니다.</span></div><div class="pa-handout-pages">${pages.map((p,i)=>`<a class="pa-handout-page" href="${esc(new URL(p.src,import.meta.url).href)}" target="_blank" rel="noopener" aria-label="핵심인성 ${q.id}번 요약서 ${i+1}쪽 크게 보기 (새 탭)"><img src="${esc(new URL(p.src,import.meta.url).href)}" width="${p.width}" height="${p.height}" alt="핵심인성 ${q.id}번 · ${esc(q.title)} · 요약서 ${i+1}쪽" decoding="async"></a>`).join('')}</div><details class="pa-handout-text"><summary>요약서 텍스트로 읽기</summary><h3>${esc(q.title)}</h3><p>${esc(q.intent)}</p>${q.summary.map(t=>`<p>${esc(t)}</p>`).join('')}${q.criteria.map(c=>`<h4>${esc(c[0])}</h4><p>${esc(c[1])}</p><p>${esc(c[2])}</p>`).join('')}<ul>${q.extra.map(t=>`<li>${esc(t)}</li>`).join('')}</ul><p>${esc(q.weak)}</p><p>${esc(q.frame)}</p></details><div class="pa-toolbar pa-handout-actions">${button('요약서 닫기','summaryClose')}</div>`;
   panel.dataset.loaded='true';
  }
  panel.hidden=false;toggle.textContent='요약서 접기';toggle.setAttribute('aria-expanded','true');
 }
 async function mutation(action,payload){const signature=JSON.stringify({action,...payload});if(lastMutation?.signature!==signature)lastMutation={signature,id:crypto.randomUUID()};const r=await request(action,{...payload,requestId:lastMutation.id});lastMutation=null;return r;}
 async function submit(saveOnly){
  const values=readFields();
  if(!saveOnly&&!values.f1?.trim()){tell('내 답변을 작성해주세요.',true);host.querySelector('[data-field="f1"]').focus();return;}
  const revision=detail.draft?.revision||0;
  const r=await mutation(saveOnly?'save':'submit',saveOnly?{unitId:selected,revision,fields:values}:{unitIds:[selected],revisions:{[selected]:revision},fields:values});
  dirty=false;await open(selected);
  tell(saveOnly?'임시저장했습니다. 아직 제출하지 않은 내용은 제출하기를 눌러주세요.':`제출 접수 완료 · ${r.receipts[0].round}차 · ${r.receipts[0].id}${r.receipts[0].reused?' (기존 접수)':''}`);
 }
 function diagnosisHtml(d,edited=false){
  if(!d)return '<h3>내 답변 진단</h3><p>강의 기반 기준별로 충분·보완·미확인과 답변 근거, 보완 질문을 확인할 수 있습니다.</p>';
  if(d.status==='running')return '<h3>답변 진단 중</h3><p>진단 요청이 접수되었습니다. 완료되면 결과가 자동으로 표시됩니다. 다른 화면으로 이동해도 저장된 답변은 유지됩니다.</p>'+button('진단 결과 확인','diagnosisRefresh');
  if(d.status==='failed')return '<h3>진단을 완료하지 못했습니다</h3><p>답변은 저장되어 있습니다. 잠시 후 내 답변 진단하기를 다시 눌러주세요.</p>';
  const r=d.report;if(!r)return '';
  return `<h3>내 답변 진단 결과</h3><p class="pa-muted">답변 코칭 · ${date(d.createdAt)} · 기준 ${esc(r.criteriaVersion)}</p>${d.stale||edited?'<p class="pa-notice">답변 또는 진단 지침이 변경되었습니다. 아래는 이전 내용에 대한 결과입니다. 현재 답변으로 다시 진단해주세요.</p>':''}<p class="pa-body">${esc(r.summary)}</p>${r.criteria.map(c=>`<article class="pa-card"><h4>${esc(c.label)} <span class="pa-badge">${esc(c.state)}</span></h4>${c.quote?`<blockquote class="pa-body">${esc(c.quote)}</blockquote>`:'<p class="pa-muted">답변에서 확인한 근거가 없습니다.</p>'}<p class="pa-body">${esc(c.reason)}</p>${c.nextQuestion?`<p><strong>보완 질문</strong></p><p class="pa-body">${esc(c.nextQuestion)}</p>`:''}</article>`).join('')}<p><strong>답변 구성 순서</strong></p><p class="pa-body">${esc(r.frame)}</p><p class="pa-muted">강의 근거: ${r.sources.map(x=>`${esc(x[0])}강 ${esc(x[1])}`).join(' · ')}</p>`;
 }
 async function diagnose(){
  const values=readFields();if(!values.f1?.trim()){tell('내 답변을 작성해주세요.',true);return;}
  if(dirty||!detail.draft){await mutation('save',{unitId:selected,revision:detail.draft?.revision||0,fields:values});dirty=false;await open(selected);}
  lock(true);host.querySelector('[data-diagnosis]').innerHTML='<h3>답변 진단 중</h3><p>문항별 기준으로 답변을 확인하고 있습니다. 잠시 기다려주세요.</p>';
  try{
   const result=await request('diagnose',{unitId:selected,revision:detail.draft.revision});if(destroyed)return;
   detail.diagnosis=result.diagnosis;host.querySelector('[data-diagnosis]').innerHTML=diagnosisHtml(result.diagnosis);
   scheduleDiagnosis();
   tell(result.diagnosis?.status==='completed'?'답변 진단 결과를 저장했습니다.':result.diagnosis?.status==='running'?'진단이 진행 중입니다. 완료되면 결과가 자동으로 표시됩니다.':'진단을 완료하지 못했습니다. 답변은 저장되어 있습니다.');
  }catch(e){if(!destroyed)host.querySelector('[data-diagnosis]').innerHTML=diagnosisHtml(detail.diagnosis)+'<p>진단 요청을 확인하지 못했습니다. '+button('진단 결과 확인','diagnosisRefresh')+'</p>';throw e;}
 }
 async function run(fn){if(busy||destroyed)return;lock(true);try{await fn();}catch(e){if(!destroyed){if(!data){shell('<section class="pa-card"><h2>핵심 25제 작성하기</h2><p>과제를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.</p>'+button('다시 시도','reload')+'</section>');}else tell(errors[e.code||e.message]||'처리하지 못했습니다. 입력 내용은 유지됩니다. 연결을 확인한 뒤 다시 시도해주세요.',true);}}finally{if(!destroyed)lock(false);}}
 async function click(e){
  const n=e.target.closest('[data-pa]');if(!n||n.disabled||destroyed)return;const a=n.dataset.pa;
  if(['back','open','student','prev','next','reload','guidelines','guidanceOpen'].includes(a)&&!canLeave())return;
  await run(async()=>{
   if(a==='back'&&guidanceMode&&selected){await guidanceOverview();}
   else if(a==='reload'&&guidanceMode){if(selected)await openGuidance(selected);else await guidanceOverview();}
   else if(a==='back'||a==='reload'&&!selected){await overview();}
   else if(a==='reload'){await open(selected);}
   else if(a==='open'){await open(n.dataset.unit);}
   else if(a==='student'){student=n.dataset.student;await open('core-01');}
   else if(a==='prev'||a==='next'){page+=a==='next'?1:-1;await overview();}
   else if(a==='save'||a==='submit'){await submit(a==='save');}
   else if(a==='summary'){await toggleSummary();}
   else if(a==='summaryClose'){await toggleSummary();host.querySelector('[data-pa=summary]').focus();}
   else if(a==='diagnose'){await diagnose();}
   else if(a==='diagnosisRefresh'){const r=await request('diagnosis_status',{unitId:selected});if(!destroyed){detail.diagnosis=r.diagnosis;host.querySelector('[data-diagnosis]').innerHTML=diagnosisHtml(r.diagnosis,dirty);}}
   else if(a==='guidelines'){await guidanceOverview();}
   else if(a==='guidanceOpen'){await openGuidance(n.dataset.unit);}
   else if(a==='guidanceSave'){await request('admin_guidance_save',{unitId:selected,revision:guidance.revision,instructions:host.querySelector('[data-guidance]').value});dirty=false;await openGuidance(selected);tell('진단 지침을 저장했습니다.');}
   else if(a==='guidanceHistory'){const r=await request('admin_guidance_history',{unitId:selected,page:historyPage});if(destroyed)return;host.querySelector('[data-guidance-history]').insertAdjacentHTML('beforeend',r.versions.map(g=>`<article class="pa-card"><h4>버전 ${g.revision}</h4><small>${date(g.updated_at)} · ${esc(g.updated_by)}</small><p class="pa-body">${esc(g.instructions)||'지침 비움'}</p></article>`).join('')||'<p>수정 이력이 없습니다.</p>');historyPage++;n.disabled=historyPage*10>=r.total;}
   else if(a==='settings'){const get=k=>host.querySelector(`[data-setting="${k}"]`);await request('admin_settings',{revision:data.settings.revision,enabled:get('enabled').checked,allowLate:get('allowLate').checked,dueAt:new Date(Date.parse(get('dueAt').value+':00+09:00')+60000).toISOString(),revisionDueAt:new Date(Date.parse(get('revisionDueAt').value+':00+09:00')+60000).toISOString()});dirty=false;await overview();tell('운영 설정을 저장했습니다.');}
   else if(a==='history'){const r=await request(admin?'admin_history':'history',{unitId:selected,page:historyPage,...(admin?{targetStudentId:student}:{})});if(destroyed)return;host.querySelector('[data-history]').insertAdjacentHTML('beforeend',r.rounds.map(record).join('')||'<p>제출 기록이 없습니다.</p>');historyPage++;n.disabled=historyPage*10>=r.total;}
  });
 }
 function input(e){if(e.target.matches('[data-field],[data-setting],[data-guidance]'))dirty=true;if(e.target.matches('[data-field]')&&detail?.diagnosis?.status==='completed')host.querySelector('[data-diagnosis]').innerHTML=diagnosisHtml(detail.diagnosis,true);}
 async function change(e){if(e.target.matches('[data-guidance-select]')){if(!canLeave()){e.target.value=selected;return;}await run(()=>openGuidance(e.target.value));return;}if(e.target.matches('[data-unit-select]')){if(!canLeave()){e.target.value=selected;return;}await run(()=>open(e.target.value));}}
 async function filterSubmit(e){if(!e.target.matches('[data-pa-filter]'))return;e.preventDefault();if(!canLeave())return;const f=new FormData(e.target);filter={search:f.get('search'),status:f.get('status')};page=0;await run(overview);}
 host.addEventListener('click',click);host.addEventListener('input',input);host.addEventListener('change',change);host.addEventListener('submit',filterSubmit);window.addEventListener('beforeunload',before);
 shell('<p>사전과제를 불러오는 중…</p>'+button('다시 시도','reload'));await run(overview);
 return {canLeave,destroy(){clearTimeout(diagnosisTimer);destroyed=true;++version;host.removeEventListener('click',click);host.removeEventListener('input',input);host.removeEventListener('change',change);host.removeEventListener('submit',filterSubmit);window.removeEventListener('beforeunload',before);host.replaceChildren();}};
}
