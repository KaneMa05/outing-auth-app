import {mountWritingBoard} from './interview-writing-board.js?v=20261024-colors';
import {writingCorrections} from './interview-writing-annotations.js?v=20261024-colors';
import {getTopicQuestions} from './interview-prep-prompts.js';
import {basicFields,basicFieldText} from './client/interview-basic-fields.js?v=20261024-school-status';
import {renderLifeGraph,experienceText} from './interview-life-graph.js?v=20261021-life-save-fix';
import {mountWriting,mountWritingHistory,writingFeedbackTitle} from './interview-writing-ui.js?v=20261024-colors';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={draft:'임시저장',submitted:'확인 대기',saved:'저장 완료 · 미제출',needs_revision:'보완 필요',approved:'확인 완료',no_experience:'도움 요청'};
const kinds={introduction:'자기소개',motivation:'지원동기',public_service:'공직관',core:'핵심 30제'};
const sections={qualifications:'자격·어학',affiliations:'소속 이력',awards:'수상·성과',experiences:'경험·인생그래프'};
const fields={
 qualifications:[['type','구분'],['date','취득·예정 시기'],['name','자격·면허·어학명'],['issuer','발급기관'],['effort','취득 노력']],
 affiliations:[['type','소속 구분'],['name','소속명'],['period','기간'],['role','직책·역할'],['activities','주요 활동']],
 awards:[['date','시기'],['name','수상·성과명'],['issuer','수여 기관'],['rank','수상 등급'],['contribution','본인 기여도 (%)'],['action','본인이 한 일']],
 experiences:[['age','당시 나이 (세)'],['satisfaction','만족도'],['title','키워드'],['content','내용'],['appeal','면접관에게 어필할 점']],
};
const date=v=>v?new Date(v).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'저장 내역 없음';
const badge=status=>`<span class="ip-badge ${esc(status)}">${esc(labels[status]||status)}</span>`;
const button=(label,action,extra='')=>`<button type="button" class="ip-btn" data-review-action="${action}" ${extra}>${label}</button>`;
const options=(rows,value)=>rows.map(([id,label])=>`<option value="${esc(id)}" ${id===value?'selected':''}>${esc(label)}</option>`).join('');
const account=s=>!s.is_active?'비활성 계정':!s.enabled?'이용 중지':s.expires_on&&s.expires_on<new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Seoul'})?'기간 만료':'이용 중';
const textFields=(pairs,values)=>`<dl class="ip-review-fields">${pairs.map(([key,label])=>`<dt>${esc(label)}</dt><dd>${esc(values[key]??'')||'<span class="ip-help">미작성</span>'}</dd>`).join('')}</dl>`;
const feedback=row=>row?.feedback?`<aside class="ip-feedback"><strong>${row.submitted_revision?writingFeedbackTitle(row):'교사 피드백'}</strong><p class="ip-review-text">${esc(row.feedback)}</p>${row.feedback_at?`<small>피드백 수정일 ${esc(date(row.feedback_at))}</small>`:''}</aside>`:'';
const failure=e=>({'unauthorized':'로그인이 만료되었습니다. 다시 로그인해주세요.','forbidden':'수강생 작성 내용을 조회할 권한이 없습니다.','student_unavailable':'해당 수강생을 찾을 수 없습니다.'}[e.code||e.message]||'작성 내용을 불러오지 못했습니다. 다시 시도해주세요.');

export function mountReview(host,options){
 let view='board',current=null;
 host.classList.add('ip-review');
 host.innerHTML='<nav class="ip-toolbar" aria-label="첨삭 관리 보기"><button type="button" class="ip-btn" data-review-view="board" aria-current="page">제출물 게시판</button><button type="button" class="ip-btn" data-review-view="students">학생별 전체 기록</button></nav><div data-review-view-content></div>';
 const content=host.querySelector('[data-review-view-content]');
 const mount=()=>{current?.destroy();current=view==='board'?mountWritingBoard(content,options):mountStudentReview(content,options);};
 host.onclick=e=>{const b=e.target.closest('[data-review-view]');if(!b||b.dataset.reviewView===view||!current.canLeave())return;e.stopPropagation();view=b.dataset.reviewView;host.querySelectorAll('[data-review-view]').forEach(n=>{if(n===b)n.setAttribute('aria-current','page');else n.removeAttribute('aria-current');});mount();};
 mount();return {ready:current.ready,canLeave:()=>current.canLeave(),destroy(){current.destroy();host.onclick=null;}};
}

