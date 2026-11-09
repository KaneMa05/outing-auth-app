import {formatInterviewDbExport} from './interview-db-export.mjs?v=20261109-db-copy';
import {interviewRoleGuides} from './interview-role-guides.mjs?v=20261109-db-copy';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const descriptions={experience_coach:'쓸 만한 경험을 찾고 구체화할 때',answer_coach:'내 경험으로 답변의 틀을 잡을 때',interviewer:'질문과 꼬리질문에 답하는 연습',review_coach:'쓴 답변의 논리·일관성·표현 점검',fact_checker:'답변 속 제도·기관·정보가 정확한지'};
let instance=0;
function ensureStyle(){
 if(document.querySelector('link[data-interview-my-resources-style]'))return;
 const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('../interview-my-resources.css?v=20261109-db-copy',import.meta.url).href;link.dataset.interviewMyResourcesStyle='true';document.head.appendChild(link);
}
export function interviewMyProfile(account={},member={}){
 return `<section class="ip-panel ip-app-profile"><span class="ip-badge">면접반 수강 중</span><h2>${esc(account.name||member.name||'수강생')} 님</h2><dl><dt>지원 직렬</dt><dd>${esc(member.track||'—')}</dd><dt>수험번호</dt><dd>${esc(member.exam_number||'—')}</dd><dt>이용 기간</dt><dd>${esc(member.expires_on||'별도 종료일 없음')}</dd></dl></section>`;
}

