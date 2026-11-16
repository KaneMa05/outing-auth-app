const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {test}=require('node:test');
const {packageRevision}=require('../scripts/package-interview-revised-audio.cjs');
const root=path.resolve(__dirname,'..');
const ffmpeg=process.env.FFMPEG_PATH||path.join(root,'.tmp/interview-audio-tools/node_modules/@ffmpeg-installer/win32-x64/ffmpeg.exe');
const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
const write=(file,data)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(data));};
function fixture(){
 const dir=fs.mkdtempSync(path.join(root,'.tmp/interview-revised-audio-')),source=path.join(dir,'source');
 const old={id:'q-aaaa',prompt:'Original question',spokenPrompt:'Previous script',file:'q-aaaa-1111111111111111.mp3',sha256:'old',bytes:1001};
 const untouched={id:'q-bbbb',prompt:'Other question',spokenPrompt:'Other script',displayPrompt:'Other display',file:'q-bbbb-2222222222222222.mp3',sha256:'other',bytes:1002};
 for(const category of ['job','personality'])write(path.join(dir,'assets/interview-'+category+'-audio/catalog.json'),{version:1,clips:category==='job'?[old]:[untouched]});
 fs.writeFileSync(path.join(dir,'assets/interview-job-audio',old.file),'retained original');
 const wav=Buffer.alloc(44+24000);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(24000,24);wav.writeUInt32LE(48000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(24000,40);
 for(let i=0;i<12000;i++)wav.writeInt16LE(Math.round(4000*Math.sin(i/10)),44+2*i);
 const q={id:old.id,prompt:old.prompt,category:'job',spokenPrompt:'Corrected script',file:old.id+'.wav',sha256:sha(wav)};
 write(path.join(source,'catalog.json'),{verification:{complete:true,total:1},clips:[q]});
 write(path.join(source,'requests.json'),{questions:[{...q,previousSpokenPrompt:old.spokenPrompt,previousFile:old.file,previousSha256:old.sha256}]});
 fs.writeFileSync(path.join(source,q.file),wav);
 return {dir,source,old,untouched,q};
}
test('a revision changes its script and MP3 together, preserving every other record and the old recording',async()=>{
 const f=fixture(),report=await packageRevision({source:f.source,ffmpeg,appRoot:f.dir});
 const job=JSON.parse(fs.readFileSync(path.join(f.dir,'assets/interview-job-audio/catalog.json'))).clips[0];
 const personality=JSON.parse(fs.readFileSync(path.join(f.dir,'assets/interview-personality-audio/catalog.json'))).clips[0];
 assert.equal(job.prompt,f.old.prompt);assert.equal(job.spokenPrompt,f.q.spokenPrompt);
 assert.notEqual(job.file,f.old.file);assert.equal(sha(fs.readFileSync(path.join(f.dir,'assets/interview-job-audio',job.file))),job.sha256);
 assert(fs.existsSync(path.join(f.dir,'assets/interview-job-audio',f.old.file)));
 assert.deepEqual(personality,f.untouched);assert.equal(report.replaced,1);assert.equal(report.unchanged,1);
});
for(const kind of ['incomplete','corrupt-wave','stale-question','duplicate'])test(kind+' aborts before replacing app catalogs',async()=>{
 const f=fixture(),file=path.join(f.dir,'assets/interview-job-audio/catalog.json'),before=fs.readFileSync(file);
 const catalogFile=path.join(f.source,'catalog.json'),catalog=JSON.parse(fs.readFileSync(catalogFile));
 if(kind==='incomplete')catalog.verification.complete=false;
 if(kind==='corrupt-wave')fs.writeFileSync(path.join(f.source,f.q.file),'damaged audio');
 if(kind==='stale-question')catalog.clips[0].prompt='Changed original';
 if(kind==='duplicate')catalog.clips.push(catalog.clips[0]);
 write(catalogFile,catalog);
 await assert.rejects(packageRevision({source:f.source,ffmpeg,appRoot:f.dir}));
 assert(fs.readFileSync(file).equals(before));
});
