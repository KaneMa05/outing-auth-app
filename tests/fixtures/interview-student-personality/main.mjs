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
if(!location.hash)history.replaceState(null,'','#interview-prep?tab=mock&mockMode=personality');
await mountInterviewApp(document.querySelector('#app'),{account:{id:'ip-a',name:'가상 학생'},request:async()=>({notes:[],topics:[],member:{},profile:null,writings:[]}),aiRequest:api});
