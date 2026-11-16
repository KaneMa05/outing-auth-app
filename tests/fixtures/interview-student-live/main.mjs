import {mountInterviewApp} from '/interview-app-ui.js';
// Fixture-only simulated transport/audio. The production connectLive is unchanged.
let peer;
class SyntheticPeer{
 constructor(){peer=this;this.iceGatheringState='complete';}
 addTrack(){}
 createDataChannel(){return this.channel={readyState:'open',send(){},close(){}};}
 async createOffer(){return {type:'offer',sdp:'v=0 synthetic offer'};}
 async setLocalDescription(value){this.localDescription=value;}
 async setRemoteDescription(){this.emit({type:'session.started'});}
 emit(event){this.channel?.onmessage?.({data:JSON.stringify(event)});}
 close(){this.channel=null;}
}
window.RTCPeerConnection=SyntheticPeer;
Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{async getUserMedia(){
 const context=new AudioContext();await context.resume();const source=context.createOscillator(),destination=context.createMediaStreamDestination();source.connect(destination);source.start();
 const track=destination.stream.getTracks()[0],stop=track.stop.bind(track);track.stop=()=>{stop();source.stop();void context.close();};return destination.stream;
}}});
const api=async(url,body)=>{const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await response.json();if(!response.ok||!data.ok)throw Object.assign(Error(data.error),{code:data.error});return data;};
document.querySelector('#qa-answer').onclick=async()=>{try{const d=await api('/qa/answer',{});peer.emit({type:'session.input_transcript.delta',delta:d.answer});document.querySelector('#qa-status').textContent='가상 음성과 전사를 서버에 전송했습니다. 답변 완료를 누르세요.';}catch{document.querySelector('#qa-status').textContent='면접을 먼저 시작해주세요.';}};
if(!location.hash)history.replaceState(null,'','#interview-prep?tab=mock&mockMode=ai');
await mountInterviewApp(document.querySelector('#app'),{account:{id:'ip-a',name:'가상 학생'},request:async()=>({notes:[],topics:[],member:{},profile:null,writings:[]}),aiRequest:api});
