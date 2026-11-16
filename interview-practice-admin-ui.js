const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const modes={job:'직무(전공)',personality:'인성',ai:'실전 모의면접'};
const date=v=>new Date(v).toLocaleString('ko-KR');
const duration=v=>{const seconds=Math.max(0,Math.round(Number(v||0)));return `${Math.floor(seconds/60)}분 ${seconds%60}초`;};
export async function practiceRecordsRequest(action,payload={}){
 const r=await fetch('/api/interview-practice-records',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,action})});
 const d=await r.json();if(!r.ok||!d.ok)throw Object.assign(Error(d.error),{code:d.error});return d;
}
export async function mountPracticeRecords(host,{request=practiceRecordsRequest}={}){
 let destroyed=false,page=0,version=0,detailVersion=0,runId='',search='',mode='';
 const stopAudio=()=>host.querySelectorAll('audio').forEach(a=>a.pause());
 host.innerHTML=`<form data-practice-filter class="ip-toolbar"><label>학생 검색<input name="search" maxlength="120" placeholder="학생 이름·수험번호"></label><label>연습 유형<select name="mode"><option value="">전체</option>${Object.entries(modes).map(([key,label])=>`<option value="${key}">${label}</option>`).join('')}</select></label><button type="submit" class="ip-btn">검색</button><button type="button" class="ip-btn" data-practice-refresh>새로고침</button></form><p class="ip-help">앱에서 전송된 연습 기록입니다. 연결이 끊긴 기기의 답변은 재전송이 끝난 뒤 표시됩니다. 녹음은 답변별 듣기 버튼을 눌러 확인할 수 있습니다.</p><div data-practice-list></div><div data-practice-detail></div>`;
 const list=host.querySelector('[data-practice-list]'),detail=host.querySelector('[data-practice-detail]');
 const errorText=e=>e.code==='unauthorized'?'로그인이 만료되었습니다. 다시 로그인해주세요.':e.code==='forbidden'?'면접 기록 조회 권한이 없습니다.':'기록을 불러오지 못했습니다. 다시 시도해주세요.';
 async function refresh(){
  const ticket=++version;detailVersion++;runId='';stopAudio();detail.replaceChildren();list.textContent='연습 현황을 불러오는 중…';
  try{
   const d=await request('admin_list',{page,search,mode});if(destroyed||ticket!==version)return;
   list.innerHTML=(d.runs.map(r=>`<article class="ip-question"><h3>${esc(r.student_name||r.student_id)}${r.exam_number?' · '+esc(r.exam_number):''}</h3><p>${esc(date(r.recorded_at))} · ${esc(modes[r.mode]||r.mode)} · ${esc(r.track)}</p><p>${esc(r.field_label||'전체 분야')}${r.region?' · '+esc(r.region):''}</p><p>답변 ${esc(r.answer_count)}/${esc(r.question_count)}개 · ${esc(duration(r.answer_seconds))} · ${r.completed?'완료':r.finished?'중단·미완료':'진행 중·종료 미확인'}</p><p>녹음 전송 ${esc(r.uploaded_count)}/${esc(r.answer_count)}개</p><button type="button" class="ip-btn" data-practice-run="${esc(r.id)}">질문·답변 녹음 보기</button></article>`).join('')||'<p class="ip-help">조건에 맞는 연습 기록이 없습니다.</p>')+`<div class="ip-toolbar"><button type="button" class="ip-btn" data-practice-prev ${page===0?'disabled':''}>이전</button><span>${page+1}페이지</span><button type="button" class="ip-btn" data-practice-next ${d.hasMore?'':'disabled'}>다음</button></div>`;
  }catch(e){if(!destroyed&&ticket===version)list.textContent=errorText(e);}
 }
 async function click(e){
  const n=e.target.closest('[data-practice-refresh],[data-practice-prev],[data-practice-next],[data-practice-run],[data-practice-listen]');
  if(!n||n.disabled||!host.contains(n))return;
  if(n.hasAttribute('data-practice-refresh')){page=0;await refresh();return;}
  if(n.hasAttribute('data-practice-prev')||n.hasAttribute('data-practice-next')){page=Math.max(0,page+(n.hasAttribute('data-practice-next')?1:-1));await refresh();return;}
  n.disabled=true;
  const ticket=++detailVersion;
  try{
   if(n.hasAttribute('data-practice-run')){
    runId=n.dataset.practiceRun;stopAudio();detail.textContent='답변을 불러오는 중…';
    const d=await request('admin_get',{runId});if(destroyed||ticket!==detailVersion)return;
    detail.innerHTML=`<section class="ip-panel"><h3>${esc(d.run.student_name||d.run.student_id)} · 연습 기록</h3><p>${esc(date(d.run.recorded_at))} · ${esc(modes[d.run.mode])} · ${esc(d.run.field_label||'전체 분야')}</p>${d.turns.map(t=>`<article class="ip-question"><h4>${esc(t.number)}. ${esc(t.question)}</h4><p>답변 ${esc(duration(t.duration))}</p>${t.answer?`<p style="white-space:pre-wrap">${esc(t.answer)}</p>`:''}${t.uploaded?`<button type="button" class="ip-btn" data-practice-listen="${esc(t.number)}">답변 녹음 듣기</button><div data-practice-audio="${esc(t.number)}"></div>`:`<p class="ip-help">${t.audio_bytes===0?'기기에서 녹음 파일을 찾지 못한 답변입니다.':'녹음 전송 대기 중입니다. 학생 앱의 자동 전송이 끝난 뒤 새로고침해주세요.'}</p>`}</article>`).join('')||'<p class="ip-help">아직 전송된 답변이 없습니다.</p>'}</section>`;
   }else{
    const number=Number(n.dataset.practiceListen),selectedRun=runId;
    const d=await request('admin_audio',{runId:selectedRun,number});if(destroyed||ticket!==detailVersion||selectedRun!==runId)return;
    const url=new URL(d.url);
    if(url.protocol!=='https:'||!url.pathname.startsWith('/storage/v1/object/sign/interview-practice/'))throw Error('invalid_audio');
    stopAudio();const box=detail.querySelector(`[data-practice-audio="${number}"]`);
    if(box)box.innerHTML=`<audio style="display:block;max-width:100%" controls preload="none" src="${esc(url.href)}"></audio><p class="ip-help">재생 링크가 만료되면 듣기 버튼을 다시 눌러주세요.</p>`;
   }
  }catch(error){if(!destroyed&&ticket===detailVersion)detail.textContent=errorText(error);}
  finally{if(n.isConnected)n.disabled=false;}
 }
 function submit(e){e.preventDefault();const form=e.target;if(!form.matches('[data-practice-filter]'))return;search=form.elements.search.value.trim();mode=form.elements.mode.value;page=0;void refresh();}
 host.addEventListener('click',click);host.addEventListener('submit',submit);await refresh();
 return {refresh,canLeave:()=>true,destroy(){destroyed=true;version++;detailVersion++;stopAudio();host.removeEventListener('click',click);host.removeEventListener('submit',submit);host.replaceChildren();}};
}
