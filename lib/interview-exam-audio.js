'use strict';
const MAX_AUDIO_BYTES = 3000000;
function inspectWav(buffer) {
  const invalid = () => {throw Object.assign(new Error('invalid_audio'),{code:'invalid_audio'});};
  if (!Buffer.isBuffer(buffer) || buffer.length < 44 || buffer.length > MAX_AUDIO_BYTES ||
      buffer.toString('ascii',0,4)!=='RIFF' || buffer.toString('ascii',8,12)!=='WAVE' || buffer.readUInt32LE(4)+8!==buffer.length) invalid();
  let format, samples, offset=12;
  while(offset<buffer.length) {
    if(offset+8>buffer.length) invalid();
    const id=buffer.toString('ascii',offset,offset+4), size=buffer.readUInt32LE(offset+4), start=offset+8;
    if(start+size>buffer.length) invalid();
    if(id==='fmt ') {
      if(format || size<16) invalid();
      format={codec:buffer.readUInt16LE(start),channels:buffer.readUInt16LE(start+2),rate:buffer.readUInt32LE(start+4),
        byteRate:buffer.readUInt32LE(start+8),align:buffer.readUInt16LE(start+12),bits:buffer.readUInt16LE(start+14)};
    }
    if(id==='data'){if(samples)invalid();samples=buffer.subarray(start,start+size);}
    offset=start+size+(size%2);
  }
  // A bounded, uncompressed validation format. File extension/MIME are never trusted.
  if(offset!==buffer.length || !format || !samples || format.codec!==1 || format.channels!==1 || format.rate!==16000 ||
      format.bits!==16 || format.align!==2 || format.byteRate!==32000 || samples.length%2 || !samples.length) invalid();
  const duration=samples.length/32000;
  if(duration<1 || duration>90)invalid();
  let energy=0,clipped=0,activeFrames=0,frames=0;
  for(let start=0;start<samples.length;start+=640){
    let frameEnergy=0,n=0;
    for(let at=start;at<Math.min(start+640,samples.length);at+=2){const v=samples.readInt16LE(at)/32768;frameEnergy+=v*v;n++;if(Math.abs(v)>=0.999)clipped++;}
    energy+=frameEnergy;frames++;if(Math.sqrt(frameEnergy/n)>=0.01)activeFrames++;
  }
  const rms=Math.sqrt(energy/(samples.length/2)),clippingRatio=clipped/(samples.length/2),activeRatio=activeFrames/frames,reasons=[];
  if(rms<0.005 || activeFrames<15)reasons.push('audio_too_quiet');
  if(clippingRatio>0.005)reasons.push('audio_clipped');
  // Energy is not a speech, speaker identity, noise or intelligibility detector.
  return {durationSeconds:duration,rms,clippingRatio,activeRatio,reasons};
}
module.exports={inspectWav,MAX_AUDIO_BYTES};
