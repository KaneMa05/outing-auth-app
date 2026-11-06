const {test}=require('node:test'),assert=require('node:assert/strict');
const {criteriaForAnswer,validateAssessment}=require('../lib/interview-practice-reference.cjs');
const {preparePracticeAudio}=require('../lib/interview-practice-audio.cjs');
const {wav}=require('./interview-exam.test.cjs');
test('practice criteria preserve the full supplied source and never fabricate missing reference facts',()=>{
 const source='상황을 확인합니다. 동료에게 보고합니다. 조치를 기록합니다. 다음 절차를 준비합니다.';
 const rows=criteriaForAnswer(source);assert.equal(rows.length,3);assert.equal(rows.map(x=>x.claim).join(' '),source);assert.deepEqual(criteriaForAnswer(''),[]);
});
test('missing duplicate invented and unquoted accepted evidence is held, and uncertainty never becomes X',()=>{
 const c=criteriaForAnswer('상황을 확인합니다.'),t='상황을 확인합니다.';
 assert.equal(validateAssessment([{index:0,status:'O',quote:t,reason:'핵심 충족'}],c,t)[0].status,'O');
 for(const rows of [[],[{index:0,status:'O',quote:'',reason:'없음'}],[{index:0,status:'O',quote:'꾸민 답변',reason:'없음'}],[{index:0,status:'O',quote:t,reason:'a'},{index:0,status:'X',quote:'',reason:'b'}]])assert.equal(validateAssessment(rows,c,t)[0].status,'uncertain');
 assert.equal(validateAssessment([{index:0,status:'X',quote:'',reason:'핵심 누락'}],c,t)[0].status,'X');
 assert.equal(validateAssessment([{index:0,status:'O',quote:t,reason:'충족'}],c,t,'인식 불확실')[0].status,'uncertain');
});
test('bounded speech normalization preserves original WAV and never amplifies silence or existing clipping',()=>{
 const original=wav(),copy=Buffer.from(original),prepared=preparePracticeAudio(original);
 assert.deepEqual(original,copy);assert.equal(prepared.audio.length,original.length);assert.ok(prepared.gain>=1&&prepared.gain<=4);
 const quiet=wav(.001);assert.equal(preparePracticeAudio(quiet).gain,1);
 const clipped=Buffer.from(original);for(let i=44;i<clipped.length;i+=2)clipped.writeInt16LE(32767,i);
 assert.equal(preparePracticeAudio(clipped).gain,1);
});

test('practice context reaches the recognizer without leaking the reference answer and uses the model language field',async()=>{
 const {createProvider}=require('../lib/interview-exam-provider');
 for(const model of ['gpt-transcribe','gpt-4o-transcribe']){
  const calls=[];const provider=createProvider({config:{enabled:true,ready:true,key:'fixture-only',models:{transcriber:model},transcriptionContext:'한국어 면접 녹음입니다. 발화를 그대로 기록합니다.'},fetchImpl:async(url,options)=>{
   calls.push(options.body);return {ok:true,text:async()=>JSON.stringify({text:'상황을 확인합니다.'})};
  }});
  assert.equal(await provider.transcribe(wav(),0),'상황을 확인합니다.');
  assert.ok(calls[0].get('prompt').includes('한국어 면접'));
  assert.equal(calls[0].get('language'),model==='gpt-transcribe'?null:'ko');
  assert.deepEqual(calls[0].getAll('languages[]'),model==='gpt-transcribe'?['ko']:[]);
  assert.equal(calls[0].get('keywords'),null);
 }
});
