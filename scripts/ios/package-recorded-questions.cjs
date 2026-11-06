'use strict';
// Reuse the verified question recordings. No speech generation or network calls.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..');
function packageRecordings({sourceRoot=root,target=path.join(root,'.tmp/interview-recorded-audio')}={}){
 const clips=[],ids=new Set();
 for(const category of ['job','personality']){
  const folder=path.join(sourceRoot,'assets/interview-'+category+'-audio');
  const catalog=JSON.parse(fs.readFileSync(path.join(folder,'catalog.json'),'utf8'));
  if(catalog.version!==1||!Array.isArray(catalog.clips))throw Error('Invalid recording catalog');
  for(const clip of catalog.clips){
   if(!/^q-[a-f0-9]+$/.test(clip.id)||ids.has(clip.id)||
      !new RegExp('^'+clip.id+'-[a-f0-9]{16}\\.mp3$').test(clip.file)||
      typeof clip.prompt!=='string'||typeof clip.spokenPrompt!=='string')throw Error('Invalid recording: '+clip.id);
   const file=path.join(folder,clip.file),bytes=fs.readFileSync(file);
   if(bytes.length!==clip.bytes||crypto.createHash('sha256').update(bytes).digest('hex')!==clip.sha256)throw Error('Recording checksum mismatch: '+clip.id);
   ids.add(clip.id);clips.push({clip,file});
  }
 }
 // Finish validation before changing the generated package.
 fs.mkdirSync(target,{recursive:true});
 for(const {clip,file} of clips)fs.copyFileSync(file,path.join(target,clip.file));
 fs.writeFileSync(path.join(target,'catalog.json'),JSON.stringify({version:1,clips:clips.map(({clip})=>clip)})+'\n');
 return {count:clips.length,bytes:clips.reduce((sum,{clip})=>sum+clip.bytes,0),target};
}
if(require.main===module)console.log(JSON.stringify(packageRecordings({sourceRoot:path.resolve(process.argv[2]||root)})));
module.exports={packageRecordings};
