import {openAttemptStore} from './interview-attempts/indexeddb.mjs';
import {createAttempts} from './interview-attempts/core.mjs';
import {recordAttempt} from './interview-attempts/recorder.mjs';
import {recoverAttempts,withAttemptLease} from './interview-attempts/recovery.mjs';
import {openPersonalitySubmissions} from './interview-personality-submissions.mjs';
import {toExamWav,audioBase64} from './interview-job-exam-audio.mjs';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={started:'연습 시작',uploading:'답변 저장 중',upload_failed:'저장 재시도 가능',evaluating:'구조 분석 중',completed:'리포트 확인 가능',unknown:'처리 확인 필요',cancelled:'응시 취소',expired:'제출 시간 만료'};
const errors={practice_not_configured:'인성 연습 서비스를 준비하고 있습니다.',not_enrolled:'면접반 수강 등록과 이용 기간을 확인해주세요.',questions_unavailable:'연습할 수 있는 승인 문항이 없습니다.',daily_limit:'오늘의 응시 가능 횟수를 모두 사용했습니다.',admission_busy:'진행 중인 응시를 먼저 확인해주세요.',session_expired:'제출 시간이 지났습니다. 기기 녹음은 보존됩니다.',invalid_audio_duration:'1초 이상 답변을 녹음해주세요.',empty_recording:'녹음된 음성을 확인하지 못했습니다. 응시를 취소하고 마이크를 점검한 뒤 다시 시작해주세요.',attempt_in_use:'다른 창에서 이 응시를 사용 중입니다.',queue_full:'다른 응시를 처리 중입니다. 잠시 후 제출해주세요.',recording_unavailable:'음성을 서버에 저장하지 못했습니다. 기기 원본은 보존됩니다.',NotAllowedError:'마이크 권한을 허용한 뒤 시작해주세요.',attempt_lock_unsupported:'이 브라우저는 안전한 녹음 저장을 지원하지 않습니다. 최신 브라우저를 사용해주세요.'};
export function mountPersonalityPractice(host,{request,accountId,mediaDevices=globalThis.navigator?.mediaDevices,openStore=openAttemptStore,openPrepared=openPersonalitySubmissions,createRecorder=recordAttempt,convert=toExamWav,locks=globalThis.navigator?.locks}={}){
 let destroyed=false,busy=false,recording=false,available=false,store,prepared,attempts,questions=[],runs=[],locals=[],run=null,recorder,stream,lease,releaseLease,timer,audioUrl='',remoteAudio='',page=0,hasMore=false,qpage=0,qmore=false,notice='이용 가능 여부를 확인하고 있습니다.';
 const status=text=>{notice=text;if(!destroyed){const n=host.querySelector('[data-personality-status]');if(n)n.textContent=text;}};
 const releaseStream=()=>{stream?.getTracks().forEach(t=>t.stop());stream=null;};
 const requestSafe=async(action,body={})=>request(action,body);
 function reportMarkup(report){
  if(!report)return '';
  const names={conclusion:'결론',reason:'이유',experience:'경험',closing:'마무리'},presence={present:'있음',missing:'누락',uncertain:'확인 필요'},quality={clear:'충분',partial:'보완 필요',insufficient:'구체성 부족',not_assessable:'충실도 판단 불가'};
  const analysis=report.analysis;
  const reasons={audio_too_quiet:'녹음된 음성이 작거나 발화가 부족합니다.',audio_clipped:'음성이 깨져 원음 확인이 필요합니다.',transcript_disagreement:'음성 인식 결과가 서로 달라 구조 분석을 보류했습니다.',empty_transcript:'답변을 인식하지 못했습니다.',transcription_failed:'답변을 전사하지 못했습니다.',invalid_evidence:'답변 원문에서 분석 근거를 확인하지 못했습니다.',invalid_structure:'분석 응답을 확인하지 못했습니다.',inconsistent_structure:'분석 근거가 일치하지 않아 확인이 필요합니다.',analysis_failed:'구조 분석을 완료하지 못했습니다.'};
  if(!analysis)return `<section class="ip-panel" data-personality-report><h3>인성 연습 리포트</h3><p>구조 분석을 보류했습니다. 점수나 성격을 판정한 결과가 아닙니다.</p><ul>${(report.reasons||[]).map(r=>`<li>${esc(reasons[r]||'원음과 답변을 확인해주세요.')}</li>`).join('')}</ul><p style="white-space:pre-wrap">${esc(report.transcripts?.[0]||'')}</p></section>`;
  const order={expected:'확인된 요소는 권장 순서를 따릅니다.',off_order:'확인된 요소의 순서가 권장 순서와 다릅니다.',uncertain:'근거가 반복되거나 겹쳐 순서를 확정하기 어렵습니다.',insufficient_evidence:'순서를 확인할 요소가 부족합니다.'};
  return `<section class="ip-panel" data-personality-report><h3>인성 연습 리포트</h3><p>답변 구성에 대한 연습 피드백입니다. 성격·합격 가능성·점수를 판정하지 않습니다.</p><p>${esc(analysis.summary)}</p>
   ${analysis.components.map(c=>`<article><h4>${esc(names[c.id])} · ${esc(presence[c.presence])} · ${esc(quality[c.quality])}</h4>${c.quote?`<blockquote style="white-space:pre-wrap">${esc(c.quote)}</blockquote>`:'<p>원문에서 확인한 근거가 없습니다.</p>'}<p>${esc(c.feedback)}</p></article>`).join('')}
   <h4>경험의 구체성</h4>${['situation','action','result'].map(id=>{const e=analysis.experienceEvidence[id];return `<p><strong>${esc({situation:'상황',action:'본인의 행동',result:'결과'}[id])}</strong>: ${esc(e.quote||'확인된 근거 없음')}</p>`;}).join('')}
   <h4>답변 순서</h4><p>${esc(order[analysis.order.status])}</p><p>${analysis.order.sequence.map(id=>esc(names[id])).join(' → ')}</p>
   <h4>내용 연결</h4>${analysis.connections.map(c=>`<article><strong>${esc(names[c.from])} → ${esc(names[c.to])} · ${esc({connected:'연결됨',weak:'연결 보완',uncertain:'확인 필요'}[c.status])}</strong>${c.quote?`<blockquote>${esc(c.quote)}</blockquote>`:''}<p>${esc(c.feedback)}</p></article>`).join('')}
   <h4>반복·모순 확인</h4>${analysis.issues.length?analysis.issues.map(issue=>`<article><strong>${issue.kind==='repetition'?'반복':'내용 모순 검토'}</strong><blockquote>${esc(issue.firstQuote)}</blockquote><blockquote>${esc(issue.secondQuote)}</blockquote><p>${esc(issue.feedback)}</p></article>`).join(''):'<p>이번 분석에서 별도로 지적된 항목이 없습니다.</p>'}
   <h4>다음 연습</h4><p>${esc(analysis.nextPractice)}</p><h4>답변 전사</h4><p style="white-space:pre-wrap">${esc(report.transcripts?.[0]||'')}</p></section>`;
 }
 function draw(){if(destroyed)return;
  const locked=busy||recording;
  host.innerHTML=`<section class="ip-panel"><h2>인성 연습모드</h2><p>문항별 최대 90초 · 하루 최대 3회. 녹음 종료 후 답변을 확인하고 제출하세요.</p><p>제출한 답변은 결론·이유·경험·마무리 구조를 분석합니다. 녹음은 이 기기에 임시 저장됩니다. 제출 시 음성이 서버와 AI 분석 서비스로 전송됩니다.</p><p role="status" data-personality-status>${esc(notice)}</p>
   <label>연습 문항<select data-personality-question ${locked?'disabled':''}>${questions.map(q=>`<option value="${esc(q.id)}">${esc(q.prompt)}</option>`).join('')}</select></label>
   <button class="ip-btn" type="button" data-personality-action="qprev" ${locked||qpage===0?'disabled':''}>앞 문항</button><button class="ip-btn" type="button" data-personality-action="qnext" ${locked||!qmore?'disabled':''}>다음 문항</button>
   <button class="ip-btn ip-primary" type="button" data-personality-action="start" ${locked||!available||!questions.length||!attempts?'disabled':''}>녹음 시작</button>
   <button class="ip-btn" type="button" data-personality-action="stop" ${!recording||busy?'disabled':''}>녹음 종료</button><span role="timer" data-personality-clock></span></section>
   ${run?`<section class="ip-panel"><h3>${esc(run.question.prompt)}</h3><p>${esc(labels[run.state]||run.state)}</p><p>보관 종료: ${esc(new Date(run.retainUntil).toLocaleString('ko-KR'))}</p>
   ${audioUrl||remoteAudio?`<audio controls preload="metadata" style="max-width:100%" src="${esc(audioUrl||remoteAudio)}"></audio>`:''}
   <button class="ip-btn ip-primary" type="button" data-personality-action="submit" ${locked||!audioUrl||!['started','upload_failed'].includes(run.state)?'disabled':''}>답변 제출</button>
   <button class="ip-btn" type="button" data-personality-action="check" ${locked?'disabled':''}>결과 확인</button>
   <button class="ip-btn" type="button" data-personality-action="cancel" ${locked||run.state!=='started'?'disabled':''}>연습 취소</button></section>${reportMarkup(run.report)}`:''}
   <section class="ip-panel"><h3>내 인성 연습 기록</h3><button class="ip-btn" type="button" data-personality-action="refresh" ${locked?'disabled':''}>기록 새로고침</button>
   ${runs.map(r=>`<p><button class="ip-btn" type="button" data-personality-open="${esc(r.id)}" ${locked?'disabled':''}>${esc(r.question.prompt)} · ${esc(labels[r.state])}</button></p>`).join('')||'<p>저장된 응시 기록이 없습니다.</p>'}
   <button class="ip-btn" type="button" data-personality-action="prev" ${locked||!page?'disabled':''}>이전 기록</button><button class="ip-btn" type="button" data-personality-action="next" ${locked||!hasMore?'disabled':''}>다음 기록</button></section>
   ${locals.length?`<section class="ip-panel"><h3>이 기기에 저장한 인성 녹음</h3><p>중단·전송 실패 시에도 원본은 남습니다. 제출 시간이 지난 기록은 새 응시에서 다시 녹음해주세요.</p>${locals.map(r=>`<p><button class="ip-btn" type="button" data-personality-open="${esc(r.id)}" ${locked?'disabled':''}>${esc(r.questions[0].prompt)} · ${esc(new Date(r.createdAt).toLocaleString('ko-KR'))}</button><button class="ip-btn" type="button" data-personality-delete="${esc(r.id)}" ${locked?'disabled':''}>기기 녹음 삭제</button></p>`).join('')}</section>`:''}`;
 }
 async function loadList(){const data=await requestSafe('list',{page});if(destroyed)return;runs=data.runs;hasMore=data.hasMore;if(attempts)locals=(await attempts.list(accountId)).filter(r=>r.mode==='personality');}
 async function open(id){const data=await requestSafe('get',{id});if(destroyed)return;
  run=data.run;remoteAudio=data.audioUrl||'';if(audioUrl)URL.revokeObjectURL(audioUrl);audioUrl='';
  if(attempts)try{const blob=await attempts.audio(accountId,id);if(blob.size)audioUrl=URL.createObjectURL(blob);}catch{}
  if(destroyed){if(audioUrl)URL.revokeObjectURL(audioUrl);return;}
  status(run.state==='completed'?'저장된 리포트를 조회했습니다.':run.state==='unknown'?'처리 상태를 확인해야 합니다. 유료 분석을 자동 재실행하지 않습니다.':labels[run.state]);
 }
 async function stop(){if(!recorder||busy)return;busy=true;clearInterval(timer);let message='녹음 종료 · 재생 후 답변을 제출해주세요.';
  try{await recorder.stop();status('녹음이 기기에 저장되었습니다. 재생 후 답변을 제출해주세요.');}
  catch(e){message=errors[e.message]||'녹음을 완전히 저장하지 못했습니다. 기기 기록을 확인해주세요.';status(message);}
  finally{recording=false;recorder=null;releaseStream();releaseLease?.();await lease?.catch(()=>{});busy=false;}
  if(!destroyed){await open(run.id);await loadList();draw();status(message);}
 }
 async function start(){
  if(!attempts||!locks)throw Error('attempt_lock_unsupported');
  const questionId=host.querySelector('[data-personality-question]').value;
  if(!mediaDevices?.getUserMedia)throw Error('recording_unsupported');
  stream=await mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
  if(destroyed){releaseStream();return;}
  const data=await requestSafe('start',{questionId,requestKey:crypto.randomUUID()});
  if(destroyed){releaseStream();await requestSafe('cancel',{id:data.run.id}).catch(()=>{});return;}
  run=data.run;remoteAudio='';if(audioUrl)URL.revokeObjectURL(audioUrl);audioUrl='';
  let readyResolve,readyReject;const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
  lease=withAttemptLease(run.id,async()=>{
   try{
    await createAttempts({store,uuid:()=>run.id}).start({accountId,mode:'personality',questions:[run.question]});
    if(destroyed)throw Error('view_destroyed');
    recorder=createRecorder({attempts,accountId,id:run.id,stream,onError:()=>{status('녹음 저장에 문제가 생겼습니다. 원본 기록을 확인해주세요.');void stop().catch(()=>{});}});
    await new Promise(resolve=>{releaseLease=resolve;recording=true;readyResolve();});
   }catch(e){readyReject(e);throw e;}
  },{locks});
  lease.catch(readyReject);await ready;
  const started=Date.now();timer=setInterval(()=>{
   const left=Math.max(0,90-Math.floor((Date.now()-started)/1000));const n=host.querySelector('[data-personality-clock]');if(n)n.textContent=left+'초 남음';
   if(!left)void stop().catch(e=>status(e.message));
  },200);
  status('녹음 중입니다. 답변을 마치면 녹음 종료를 눌러주세요.');
 }
 host.onclick=async e=>{
  const b=e.target.closest('[data-personality-action],[data-personality-open],[data-personality-delete]');if(!b||b.disabled||busy||destroyed)return;
  e.stopPropagation();const action=b.dataset.personalityAction;if(action==='stop'){try{await stop();}catch(e){status('기기 녹음은 보존됩니다. 기록 새로고침으로 확인해주세요.');draw();}return;}if(recording)return;
  busy=true;
  try{
   if(b.dataset.personalityOpen)await open(b.dataset.personalityOpen);
   else if(b.dataset.personalityDelete){if(confirm('이 기기의 녹음만 삭제할까요? 서버 응시 기록은 유지됩니다.'))await withAttemptLease(b.dataset.personalityDelete,async()=>{
    await attempts.remove(accountId,b.dataset.personalityDelete);await prepared.remove(accountId,b.dataset.personalityDelete);
    if(run?.id===b.dataset.personalityDelete&&audioUrl){URL.revokeObjectURL(audioUrl);audioUrl='';}
   },{locks});}
   else if(action==='start')await start();
   else if(action==='submit')await withAttemptLease(run.id,async()=>{
    status('답변을 전송하고 답변 구조를 분석하고 있습니다.');
    let wav=await prepared.get(accountId,run.id);
    if(!wav)wav=await prepared.put(accountId,run.id,await convert(await attempts.audio(accountId,run.id)));
    if(destroyed)return;
    const data=await requestSafe('submit',{id:run.id,audioBase64:await audioBase64(wav)});
    if(destroyed)return;run=data.run;remoteAudio=data.audioUrl||'';status(run.state==='completed'?'답변과 리포트를 서버에 저장했습니다.':'서버에서 처리 중입니다. 결과 확인 버튼으로 확인해주세요.');
   },{locks});
   else if(action==='check')await open(run.id);
   else if(action==='cancel'){await requestSafe('cancel',{id:run.id});await open(run.id);}
   else if(['prev','next'].includes(action))page=Math.max(0,page+(action==='next'?1:-1));
   else if(['qprev','qnext'].includes(action)){qpage=Math.max(0,qpage+(action==='qnext'?1:-1));const data=await requestSafe('questions',{page:qpage});questions=data.questions;qmore=data.hasMore;}
   if(!recording)await loadList();
  }catch(e){releaseStream();status(errors[e.code||e.name]||errors[e.message]||'처리하지 못했습니다. 기기 녹음은 보존됩니다. 기록과 연결 상태를 확인해주세요.');}
  finally{busy=false;draw();}
 };
 const beforeUnload=e=>{if(busy||recording){e.preventDefault();e.returnValue='';}};
 const pageHide=()=>{releaseStream();if(recorder)void recorder.interrupt().catch(()=>{});};
 window.addEventListener('beforeunload',beforeUnload);window.addEventListener('pagehide',pageHide);
 draw();
 const ready=(async()=>{
  const results=await Promise.allSettled([requestSafe('status'),loadList(),(async()=>{
   store=await openStore();prepared=await openPrepared();attempts=createAttempts({store});
   if(destroyed){store.close();prepared.close();return;}
   await recoverAttempts({...attempts,list:async id=>(await attempts.list(id)).filter(r=>r.mode==='personality')},accountId,{locks});locals=(await attempts.list(accountId)).filter(r=>r.mode==='personality');
  })()]);
  if(destroyed)return;
  const state=results[0];available=state.status==='fulfilled'&&state.value.ready;
  if(available){try{const data=await requestSafe('questions',{page:0});if(destroyed)return;questions=data.questions;qmore=data.hasMore;}catch{available=false;}}
  notice=results[2].status==='rejected'?'기기 저장 기능을 사용할 수 없습니다. 브라우저와 저장 공간을 확인해주세요.':available?'문항을 선택한 뒤 녹음을 시작해주세요.':errors[state.value?.reason]||'인성 연습 서비스를 준비하고 있습니다.';
  if(results[2].status==='rejected')available=false;
  else if(available&&results[1].status==='rejected')notice='응시 기록을 불러오지 못했습니다. 기록 새로고침으로 확인해주세요.';draw();
 })();
 return {ready,canLeave(){if(busy||recording){status('녹음·제출을 마친 뒤 이동해주세요.');return false;}return true;},destroy(){destroyed=true;clearInterval(timer);releaseStream();window.removeEventListener('beforeunload',beforeUnload);window.removeEventListener('pagehide',pageHide);host.onclick=null;if(audioUrl)URL.revokeObjectURL(audioUrl);
  const closing=recorder?recorder.interrupt().catch(()=>{}):Promise.resolve();void closing.finally(()=>{releaseLease?.();void lease?.catch(()=>{});store?.close();prepared?.close();});
 }};
}
