const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const formatInterviewPhone=phone=>String(phone||'').replace(/^(\d{3})(\d{3,4})(\d{4})$/,'$1-$2-$3');

export function mountAdminContacts(host,{request,canWrite=true}){
  let page=0,search='',version=0,destroyed=false,loading=false,pending=0;
  const dirty=new Set();
  const canLeave=()=>!pending&&(!dirty.size||confirm('저장하지 않은 휴대폰 번호가 있습니다. 이동할까요?'));
  const beforeUnload=e=>{if(dirty.size||pending){e.preventDefault();e.returnValue='';}};
  window.addEventListener('beforeunload',beforeUnload);
  host.innerHTML=`<h3>수강생 휴대폰 번호</h3><p class="ip-help">등록된 수강생의 번호를 입력한 뒤 행별로 저장하세요. 저장한 번호는 명단 엑셀에 포함됩니다. 빈칸으로 저장하면 번호가 지워집니다.</p><form data-contact-search class="ip-toolbar"><label>이름·학생 ID 검색<input name="search" maxlength="200"></label><button class="ip-btn">검색</button></form><p data-contact-message role="status"></p><div data-contact-list></div><div class="ip-toolbar"><button class="ip-btn" type="button" data-contact-page="-1">이전</button><span data-contact-page-label></span><button class="ip-btn" type="button" data-contact-page="1">다음</button></div>`;
  const message=(text,error=false)=>{const node=host.querySelector('[data-contact-message]');node.textContent=text;node.dataset.error=String(error);};
  const errorText=e=>({invalid_phone:'휴대폰 번호를 확인해주세요. 예: 010-1234-5678',unauthorized:'로그인이 만료되었습니다. 다시 로그인해주세요.',forbidden:'이 작업을 수행할 권한이 없습니다.',revision_conflict:'다른 관리자가 번호를 변경했습니다. 입력 내용을 보관한 뒤 검색을 눌러 최신 번호를 확인해주세요.'}[e.code||e.message]||'저장하거나 조회하지 못했습니다. 입력 내용을 유지하고 다시 시도해주세요.');
  async function load(){
    const current=++version;loading=true;
    host.querySelectorAll('[data-contact-page]').forEach(b=>b.disabled=true);
    host.querySelectorAll('[data-contact-row] input,[data-contact-row] button').forEach(el=>el.disabled=true);
    message('휴대폰 번호를 불러오는 중…');
    try{
      const result=await request('admin_members',{registeredOnly:true,includeContacts:true,page,search});
      if(destroyed||current!==version)return;
      if(!Array.isArray(result?.members))throw Error('invalid_request');
      dirty.clear();
      host.querySelector('[data-contact-list]').innerHTML=result.members.map(member=>`<form data-contact-row data-id="${esc(member.id)}" data-revision="${member.phone_revision||0}" class="ip-panel"><div class="ip-row"><strong>${esc(member.name)}</strong><small>${esc(member.track)} · 수험번호 ${esc(member.exam_number)}</small></div><div class="ip-toolbar"><label>휴대폰 번호<input type="tel" name="phone" aria-label="${esc(member.name)} 휴대폰 번호" autocomplete="off" inputmode="tel" maxlength="30" placeholder="010-1234-5678" value="${esc(formatInterviewPhone(member.phone))}" ${canWrite?'':'disabled'}></label><button class="ip-btn ip-primary" ${canWrite?'':'disabled'}>저장</button><span data-contact-saved role="status"></span></div></form>`).join('')||'<p class="ip-empty">검색 결과가 없습니다.</p>';
      host.querySelector('[data-contact-page-label]').textContent=`${page+1} 페이지`;
      host.querySelector('[data-contact-page="-1"]').disabled=page===0;
      host.querySelector('[data-contact-page="1"]').disabled=result.members.length<30;
      message('');
    }catch(e){if(!destroyed&&current===version){message(errorText(e),true);host.querySelectorAll('[data-contact-page]').forEach(b=>b.disabled=true);host.querySelectorAll('[data-contact-row] input,[data-contact-row] button').forEach(el=>el.disabled=!canWrite);}}
    finally{if(current===version)loading=false;}
  }
  host.oninput=e=>{e.stopPropagation();const form=e.target.closest('[data-contact-row]');if(form){dirty.add(form.dataset.id);form.querySelector('[data-contact-saved]').textContent='저장 전';}};
  host.onchange=e=>e.stopPropagation();
  host.onclick=e=>{
    e.stopPropagation();const button=e.target.closest('[data-contact-page]');
    if(!button||button.disabled||loading||!canLeave())return;
    page+=Number(button.dataset.contactPage);load();
  };
  host.onsubmit=async e=>{
    e.preventDefault();e.stopPropagation();const form=e.target;
    if(form.matches('[data-contact-search]')){if(loading||!canLeave())return;search=new FormData(form).get('search')||'';page=0;await load();return;}
    if(!form.matches('[data-contact-row]')||!canWrite||loading||form.dataset.saving)return;
    const input=form.querySelector('input'),button=form.querySelector('button'),status=form.querySelector('[data-contact-saved]');
    form.dataset.saving='true';pending++;input.disabled=true;button.disabled=true;status.textContent='저장 중…';
    try{
      const result=await request('admin_contact_save',{targetStudentId:form.dataset.id,phone:input.value,revision:Number(form.dataset.revision)});
      if(destroyed)return;
      if(typeof result?.phone!=='string'||!Number.isInteger(result.revision))throw Error('invalid_request');
      input.value=formatInterviewPhone(result.phone);form.dataset.revision=String(result.revision);dirty.delete(form.dataset.id);status.textContent='저장했습니다.';message('');
    }catch(e){if(!destroyed){status.textContent='저장하지 못했습니다.';message(errorText(e),true);}}
    finally{pending--;delete form.dataset.saving;if(!destroyed){input.disabled=false;button.disabled=false;}}
  };
  const ready=load();
  return {ready,canLeave,destroy(){destroyed=true;version++;window.removeEventListener('beforeunload',beforeUnload);host.onclick=null;host.onsubmit=null;host.oninput=null;host.onchange=null;}};
}
