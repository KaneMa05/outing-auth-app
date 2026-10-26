const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const source=fs.readFileSync('client/interview-experience-prompts.js','utf8');
 const {experiencePrompts,appendExperiencePrompt}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 for(const row of [{},{title:'갈등'},{content:'실패한 경험'},{title:'목표 달성'},{content:'협력한 경험'}]){
  const qs=experiencePrompts(row);assert.equal(qs.length,4);assert.equal(new Set(qs).size,4);
 }
 const general=experiencePrompts({});let value='원래 작성한 경험입니다.';
 for(const q of general)value=appendExperiencePrompt(value,q).content;
 assert.deepEqual(experiencePrompts({content:value}),general,'inserted prompt headings do not reclassify the experience');
 assert.equal(appendExperiencePrompt(value,general[0]).reason,'duplicate');
 assert.equal(appendExperiencePrompt('가'.repeat(12000),general[0]).reason,'limit');
 assert.equal(appendExperiencePrompt('🙂'.repeat(6000),general[0]).reason,'added','limit counts code points consistently with save validation');
 assert.equal(appendExperiencePrompt('원문\n',general[0]).content.startsWith('원문\n'),true);
 assert.equal(experiencePrompts({content:'<img src=x onerror=alert(1)>'}).join('').includes('<img'),false);
 console.log('PASS contextual templates, heading exclusion, duplicate/size guards, Unicode and original text preservation');
})().catch(e=>{console.error(e);process.exitCode=1;});
