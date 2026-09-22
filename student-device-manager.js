// Shared by My and password-verified login recovery. No book or learning grants.
export function mountDeviceManager(host,{request,onRegistered=()=>{}}){
  let destroyed=false,version=0,busy=false;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const date=v=>v?new Date(v).toLocaleString('ko-KR'):'—';
  const messages={unauthorized:'로그인 정보를 다시 확인해주세요.',device_replace_limit:'최근 30일간 직접 교체 1회를 사용했습니다. 새 기기의 로그인 화면에서 추가 교체를 신청해주세요.',device_request_changed:'기기 또는 신청 상태가 바뀌었습니다. 다시 확인해주세요.',device_unavailable:'등록 정보가 바뀌었습니다. 로그인 정보를 다시 확인하고 신청해주세요.',device_already_registered:'이미 등록된 기기입니다.'};
  const connected=()=>!destroyed&&host.isConnected;
  async function load(){
    if(!connected()||busy)return;const current=++version;
    host.innerHTML='<p role="status">등록 기기를 확인하고 있습니다.</p>';
    try{
      const state=await request('device_state');if(!connected()||current!==version)return;
      const pending=state.request?.status==='pending';
      host.innerHTML=`<section class="card ox-device-panel"><h3>기기 등록·관리</h3><p>앱에 등록한 기기를 모든 기능에서 함께 사용합니다. 최대 2대까지 등록할 수 있습니다.</p>
        <ul class="ox-device-list">${state.devices.map(d=>`<li><strong>${esc(d.label)}</strong>${d.current?' · 이 기기':''}<small>등록일 ${esc(date(d.registeredAt))}</small>${state.registered&&!d.current?`<button class="mini-btn" data-device-release="${esc(d.id)}" ${state.canReplace?'':'disabled'}>새 기기를 위해 해제</button>`:''}</li>`).join('')||'<li>등록된 기기가 없습니다.</li>'}</ul>
        <p>새 기기로 직접 교체는 최근 30일간 1회 가능합니다. 추가 교체는 관리자 승인이 필요합니다.</p>
        ${state.nextReplacementAt?`<p>다음 직접 교체 가능: ${esc(date(state.nextReplacementAt))}</p>`:''}
        ${pending?'<p role="status">추가 기기 교체 승인 대기 중입니다.</p><button class="mini-btn" data-device-cancel>교체 신청 취소</button>':state.request?.status==='rejected'?`<p>교체 신청이 승인되지 않았습니다. ${esc(state.request.reviewReason)}</p>`:''}
        ${state.registered?'<p data-device-registered role="status">이 기기는 등록되어 있습니다. 새 기기는 해당 기기의 앱 로그인에서 등록해주세요.</p>':`
          <form data-device-replace><label>교체할 기존 기기<select name="targetDeviceId" required>${state.devices.map(d=>`<option value="${esc(d.id)}">${esc(d.label)}</option>`).join('')}</select></label>
          <label>교체 사유<textarea name="reason" maxlength="500" rows="3" required placeholder="예: 휴대폰 교체, 분실"></textarea></label>
          <p>교체하면 선택한 기존 기기의 앱 이용이 종료됩니다. 학습 기록과 교재 구매 권한은 유지됩니다.</p>
          <button class="btn" type="submit" ${pending||!state.devices.length?'disabled':''}>${state.canReplace?'선택한 기기를 이 기기로 교체':'관리자에게 추가 교체 신청'}</button></form>`}
        <p role="status" data-device-message></p><button class="mini-btn" data-device-check>이용 상태 확인</button></section>`;
      host.querySelector('[data-device-check]').onclick=load;
      host.querySelector('[data-device-cancel]')?.addEventListener('click',()=>mutate('device_request_cancel'));
      host.querySelectorAll('[data-device-release]').forEach(button=>button.onclick=()=>{
        if(confirm('선택한 기기의 앱 이용을 종료하고 새 기기를 등록할 자리를 비웁니다. 최근 30일간 직접 교체 1회에 포함됩니다. 계속할까요?'))mutate('revoke',{targetDeviceId:button.dataset.deviceRelease,reason:'새 기기 등록을 위한 해제'});
      });
      host.querySelector('[data-device-replace]')?.addEventListener('submit',event=>{
        event.preventDefault();const body=Object.fromEntries(new FormData(event.target));body.reason=body.reason.trim();
        if(body.reason)mutate(state.canReplace?'device_replace':'device_request',body);
      });
      if(state.registered)onRegistered();
    }catch(error){if(connected()&&current===version){host.innerHTML=`<p role="alert">${esc(messages[error.code]||'기기 정보를 확인하지 못했습니다. 잠시 후 다시 시도해주세요.')}</p><button class="mini-btn" data-device-check>다시 확인</button>`;host.querySelector('button').onclick=load;}}
  }
  async function mutate(action,body={}){
    if(busy||!connected())return;busy=true;host.querySelectorAll('button').forEach(b=>b.disabled=true);
    try{await request(action,body);busy=false;await load();}
    catch(error){busy=false;if(connected()){host.querySelector('[data-device-message]').textContent=messages[error.code]||'처리하지 못했습니다. 상태를 다시 확인해주세요.';host.querySelector('[data-device-check]').disabled=false;}}
  }
  const visibility=()=>{if(!document.hidden)load();};
  document.addEventListener('visibilitychange',visibility);
  const destroy=()=>{destroyed=true;version++;observer.disconnect();document.removeEventListener('visibilitychange',visibility);};
  const observer=new MutationObserver(()=>{if(!host.isConnected)destroy();});observer.observe(document.body,{childList:true,subtree:true});
  load();return {destroy};
}
