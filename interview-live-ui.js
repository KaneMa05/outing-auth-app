const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function liveRequest(action,payload={}){
 const r=await fetch('/api/interview-live',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,action})});
 const d=await r.json();if(!r.ok||!d.ok)throw Object.assign(Error(d.error),{code:d.error});return d;
}
export {mountLive} from './client/interview-live-view.js?v=20261029-student-live';
export function renderLiveResult(run,cardClass='ip-panel'){
 const r=run.result_report;
 if(!r||r.version!==1)return `<section class="${esc(cardClass)}"><h3>결과 리포트 확인 중</h3><p>${run.state==='unknown'?'서버에서 면접 종료를 확인하고 있습니다.':'저장된 리포트를 아직 확인하지 못했습니다.'} 잠시 후 기록을 다시 확인해주세요.</p></section>`;
 const c=r.counts;
 return `<section class="${esc(cardClass)}" data-live-saved-report><h3>실전 모의면접 결과 리포트</h3><p>${r.state==='completed'?'면접 완료':'중단 시점까지 저장된 기록'} · ${esc(new Date(r.createdAt).toLocaleString('ko-KR'))}</p><dl><dt>저장된 기본 문답 / 배정 문항</dt><dd>${esc(c.mainQuestions)} / ${esc(c.plannedMainQuestions)}</dd><dt>꼬리 문답</dt><dd>${esc(c.followups)}개</dd><dt>완료한 답변</dt><dd>${esc(c.completedAnswers)}개</dd><dt>미완료 답변 / 전사 없는 문답</dt><dd>${esc(c.incompleteAnswers)} / ${esc(c.emptyTranscripts)}</dd></dl>${r.pendingQuestion?`<p>종료 시 진행 질문: ${esc(r.pendingQuestion)}</p>`:''}<p>실시간 전사를 바탕으로 저장한 리포트입니다. 전사 누락은 무응답을 뜻하지 않습니다. 점수·합격 여부를 판정하지 않습니다.</p><h4>다음 연습</h4><ul>${r.nextPractice.map(t=>`<li>${esc(t)}</li>`).join('')}</ul></section>`;
}
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
   box.innerHTML=recordingNote+renderLiveResult(d.run)+`<section class="ip-panel"><h3>면접 기록</h3><p>보관 종료: ${esc(new Date(d.run.retain_until).toLocaleString('ko-KR'))}</p><p class="ip-help">실시간 전사 기록입니다. 확정 채점 결과가 아니며, 필요하면 원음과 함께 확인해주세요.</p>${d.recordings?`<label>학생 음성<audio style="max-width:100%;display:block" controls preload="none" src="${esc(d.recordings.input)}"></audio></label><label>면접관 음성<audio style="max-width:100%;display:block" controls preload="none" src="${esc(d.recordings.output)}"></audio></label><p class="ip-help">재생 링크가 만료되면 기록을 다시 열어주세요. 두 음성은 별도로 재생됩니다.</p>`:'<p class="ip-help">음성 파일을 준비 중이거나 저장을 완료하지 못한 기록입니다.</p>'}${(d.run.result_report?.turns||d.run.turns||[]).map(t=>`<article class="ip-question"><span class="ip-badge">${t.kind==='followup'?'꼬리 질문':'최초 질문'}${t.complete?'':' · 미완료'}</span><h4>${esc(t.question)}</h4>${t.evidence?`<p>꼬리질문의 근거 발언: ${esc(t.evidence)}</p>`:''}<p style="white-space:pre-wrap">${esc(t.answer||'인식된 답변이 없습니다.')}</p></article>`).join('')}</section>`;
  }catch(error){if(!destroyed){const box=host.querySelector('[data-live-detail]');if(box)box.textContent=error.code==='unauthorized'?'로그인이 만료되었습니다. 다시 로그인해주세요.':'기록을 불러오지 못했습니다. 다시 확인해주세요.';}}
  finally{busy=false;if(n.isConnected)n.disabled=false;}
 }
 host.addEventListener('click',click);await refresh();return {refresh,canLeave:()=>true,destroy(){destroyed=true;version++;host.removeEventListener('click',click);host.replaceChildren();}};
}
