'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {packageRecordings}=require('../scripts/ios/package-recorded-questions.cjs');
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ios-recordings-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const catalogs={};
 for(const [index,category] of ['job','personality'].entries()){
  const folder=path.join(root,'assets/interview-'+category+'-audio');fs.mkdirSync(folder,{recursive:true});
  const bytes=Buffer.from('existing recorded question '+category),id='q-000'+index;
  const clip={id,prompt:'Original question '+index,spokenPrompt:'Recorded wording '+index,
   file:id+'-0123456789abcdef.mp3',bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
  fs.writeFileSync(path.join(folder,clip.file),bytes);
  catalogs[category]={version:1,clips:[clip]};
  fs.writeFileSync(path.join(folder,'catalog.json'),JSON.stringify(catalogs[category]));
 }
 return {root,catalogs,target:path.join(root,'package')};
}
test('packages both categories without changing verified bytes or question wording',t=>{
 const {root,catalogs,target}=fixture(t),result=packageRecordings({sourceRoot:root,target});
 assert.equal(result.count,2);
 const output=JSON.parse(fs.readFileSync(path.join(target,'catalog.json')));
 assert.deepEqual(output.clips,[...catalogs.job.clips,...catalogs.personality.clips]);
 for(const category of ['job','personality']){
  const clip=catalogs[category].clips[0];
  assert.deepEqual(fs.readFileSync(path.join(target,clip.file)),fs.readFileSync(path.join(root,'assets/interview-'+category+'-audio',clip.file)));
 }
});
test('rejects a corrupted recording before modifying an existing package',t=>{
 const {root,catalogs,target}=fixture(t);fs.mkdirSync(target);fs.writeFileSync(path.join(target,'keep.txt'),'previous package');
 fs.appendFileSync(path.join(root,'assets/interview-personality-audio',catalogs.personality.clips[0].file),'corrupt');
 assert.throws(()=>packageRecordings({sourceRoot:root,target}),/checksum mismatch/);
 assert.deepEqual(fs.readdirSync(target),['keep.txt']);
});
test('rejects unsafe recording filenames',t=>{
 const {root,catalogs,target}=fixture(t);catalogs.job.clips[0].file='../outside.mp3';
 fs.writeFileSync(path.join(root,'assets/interview-job-audio/catalog.json'),JSON.stringify(catalogs.job));
 assert.throws(()=>packageRecordings({sourceRoot:root,target}),/Invalid recording/);
 assert.equal(fs.existsSync(target),false);
});