export function mountStudentReview(host,{request,templates,canWrite=false,assignmentArea=null}){
 let destroyed=false,version=0,page=0,filter={search:'',track:'',status:''},roster=null,detail=null,selected='',area=assignmentArea||'all';
 let editor=null;
 const histories=new Map();
 const clearHistories=()=>{for(const h of histories.values())h.destroy();histories.clear();};
 function mountHistories(){
  for(const [el,h] of histories)if(!host.contains(el)){h.destroy();histories.delete(el);}
  for(const el of host.querySelectorAll('[data-review-rounds]'))if(!histories.has(el))histories.set(el,mountWritingHistory(el,{request,admin:true,studentId:selected,kind:el.dataset.kind,itemId:el.dataset.item}));
 }
 const canLeave=()=>!editor||editor.canLeave();
 const closeEditor=()=>{editor?.destroy();editor=null;};
 host.classList.add('ip-review');
 function listShell(){
  host.innerHTML=`<section class="ip-panel"><h3>학생 찾기</h3><p>${assignmentArea?'학생을 선택하면 선택한 과제의 기존 작성 내용과 상태를 확인합니다. 아래 목록의 건수와 상태 필터는 학생의 전체 작성 기록 기준입니다.':'학생별로 나의 DB와 모든 작성 답변을 모아봅니다.'} 임시저장과 이용 중지·기간 만료 계정의 기록도 포함합니다.</p>
   <form data-review-filter class="ip-toolbar"><label>수강생 검색<input name="search" maxlength="200" placeholder="이름 · 수험번호 · 학생 ID" value="${esc(filter.search)}"></label>
   <label>직렬<select name="track">${options([['','전체 직렬'],...['공채','항해','기관','방제','관제','기타'].map(t=>[t,t])],filter.track)}</select></label>
   <label>작성 상태<select name="status">${options([['','전체'],['pending','확인 대기'],['revision','보완·도움 요청'],['draft','임시저장 있음'],['empty','저장 내역 없음']],filter.status)}</select></label>
   <button class="ip-btn ip-primary">검색</button>${button('초기화','reset')}</form></section>
   <div data-review-roster></div><div data-review-detail></div>`;
 }
 async function loadList(){
  clearHistories();
  closeEditor();
  const current=++version;detail=null;selected='';listShell();
  const box=host.querySelector('[data-review-roster]');box.innerHTML='<p role="status">수강생 작성 현황을 불러오는 중…</p>';
  try{
   const data=await request('admin_review_students',{...filter,page});
   if(destroyed||current!==version)return;
   if(page>0&&data.total<=page*data.pageSize){page=Math.max(0,Math.ceil(data.total/data.pageSize)-1);return loadList();}
   renderRoster(data);
  }catch(e){if(!destroyed&&current===version)box.innerHTML=`<p role="alert">${esc(failure(e))}</p>${button('다시 시도','reload-list')}`;}
 }
 function renderRoster(data){
  const box=host.querySelector('[data-review-roster]');
   roster=data;
   box.innerHTML=`<div class="ip-review-summary" aria-label="검색 결과 요약"><span><strong>${data.total}</strong>명 검색 결과</span><span><strong>${data.pendingStudents}</strong>명 확인 대기</span><span><strong>${data.revisionStudents}</strong>명 보완·도움 요청</span></div>
    <p class="ip-help">최근 변경 순 · 작성 수에는 임시저장이 포함됩니다.</p>
    <div class="ip-panel ip-table-wrap"><table class="ip-review-table"><thead><tr><th>수강생</th><th>저장된 내용</th><th>확인 상태</th><th>최근 변경</th><th>조회</th></tr></thead><tbody>${data.students.map(s=>`<tr data-review-student="${esc(s.id)}"><td><strong>${esc(s.name)}</strong><small>${esc(s.track)} · 수험번호 ${esc(s.exam_number)}</small><small>${esc(s.id)} · ${esc(account(s))}</small></td>
     <td>나의 DB ${s.life_count+s.note_count}건<small>작성 답변 ${s.writing_count}건</small></td><td>확인 대기 ${s.pending_count}건<small>보완·도움 ${s.revision_count}건 · 임시저장 ${s.draft_count}건</small></td><td>${esc(date(s.updated_at))}</td>
     <td>${button('내용 보기','student',`data-id="${esc(s.id)}" aria-label="${esc(s.name)} 작성 내용 보기"`)}</td></tr>`).join('')}</tbody></table>${!data.students.length?'<p class="ip-empty">검색 조건에 맞는 수강생이 없습니다.</p>':''}</div>
    <div class="ip-toolbar">${button('이전','prev',page===0?'disabled':'')}<span>${page+1} / ${Math.max(1,Math.ceil(data.total/data.pageSize))} 페이지</span>${button('다음','next',(page+1)*data.pageSize>=data.total?'disabled':'')}${button('목록 새로고침','reload-list')}</div>`;
 }
 function record(title,row,body,extra=''){
  return `<details class="ip-review-record"><summary><span><strong>${esc(title)}</strong>${extra?`<small>${esc(extra)}</small>`:''}</span>${badge(row.status)}<small>${esc(date(row.updated_at))}</small></summary><div class="ip-review-record-body">${body}${writingCorrections(row)}${row.submitted_revision?'':feedback(row)}</div></details>`;
 }
 function dbRecords(){
  const profile=detail.profile,content=profile?.content;
  const basicValues=content?.basicInfo?Object.fromEntries(basicFields.map(([k])=>[k,basicFieldText(k,content.basicInfo[k])])):null;
  let html=assignmentArea==='life'?'':profile?record('기본 정보·주요 이력',profile,basicValues?textFields(basicFields,basicValues):textFields([['background','주요 이력·전공']],content)):'<p class="ip-help">나의 DB에 저장한 이력이 없습니다.</p>';
  if(profile)for(const [key,title] of Object.entries(sections)){
   if(assignmentArea==='basic'&&key==='experiences'||assignmentArea==='life'&&key!=='experiences')continue;
   const rows=key==='experiences'?(content[key]||[]).map(experienceText):content[key]||[];
   if(key==='experiences')html+=renderLifeGraph(rows);
   html+=record(`${title} · ${rows.length}개`,profile,
    content.none?.includes(key)?'<p>학생이 해당 없음으로 표시했습니다.</p>':rows.map((r,i)=>`<article class="ip-review-experience"><h4>${i+1}. ${esc(r.title||r.name||title)}</h4>${textFields(fields[key],r)}
     ${r.competencyIds?.length?`<p><strong>연결한 역량</strong> ${esc(r.competencyIds.map(id=>detail.competencies.find(c=>c.id===id)?.title||id).join(' · '))}</p>`:''}</article>`).join('')||'<p>아직 작성한 내용이 없습니다.</p>');
  }
  for(const n of assignmentArea?[]:detail.notes){
   const pairs=getTopicQuestions(n.topic,templates)||[];
   const keys=new Set(pairs.map(([key])=>key));
   const all=[...pairs,...Object.keys(n.fields).filter(key=>!keys.has(key)).map(key=>[key,key==='help'?'도움 요청':key])];
   html+=record(n.topic.title,n,textFields(all,n.fields),!n.topic.active?'보관된 준비 항목':n.topic_revision!==n.topic.revision?'작성 후 준비 항목이 변경됨':'인성 준비 노트');
  }
  return html||'<p class="ip-help">아직 작성한 내용이 없습니다.</p>';
 }
 function writingRecords(kind){
  const rows=detail.writings.filter(w=>w.kind===kind);
  return rows.map(w=>record(w.prompt_snapshot,{...w,status:w.submission_status||w.status},`${w.submitted_at?`<p class="ip-help">${w.submission_round||1}차 제출 답변 · ${esc(date(w.submitted_at))}</p><p class="ip-review-text">${esc(w.submitted_body)}</p>${w.body!==w.submitted_body?`<details><summary>제출 후 수정한 내용 · 아직 미제출</summary><p class="ip-review-text">${esc(w.body)}</p></details>`:''}<div data-review-rounds data-kind="${esc(w.kind)}" data-item="${esc(w.item_id)}"></div>`:`<p class="ip-review-text">${esc(w.body)||'작성 내용 없음'}</p>`}${canWrite&&w.submitted_at?button('피드백 작성','feedback',`data-kind="${esc(w.kind)}" data-item="${esc(w.item_id)}"`):''}`,kinds[kind]||kind)).join('')||'<p class="ip-empty">저장한 답변이 없습니다.</p>';
 }
 function renderDetail(){
  clearHistories();
  closeEditor();
  const s=detail.student;
  const writingKinds={...kinds,...Object.fromEntries(detail.writings.filter(w=>!kinds[w.kind]).map(w=>[w.kind,w.kind]))};
  const tabs=assignmentArea?[[assignmentArea,{basic:'기본이력',life:'인생그래프',...kinds}[assignmentArea]]]:[['all','전체'],['db','나의 DB'],...Object.entries(writingKinds)];
  host.querySelector('[data-review-detail]').innerHTML=`<section class="ip-panel ip-review-reader" tabindex="-1">
   <div class="ip-row"><div><h3>${esc(s.name)}의 작성 내용</h3><p>${esc(s.track)} · 수험번호 ${esc(s.exam_number)} · ${esc(account(s))}</p></div><div class="ip-toolbar">${button('최신 내용 불러오기','reload-detail')}${button('닫기','close')}</div></div>
   <p class="ip-help">서버에 저장된 내용을 표시합니다. 학생의 편집창에만 있는 미저장 내용은 포함되지 않습니다.</p>
   <nav class="ip-tabs ip-review-tabs" aria-label="학생 작성 영역">${tabs.map(([id,title])=>`<button type="button" class="ip-btn" data-review-action="area" data-area="${esc(id)}" ${area===id?'aria-current="page"':''}>${esc(title)}${['basic','life'].includes(id)?'':id==='db'?` (${(detail.profile?1:0)+detail.notes.length})`:id==='all'?'':` (${detail.writings.filter(w=>w.kind===id).length})`}</button>`).join('')}</nav>
   <div class="ip-toolbar">${button('모두 펼치기','expand')}${button('모두 접기','collapse')}</div>
   <div data-review-records>${['all','db','basic','life'].includes(area)?`<h4>${assignmentArea==='basic'?'기본이력':assignmentArea==='life'?'인생그래프':'나의 DB · 인생그래프·경험·준비 노트'}</h4>${['basic','life'].includes(assignmentArea)?'<p class="ip-help">기본이력과 인생그래프의 저장·확인 상태는 함께 관리됩니다.</p>':''}${dbRecords()}`:''}
    ${Object.entries(writingKinds).filter(([id])=>area==='all'||area===id).map(([id,title])=>`<section class="ip-review-group" data-review-writing-kind="${esc(id)}"><h4>${esc(title)}</h4>${writingRecords(id)}</section>`).join('')}</div><div data-review-feedback-editor></div></section>`;
  mountHistories();
 }
 async function loadDetail(id){
  clearHistories();
  closeEditor();
  const current=++version;selected=id;detail=null;
  const box=host.querySelector('[data-review-detail]');box.innerHTML='<p role="status">학생 작성 내용을 불러오는 중…</p>';
  host.querySelectorAll('[data-review-student]').forEach(row=>row.classList.toggle('is-selected',row.dataset.reviewStudent===id));
  try{
   const result=await request('admin_review_detail',{targetStudentId:id});
   if(destroyed||current!==version)return;
   detail=result;renderDetail();
   host.querySelector('.ip-review-reader').focus({preventScroll:true});
   box.scrollIntoView({block:'start',behavior:'smooth'});
  }catch(e){if(!destroyed&&current===version)box.innerHTML=`<p role="alert">${esc(failure(e))}</p>${button('다시 시도','reload-detail')}`;}
 }
 host.onsubmit=e=>{e.preventDefault();e.stopPropagation();if(!e.target.matches('[data-review-filter]')||!canLeave())return;filter=Object.fromEntries(new FormData(e.target));page=0;loadList();};
 host.onclick=e=>{
  e.stopPropagation();
  const n=e.target.closest('[data-review-action]');if(!n||n.disabled||destroyed)return;
  if(!['expand','collapse'].includes(n.dataset.reviewAction)&&!canLeave())return;
  switch(n.dataset.reviewAction){
   case 'feedback':{
    if(!canWrite||!detail)return;
    closeEditor();
    const box=host.querySelector('[data-review-feedback-editor]');
    box.innerHTML=button('피드백 창 닫기','close-feedback')+'<div data-review-writing></div>';
    editor=mountWriting(box.querySelector('[data-review-writing]'),{request,admin:true,studentId:selected,kind:n.dataset.kind,initialItemId:n.dataset.item,canWrite,onFeedbackSaved(writing){
     if(destroyed||!detail)return;
     detail.writings=detail.writings.map(w=>w.kind===writing.kind&&w.item_id===writing.item_id?writing:w);
     const group=[...host.querySelectorAll('[data-review-writing-kind]')].find(n=>n.dataset.reviewWritingKind===writing.kind);
     if(group)group.innerHTML=`<h4>${esc(kinds[writing.kind]||writing.kind)}</h4>${writingRecords(writing.kind)}`;
     mountHistories();
     // Refresh counts in place without discarding the teacher's editor.
     const id=selected,current=version;
     request('admin_review_students',{...filter,page}).then(data=>{
      if(destroyed||version!==current||selected!==id)return;
      renderRoster(data);
     }).catch(()=>{});
    }});
    box.scrollIntoView({block:'start',behavior:'smooth'});break;
   }
   case 'close-feedback':renderDetail();break;
   case 'student':area=assignmentArea||'all';loadDetail(n.dataset.id);break;
   case 'reload-detail':if(selected)loadDetail(selected);break;
   case 'reload-list':loadList();break;
   case 'reset':filter={search:'',track:'',status:''};page=0;loadList();break;
   case 'prev':if(page>0){page--;loadList();}break;
   case 'next':if(roster&&(page+1)*roster.pageSize<roster.total){page++;loadList();}break;
   case 'area':if(detail){area=n.dataset.area;renderDetail();}break;
   case 'expand':case 'collapse':host.querySelectorAll('.ip-review-record').forEach(el=>el.open=n.dataset.reviewAction==='expand');break;
   case 'close':{
    clearHistories();
    closeEditor();
    ++version;detail=null;selected='';host.querySelector('[data-review-detail]').replaceChildren();
    const row=host.querySelector('.is-selected');row?.querySelector('button')?.focus({preventScroll:true});row?.scrollIntoView({block:'center',behavior:'smooth'});
    host.querySelectorAll('.is-selected').forEach(el=>el.classList.remove('is-selected'));break;
   }
  }
 };
 host.oninput=e=>e.stopPropagation();host.onchange=e=>e.stopPropagation();
 const ready=loadList();
 return {ready,canLeave,destroy(){destroyed=true;++version;closeEditor();clearHistories();host.onclick=null;host.onsubmit=null;host.oninput=null;host.onchange=null;}};
}
