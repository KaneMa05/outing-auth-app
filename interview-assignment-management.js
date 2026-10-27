import {mountPreassignments} from './interview-preassignments.js?v=20261026-assignments';
import {mountStudentReview} from './interview-review-ui.js?v=20261027-overview-modal';
import {mountAssignmentOverview} from './interview-assignment-overview.js?v=20261027-overview-modal';

const areas=[['overview','전체 현황'],['basic','기본이력'],['life','인생그래프'],['introduction','자기소개'],['motivation','지원동기'],['public_service','공직관'],['core','핵심 25제']];
export function mountAssignmentManagement(host,options){
 let current=null,destroyed=false,loading=false,version=0;
 host.innerHTML=`<section class="ip-panel"><h2>과제 관리</h2><p>과제를 선택해 학생의 작성 내용과 제출 상태를 확인하세요.</p><nav class="ip-tabs" aria-label="관리할 과제">${areas.map(([id,title])=>`<button type="button" class="ip-btn" data-assignment-area="${id}">${title}</button>`).join('')}</nav></section><div data-assignment-content></div>`;
 const content=host.querySelector('[data-assignment-content]');
 async function select(area){
  const ticket=++version;loading=true;current?.destroy();current=null;
  host.querySelectorAll('[data-assignment-area]').forEach(b=>{b.disabled=true;if(b.dataset.assignmentArea===area)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
  content.replaceChildren();content.classList.remove('pa-root','ip-review');
  try{
   const next=area==='overview'?mountAssignmentOverview(content,options):area==='core'?await mountPreassignments(content,{admin:true,canWrite:options.canWrite}):mountStudentReview(content,{...options,assignmentArea:area});
   if(destroyed||ticket!==version){next.destroy();return;}
   current=next;await next.ready;
  }finally{if(!destroyed&&ticket===version){loading=false;host.querySelectorAll('[data-assignment-area]').forEach(b=>b.disabled=false);}}
 }
 function click(e){const b=e.target.closest('[data-assignment-area]');if(!b)return;e.stopPropagation();if(loading||b.getAttribute('aria-current')==='page'||current&&!current.canLeave())return;select(b.dataset.assignmentArea);}
 host.addEventListener('click',click);
 const ready=select('overview');
 return {ready,canLeave:()=>!loading&&(!current||current.canLeave()),destroy(){destroyed=true;++version;current?.destroy();host.removeEventListener('click',click);}};
}
