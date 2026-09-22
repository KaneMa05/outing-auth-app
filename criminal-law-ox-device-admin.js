export async function mountDeviceAdmin(host,{api,memberId,canReset,onClose}) {
  let page=0,version=0,busy=false;
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const date=value=>value?new Date(value).toLocaleString('ko-KR'):'—';
  async function load(){
    const id=++version;
    host.innerHTML='<p role="status">등록 기기 정보를 불러오는 중입니다.</p>';
    try{
      const data=await api(memberId?'admin_device_list':'admin_device_requests',memberId?{memberId}:{page});
      if(id!==version || !host.isConnected)return;
      host.innerHTML=`<section class="ox-admin-editor ox-admin-book-editor"><div class="ox-admin-heading"><h4>${memberId?'앱 등록 기기 · '+esc(memberId):'추가 기기 교체 신청'}</h4><button class="mini-btn" data-device-close>닫기</button></div>
        ${memberId?`<p>앱 등록 기기는 최대 2대이며, 구매한 OX 교재는 한 번에 한 기기에서 학습합니다.</p><ul>${data.devices.map(d=>`<li>${esc(d.label)}${d.learning?' · 학습 중':''}${d.appActive?'':' · 앱 등록 해제됨'}<p>등록일 ${esc(date(d.registeredAt))}</p></li>`).join('')||'<li>등록된 기기가 없습니다.</li>'}</ul>
          <p>${data.canReplace?'직접 교체 가능':'다음 직접 교체 가능: '+esc(date(data.nextReplacementAt))}</p><h4>최근 교체 이력</h4>${data.changes.map(c=>`<div class="ox-admin-book-history"><p>${esc(c.old_label||"전체 기기")} → ${esc(c.new_label||"해제")}</p><p>${esc(c.reason)}</p><small>${esc(c.actor)} · ${esc(date(c.changed_at))}</small></div>`).join('')||'<p>교체 이력이 없습니다.</p>'}`:
          `<p>승인 대기 ${data.total}건 · ${page+1} / ${Math.max(1,Math.ceil(data.total/30))} 페이지</p>${data.items.map(r=>`<form data-device-review data-id="${esc(r.id)}" class="ox-admin-book-history"><strong>${esc(r.name)} · ${r.student_category==='lecture'?'인터넷 수강생':r.cohort?esc(r.cohort)+'기':'기수 미지정'} · ${esc(r.student_id)}</strong><p>${esc(r.old_label)} → ${esc(r.new_label)}</p><p>신청 사유: ${esc(r.reason)}</p><small>${esc(date(r.requested_at))}</small><label>처리 사유<textarea name="reason" maxlength="500" rows="2" required ${canReset?'':'disabled'}></textarea></label><div><button class="mini-btn" type="submit" name="decision" value="approve" ${canReset?'':'disabled'}>기기 교체 승인</button> <button class="mini-btn" type="submit" name="decision" value="reject" ${canReset?'':'disabled'}>승인 거절</button></div></form>`).join('')||'<p>추가 교체 신청이 없습니다.</p>'}
          <div class="ox-admin-pagination"><button class="mini-btn" data-device-prev ${page===0?'disabled':''}>이전</button><button class="mini-btn" data-device-next ${(page+1)*30>=data.total?'disabled':''}>다음</button></div>`}
        <p data-device-admin-message role="status"></p></section>`;
      host.querySelector('[data-device-close]').onclick=()=>{version++;onClose();};
      host.querySelector('[data-device-prev]')?.addEventListener('click',()=>{page--;load();});
      host.querySelector('[data-device-next]')?.addEventListener('click',()=>{page++;load();});
      host.querySelectorAll('[data-device-review]').forEach(form=>form.onsubmit=async event=>{
        event.preventDefault();if(busy||!canReset)return;
        const reason=new FormData(form).get('reason').trim();if(!reason)return;
        busy=true;host.querySelectorAll('button').forEach(b=>b.disabled=true);
        try{await api('admin_device_decide',{requestId:form.dataset.id,approve:event.submitter?.value==='approve',reason});await load();}
        catch(error){const node=host.querySelector('[data-device-admin-message]');if(node)node.textContent=error.message;host.querySelectorAll('[data-device-review] button,[data-device-close]').forEach(b=>b.disabled=false);}
        finally{busy=false;}
      });
    }catch(error){if(id===version){host.innerHTML=`<p role="alert">${esc(error.message)}</p><button class="mini-btn" data-device-retry>다시 확인</button>`;host.querySelector('[data-device-retry]').onclick=load;}}
  }
  await load();
}
