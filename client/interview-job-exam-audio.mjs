// Browser-native decoding/resampling. Only canonical 16 kHz mono PCM WAV is submitted.
export function pcmWav(samples,sampleRate=16000){
 if(sampleRate!==16000||samples.length<16000||samples.length>1440000)throw Error('invalid_audio_duration');
 const bytes=new ArrayBuffer(44+samples.length*2),v=new DataView(bytes);
 const text=(at,s)=>{for(let i=0;i<s.length;i++)v.setUint8(at+i,s.charCodeAt(i));};
 text(0,'RIFF');v.setUint32(4,bytes.byteLength-8,true);text(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,16000,true);v.setUint32(28,32000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);text(36,'data');v.setUint32(40,samples.length*2,true);
 for(let i=0;i<samples.length;i++){const sample=Number.isFinite(samples[i])?Math.max(-1,Math.min(1,samples[i])):0;v.setInt16(44+i*2,Math.round(sample*(sample<0?32768:32767)),true);}
 return new Blob([bytes],{type:'audio/wav'});
}
export async function toExamWav(blob,{OfflineAudioContext=globalThis.OfflineAudioContext||globalThis.webkitOfflineAudioContext}={}){
 if(!OfflineAudioContext)throw Error('audio_conversion_unsupported');
 if(blob.size>64000000)throw Error('recording_limit');
 const context=new OfflineAudioContext(1,1,16000);
 const decoded=await context.decodeAudioData(await blob.arrayBuffer());
 const length=Math.min(decoded.length,1440000),mono=new Float32Array(length);
 for(let channel=0;channel<decoded.numberOfChannels;channel++){const samples=decoded.getChannelData(channel);for(let i=0;i<length;i++)mono[i]+=samples[i]/decoded.numberOfChannels;}
 return pcmWav(mono);
}
export async function audioBase64(blob){
 const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';
 for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(binary);
}
