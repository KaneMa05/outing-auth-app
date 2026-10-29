'use strict';
// Keep iOS debug resources identical to Android's canonical packaged question bank.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const source=path.join(root,'native/android/interview/src/debug/assets/interview-question-audio');
const target=path.join(root,'native/ios/App/DebugResources/InterviewPracticeAudio');
fs.mkdirSync(target,{recursive:true});
const files=fs.readdirSync(source);
for(const file of files){
 if(file!=='catalog.json'&&!/^[A-Za-z0-9_-]+\.mp3$/.test(file))throw Error('Unexpected question asset');
 fs.copyFileSync(path.join(source,file),path.join(target,file));
}
for(const file of fs.readdirSync(target))if(/^[A-Za-z0-9_-]+\.mp3$/.test(file)&&!files.includes(file))fs.unlinkSync(path.join(target,file));
fs.copyFileSync(path.join(root,'native/android/interview/src/debug/res/raw/interview_answer_cue.wav'),path.join(target,'answer-cue.wav'));
console.log('Synced Android/iOS debug question bank: '+files.length+' files and answer cue.');
