/* Existing teacher/admin shell owns navigation, typography and authentication. */
function renderCriminalLawOxAdmin() {
  const host=el('section',{className:'card ox-admin'},[]);
  if(!document.querySelector('link[data-ox-admin-style]')) document.head.appendChild(el('link',{rel:'stylesheet',href:'./criminal-law-ox-admin.css?v=20260917-ox-members','data-ox-admin-style':'true'}));
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const write=hasTeacherPermission('criminal_ox.write');
  let catalog, page=0, items=[], total=0, selected=null, search='', chapterId='', status='', unreviewed=false, busy=false, requestId=0;
  let memberPage=0, memberSearch='', registeredOnly=true, memberRequestId=0, memberTotal=0;
  const categoryNames={offline:'오프라인',online_managed:'온라인 관리반',lecture:'인터넷 수강생'};
  const statusNames={published:'공개',draft:'검토 대기',archived:'보관'};
  const messages={revision_conflict:'다른 관리자가 수정한 문항입니다. 목록을 새로고침한 뒤 다시 열어주세요.',invalid_question:'지문·해설·정답과 검토 완료 여부를 확인해주세요.',invalid_html:'해설에는 밑줄 태그 <u>만 사용할 수 있습니다.',forbidden:'OX 관리 권한이 없습니다.',unauthorized:'관리자 로그인이 필요합니다.',student_unavailable:'등록할 수 없는 계정입니다. 수강생의 활성 상태를 확인해주세요.'};
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
      <div class="ox-admin-availability"><div><span>수강생 학습 <strong>${catalog.enabled?'등록 수강생만 사용 중':'준비 중'}</strong></span><p>학습을 시작해도 아래에서 등록한 수강생에게만 OX가 표시됩니다.</p></div><button class="mini-btn" data-admin="enabled" ${write?'':'disabled'}>${catalog.enabled?'학습 사용 중지':'등록 수강생 학습 시작'}</button></div>
      <section class="ox-admin-members" aria-labelledby="ox-members-title"><h3 id="ox-members-title">이용 수강생 관리</h3><p>기존 수강생을 검색해 OX 이용자로 등록하세요. 등록을 해제해도 풀이 기록과 메모는 보존됩니다.</p>
        <form data-member-form class="ox-admin-member-filters"><label class="ox-admin-search">수강생 검색<input name="memberSearch" placeholder="이름 또는 학생 ID" maxlength="500" value="${escape(memberSearch)}"></label><label>표시 대상<select name="registeredOnly"><option value="true" ${registeredOnly?'selected':''}>등록된 수강생</option><option value="false" ${registeredOnly?'':'selected'}>전체 수강생 · 등록하기</option></select></label><button class="btn secondary" type="submit">검색</button></form>
        <p role="status" data-member-message></p><div data-members></div>
      </section>
      <form class="ox-admin-filters"><label>단원<select name="chapterId"><option value="">전체 단원</option>${chaptersOptions(chapterId)}</select></label><label>상태<select name="status"><option value="">전체 상태</option>${Object.entries(statusNames).map(([v,l])=>`<option value="${v}" ${v===status?'selected':''}>${l}</option>`).join('')}</select></label><label class="ox-admin-search">지문 검색<input name="search" placeholder="지문 또는 관리 번호" value="${escape(search)}" maxlength="500"></label><button class="btn secondary" type="submit">검색</button><label class="ox-admin-check"><input type="checkbox" name="unreviewed" ${unreviewed?'checked':''}> 미검토 문항만</label></form>
      <p role="status" data-message></p><div data-list></div><div data-editor></div>`;
    host.querySelector('.ox-admin-filters').onsubmit=event=>{event.preventDefault();const form=new FormData(event.target);search=form.get('search').trim();chapterId=form.get('chapterId');status=form.get('status');unreviewed=form.has('unreviewed');page=0;loadList();};
    host.querySelector('[data-member-form]').onsubmit=event=>{event.preventDefault();if(busy)return;const form=new FormData(event.target);memberSearch=form.get('memberSearch').trim();registeredOnly=form.get('registeredOnly')==='true';memberPage=0;loadMembers();};
    list();
    loadMembers();
  }
  async function loadMembers(successMessage='') {
    const id=++memberRequestId, message=host.querySelector('[data-member-message]');
    message.textContent='수강생을 불러오는 중…';
    host.querySelector('[data-members]').replaceChildren();
    try {
      const data=await api('admin_members',{page:memberPage,search:memberSearch,registeredOnly});
      if(id!==memberRequestId)return;
      memberTotal=data.total;
      if(memberPage>0 && memberPage*30>=memberTotal){memberPage=Math.max(0,Math.ceil(memberTotal/30)-1);return loadMembers(successMessage);}
      host.querySelector('[data-members]').innerHTML=`<div class="ox-admin-list-head"><span>${memberTotal.toLocaleString()}명</span><span>${memberPage+1} / ${Math.max(1,Math.ceil(memberTotal/30))} 페이지</span></div><ul class="ox-admin-member-list">${data.items.map(s=>`<li><div><strong>${escape(s.name)}</strong><span>${escape(categoryNames[s.student_category] || s.student_category)} · ${escape(s.class_name)}</span><small>학생 ID: ${escape(s.id)}${s.is_active?'':' · 비활성 계정'}</small></div><div class="ox-admin-member-actions"><span>${s.allowed?'등록됨':'미등록'}</span><button class="mini-btn" data-admin="member-set" data-id="${escape(s.id)}" data-allowed="${!s.allowed}" aria-label="${escape(s.name)} ${s.allowed?'등록 해제':'OX 등록'}" ${write && (s.is_active || s.allowed)?'':'disabled'}>${s.allowed?'등록 해제':'OX 등록'}</button></div></li>`).join('') || `<li>${registeredOnly?'등록된 수강생이 없습니다. 표시 대상을 전체 수강생으로 바꾸어 등록하세요.':'검색 결과가 없습니다.'}</li>`}</ul><div class="ox-admin-pagination"><button class="mini-btn" data-admin="member-previous" ${memberPage===0?'disabled':''}>이전</button><button class="mini-btn" data-admin="member-next" ${(memberPage+1)*30>=memberTotal?'disabled':''}>다음</button></div>`;
      message.textContent=successMessage;
    } catch(error){if(id===memberRequestId){message.textContent=error.message;host.querySelector('[data-members]').innerHTML='<button class="mini-btn" data-admin="member-retry">다시 시도</button>';}}
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
      if(b.dataset.admin==='member-retry') await loadMembers();
      if(['member-previous','member-next'].includes(b.dataset.admin)){memberPage+=b.dataset.admin==='member-next'?1:-1;await loadMembers();}
      if(b.dataset.admin==='member-set') {
        if(!write)return;
        busy=true;b.disabled=true;
        try {
          const allowed=b.dataset.allowed==='true';
          await api('admin_member_set',{memberId:b.dataset.id,allowed});
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
