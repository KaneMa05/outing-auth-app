// Capability routing only. All identity and enrollment checks remain server-owned.
export function nativeInterviewPlatform(){
 if(globalThis.webkit?.messageHandlers?.interviewNative)return 'ios';
 return /Android/i.test(navigator.userAgent)&&new URLSearchParams(location.search).get('nativeInterview')==='1'?'android':null;
}
export function nativeInterviewUrl(code){
 if(!/^[A-Za-z0-9_-]{43}$/.test(code))throw Error('invalid_response');
 return `intent://interview/start?code=${code}#Intent;scheme=ronpark-study;package=com.ronpark.study;end`;
}
export async function mountNativeInterview(host,{request,platform=nativeInterviewPlatform()}){
 let destroyed=false,generation=0,timer;
 host.innerHTML='<section class="ip-panel"><h2>실전 모의면접</h2><p>앱의 모의면접 화면에서 AI 면접관과 대화합니다.</p><p data-status role="status">연결을 준비하고 있습니다.</p><a class="ip-btn ip-primary" data-open hidden>앱에서 모의면접 열기</a><button type="button" class="ip-btn" data-retry hidden>연결 다시 준비</button></section>';
 const status=host.querySelector('[data-status]'),open=host.querySelector('[data-open]'),retry=host.querySelector('[data-retry]');let code='';
 function expire(){code='';open.hidden=true;open.removeAttribute('href');retry.hidden=false;status.textContent='연결을 다시 준비한 뒤 모의면접을 열어주세요.';}
 async function prepare(){const current=++generation;clearTimeout(timer);code='';open.hidden=true;retry.hidden=true;status.textContent='연결을 준비하고 있습니다.';
  try{const data=await request('/api/interview-native',{action:'launch'});if(destroyed||current!==generation)return;
   nativeInterviewUrl(data.code);code=data.code;open.hidden=false;
   if(platform==='android')open.href=nativeInterviewUrl(code);
   else {open.href='#';open.setAttribute('role','button');}
   status.textContent='아래 버튼을 누르면 마이크와 카메라를 확인할 수 있습니다.';timer=setTimeout(expire,55000);
  }catch{if(destroyed||current!==generation)return;status.textContent='앱 연결을 준비하지 못했습니다. 수강 등록과 서버 연결 상태를 확인해주세요.';retry.hidden=false;}
 }
 function launch(e){if(!code){e.preventDefault();return;}if(platform==='ios'){e.preventDefault();globalThis.webkit.messageHandlers.interviewNative.postMessage({code});}clearTimeout(timer);setTimeout(()=>{if(!destroyed)expire();},0);}
 open.addEventListener('click',launch);retry.addEventListener('click',prepare);prepare();
 return {canLeave:()=>true,destroy(){destroyed=true;++generation;clearTimeout(timer);code='';open.removeEventListener('click',launch);retry.removeEventListener('click',prepare);host.replaceChildren();}};
}
