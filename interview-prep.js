/* Loaded only by the existing app shell; all personal data comes from authenticated API. */
async function isInterviewPreviewCandidate(studentId) {
  const hashes = window.OUTING_APP_CONFIG?.interviewPreviewStudentHashes;
  if (!studentId || !Array.isArray(hashes) || !hashes.length || !globalThis.crypto?.subtle) return false;
  try {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('interview-preview-v1:' + studentId));
    const hash = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
    return hashes.includes(hash);
  } catch { return false; }
}

async function requestInterviewPrep(action, payload = {}, credentials = null) {
  const student = APP_MODE === 'teacher' ? null : getAuthedStudent();
  const profile = student ? getStudentProfile(student.id) : null;
  if (APP_MODE !== 'teacher' && (!student || (credentials &&
    (credentials.id !== student.id || credentials.token !== profile?.deviceToken)))) {
    throw Object.assign(new Error('unauthorized'), {code:'unauthorized'});
  }
  const response = await fetch('/api/interview-prep', {
    method:'POST', headers:{'Content-Type':'application/json'}, credentials:student?'omit':'same-origin',
    body:JSON.stringify({...payload,action,...(student?{
      studentId:student.id,deviceToken:profile?.deviceToken,
      client:{displayMode:isStandaloneStudentApp()?'standalone':'browser',userAgent:navigator.userAgent},
    }:{})}),
  });
  const data = await response.json();
  if(!response.ok || !data.ok) throw Object.assign(new Error(data.error || 'interview_unavailable'),{code:data.error});
  return data;
}

function renderInterviewPrepEntry() {
  if(APP_MODE==='teacher')return null;
  const student=getAuthedStudent(),token=getStudentProfile(student?.id)?.deviceToken;
  if(!student||!token)return null;
  if(!window.OUTING_APP_CONFIG?.interviewPreviewStudentHashes?.length)return null;
  const link=el('div');
  link.hidden=true;link.style.display='none';
  const key=student.id+':'+token, cached=renderInterviewPrepEntry.cache;
  const promise=cached?.key===key&&cached.expires>Date.now()?cached.promise:
    isInterviewPreviewCandidate(student.id).then(allowed=>allowed ?
      requestInterviewPrep('status',{}, {id:student.id,token}) : {enabled:false});
  renderInterviewPrepEntry.cache={key,promise,expires:Date.now()+60000};
  promise.then(data=>{
    if(getAuthedStudent()?.id!==student.id||getStudentProfile(student.id)?.deviceToken!==token)return;
    if(data.enabled!==true)return;
    link.replaceChildren(button('면접반 모드로 전환','student-history-button-card student-settings-link','button',()=>{
      try{localStorage.setItem('outing-student-mode:'+student.id,'interview');}catch{}
      prepareInterviewAppEntry.cache={key,state:'ready',enabled:true};navigate('interview-prep');
    }));
    link.hidden=false;link.style.display='';
  }).catch(()=>{});
  return link;
}

