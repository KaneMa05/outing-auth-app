import {mountRubrics} from '/interview-rubric-ui.js';
import {mountInterviewApp} from '/interview-app-ui.js';
let view;
const api=async(url,body)=>{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(!r.ok||!d.ok)throw Object.assign(Error(d.error),{code:d.error});return d;};
const request=(action,body={})=>api('/prep-api',{action,...body});
const host=document.querySelector('#app');
// Synthetic audio exists only in this fixture; production requests a real microphone.
Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{async getUserMedia(){const context=new AudioContext();await context.resume();const oscillator=context.createOscillator(),gain=context.createGain(),destination=context.createMediaStreamDestination();gain.gain.value=.15;oscillator.connect(gain).connect(destination);oscillator.start();let closed=false;const track=destination.stream.getTracks()[0],stop=track.stop.bind(track);track.stop=()=>{stop();if(!closed){closed=true;oscillator.stop();void context.close();}};return destination.stream;}}});
async function show(student){if(view?.canLeave&&!view.canLeave())return;view?.destroy();host.replaceChildren();if(student){history.replaceState(null,'','#interview-prep?tab=mock&mockMode=job');view=await mountInterviewApp(host,{account:{id:'ip-a',name:'가상 학생'},aiRequest:api,request:async()=>({notes:[],topics:[],member:{},profile:null,writings:[]})});}else{history.replaceState(null,'','#concept-admin');view=mountRubrics(host,{request,canWrite:true,initialQuestionId:'qa-ais'});await view.ready;}}
document.querySelector('#qa-admin').onclick=()=>show(false);document.querySelector('#qa-student').onclick=()=>show(true);
document.querySelector('#qa-case').onchange=async e=>{await api('/qa/case',{scenario:e.target.value});document.querySelector('#qa-status').textContent='모의 사례를 변경했습니다. 이후 제출·검증에 적용합니다.';};
await show(false);
