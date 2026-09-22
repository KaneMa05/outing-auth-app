export function mountGrants(host,{api,canWrite,cohorts=[],initialCohort='',initialTrack='',enabled=true,onClose,onChanged=()=>{}}){
 let draft={cohort:/^[0-9]{1,2}$/.test(initialCohort)?initialCohort:'',studentIds:[],collectionIds:['criminal-law','criminal-procedure-investigation-evidence','criminal-procedure-trial'],expiresOn:null,reason:''};
 let busy=false,version=0,page=0,batchId=null,trackFilter=initialTrack;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const books=[['criminal-law','형법'],['criminal-procedure-investigation-evidence','수사·증거'],['criminal-procedure-trial','공판']];
 const names=ids=>ids.map(id=>books.find(b=>b[0]===id)?.[1]||id).join(' · ');
 const period=b=>b.expires_on?`${b.expires_on}까지 · 오프라인 재원 중`:'오프라인 재원 기간';
 const state=b=>b.state==='revoked'?'회수':b.expires_on&&b.expires_on<new Date(Date.now()+9*3600000).toISOString().slice(0,10)?'기간 종료':b.state==='issued'?'지급 완료':'지급 전 확인';
 function shell(body,editing=false){host.innerHTML=`<section class="ox-admin-editor ox-admin-book-editor ox-grant-panel"><div class="ox-admin-heading"><h4>OX 이용권 일괄 지급</h4><div class="ox-grant-header-actions">${editing?'<button class="mini-btn" type="button" data-grant-history>지급·회수 이력</button>':''}<button class="mini-btn" data-grant-close>관리로 돌아가기</button></div></div><p>교재 구매와 별도로 제공하는 학습 혜택입니다. 지급·회수해도 구매 권한과 학습 기록은 유지됩니다.</p>${enabled?'':'<p>현재 전체 학습이 준비 상태입니다. 이용권 지급 후에도 학습 시작 설정을 켜야 이용할 수 있습니다.</p>'}${body}<p role="status" data-grant-message></p></section>`;host.querySelector('[data-grant-close]').onclick=()=>{version++;onClose();};}
 function error(e){const n=host.querySelector('[data-grant-message]');if(n)n.textContent=e.message;}
 function form(){
  const current=++version;batchId=null;page=0;
  const today=new Date(Date.now()+9*3600000).toISOString().slice(0,10);
  shell(`<form data-grant-form class="ox-grant-form"><fieldset aria-label="OX 이용권 지급" ${canWrite?'':'disabled'}>
   <div class="ox-grant-directory"><h5>지급할 학생</h5><div class="ox-grant-filter-row"><label>기수<select name="cohort"><option value="">오프라인 형사법 응시자 전체</option>${cohorts.filter(c=>/^[0-9]{1,2}$/.test(c)).map(c=>`<option value="${esc(c)}" ${draft.cohort===c?'selected':''}>오프라인 ${esc(c)}기</option>`).join('')}</select></label><label>직렬<select data-grant-track disabled><option value="">전체 직렬</option></select></label><label class="ox-grant-search-field">학생 검색<input data-grant-search placeholder="이름 · 학생 번호 · 인강 아이디" maxlength="120"></label></div>
   <div class="ox-grant-picker" aria-label="지급 대상 명단">
    <div class="ox-grant-tools"><label class="ox-admin-check"><input type="checkbox" data-grant-all disabled aria-describedby="ox-grant-selection-help">조건 전체 선택</label><strong data-grant-count role="status">명단을 불러오는 중…</strong><button class="mini-btn ox-grant-clear" type="button" data-grant-none hidden disabled>선택 해제</button><button class="mini-btn ox-grant-refresh" type="button" data-grant-refresh>명단 새로고침</button></div>
    <p class="ox-grant-hint">형사법 응시 재원생만 표시합니다.</p><span id="ox-grant-selection-help" class="ox-grant-sr-only">조건 전체 선택은 학생 검색어와 관계없이 선택한 기수·직렬의 모든 형사법 응시 대상에 적용됩니다.</span><div data-grant-roster></div></div>
   </div><div class="ox-grant-compose"><h5>지급 설정</h5><div class="ox-grant-options"><div><span class="ox-grant-label">지급 영역</span><div class="ox-admin-book-choices">${books.map(([id,name])=>`<label class="ox-admin-check"><input type="checkbox" name="book" value="${id}" ${draft.collectionIds.includes(id)?'checked':''}>${name}</label>`).join('')}</div></div>
   <label>이용 기간<select name="period"><option value="enrolled">오프라인 재원 기간</option><option value="date" ${draft.expiresOn?'selected':''}>종료일 지정</option></select></label><label data-grant-date ${draft.expiresOn?'':'hidden'}>종료일<input type="date" name="expiresOn" min="${today}" value="${esc(draft.expiresOn||'')}" ${draft.expiresOn?'required':''}></label></div>
   <label>지급 사유<textarea name="reason" maxlength="500" rows="1" required placeholder="예: 오프라인 재원생 학습 지원">${esc(draft.reason)}</textarea></label>
   <div class="ox-grant-footer"><div><strong data-grant-summary>지급할 학생을 선택해주세요.</strong><small>선택한 학생에게만 1회 지급 · 신규 재원생 자동 지급 없음</small></div><button class="btn" type="submit" data-grant-review disabled>지급 내용 확인</button></div></div></fieldset></form>`,true);
  const f=host.querySelector('form');let roster=[],rosterReady=false,rosterPage=0,loadVersion=0;
  const selected=new Set(draft.studentIds),valid=()=>current===version&&f.isConnected;
  const remember=()=>{const data=new FormData(f);draft={cohort:f.elements.cohort.value,studentIds:[...selected],collectionIds:data.getAll('book'),expiresOn:data.get('period')==='date'?data.get('expiresOn'):null,reason:data.get('reason')||''};};
  function updateSummary(){const ids=[...f.querySelectorAll('[name=book]:checked')].map(c=>c.value);f.querySelector('[data-grant-summary]').textContent=selected.size?`${selected.size}명 · ${ids.length?names(ids):'지급 영역을 선택해주세요'}`:'지급할 학생을 선택해주세요.';}
  f.addEventListener('change',updateSummary);
  const scopedRoster=()=>roster.filter(s=>!trackFilter||s.track===trackFilter);
  function renderRoster(){
   const query=f.querySelector('[data-grant-search]').value.normalize('NFKC').replace(/\s/g,'').toLowerCase();
   const scope=scopedRoster();
   const matched=scope.filter(s=>[s.student_name,s.student_id,...(s.lecture_ids||[])].some(v=>String(v||'').normalize('NFKC').replace(/\s/g,'').toLowerCase().includes(query)));
   rosterPage=Math.min(rosterPage,Math.max(0,Math.ceil(matched.length/30)-1));
   f.querySelector('[data-grant-count]').textContent=`${f.elements.cohort.value?f.elements.cohort.value+'기':'오프라인 전체'}${trackFilter?' · '+trackFilter:''} ${scope.length}명 중 ${selected.size}명 선택`;
   const all=f.querySelector('[data-grant-all]');all.disabled=!rosterReady||!scope.length;all.checked=scope.length>0&&selected.size===scope.length;all.indeterminate=selected.size>0&&selected.size<scope.length;f.querySelector('[data-grant-none]').disabled=!rosterReady||!selected.size;f.querySelector('[data-grant-none]').hidden=!selected.size;
   const review=f.querySelector('[data-grant-review]');review.disabled=!rosterReady||!selected.size;review.textContent='지급 내용 확인';
   updateSummary();
   f.querySelector('[data-grant-roster]').innerHTML=`<div class="ox-grant-table-wrap"><table class="ox-grant-table"><thead><tr><th scope="col">학생</th><th scope="col">직렬</th><th scope="col">현재 이용</th></tr></thead><tbody>${matched.slice(rosterPage*30,(rosterPage+1)*30).map(s=>`<tr class="${selected.has(s.student_id)?'is-selected':''}"><td><label class="ox-grant-student-cell"><input type="checkbox" data-grant-student="${esc(s.student_id)}" ${selected.has(s.student_id)?'checked':''}><span><strong>${esc(s.student_name)}</strong><small>${esc(s.student_id)} · ${esc(s.cohort?s.cohort+'기':'기수 미지정')}</small><small>인강: ${esc(s.lecture_ids?.join(' / ')||'미등록')}</small></span></label></td><td data-label="직렬"><span>${esc(s.track)}</span><small>${esc(s.class_name)}</small></td><td data-label="현재 이용"><span>구매 ${s.purchased.length?names(s.purchased):'없음'}</span><small>이용권 ${s.granted.length?names(s.granted):'없음'}${s.blocked?' · OX 전체 중지':''}</small></td></tr>`).join('')||`<tr><td colspan="3" class="ox-grant-empty">${roster.length?'검색 결과가 없습니다.':'형사법 응시 대상이 없습니다. 학생 직렬과 과목 설정을 확인해주세요.'}</td></tr>`}</tbody></table></div><div class="ox-admin-pagination" ${matched.length<=30?'hidden':''}><button class="mini-btn" type="button" data-roster-prev ${rosterPage===0?'disabled':''}>이전</button><span>검색 ${matched.length}명 · ${rosterPage+1} / ${Math.max(1,Math.ceil(matched.length/30))} 페이지</span><button class="mini-btn" type="button" data-roster-next ${(rosterPage+1)*30>=matched.length?'disabled':''}>다음</button></div>`;
   f.querySelectorAll('[data-grant-student]').forEach(c=>c.onchange=()=>{c.checked?selected.add(c.dataset.grantStudent):selected.delete(c.dataset.grantStudent);remember();renderRoster();});
   f.querySelector('[data-roster-prev]').onclick=()=>{rosterPage--;renderRoster();};f.querySelector('[data-roster-next]').onclick=()=>{rosterPage++;renderRoster();};
  }
  async function loadRoster(){
   const request=++loadVersion,cohort=f.elements.cohort.value;rosterReady=false;
   f.querySelector('[data-grant-roster]').replaceChildren();f.querySelector('[data-grant-count]').textContent='명단을 불러오는 중…';
   for(const sel of ['[data-grant-track]','[data-grant-all]','[data-grant-none]','[data-grant-review]'])f.querySelector(sel).disabled=true;
   error({message:''});
   try{const data=await api('admin_grant_targets',{cohort});if(!valid()||request!==loadVersion)return;roster=data.items;
    const tracks=[...new Set(roster.map(s=>s.track).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ko'));
    if(trackFilter&&!tracks.includes(trackFilter)){trackFilter='';selected.clear();}
    const trackSelect=f.querySelector('[data-grant-track]');
    trackSelect.innerHTML='<option value="">전체 직렬</option>'+tracks.map(t=>`<option value="${esc(t)}" ${trackFilter===t?'selected':''}>${esc(t)}</option>`).join('');trackSelect.disabled=false;
    const available=new Set(scopedRoster().map(s=>s.student_id));for(const id of selected)if(!available.has(id))selected.delete(id);
    rosterReady=true;remember();renderRoster();
   }catch(e){if(valid()&&request===loadVersion){f.querySelector('[data-grant-count]').textContent='명단을 불러오지 못했습니다.';error(e);}}
  }
  f.elements.cohort.onchange=()=>{trackFilter='';selected.clear();rosterPage=0;f.querySelector('[data-grant-search]').value='';remember();loadRoster();};
  f.querySelector('[data-grant-track]').onchange=e=>{trackFilter=e.target.value;selected.clear();rosterPage=0;f.querySelector('[data-grant-search]').value='';remember();renderRoster();};
  f.querySelector('[data-grant-refresh]').onclick=()=>loadRoster();
  f.querySelector('[data-grant-search]').oninput=()=>{rosterPage=0;if(rosterReady)renderRoster();};
  f.querySelector('[data-grant-search]').onkeydown=e=>{if(e.key==='Enter')e.preventDefault();};
  f.querySelector('[data-grant-all]').onchange=e=>{if(e.target.checked)scopedRoster().forEach(s=>selected.add(s.student_id));else selected.clear();remember();renderRoster();};
  f.querySelector('[data-grant-none]').onclick=()=>{selected.clear();remember();renderRoster();};
  f.elements.period.onchange=()=>{const fixed=f.elements.period.value==='date';host.querySelector('[data-grant-date]').hidden=!fixed;f.elements.expiresOn.required=fixed;};
  f.onsubmit=async e=>{e.preventDefault();if(busy||!canWrite||!rosterReady)return;remember();if(!selected.size){error({message:'지급할 학생을 한 명 이상 선택해주세요.'});return;}if(!draft.collectionIds.length){error({message:'이용 영역을 한 개 이상 선택해주세요.'});return;}
   busy=true;f.querySelector('fieldset').disabled=true;
   try{const result=await api('admin_grant_preview',{...draft,reason:draft.reason.trim()});if(!valid())return;batchId=result.batchId;await detail();}catch(e){if(valid())error(e);}finally{busy=false;if(f.isConnected)f.querySelector('fieldset').disabled=!canWrite;}
  };
  host.querySelector('[data-grant-history]').onclick=()=>{remember();page=0;history();};
  loadRoster();
 }
 async function detail(){
  const current=++version;try{const data=await api('admin_grant_detail',{batchId,page});if(current!==version||!host.isConnected)return;const b=data.batch;
   shell(`<p><strong>${state(b)} · ${b.target_count}명 · ${b.cohort?esc(b.cohort)+'기':'오프라인 전체'}</strong></p><p>${names(b.collection_ids)} / ${period(b)}</p><p>사유: ${esc(b.reason)}</p><p>구매한 영역·기존 이용권이 있어도 별도 혜택으로 지급합니다. OX 전체 중지 학생의 중지 상태는 유지합니다.</p><ul class="ox-admin-member-list">${data.items.map(s=>`<li><div><strong>${esc(s.student_name)} · ${esc(s.student_id)}</strong><p>${esc(s.cohort||'기수 미지정')} ${s.cohort?'기':''} · ${esc(s.class_name)}</p><small>구매: ${s.purchased.length?names(s.purchased):'없음'} / 이용권: ${s.granted.length?names(s.granted):'없음'}${s.blocked?' / OX 전체 중지':''}</small></div></li>`).join('')}</ul><div class="ox-admin-pagination"><button class="mini-btn" data-grant-prev ${page===0?'disabled':''}>이전</button><span>${data.total}명 · ${page+1} / ${Math.max(1,Math.ceil(data.total/30))} 페이지</span><button class="mini-btn" data-grant-next ${(page+1)*30>=data.total?'disabled':''}>다음</button></div>
    ${b.state==='draft'?`<p>위 명단과 조건으로 지급합니다. 대상이 변경되거나 확인 후 10분이 지나면 다시 확인해야 합니다.</p><button class="btn" data-grant-issue ${canWrite?'':'disabled'}>${b.target_count}명에게 이용권 지급</button><button class="mini-btn" data-grant-new>명단·조건 다시 선택</button>`:b.state==='issued'?`<form data-grant-revoke><label>회수 사유<textarea name="reason" maxlength="500" rows="2" required ${canWrite?'':'disabled'}></textarea></label><p>이 지급 건 전체를 회수합니다. 다른 이용권과 교재 구매 권한은 유지됩니다.</p><button class="btn secondary" type="submit" ${canWrite?'':'disabled'}>이 지급 건 전체 회수</button></form>`:`<p>회수 사유: ${esc(b.revoke_reason)}</p>`}<button class="mini-btn" data-grant-history>지급·회수 이력</button>`);
   host.querySelector('[data-grant-prev]').onclick=()=>{page--;detail();};host.querySelector('[data-grant-next]').onclick=()=>{page++;detail();};
   host.querySelector('[data-grant-new]')?.addEventListener('click',form);
   host.querySelector('[data-grant-history]').onclick=()=>{page=0;history();};
   host.querySelector('[data-grant-issue]')?.addEventListener('click',()=>mutate('admin_grant_issue',{batchId}));
   host.querySelector('[data-grant-revoke]')?.addEventListener('submit',e=>{e.preventDefault();mutate('admin_grant_revoke',{batchId,reason:new FormData(e.target).get('reason').trim()});});
  }catch(e){error(e);}
 }
 async function mutate(action,body){if(busy||!canWrite)return;busy=true;const locked=[...host.querySelectorAll('button')].filter(b=>!b.disabled);locked.forEach(b=>b.disabled=true);try{await api(action,body);await detail();onChanged();}catch(e){error(e);}finally{busy=false;locked.filter(b=>b.isConnected).forEach(b=>b.disabled=false);}}
 async function history(){const current=++version;try{const data=await api('admin_grant_list',{page});if(current!==version||!host.isConnected)return;
  shell(`<button class="btn secondary" data-grant-new ${canWrite?'':'disabled'}>새 이용권 지급</button><h4>지급·회수 이력</h4>${data.items.map(b=>`<div class="ox-admin-book-history"><strong>${state(b)} · ${b.target_count}명 · ${names(b.collection_ids)}</strong><p>${period(b)} / ${esc(b.reason)}</p><small>${esc(b.created_by)} · ${esc(new Date(b.issued_at).toLocaleString('ko-KR'))}${b.revoked_by?' / 회수: '+esc(b.revoked_by):''}</small><button class="mini-btn" data-grant-detail="${esc(b.id)}">명단·상세 보기</button></div>`).join('')||'<p>지급 이력이 없습니다.</p>'}<div class="ox-admin-pagination"><button class="mini-btn" data-grant-prev ${page===0?'disabled':''}>이전</button><span>${data.total}건</span><button class="mini-btn" data-grant-next ${(page+1)*20>=data.total?'disabled':''}>다음</button></div>`);
  host.querySelector('[data-grant-new]').onclick=form;host.querySelectorAll('[data-grant-detail]').forEach(b=>b.onclick=()=>{batchId=b.dataset.grantDetail;page=0;detail();});host.querySelector('[data-grant-prev]').onclick=()=>{page--;history();};host.querySelector('[data-grant-next]').onclick=()=>{page++;history();};
 }catch(e){error(e);}}
 if(canWrite)form();else {shell('<p role="status">지급 이력을 불러오는 중입니다.</p>');history();}
 return {destroy:()=>{version++;}};
}
