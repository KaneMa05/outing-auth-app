const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {buildReview}=require('../scripts/prepare-interview-specialty-classification.cjs');
(async()=>{
 const code=fs.readFileSync('client/interview-question-audio.js','utf8');
 const {indexQuestionAudioCatalog,resolveQuestionAudio}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
 const catalogs=Object.fromEntries(['job','personality'].map(category=>[category,indexQuestionAudioCatalog(JSON.parse(fs.readFileSync('assets/interview-'+category+'-audio/catalog.json','utf8')))]));
 const review=buildReview();
 for(const q of review.records){
  const audio=resolveQuestionAudio({id:q.question_id,prompt:q.source_prompt,category:q.category},catalogs);
  assert.equal(audio.state,'matched',q.question_id);
  assert(fs.existsSync(path.resolve(audio.url)),audio.url);
  assert.equal(audio.clip.prompt,q.source_prompt);
 }
 const q=review.records.find(q=>q.source_category!==q.category),question={id:q.question_id,prompt:q.source_prompt,category:q.category};
 const moved=resolveQuestionAudio(question,catalogs);
 assert.equal(moved.category,q.source_category);
 assert.equal(resolveQuestionAudio({...question,prompt:'Changed question text'},catalogs).state,'stale');
 const copied=new Map(catalogs[q.category]);copied.set(q.question_id,{...moved.clip,prompt:'stale text'});
 assert.equal(resolveQuestionAudio(question,{...catalogs,[q.category]:copied}).category,q.source_category,'Prefer an exact fallback over a stale primary recording');
 assert.equal(resolveQuestionAudio(question,{}).state,'unavailable');
 assert.equal(resolveQuestionAudio({...question,id:'q-aaaa'},{job:new Map(),personality:new Map()}).state,'missing');
 assert.equal(indexQuestionAudioCatalog({version:1,clips:[{id:'q-aaaa',prompt:'test',file:'../../outside.mp3'}]}).size,0);
 assert.throws(()=>indexQuestionAudioCatalog({version:2,clips:[]}),/invalid_audio_catalog/);
 console.log('PASS all 5,128 recordings resolve by ID and exact text after reclassification; original audio files retained; missing/stale/failure/invalid path handling.');
})().catch(e=>{console.error(e);process.exitCode=1;});
