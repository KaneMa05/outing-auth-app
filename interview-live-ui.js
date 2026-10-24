const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function liveRequest(action,payload={}){
 const r=await fetch('/api/interview-live',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,action})});
 const d=await r.json();if(!r.ok||!d.ok)throw Object.assign(Error(d.error),{code:d.error});return d;
}
export {mountLive} from './client/interview-live-view.js?v=20261021-flow';
export async function mountLiveHistory(host,{request=liveRequest,admin=false}={}){
 let destroyed=false,version=0,busy=false,page=0;
 const labels={starting:'연결 중',active:'진행 중',closing:'저장 중',completed:'완료',interrupted:'중단',unknown:'종료 확인 필요'};
 async function refresh(){const ticket=++version;try{const d=await request(admin?'admin_list':'list',{page});if(destroyed||ticket!==version)return;
  host.innerHTML=`<button class="ip-btn" type="button" data-live-refresh>기록 새로고침</button>${d.runs.map(r=>`<article class="ip-question"><p>${admin?esc(r.student_id)+' · ':''}${esc(new Date(r.created_at).toLocaleString('ko-KR'))} · ${esc(labels[r.state]||r.state)}</p><button type="button" class="ip-btn" data-live-record="${esc(r.id)}">질문·답변과 음성 보기</button></article>`).join('')||'<p class="ip-help">저장된 음성 면접 기록이 없습니다.</p>'}<div class="ip-toolbar"><button type="button" class="ip-btn" data-live-prev ${page===0?'disabled':''}>이전 기록</button><span>${page+1}페이지</span><button type="button" class="ip-btn" data-live-next ${d.hasMore?'':'disabled'}>다음 기록</button></div><div data-live-detail></div>`;
 }catch{if(!destroyed&&ticket===version)host.innerHTML='<p class="ip-help">면접 기록을 불러오지 못했습니다.</p><button type="button" class="ip-btn" data-live-refresh>다시 확인</button>';}}
 async function click(e){const n=e.target.closest('[data-live-record],[data-live-refresh],[data-live-prev],[data-live-next]');if(!n||n.disabled||busy)return;busy=true;n.disabled=true;
  try{if(n.hasAttribute('data-live-prev')||n.hasAttribute('data-live-next')){page+=n.hasAttribute('data-live-next')?1:-1;await refresh();return;}if(n.hasAttribute('data-live-refresh')){page=0;await refresh();return;}const d=await request(admin?'admin_get':'get',{runId:n.dataset.liveRecord});if(destroyed)return;
   const box=host.querySelector('[data-live-detail]');if(!box)return;
   const recordingNote=d.run.recording_partial?'<p class="ip-help" role="status">연결 중단 후 복구한 음성입니다. 마지막 저장 이후 구간이 빠져 있을 수 있습니다.</p>':'';
   box.innerHTML=recordingNote+`<section class="ip-panel"><h3>면접 기록</h3><p>보관 종료: ${esc(new Date(d.run.retain_until).toLocaleString('ko-KR'))}</p><p class="ip-help">실시간 전사 기록입니다. 확정 채점 결과가 아니며, 필요하면 원음과 함께 확인해주세요.</p>${d.recordings?`<label>학생 음성<audio style="max-width:100%;display:block" controls preload="none" src="${esc(d.recordings.input)}"></audio></label><label>면접관 음성<audio style="max-width:100%;display:block" controls preload="none" src="${esc(d.recordings.output)}"></audio></label><p class="ip-help">재생 링크가 만료되면 기록을 다시 열어주세요. 두 음성은 별도로 재생됩니다.</p>`:'<p class="ip-help">음성 파일을 준비 중이거나 저장을 완료하지 못한 기록입니다.</p>'}${(d.run.turns||[]).map(t=>`<article class="ip-question"><span class="ip-badge">${t.kind==='followup'?'꼬리 질문':'최초 질문'}${t.complete?'':' · 미완료'}</span><h4>${esc(t.question)}</h4><p style="white-space:pre-wrap">${esc(t.answer||'답변 없음')}</p></article>`).join('')}</section>`;
  }catch(error){if(!destroyed){const box=host.querySelector('[data-live-detail]');if(box)box.textContent=error.code==='unauthorized'?'로그인이 만료되었습니다. 다시 로그인해주세요.':'기록을 불러오지 못했습니다. 다시 확인해주세요.';}}
  finally{busy=false;if(n.isConnected)n.disabled=false;}
 }
 host.addEventListener('click',click);await refresh();return {refresh,canLeave:()=>true,destroy(){destroyed=true;version++;host.removeEventListener('click',click);host.replaceChildren();}};
}
