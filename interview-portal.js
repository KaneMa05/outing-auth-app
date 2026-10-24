import {mountInterviewLogin} from './interview-login.js?v=20261024-coast-login';
const host=document.querySelector('#interview-portal'),actions=document.querySelector('#portal-actions');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state,controller=null,busy=false,version=0,disposeLogin=null;
const appDisplay=()=>{let returning=false;try{returning=sessionStorage.getItem('interview-app-return')==='1';}catch{}return Boolean(new URLSearchParams(location.search).get('app')==='1'||window.matchMedia?.('(display-mode: standalone)').matches||navigator.standalone||document.referrer.startsWith('android-app://')||returning);};
const appMode=appDisplay();
if(appMode)try{sessionStorage.setItem('interview-app-return','1');}catch{}
const messages={
 unauthorized:'등록번호 또는 비밀번호를 확인해주세요. 로그인 시간이 만료되었다면 다시 로그인해주세요.',
 forbidden:'이 요청을 처리할 수 없습니다. 현재 면접반 주소에서 다시 시도해주세요.',
 account_already_linked:'이미 다른 계정에 연결되어 있습니다. 연결된 카카오 계정으로 로그인하거나 관리자에게 연결 상태를 문의해주세요.',
 oauth_state_invalid:'로그인 요청이 만료되었거나 브라우저가 바뀌었습니다. 이 화면에서 카카오 로그인을 다시 시작해주세요.',
 kakao_cancelled:'카카오 로그인을 취소했습니다.',kakao_login_failed:'카카오 로그인을 완료하지 못했습니다. 다시 시도해주세요.',
 portal_not_configured:'면접반 웹 로그인을 준비 중입니다.',kakao_not_configured:'카카오 로그인 연결을 준비 중입니다.',
 too_many_attempts:'로그인 시도가 많습니다. 15분 후 다시 시도해주세요.',
 revision_conflict:'신청 상태가 변경되었습니다. 새로 확인한 뒤 다시 제출해주세요.',
 already_enrolled:'이미 이용 등록된 계정입니다. 등록 상태를 다시 확인해주세요.',
 invalid_request:'입력 내용을 확인해주세요.',interview_unavailable:'연결하지 못했습니다. 잠시 후 다시 시도해주세요.'
};
const tell=(text,error=false)=>{const n=host.querySelector('[data-auth-message]');if(n){n.textContent=text;n.dataset.error=String(error);}};
async function api(action,payload={}){
 const response=await fetch('/api/interview-auth',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,action})});
 const data=await response.json();if(!response.ok||!data.ok)throw Object.assign(Error(data.error),{code:data.error});return data;
}
const applyForm=()=>`<form data-application-form><label>이름<input name="name" autocomplete="name" maxlength="80" required value="${esc(state.application?.name||state.account?.name||'')}"></label><label>직렬<select name="track">${['공채','항해','기관','방제','관제','기타'].map(t=>`<option ${state.application?.track===t?'selected':''}>${t}</option>`).join('')}</select></label><label>수험번호<input name="examNumber" maxlength="80" required value="${esc(state.application?.exam_number||'')}"></label><p class="ip-help">등록 신청 후 관리자가 수강 정보를 확인합니다.</p><button class="ip-btn ip-primary">${state.application?'신청 정보 수정·다시 제출':'면접반 등록 신청'}</button></form>`;
function render(){
 controller?.destroy();controller=null;
 disposeLogin?.();disposeLogin=null;
 document.body.classList.toggle('ip-login-page',!state.authenticated);
 document.body.classList.toggle('ip-coast-page',!state.authenticated);
 document.querySelector('meta[name="theme-color"]')?.setAttribute('content',state.authenticated?'#234e83':'#050f1c');
 document.body.classList.toggle('ip-portal-app',appMode&&state.available===true);
 if(appMode&&state.authenticated)try{localStorage.setItem('outing-interview-web-app','1');}catch{}
 actions.innerHTML=state.authenticated?'<button type="button" data-logout>로그아웃</button>':'';
 if(!state.authenticated){
  disposeLogin=mountInterviewLogin(host,state);
  return;
 }
 host.innerHTML='<p class="ip-auth-message" data-auth-message role="status"></p><div data-portal-content></div>';
 const box=host.querySelector('[data-portal-content]');
 if(state.available){
  box.innerHTML='<p role="status">면접 준비 화면을 불러오는 중…</p>';
  const current=++version;
  return import(appMode?'./interview-app-ui.js?v=20261024-mock-coming-soon':'./interview-workspace.js?v=20261024-basic-save').then(async module=>{
   if(current!==version)return;
   const view=await (appMode?module.mountInterviewApp:module.mountWorkspace)(box,{account:{id:state.account.ownerId,name:state.account.name},onLogout:async()=>{await api('logout');try{localStorage.removeItem('outing-interview-web-app');sessionStorage.removeItem('interview-app-return');}catch{}++version;controller?.destroy();controller=null;await refresh();},onExit:appMode&&state.account.legacy===true?async()=>{try{localStorage.removeItem('outing-interview-web-app');localStorage.setItem('outing-student-mode:'+state.account.ownerId,'standard');sessionStorage.removeItem('interview-app-return');}catch{}location.assign('/index.html#home');}:undefined,request:async(action,payload={})=>{
    const r=await fetch('/api/interview-prep',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,action})});
    const d=await r.json();if(!r.ok||!d.ok)throw Object.assign(Error(d.error),{code:d.error});return d;
   },aiRequest:async(url,body)=>{
    const r=await fetch(url,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const d=await r.json();if(!r.ok||!d.ok)throw Object.assign(Error(d.error),{code:d.error});return d;
   }});
   if(current!==version)view.destroy();else controller=view;
  }).catch(()=>{if(current===version)box.innerHTML='<p role="alert">화면을 불러오지 못했습니다.</p><button class="ip-btn" type="button" data-refresh>다시 시도</button>';});
 }else if(!state.account.ownerId){
  box.innerHTML=`<section class="ip-panel ip-portal-status"><h2>면접반 등록</h2>${applyForm()}</section>`;
 }else{
  const app=state.application;
  const registered=state.member?.enabled&&(!state.member.expires_on||state.member.expires_on>=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Seoul'}));
  box.innerHTML=`<section class="ip-panel ip-portal-status"><span class="ip-application-status">${registered?'이용 등록 완료':app?({pending:'관리자 승인 대기',rejected:'신청 보완 필요',approved:'이용 기간·등록 확인 필요'})[app.status]:'면접반 신청'}</span>
   <h2>${registered?'면접반 운영 준비 중입니다.':app?.status==='pending'?'수강 신청을 확인하고 있습니다.':'면접반 등록'}</h2>
   ${registered?'<p>수강 등록은 확인되었습니다. 관리자가 학습 공간을 개방하면 이용할 수 있습니다.</p>':app?.status==='pending'?'<p>관리자가 수강 등록을 확인하면 이용할 수 있습니다. ‘등록 상태 확인’으로 승인 결과를 확인해주세요.</p>':''}
   ${app?.review_note?`<div class="ip-feedback"><strong>관리자 안내</strong><br>${esc(app.review_note)}</div>`:''}
   ${!registered?(app?.status==='pending'?`<p>${esc(app.name)} · ${esc(app.track)} · 수험번호 ${esc(app.exam_number)}</p><details><summary>신청 정보 수정</summary>${applyForm()}</details>`:applyForm()):''}
   <button class="ip-btn" type="button" data-refresh>등록 상태 확인</button></section>`;
 }
}
async function refresh(){
 const current=++version;
 const r=await fetch('/api/interview-auth?action=session',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000)});
 const data=await r.json();if(!r.ok||!data.ok)throw Object.assign(Error(data.error),{code:data.error});
 if(current!==version)return;
 state=data;await render();
}
async function run(task){
 if(busy)return;busy=true;
 const controls=[...document.querySelectorAll('button')].map(n=>[n,n.disabled]);controls.forEach(([n])=>n.disabled=true);
 try{await task();}catch(e){tell(messages[e.code||e.message]||messages.interview_unavailable,true);}
 finally{busy=false;controls.forEach(([n,disabled])=>{if(n.isConnected)n.disabled=disabled;});}
}
document.addEventListener('click',e=>{
 const n=e.target.closest('[data-kakao],[data-refresh],[data-logout]');if(!n||n.disabled)return;
 run(async()=>{
  if(controller?.canLeave&&!controller.canLeave())return;
  if(n.hasAttribute('data-kakao')){const d=await api('kakao_start',{intent:n.dataset.kakao});location.assign(d.url);}
  else if(n.hasAttribute('data-logout')){await api('logout');try{localStorage.removeItem('outing-interview-web-app');sessionStorage.removeItem('interview-app-return');}catch{}++version;controller?.destroy();controller=null;host.replaceChildren();await refresh();}
  else await refresh();
 });
});
host.addEventListener('submit',e=>{
 if(!e.target.matches('[data-application-form]'))return;
 e.preventDefault();const f=new FormData(e.target);
 run(async()=>{
  await api('apply',{name:f.get('name'),track:f.get('track'),examNumber:f.get('examNumber'),revision:state.application?.revision||0});
  await refresh();
 });
});
refresh().then(()=>{
 const url=new URL(location.href),code=url.searchParams.get('auth_error');
 if(code){tell(messages[code]||messages.interview_unavailable,true);history.replaceState(null,'','/interview');}
}).catch(()=>{
 disposeLogin?.();disposeLogin=mountInterviewLogin(host,{retry:true});
}).finally(()=>window.__appStartup?.finish());
