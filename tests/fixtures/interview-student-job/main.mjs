import {mountInterviewApp} from '/interview-app-ui.js';
// This override exists only in this isolated QA fixture. Production requests the real microphone.
const contexts=[];
Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{async getUserMedia(){
 const context=new AudioContext();contexts.push(context);await context.resume();
 const oscillator=context.createOscillator(),gain=context.createGain(),destination=context.createMediaStreamDestination();
 gain.gain.value=.15;oscillator.connect(gain).connect(destination);oscillator.start();
 destination.stream.getTracks()[0].addEventListener('ended',()=>{oscillator.stop();void context.close();});return destination.stream;
}}});
const api=async(url,body)=>{const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await response.json();if(!response.ok||!data.ok)throw Object.assign(Error(data.error),{code:data.error});return data;};
if(!location.hash)history.replaceState(null,'','#interview-prep?tab=mock&mockMode=job');
await mountInterviewApp(document.querySelector('#app'),{account:{id:'ip-a',name:'가상 학생'},request:async()=>({notes:[],topics:[],member:{},profile:null,writings:[]}),aiRequest:api});
const debug=document.createElement('button');debug.textContent='합성 녹음 저장 진단';document.body.append(debug);
debug.onclick=async()=>{
 const {openAttemptStore}=await import('/client/interview-attempts/indexeddb.mjs');const store=await openAttemptStore();const rows=await store.list('ip-a');
 const output=document.createElement('pre');output.textContent=JSON.stringify(rows.map(r=>({id:r.id,state:r.state,chunks:r.chunks,bytes:r.bytes,mimeType:r.mimeType})),null,2);document.body.append(output);store.close();
};
const preparedTest=document.createElement('button');preparedTest.textContent='제출 WAV 기기 보존 검증';document.body.append(preparedTest);
preparedTest.onclick=async()=>{
 const output=document.createElement('pre');document.body.append(output);
 try{
  const {openAttemptStore}=await import('/client/interview-attempts/indexeddb.mjs'),{createAttempts}=await import('/client/interview-attempts/core.mjs'),{toExamWav}=await import('/client/interview-job-exam-audio.mjs'),{openJobSubmissions}=await import('/client/interview-job-submissions.mjs');
  const store=await openAttemptStore(),attempts=createAttempts({store}),record=(await attempts.list('ip-a')).find(r=>r.mode==='job'&&r.bytes>0);if(!record)throw Error('record_audio_first');
  const wav=await toExamWav(await attempts.audio('ip-a',record.id)),prepared=await openJobSubmissions();const fixed=await prepared.put('ip-a',record.id,wav);prepared.close();
  const reopened=await openJobSubmissions(),restored=await reopened.get('ip-a',record.id),hash=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await b.arrayBuffer()))).join(',');
  if(await hash(fixed)!==await hash(restored))throw Error('wav_changed');
  if(await reopened.get('other-account',record.id))throw Error('wrong_account');
  output.textContent='PASS 실제 브라우저 WAV 변환 → IndexedDB 확정 저장 → DB 재연결 후 동일 바이트 복원 · 다른 계정 접근 분리';reopened.close();store.close();
 }catch(e){output.textContent='FAIL '+e.message;}
};
