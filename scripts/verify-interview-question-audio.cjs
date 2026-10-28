'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const folder=path.resolve(__dirname,'../artifacts/interview-question-audio');
const catalog=JSON.parse(fs.readFileSync(path.join(folder,'catalog.json'),'utf8'));
const priority=JSON.parse(fs.readFileSync(path.join(folder,'priority-job-50.json'),'utf8'));
function duration(data){
 let offset=0,seconds=0,frames=0;
 if(data.subarray(0,3).toString()==='ID3'){assert.equal(data[5]&0x10,0,'Unsupported ID3 footer');offset=10+((data[6]&127)*2097152+(data[7]&127)*16384+(data[8]&127)*128+(data[9]&127));}
 while(offset+4<=data.length){
  if(data.subarray(offset,offset+3).toString()==='TAG'&&data.length-offset===128)break;
  const h=data.readUInt32BE(offset);assert.equal((h>>>21)&2047,2047,'Missing MPEG sync at '+offset);
  const version=(h>>>19)&3,layer=(h>>>17)&3,rateIndex=(h>>>10)&3,index=(h>>>12)&15;
  assert(version!==1&&layer===1&&rateIndex!==3&&index>0&&index<15,'Invalid MPEG Layer III frame');
  const bitrate=(version===3?[0,32,40,48,56,64,80,96,112,128,160,192,224,256,320]:[0,8,16,24,32,40,48,56,64,80,96,112,128,144,160])[index]*1000;
  const rate=[44100,48000,32000][rateIndex]/(version===3?1:version===2?2:4);
  const length=Math.floor((version===3?144:72)*bitrate/rate)+((h>>>9)&1);
  assert(offset+length<=data.length,'Truncated MP3 frame');offset+=length;seconds+=(version===3?1152:576)/rate;frames++;
 }
 assert(frames>0&&seconds>0.2,'Empty/short audio');return Number(seconds.toFixed(3));
}
const ids=new Set(),report=[];
for(const clip of catalog.clips){
 assert(!ids.has(clip.id),'Duplicate question ID');ids.add(clip.id);
 assert.equal(path.basename(clip.file),clip.id+'.mp3');
 const data=fs.readFileSync(path.join(folder,clip.file));assert.equal(data.length,clip.bytes);
 assert.equal(crypto.createHash('sha256').update(data).digest('hex'),clip.sha256);
 report.push({id:clip.id,seconds:duration(data)});
}
assert.equal(priority.length,50);assert.equal(new Set(priority.map(q=>q.id)).size,50);
assert.equal(priority.filter(q=>q.audioStatus==='ready').length,catalog.summary.priorityJobReady);
for(const q of priority){assert.equal(q.category,'job');assert(/[?？.]$/.test(q.spokenPrompt));if(q.audioStatus==='ready')assert(ids.has(q.id));}
fs.writeFileSync(path.join(folder,'verification.json'),JSON.stringify({clips:report.length,priorityReady:catalog.summary.priorityJobReady,allMp3FramesComplete:true,durations:report},null,2)+'\n');
console.log('PASS '+report.length+' MP3 files: complete MPEG frames, duration, SHA-256, unique IDs; priority job questions '+catalog.summary.priorityJobReady+'/50.');
