const {test}=require('node:test'),assert=require('node:assert/strict');
const {analyzeTask}=require('../lib/interview-mock-analysis.cjs');
function audio(){
 const b=Buffer.alloc(44+32000);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(16000,24);b.writeUInt32LE(32000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(32000,40);
 for(let i=0;i<16000;i++)b.writeInt16LE(Math.round(Math.sin(i/16000*Math.PI*880)*4000),44+i*2);return b;
}
test('practice starts both independent transcriptions together and waits for both before analysis',async()=>{
 const started=[],resolve=[],spoken='행동과 결과를 설명했습니다.';
 const pending=analyzeTask({kind:'practice',question:{id:'q',prompt:'어떻게 행동했나요?',revision:1},audio:audio()},
  {parallelTranscription:true,models:{analyzer:'fixture'},transcribe:(_,{pass})=>{started.push(pass);return new Promise(done=>resolve[pass]=done);},
   infer:async()=>({summary:'행동을 설명했습니다.',strengths:[{turnId:'1',quote:spoken,feedback:'행동이 구체적입니다.'}],improvements:[],nextPractice:[]})});
 assert.deepEqual(started,[0,1]);resolve[0](spoken);resolve[1](spoken);
 const result=await pending;assert.equal(result.status,'practice_feedback');assert.deepEqual(result.transcripts,[spoken,spoken]);
});
test('parallel recognition still holds conflicting words and never invents a grade',async()=>{
 let inference=0;
 const result=await analyzeTask({kind:'practice',question:{id:'q',prompt:'조치는?',revision:1},audio:audio()},
  {parallelTranscription:true,models:{analyzer:'fixture'},transcribe:async(_,{pass})=>pass?'정지하지 않습니다.':'정지합니다.',infer:async()=>{inference++;throw Error('must not infer');}});
 assert.equal(inference,0);assert.equal(result.status,'review_required');assert.deepEqual(result.reasons,['transcript_disagreement']);assert.equal(result.grade,null);
});
