'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');

// Use the reviewed recordings already in the repository. Never synthesize or
// silently substitute a clip whose source question has changed.
function prepareTestQuestionAudio(root,target){
 const folder=path.join(target,'interview/src/debug/assets/interview-question-audio');
 const catalogFile=path.join(folder,'catalog.json');
 const catalog=JSON.parse(fs.readFileSync(catalogFile,'utf8'));
 const scope=JSON.parse(fs.readFileSync(path.join(root,'lib/interview-test-question-scope.json'),'utf8'));
 const prepared=[];
 for(const mode of ['job','personality']){
  const sourceFolder=path.join(root,'assets/interview-'+mode+'-audio');
  const source=JSON.parse(fs.readFileSync(path.join(sourceFolder,'catalog.json'),'utf8'));
  for(const question of scope.questions.filter(q=>q.modes.includes(mode))){
   const clip=source.clips.find(c=>c.id===question.id&&c.prompt===question.prompt);
   if(!clip||!clip.file.match(/^[A-Za-z0-9_-]+\.mp3$/))throw Error('Missing reviewed test question recording: '+question.id);
   const bytes=fs.readFileSync(path.join(sourceFolder,clip.file));
   const digest=crypto.createHash('sha256').update(bytes).digest('hex');
   if(bytes.length!==clip.bytes||digest!==clip.sha256)throw Error('Test recording checksum mismatch: '+question.id);
   fs.copyFileSync(path.join(sourceFolder,clip.file),path.join(folder,clip.file));
   const row={...clip,category:question.category,tracks:clip.tracks||question.tracks||[],testMode:mode};
   const index=catalog.clips.findIndex(c=>c.id===question.id);
   if(index<0)catalog.clips.push(row);else catalog.clips[index]=row;
   prepared.push({id:question.id,prompt:question.prompt,file:clip.file,category:question.category,sha256:digest});
  }
 }
 fs.writeFileSync(catalogFile,JSON.stringify(catalog,null,2)+'\n');
 fs.writeFileSync(path.join(target,'interview/src/debug/assets/interview-test-question-audio.json'),JSON.stringify({questions:prepared},null,2)+'\n');
 return prepared;
}
module.exports={prepareTestQuestionAudio};
