const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const modes={job:'직무(전공)',personality:'인성',ai:'실전 모의면접'};
const states={pending:'전사 대기',processing:'전사 중',completed:'전사 완료',failed:'전사 실패'};
const reviews={pending:'미검수',ok:'그대로 써도 됨',minor:'글자만 다름',meaning:'뜻이 바뀜',unclear:'잘 안 들림'};
const date=v=>new Date(v).toLocaleString('ko-KR');
const listDate=v=>new Date(v).toLocaleString('ko-KR',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
const duration=v=>{const s=Math.max(0,Math.round(Number(v||0)));return `${Math.floor(s/60)}분 ${s%60}초`;};
const timestamp=v=>{const s=Math.max(0,Math.floor(v));return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;};
export async function practiceRecordsRequest(action,payload={}){
 const r=await fetch('/api/interview-practice-records',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,action})});
 const d=await r.json();if(!r.ok||!d.ok)throw Object.assign(Error(d.error),{code:d.error});return d;
}
export async function mountPracticeRecords(host,{request=practiceRecordsRequest,canWrite=true}={}){
 let destroyed=false,page=0,version=0,detailVersion=0,audioVersion=0,runId='',search='',mode='',selected=null;
 const dirty=new Set();
 const stopAudio=()=>host.querySelectorAll('audio').forEach(a=>a.pause());
 const canDiscard=()=>!dirty.size||confirm('저장하지 않은 전사 수정 내용이 있습니다. 이동할까요?');
 const errorText=e=>({unauthorized:'로그인이 만료되었습니다. 다시 로그인해주세요.',forbidden:'면접 기록 조회 또는 수정 권한이 없습니다.',revision_conflict:'다른 관리자가 먼저 수정했습니다. 수정 내용을 복사한 뒤 기록을 다시 열어주세요.',report_not_ready:'전사 처리 상태가 바뀌었습니다. 기록을 다시 열어주세요.'}[e.code]||'처리하지 못했습니다. 다시 시도해주세요.');
 host.innerHTML=`<form data-practice-filter class="ip-toolbar"><label>학생 검색<input name="search" maxlength="120" placeholder="학생 이름·수험번호"></label><label>연습 유형<select name="mode"><option value="">전체</option>${Object.entries(modes).map(([key,label])=>`<option value="${key}">${label}</option>`).join('')}</select></label><button type="submit" class="ip-btn">검색</button><button type="button" class="ip-btn" data-practice-refresh>새로고침</button></form><p class="ip-help">전송이 끝난 녹음은 Whisper large-v3로 순서대로 전사합니다. 처리 PC가 꺼져 있으면 대기하며, 전사 완료 후 원본을 들으며 내용을 검수할 수 있습니다.</p><div data-practice-list></div><div data-practice-detail></div>`;
 const list=host.querySelector('[data-practice-list]'),detail=host.querySelector('[data-practice-detail]');
 function turnMarkup(t,index){
  const j=t.transcription,ready=j?.status==='completed';
  return `<details class="ip-practice-turn" data-practice-turn="${esc(t.number)}" ${index===0?'open':''}><summary><strong>${esc(t.number)}. ${esc(t.question)}</strong><span class="ip-badge ${ready?'approved':''}" data-practice-state>${esc(j?states[j.status]:t.uploaded?'전사 대기':'녹음 대기')}</span></summary><div class="ip-practice-turn-body"><p class="ip-help">답변 ${esc(duration(t.duration))}${ready?' · Whisper large-v3 · '+esc(reviews[j.review_status]):''}</p>
   ${t.answer?`<details><summary>기기에서 전송된 답변 글</summary><p class="ip-practice-text">${esc(t.answer)}</p></details>`:''}
   ${t.uploaded?`<button type="button" class="ip-btn" data-practice-listen="${esc(t.number)}">답변 녹음 듣기</button><div data-practice-audio="${esc(t.number)}"></div>`:`<p class="ip-help">${t.audio_bytes===0?'기기에서 녹음 파일을 찾지 못한 답변입니다.':'녹음 전송 대기 중입니다. 학생 앱의 자동 전송이 끝난 뒤 새로고침해주세요.'}</p>`}
   ${ready?`<div class="ip-practice-transcription"><section><h4>자동 전사 원문</h4><p class="ip-help">문장을 누르면 해당 구간을 재생합니다.</p><div class="ip-practice-segments">${j.segments.length?j.segments.map(s=>`<button type="button" data-practice-seek="${esc(t.number)}" data-start="${esc(s.start)}"><time>${esc(timestamp(s.start))}</time><span>${esc(s.text)}</span></button>`).join(''):`<p class="ip-practice-text">${esc(j.transcript||'인식된 말이 없습니다. 원본 녹음을 확인해주세요.')}</p>`}</div></section><form data-practice-review="${esc(t.number)}" data-revision="${esc(j.revision)}"><label>들리는 말로 수정한 내용<textarea name="correctedText" maxlength="30000" rows="8" ${canWrite?'':'disabled'}>${esc(j.review_status!=='pending'||j.reviewed_at?j.corrected_text:j.transcript)}</textarea></label><p class="ip-help">학생이 말한 내용을 그대로 적어주세요. 답변의 정답 여부는 별도 검토합니다.</p><label>전사 검수 결과<select name="reviewStatus" ${canWrite?'':'disabled'}>${Object.entries(reviews).map(([key,label])=>`<option value="${key}" ${j.review_status===key?'selected':''}>${label}</option>`).join('')}</select></label><label>확인 메모<textarea name="note" maxlength="3000" rows="2" ${canWrite?'':'disabled'}>${esc(j.review_note)}</textarea></label><div class="ip-toolbar"><button type="submit" class="ip-btn ip-primary" ${canWrite?'':'disabled'}>검수 저장</button><span class="ip-help" data-practice-save-state role="status">${j.reviewed_at?'저장됨 · '+esc(date(j.reviewed_at)):''}</span></div></form></div>`:
    j?.status==='failed'?`<p class="ip-help">전사를 처리하지 못했습니다.${j.attempts<3?' 자동 재시도를 기다리는 중입니다.':' 녹음을 확인한 뒤 다시 시도해주세요.'}</p><button type="button" class="ip-btn" data-practice-retry="${esc(t.number)}" ${canWrite?'':'disabled'}>전사 다시 시도</button>`:
    t.uploaded?`<p class="ip-help">${j?.status==='processing'?'PC에서 전사하고 있습니다.':'전사 순서를 기다리고 있습니다.'} 위의 ‘전사 상태 새로고침’으로 결과를 확인해주세요.</p>`:''}
   </div></details>`;
 }
 async function refresh(){
  const ticket=++version;detailVersion++;audioVersion++;runId='';selected=null;dirty.clear();stopAudio();detail.replaceChildren();list.textContent='녹음 기록을 불러오는 중…';
  try{
   const d=await request('admin_list',{page,search,mode});if(destroyed||ticket!==version)return;
   list.innerHTML=(d.runs.map(r=>`<article class="ip-practice-record"><div class="ip-practice-record-student"><h3>${esc(r.student_name||r.student_id)}${r.exam_number?` <span>${esc(r.exam_number)}</span>`:''}</h3><p class="ip-practice-record-muted"><time datetime="${esc(r.recorded_at)}">${esc(listDate(r.recorded_at))}</time></p></div><div class="ip-practice-record-context"><p><strong>${esc(modes[r.mode]||r.mode)}</strong> · ${esc(r.track)} <span class="ip-badge ${r.completed?'approved':''}">${r.completed?'완료':r.finished?'중단·미완료':'진행 중·종료 미확인'}</span></p><p class="ip-practice-record-muted">${esc(r.field_label||'전체 분야')}${r.region?' · '+esc(r.region):''}</p></div><div class="ip-practice-record-stats"><p>답변 ${esc(r.answer_count)}/${esc(r.question_count)}개 · ${esc(duration(r.answer_seconds))}</p><p class="ip-practice-record-muted">녹음 ${esc(r.uploaded_count)} · 전사 ${esc(r.transcription?.completed||0)}개${r.transcription?.failed?' · 실패 '+esc(r.transcription.failed):''}</p></div><button type="button" class="ip-btn" data-practice-run="${esc(r.id)}">녹음·전사 보기</button></article>`).join('')||'<p class="ip-help">조건에 맞는 연습 기록이 없습니다.</p>')+`<div class="ip-toolbar ip-practice-record-pages"><button type="button" class="ip-btn" data-practice-prev ${page===0?'disabled':''}>이전</button><span>${page+1}페이지</span><button type="button" class="ip-btn" data-practice-next ${d.hasMore?'':'disabled'}>다음</button></div>`;
  }catch(e){if(!destroyed&&ticket===version)list.textContent=errorText(e);}
 }
 async function openRun(id){
  runId=id;const ticket=++detailVersion;audioVersion++;dirty.clear();stopAudio();detail.textContent='답변을 불러오는 중…';
  try{const d=await request('admin_get',{runId:id});if(destroyed||ticket!==detailVersion)return;selected=d;
   detail.innerHTML=`<section class="ip-panel ip-practice-detail"><div class="ip-toolbar"><h3>${esc(d.run.student_name||d.run.student_id)} · 녹음 기록</h3><button type="button" class="ip-btn" data-practice-status-refresh>전사 상태 새로고침</button></div><p>${esc(date(d.run.recorded_at))} · ${esc(modes[d.run.mode])} · ${esc(d.run.field_label||'전체 분야')}</p>${d.turns.map(turnMarkup).join('')||'<p class="ip-help">아직 전송된 답변이 없습니다.</p>'}</section>`;
  }catch(e){if(!destroyed&&ticket===detailVersion)detail.textContent=errorText(e);}
 }
 async function audio(number,{seek,renew=false}={}){
  const ticket=detailVersion,serial=++audioVersion,id=runId,box=detail.querySelector(`[data-practice-audio="${number}"]`);if(!box)return;
  let player=box.querySelector('audio');
  if(!player||renew){const d=await request('admin_audio',{runId:id,number});if(destroyed||ticket!==detailVersion||serial!==audioVersion||id!==runId)return;
   const url=new URL(d.url);if(url.protocol!=='https:'||!url.pathname.startsWith('/storage/v1/object/sign/interview-practice/'))throw Error('invalid_audio');
   stopAudio();box.innerHTML=`<audio controls preload="none" src="${esc(url.href)}"></audio><p class="ip-help">재생 링크가 만료되면 듣기 버튼을 다시 눌러주세요.</p>`;player=box.querySelector('audio');
  }
  if(seek!==undefined){stopAudio();player.currentTime=seek;try{await player.play();}catch(e){if(e.name!=='AbortError')throw e;}}
 }
 async function click(e){
  const n=e.target.closest('[data-practice-refresh],[data-practice-prev],[data-practice-next],[data-practice-run],[data-practice-listen],[data-practice-seek],[data-practice-status-refresh],[data-practice-retry]');
  if(!n||n.disabled||!host.contains(n))return;
  if(n.matches('[data-practice-refresh],[data-practice-prev],[data-practice-next],[data-practice-run],[data-practice-status-refresh]')&&!canDiscard())return;
  if(n.hasAttribute('data-practice-refresh')){page=0;await refresh();return;}
  if(n.hasAttribute('data-practice-prev')||n.hasAttribute('data-practice-next')){page=Math.max(0,page+(n.hasAttribute('data-practice-next')?1:-1));await refresh();return;}
  n.disabled=true;const ticket=detailVersion;
  try{
   if(n.hasAttribute('data-practice-run'))await openRun(n.dataset.practiceRun);
   else if(n.hasAttribute('data-practice-status-refresh'))await openRun(runId);
   else if(n.hasAttribute('data-practice-listen'))await audio(Number(n.dataset.practiceListen),{renew:true});
   else if(n.hasAttribute('data-practice-seek'))await audio(Number(n.dataset.practiceSeek),{seek:Number(n.dataset.start)});
   else if(n.hasAttribute('data-practice-retry')){
    const number=Number(n.dataset.practiceRetry);await request('admin_retry',{runId,number});if(destroyed||ticket!==detailVersion)return;
    const t=selected.turns.find(t=>t.number===number);t.transcription={...t.transcription,status:'pending',attempts:0};
    detail.querySelector(`[data-practice-turn="${number}"]`).outerHTML=turnMarkup(t,0);
   }
  }catch(error){if(!destroyed&&ticket===detailVersion){const article=n.closest('.ip-practice-turn-body')||detail;const p=document.createElement('p');p.className='ip-help';p.setAttribute('role','alert');p.textContent=errorText(error);article.appendChild(p);}}
  finally{if(n.isConnected)n.disabled=false;}
 }
 async function submit(e){
  const form=e.target;if(!form.matches('[data-practice-filter],[data-practice-review]'))return;e.preventDefault();
  if(form.matches('[data-practice-filter]')){if(!canDiscard())return;search=form.elements.search.value.trim();mode=form.elements.mode.value;page=0;await refresh();return;}
  if(!canWrite)return;const number=Number(form.dataset.practiceReview),button=form.querySelector('button[type=submit]'),message=form.querySelector('[data-practice-save-state]');if(button.disabled)return;
  const payload={runId,number,revision:Number(form.dataset.revision),reviewStatus:form.elements.reviewStatus.value,correctedText:form.elements.correctedText.value,note:form.elements.note.value};
  if(payload.reviewStatus==='pending'){message.textContent='검수 결과를 선택해주세요.';return;}
  const ticket=detailVersion;form.querySelectorAll('textarea,select,button').forEach(n=>n.disabled=true);message.textContent='저장 중…';
  try{await request('admin_review',payload);if(destroyed||ticket!==detailVersion)return;form.dataset.revision=String(payload.revision+1);dirty.delete(number);message.textContent='검수를 저장했습니다.';
   const t=selected.turns.find(t=>t.number===number);Object.assign(t.transcription,{review_status:payload.reviewStatus,corrected_text:payload.correctedText,review_note:payload.note,revision:payload.revision+1,reviewed_at:new Date().toISOString()});
  }catch(error){if(!destroyed&&ticket===detailVersion)message.textContent=errorText(error);}finally{if(form.isConnected)form.querySelectorAll('textarea,select,button').forEach(n=>n.disabled=false);}
 }
 function edit(e){const form=e.target.closest('[data-practice-review]');if(!form)return;dirty.add(Number(form.dataset.practiceReview));form.querySelector('[data-practice-save-state]').textContent='아직 저장하지 않음';}
 const beforeUnload=e=>{if(dirty.size){e.preventDefault();e.returnValue='';}};
 host.addEventListener('click',click);host.addEventListener('submit',submit);host.addEventListener('input',edit);host.addEventListener('change',edit);window.addEventListener('beforeunload',beforeUnload);await refresh();
 return {refresh,canLeave:()=>!dirty.size,destroy(){destroyed=true;version++;detailVersion++;audioVersion++;stopAudio();window.removeEventListener('beforeunload',beforeUnload);host.removeEventListener('click',click);host.removeEventListener('submit',submit);host.removeEventListener('input',edit);host.removeEventListener('change',edit);host.replaceChildren();}};
}
