const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {draftQuestions}=require('../lib/interview-draft-questions');
const experience={title:'팀 프로젝트',content:'팀원이 발표를 맡기 어려워 제가 자료를 정리하고 발표했습니다.'};
const questions=['팀원이 발표하기 어려웠던 이유는 무엇인가요?','자료를 정리할 때 어떤 기준으로 내용을 골랐나요?'];
test('requires a real provider and grounded distinct questions, never template fallback',async()=>{
 await assert.rejects(draftQuestions(experience),/automation_disabled/);
 const result=await draftQuestions(experience,async payload=>{assert.deepEqual(payload.experience,experience);assert.equal(payload.kind,'draft_questions');return {questions:questions.map(text=>({text,evidence:'자료를 정리'}))};});assert.deepEqual(result,questions);
 for(const output of [{questions:[]},{questions:[{text:questions[0],evidence:'자료'}]},{questions:[...questions,'발표 결과는 무엇인가요?'].map(text=>({text,evidence:'자료'}))},{questions:questions.map(text=>({text,evidence:'우승했습니다'}))},{questions:questions.map(()=>({text:'같은 질문',evidence:'자료'}))}])await assert.rejects(draftQuestions(experience,async()=>output),/invalid_output/);
 await assert.rejects(draftQuestions(experience,async()=>{throw Error('offline');}),/offline/);
});
test('requires a click, suppresses empty drafts, ignores stale responses, restores cached results and stops on destroy',async()=>{
 const code=fs.readFileSync('client/interview-draft-questions.js','utf8');const {createDraftQuestions}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
 const calls=[],shown=[];const delay=()=>new Promise(r=>setTimeout(r,15));
 const editor=createDraftQuestions({pollMs:1,request:(action,payload)=>new Promise(resolve=>calls.push({action,payload,resolve})),show:(...args)=>shown.push(args)});
 editor.update('a',{title:'갈등',content:''});await delay();assert.equal(calls.length,0);
 editor.update('a',experience);await delay();assert.equal(calls.length,0);editor.generate('a');await delay();assert.equal(calls.length,1);
 const next={...experience,content:experience.content+' 친구와 결과를 검토했습니다.'};editor.update('a',next);editor.generate('a');await delay();
 calls[0].resolve({questions});await delay();assert(!shown.some(x=>x[1].length));
 calls[1].resolve({questions});await delay();assert.deepEqual(shown.at(-1)[1],questions);
 editor.update('a',next);assert.deepEqual(shown.at(-1)[1],questions);assert.equal(calls.length,2);
 editor.update('a',{title:'',content:''});assert.deepEqual(shown.at(-1),['a',[],'',false]);
 editor.update('b',experience);editor.destroy();await delay();assert.equal(calls.length,2);
});
