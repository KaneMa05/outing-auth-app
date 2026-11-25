const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const enrollmentEnded=access=>['interview','app'].includes(access?.terminationScope);
export function enrollmentNotice(access,{aptitude=false,exit=false,logout=false}={}){
 const all=access?.terminationScope==='app';
 return `<section class="ip-panel ip-enrollment-notice" role="status"><span class="ip-badge">이용 종료</span><h2>${all?'이용이 종료되었습니다.':'면접반 이용이 종료되었습니다.'}</h2><p>${all?'면접 앱 이용이 종료되어 학습 기능을 사용할 수 없습니다.':'DB 정리·작성하기·AI 기능·모의면접·녹음 등 면접 준비 기능은 더 이상 이용할 수 없습니다.'}</p>${access?.endedAt?`<p>종료일 ${esc(new Date(access.endedAt).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'}))}</p>`:''}<p>이용 관련 문의는 학원으로 해 주세요.</p><div class="ip-toolbar">${!all&&aptitude?'<button type="button" class="ip-btn ip-primary" data-enrollment-aptitude>적성 모의고사로 이동</button>':''}<button type="button" class="ip-btn" data-enrollment-refresh>등록 상태 다시 확인</button>${exit?'<button type="button" class="ip-btn" data-enrollment-exit>기존 수강생 화면으로 이동</button>':''}${logout?'<button type="button" class="ip-btn" data-enrollment-logout>로그아웃</button>':''}</div></section>`;
}
// Server RPCs enforce every request. This visible-only check also closes an
// already open editor without creating requests from background tabs.
export function watchEnrollment(request,onChange,initial={}){
 let stopped=false,pending=false,current=initial;
 const check=async()=>{
  if(stopped||pending||document.hidden)return;
  pending=true;
  try{
   const next=await request('status');
   if(stopped||!next||!Object.hasOwn(next,'terminationScope'))return;
   const changed=(next.terminationScope||'active')!==(current.terminationScope||'active')||(next.endedAt||null)!==(current.endedAt||null)||Boolean(next.accessProduct&&current.accessProduct&&next.accessProduct!==current.accessProduct);
   current=next;if(changed)await onChange(next);
  }catch{/* An unavailable status never grants access; server checks remain authoritative. */}
  finally{pending=false;}
 };
 const timer=setInterval(check,15000);
 window.addEventListener('focus',check);document.addEventListener('visibilitychange',check);
 void check();
 return {check,destroy(){stopped=true;clearInterval(timer);window.removeEventListener('focus',check);document.removeEventListener('visibilitychange',check);}};
}
