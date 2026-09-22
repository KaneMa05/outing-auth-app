// OX-only device policy. Learning records always come from the server on entry/resume.
import {mount as mountLearning} from './criminal-law-ox.js?v=20260922-ox-bulk-grants';

export function mountAccess(host,{request,onReady=()=>{},onManage=()=>{}}) {
  let controller=null,sessionId=null,epoch=0,destroyed=false,busy=false,timer=null,checking=false,resumeRequested=false;
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const date=value=>value?new Date(value).toLocaleString('ko-KR'):'—';
  const messages={device_session_changed:'다른 기기로 학습이 전환되었거나 연결이 만료되었습니다. 저장된 기록을 다시 불러와 이어서 학습할 수 있습니다.',
    device_in_use:'다른 기기에서 OX를 학습 중입니다.',device_not_registered:'기기 등록이 필요합니다.',device_limit_reached:'등록 기기 2대를 사용 중입니다.',
    device_replace_limit:'최근 30일간 직접 교체 1회를 사용했습니다. 추가 교체는 관리자에게 신청해주세요.',
    device_request_changed:'기기 신청 상태가 변경되었습니다. 다시 확인해주세요.',device_unavailable:'등록 기기가 변경되었습니다. 기기 정보를 확인해주세요.',
    ox_disabled:'형사법 OX 학습을 준비하고 있습니다.',ox_not_registered:'OX 이용 등록을 확인해주세요.',ox_book_required:'현재 이용 가능한 교재가 없습니다. 교재 구매·이용권 확인 또는 이용 재개는 학원에 문의해주세요. 기존 풀이 기록과 메모는 보존됩니다.',
    unauthorized:'현재 앱 기기 등록이 해제되었습니다. 홈에서 다시 로그인해주세요.'};
  const connected=()=>!destroyed&&host.isConnected;
  function stop(){epoch++;sessionId=null;controller=null;clearTimeout(timer);timer=null;onReady(false);}
  function shell(title,description,body=''){
    host.innerHTML=`<section class="card ox-device-panel"><h3>${esc(title)}</h3><p role="status">${esc(description)}</p>${body}</section>`;
  }
  function failed(error){
    if(!connected())return;
    stop();shell('OX 이용 확인',messages[error.code]||'연결을 확인하지 못했습니다. 다시 확인한 뒤 학습을 이어가세요.','<button class="btn secondary" data-device-retry>다시 확인</button>');
    host.querySelector('[data-device-retry]').onclick=()=>load();
  }
  async function guarded(action,body={}){
    const version=epoch,token=sessionId;
    if(!token || !connected())throw Object.assign(Error('device_session_changed'),{code:'device_session_changed'});
    try{
      const result=await request(action,{...body,sessionId:token});
      if(version!==epoch || !connected())throw Object.assign(Error('device_session_changed'),{code:'device_session_changed'});
      return result;
    }catch(error){
      if(version===epoch && connected() && (['device_session_changed','device_not_registered','unauthorized','ox_disabled','ox_not_registered','ox_book_required'].includes(error.code) || !error.code))failed(error);
      throw error;
    }
  }
  function schedule(){clearTimeout(timer);if(sessionId && connected() && !document.hidden)timer=setTimeout(heartbeat,60000);}
  async function heartbeat(){
    if(checking || document.hidden || !sessionId || !connected())return;
    checking=true;
    try{await guarded('device_heartbeat');}catch(error){if(sessionId)failed(error);}finally{checking=false;schedule();}
  }
  async function enter(state,takeover=false){
    if(busy || !connected())return;
    busy=true;stop();const version=epoch;
    shell('OX 학습 준비','저장된 학습 기록을 불러오는 중입니다.');
    try{
      const started=await request('device_start',takeover?{takeover:true,expectedSessionId:state.activeSessionId}:{});
      if(version!==epoch || !connected())return;
      sessionId=started.sessionId;
      const bootstrap=await guarded('bootstrap',{summaryOnly:true});
      if(version!==epoch || !connected())return;
      host.innerHTML='<div data-device-learning></div>';
      controller=mountLearning(host.querySelector('[data-device-learning]'),{bootstrap,request:guarded,onAccessRefresh:()=>load()});
      onReady(true);schedule();
    }catch(error){if(version===epoch)failed(error);}finally{busy=false;if(resumeRequested){resumeRequested=false;load();}}
  }
  async function load(manage=false){
    if(busy || !connected())return;
    stop();const version=epoch;
    shell('OX 이용 확인','기기 이용 상태를 확인하고 있습니다.');
    try{
      const state=await request('device_state');
      if(version!==epoch || !connected())return;
      if(state.learningError)failed({code:state.learningError});
      else if(!state.registered){
        shell('기기 등록이 필요합니다','마이의 ‘기기 등록·관리’에서 이 기기를 등록해주세요.','<button class="btn" data-device-my>마이에서 기기 등록</button>');
        host.querySelector('[data-device-my]').onclick=onManage;
      }else if(!state.activeSessionId||state.activeHere)await enter(state);
      else{
        shell('다른 기기에서 학습 중입니다','이 기기로 전환하면 기존 기기의 OX 학습이 종료됩니다. 저장된 답안과 메모는 유지됩니다.','<button class="btn" data-device-enter>이 기기로 이어서 학습</button>');
        host.querySelector('[data-device-enter]').onclick=()=>enter(state,true);
      }
    }catch(error){if(version===epoch)failed(error);}
  }
  function visibility(){
    if(!connected())return;
    if(document.hidden){stop();shell('학습 일시 대기','화면으로 돌아오면 최신 학습 기록과 기기 이용 상태를 확인합니다.');}
    else if(busy)resumeRequested=true;else load();
  }
  document.addEventListener('visibilitychange',visibility);
  let wasConnected=host.isConnected;
  const observer=new MutationObserver(()=>{
    const current=host.isConnected;if(current===wasConnected)return;wasConnected=current;
    if(!current){stop();shell('학습 일시 대기','OX로 돌아오면 학습 기록을 다시 불러옵니다.');}
    else if(!destroyed){if(busy)resumeRequested=true;else load();}
  });
  observer.observe(document.body,{childList:true,subtree:true});
  load();
  return {openBookmarks:()=>controller?.openBookmarks(),openDevices:()=>load(true),destroy:()=>{destroyed=true;stop();observer.disconnect();document.removeEventListener('visibilitychange',visibility);}};
}
