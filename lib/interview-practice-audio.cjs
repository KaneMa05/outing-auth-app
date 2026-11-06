'use strict';
const {inspectWav}=require('./interview-exam-audio');
// A bounded linear gain preserves wording, timing and the unmodified saved original.
function preparePracticeAudio(original){
 const quality=inspectWav(original);
 if(quality.reasons.length)return {audio:original,gain:1,quality};
 let start=12,samples;
 while(start<original.length){const size=original.readUInt32LE(start+4);if(original.toString('ascii',start,start+4)==='data'){samples={start:start+8,size};break;}start+=8+size+(size%2);}
 let peak=0;for(let i=samples.start;i<samples.start+samples.size;i+=2)peak=Math.max(peak,Math.abs(original.readInt16LE(i))/32768);
 const gain=Math.max(1,Math.min(4,0.08/quality.rms,0.90/Math.max(peak,0.00001)));
 if(gain<1.05)return {audio:original,gain:1,quality};
 const audio=Buffer.from(original);
 for(let i=samples.start;i<samples.start+samples.size;i+=2)audio.writeInt16LE(Math.max(-32768,Math.min(32767,Math.round(original.readInt16LE(i)*gain))),i);
 return {audio,gain,quality};
}
module.exports={preparePracticeAudio};
