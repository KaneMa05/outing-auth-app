import {interviewTracks} from './client/interview-tracks.js?v=20261102-source-tracks';
import {interviewProducts,interviewProductLabel} from './client/interview-products.js?v=20261110-products';
import {mountInterviewLogin} from './interview-login.js?v=20261109-apple-button';
const host=document.querySelector('#interview-portal'),actions=document.querySelector('#portal-actions');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state,controller=null,busy=false,version=0,disposeLogin=null;
const appDisplay=()=>{let returning=false;try{returning=sessionStorage.getItem('interview-app-return')==='1';}catch{}return Boolean(new URLSearchParams(location.search).get('app')==='1'||window.matchMedia?.('(display-mode: standalone)').matches||navigator.standalone||document.referrer.startsWith('android-app://')||returning);};
const appMode=appDisplay();
if(appMode)try{sessionStorage.setItem('interview-app-return','1');}catch{}
const messages={
 unauthorized:'등록번호 또는 비밀번호를 확인해주세요. 로그인 시간이 만료되었다면 다시 로그인해주세요.',
 forbidden:'이 요청을 처리할 수 없습니다. 현재 면접반 주소에서 다시 시도해주세요.',
 account_already_linked:'이미 다른 계정에 연결되어 있습니다. 기존 로그인 방식으로 다시 로그인하거나 관리자에게 연결 상태를 문의해주세요.',
 oauth_state_invalid:'로그인 요청이 만료되었거나 브라우저가 바뀌었습니다. 이 화면에서 로그인을 다시 시작해주세요.',
 kakao_cancelled:'카카오 로그인을 취소했습니다.',kakao_login_failed:'카카오 로그인을 완료하지 못했습니다. 다시 시도해주세요.',
 apple_cancelled:'Apple 로그인을 취소했습니다.',apple_login_failed:'Apple 로그인을 완료하지 못했습니다. 이 화면에서 다시 시도해주세요.',
 apple_not_configured:'Apple 로그인 연결을 준비 중입니다.',
 portal_not_configured:'면접반 웹 로그인을 준비 중입니다.',kakao_not_configured:'카카오 로그인 연결을 준비 중입니다.',
 too_many_attempts:'로그인 시도가 많습니다. 15분 후 다시 시도해주세요.',
 revision_conflict:'신청 상태가 변경되었습니다. 새로 확인한 뒤 다시 제출해주세요.',
 already_enrolled:'이미 이용 등록된 계정입니다. 등록 상태를 다시 확인해주세요.',
 invalid_request:'입력 내용을 확인해주세요.',interview_unavailable:'연결하지 못했습니다. 잠시 후 다시 시도해주세요.'
};
const tell=(text,error=false)=>{const n=host.querySelector('[data-auth-message]');if(n){n.textContent=text;n.dataset.error=String(error);}};
async function api(action,payload={},endpoint='/api/interview-auth'){
 const response=await fetch(endpoint,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,action})});
 const data=await response.json();if(!response.ok||!data.ok)throw Object.assign(Error(data.error),{code:data.error});return data;
}
const applyForm=()=>`<form data-application-form><label>수강 상품<select name="accessProduct" required>${interviewProducts.map(([id,label])=>`<option value="${id}" ${(state.application?.access_product||'interview_package')===id?'selected':''}>${label}</option>`).join('')}</select></label><p class="ip-help">인적성 단과는 적성 모의고사를 이용할 수 있습니다. 면접 준비 기능은 면접 패키지 구매 후 이용할 수 있습니다.</p><label>이름<input name="name" autocomplete="name" maxlength="80" required value="${esc(state.application?.name||state.account?.name||'')}"></label><label>직렬<select name="track">${interviewTracks.map(t=>`<option ${state.application?.track===t?'selected':''}>${t}</option>`).join('')}</select></label><label>수험번호<input name="examNumber" maxlength="80" required value="${esc(state.application?.exam_number||'')}"></label><p class="ip-help">등록 신청 후 관리자가 구매한 수강 상품을 확인하고 승인합니다.</p><button class="ip-btn ip-primary">${state.application?.status==='rejected'?'재신청':state.application?'신청 정보 수정·다시 제출':'수강 등록 신청'}</button></form>`;
function render(){
 controller?.destroy();controller=null;
 disposeLogin?.();disposeLogin=null;
 document.body.classList.toggle('ip-login-page',!state.authenticated);
 document.body.classList.toggle('ip-coast-page',!state.authenticated);
 document.querySelector('meta[name="theme-color"]')?.setAttribute('content',state.authenticated?'#234e83':'#050f1c');
 document.body.classList.toggle('ip-portal-app',appMode&&state.available===true);
 if(appMode&&state.authenticated)try{localStorage.setItem('outing-interview-web-app','1');}catch{}
 actions.innerHTML=state.authenticated?`${state.account?.ownerId&&state.appleEnabled&&!state.account.appleLinked?'<button type="button" data-apple="link">Apple 계정 연결</button>':''}${state.account?.ownerId&&state.kakaoEnabled&&!state.account.kakaoLinked?'<button type="button" data-kakao="link">카카오 계정 연결</button>':''}<button type="button" data-student-entry>수강생 화면</button><button type="button" data-logout>로그아웃</button>`:'';
 if(!state.authenticated){
  disposeLogin=mountInterviewLogin(host,state);
  return;
 }
 host.innerHTML='<p class="ip-auth-message" data-auth-message role="status"></p><div data-portal-content></div>';
 const box=host.querySelector('[data-portal-content]');
 if(state.available){
  const useApp=appMode||state.member?.access_product==='aptitude_only';
  box.innerHTML='<p role="status">면접 준비 화면을 불러오는 중…</p>';
  const current=++version;
  return import(useApp?'./interview-app-ui.js?v=20261111-ai-retry':'./interview-workspace.js?v=20261111-ai-retry').then(async module=>{
   if(current!==version)return;
   const view=await (useApp?module.mountInterviewApp:module.mountWorkspace)(box,{account:{id:state.account.ownerId,name:state.account.name,accessProduct:state.member?.access_product,canLinkApple:state.appleEnabled&&!state.account.appleLinked,canLinkKakao:state.kakaoEnabled&&!state.account.kakaoLinked},onLogout:async()=>{await api('logout');try{localStorage.removeItem('outing-interview-web-app');sessionStorage.removeItem('interview-app-return');}catch{}++version;controller?.destroy();controller=null;await refresh();},onExit:appMode?async()=>{try{localStorage.removeItem('outing-interview-web-app');sessionStorage.removeItem('interview-app-return');}catch{}location.assign('/index.html?entry=student#home');}:undefined,request:async(action,payload={})=>{
    const r=await fetch('/api/interview-prep',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,action})});
    const d=await r.json();if(!r.ok||!d.ok)throw Object.assign(Error(d.error),{code:d.error});return d;
   },aiRequest:async(url,body)=>{
    const r=await fetch(url,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const d=await r.json();if(!r.ok||!d.ok)throw Object.assign(Error(d.error),{code:d.error,retryReason:d.retryReason});return d;
   }});
   if(current!==version)view.destroy();else controller=view;
  }).catch(()=>{if(current===version)box.innerHTML='<p role="alert">화면을 불러오지 못했습니다.</p><button class="ip-btn" type="button" data-refresh>다시 시도</button>';});
 }else if(!state.account.ownerId){
  box.innerHTML=`<section class="ip-panel ip-portal-status"><h2>면접반 수강 정보 확인</h2><p>다른 로그인 방식으로 이용하던 계정이 있다면 해당 계정으로 로그인한 뒤 마이에서 새 로그인 계정을 연결해주세요.</p><button class="ip-btn" type="button" data-logout>다른 계정으로 로그인</button><form data-link-student-form><p>기존 등록번호가 있다면 수강 정보와 학습 기록을 연결해주세요.</p><label>등록번호<input name="studentId" autocomplete="username" maxlength="120" required></label><label>비밀번호<input name="password" type="password" autocomplete="current-password" maxlength="200" required></label><button class="ip-btn ip-primary">기존 수강 정보 연결</button></form><hr><h3>등록번호가 없나요?</h3>${applyForm()}</section>`;
 }else{
  const app=state.application;
  const registered=state.member?.enabled&&(!state.member.expires_on||state.member.expires_on>=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Seoul'}));
  box.innerHTML=`<section class="ip-panel ip-portal-status"><span class="ip-application-status">${registered?'이용 등록 완료':app?({pending:'관리자 승인 대기',rejected:'수강 신청 반려',approved:'이용 기간·등록 확인 필요'})[app.status]:'면접반 신청'}</span>
   <h2>${registered?'면접반 운영 준비 중입니다.':app?.status==='pending'?'수강 신청을 확인하고 있습니다.':'면접반 등록'}</h2>
   ${registered?'<p>수강 등록은 확인되었습니다. 관리자가 학습 공간을 개방하면 이용할 수 있습니다.</p>':app?.status==='pending'?'<p>관리자가 수강 등록을 확인하면 이용할 수 있습니다. ‘등록 상태 확인’으로 승인 결과를 확인해주세요.</p>':''}
   ${app?.review_note?`<div class="ip-feedback"><strong>${app.status==='rejected'?'반려 사유':'관리자 안내'}</strong><br>${esc(app.review_note)}</div>`:''}
   ${app?.status==='rejected'?'<p>반려 사유를 확인하고 신청 정보를 수정한 뒤 <strong>재신청</strong>을 눌러주세요. 재신청 전까지 반려 상태가 유지됩니다.</p>':''}
   ${!registered?(app?.status==='pending'?`<p>${esc(interviewProductLabel(app.access_product))} · ${esc(app.name)} · ${esc(app.track)} · 수험번호 ${esc(app.exam_number)}</p><details><summary>신청 정보 수정</summary>${applyForm()}</details>`:applyForm()):''}
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
 const n=e.target.closest('[data-kakao],[data-apple],[data-refresh],[data-logout],[data-student-entry]');if(!n||n.disabled)return;
 run(async()=>{
  if(controller?.canLeave&&!controller.canLeave())return;
  if(n.hasAttribute('data-student-entry')){
   try{localStorage.removeItem('outing-interview-web-app');sessionStorage.removeItem('interview-app-return');}catch{}
   location.assign('/index.html?entry=student#home');
  }
  else if(n.hasAttribute('data-apple')){const d=await api('start',{intent:n.dataset.apple},'/api/interview-apple');location.assign(d.url);}
  else if(n.hasAttribute('data-kakao')){const d=await api('kakao_start',{intent:n.dataset.kakao});location.assign(d.url);}
  else if(n.hasAttribute('data-logout')){await api('logout');try{localStorage.removeItem('outing-interview-web-app');sessionStorage.removeItem('interview-app-return');}catch{}++version;controller?.destroy();controller=null;host.replaceChildren();await refresh();}
  else await refresh();
 });
});
host.addEventListener('submit',e=>{
 if(e.target.matches('[data-link-student-form]')){
  e.preventDefault();const f=new FormData(e.target);
  run(async()=>{await api('legacy_login',{studentId:f.get('studentId'),password:f.get('password'),intent:'link'});await refresh();});return;
 }
 if(!e.target.matches('[data-application-form]'))return;
 e.preventDefault();const f=new FormData(e.target);
 run(async()=>{
  await api('apply',{name:f.get('name'),track:f.get('track'),examNumber:f.get('examNumber'),accessProduct:f.get('accessProduct'),revision:state.application?.revision||0});
  await refresh();
 });
});
refresh().then(()=>{
 const url=new URL(location.href),code=url.searchParams.get('auth_error');
 if(code){tell(messages[code]||messages.interview_unavailable,true);history.replaceState(null,'','/interview');}
}).catch(()=>{
 disposeLogin?.();disposeLogin=mountInterviewLogin(host,{retry:true});
}).finally(()=>window.__appStartup?.finish());
