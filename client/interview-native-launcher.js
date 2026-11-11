// Capability routing only. All identity and enrollment checks remain server-owned.
export function nativeInterviewPlatform(){
 if(globalThis.webkit?.messageHandlers?.interviewNative)return 'ios';
 return /Android/i.test(navigator.userAgent)&&new URLSearchParams(location.search).get('nativeInterview')==='1'?'android':null;
}
export function nativeInterviewUrl(code){
 if(!/^[A-Za-z0-9_-]{43}$/.test(code))throw Error('invalid_response');
 return `intent://interview/start?code=${code}#Intent;scheme=ronpark-study;package=com.ronpark.study;end`;
}
export async function mountNativeInterview(host,{request,platform=nativeInterviewPlatform(),testApp=false}){
 const copy=testApp?{intro:'AI 면접관과 실전처럼 면접을 연습합니다.',loading:'면접 준비 화면을 불러오고 있습니다.',open:'면접 준비하기',retry:'다시 시도',expired:'면접 준비 화면을 다시 열어주세요.',failed:'면접 준비 화면을 열지 못했습니다. 잠시 후 다시 시도해주세요.'}:{intro:'앱의 모의면접 화면에서 AI 면접관과 대화합니다.',loading:'연결을 준비하고 있습니다.',open:'앱에서 모의면접 열기',retry:'연결 다시 준비',expired:'연결을 다시 준비한 뒤 모의면접을 열어주세요.',failed:'앱 연결을 준비하지 못했습니다. 잠시 후 연결 다시 준비를 눌러주세요.'};
 let destroyed=false,generation=0,timer;
 host.innerHTML=`<section class="ip-panel"><h2>실전 모의면접</h2><p>${copy.intro}</p><p data-status role="status">${copy.loading}</p><a class="ip-btn ip-primary" data-open hidden>${copy.open}</a><button type="button" class="ip-btn" data-retry hidden>${copy.retry}</button></section>`;
 const status=host.querySelector('[data-status]'),open=host.querySelector('[data-open]'),retry=host.querySelector('[data-retry]');let code='';
 function expire(){code='';open.hidden=true;open.removeAttribute('href');retry.hidden=false;status.textContent=copy.expired;}
 async function prepare(){const current=++generation;clearTimeout(timer);code='';open.hidden=true;retry.hidden=true;status.textContent=copy.loading;
  try{const data=await request('/api/interview-native',{action:'launch'});if(destroyed||current!==generation)return;
   nativeInterviewUrl(data.code);code=data.code;open.hidden=false;
   if(platform==='android')open.href=nativeInterviewUrl(code);
   else {open.href='#';open.setAttribute('role','button');}
   status.textContent='아래 버튼을 누르면 마이크와 카메라를 확인할 수 있습니다.';timer=setTimeout(expire,55000);
  }catch(error){if(destroyed||current!==generation)return;
   const messages={unauthorized:'로그인이 만료되었습니다. 다시 로그인한 뒤 모의면접을 열어주세요.',
    forbidden:'실전 모의면접 이용 권한을 확인해주세요. 관리자에게 문의해주세요.',
    not_enrolled:'면접반 수강 등록 상태를 확인하지 못했습니다. 관리자에게 문의해주세요.',
    automation_disabled:'실전 모의면접 서버 연결이 준비되지 않았습니다. 관리자에게 문의해주세요.'};
   status.textContent=messages[error?.code||error?.message]||copy.failed;retry.hidden=false;
  }
 }
 function launch(e){if(!code){e.preventDefault();return;}if(platform==='ios'){e.preventDefault();globalThis.webkit.messageHandlers.interviewNative.postMessage({code});}clearTimeout(timer);setTimeout(()=>{if(!destroyed)expire();},0);}
 open.addEventListener('click',launch);retry.addEventListener('click',prepare);prepare();
 return {canLeave:()=>true,destroy(){destroyed=true;++generation;clearTimeout(timer);code='';open.removeEventListener('click',launch);retry.removeEventListener('click',prepare);host.replaceChildren();}};
}
