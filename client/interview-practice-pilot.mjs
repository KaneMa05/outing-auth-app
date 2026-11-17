import {indexQuestionAudioCatalog,resolveQuestionAudio} from './interview-question-audio.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const hash=async blob=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(v=>v.toString(16).padStart(2,'0')).join('');
const stamp=s=>new Date(s).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'});
export function eligible(questions,{mode,track,field='',region=''}){return questions.filter(q=>q.id&&q.prompt&&q.category===mode&&(!q.tracks?.length||q.tracks.includes(track))&&(!field||q.fieldIds?.includes(field))&&(mode!=='job'||!region||q.regions?.includes(region)));}
export function questionProgress(records,id){const answered=records.filter(r=>r.turns.some(t=>t.questionId===id&&t.blob?.size>44));return {count:answered.length,latest:answered.map(r=>r.recordedAt).sort().at(-1)};}
export function progressLabel(value){return value.count?`답변 완료 · ${value.count}회 · 최근 ${stamp(value.latest)}`:'아직 연습하지 않음 · 0회 · 최근 연습 없음';}
function openStore(){return new Promise((resolve,reject)=>{const r=indexedDB.open('ronpark-practice-pilot-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('runs',{keyPath:'runId'});r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result;resolve({run(method,value){return new Promise((yes,no)=>{const tx=db.transaction('runs',method==='get'||method==='getAll'?'readonly':'readwrite'),request=tx.objectStore('runs')[method](value);let result;request.onsuccess=()=>result=request.result;tx.oncomplete=()=>yes(result);tx.onerror=()=>no(tx.error);tx.onabort=()=>no(tx.error);});},close:()=>db.close()});};});}
export async function mountPracticePilot(host,{mode,accountId,request}){
 let destroyed=false,busy=false,screen='home',catalog,store,records=[],field='',region='',count=3,stars=false,notice='',run=null,selected=[],index=0,stream,recorder,parts=[],questionAudio,questionTicket=0,answerStarted=0,timer,analyzer,audioContext,lastSpeech=0,talking=false,playURLs=[],syncing=false,syncAgain=false,startGeneration=0;
 const scope='practice-pilot:'+encodeURIComponent(accountId)+':'+mode;
 let favorites=new Set();try{favorites=new Set(JSON.parse(localStorage.getItem(scope+':favorites')||'[]'));count=Number(localStorage.getItem(scope+':count'))||3;}catch{}
 if(![3,5,10,15,20].includes(count))count=3;
 let audioCatalogs={};
 const list=()=>eligible(catalog?.questions||[],{mode,track:catalog?.track,field,region});
 const button=(label,action,attrs='')=>`<button type="button" class="ip-btn ${['quick','configured','answer'].includes(action)?'ip-primary':''}" data-pilot="${action}" ${attrs}>${esc(label)}</button>`;
 const save=async()=>{await store.run('put',run);await reload();};
 const reload=async()=>{records=(await store.run('getAll')).filter(r=>r.accountId===accountId&&r.mode===mode).sort((a,b)=>b.recordedAt.localeCompare(a.recordedAt));};
 const meta=r=>({runId:r.runId,mode:r.mode,track:r.track,fieldId:r.fieldId,fieldLabel:r.fieldLabel,region:r.region,recordedAt:r.recordedAt,questionCount:r.questionCount,completed:r.completed,finished:r.finished,turns:r.turns.map(({number,questionId,question,answer,duration,audioBytes,audioHash,audioMime})=>({number,questionId,question,answer,duration,audioBytes,audioHash,audioMime}))});
 async function sync(){syncAgain=true;if(syncing||destroyed||!store)return;syncing=true;try{while(syncAgain&&!destroyed){syncAgain=false;for(const row of (await store.run('getAll')).filter(r=>r.accountId===accountId).sort((a,b)=>a.recordedAt.localeCompare(b.recordedAt))){
   if(destroyed)break;const payload=meta(row),fingerprint=JSON.stringify(payload);if(row.synced===fingerprint)continue;
   const plan=await request('/api/interview-practice-records',{...payload,action:'sync'});
   for(const upload of plan.uploads){if(destroyed)throw Error('closed');const turn=row.turns.find(t=>t.number===upload.number&&t.audioHash===upload.audioHash);if(!turn?.blob)throw Error('missing_audio');const url=new URL(upload.url),ext={'audio/mp4':'m4a','audio/webm':'webm','audio/ogg':'ogg'}[turn.audioMime];
    if(url.protocol!=='https:'||!url.hostname.endsWith('.supabase.co')||url.username||url.password||url.port||url.pathname!==`/storage/v1/object/upload/sign/interview-practice/${row.runId}/${turn.number}-${turn.audioHash}.${ext}`)throw Error('invalid_upload');
    const response=await fetch(url,{method:'PUT',credentials:'omit',redirect:'error',headers:{'Content-Type':turn.audioMime,'x-upsert':'true'},body:turn.blob});if(!response.ok)throw Error('upload_failed');if(destroyed)throw Error('closed');await request('/api/interview-practice-records',{action:'uploaded',runId:row.runId,number:turn.number,audioHash:turn.audioHash});
   }
   const latest=await store.run('get',row.runId);if(latest&&JSON.stringify(meta(latest))===fingerprint){latest.synced=fingerprint;await store.run('put',latest);}
  }await reload();}}
  catch{syncAgain=false;}finally{syncing=false;if(!destroyed&&screen==='records')render();if(destroyed)store?.close();}
 }
 function stopQuestion(){questionTicket++;if(questionAudio){questionAudio.pause();questionAudio=null;}globalThis.speechSynthesis?.cancel();}
 function stopHardware(){clearInterval(timer);stream?.getTracks().forEach(t=>t.stop());stream=null;if(audioContext){void audioContext.close();audioContext=null;}analyzer=null;}
 function releasePlayers(){host.querySelectorAll('audio').forEach(a=>a.pause());playURLs.forEach(URL.revokeObjectURL);playURLs=[];}
 function render(){if(destroyed)return;releasePlayers();const all=list(),fields=catalog?.fields||[];
  let html=`<div class="ip-toolbar">${button(screen==='home'?'모의면접 메뉴로':'‹ 뒤로','back')}</div><h2>${screen==='catalog'?'질문 골라 연습':screen==='result'?'면접 결과':screen==='records'?'내 면접 기록':mode==='job'?'직무 질문별 연습':'인성 질문별 연습'}</h2>`;
  if(screen==='home')html+=`<section class="ip-panel"><h3>빠른 연습</h3><p>무작위 최대 3문항</p>${button(busy?'준비 중…':'바로 연습하기','quick',`${busy||!all.length?'disabled':''}`)}</section><section class="ip-panel">${button('질문 골라 연습','catalog')}${button('연습 설정','settings')}${button('내 면접 기록','records')}</section>`;
  const filters=`<label>분야<select data-pilot-field><option value="">전체 분야</option>${fields.map(f=>`<option value="${esc(f.id)}" ${field===f.id?'selected':''}>${esc(f.label)}</option>`).join('')}</select></label>`;
  if(screen==='settings')html+=`<section class="ip-panel">${filters}${mode==='job'?`<label>기출 지역<select data-pilot-region><option value="">전체 지역</option>${[...new Set(catalog.questions.flatMap(q=>q.regions||[]))].sort().map(r=>`<option ${r===region?'selected':''}>${esc(r)}</option>`).join('')}</select></label>`:''}<label>문항 수<select data-pilot-count>${[3,5,10,15,20].map(n=>`<option ${n===count?'selected':''} value="${n}">${n}문항</option>`).join('')}</select></label>${button('이 설정으로 연습하기','configured',busy||!all.length?'disabled':'')}</section>`;
  if(screen==='catalog')html+=`${filters}<div class="ip-toolbar">${button('전체 질문','all',`aria-pressed="${!stars}"`)}${button('즐겨찾기','stars',`aria-pressed="${stars}"`)}</div>${all.filter(q=>!stars||favorites.has(q.id)).map(q=>`<article class="ip-panel"><div class="ip-row"><h3>${esc(q.prompt)}</h3>${button(favorites.has(q.id)?'★':'☆','favorite',`data-id="${esc(q.id)}" aria-label="${favorites.has(q.id)?'즐겨찾기 해제':'즐겨찾기 추가'}"`)}</div><p data-progress="${esc(q.id)}">${esc(progressLabel(questionProgress(records,q.id)))}</p>${button('이 질문 연습하기','one',`data-id="${esc(q.id)}" ${busy?'disabled':''}`)}</article>`).join('')||'<p>해당 질문이 없습니다.</p>'}`;
  if(screen==='live')html+=`<p>질문 ${index+1} / ${selected.length}</p><h3>${esc(selected[index].prompt)}</h3><p data-live-status>${talking?'질문을 듣는 중':'이제 답변해 주세요'}</p><progress data-level max="1" value="0"></progress><div class="ip-toolbar">${button('질문 다시 듣기','replay',talking||recorder?.state==='recording'?'disabled':'')}${button('답변 완료 →','answer',talking||busy?'disabled':'')}${button('면접 종료','end')}</div>`;
  if(screen==='result')html+=`${run.turns.map(t=>{const url=URL.createObjectURL(t.blob);playURLs.push(url);return `<article class="ip-panel"><h3>${t.number}. ${esc(t.question)}</h3><p>${Math.round(t.duration)}초</p><audio controls preload="none" src="${url}"></audio></article>`;}).join('')}${button('같은 질문으로 다시 연습','repeat')}${button('연습 홈으로','home')}${button('내 면접 기록','records')}`;
  if(screen==='records')html+=records.map(r=>`<article class="ip-panel"><h3>${esc(stamp(r.recordedAt))}</h3><p>답변 ${r.turns.length}/${r.questionCount}개 · ${r.completed?'완료':'중단'}${r.synced===JSON.stringify(meta(r))?'':' · 전송 대기'}</p>${button('기록 보기','record',`data-id="${r.runId}"`)}${button('기기 기록 삭제','delete',`data-id="${r.runId}"`)}</article>`).join('')||'<p>저장된 연습 기록이 없습니다.</p>';
  if(notice)html+=`<p role="status">${esc(notice)}</p>`;host.innerHTML=html;
  host.querySelectorAll('audio').forEach(a=>a.onplay=()=>host.querySelectorAll('audio').forEach(other=>{if(a!==other)other.pause();}));
 }
 async function load(){const data=await request('/api/interview-prep',{action:'practice_bootstrap',mode,pilot:true});if(data.accountId!==accountId||data.mode!==mode)throw Error('account_changed');catalog=data;}
 async function start(ids){if(busy||!ids.length||destroyed)return;const ticket=++startGeneration;busy=true;notice='';render();let acquired;
  try{const Context=globalThis.AudioContext||globalThis.webkitAudioContext;if(Context){audioContext=new Context();void audioContext.resume();}await load();if(destroyed||ticket!==startGeneration)return;const available=list();selected=ids.map(id=>available.find(q=>q.id===id));if(selected.some(q=>!q)||new Set(ids).size!==ids.length)throw Error('question_changed');
   const mime=['audio/mp4','audio/webm;codecs=opus','audio/ogg;codecs=opus'].find(t=>globalThis.MediaRecorder?.isTypeSupported(t));if(!mime)throw Error('recording_unsupported');
   acquired=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,sampleRate:16000,echoCancellation:true,noiseSuppression:true}});if(destroyed||ticket!==startGeneration){acquired.getTracks().forEach(t=>t.stop());return;}if(document.hidden)throw Error('background');stream=acquired;if(audioContext){analyzer=audioContext.createAnalyser();analyzer.fftSize=2048;audioContext.createMediaStreamSource(stream).connect(analyzer);}
   run={runId:crypto.randomUUID(),accountId,mode,track:catalog.track,fieldId:field,fieldLabel:catalog.fields.find(f=>f.id===field)?.label||'',region:mode==='job'?region:'',recordedAt:new Date().toISOString(),questionCount:selected.length,completed:false,finished:false,turns:[],mime};await save();if(destroyed||ticket!==startGeneration){acquired.getTracks().forEach(t=>t.stop());return;}if(document.hidden)throw Error('background');index=0;screen='live';busy=false;void sync();await ask();
  }catch(error){acquired?.getTracks().forEach(t=>t.stop());if(destroyed||ticket!==startGeneration)return;stopHardware();busy=false;notice=error.name==='NotAllowedError'?'마이크 권한을 허용한 뒤 다시 시작해주세요.':'문항·권한·기기 저장 공간을 확인한 뒤 다시 시작해주세요.';render();}
 }
 async function ask(){stopQuestion();talking=true;render();const ticket=questionTicket,q=selected[index];
  const recorded=resolveQuestionAudio(q,audioCatalogs);
  await new Promise(resolve=>{let settled=false;const done=()=>{if(settled)return;settled=true;clearTimeout(timeout);resolve();};const timeout=setTimeout(done,30000);
   if(recorded.state==='matched'){questionAudio=new Audio(recorded.url);questionAudio.onended=done;questionAudio.onerror=done;void questionAudio.play().catch(done);}
   else if(globalThis.speechSynthesis){const speech=new SpeechSynthesisUtterance(q.prompt);speech.lang='ko-KR';speech.onend=done;speech.onerror=done;speechSynthesis.speak(speech);}else done();
  });if(destroyed||ticket!==questionTicket||screen!=='live')return;talking=false;parts=[];
  try{recorder=new MediaRecorder(stream,{mimeType:run.mime,audioBitsPerSecond:32000});recorder.ondataavailable=e=>{if(e.data.size)parts.push(e.data);};answerStarted=performance.now();recorder.start(1000);lastSpeech=Date.now();
   render();timer=setInterval(()=>{if(destroyed||screen!=='live'||busy)return;let volume=0;if(analyzer){const samples=new Float32Array(analyzer.fftSize);analyzer.getFloatTimeDomainData(samples);volume=Math.sqrt(samples.reduce((n,v)=>n+v*v,0)/samples.length);if(volume>.015)lastSpeech=Date.now();}const meter=host.querySelector('[data-level]');if(meter)meter.value=Math.min(1,volume*8);if(analyzer&&audioContext?.state==='running'&&Date.now()-lastSpeech>=4000)void answer();if(performance.now()-answerStarted>=120000)void answer();},100);
  }catch{notice='마이크를 시작하지 못했습니다. 권한을 확인해주세요.';await end(false);}
 }
 async function capture(){clearInterval(timer);if(!recorder||recorder.state!=='recording')return;const active=recorder;await new Promise(resolve=>{active.onstop=resolve;active.stop();});recorder=null;const blob=new Blob(parts,{type:active.mimeType.split(';')[0]});if(blob.size<=44)throw Error('empty_recording');const turn={number:index+1,questionId:selected[index].id,question:selected[index].prompt,answer:'',duration:Math.min(120,(performance.now()-answerStarted)/1000),audioBytes:blob.size,audioHash:await hash(blob),audioMime:blob.type,blob};run.turns.push(turn);await save();void sync();}
 async function answer(){if(busy||talking||screen!=='live')return;busy=true;try{await capture();if(index+1===selected.length)await end(true);else{index++;busy=false;await ask();}}catch{notice='답변 저장에 실패했습니다. 기기 저장 공간을 확인해주세요.';busy=false;render();}}
 async function end(completed){stopQuestion();try{await capture();run.completed=completed;run.finished=true;await save();}catch{notice='기기 저장 공간을 확인해주세요.';}stopHardware();screen='result';busy=false;render();void sync();}
 const sample=n=>list().map(q=>({q,sort:crypto.getRandomValues(new Uint32Array(1))[0]})).sort((a,b)=>a.sort-b.sort).slice(0,n).map(v=>v.q.id);
 async function click(event){const b=event.target.closest('[data-pilot]');if(!b||b.disabled||!host.contains(b))return;const action=b.dataset.pilot;if(busy&&action!=='back')return;
  if(action==='back'){if(busy&&screen!=='live'){startGeneration++;busy=false;stopHardware();screen='home';notice='';render();return;}if(busy)return;if(screen==='live'){if(confirm('면접을 종료하고 지금까지의 답변을 저장할까요?'))await end(false);return;}if(screen==='home'){location.hash='#interview-prep?tab=mock';return;}screen='home';notice='';render();return;}
  if(['catalog','settings','records','home'].includes(action)){screen=action;notice='';await reload();render();if(action==='records')void sync();}
  if(action==='all'||action==='stars'){stars=action==='stars';render();}
  if(action==='favorite'){const id=b.dataset.id;if(!favorites.delete(id))favorites.add(id);localStorage.setItem(scope+':favorites',JSON.stringify([...favorites]));render();}
  if(action==='quick'||action==='configured')await start(sample(action==='quick'?3:count));
  if(action==='one')await start([b.dataset.id]);
  if(action==='answer')await answer();
  if(action==='end'&&confirm('면접을 종료하고 답변을 저장할까요?'))await end(false);
  if(action==='repeat')await start(run.turns.map(t=>t.questionId));
  if(action==='record'){run=records.find(r=>r.runId===b.dataset.id);screen='result';render();}
  if(action==='delete'){const row=records.find(r=>r.runId===b.dataset.id);if(row.synced!==JSON.stringify(meta(row))){notice='전송 완료 후 기기 기록을 삭제할 수 있습니다.';render();return;}if(confirm('기기에 저장된 이 연습 기록을 삭제할까요?')){await store.run('delete',row.runId);await reload();render();}}
 }
 function change(e){if(e.target.matches('[data-pilot-field]'))field=e.target.value;if(e.target.matches('[data-pilot-region]'))region=e.target.value;if(e.target.matches('[data-pilot-count]')){count=Number(e.target.value);localStorage.setItem(scope+':count',String(count));}render();}
 function visibility(){if(document.hidden&&screen==='live'&&!busy)void end(false);else if(!document.hidden)void sync();}
 function unload(e){if(screen==='live'||busy){e.preventDefault();e.returnValue='';}}
 host.addEventListener('click',click);host.addEventListener('change',change);document.addEventListener('visibilitychange',visibility);window.addEventListener('beforeunload',unload);
 try{store=await openStore();await reload();await load();for(const category of ['job','personality'])try{const r=await fetch(`/assets/interview-${category}-audio/catalog.json`);if(r.ok)audioCatalogs[category]=indexQuestionAudioCatalog(await r.json());}catch{}render();void sync();}catch{host.innerHTML='<p role="status">이용 권한이나 기기 저장 공간을 확인한 뒤 다시 열어주세요.</p>';}
 return {canLeave:()=>screen!=='live'&&!busy,destroy(){destroyed=true;startGeneration++;stopQuestion();if(recorder?.state==='recording')recorder.stop();stopHardware();releasePlayers();host.removeEventListener('click',click);host.removeEventListener('change',change);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('beforeunload',unload);if(!syncing)store?.close();}};
}
