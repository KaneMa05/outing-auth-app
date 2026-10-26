import {mountInterviewAI} from './interview-ai-ui.js?v=20261024-navigation-speed';
import {mountLife} from './interview-life-ui.js?v=20261024-school-status';
import {mountWriting} from './interview-writing-ui.js?v=20261024-colors';
import {mountDiagnosis} from './interview-diagnosis-ui.js?v=20261024-school-status';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const areas=[['basic','기본 이력'],['experiences','인생그래프']];
const menus=[['db','나의 DB 정리하기'],['introduction','자기소개 작성하기'],['motivation','지원동기 작성하기'],['public_service','공직관 작성하기'],['core','핵심 25제 작성하기']];
const generationKinds={introduction:'self_intro',motivation:'motivation',public_service:'public_service',core:'core30'};
export async function mountWorkspace(host,{request,aiRequest,initialPage='db',initialArea='life:basic',compactNavigation=false,onPageChange=()=>{}}){
 const visibleMenus=menus;
 if(initialPage==='preassignments')initialPage='core';
 host.className='ip-root ip-portal ip-workspace';
 host.innerHTML='<div data-workspace-content></div>';
 const contentHost=host.querySelector('[data-workspace-content]');
 let page=menus.some(m=>m[0]===initialPage)?initialPage:'db',area=initialArea,child=null,destroyed=false,busy=false,generation=0,ai=null,aiBusy=false;
 const editorRequest=async(action,payload)=>{
  const result=await request(action,payload);
  if(['life_save','note_save'].includes(action)&&!destroyed)await ai?.refreshAvailability();
  return result;
 };
 const canLeave=()=>!busy&&!aiBusy&&(!child?.canLeave||child.canLeave());
 function navigation(){
  const links=areas.map(([id,title])=>['life:'+id,title]).concat([['diagnosis','진단하기']]);
  return `<aside class="ip-db-sidebar">${areas.map(([id,title])=>areaButton('life:'+id,title)).join('')}<p class="ip-db-group">인성 경험·가치관</p>${areaButton('diagnosis','진단하기')}</aside>
   <label class="ip-db-mobile">작성 항목<select data-db-select><optgroup label="기본 이력">${links.slice(0,areas.length).map(option).join('')}</optgroup><optgroup label="인성 경험·가치관">${links.slice(areas.length).map(option).join('')}</optgroup></select></label>`;
 }
 const option=([id,title])=>`<option value="${esc(id)}" ${id===area?'selected':''}>${esc(title)}</option>`;
 const areaButton=(id,title)=>`<button type="button" class="ip-db-item" data-db-area="${esc(id)}" ${id===area?'aria-current="page"':''}>${esc(title)}</button>`;
 async function render(){
  busy=true;const ticket=++generation;
  ai?.destroy();ai=null;aiBusy=false;contentHost.inert=false;
  child?.destroy();child=null;
  const title=visibleMenus.find(m=>m[0]===page)[1];
  contentHost.innerHTML=`<nav class="ip-tabs ip-workspace-tabs" aria-label="면접 준비">${visibleMenus.map(([id,label])=>`<button type="button" class="ip-btn" data-workspace-page="${id}" ${id===page?'aria-current="page"':''}>${compactNavigation?label.replace(' 작성하기',''):label}</button>`).join('')}</nav>
   <section class="ip-hero ip-workspace-hero"><div class="ip-workspace-hero-copy"><span class="ip-workspace-kicker">나의 경험에서 시작하는 면접 준비</span><h2>${title}</h2><p>${page==='db'?'기본 이력부터 경험과 가치관까지, 나의 답변에 사용할 소재를 한곳에 정리하세요.':page==='core'?'핵심인성 질문마다 나만의 답변을 작성하세요.':'나의 DB에 정리한 경험과 생각을 바탕으로 작성하세요.'}</p></div><div class="ip-workspace-hero-art" aria-hidden="true"><span></span><span></span><span></span></div></section>
   <p class="ip-message" data-workspace-message role="status"></p>
   ${page==='db'?`<div class="ip-db-layout">${navigation()}<div data-db-editor></div></div>`:'<div data-workspace-ai></div><div data-writing-host></div>'}`;
  try{
   let next;
   if(page==='core'){
    host.querySelector('.ip-workspace-hero').style.display='none';
    const {mountPreassignments}=await import('./interview-preassignments.js?v=20261026-no-video-reference');
    if(destroyed||ticket!==generation)return;
    next=await mountPreassignments(host.querySelector('[data-writing-host]'),{request:aiRequest?(action,payload={})=>aiRequest('/api/interview-preassignments',{...payload,action}):undefined});
   }else if(page==='mock'){
    host.querySelector('.ip-workspace-hero').style.display='none';
    const {mountLive}=await import('./interview-live-ui.js?v=20261021-flow');
    if(destroyed||ticket!==generation)return;
    next=await mountLive(host.querySelector('[data-writing-host]'),{request:aiRequest?(action,payload={})=>aiRequest('/api/interview-live',{...payload,action}):undefined});
   }else if(page==='db'){
    const box=host.querySelector('[data-db-editor]');
    if(area.startsWith('life:')){next=mountLife(box,{request:editorRequest,followupRequest:aiRequest?(action,payload={})=>aiRequest('/api/interview-life-followup',{...payload,action}):undefined,embedded:true,simpleEditor:true,combined:true,initialSection:area.slice(5)});child=next;await next.ready;}
    else {next=mountDiagnosis(box,{request:editorRequest,initialTopic:initialArea.startsWith('note:')?initialArea.slice(5):'',onLife:async()=>{if(!canLeave())return;area='life:experiences';onPageChange(page,area);await render();}});child=next;await next.ready;}
   }else{next=mountWriting(host.querySelector('[data-writing-host]'),{request:editorRequest,kind:page,hideQuestionPicker:page==='core'});child=next;await next.ready;}
   if(destroyed||ticket!==generation)next?.destroy();else {
    child=next;
    if(!['db','mock','core'].includes(page))ai=mountInterviewAI(host.querySelector('[data-workspace-ai]'),{
     request:aiRequest,kind:generationKinds[page],
     onBusy(value){
      aiBusy=value;
      contentHost.querySelector('[data-writing-host]').inert=value;
      contentHost.querySelector('nav').inert=value;
     },
     async savePending(){if(busy||destroyed||!child?.savePending)throw Error('save_failed');await child.savePending();},
     async onQuestionChange(id){await child.savePending();return child.selectQuestion(id);},
     async onAdopt(kind,key,text){
      if(destroyed||busy||kind!==generationKinds[page])return false;
      const adopted=child?.adopt?.(page==='core'?key:'',text)||false;
      if(adopted)contentHost.querySelector('[data-writing-host]').scrollIntoView({block:'start',behavior:'smooth'});
      return adopted;
     }
    });
   }
  }catch{if(!destroyed)host.querySelector('[data-workspace-message]').textContent='화면을 불러오지 못했습니다. 다른 메뉴를 선택한 뒤 다시 시도해주세요.';}
  finally{if(ticket===generation)busy=false;}
 }
 host.addEventListener('click',onClick);
 host.addEventListener('change',onChange);
 const invalidate=e=>{
  if(e.type!=='click'&&e.target.matches('[data-basic-field],[data-school-status],[data-basic-none],[data-life-field],[data-life-none],[data-life-tag],[data-note-field],[data-copy]')||
   e.type==='click'&&e.target.closest('[data-life-action="add"],[data-life-action="remove"],[data-life-action="from-guide"],[data-life-action="up"]'))ai?.invalidate();
 };
 host.addEventListener('input',invalidate,true);host.addEventListener('change',invalidate,true);host.addEventListener('click',invalidate,true);
 async function onClick(e){
  const target=e.target.closest('[data-workspace-page],[data-db-area]');if(!target||busy||!canLeave())return;
  if(target.dataset.workspacePage)page=target.dataset.workspacePage;else area=target.dataset.dbArea;
  onPageChange(page,area);
  await render();
 }
 async function onChange(e){
  if(!e.target.matches('[data-db-select]'))return;
  if(!canLeave()){e.target.value=area;return;}
  area=e.target.value;onPageChange(page,area);await render();
 }
 try{
  // Each editor loads and authorizes its own data; the workspace needs no bootstrap.
  if(!areas.some(([id])=>area==='life:'+id))area='diagnosis';await render();
 }
 catch{host.innerHTML='<p role="alert">나의 DB를 불러오지 못했습니다. 페이지를 새로고침해주세요.</p>';}
 return {canLeave,destroy(){destroyed=true;++generation;ai?.destroy();child?.destroy();host.removeEventListener('click',onClick);host.removeEventListener('change',onChange);host.removeEventListener('input',invalidate,true);host.removeEventListener('change',invalidate,true);host.removeEventListener('click',invalidate,true);}};
}
