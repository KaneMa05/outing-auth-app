import {mountWorkspace} from './interview-workspace.js?v=20261024-school-status';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pages={introduction:'자기소개',motivation:'지원동기',public_service:'공직관',core:'핵심 25제'};
const icons={home:'home',db:'question-board',writing:'study-todo',mock:'study-cafe',my:'mypage'};
const tabs=[['home','홈'],['db','DB 정리'],['writing','작성하기'],['mock','모의면접'],['my','마이']];
const mockModes={
 job:{title:'전공(직무) 시험모드'},
 personality:{title:'인성 연습모드'},
 ai:{title:'실전 모의면접 (AI)'}
};
function homeNotices(){
 return `<section class="ip-panel ip-app-notices" aria-labelledby="ip-app-notices-title"><h2 id="ip-app-notices-title">공지사항</h2><div style="line-height:1.8;overflow-wrap:anywhere"><p>(0) 오프반 : 11.9 전까지 사전과제 이행</p><p>(1) 적성 및 면접기출교재 발송일 : <strong>11.9(월)</strong><br>인강생은 인강사이트 주소로 발송, 오프라인은 현장 및 택배수령(신청시 작성 주소)<br><strong>*적성 pdf 비번 : ronpark1234 혹은 RONPARK1234</strong></p><p>(2) 인성검사 온라인검사 실시일 : <strong>11.10(화)</strong><br>인강,오프라인생 검사 문자 발송</p></div></section>`;
}
export async function mountInterviewApp(host,{request,aiRequest,account={},onExit,onLogout}){
 let destroyed=false,busy=false,child=null,generation=0,route=readRoute();
 let mockAllowed=false;
 try{mockAllowed=(await request('mock_status')).allowed===true;}catch{}
 if(route.tab==='mock'&&!mockAllowed)route={...route,tab:'home',mockMode:''};
 host.className='ip-root ip-portal ip-app-shell';
 const canLeave=()=>!busy&&(!child?.canLeave||child.canLeave());
 function readRoute(){
  const p=new URLSearchParams(location.hash.split('?')[1]||'');
  if(p.get('tab')==='preassignments')return {tab:'writing',page:'core',area:'life:basic',mockMode:''};
  const tab=tabs.some(([id])=>id===p.get('tab'))?p.get('tab'):'home';
  return {tab,notice:tab==='home'&&p.get('notice')==='preassignments'?'preassignments':'',page:Object.hasOwn(pages,p.get('page'))?p.get('page'):'introduction',area:p.get('area')||'life:basic',mockMode:Object.hasOwn(mockModes,p.get('mockMode'))?p.get('mockMode'):''};
 }
 function url(){return '#interview-prep?'+new URLSearchParams(route);}
 function remember(){saveResume();}
 function setUrl(replace=false){history[replace?'replaceState':'pushState'](null,'',url());remember();}
 async function go(next,{historyChange=false}={}){
  if(destroyed||!canLeave()){if(historyChange)setUrl(true);return;}
  if(next.tab==='mock'&&!mockAllowed)return;
  route={...route,...next};if(!historyChange)setUrl();else remember();await render();window.scrollTo({top:0,behavior:'auto'});
 }
 const link=(label,tab,page='',area='')=>`<button type="button" class="ip-app-link" data-app-tab="${tab}" ${page?`data-page="${esc(page)}"`:''} ${area?`data-area="${esc(area)}"`:''}>${esc(label)}<span aria-hidden="true">›</span></button>`;
 function assignmentArticle(){
  return `<button type="button" class="ip-btn ip-notice-back" data-app-tab="home">‹ 홈으로</button><article class="ip-panel ip-assignment-article" aria-labelledby="ip-assignment-title"><header><span class="ip-badge">수강 안내</span><h2 id="ip-assignment-title" tabindex="-1">면접반 사전과제 안내</h2><p class="ip-assignment-lead">내 경험을 정리하고, 나만의 답변을 준비하는 3단계</p></header><p>안녕하세요, 론박스터디 면접반입니다. 면접 준비의 출발점은 자신의 경험을 돌아보고, 그 경험을 질문에 맞는 답변으로 연결하는 것입니다. 아래 순서에 따라 사전과제를 진행해주세요.</p><section><h3>1. 인생그래프 인강 듣고 DB 작성하기</h3><p>먼저 인생그래프 강의를 수강하며 기억에 남는 경험과 전환점을 정리해주세요. 성공한 경험뿐 아니라 어려움을 겪거나 생각이 달라진 순간도 좋은 답변의 재료가 됩니다.</p><ul><li>기본 이력을 입력하고, 시기별로 중요한 사건과 당시의 생각을 기록합니다.</li><li>각 경험에서 내가 한 행동, 그 결과, 배운 점을 구체적으로 적습니다.</li><li>DB 정리 항목에 실제 경험을 바탕으로 내용을 채웁니다. 처음부터 완성된 문장으로 쓰기보다 사실과 핵심 내용을 충분히 남겨주세요.</li></ul>${link('나의 DB 정리하기','db')}</section><section><h3>2. 자기소개·지원동기·공직관 초안 받고 다듬기</h3><p>DB를 정리한 뒤 자기소개, 지원동기, 공직관의 초안을 받아 확인해주세요. 초안은 답변을 완성하기 위한 출발점입니다. 내 경험과 생각에 맞게 고치고, 직접 말할 수 있는 표현으로 다듬어주세요.</p><ul><li><strong>자기소개:</strong> 나의 강점이 드러나는 경험을 골라 어떤 사람인지 전달합니다.</li><li><strong>지원동기:</strong> 지원을 결심한 계기와 직무에 대한 이해를 연결합니다.</li><li><strong>공직관:</strong> 중요하게 생각하는 공직 가치와 실천 방향을 설명합니다.</li><li>사실과 다른 내용이나 과장된 표현은 수정하고, 소리 내어 읽으며 어색한 문장을 고친 뒤 저장합니다.</li></ul>${link('자기소개 작성하기','writing','introduction')}${link('지원동기 작성하기','writing','motivation')}${link('공직관 작성하기','writing','public_service')}</section><section><h3>3. 핵심 25제 인강 듣고 답변 작성 후 진단받기</h3><p>핵심 25제 강의를 수강한 뒤, 각 질문이 무엇을 묻는지 확인하고 자신의 답변을 작성해주세요. 강의 내용을 그대로 옮기기보다 본인의 판단과 경험이 드러나도록 정리하는 것이 중요합니다.</p><ul><li>질문의 핵심을 파악하고, 전달할 결론을 먼저 정리합니다.</li><li>결론을 뒷받침할 이유와 구체적인 경험을 덧붙여 답변을 작성하고 저장합니다.</li><li>작성한 답변의 진단을 받은 뒤, 부족한 근거나 설명을 보완하고 다시 저장합니다.</li></ul>${link('핵심 25제 작성하기','writing','core')}</section><aside class="ip-assignment-check"><h3>마무리 확인</h3><p>DB에 나의 경험이 구체적으로 담겼는지, 자기소개·지원동기·공직관을 내 말로 다듬었는지, 핵심 25제 답변에 진단 내용을 반영했는지 확인해주세요.</p><p>처음부터 완벽한 답변을 만들 필요는 없습니다. 먼저 작성하고, 진단과 피드백을 바탕으로 차근차근 보완해 나가세요.</p></aside></article><button type="button" class="ip-btn ip-notice-back" data-app-tab="home">홈으로 돌아가기</button>`;
 }
 function mockScreen(){
  const mode=mockModes[route.mockMode];
  if(mode)return `<button type="button" class="ip-btn ip-mock-back" data-app-mock="">‹ 모의면접 목록</button><section class="ip-panel ip-mock-coming-soon" data-mock-mode="${route.mockMode}"><span class="ip-badge">${mode.title}</span><h2>준비 중입니다.</h2><p role="status">서비스를 준비하고 있습니다.<br>조금만 기다려주세요.</p></section>`;
  return `<nav class="ip-mock-menu" aria-label="모의면접 모드 선택">${Object.entries(mockModes).map(([id,mode])=>`<button type="button" class="ip-app-link ip-mock-button" data-app-mock="${id}">${mode.title}<span aria-hidden="true">›</span></button>`).join('')}</nav>`;
 }
 async function render(){
  busy=true;const ticket=++generation;child?.destroy();child=null;
  const keepMockShell=route.tab==='mock'&&host.querySelector('[data-app-content]')?.classList.contains('ip-app-mock');
  if(!keepMockShell)host.innerHTML=`<header class="ip-app-header"><div><small>론박스터디 · 면접반</small><h1>${route.tab==='db'?'나의 DB 정리하기':tabs.find(([id])=>id===route.tab)[1]}</h1></div><span class="ip-app-mark" aria-hidden="true">R</span></header><main data-app-content><p role="status">자료를 불러오는 중…</p></main><nav class="ip-app-footer" style="grid-template-columns:repeat(${mockAllowed?5:4},minmax(0,1fr))" aria-label="면접반 하단 메뉴">${tabs.filter(([id])=>id!=='mock'||mockAllowed).map(([id,label])=>`<button type="button" data-app-tab="${id}" ${route.tab===id?'aria-current="page"':''}><span class="ip-app-icon ip-app-icon-${icons[id]}" aria-hidden="true"></span><span>${label}</span></button>`).join('')}</nav>`;
  const box=host.querySelector('[data-app-content]');
  box.classList.toggle('ip-app-mock',route.tab==='mock');
  try{
   if(route.tab==='home'&&route.notice==='preassignments'){
    box.innerHTML=assignmentArticle();
    box.querySelector('#ip-assignment-title')?.focus?.({preventScroll:true});
   }else if(['db','writing'].includes(route.tab)){
    box.classList.add('ip-app-editor',route.tab==='db'?'ip-app-db':'ip-app-writing');
    const editor=document.createElement('div');box.replaceChildren(editor);
    const next=await mountWorkspace(editor,{request,aiRequest,compactNavigation:true,initialPage:route.tab==='db'?'db':Object.hasOwn(pages,route.page)?route.page:'introduction',initialArea:route.area,onPageChange(page,area){route={...route,...(Object.hasOwn(pages,page)?{page}:{}),area};setUrl(true);}});
    if(destroyed||ticket!==generation)next.destroy();else child=next;
   }else{
    // Each mode mounts only its own controller and authenticated API.
    const [data,life,writing]=route.tab==='mock'?[]:await Promise.all(
     route.tab==='home'?[request('bootstrap'),request('life_get'),request('writing_list')]:[request('bootstrap')]);
    if(destroyed||ticket!==generation)return;
    if(route.tab==='mock'){
     const access=await request('mock_status');if(destroyed||ticket!==generation)return;
     if(access.allowed!==true){mockAllowed=false;route={...route,tab:'home',mockMode:''};setUrl(true);return await render();}
     box.innerHTML=mockScreen();
     if(route.mockMode==='job'){
      const {mountJobExam}=await import('./client/interview-job-exam.mjs?v=20261030-concepts');
      if(destroyed||ticket!==generation)return;
      const slot=document.createElement('div');box.querySelector('[data-mock-mode="job"]').replaceWith(slot);
      child=mountJobExam(slot,{accountId:account.id,request:async(action,body={})=>{
       if(aiRequest)return aiRequest('/api/interview-job-exam',{action,...body});
       const response=await fetch('/api/interview-job-exam',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...body})});
       const data=await response.json();if(!response.ok||!data.ok)throw Object.assign(Error(data.error),{code:data.error});return data;
      }});
     }
     if(route.mockMode==='personality'){
      const {mountPersonalityPractice}=await import('./client/interview-personality.mjs?v=20261029-personality');
      if(destroyed||ticket!==generation)return;
      const slot=document.createElement('div');box.querySelector('[data-mock-mode="personality"]').replaceWith(slot);
      child=mountPersonalityPractice(slot,{accountId:account.id,request:async(action,body={})=>{
       if(aiRequest)return aiRequest('/api/interview-personality',{action,...body});
       const response=await fetch('/api/interview-personality',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...body})});
       const data=await response.json();if(!response.ok||!data.ok)throw Object.assign(Error(data.error),{code:data.error});return data;
      }});
     }
     if(route.mockMode==='ai'){
      const {mountLive}=await import('./client/interview-live-view.js?v=20261029-student-live');
      if(destroyed||ticket!==generation)return;
      const slot=document.createElement('div');box.querySelector('[data-mock-mode="ai"]').replaceWith(slot);
      const next=await mountLive(slot,{request:async(action,body={})=>{
       if(aiRequest)return aiRequest('/api/interview-live',{action,...body});
       const response=await fetch('/api/interview-live',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...body})});
       const data=await response.json();if(!response.ok||!data.ok)throw Object.assign(Error(data.error),{code:data.error});return data;
      }});
      if(destroyed||ticket!==generation)next.destroy();else child=next;
     }
    }else if(route.tab==='my'){
     const m=data.member||{};
     box.innerHTML=`<section class="ip-panel ip-app-profile"><span class="ip-badge">면접반 수강 중</span><h2>${esc(account.name||'수강생')} 님</h2><dl><dt>지원 직렬</dt><dd>${esc(m.track||'—')}</dd><dt>수험번호</dt><dd>${esc(m.exam_number||'—')}</dd><dt>이용 기간</dt><dd>${esc(m.expires_on||'별도 종료일 없음')}</dd></dl></section><section class="ip-panel">${onExit?'<button class="ip-app-link" type="button" data-app-exit>기존 반으로 전환<span aria-hidden="true">›</span></button>':''}${onLogout?'<button class="ip-app-link" type="button" data-app-logout>로그아웃<span aria-hidden="true">›</span></button>':''}</section>`;
    }else{
     const notes=data.notes||[],writings=writing.writings||[],topics=data.topics||[];
     const filled=topics.filter(t=>notes.some(n=>n.topic_id===t.id&&Object.values(n.fields||{}).some(v=>String(v).trim()))).length;
     const feedback=[...(life.profile?.feedback?[{label:'기본 이력',tab:'db',area:'life:basic',text:life.profile.feedback}]:[]),...notes.filter(n=>n.feedback&&topics.some(t=>t.id===n.topic_id)).map(n=>({label:topics.find(t=>t.id===n.topic_id).title,tab:'db',area:'note:'+n.topic_id,text:n.feedback})),...writings.filter(w=>w.feedback).map(w=>({label:pages[w.kind]||'작성 답변',tab:'writing',page:w.kind,text:w.feedback}))];
     box.innerHTML=`<button type="button" class="ip-app-banner" data-app-notice="preassignments" aria-label="면접반 사전과제 안내 게시글 보기"><img src="./assets/interview-preassignment-banner-20261026.png" width="1024" height="572" fetchpriority="high" alt="론박스터디 면접반 사전과제 안내. 1. 인생그래프 인강듣고 DB 작성하기. 2. 자기소개, 지원동기, 공직관 초안받고 다듬기. 3. 핵심25제 인강듣고 답변 작성 후 진단받기."></button>${homeNotices()}<section class="ip-app-stats" aria-label="저장 현황"><div><strong>${filled}<small> / ${topics.length}</small></strong><span>인성 항목 입력</span></div><div><strong>${writings.filter(w=>w.body?.trim()).length}</strong><span>저장한 답변</span></div><div><strong>${feedback.length}</strong><span>강사 피드백</span></div></section><section class="ip-panel"><h2>나의 면접 준비</h2>${link('기본 이력과 인성 경험 정리','db')}${Object.entries(pages).map(([id,label])=>link(label+' 작성하기','writing',id)).join('')}</section><section class="ip-panel"><h2>강사 피드백</h2>${feedback.length?feedback.map(f=>`<article class="ip-app-feedback">${link(f.label,f.tab,f.page,f.area)}<p>${esc(f.text)}</p></article>`).join(''):'<p class="ip-help">아직 등록된 피드백이 없습니다.</p>'}</section>`;
    }
   }
  }catch{if(!destroyed&&ticket===generation)box.innerHTML='<section class="ip-panel"><p role="alert">자료를 불러오지 못했습니다. 연결과 수강 등록 상태를 확인해주세요.</p><button type="button" class="ip-btn" data-app-reload>다시 시도</button></section>';}
  finally{if(ticket===generation)busy=false;}
 }
 async function click(e){
  const n=e.target.closest('[data-app-notice],[data-app-tab],[data-app-mock],[data-app-exit],[data-app-logout],[data-app-reload]');if(!n||n.disabled||destroyed)return;
  if(n.dataset.appNotice==='preassignments')await go({tab:'home',notice:'preassignments'});
  else if(n.hasAttribute('data-app-mock')){const mode=n.dataset.appMock;if(mode&&!Object.hasOwn(mockModes,mode))return;await go({tab:'mock',notice:'',mockMode:mode});}
  else if(n.dataset.appTab){const next={tab:n.dataset.appTab,notice:'',mockMode:'',...(n.dataset.page?{page:n.dataset.page}:{}),...(n.dataset.area?{area:n.dataset.area}:{})};await go(next);}
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
