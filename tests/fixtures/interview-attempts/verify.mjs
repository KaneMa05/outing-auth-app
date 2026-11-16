import {openAttemptStore} from '/client/interview-attempts/indexeddb.mjs';
import {createAttempts} from '/client/interview-attempts/core.mjs';
import {recordAttempt} from '/client/interview-attempts/recorder.mjs';
import {recoverAttempts,withAttemptLease} from '/client/interview-attempts/recovery.mjs';
import {createAttemptSync,attemptRequest} from '/client/interview-attempts/sync.mjs';
const output=document.querySelector('#result'),accountId='synthetic-qa';
const log=text=>{output.textContent+='\n'+text;};
const assert=(value,message)=>{if(!value)throw Error(message);log('PASS '+message);};
const store=await openAttemptStore({name:'ronpark-attempt-browser-qa-v1'}),attempts=createAttempts({store});
const start=(mode='job')=>attempts.start({accountId,mode,questions:[{id:'qa-q1',prompt:'합성음 시험 질문'}]});
const request=attemptRequest();let recording, audioContext,playbackUrl;
function play(blob){if(playbackUrl)URL.revokeObjectURL(playbackUrl);playbackUrl=URL.createObjectURL(blob);document.querySelector('#player').src=playbackUrl;}
async function playable(blob){
 const audio=new Audio(URL.createObjectURL(blob));
 try { await new Promise((resolve,reject)=>{audio.onloadeddata=resolve;audio.onerror=()=>reject(Error('audio_decode_failed'));audio.load();});assert(audio.readyState>=2,'실제 브라우저 음성 디코딩'); }
 finally {URL.revokeObjectURL(audio.src);}
}
function action(id,fn){document.querySelector(id).onclick=async()=>{output.textContent='검증 중';try{await fn();log('완료');}catch(e){log('FAIL '+e.message);}};}
action('#run',async()=>{
 audioContext=new AudioContext();await audioContext.resume();const oscillator=audioContext.createOscillator(),destination=audioContext.createMediaStreamDestination();oscillator.connect(destination);oscillator.start();
 const attempt=await start();
 await withAttemptLease(attempt.id,async()=>{
  const recorder=recordAttempt({attempts,accountId,id:attempt.id,stream:destination.stream});
  await new Promise(resolve=>setTimeout(resolve,2300));await recorder.stop();
 });
 oscillator.stop();await audioContext.close();
 const saved=await attempts.get(accountId,attempt.id),blob=await attempts.audio(accountId,attempt.id);
 assert(saved.state==='recorded'&&saved.chunks>0&&blob.size>0,'MediaRecorder 녹음 → IndexedDB 조각 저장 → 종료');
 await playable(blob);play(blob);
 // Atomic rollback: a stale sequence must not overwrite metadata or add a chunk.
 let rejected=false;try{await store.append({...saved,state:'recording',chunks:100},blob,99);}catch{rejected=true;}
 assert(rejected&&(await attempts.get(accountId,attempt.id)).chunks===saved.chunks,'잘못된 저장 순서 트랜잭션 롤백');
 const orphan=await start('personality');await attempts.append(accountId,orphan.id,blob);
 const busy=await start('ai');
 await withAttemptLease(busy.id,async()=>{
  const recovered=await recoverAttempts(attempts,accountId);assert(recovered.busy.includes(busy.id),'활성 녹음 잠금은 복구가 변경하지 않음');
 });
 // Create a fresh unfinished record specifically for the reload recovery step.
 const dangling=await start('personality');await attempts.append(accountId,dangling.id,blob);
 localStorage.setItem('attempt-browser-qa',JSON.stringify({id:attempt.id,dangling:dangling.id,bytes:blob.size}));
 store.close();const reopened=await openAttemptStore({name:'ronpark-attempt-browser-qa-v1'});assert((await reopened.get(attempt.id)).bytes===blob.size,'DB 연결을 닫고 다시 열어 음성 보존');reopened.close();
 log('이제 브라우저를 새로고침하고 복구·서버 저장 검증을 누르세요.');
});
action('#recover',async()=>{
 const previous=JSON.parse(localStorage.getItem('attempt-browser-qa')||'null');if(!previous)throw Error('run_recording_first');
 const recovered=await recoverAttempts(attempts,accountId);
 assert((await attempts.get(accountId,previous.dangling)).state==='interrupted','페이지 새로고침 후 미완료 응시 복구');
 const blob=await attempts.audio(accountId,previous.id);assert(blob.size===previous.bytes,'새 페이지에서 녹음 조각 복구');await playable(blob);play(blob);
 const sync=createAttemptSync({attempts,request});const uploaded=await sync.upload(accountId,previous.id);assert(uploaded.status==='stored','실제 HTTP → 서버 디스크 분할 업로드·확정');
 const duplicate=await sync.upload(accountId,previous.id);assert(duplicate.sha256===uploaded.sha256,'같은 업로드 재요청 멱등성');
 const response=await fetch('/attempt-api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'audio',id:previous.id})});
 const remote=await response.blob();assert(response.ok&&remote.size===blob.size,'인증된 서버 음성 조회');
 const hash=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await b.arrayBuffer()))).join(',');assert(await hash(blob)===await hash(remote),'서버 원본과 기기 원본 해시 일치');await playable(remote);
 let failed=false;try{await createAttemptSync({attempts,request:async()=>{throw Error('offline');}}).upload(accountId,previous.dangling);}catch{failed=true;}
 assert(failed&&(await attempts.audio(accountId,previous.dangling)).size>0,'업로드 실패 시 기기 원본 보존');
 const retry=await sync.upload(accountId,previous.dangling);assert(retry.status==='stored','실패 후 중단 기록 업로드 재시도');
 const stranger=await attempts.list('other-account');assert(stranger.length===0,'다른 계정의 기기 기록 숨김');
 const disposable=await start();await attempts.append(accountId,disposable.id,blob);await attempts.remove(accountId,disposable.id);assert((await store.chunks(disposable.id)).length===0,'삭제 시 실제 IndexedDB 음성 조각 제거');
 log('복구 '+recovered.recovered.length+'개. 실제 마이크 검증은 별도 버튼으로 실행할 수 있습니다.');
});
action('#mic',async()=>{
 const stream=await navigator.mediaDevices.getUserMedia({audio:true});
 try {const attempt=await start();recording=recordAttempt({attempts,accountId,id:attempt.id,stream});document.querySelector('#stop').disabled=false;document.querySelector('#mic').disabled=true;log('기기 마이크 녹음 중');}
 catch(e){stream.getTracks().forEach(t=>t.stop());throw e;}
});
action('#stop',async()=>{await recording.stop();document.querySelector('#stop').disabled=true;document.querySelector('#mic').disabled=false;log('기기 마이크 저장 완료');});
