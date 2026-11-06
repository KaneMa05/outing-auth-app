'use strict';
// Stage and validate the complete revision before changing either app catalog.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {promisify}=require('node:util'),execFile=promisify(require('node:child_process').execFile);
const root=path.resolve(__dirname,'..');
const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const displayTitles=require('./data/interview-audio-display-titles.json');

async function packageRevision({source,ffmpeg,appRoot=root}){
 const catalog=read(path.join(source,'catalog.json'));
 const requests=read(path.join(source,'requests.json')).questions;
 if(!catalog.verification?.complete||catalog.verification.total!==requests.length||catalog.clips.length!==requests.length)throw Error('Verify the complete revision before packaging');
 const byId=new Map(catalog.clips.map(q=>[q.id,q]));
 if(byId.size!==requests.length||new Set(requests.map(q=>q.id)).size!==requests.length)throw Error('Duplicate revision question IDs');
 const categories=['job','personality'];
 const current=Object.fromEntries(categories.map(category=>[category,read(path.join(appRoot,'assets/interview-'+category+'-audio/catalog.json'))]));
 const staged=[];
 const stage=path.join(source,'mp3');fs.mkdirSync(stage,{recursive:true});
 // Fail on stale source text or damaged WAVs before converting or replacing anything.
 for(const request of requests){
  const q=byId.get(request.id);
  const original=current[request.category]?.clips.find(clip=>clip.id===request.id);
  if(!q||!original||!/^q-[a-f0-9]+$/.test(q.id)||q.file!==q.id+'.wav')throw Error('Invalid revision source: '+request.id);
  for(const key of ['prompt','spokenPrompt','category'])if(q[key]!==request[key])throw Error('Revision script mismatch: '+request.id);
  if(original.prompt!==request.prompt)throw Error('Original question changed: '+request.id);
  if(original.spokenPrompt!==request.previousSpokenPrompt&&original.spokenPrompt!==request.spokenPrompt)throw Error('App script changed: '+request.id);
  if(original.spokenPrompt===request.previousSpokenPrompt&&
   (original.file!==request.previousFile||original.sha256!==request.previousSha256))throw Error('App recording changed: '+request.id);
  const title=displayTitles[q.id];
  if(title&&title.spokenPrompt!==q.spokenPrompt)throw Error('Display title needs review: '+request.id);
  if(original.displayPrompt&&!title)throw Error('Review the numeric display title first: '+request.id);
  if(sha(fs.readFileSync(path.join(source,q.file)))!==q.sha256)throw Error('Source checksum mismatch: '+q.id);
 }
 for(const request of requests){
  const q=byId.get(request.id),input=path.join(source,q.file),temporary=path.join(stage,q.id+'.mp3');
  await execFile(ffmpeg,['-nostdin','-v','error','-y','-i',input,'-ac','1','-ar','24000','-codec:a','libmp3lame','-b:a','48k',temporary]);
  const data=fs.readFileSync(temporary),hash=sha(data);
  if(data.length<1000)throw Error('Empty MP3: '+q.id);
  const file=q.id+'-'+hash.slice(0,16)+'.mp3';
  const title=displayTitles[q.id];
  staged.push({category:request.category,temporary,clip:{id:q.id,prompt:q.prompt,spokenPrompt:q.spokenPrompt,
   ...(title?{displayPrompt:title.displayPrompt}:{}),file,sha256:hash,bytes:data.length}});
 }
 const replacements=new Map(staged.map(q=>[q.clip.id,q.clip]));
 for(const category of categories){
  const folder=path.join(appRoot,'assets/interview-'+category+'-audio');
  for(const entry of staged.filter(q=>q.category===category))fs.copyFileSync(entry.temporary,path.join(folder,entry.clip.file));
  const updated={...current[category],clips:current[category].clips.map(q=>replacements.get(q.id)||q)};
  const target=path.join(folder,'catalog.json'),temporary=target+'.revision.tmp';
  fs.writeFileSync(temporary,JSON.stringify(updated)+'\n');fs.renameSync(temporary,target);
 }
 const report={replaced:staged.length,byCategory:Object.fromEntries(categories.map(c=>[c,staged.filter(q=>q.category===c).length])),
  unchanged:categories.reduce((sum,c)=>sum+current[c].clips.length,0)-staged.length,
  originalFilesPreserved:true,clips:staged.map(q=>q.clip)};
 fs.writeFileSync(path.join(source,'packaging.json'),JSON.stringify(report,null,2)+'\n');
 return report;
}
module.exports={packageRevision};
if(require.main===module)packageRevision({
 source:path.resolve(process.argv[2]||'artifacts/interview-question-audio/wording-audio-20261106'),
 ffmpeg:process.argv[3]||'ffmpeg'
}).then(report=>console.log('Packaged '+report.replaced+' revised recordings; '+report.unchanged+' existing recordings retained.'))
 .catch(error=>{console.error(error.message);process.exitCode=1;});
