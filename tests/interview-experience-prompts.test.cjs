const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const source=fs.readFileSync('client/interview-experience-prompts.js','utf8');
 const {appendExperiencePrompt}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const general=['어떤 자료를 정리했나요?','발표를 맡은 이유는 무엇인가요?','팀원의 반응은 어땠나요?'];let value='원래 작성한 경험입니다.';
 for(const q of general)value=appendExperiencePrompt(value,q).content;
 assert.equal(appendExperiencePrompt(value,general[0]).reason,'duplicate');
 assert.equal(appendExperiencePrompt('가'.repeat(12000),general[0]).reason,'limit');
 assert.equal(appendExperiencePrompt('🙂'.repeat(6000),general[0]).reason,'added','limit counts code points consistently with save validation');
 assert.equal(appendExperiencePrompt('원문\n',general[0]).content.startsWith('원문\n'),true);

 console.log('PASS contextual templates, heading exclusion, duplicate/size guards, Unicode and original text preservation');
})().catch(e=>{console.error(e);process.exitCode=1;});
