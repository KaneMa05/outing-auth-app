'use strict';
// Package existing, verified recordings only; never generates speech or calls an API.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {promisify}=require('node:util'),execFile=promisify(require('node:child_process').execFile);
const root=path.resolve(__dirname,'..');
const source=path.join(root,'artifacts/interview-question-audio/local-qwen-interviewer');
const category=process.argv[3]||'job';
if(!['job','personality'].includes(category))throw Error('Invalid question category');
const output=path.join(root,'assets/interview-'+category+'-audio');
const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
const displayTitles=require('./data/interview-audio-display-titles.json');
async function main(){
 const catalog=JSON.parse(fs.readFileSync(path.join(source,'catalog.json'),'utf8'));
 if(!catalog.verification?.complete)throw Error('Verify the source catalog before packaging');
 const jobs=catalog.clips.filter(q=>q.category===category);
 if(new Set(jobs.map(q=>q.id)).size!==jobs.length)throw Error('Duplicate question IDs');
 fs.mkdirSync(output,{recursive:true});
 const clips=new Array(jobs.length);let cursor=0;
 await Promise.all(Array.from({length:4},async()=>{
  while(cursor<jobs.length){
   const index=cursor++,q=jobs[index];
   const title=displayTitles[q.id];
   if(title&&title.spokenPrompt!==q.spokenPrompt)throw Error('Display title needs review: '+q.id);
   if(!/^q-[a-f0-9]+$/.test(q.id)||q.file!==q.id+'.wav')throw Error('Invalid source filename');
   const input=path.join(source,q.file);
   if(sha(fs.readFileSync(input))!==q.sha256)throw Error('Source checksum mismatch: '+q.id);
   const file=q.id+'-'+q.sha256.slice(0,16)+'.mp3',target=path.join(output,file);
   await execFile(process.argv[2]||'ffmpeg',['-nostdin','-v','error','-y','-i',input,'-ac','1','-ar','24000','-codec:a','libmp3lame','-b:a','48k',target]);
   const data=fs.readFileSync(target);
   clips[index]={id:q.id,prompt:q.prompt,spokenPrompt:q.spokenPrompt,...(title?{displayPrompt:title.displayPrompt}:{}),file,sha256:sha(data),bytes:data.length};
  }
 }));
 fs.writeFileSync(path.join(output,'catalog.json'),JSON.stringify({version:1,clips})+'\n');
 console.log('Packaged '+clips.length+' '+category+' question recordings ('+(clips.reduce((sum,q)=>sum+q.bytes,0)/1048576).toFixed(1)+' MiB).');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
