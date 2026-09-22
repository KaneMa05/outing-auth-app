/* Existing teacher/admin shell owns navigation, typography and authentication. */
function renderCriminalLawOxAdmin() {
  const host=el('section',{className:'card ox-admin'},[]);
  if(!document.querySelector('link[data-ox-admin-style]')) document.head.appendChild(el('link',{rel:'stylesheet',href:'./criminal-law-ox-admin.css?v=20260922-ox-cohort-filter','data-ox-admin-style':'true'}));
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const write=hasTeacherPermission('criminal_ox.write'),readDevices=hasTeacherPermission('students.read');
  let catalog, page=0, items=[], total=0, selected=null, search='', chapterId='', status='', unreviewed=false, busy=false, requestId=0;
  let memberPage=0, memberSearch='', registeredOnly=true, memberRequestId=0, memberTotal=0, memberCollection='', memberStatus='', memberCohort='';
  let memberCohorts=[], cohortsReady=false;
  const lectureIdLabel=s=>s.lecture_ids?.length?s.lecture_ids.join(' / '):'미등록';
  const cohortLabel=s=>s.student_category==='lecture'?'기수 없음':s.cohort?`${s.cohort}기`:'기수 미지정';
  const cohortOptions=()=>[['','전체 기수'],...memberCohorts.map(c=>[c,`${c}기`]),['lecture','인터넷 수강생 (기수 없음)'],['unassigned','기수 미지정']].map(([value,label])=>`<option value="${escape(value)}" ${memberCohort===value?'selected':''}>${escape(label)}</option>`).join('');
  let memberItems=new Map(), bookEditorVersion=0;
  const books=[['criminal-law','형법'],['criminal-procedure-investigation-evidence','수사·증거'],['criminal-procedure-trial','공판']];
  const bookName=id=>books.find(b=>b[0]===id)?.[1] || 'OX 전체';
  const categoryNames={offline:'오프라인',online_managed:'온라인 관리반',lecture:'인터넷 수강생'};
  const statusNames={published:'공개',draft:'검토 대기',archived:'보관'};
  const messages={revision_conflict:'다른 관리자가 수정한 문항입니다. 목록을 새로고침한 뒤 다시 열어주세요.',invalid_question:'지문·해설·정답과 검토 완료 여부를 확인해주세요.',invalid_html:'해설에는 밑줄 태그 <u>만 사용할 수 있습니다.',forbidden:'OX 관리 권한이 없습니다.',unauthorized:'관리자 로그인이 필요합니다.',student_unavailable:'등록할 수 없는 계정입니다. 수강생의 활성 상태를 확인해주세요.'};
  Object.assign(messages,{grant_empty_targets:'조건에 맞는 오프라인 재원생이 없습니다.',grant_unavailable:'지급 건을 찾을 수 없습니다.',grant_preview_expired:'확인 시간이 지났습니다. 조건을 다시 선택해 대상 명단을 확인해주세요.',grant_target_changed:'재원생 명단이 변경되었습니다. 조건을 다시 선택해 대상 명단을 확인해주세요.',device_request_changed:'신청 또는 기기 상태가 변경되었습니다. 목록을 다시 확인해주세요.',device_unavailable:'비밀번호 또는 기기 정보가 변경되어 승인할 수 없습니다. 학생에게 다시 신청하도록 안내해주세요.',access_conflict:'다른 관리자가 이용 권한을 변경했습니다. 목록을 새로고침한 뒤 다시 등록해주세요.',book_already_active:'이미 이용 중인 교재입니다. 목록을 새로고침해주세요.',book_selection_required:'구매한 교재를 선택해 등록해주세요.',invalid_request:'교재·구매일·처리 사유를 확인해주세요.'});
  async function api(action,body={}) {
    const response=await fetch('/api/criminal-law-ox',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...body})});
    const result=await response.json();
    if(!response.ok || !result.ok) throw Error(messages[result.error] || '문제 관리 서버에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.');
    return result;
  }
  function notify(message) { const n=host.querySelector('[data-message]'); if(n)n.textContent=message; }
  function chaptersOptions(value) { return catalog.chapters.map(c=>`<option value="${escape(c.id)}" ${c.id===value?'selected':''}>${escape(c.part_title || catalog.collections.find(x=>x.id===c.collection_id)?.scope)} · ${escape(c.display_name)}</option>`).join(''); }
  function shell() {
    host.innerHTML=`<div class="ox-admin-heading"><div><h2>형사법 OX 관리</h2><p>문항을 검토하고 수강생에게 공개하세요.</p></div><button class="btn" data-admin="new" ${write?'':'disabled'}>문제 추가</button></div>
      <div class="ox-admin-summary">${[['전체',catalog.counts.total],['공개',catalog.counts.published],['검토 대기',catalog.counts.draft],['보관',catalog.counts.archived]].map(([label,count])=>`<div><span>${label}</span><strong>${count.toLocaleString()}</strong></div>`).join('')}</div>
      <div class="ox-admin-availability"><div><span>수강생 학습 <strong>${catalog.enabled?'등록 수강생만 사용 중':'준비 중'}</strong></span><p>학습을 시작해도 교재 구매 권한 또는 유효한 이용권이 있는 수강생에게 OX가 표시됩니다.</p></div><button class="mini-btn" data-admin="enabled" ${write?'':'disabled'}>${catalog.enabled?'학습 사용 중지':'등록 수강생 학습 시작'}</button></div>
      <section class="ox-admin-members" aria-labelledby="ox-members-title"><h3 id="ox-members-title">교재 구매 · 이용 수강생 관리</h3><p>교재 구매 또는 별도 이용권으로 학습을 개방할 수 있습니다. 이용을 중지해도 풀이 기록과 메모는 보존됩니다.</p>
        <form data-member-form class="ox-admin-member-filters"><label class="ox-admin-search">수강생 검색<input name="memberSearch" placeholder="이름 · 학생 ID · 인강 아이디" maxlength="500" value="${escape(memberSearch)}"></label><label>표시 대상<select name="registeredOnly"><option value="true" ${registeredOnly?'selected':''}>등록된 수강생</option><option value="false" ${registeredOnly?'':'selected'}>전체 수강생 · 등록하기</option></select></label><button class="btn secondary" type="submit">검색</button></form>
        <div class="ox-admin-member-filters"><label>기수<select data-member-cohort ${cohortsReady?'':'disabled'}>${cohortOptions()}</select></label><label>구매 교재<select data-member-collection><option value="">전체 교재</option>${books.map(([id,name])=>`<option value="${id}" ${memberCollection===id?'selected':''}>${name}</option>`).join('')}</select></label><label>구매 이용 상태<select data-member-status><option value="">전체 상태</option><option value="active" ${memberStatus==='active'?'selected':''}>이용 중</option><option value="stopped" ${memberStatus==='stopped'?'selected':''}>중지</option></select></label></div>
        <button class="mini-btn" data-admin="grants">OX 이용권 일괄 지급·이력</button> <button class="mini-btn" data-admin="device-requests" ${readDevices?'':'disabled'}>기기 교체 신청 확인</button><p role="status" data-member-message></p><div data-members></div><div data-book-editor></div>
      </section>
      <form class="ox-admin-filters"><label>단원<select name="chapterId"><option value="">전체 단원</option>${chaptersOptions(chapterId)}</select></label><label>상태<select name="status"><option value="">전체 상태</option>${Object.entries(statusNames).map(([v,l])=>`<option value="${v}" ${v===status?'selected':''}>${l}</option>`).join('')}</select></label><label class="ox-admin-search">지문 검색<input name="search" placeholder="지문 또는 관리 번호" value="${escape(search)}" maxlength="500"></label><button class="btn secondary" type="submit">검색</button><label class="ox-admin-check"><input type="checkbox" name="unreviewed" ${unreviewed?'checked':''}> 미검토 문항만</label></form>
      <p role="status" data-message></p><div data-list></div><div data-editor></div>`;
    host.querySelector('.ox-admin-filters').onsubmit=event=>{event.preventDefault();const form=new FormData(event.target);search=form.get('search').trim();chapterId=form.get('chapterId');status=form.get('status');unreviewed=form.has('unreviewed');page=0;loadList();};
    host.querySelector('[data-member-form]').onsubmit=event=>{event.preventDefault();if(busy)return;const form=new FormData(event.target);memberSearch=form.get('memberSearch').trim();registeredOnly=form.get('registeredOnly')==='true';memberPage=0;loadMembers();};
    for(const selector of ['[data-member-cohort]','[data-member-collection]','[data-member-status]']) host.querySelector(selector).onchange=()=>{if(busy)return;memberCohort=host.querySelector('[data-member-cohort]').value;memberCollection=host.querySelector('[data-member-collection]').value;memberStatus=host.querySelector('[data-member-status]').value;memberPage=0;loadMembers();};
    list();
    loadMembers();
  }
  async function loadMembers(successMessage='') {
    bookEditorVersion++;
    host.querySelector('[data-book-editor]').replaceChildren();
    const id=++memberRequestId, message=host.querySelector('[data-member-message]');
    message.textContent='수강생을 불러오는 중…';
    host.querySelector('[data-members]').replaceChildren();
    try {
      const data=await api('admin_members',{page:memberPage,search:memberSearch,registeredOnly,collectionId:memberCollection,bookStatus:memberStatus,cohort:memberCohort});
      if(id!==memberRequestId)return;
      memberTotal=data.total;
      if(Array.isArray(data.cohorts)){
        memberCohorts=data.cohorts.map(String);
        if(/^[0-9]{1,2}$/.test(memberCohort)&&!memberCohorts.includes(memberCohort))memberCohorts.push(memberCohort);
        memberCohorts.sort((a,b)=>Number(b)-Number(a));cohortsReady=true;
        const select=host.querySelector('[data-member-cohort]');select.innerHTML=cohortOptions();select.disabled=false;
      }
      memberItems=new Map(data.items.map(s=>[s.id,s]));
      if(memberPage>0 && memberPage*30>=memberTotal){memberPage=Math.max(0,Math.ceil(memberTotal/30)-1);return loadMembers(successMessage);}
      host.querySelector('[data-members]').innerHTML=`<div class="ox-admin-list-head"><span>${memberTotal.toLocaleString()}명</span><span>${memberPage+1} / ${Math.max(1,Math.ceil(memberTotal/30))} 페이지</span></div><ul class="ox-admin-member-list">${data.items.map(s=>`<li><div><strong>${escape(s.name)}</strong><span>${escape(cohortLabel(s))} · ${escape(categoryNames[s.student_category] || s.student_category)} · ${escape(s.class_name)}</span><small>학생 ID: ${escape(s.id)}${s.is_active?'':' · 비활성 계정'}</small><small>인강 아이디: ${escape(lectureIdLabel(s))}</small><div class="ox-admin-book-statuses">${books.map(([id,name])=>{const b=s.books?.find(x=>x.collection_id===id);return `<span class="ox-admin-book-status ${b?.active&&s.allowed?'active':''}">${name} · ${!b?'미등록':b.active&&s.allowed?'이용 중':'중지'}${b?.source==='legacy'?' (구매 확인 필요)':''}</span>`;}).join('')}</div>${s.grants?.length?`<small>지급 이용권: ${s.grants.map(g=>bookName(g.id)).join(' · ')}</small>`:''}${(s.books?.length||s.grants?.length)&&!s.allowed?'<small>OX 전체 이용 중지 상태입니다.</small>':''}</div><div class="ox-admin-member-actions"><button class="mini-btn" data-admin="book-add" data-id="${escape(s.id)}" ${write&&s.is_active?'':'disabled'}>교재 구매 등록</button><button class="mini-btn" data-admin="book-stop" data-id="${escape(s.id)}" ${write&&s.books?.some(b=>b.active)?'':'disabled'}>교재 이용 중지</button><button class="mini-btn" data-admin="device-list" data-id="${escape(s.id)}" ${readDevices?'':'disabled'}>등록 기기</button><button class="mini-btn" data-admin="book-history" data-id="${escape(s.id)}">변경 이력</button>${(s.books?.some(b=>b.active)||s.grants?.length)?`<button class="mini-btn" data-admin="member-set" data-id="${escape(s.id)}" data-revision="${s.access_revision}" data-allowed="${!s.allowed}" ${write&&(s.is_active||s.allowed)?'':'disabled'}>${s.allowed?'OX 전체 중지':'OX 전체 재개'}</button>`:''}</div></li>`).join('') || `<li>${registeredOnly?'조건에 맞는 등록 수강생이 없습니다. 필터나 표시 대상을 확인해주세요.':'검색 결과가 없습니다.'}</li>`}</ul><div class="ox-admin-pagination"><button class="mini-btn" data-admin="member-previous" ${memberPage===0?'disabled':''}>이전</button><button class="mini-btn" data-admin="member-next" ${(memberPage+1)*30>=memberTotal?'disabled':''}>다음</button></div>`;
      message.textContent=successMessage;
    } catch(error){if(id===memberRequestId){message.textContent=error.message;host.querySelector('[data-members]').innerHTML='<button class="mini-btn" data-admin="member-retry">다시 시도</button>';}}
  }
  async function bookEditor(student,active,historyOnly=false) {
    if(!student)return;
    const version=++bookEditorVersion, panel=host.querySelector('[data-book-editor]');
    const today=new Date(Date.now()+9*60*60*1000).toISOString().slice(0,10);
    const eligible=books.filter(([id])=>active?!student.books?.some(b=>b.collection_id===id&&b.active):student.books?.some(b=>b.collection_id===id&&b.active));
    panel.innerHTML=`<section class="ox-admin-editor ox-admin-book-editor"><div class="ox-admin-heading"><h4>${escape(student.name)} · ${historyOnly?'이용 변경 이력':active?'교재 구매 등록 · 재개방':'교재 이용 중지'}</h4><button class="mini-btn" data-admin="book-close">닫기</button></div><p>학생 ID: ${escape(student.id)} · ${escape(cohortLabel(student))} · ${escape(student.class_name)}</p><p>인강 아이디: ${escape(lectureIdLabel(student))}</p>${historyOnly?'':`<form data-book-form><fieldset ${write?'':'disabled'}><legend>${active?'구매한 교재':'중지할 교재'} 선택</legend><div class="ox-admin-book-choices">${eligible.map(([id,name])=>`<label class="ox-admin-check"><input type="checkbox" name="book" value="${id}">${name}</label>`).join('') || '<p>선택할 교재가 없습니다.</p>'}</div>${active?`<label>구매 확인일<input type="date" name="purchaseDate" value="${today}" max="${today}" required></label><p>현재 이용 기간 제한 없이 개방합니다. 이미 이용 중인 교재는 유지됩니다.</p>`:'<p>선택한 교재의 구매 권한만 중지합니다. 별도 이용권이 있으면 학습은 계속 이용할 수 있습니다. 풀이 기록과 메모는 보존됩니다.</p>'}<label>${active?'판매 기록 번호 또는 구매 확인 메모':'중지 사유'}<textarea name="reason" rows="2" maxlength="500" required></textarea></label>${!student.allowed&&student.books?.length?'<p>OX 전체 중지 상태입니다. 교재 등록 후 전체 재개가 별도로 필요합니다.</p>':''}<p data-book-summary role="status">교재를 선택해주세요.</p><button class="btn" type="submit" ${eligible.length?'':'disabled'}>${active?'선택 교재 등록 및 개방':'선택 교재 이용 중지'}</button></fieldset><p data-book-message role="status"></p></form>`}<div data-book-history>변경 이력을 불러오는 중…</div></section>`;
    panel.scrollIntoView({behavior:'smooth',block:'nearest'});
    const form=panel.querySelector('[data-book-form]');
    if(form) {
      form.onchange=()=>{const ids=new FormData(form).getAll('book');panel.querySelector('[data-book-summary]').textContent=ids.length?`${ids.map(bookName).join(', ')} ${active?'개방':'중지'} · 다른 교재의 권한과 기록은 유지됩니다.`:'교재를 선택해주세요.';};
      form.onsubmit=async event=>{
        event.preventDefault();if(busy||!write)return;
        const values=new FormData(form),ids=values.getAll('book'),message=form.querySelector('[data-book-message]');
        if(!ids.length){message.textContent='교재를 한 권 이상 선택해주세요.';return;}
        busy=true;form.querySelector('fieldset').disabled=true;message.textContent='저장 중…';
        try {
          await api('admin_book_set',{memberId:student.id,collectionIds:ids,active,revision:student.access_revision,purchaseDate:values.get('purchaseDate'),reason:values.get('reason').trim()});
          await loadMembers(`${ids.map(bookName).join(', ')} ${active?'등록을 완료했습니다.':'이용을 중지했습니다.'}${active&&!catalog.enabled?' 학습 준비 상태이므로 전체 학습 시작 후 이용할 수 있습니다.':''}`);
        } catch(error){message.textContent=error.message;form.querySelector('fieldset').disabled=false;} finally{busy=false;}
      };
    }
    try {
      const data=await api('admin_member_history',{memberId:student.id});
      if(version!==bookEditorVersion)return;
      const describe=value=>value==null?'미등록':('allowed' in value?value.allowed:value.active)?'이용 허용':'중지';
      panel.querySelector('[data-book-history]').innerHTML=`<h4>최근 변경 이력 · 최대 50건</h4>${data.history.map(h=>`<div class="ox-admin-book-history"><strong>${escape(bookName(h.collection_id))} · ${describe(h.before_value)} → ${describe(h.after_value)}</strong><p>${escape(h.reason)}</p><small>${escape(h.actor)} · ${escape(new Date(h.changed_at).toLocaleString('ko-KR'))}${h.after_value.purchase_date?` · 구매 확인일 ${escape(h.after_value.purchase_date)}`:''}</small></div>`).join('') || '<p>아직 변경 이력이 없습니다.</p>'}`;
    } catch(error){if(version===bookEditorVersion)panel.querySelector('[data-book-history]').textContent=error.message;}
  }
  function list() {
    host.querySelector('[data-list]').innerHTML=`<div class="ox-admin-list-head"><span>${total.toLocaleString()}문항</span><span>${page+1} / ${Math.max(1,Math.ceil(total/30))} 페이지</span></div><div class="ox-admin-table-wrap"><table class="ox-admin-table"><thead><tr><th>단원 · 지문</th><th>정답</th><th>상태</th><th></th></tr></thead><tbody>${items.map(q=>`<tr><td><small>${escape(catalog.chapters.find(c=>c.id===q.chapter_id)?.display_name)}</small><p>${escape(q.entry.prompt)}</p></td><td>${q.entry.correct_answer}</td><td><span class="ox-admin-tag ${q.status}">${statusNames[q.status]}</span>${q.reviewed?'':'<small>문맥 검토 필요</small>'}</td><td><button class="mini-btn" data-admin="edit" data-id="${escape(q.id)}">열기</button></td></tr>`).join('') || '<tr><td colspan="4">해당하는 문항이 없습니다.</td></tr>'}</tbody></table></div><div class="ox-admin-pagination"><button class="mini-btn" data-admin="previous" ${page===0?'disabled':''}>이전</button><button class="mini-btn" data-admin="next" ${(page+1)*30>=total?'disabled':''}>다음</button></div>`;
  }
  async function loadList() {
    const id=++requestId; notify('불러오는 중…');
    try { const data=await api('admin_list',{page,search,chapterId,status,unreviewed}); if(id!==requestId)return;items=data.items;total=data.total;list();notify(''); } catch(error){notify(error.message);}
  }
  function editor(q) {
    selected=q;
    host.querySelector('[data-list]').hidden=true;
    host.querySelector('.ox-admin-filters').hidden=true;
    const e=q.entry;
    host.querySelector('[data-editor]').innerHTML=`<section class="ox-admin-editor"><div class="ox-admin-heading"><h3>${q.revision?'문제 수정':'문제 추가'}</h3><button class="mini-btn" data-admin="close">닫기</button></div><form data-edit-form>
      <label>단원<select name="chapter_id">${chaptersOptions(e.chapter_id)}</select></label>
      <label>지문<textarea name="prompt" rows="4" maxlength="15000" required>${escape(e.prompt)}</textarea></label>
      <label>사례·조건 <span>필요한 경우에만</span><textarea name="context" rows="2" maxlength="15000">${escape(e.context)}</textarea></label>
      <div class="ox-admin-editor-row"><label>정답<select name="correct_answer"><option ${e.correct_answer==='O'?'selected':''}>O</option><option ${e.correct_answer==='X'?'selected':''}>X</option></select></label><label>공개 상태<select name="status">${Object.entries(statusNames).map(([v,l])=>`<option value="${v}" ${v===q.status?'selected':''}>${l}</option>`).join('')}</select></label></div>
      <label>해설 <span>밑줄: &lt;u&gt;내용&lt;/u&gt;</span><textarea name="explanation_html" rows="7" maxlength="30000" required>${escape(e.explanation_html)}</textarea></label>
      <label class="ox-admin-check"><input type="checkbox" name="reviewed" ${q.reviewed?'checked':''}> 지문·정답·해설 검토 완료</label>
      <details><summary>원문 및 관리 정보</summary><p>관리 번호: ${escape(e.id)} · 버전 ${q.content_version || 1}</p><p>${escape(e.original_context || '')}</p><p>${escape(e.original_prompt || e.prompt)}</p><p>원문 번호 ${escape(e.source_question_number)}${escape(e.source_option_label)} · PDF ${escape(e.source_page)}쪽</p></details>
      <div class="ox-admin-editor-row"><button class="btn" type="submit" ${write?'':'disabled'}>저장</button><button class="btn secondary" type="button" data-admin="preview">수강생 화면 미리보기</button>${q.revision?'<button class="mini-btn" type="button" data-admin="history">수정 이력</button>':''}</div><p role="status" data-editor-message></p><div data-preview></div><div data-history></div></form></section>`;
    const form=host.querySelector('[data-edit-form]');
    if(!write) form.querySelectorAll('input,textarea,select').forEach(input=>input.disabled=true);
    form.onsubmit=async event=>{
      event.preventDefault();if(busy || !write)return;
      const values=Object.fromEntries(new FormData(form));
      busy=true;const submit=form.querySelector('[type=submit]');submit.disabled=true;
      const message=form.querySelector('[data-editor-message]');message.textContent='저장 중…';
      try {
        const result=await api('admin_save',{question:{...e,chapter_id:values.chapter_id,prompt:values.prompt.trim(),context:values.context.trim(),correct_answer:values.correct_answer,explanation_html:values.explanation_html.trim()},revision:q.revision,status:values.status,reviewed:values.reviewed==='on'});
        catalog=await api('admin_catalog');shell();editor(result.item);host.querySelector('[data-editor-message]').textContent='저장했습니다.';await loadList();
      } catch(error) {message.textContent=error.message;submit.disabled=false;} finally {busy=false;}
    };
    host.querySelector('[data-editor]').scrollIntoView({behavior:'smooth',block:'start'});
    form.querySelector('[name=prompt]').focus({preventScroll:true});
  }
  host.addEventListener('click',async event=>{
    const b=event.target.closest('[data-admin]');if(!b || b.disabled || busy)return;
    try {
      if(b.dataset.admin==='grants') {
        const version=++bookEditorVersion,panel=host.querySelector('[data-book-editor]');panel.replaceChildren();
        const {mountGrants}=await import('./criminal-law-ox-grants-admin.js?v=20260922-ox-bulk-grants');
        if(version!==bookEditorVersion)return;
        const content=el('div',{});panel.replaceChildren(content);
        mountGrants(content,{api,canWrite:write,cohorts:memberCohorts,enabled:catalog.enabled,onClose:()=>loadMembers()});
        panel.scrollIntoView({behavior:'smooth',block:'nearest'});
      }
      if(['device-list','device-requests'].includes(b.dataset.admin)) {
        bookEditorVersion++;const version=bookEditorVersion;
        const panel=host.querySelector('[data-book-editor]');panel.replaceChildren();
        const {mountDeviceAdmin}=await import('./criminal-law-ox-device-admin.js?v=20260922-ox-device-policy');
        if(version!==bookEditorVersion)return;
        await mountDeviceAdmin(panel,{api,memberId:b.dataset.admin==='device-list'?b.dataset.id:null,canReset:hasTeacherPermission('students.reset'),onClose:()=>{bookEditorVersion++;panel.replaceChildren();}});
      }
      if(b.dataset.admin==='member-retry') await loadMembers();
      if(b.dataset.admin==='book-close'){bookEditorVersion++;host.querySelector('[data-book-editor]').replaceChildren();}
      if(['book-add','book-stop','book-history'].includes(b.dataset.admin)) await bookEditor(memberItems.get(b.dataset.id),b.dataset.admin==='book-add',b.dataset.admin==='book-history');
      if(['member-previous','member-next'].includes(b.dataset.admin)){memberPage+=b.dataset.admin==='member-next'?1:-1;await loadMembers();}
      if(b.dataset.admin==='member-set') {
        if(!write)return;
        busy=true;b.disabled=true;
        try {
          const allowed=b.dataset.allowed==='true';
          await api('admin_member_set',{memberId:b.dataset.id,allowed,revision:Number(b.dataset.revision)});
          await loadMembers(allowed?(catalog.enabled?'등록했습니다. 수강생이 홈에 다시 들어오면 OX를 이용할 수 있습니다.':'등록했습니다. 학습을 시작하면 이 수강생이 OX를 이용할 수 있습니다.'):'등록을 해제했습니다. 이후 학습 요청은 차단되며 기존 기록은 보존됩니다.');
        } catch(error){host.querySelector('[data-member-message]').textContent=error.message;b.disabled=false;}
      }
      if(b.dataset.admin==='edit') editor(items.find(q=>q.id===b.dataset.id));
      if(b.dataset.admin==='new') editor({entry:{id:'manual-'+crypto.randomUUID(),chapter_id:chapterId || catalog.chapters[0].id,prompt:'',context:'',correct_answer:'O',explanation_html:''},revision:0,status:'draft',reviewed:false});
      if(b.dataset.admin==='close') {host.querySelector('[data-editor]').innerHTML='';selected=null;host.querySelector('[data-list]').hidden=false;host.querySelector('.ox-admin-filters').hidden=false;host.scrollIntoView({block:'start'});}
      if(['previous','next'].includes(b.dataset.admin)){page+=b.dataset.admin==='next'?1:-1;await loadList();}
      if(b.dataset.admin==='enabled') {busy=true;await api('admin_enabled',{enabled:!catalog.enabled});catalog=await api('admin_catalog');shell();}
      if(b.dataset.admin==='history') {
        const data=await api('admin_history',{id:selected.id || selected.entry.id});
        host.querySelector('[data-history]').innerHTML=`<h4>수정 이력</h4>${data.history.map(h=>`<details><summary>${escape(new Date(h.changed_at).toLocaleString('ko-KR'))} · ${escape(h.actor)}</summary><p>이전: ${escape(h.before_value?.entry?.prompt || '신규 문항')}</p><p>이후: ${escape(h.after_value.entry.prompt)}</p><p>정답 ${escape(h.before_value?.entry?.correct_answer || '—')} → ${escape(h.after_value.entry.correct_answer)} · ${escape(statusNames[h.after_value.status])}</p></details>`).join('') || '<p>아직 수정 이력이 없습니다.</p>'}`;
      }
      if(b.dataset.admin==='preview') {
        const v=Object.fromEntries(new FormData(host.querySelector('[data-edit-form]')));
        host.querySelector('[data-preview]').innerHTML=`<section class="ox-admin-preview"><h4>${escape(catalog.chapters.find(c=>c.id===v.chapter_id)?.display_name)}</h4>${v.context?`<p>${escape(v.context)}</p>`:''}<p>${escape(v.prompt)}</p><div class="ox-admin-preview-answers">O　　X</div><hr><strong>정답 ${escape(v.correct_answer)}</strong><p>${escape(v.explanation_html).replace(/&lt;(\/?u)&gt;/g,'<$1>')}</p></section>`;
      }
    }catch(error){notify(error.message);}finally{busy=false;}
  });
  host.innerHTML='<p role="status">형사법 OX 문제를 불러오는 중입니다.</p>';
  api('admin_catalog').then(data=>{catalog=data;shell();return loadList();}).catch(error=>{host.replaceChildren(el('p',{role:'alert'},error.message),button('다시 시도','btn secondary','button',()=>render()));});
  return host;
}
