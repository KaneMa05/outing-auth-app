import {mountWorkspace} from './interview-workspace.js?v=20261024-basic-save';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pages={introduction:'자기소개',motivation:'지원동기',public_service:'공직관',core:'핵심 25제'};
const icons={home:'home',db:'question-board',writing:'study-todo',mock:'study-cafe',my:'mypage'};
const tabs=[['home','홈'],['db','DB 정리'],['writing','작성하기'],['mock','모의면접'],['my','마이']];
const mockModes={
 job:{title:'전공(직무) 시험모드'},
 personality:{title:'인성 연습모드'},
 ai:{title:'실전 모의면접 (AI)'}
};
export async function mountInterviewApp(host,{request,aiRequest,account={},onExit,onLogout}){
 let destroyed=false,busy=false,child=null,generation=0,route=readRoute();
 host.className='ip-root ip-portal ip-app-shell';
 const canLeave=()=>!busy&&(!child?.canLeave||child.canLeave());
 function readRoute(){
  const p=new URLSearchParams(location.hash.split('?')[1]||'');
  if(p.get('tab')==='preassignments')return {tab:'writing',page:'core',area:'life:basic',mockMode:''};
  const tab=tabs.some(([id])=>id===p.get('tab'))?p.get('tab'):'home';
  return {tab,page:Object.hasOwn(pages,p.get('page'))?p.get('page'):'introduction',area:p.get('area')||'life:basic',mockMode:Object.hasOwn(mockModes,p.get('mockMode'))?p.get('mockMode'):''};
 }
 function url(){return '#interview-prep?'+new URLSearchParams(route);}
 function remember(){saveResume();}
 function setUrl(replace=false){history[replace?'replaceState':'pushState'](null,'',url());remember();}
 async function go(next,{historyChange=false}={}){
  if(destroyed||!canLeave()){if(historyChange)setUrl(true);return;}
  route={...route,...next};if(!historyChange)setUrl();else remember();await render();window.scrollTo({top:0,behavior:'auto'});
 }
 const link=(label,tab,page='',area='')=>`<button type="button" class="ip-app-link" data-app-tab="${tab}" ${page?`data-page="${esc(page)}"`:''} ${area?`data-area="${esc(area)}"`:''}>${esc(label)}<span aria-hidden="true">›</span></button>`;
 function mockScreen(){
  const mode=mockModes[route.mockMode];
  if(mode)return `<button type="button" class="ip-btn ip-mock-back" data-app-mock="">‹ 모의면접 목록</button><section class="ip-panel ip-mock-coming-soon" data-mock-mode="${route.mockMode}"><span class="ip-badge">${mode.title}</span><h2>준비 중입니다.</h2><p role="status">서비스를 준비하고 있습니다.<br>조금만 기다려주세요.</p></section>`;
  return `<nav class="ip-mock-menu" aria-label="모의면접 모드 선택">${Object.entries(mockModes).map(([id,mode])=>`<button type="button" class="ip-app-link ip-mock-button" data-app-mock="${id}">${mode.title}<span aria-hidden="true">›</span></button>`).join('')}</nav>`;
 }
 async function render(){
  busy=true;const ticket=++generation;child?.destroy();child=null;
  const keepMockShell=route.tab==='mock'&&host.querySelector('[data-app-content]')?.classList.contains('ip-app-mock');
  if(!keepMockShell)host.innerHTML=`<header class="ip-app-header"><div><small>론박스터디 · 면접반</small><h1>${route.tab==='db'?'나의 DB 정리하기':tabs.find(([id])=>id===route.tab)[1]}</h1></div><span class="ip-app-mark" aria-hidden="true">R</span></header><main data-app-content><p role="status">자료를 불러오는 중…</p></main><nav class="ip-app-footer" aria-label="면접반 하단 메뉴">${tabs.map(([id,label])=>`<button type="button" data-app-tab="${id}" ${route.tab===id?'aria-current="page"':''}><span class="ip-app-icon ip-app-icon-${icons[id]}" aria-hidden="true"></span><span>${label}</span></button>`).join('')}</nav>`;
  const box=host.querySelector('[data-app-content]');
  box.classList.toggle('ip-app-mock',route.tab==='mock');
  try{
   if(['db','writing'].includes(route.tab)){
    box.classList.add('ip-app-editor',route.tab==='db'?'ip-app-db':'ip-app-writing');
    const editor=document.createElement('div');box.replaceChildren(editor);
    const next=await mountWorkspace(editor,{request,aiRequest,compactNavigation:true,initialPage:route.tab==='db'?'db':route.page,initialArea:route.area,onPageChange(page,area){route={...route,page,area};setUrl(true);}});
    if(destroyed||ticket!==generation)next.destroy();else child=next;
   }else{
    // Mock modes show a static notice without starting interviews or requesting microphone access.
    const [data,life,writing]=route.tab==='mock'?[]:await Promise.all(
     route.tab==='home'?[request('bootstrap'),request('life_get'),request('writing_list')]:[request('bootstrap')]);
    if(destroyed||ticket!==generation)return;
    if(route.tab==='mock'){
     box.innerHTML=mockScreen();
    }else if(route.tab==='my'){
     const m=data.member||{};
     box.innerHTML=`<section class="ip-panel ip-app-profile"><span class="ip-badge">면접반 수강 중</span><h2>${esc(account.name||'수강생')} 님</h2><dl><dt>지원 직렬</dt><dd>${esc(m.track||'—')}</dd><dt>수험번호</dt><dd>${esc(m.exam_number||'—')}</dd><dt>이용 기간</dt><dd>${esc(m.expires_on||'별도 종료일 없음')}</dd></dl></section><section class="ip-panel">${onExit?'<button class="ip-app-link" type="button" data-app-exit>기존 반으로 전환<span aria-hidden="true">›</span></button>':''}${onLogout?'<button class="ip-app-link" type="button" data-app-logout>로그아웃<span aria-hidden="true">›</span></button>':''}</section>`;
    }else{
     const notes=data.notes||[],writings=writing.writings||[],topics=data.topics||[];
     const filled=topics.filter(t=>notes.some(n=>n.topic_id===t.id&&Object.values(n.fields||{}).some(v=>String(v).trim()))).length;
     const feedback=[...(life.profile?.feedback?[{label:'기본 이력',tab:'db',area:'life:basic',text:life.profile.feedback}]:[]),...notes.filter(n=>n.feedback&&topics.some(t=>t.id===n.topic_id)).map(n=>({label:topics.find(t=>t.id===n.topic_id).title,tab:'db',area:'note:'+n.topic_id,text:n.feedback})),...writings.filter(w=>w.feedback).map(w=>({label:pages[w.kind]||'작성 답변',tab:'writing',page:w.kind,text:w.feedback}))];
     let last;try{last=JSON.parse(localStorage.getItem('outing-interview-last-editor:'+account.id)||'null');}catch{}
     const resume=last&&['db','writing'].includes(last.tab)?last:{tab:'db',area:'life:basic'};
     box.innerHTML=`<section class="ip-app-welcome"><small>오늘도 한 걸음씩</small><h2>나의 경험이<br>나만의 답변이 됩니다.</h2><p>${esc(account.name||'수강생')} 님, 준비한 이야기를 이어서 정리해보세요.</p>${link('이어서 작성하기',resume.tab,resume.page,resume.area)}</section><section class="ip-app-stats" aria-label="저장 현황"><div><strong>${filled}<small> / ${topics.length}</small></strong><span>인성 항목 입력</span></div><div><strong>${writings.filter(w=>w.body?.trim()).length}</strong><span>저장한 답변</span></div><div><strong>${feedback.length}</strong><span>강사 피드백</span></div></section><section class="ip-panel"><h2>나의 면접 준비</h2>${link('기본 이력과 인성 경험 정리','db')}${Object.entries(pages).map(([id,label])=>link(label+' 작성하기','writing',id)).join('')}</section><section class="ip-panel"><h2>강사 피드백</h2>${feedback.length?feedback.map(f=>`<article class="ip-app-feedback">${link(f.label,f.tab,f.page,f.area)}<p>${esc(f.text)}</p></article>`).join(''):'<p class="ip-help">아직 등록된 피드백이 없습니다.</p>'}</section>`;
    }
   }
  }catch{if(!destroyed&&ticket===generation)box.innerHTML='<section class="ip-panel"><p role="alert">자료를 불러오지 못했습니다. 연결과 수강 등록 상태를 확인해주세요.</p><button type="button" class="ip-btn" data-app-reload>다시 시도</button></section>';}
  finally{if(ticket===generation)busy=false;}
 }
 async function click(e){
  const n=e.target.closest('[data-app-tab],[data-app-mock],[data-app-exit],[data-app-logout],[data-app-reload]');if(!n||n.disabled||destroyed)return;
  if(n.hasAttribute('data-app-mock')){const mode=n.dataset.appMock;if(mode&&!Object.hasOwn(mockModes,mode))return;await go({tab:'mock',mockMode:mode});}
  else if(n.dataset.appTab){const next={tab:n.dataset.appTab,mockMode:'',...(n.dataset.page?{page:n.dataset.page}:{}),...(n.dataset.area?{area:n.dataset.area}:{})};await go(next);}
  else if(n.hasAttribute('data-app-reload')){if(canLeave())await render();}
  else if(canLeave()){busy=true;n.disabled=true;try{await (n.hasAttribute('data-app-exit')?onExit:onLogout)?.();}catch{if(!destroyed){n.disabled=false;const msg=document.createElement('p');msg.setAttribute('role','alert');msg.textContent='처리하지 못했습니다. 연결을 확인하고 다시 시도해주세요.';n.after(msg);}}finally{busy=false;}}
 }
 function saveResume(){if(['db','writing'].includes(route.tab))try{localStorage.setItem('outing-interview-last-editor:'+account.id,JSON.stringify(route));}catch{}}
 const pop=()=>go(readRoute(),{historyChange:true});
 const keyboard=()=>{const v=window.visualViewport;host.classList.toggle('ip-keyboard-open',!!v&&window.innerHeight-v.height>140&&host.contains(document.activeElement)&&document.activeElement.matches('input,textarea,select'));};
 const rememberClick=()=>saveResume();
 host.addEventListener('click',click);host.addEventListener('input',rememberClick);window.addEventListener('hashchange',pop);window.addEventListener('popstate',pop);window.visualViewport?.addEventListener('resize',keyboard);
 setUrl(true);await render();
 return {canLeave,destroy(){destroyed=true;++generation;saveResume();child?.destroy();host.removeEventListener('click',click);host.removeEventListener('input',rememberClick);window.removeEventListener('hashchange',pop);window.removeEventListener('popstate',pop);window.visualViewport?.removeEventListener('resize',keyboard);host.replaceChildren();}};
}