// Mode preference only chooses a shell. APIs still verify enrollment and credentials.
function isInterviewStudentMode(){
  if(APP_MODE==='teacher'||!isStandaloneStudentApp())return false;
  const student=getAuthedStudent(),token=getStudentProfile(student?.id)?.deviceToken;
  const cache=prepareInterviewAppEntry.cache;
  try{return !!student&&cache?.key===student.id+':'+token&&cache.enabled===true&&localStorage.getItem('outing-student-mode:'+student.id)==='interview';}catch{return false;}
}
function prepareInterviewAppEntry(){
  if(APP_MODE==='teacher'||!isStandaloneStudentApp())return null;
  let web=false;try{web=localStorage.getItem('outing-interview-web-app')==='1';}catch{}
  if(web&&!prepareInterviewAppEntry.webChecked){
    let cache=prepareInterviewAppEntry.web;
    if(!cache){
      cache={state:'loading'};prepareInterviewAppEntry.web=cache;
      fetch('/api/interview-auth?action=session',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(10000)}).then(async r=>{
        const d=await r.json();if(!r.ok||!d.ok)throw Error('session_failed');
        if(d.authenticated){location.replace('/interview?app=1');return;}
        try{localStorage.removeItem('outing-interview-web-app');}catch{}
        prepareInterviewAppEntry.webChecked=true;render();
      }).catch(()=>{cache.state='error';render();});
    }
    document.body.classList.add('student-interview-app-mode');
    return el('section',{className:'ip-app-shell','data-startup-pending':String(cache.state==='loading')},[el('p',{role:'status'},cache.state==='error'?'로그인 상태를 확인하지 못했습니다. 연결을 확인해주세요.':'면접반 로그인 상태를 확인하는 중…'),...(cache.state==='error'?[button('다시 시도','btn','button',()=>{prepareInterviewAppEntry.web=null;render();})]:[])]);
  }
  const student=getAuthedStudent(),token=getStudentProfile(student?.id)?.deviceToken;
  let saved=false;try{saved=localStorage.getItem('outing-student-mode:'+student?.id)==='interview';}catch{}
  if(!student||!token||!saved)return null;
  const key=student.id+':'+token;
  let cache=prepareInterviewAppEntry.cache;
  if(cache?.key!==key){
    cache={key,state:'loading',enabled:false};prepareInterviewAppEntry.cache=cache;
    isInterviewPreviewCandidate(student.id).then(allowed=>allowed?requestInterviewPrep('status',{}, {id:student.id,token}):{enabled:false}).then(d=>{
      if(prepareInterviewAppEntry.cache!==cache)return;
      cache.enabled=d.enabled===true;cache.state='ready';
      if(!cache.enabled)try{localStorage.setItem('outing-student-mode:'+student.id,'standard');}catch{}
      render();
    }).catch(()=>{if(prepareInterviewAppEntry.cache===cache){cache.state='error';render();}});
  }
  if(cache.state==='ready')return null;
  document.body.classList.add('student-interview-app-mode');
  return el('section',{className:'ip-app-shell','data-startup-pending':String(cache.state==='loading')},[el('p',{role:'status'},cache.state==='error'?'면접반 등록 상태를 확인하지 못했습니다. 연결을 확인해주세요.':'면접반 등록 상태를 확인하는 중…'),...(cache.state==='error'?[button('다시 시도','btn','button',()=>{prepareInterviewAppEntry.cache=null;render();}),button('기존 반으로 돌아가기','btn secondary','button',()=>{localStorage.setItem('outing-student-mode:'+student.id,'standard');render();})]:[])]);
}

async function logoutInterviewStudent(student,token){
  const profile=getStudentProfile(student.id);
  if(getAuthedStudent()?.id!==student.id||profile?.deviceToken!==token)throw Error('unauthorized');
  let id=profile.deviceId;
  if(!id){const validation=await requestStudentDeviceAction('validate',{studentId:student.id,deviceToken:token});if(!validation.ok)throw Error('logout_failed');id=validation.deviceId;}
  const result=await requestStudentDeviceAction('revoke',{studentId:student.id,deviceToken:token,targetDeviceId:id,reason:'면접반 앱 로그아웃'});
  if(!result.ok)throw Error('logout_failed');
  if(getAuthedStudent()?.id!==student.id||getStudentProfile(student.id)?.deviceToken!==token)return;
  clearStudentDeviceAuth(student.id);prepareInterviewAppEntry.cache=null;renderInterviewPrepEntry.cache=null;
  saveState({skipRemote:true});history.replaceState(null,'','#home');render();
}

