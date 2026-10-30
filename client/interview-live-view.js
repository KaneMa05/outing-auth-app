import {connectLive} from './interview-live-client.js?v=20261021-flow';
import {liveRequest,mountLiveHistory,renderLiveResult} from '../interview-live-ui.js?v=20261029-student-live';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const reasons={live_not_configured:'음성 면접 연결을 준비하고 있습니다.',enrollment_end_required:'수강 종료일 등록이 필요합니다.',not_enrolled:'면접반 이용 기간과 등록 상태를 확인해주세요.',questions_unavailable:'공개된 면접 질문을 준비하고 있습니다.',daily_limit:'오늘의 이용 횟수(3회)를 모두 사용했습니다.',queue_full:'현재 면접 중인 학생이 많습니다. 잠시 후 다시 시도해주세요.',admission_busy:'진행 중인 면접의 종료를 확인하고 있습니다.',unsafe_retry:'이전 연결 상태를 확인 중입니다. 새 연결을 반복하지 말고 관리자에게 문의해주세요.'};
const time=s=>`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
export async function mountLive(host,{request=liveRequest,connect=connectLive}={}){
 let destroyed=false,phase='idle',screen='prep',connection=null,attempt=null,answering=false,stopPromise=null,ready=false,checking=false;
 let micStream,micContext,micTimer,cameraStream,cameraVersion=0,cameraPending=false,historyView,ticker,poller,polling=false;
 let muted=false,transcript='',spoken='',question='',questionNumber=0,startedAt=0,lastRunId,report=null,reportPanel='summary';
 host.classList.add('ip-live-view');
 if(!document.querySelector('link[data-interview-live-style]')){const link=document.createElement('link');link.rel='stylesheet';link.href='/interview-live.css?v=20261021-flow';link.dataset.interviewLiveStyle='';document.head.appendChild(link);}
 host.innerHTML=`<div class="il-flow">
 <section data-live-screen="prep"><p class="il-eyebrow">BEFORE WE BEGIN</p><h2 class="il-title">편안하게 앉아 주세요.</h2><p class="il-sub">질문은 한 번에 하나씩, 충분히 듣겠습니다.</p>
 <div class="il-camera"><video data-live-preview autoplay muted playsinline hidden></video><div data-live-camera-placeholder class="il-person" aria-hidden="true"></div><span class="il-camera-label">카메라 미리보기 · 영상 저장 안 함</span></div>
 <div class="il-setting"><div><strong>내 모습 함께 보기</strong><p class="il-sub">면접 중 작은 화면으로 표시</p></div><button type="button" data-live-camera class="il-switch" aria-label="내 모습 함께 보기" aria-pressed="false"></button></div><p data-live-camera-status class="il-sub" role="status">켜면 카메라 사용 권한을 요청합니다.</p>
 <div class="il-setting"><div><strong>음성 대화 준비</strong><p class="il-sub">조용한 곳에서 이어폰을 사용해 주세요.</p></div><button type="button" class="il-secondary" data-live-mic>마이크 확인</button></div><meter data-live-meter min="0" max="1" value="0" aria-label="마이크 입력 크기"></meter>
 <div class="il-summary"><div><strong>3문항</strong><small>기본 질문</small></div><div><strong>최대 2개</strong><small>질문별 꼬리 질문</small></div><div><strong>10분</strong><small>면접 제한</small></div></div>
 <p class="il-sub">음성과 대화 기록은 수강 종료 후 30일까지 보관됩니다. 확정 점수는 부여하지 않습니다.</p>
 <div class="il-bottom"><button type="button" class="il-primary" data-live-start disabled>면접 시작하기 →</button><button type="button" class="il-secondary il-wide" data-live-records>내 면접 기록</button><button type="button" class="il-secondary il-wide" data-live-retry hidden>연결 상태 다시 확인</button></div></section>
 <section data-live-screen="live" hidden><div class="il-live-head"><strong>실전 모의면접</strong><span data-live-time class="il-timer">0:00 / 10:00</span></div><progress data-live-progress max="600" value="0" aria-label="면접 경과 시간"></progress>
 <div class="il-stage"><div class="il-orb" aria-hidden="true"></div><video data-live-self autoplay muted playsinline hidden></video></div><p data-live-activity class="il-activity">면접관과 연결하고 있습니다.</p>
 <div class="il-question"><span data-live-question-number class="il-eyebrow">현재 질문</span><h2 data-live-question></h2></div>
 <div data-live-captions class="il-captions"><strong>면접관</strong><p data-live-interviewer></p><strong>내 답변 · 실시간 자막</strong><p data-live-transcript></p><small>음성 인식 결과는 실제 발화와 다를 수 있습니다.</small></div>
 <div class="il-bottom"><div class="il-controls"><button type="button" class="il-secondary" data-live-mute aria-pressed="false">마이크 끄기</button><button type="button" class="il-secondary" data-live-caption aria-pressed="true">자막 숨기기</button><button type="button" class="il-secondary il-end" data-live-exit>종료</button></div><button type="button" class="il-primary" data-live-done>답변 완료 →</button><p class="il-sub">답변을 마쳤는데 다음 질문이 나오지 않으면 눌러주세요.</p></div></section>
 <section data-live-screen="result" hidden><p class="il-eyebrow">INTERVIEW RECORD</p><h2 class="il-title">내 답변을 돌아보고,<br>다음 연습을 준비해요.</h2><p class="il-sub">실제 면접 기록 · 확정 채점 결과 아님</p><div class="il-report-tabs" role="group" aria-label="결과 보기"><button type="button" data-live-report="summary" aria-pressed="true">종합</button><button type="button" data-live-report="questions" aria-pressed="false">질문별 기록</button></div><div data-live-report-body></div><div class="il-bottom"><button type="button" class="il-primary" data-live-again>다시 연습하기</button><button type="button" class="il-secondary il-wide" data-live-load-report>기록 다시 확인</button><button type="button" class="il-secondary il-wide" data-live-records>내 면접 기록</button></div></section>
 <section data-live-screen="history" hidden><p class="il-eyebrow">MY INTERVIEWS</p><h2 class="il-title">답변이 쌓이면,<br>변화가 보여요.</h2><button type="button" class="il-secondary" data-live-prep>‹ 면접 준비로</button><div data-live-history><p role="status">기록을 불러오는 중…</p></div></section>
 <p data-live-status role="status">이용 가능 여부를 확인하고 있습니다.</p><audio data-live-audio autoplay playsinline></audio><button type="button" class="il-secondary il-wide" data-live-play hidden>면접관 음성 재생</button>
 <dialog data-live-dialog aria-labelledby="il-end-title" class="il-dialog"><h2 id="il-end-title">면접을 마칠까요?</h2><p>마이크와 카메라를 끄고 지금까지의 답변을 저장합니다.</p><button type="button" class="il-primary" data-live-stop>종료하고 기록 보기</button><button type="button" class="il-secondary il-wide" data-live-resume>계속 면접하기</button></dialog></div>`;
 const find=s=>host.querySelector(s),status=text=>{if(!destroyed)find('[data-live-status]').textContent=text;};
 const audio=find('[data-live-audio]'),dialog=find('[data-live-dialog]');
 function show(next){if(destroyed)return;screen=next;for(const section of host.querySelectorAll('[data-live-screen]')){section.hidden=section.dataset.liveScreen!==next;if(section.hidden)for(const player of section.querySelectorAll('audio'))player.pause();}host.dataset.liveScreen=next;host.scrollIntoView?.({block:'start',behavior:'instant'});}
 function controls(){if(destroyed)return;host.dataset.livePhase=phase;
  find('[data-live-start]').disabled=!ready||phase!=='idle';find('[data-live-start]').textContent=phase==='connecting'?'연결 중…':'면접 시작하기 →';
  find('[data-live-mic]').disabled=phase!=='idle';find('[data-live-mic]').textContent=micStream?'마이크 확인 종료':'마이크 확인';
  find('[data-live-camera]').disabled=cameraPending||phase!=='idle';find('[data-live-camera]').setAttribute('aria-pressed',String(!!cameraStream));
  find('[data-live-done]').disabled=answering||phase!=='active'||!connection;find('[data-live-done]').textContent=answering?'답변 확인 중…':'답변 완료 →';
  find('[data-live-stop]').disabled=phase!=='active'||!connection;find('[data-live-stop]').textContent=phase==='closing'?'종료·저장 중…':'종료하고 기록 보기';
  find('[data-live-exit]').disabled=phase!=='active';find('[data-live-mute]').disabled=phase!=='active';
  for(const b of host.querySelectorAll('[data-live-records],[data-live-again],[data-live-prep]'))b.disabled=phase!=='idle';
  find('[data-live-mute]').textContent=muted?'마이크 켜기':'마이크 끄기';find('[data-live-mute]').setAttribute('aria-pressed',String(muted));
 }
 function stopMic(){clearInterval(micTimer);micStream?.getTracks().forEach(t=>t.stop());micStream=null;micContext?.close().catch(()=>{});micContext=null;if(!destroyed)find('[data-live-meter]').value=0;}
 function stopCamera(){++cameraVersion;cameraStream?.getTracks().forEach(t=>t.stop());cameraStream=null;cameraPending=false;for(const key of ['preview','self']){const v=find(`[data-live-${key}]`);v.srcObject=null;v.hidden=true;}find('[data-live-camera-placeholder]').hidden=false;}
 async function toggleCamera(){if(cameraStream){stopCamera();controls();return;}const version=++cameraVersion;cameraPending=true;controls();find('[data-live-camera-status]').textContent='카메라 권한을 확인하고 있습니다.';
  try{const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user'},audio:false});if(destroyed||version!==cameraVersion){stream.getTracks().forEach(t=>t.stop());return;}cameraStream=stream;for(const key of ['preview','self']){const v=find(`[data-live-${key}]`);v.srcObject=stream;v.hidden=false;void v.play().catch(()=>{});}find('[data-live-camera-placeholder]').hidden=true;find('[data-live-camera-status]').textContent='내 기기에서만 표시되며 영상은 전송·저장하지 않습니다.';}catch{if(!destroyed&&version===cameraVersion)find('[data-live-camera-status]').textContent='카메라 권한과 연결을 확인해주세요. 카메라 없이도 면접할 수 있습니다.';}finally{if(version===cameraVersion){cameraPending=false;controls();}}
 }
 async function checkReady(){if(checking||destroyed)return;checking=true;find('[data-live-retry]').hidden=true;try{const result=await request('ready');if(destroyed)return;ready=result.ready===true&&!!navigator.mediaDevices?.getUserMedia&&!!window.RTCPeerConnection;if(phase==='idle'&&!micStream)status(ready?'준비되면 면접을 시작해 주세요.':reasons[result.reason]||'이 기기에서는 음성 면접을 사용할 수 없습니다.');find('[data-live-retry]').hidden=ready;}catch{status('이용 상태를 확인하지 못했습니다. 다시 확인해주세요.');if(!destroyed)find('[data-live-retry]').hidden=false;}finally{checking=false;controls();}}
 function renderReport(){if(destroyed)return;for(const b of host.querySelectorAll('[data-live-report]'))b.setAttribute('aria-pressed',String(b.dataset.liveReport===reportPanel));const box=find('[data-live-report-body]');if(!report){box.innerHTML='<p class="il-card">기록을 확인 중입니다. 잠시 후 기록 다시 확인을 눌러주세요.</p>';return;}
  const run=report.run,turns=run.result_report?.turns||run.turns||[];
  if(reportPanel==='summary')box.innerHTML=renderLiveResult(run,'il-card')+`<p class="il-sub">보관 종료: ${esc(new Date(run.retain_until).toLocaleString('ko-KR'))}</p>${run.recording_partial?'<p class="il-card">연결 중단 후 복구한 기록입니다. 마지막 구간이 누락될 수 있습니다.</p>':''}<p class="il-sub">질문별 기록에서 답변과 학생·면접관 원음을 확인할 수 있습니다.</p>`;
  else box.innerHTML=`${run.recording_partial?'<p class="il-card">연결 중단 후 복구한 음성으로, 마지막 구간이 누락될 수 있습니다.</p>':''}${report.recordings?`<div class="il-card"><label>학생 음성<audio controls preload="none" src="${esc(report.recordings.input)}"></audio></label><label>면접관 음성<audio controls preload="none" src="${esc(report.recordings.output)}"></audio></label></div>`:'<p class="il-sub">음성 파일을 준비 중이거나 저장하지 못한 기록입니다.</p>'}${turns.map((t,i)=>`<article class="il-card"><span class="il-eyebrow">${i+1} · ${t.kind==='followup'?'꼬리 질문':'기본 질문'}${t.complete?'':' · 미완료'}</span><h3>${esc(t.question)}</h3>${t.evidence?`<p>꼬리질문의 근거 발언: ${esc(t.evidence)}</p>`:''}<p class="il-answer">${esc(t.answer||'인식된 답변이 없습니다.')}</p></article>`).join('')||'<p class="il-card">아직 저장된 답변이 없습니다.</p>'}`;
 }
 async function loadReport(){const id=lastRunId;if(!id)return;try{const result=await request('get',{runId:id});if(destroyed||id!==lastRunId)return;report=result;renderReport();}catch{if(!destroyed)status('기록을 불러오지 못했습니다. 기록 다시 확인을 눌러주세요.');}}
 async function stop(message='면접을 종료했습니다. 기록을 확인해주세요.'){
  if(stopPromise)return stopPromise;
  stopPromise=(async()=>{phase='closing';dialog.close();status('마이크를 끄고 면접 기록을 저장하고 있습니다.');controls();clearInterval(poller);clearInterval(ticker);stopMic();stopCamera();const c=connection;connection=null;
   try{await c?.stop();status(message);}catch{status('마이크를 종료했습니다. 서버의 종료·저장 상태는 기록에서 다시 확인해주세요.');}
   finally{phase='idle';answering=false;muted=false;controls();if(!destroyed){report=null;reportPanel='summary';show('result');renderReport();void loadReport();void historyView?.refresh();}}})();
  try{await stopPromise;}finally{stopPromise=null;}
 }
 async function poll(){if(polling||!connection||destroyed)return;polling=true;const current=connection;
  try{const d=await current.request('heartbeat',{runId:current.runId});if(connection!==current||destroyed)return;if(['completed','interrupted','unknown'].includes(d.run.state)){await stop();return;}if(d.run.current_question&&d.run.current_question!=='면접 종료'&&d.run.current_question!==question)setQuestion(d.run.current_question);if(d.notice==='followup_unavailable')status('추가 질문을 준비하지 못했습니다. 잠시 후 답변 완료를 눌러주세요.');}catch{if(connection===current)await stop('연결이 종료되었습니다. 저장된 기록을 확인해주세요.');}finally{polling=false;}
 }
 function setQuestion(value){if(value===question)return;question=value;questionNumber++;transcript='';spoken='';find('[data-live-question]').textContent=value;find('[data-live-question-number]').textContent=`진행 질문 ${String(questionNumber).padStart(2,'0')}`;find('[data-live-transcript]').textContent='';find('[data-live-interviewer]').textContent='';}
 async function start(){phase='connecting';stopMic();status('마이크와 AI 면접관을 연결하고 있습니다.');controls();const currentAttempt=attempt=new AbortController();let failed=false;
  try{question='';questionNumber=0;transcript='';spoken='';muted=false;find('[data-live-play]').hidden=true;
   const c=await connect({request,audio,signal:currentAttempt.signal,onFailure:()=>{if(attempt!==currentAttempt)return;failed=true;if(connection)void stop('음성 연결이 끊겨 면접을 종료했습니다.');},onEvent:event=>{
    if(destroyed||attempt!==currentAttempt||currentAttempt.signal.aborted||phase==='closing'||phase==='idle')return;
    if(event.type==='interview.question')setQuestion(event.question);
    if(event.type==='session.input_transcript.delta'){transcript=(transcript+event.delta).slice(-4000);find('[data-live-transcript]').textContent=transcript;if(!muted)find('[data-live-activity]').textContent='답변을 듣고 있어요';}
    if(event.type==='session.output_transcript.delta'){spoken=(spoken+event.delta).slice(-2000);find('[data-live-interviewer]').textContent=spoken;if(!muted)find('[data-live-activity]').textContent='면접관의 질문을 들어주세요';}
    if(event.type==='playback.blocked'){find('[data-live-play]').hidden=false;status('면접관 음성 재생 버튼을 눌러주세요.');}
    if(event.type==='session.closed'||event.type==='error'){failed=true;if(connection)void stop();}
   }});
   if(destroyed||failed||currentAttempt.signal.aborted){await c.stop();if(!destroyed)status('연결을 완료하지 못했습니다. 기기와 연결 상태를 확인해주세요.');return;}
   connection=c;lastRunId=c.runId;setQuestion(c.question);phase='active';startedAt=Date.now();find('[data-live-time]').textContent='0:00 / 10:00';find('[data-live-progress]').value=0;show('live');status('질문을 듣고 천천히 답해주세요.');find('[data-live-activity]').textContent='음성 면접 진행 중';
   ticker=setInterval(()=>{if(destroyed)return;const elapsed=Math.min(600,Math.floor((Date.now()-startedAt)/1000));find('[data-live-time]').textContent=`${time(elapsed)} / 10:00`;find('[data-live-progress]').value=elapsed;},1000);poller=setInterval(poll,10000);
  }catch(e){status(reasons[e.code||e.message]||'연결하지 못했습니다. 마이크 권한과 연결 상태를 확인해주세요.');}finally{if(!connection)phase='idle';controls();}
 }
 async function click(e){const button=e.target.closest('button');if(!button||!host.contains(button)||button.disabled||destroyed)return;
  if(button.hasAttribute('data-live-camera'))return toggleCamera();
  if(button.hasAttribute('data-live-start'))return start();
  if(button.hasAttribute('data-live-retry'))return checkReady();
  if(button.hasAttribute('data-live-exit')){dialog.showModal();find('[data-live-resume]').focus();return;}
  if(button.hasAttribute('data-live-resume')){dialog.close();return;}
  if(button.hasAttribute('data-live-stop'))return stop();
  if(button.hasAttribute('data-live-records')){stopMic();stopCamera();show('history');controls();void historyView?.refresh();return;}
  if(button.hasAttribute('data-live-prep')||button.hasAttribute('data-live-again')){show('prep');void checkReady();return;}
  if(button.hasAttribute('data-live-report')){reportPanel=button.dataset.liveReport;renderReport();return;}
  if(button.hasAttribute('data-live-load-report'))return loadReport();
  if(button.hasAttribute('data-live-caption')){const captions=find('[data-live-captions]');captions.hidden=!captions.hidden;button.setAttribute('aria-pressed',String(!captions.hidden));button.textContent=captions.hidden?'자막 보기':'자막 숨기기';return;}
  if(button.hasAttribute('data-live-mute')){muted=!muted;connection?.setMuted(muted);find('[data-live-activity]').textContent=muted?'마이크가 꺼져 있어요':'음성 면접 진행 중';status(muted?'마이크를 꺼도 면접 제한 시간은 계속 흐릅니다.':'질문을 듣고 천천히 답해주세요.');controls();return;}
  if(button.hasAttribute('data-live-play')){try{await audio.play();button.hidden=true;}catch{status('기기의 음량과 재생 권한을 확인해주세요.');}return;}
  if(button.hasAttribute('data-live-mic')){if(micStream){stopMic();status('마이크 확인을 마쳤습니다.');controls();return;}phase='mic';controls();status('마이크 사용 권한을 확인하고 있습니다.');try{micStream=await navigator.mediaDevices.getUserMedia({audio:true,video:false});if(destroyed){stopMic();return;}micContext=new (window.AudioContext||window.webkitAudioContext)();await micContext.resume();if(destroyed){stopMic();return;}const analyser=micContext.createAnalyser();micContext.createMediaStreamSource(micStream).connect(analyser);const values=new Uint8Array(analyser.fftSize),until=Date.now()+10000;micTimer=setInterval(()=>{if(Date.now()>until){stopMic();controls();status('마이크 확인을 마쳤습니다.');return;}analyser.getByteTimeDomainData(values);find('[data-live-meter]').value=Math.min(1,Math.sqrt(values.reduce((n,v)=>n+((v-128)/128)**2,0)/values.length)*5);},100);status('10초 동안 말해보세요. 입력 막대가 움직이는지 확인해주세요.');}catch{stopMic();status('마이크 사용 권한과 연결을 확인해주세요.');}finally{phase='idle';controls();}return;}
  if(button.hasAttribute('data-live-done')){const current=connection;answering=true;status('답변을 확인하고 다음 질문을 준비하고 있습니다.');controls();try{const d=await current.request('answer_done',{runId:current.runId});if(connection!==current||destroyed)return;status(d.waiting?'아직 인식된 답변이 없습니다. 마이크와 자막을 확인해주세요.':'면접관의 질문을 듣고 답해주세요.');}catch{if(connection===current)await stop();}finally{if(connection===current){answering=false;controls();}}}
 }
 const beforeUnload=e=>{if(connection||phase==='connecting'||phase==='closing'){e.preventDefault();e.returnValue='';}};
 const pagehide=()=>{attempt?.abort();connection?.release();connection=null;clearInterval(poller);clearInterval(ticker);stopMic();stopCamera();};
 host.addEventListener('click',click);window.addEventListener('beforeunload',beforeUnload);window.addEventListener('pagehide',pagehide);
 void mountLiveHistory(find('[data-live-history]'),{request}).then(view=>{if(destroyed)view.destroy();else historyView=view;});void checkReady();controls();
 return {canLeave(){if(connection||phase==='connecting'||phase==='closing'||phase==='mic'){status('면접 종료 또는 진행 중인 연결을 마친 뒤 이동해주세요.');return false;}return true;},destroy(){destroyed=true;attempt?.abort();clearInterval(poller);clearInterval(ticker);stopMic();stopCamera();if(connection){const c=connection;connection=null;void c.stop().catch(()=>{});}dialog.close();historyView?.destroy();host.removeEventListener('click',click);window.removeEventListener('beforeunload',beforeUnload);window.removeEventListener('pagehide',pagehide);host.replaceChildren();}};
}
