import {renderConceptReport} from './interview-concept-report.mjs?v=20261030';
import {openAttemptStore} from './interview-attempts/indexeddb.mjs';
import {createAttempts} from './interview-attempts/core.mjs';
import {recordAttempt} from './interview-attempts/recorder.mjs';
import {recoverAttempts,withAttemptLease} from './interview-attempts/recovery.mjs';
import {openJobSubmissions} from './interview-job-submissions.mjs';
import {toExamWav,audioBase64} from './interview-job-exam-audio.mjs';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={started:'응시 시작',uploading:'답변 저장 중',upload_failed:'저장 재시도 가능',evaluating:'판정 중',completed:'리포트 확인 가능',unknown:'처리 확인 필요',cancelled:'응시 취소',expired:'제출 시간 만료'};
const errors={exam_not_configured:'전공 시험 서비스를 준비하고 있습니다.',not_enrolled:'면접반 수강 등록과 이용 기간을 확인해주세요.',questions_unavailable:'응시할 수 있는 승인 문항이 없습니다.',daily_limit:'오늘의 응시 가능 횟수를 모두 사용했습니다.',admission_busy:'진행 중인 응시를 먼저 확인해주세요.',session_expired:'제출 시간이 지났습니다. 기기 녹음은 보존됩니다.',invalid_audio_duration:'1초 이상 답변을 녹음해주세요.',empty_recording:'녹음된 음성을 확인하지 못했습니다. 응시를 취소하고 마이크를 점검한 뒤 다시 시작해주세요.',attempt_in_use:'다른 창에서 이 응시를 사용 중입니다.',queue_full:'다른 응시를 처리 중입니다. 잠시 후 제출해주세요.',recording_unavailable:'음성을 서버에 저장하지 못했습니다. 기기 원본은 보존됩니다.',NotAllowedError:'마이크 권한을 허용한 뒤 시작해주세요.',attempt_lock_unsupported:'이 브라우저는 안전한 녹음 저장을 지원하지 않습니다. 최신 브라우저를 사용해주세요.'};
export function mountJobExam(host,{request,accountId,mediaDevices=globalThis.navigator?.mediaDevices,openStore=openAttemptStore,openPrepared=openJobSubmissions,createRecorder=recordAttempt,convert=toExamWav,locks=globalThis.navigator?.locks}={}){
 let destroyed=false,busy=false,recording=false,available=false,store,prepared,attempts,questions=[],runs=[],locals=[],run=null,recorder,stream,lease,releaseLease,timer,audioUrl='',remoteAudio='',page=0,hasMore=false,qpage=0,qmore=false,notice='이용 가능 여부를 확인하고 있습니다.';
 const status=text=>{notice=text;if(!destroyed){const n=host.querySelector('[data-job-status]');if(n)n.textContent=text;}};
 const releaseStream=()=>{stream?.getTracks().forEach(t=>t.stop());stream=null;};
 const requestSafe=async(action,body={})=>request(action,body);
 function reportMarkup(report){
  if(!report)return '';
  const contextStatus=index=>{const votes=(report.judgments||[]).map(j=>j.criteria.find(c=>c.index===index)?.status);return votes.length===2&&votes[0]===votes[1]?votes[0]:'uncertain';};
  const grade={O:'O',partial:'△',X:'X'},states={accepted:'충족',rejected:'불인정',partial:'부분 충족',absent:'표현 없음',uncertain:'검토 필요'};
  return `<section class="ip-panel" data-job-report><h3>전공 답변 리포트</h3><p>관리자 검토 전의 판정 제안입니다. 확정 성적이 아닙니다.</p><p>${report.suggestion?`제안 판정 <strong>${esc(grade[report.suggestion.grade])}</strong> · ${esc(report.suggestion.score)}점`:'자동 판정을 보류했습니다. 답변과 판정 근거를 검토해주세요.'}</p>${!report.suggestion?`<ul>${(report.reasons||[]).map(reason=>`<li>${esc(({transcript_disagreement:'음성 전사 결과가 달라 원음 확인이 필요합니다.',judgment_disagreement:'두 AI 판정이 달라 검토가 필요합니다.',context_uncertain:'답변의 의미나 관계를 확실히 판단하지 못했습니다.',invalid_evidence:'인용 근거를 실제 답변에서 확인하지 못했습니다.',undefined_partial_credit:'등록된 부분 인정 기준과 판정이 일치하지 않습니다.'})[reason]||'추가 검토가 필요합니다.')}</li>`).join('')}</ul>`:''}
   ${report.conceptResults?.length?renderConceptReport(report):''}${(report.keywordResults||[]).map(c=>`<article><h4>${esc(c.label)} · ${report.conceptResults?.some(result=>result.index===c.index)?'참고 키워드':c.match==='all'?'모두 충족':'하나 충족'}</h4><ul>${c.keywords.map(k=>`<li>${esc(k.term)}: ${k.missing?(report.conceptResults?.some(result=>result.index===c.index)?'미발화 · 참고 표현':c.match==='any'&&c.literalSatisfied?'미발화 (하나 충족 조건)':'표현 누락'):esc(k.matched.join(', '))}${k.aliases.length?` (허용 표현: ${esc(k.aliases.join(', '))})`:''}</li>`).join('')}</ul><p>문맥: ${esc(states[contextStatus(c.index)]||'검토 필요')}</p></article>`).join('')}
   <h4>답변 전사</h4><p style="white-space:pre-wrap">${esc(report.transcripts?.[0]||'전사문을 확인하지 못했습니다.')}</p>
   ${(report.judgments?.[0]?.criteria||[]).map(c=>`<p>${esc(c.quote)}<br>${esc(c.reason)}</p>`).join('')}${(report.judgments||[]).map((j,i)=>(j.errors||[]).filter(e=>e.status!=='absent').map(e=>`<article><h4>핵심 오류 검토 ${i+1} · ${e.status==='present'?'오류 확인':'검토 필요'}</h4><p>${esc(e.quote)}</p><p>${esc(e.reason)}</p></article>`).join('')).join('')}</section>`;
 }
 function draw(){if(destroyed)return;
  const locked=busy||recording;
  host.innerHTML=`<section class="ip-panel"><h2>전공(직무) 시험모드</h2><p>문항별 최대 90초 · 하루 최대 3회. 녹음 종료 후 답변을 확인하고 제출하세요.</p><p>제출한 답변은 키워드와 문맥을 기준으로 분석합니다. 녹음은 이 기기에 임시 저장됩니다. 제출 시 음성이 서버와 AI 분석 서비스로 전송됩니다.</p><p role="status" data-job-status>${esc(notice)}</p>
   <label>시험 문항<select data-job-question ${locked?'disabled':''}>${questions.map(q=>`<option value="${esc(q.id)}">${esc(q.prompt)}</option>`).join('')}</select></label>
   <button class="ip-btn" type="button" data-job-action="qprev" ${locked||qpage===0?'disabled':''}>앞 문항</button><button class="ip-btn" type="button" data-job-action="qnext" ${locked||!qmore?'disabled':''}>다음 문항</button>
   <button class="ip-btn ip-primary" type="button" data-job-action="start" ${locked||!available||!questions.length||!attempts?'disabled':''}>녹음 시작</button>
   <button class="ip-btn" type="button" data-job-action="stop" ${!recording||busy?'disabled':''}>녹음 종료</button><span role="timer" data-job-clock></span></section>
   ${run?`<section class="ip-panel"><h3>${esc(run.question.prompt)}</h3><p>${esc(labels[run.state]||run.state)}</p><p>보관 종료: ${esc(new Date(run.retainUntil).toLocaleString('ko-KR'))}</p>
   ${audioUrl||remoteAudio?`<audio controls preload="metadata" style="max-width:100%" src="${esc(audioUrl||remoteAudio)}"></audio>`:''}
   <button class="ip-btn ip-primary" type="button" data-job-action="submit" ${locked||!audioUrl||!['started','upload_failed'].includes(run.state)?'disabled':''}>답변 제출</button>
   <button class="ip-btn" type="button" data-job-action="check" ${locked?'disabled':''}>결과 확인</button>
   <button class="ip-btn" type="button" data-job-action="cancel" ${locked||run.state!=='started'?'disabled':''}>응시 취소</button></section>${reportMarkup(run.report)}`:''}
   <section class="ip-panel"><h3>내 전공 응시 기록</h3><button class="ip-btn" type="button" data-job-action="refresh" ${locked?'disabled':''}>기록 새로고침</button>
   ${runs.map(r=>`<p><button class="ip-btn" type="button" data-job-open="${esc(r.id)}" ${locked?'disabled':''}>${esc(r.question.prompt)} · ${esc(labels[r.state])}</button></p>`).join('')||'<p>저장된 응시 기록이 없습니다.</p>'}
   <button class="ip-btn" type="button" data-job-action="prev" ${locked||!page?'disabled':''}>이전 기록</button><button class="ip-btn" type="button" data-job-action="next" ${locked||!hasMore?'disabled':''}>다음 기록</button></section>
   ${locals.length?`<section class="ip-panel"><h3>이 기기에 저장한 전공 녹음</h3><p>중단·전송 실패 시에도 원본은 남습니다. 제출 시간이 지난 기록은 새 응시에서 다시 녹음해주세요.</p>${locals.map(r=>`<p><button class="ip-btn" type="button" data-job-open="${esc(r.id)}" ${locked?'disabled':''}>${esc(r.questions[0].prompt)} · ${esc(new Date(r.createdAt).toLocaleString('ko-KR'))}</button><button class="ip-btn" type="button" data-job-delete="${esc(r.id)}" ${locked?'disabled':''}>기기 녹음 삭제</button></p>`).join('')}</section>`:''}`;
 }
 async function loadList(){const data=await requestSafe('list',{page});if(destroyed)return;runs=data.runs;hasMore=data.hasMore;if(attempts)locals=(await attempts.list(accountId)).filter(r=>r.mode==='job');}
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
  const questionId=host.querySelector('[data-job-question]').value;
  if(!mediaDevices?.getUserMedia)throw Error('recording_unsupported');
  stream=await mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
  if(destroyed){releaseStream();return;}
  const data=await requestSafe('start',{questionId,requestKey:crypto.randomUUID()});
  if(destroyed){releaseStream();await requestSafe('cancel',{id:data.run.id}).catch(()=>{});return;}
  run=data.run;remoteAudio='';if(audioUrl)URL.revokeObjectURL(audioUrl);audioUrl='';
  let readyResolve,readyReject;const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
  lease=withAttemptLease(run.id,async()=>{
   try{
    await createAttempts({store,uuid:()=>run.id}).start({accountId,mode:'job',questions:[run.question]});
    if(destroyed)throw Error('view_destroyed');
    recorder=createRecorder({attempts,accountId,id:run.id,stream,onError:()=>{status('녹음 저장에 문제가 생겼습니다. 원본 기록을 확인해주세요.');void stop().catch(()=>{});}});
    await new Promise(resolve=>{releaseLease=resolve;recording=true;readyResolve();});
   }catch(e){readyReject(e);throw e;}
  },{locks});
  lease.catch(readyReject);await ready;
  const started=Date.now();timer=setInterval(()=>{
   const left=Math.max(0,90-Math.floor((Date.now()-started)/1000));const n=host.querySelector('[data-job-clock]');if(n)n.textContent=left+'초 남음';
   if(!left)void stop().catch(e=>status(e.message));
  },200);
  status('녹음 중입니다. 답변을 마치면 녹음 종료를 눌러주세요.');
 }
 host.onclick=async e=>{
  const b=e.target.closest('[data-job-action],[data-job-open],[data-job-delete]');if(!b||b.disabled||busy||destroyed)return;
  e.stopPropagation();const action=b.dataset.jobAction;if(action==='stop'){try{await stop();}catch(e){status('기기 녹음은 보존됩니다. 기록 새로고침으로 확인해주세요.');draw();}return;}if(recording)return;
  busy=true;
  try{
   if(b.dataset.jobOpen)await open(b.dataset.jobOpen);
   else if(b.dataset.jobDelete){if(confirm('이 기기의 녹음만 삭제할까요? 서버 응시 기록은 유지됩니다.'))await withAttemptLease(b.dataset.jobDelete,async()=>{
    await attempts.remove(accountId,b.dataset.jobDelete);await prepared.remove(accountId,b.dataset.jobDelete);
    if(run?.id===b.dataset.jobDelete&&audioUrl){URL.revokeObjectURL(audioUrl);audioUrl='';}
   },{locks});}
   else if(action==='start')await start();
   else if(action==='submit')await withAttemptLease(run.id,async()=>{
    status('답변을 전송하고 키워드·문맥을 확인하고 있습니다.');
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
   await recoverAttempts({...attempts,list:async id=>(await attempts.list(id)).filter(r=>r.mode==='job')},accountId,{locks});locals=(await attempts.list(accountId)).filter(r=>r.mode==='job');
  })()]);
  if(destroyed)return;
  const state=results[0];available=state.status==='fulfilled'&&state.value.ready;
  if(available){try{const data=await requestSafe('questions',{page:0});if(destroyed)return;questions=data.questions;qmore=data.hasMore;}catch{available=false;}}
  notice=results[2].status==='rejected'?'기기 저장 기능을 사용할 수 없습니다. 브라우저와 저장 공간을 확인해주세요.':available?'문항을 선택한 뒤 녹음을 시작해주세요.':errors[state.value?.reason]||'전공 시험 서비스를 준비하고 있습니다.';
  if(results[2].status==='rejected')available=false;
  else if(available&&results[1].status==='rejected')notice='응시 기록을 불러오지 못했습니다. 기록 새로고침으로 확인해주세요.';draw();
 })();
 return {ready,canLeave(){if(busy||recording){status('녹음·제출을 마친 뒤 이동해주세요.');return false;}return true;},destroy(){destroyed=true;clearInterval(timer);releaseStream();window.removeEventListener('beforeunload',beforeUnload);window.removeEventListener('pagehide',pageHide);host.onclick=null;if(audioUrl)URL.revokeObjectURL(audioUrl);
  const closing=recorder?recorder.interrupt().catch(()=>{}):Promise.resolve();void closing.finally(()=>{releaseLease?.();void lease?.catch(()=>{});store?.close();prepared?.close();});
 }};
}