function renderInterviewPrep() { return renderInterviewPrepModule(false); }
function renderInterviewPrepAdmin() { return renderInterviewPrepModule(true); }
const interviewAdminSections={home:'면접반 홈',applications:'수강 신청·승인',preassignments:'과제 관리',review:'피드백 관리',members:'학생 등록·첨삭',topics:'인성 준비 항목',core:'핵심인성 30제',questions:'인성 기출 관리',analysis:'질문 요소 분석',job:'직무 기출 관리',rubrics:'분류·채점 기준',live:'음성 모의면접 기록'};
function getInterviewAdminSection(){
  const section=new URLSearchParams((location.hash.split('?')[1]||'')).get('section');
  return Object.hasOwn(interviewAdminSections,section)?section:'home';
}
function restoreInterviewAdminRoute(requested){
  if(APP_MODE!=='teacher'||!teacherAuth.checked||!teacherAuth.authenticated)return requested;
  const user=teacherAuth.user?.username;
  if(restoreInterviewAdminRoute.user===user)return requested;
  restoreInterviewAdminRoute.user=user;
  if(!isTeacherAdmin()||!hasTeacherPermission('interview.read')||location.hash)return requested;
  try{
    if(localStorage.getItem('outing-teacher-mode:'+user)==='interview'){
      const saved=localStorage.getItem('outing-teacher-interview-section:'+user);
      return 'interview-prep-admin?section='+(Object.hasOwn(interviewAdminSections,saved)?saved:'home');
    }
  }catch{}
  return requested;
}
function syncInterviewAdminMode(){
  if(APP_MODE!=='teacher')return;
  const control=document.querySelector('[data-teacher-mode-switch]'),regular=document.querySelector('[data-teacher-standard-nav]'),interview=document.querySelector('[data-teacher-interview-nav]');
  if(!control||!regular||!interview)return;
  const allowed=teacherAuth.authenticated&&isTeacherAdmin()&&hasTeacherPermission('interview.read');
  const active=allowed&&currentRoute==='interview-prep-admin';
  control.hidden=!allowed;regular.hidden=active;interview.hidden=!active;
  document.body.classList.toggle('teacher-interview-mode',active);
  const section=getInterviewAdminSection();
  control.querySelectorAll('[data-teacher-mode]').forEach(node=>{
    node.setAttribute('aria-pressed',String((node.dataset.teacherMode==='interview')===active));
    node.onclick=()=>navigate(node.dataset.teacherMode==='interview'?'interview-prep-admin?section=home':'home');
  });
  interview.querySelectorAll('[data-interview-section]').forEach(node=>{
    node.classList.toggle('active',node.dataset.interviewSection===section);
    node.setAttribute('aria-current',node.dataset.interviewSection===section?'page':'false');
    node.onclick=()=>navigate('interview-prep-admin?section='+node.dataset.interviewSection);
  });
  const brand=document.querySelector('.brand span');if(brand)brand.textContent=active?'면접반 관리':'오프라인 통합 관리';
  if(allowed)try{
    localStorage.setItem('outing-teacher-mode:'+teacherAuth.user.username,active?'interview':'standard');
    if(active)localStorage.setItem('outing-teacher-interview-section:'+teacherAuth.user.username,section);
  }catch{}
  if(!teacherAuth.authenticated)restoreInterviewAdminRoute.user=null;
}
function syncInterviewPortalHeader() {
  const control=document.getElementById('interview-portal-logout');
  if(!control)return;
  const student=getAuthedStudent(),profile=getStudentProfile(student?.id);
  control.hidden=!profile?.deviceToken;
  control.onclick=async()=>{
    if(!student||!profile?.deviceToken)return;
    if(renderInterviewPrepModule.view?.controller?.canLeave && !renderInterviewPrepModule.view.controller.canLeave())return;
    control.disabled=true;
    try{
      const deviceRequest=async action=>{
        const response=await fetch('/api/student-devices',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({...action,studentId:student.id,deviceToken:profile.deviceToken})});
        const result=await response.json();
        if(!response.ok||!result.ok)throw Error('logout_failed');
        return result;
      };
      const deviceId=profile.deviceId||(await deviceRequest({action:'validate'})).deviceId;
      await deviceRequest({action:'revoke',targetDeviceId:deviceId,reason:'면접 준비 PC 로그아웃'});
      if(getAuthedStudent()?.id!==student.id)return;
      delete state.settings.studentProfiles[student.id];
      state.settings.studentAuthId='';state.settings.lastStudentId='';
      try{localStorage.removeItem('outing-pending-device:'+student.id);}catch{}
      renderInterviewPrepEntry.cache=null;
      saveState({skipRemote:true});render();
    }catch{notify('로그아웃을 완료하지 못했습니다. 연결을 확인하고 다시 시도해주세요.');}
    finally{control.disabled=false;}
  };
}
function renderInterviewPrepModule(admin) {
  if(admin && (!isTeacherAdmin() || !hasTeacherPermission('interview.read')))return renderForbidden();
  const student=admin?null:getAuthedStudent(),token=student?getStudentProfile(student.id)?.deviceToken:null;
  const key=admin?'admin:'+teacherAuth.user?.username:student?.id+':'+token;
  const old=renderInterviewPrepModule.view;
  const section=admin?getInterviewAdminSection():null;
  if(old?.key===key){
    if(admin&&old.section!==section){
      old.section=section;
      old.controller?.openSection?.(section);
    }
    return old.element;
  }
  old?.controller?.destroy();
  const host=el('div',{'data-startup-pending':'true'},[el('p',{role:'status'},'이용 권한을 확인하는 중…')]);
  const view={key,element:host,controller:null,section};renderInterviewPrepModule.view=view;
  (async()=>{
    if(!admin) {
      const allowed=await isInterviewPreviewCandidate(student?.id);
      if(!allowed)throw new Error('forbidden');
      const status=await requestInterviewPrep('status',{}, {id:student.id,token});
      if(status.enabled!==true)throw new Error('forbidden');
    }
    if(renderInterviewPrepModule.view!==view)return;
    if(!document.querySelector('link[data-interview-style]'))
      document.head.appendChild(el('link',{rel:'stylesheet',href:'./interview-prep.css?v=20261031-optional-personality-topics','data-interview-style':'true'}));
    if(!admin&&!document.querySelector('link[data-interview-workspace-style]'))
      document.head.appendChild(el('link',{rel:'stylesheet',href:'./interview-portal.css?v=20261021-app','data-interview-workspace-style':'true'}));
    const appShell=!admin&&isStandaloneStudentApp();
    const module=await (admin?import('./interview-prep-ui.js?v=20261031-optional-personality-topics'):appShell?import('./interview-app-ui.js?v=20261031-native-practice'):import('./interview-workspace.js?v=20261024-school-status'));
    if(renderInterviewPrepModule.view!==view)return;
    if(appShell){try{localStorage.setItem('outing-student-mode:'+student.id,'interview');}catch{}prepareInterviewAppEntry.cache={key:student.id+':'+token,state:'ready',enabled:true};}
    const controller=await (admin?module.mountAdmin:appShell?module.mountInterviewApp:module.mountWorkspace)(host,{
      account:admin?{}:{id:student.id,name:student.name},
      onExit:appShell?async()=>{try{localStorage.setItem('outing-student-mode:'+student.id,'standard');}catch{}view.controller?.destroy();renderInterviewPrepModule.view=null;history.replaceState(null,'','#home');render();}:undefined,
      onLogout:appShell?()=>logoutInterviewStudent(student,token):undefined,
      request:(action,payload)=>requestInterviewPrep(action,payload,admin?null:{id:student.id,token}),
      aiRequest:admin?undefined:async(url,body)=>{
        if(getAuthedStudent()?.id!==student.id||getStudentProfile(student.id)?.deviceToken!==token)
          throw Object.assign(Error('unauthorized'),{code:'unauthorized'});
        const response=await fetch(url,{method:'POST',credentials:'omit',cache:'no-store',
          headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,studentId:student.id,deviceToken:token})});
        const result=await response.json();
        if(getAuthedStudent()?.id!==student.id||getStudentProfile(student.id)?.deviceToken!==token)
          throw Object.assign(Error('unauthorized'),{code:'unauthorized'});
        if(!response.ok||!result.ok)throw Object.assign(Error(result.error),{code:result.error});
        return result;
      },
      canWrite:admin&&hasTeacherPermission('interview.write'),
      initialSection:admin?section:undefined,
      onSection:admin?(section)=>navigate('interview-prep-admin?section='+section):undefined,
    });
    if(renderInterviewPrepModule.view!==view){controller?.destroy();host.replaceChildren();return;}
    view.controller=controller;
    if(admin&&view.section!==section)controller.openSection?.(view.section);
  })().catch(()=>{
    if(renderInterviewPrepModule.view===view)
      host.replaceChildren(el('p',{role:'alert'},'면접반 이용 상태를 확인하지 못했습니다.'),...(!admin?[button('다시 시도','btn','button',()=>{renderInterviewPrepModule.view=null;render();}),button('기존 반으로 돌아가기','btn secondary','button',()=>{try{localStorage.setItem('outing-student-mode:'+student.id,'standard');}catch{}renderInterviewPrepModule.view=null;history.replaceState(null,'','#home');render();})]:[]));
  }).finally(()=>{
    if(renderInterviewPrepModule.view!==view)return;
    host.removeAttribute('data-startup-pending');
    window.__studentAppReady?.();
  });
  return host;
}
