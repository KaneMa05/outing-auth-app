export function nativePracticeUrl(code,mode,packageName='com.ronpark.study'){
 if(!/^[A-Za-z0-9_-]{43}$/.test(code||'')||!['job','personality'].includes(mode)||!['com.ronpark.study','com.ronpark.study.nativebeta'].includes(packageName))throw Error('invalid_native_practice');
 return `intent://interview/practice?code=${code}&mode=${mode}#Intent;scheme=ronpark-study;package=${packageName};end`;
}
export function mountNativePracticeLauncher(host,{mode,request,onBack}){
 let destroyed=false,generation=0,timer,code='';
 const packageName=new URLSearchParams(location.search).get('nativePracticePackage')==='com.ronpark.study.nativebeta'?'com.ronpark.study.nativebeta':'com.ronpark.study';
 const title=mode==='job'?'직무(전공) 연습모드':'인성 연습모드';
 host.innerHTML=`<button type="button" class="ip-btn" data-native-back>‹ 모의면접 목록</button><section class="ip-panel"><h2>${title}</h2><p role="status" data-native-status>네이티브 연습 화면을 준비하고 있습니다.</p><a class="ip-btn ip-primary" data-native-open hidden>연습 화면 열기</a><button type="button" class="ip-btn" data-native-retry hidden>다시 시도</button></section>`;
 const open=host.querySelector('[data-native-open]'),status=host.querySelector('[data-native-status]'),retry=host.querySelector('[data-native-retry]'),back=host.querySelector('[data-native-back]');
 function expire(){code='';open.hidden=true;open.removeAttribute('href');retry.hidden=false;status.textContent='연결을 다시 준비한 뒤 연습 화면을 열어주세요.';}
 async function prepare(){const ticket=++generation;clearTimeout(timer);code='';open.hidden=true;retry.hidden=true;status.textContent='네이티브 연습 화면을 준비하고 있습니다.';
  try{const data=await request('/api/interview-native-practice',{action:'launch',mode});if(destroyed||ticket!==generation)return;open.href=nativePracticeUrl(data.code,mode,packageName);code=data.code;open.hidden=false;status.textContent='연습 화면에서 분야·지역·문항 수를 설정할 수 있습니다.';timer=setTimeout(expire,55000);}
  catch{if(destroyed||ticket!==generation)return;status.textContent='연습 화면을 준비하지 못했습니다. 로그인과 수강 권한을 확인하고 다시 시도해주세요.';retry.hidden=false;}
 }
 function launch(event){if(!code){event.preventDefault();return;}clearTimeout(timer);setTimeout(()=>{if(!destroyed){expire();onBack();}},0);}
 open.addEventListener('click',launch);retry.addEventListener('click',prepare);back.addEventListener('click',onBack);void prepare();
 return {canLeave:()=>true,destroy(){destroyed=true;generation++;clearTimeout(timer);code='';open.removeEventListener('click',launch);retry.removeEventListener('click',prepare);back.removeEventListener('click',onBack);host.replaceChildren();}};
}
