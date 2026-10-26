const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createProvider}=require('../scripts/core25-diagnosis-cli.cjs');
const {draftQuestions,INSTRUCTIONS,schema}=require('../lib/interview-draft-questions');
(async()=>{
 const events=[];const provider=createProvider({runtimeDir:path.resolve('.tmp/draft-live'),instructions:INSTRUCTIONS,outputSchema:schema,effort:'low',onEvent:e=>events.push(e)});
 const experience={title:'팀 프로젝트 발표',content:'팀원 한 명이 발표를 부담스러워해서 제가 대신 발표했습니다. 그 팀원에게는 자료 조사와 출처 확인을 부탁했고, 저는 조사 내용을 세 장의 표로 정리했습니다. 발표 뒤 교수님은 출처가 명확하다고 말씀하셨습니다.'};
 const start=Date.now(),questions=await draftQuestions(experience,provider);assert.equal(questions.length,2);
 fs.mkdirSync('.tmp/draft-live',{recursive:true});fs.writeFileSync('.tmp/draft-live/verification.json',JSON.stringify({experience,questions,elapsedMs:Date.now()-start,events},null,2));
 console.log(JSON.stringify({questions,elapsedMs:Date.now()-start}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