/** Personal data is loaded on demand and kept only in this mounted view. */
export function mountMyResources(host,{request}){
 ensureStyle();
 host.classList.add('ip-my-resources');
 const id='ip-my-export-'+(++instance),guideId=id+'-guide';
 let dead=false,loading=false,serial=0;
 host.innerHTML=`<section class="ip-panel"><h2>나의 자료</h2><div class="ip-my-export-entry"><div><h3>나의 DB</h3><p>저장된 기본 이력·인생그래프·보완 답변을 본인 자료만 담아 복사합니다.</p></div><button type="button" class="ip-btn" data-my-export-open aria-expanded="false" aria-controls="${id}">DB 복사하기</button></div><p class="ip-help">이름·생년월일·수험번호·성별 등 신상 항목을 제외합니다. 확인된 학교·회사·소속명과 전화번호·이메일 형식도 가립니다.</p><p class="ip-message" data-my-load-message role="status"></p><section class="ip-my-copy-preview" id="${id}" data-my-export-preview hidden aria-label="복사할 나의 DB"><div class="ip-my-preview-heading"><h3>복사할 나의 DB</h3><button type="button" class="ip-btn" data-my-export-close>닫기</button></div><p class="ip-help">아래 전체 내용을 그대로 복사합니다. 본문에 직접 적은 개인정보도 확인해 주세요.</p><textarea data-my-export-text readonly spellcheck="false" aria-label="복사할 나의 DB 전체 내용"></textarea><p class="ip-help" data-my-export-summary></p><div class="ip-my-copy-actions"><button type="button" class="ip-btn ip-primary" data-my-export-copy>DB 복사하기</button><button type="button" class="ip-btn" data-my-export-select>전체 선택</button></div><p class="ip-message" data-my-export-message role="status"></p></section></section>
 <section class="ip-panel"><h2>AI 역할별 지침</h2><p class="ip-help">지금 필요한 도움에 맞춰 AI의 역할을 선택하세요. DB가 필요한 역할에는 나의 DB를 먼저 붙여넣으세요.</p><div class="ip-my-guide-list">${interviewRoleGuides.map(guide=>`<button type="button" data-my-guide="${guide.id}" aria-pressed="false" aria-controls="${guideId}"><strong>${esc(guide.title)}</strong><span>${esc(descriptions[guide.id])}</span></button>`).join('')}</div><section class="ip-my-copy-preview" id="${guideId}" data-my-guide-preview hidden aria-label="선택한 역할 지침"><div class="ip-my-preview-heading"><h3 data-my-guide-title></h3><button type="button" class="ip-btn" data-my-guide-close>닫기</button></div><p class="ip-help" data-my-guide-usage></p><textarea data-my-guide-text readonly spellcheck="false" aria-label="선택한 역할 지침 전체 내용"></textarea><p class="ip-help">선택한 역할 지침만 복사합니다.</p><div class="ip-my-copy-actions"><button type="button" class="ip-btn ip-primary" data-my-guide-copy>이 역할 지침 복사하기</button><button type="button" class="ip-btn" data-my-guide-select>전체 선택</button></div><p class="ip-message" data-my-guide-message role="status"></p></section></section>`;
 const q=selector=>host.querySelector(selector);
 const open=q('[data-my-export-open]'),preview=q('[data-my-export-preview]'),text=q('[data-my-export-text]'),guidePreview=q('[data-my-guide-preview]'),guideText=q('[data-my-guide-text]');
 function message(selector,body,error=false){if(dead)return;const target=q(selector);target.textContent=body;target.dataset.error=String(error);}
 function clearExport(){text.value='';q('[data-my-export-summary]').textContent='';preview.hidden=true;open.setAttribute('aria-expanded','false');message('[data-my-export-message]','');}
 async function loadExport(){
  if(dead||loading)return;
  const ticket=++serial;loading=true;open.disabled=true;clearExport();
  message('[data-my-load-message]','저장된 나의 DB를 불러오는 중…');
  try{
   const [life,diagnosis]=await Promise.all([request('life_get'),request('diagnosis_get')]);
   if(dead||ticket!==serial)return;
   const result=formatInterviewDbExport(life,diagnosis);
   if(!result.experienceCount){message('[data-my-load-message]','인생그래프에 경험의 내용을 작성하고 저장하면 복사할 수 있습니다.');return;}
   text.value=result.text;
   q('[data-my-export-summary]').textContent=`경험 ${result.experienceCount}개 · 보완 답변 ${result.answerCount}개 · ${result.text.length.toLocaleString('ko-KR')}자 · 본인 DB만 포함`;
   preview.hidden=false;open.setAttribute('aria-expanded','true');message('[data-my-load-message]','');
   preview.scrollIntoView?.({block:'nearest',behavior:'auto'});
  }catch(error){
   if(dead||ticket!==serial)return;
   clearExport();
   const code=error.code||error.message;
   message('[data-my-load-message]',code==='unauthorized'?'로그인이 만료되었습니다. 다시 로그인해 주세요.':code==='not_enrolled'?'면접반 이용 등록과 기간을 확인해 주세요.':'DB를 불러오지 못했습니다. 다시 눌러 시도해 주세요.',true);
  }finally{if(!dead&&ticket===serial){loading=false;open.disabled=false;}}
 }
 function select(field,selector){if(!field.value)return;field.focus({preventScroll:true});field.select();field.setSelectionRange(0,field.value.length);message(selector,'전체 내용을 선택했습니다. 복사 메뉴 또는 Ctrl+C로 복사해 주세요.');}
 async function copy(field,button,selector,detail){
  const value=field.value;if(!value)return;
  button.disabled=true;
  try{
   if(!navigator.clipboard?.writeText)throw Error('clipboard_unavailable');
   await navigator.clipboard.writeText(value);
   message(selector,`복사했습니다. ${detail}`);
  }catch{message(selector,'자동으로 복사하지 못했습니다. ‘전체 선택’을 누른 뒤 복사 메뉴 또는 Ctrl+C를 사용해 주세요.',true);}
  finally{if(!dead)button.disabled=false;}
 }
 async function click(event){
  const button=event.target.closest('button');if(!button||!host.contains(button)||button.disabled||dead)return;
  if(button.hasAttribute('data-my-export-open'))await loadExport();
  else if(button.hasAttribute('data-my-export-close')){clearExport();open.focus({preventScroll:true});}
  else if(button.hasAttribute('data-my-export-copy'))await copy(text,button,'[data-my-export-message]','본인 DB를 원하는 AI에 붙여넣으세요.');
  else if(button.hasAttribute('data-my-export-select'))select(text,'[data-my-export-message]');
  else if(button.dataset.myGuide){
   const guide=interviewRoleGuides.find(item=>item.id===button.dataset.myGuide);if(!guide)return;
   q('[data-my-guide-title]').textContent=guide.title;q('[data-my-guide-usage]').textContent=guide.usage;guideText.value=guide.text;
   guidePreview.hidden=false;message('[data-my-guide-message]','');
   host.querySelectorAll('[data-my-guide]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
   guidePreview.scrollIntoView?.({block:'nearest',behavior:'auto'});
  }else if(button.hasAttribute('data-my-guide-close')){
   guidePreview.hidden=true;guideText.value='';host.querySelectorAll('[data-my-guide]').forEach(item=>item.setAttribute('aria-pressed','false'));
  }else if(button.hasAttribute('data-my-guide-copy'))await copy(guideText,button,'[data-my-guide-message]','필요한 자료와 함께 선택한 역할 지침을 붙여넣으세요.');
  else if(button.hasAttribute('data-my-guide-select'))select(guideText,'[data-my-guide-message]');
 }
 host.addEventListener('click',click);
 return {ready:Promise.resolve(),canLeave:()=>true,destroy(){dead=true;++serial;host.removeEventListener('click',click);text.value='';guideText.value='';host.replaceChildren();}};
}
