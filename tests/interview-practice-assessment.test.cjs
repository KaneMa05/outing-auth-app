const test=require('node:test'),assert=require('node:assert/strict');
const {criteriaFor,validateAssessment}=require('../lib/interview-practice-assessment.cjs');
const examples=require('../native/ios/App/DebugResources/InterviewPracticeAudio/examples.json');
const catalog=require('../native/ios/App/DebugResources/InterviewPracticeAudio/catalog.json');
test('every bundled job question has reference criteria; unrelated prompts do not',()=>{
 const job=catalog.clips.filter(q=>q.category==='job');assert.equal(job.length,46);
 for(const q of job){const c=criteriaFor(q.spokenPrompt);assert.ok(c.length>=2&&c.length<=3,q.id);assert.equal(c.map(x=>x.claim).join(' ').replace(/\s+/g,' '),examples[q.id].replace(/\s+/g,' '));}
 assert.deepEqual(criteriaFor('invented question'),[]);
});
test('O and partial require literal speech evidence; invented/missing/duplicate rows are held',()=>{
 const c=[{index:0,label:'점검',claim:'원인을 점검한다.'}],t='원인을 점검하겠습니다.';
 for(const status of ['O','partial','X','uncertain'])assert.equal(validateAssessment([{index:0,status,quote:t,reason:'근거 확인'}],c,t)[0].status,status);
 for(const rows of [null,[],[{index:0,status:'O',quote:'',reason:'허위'}],[{index:0,status:'O',quote:'정지합니다',reason:'허위'}],[{index:0,status:'O',quote:t,reason:'a'},{index:0,status:'X',quote:'',reason:'b'}]])assert.equal(validateAssessment(rows,c,t)[0].status,'uncertain');
});
