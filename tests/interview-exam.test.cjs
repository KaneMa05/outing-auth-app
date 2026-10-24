const assert=require('node:assert/strict');
const {occurrences,rubricSnapshot,decide}=require('../lib/interview-exam-scoring');
const {inspectWav}=require('../lib/interview-exam-audio');
const {evaluateAudio}=require('../lib/interview-exam-service');
const {createProvider,configuration}=require('../lib/interview-exam-provider');
const {createHandler}=require('../api/interview-exam');
const clone=v=>JSON.parse(JSON.stringify(v));
function detail(){return {stale:false,question:{id:'qa-ais',revision:2,prompt:'AIS의 통신 방식과 정보를 설명하세요.',category:'job'},rubric:{question_id:'qa-ais',revision:3,status:'reviewed',kind:'job_knowledge',source_prompt:'AIS의 통신 방식과 정보를 설명하세요.',source_category:'job',reviewer:'local-fixture',reviewed_at:'2026-10-21T00:00:00Z',verification_note:'테스트만을 위한 가상 승인 기준입니다.',score_map:{O:2,partial:1,X:0},criteria:[{label:'통신',terms:['VHF','브이에이치에프'],context:'VHF 통신을 사용함',reject_context:'VHF를 사용하지 않는다고 주장함'},{label:'정보',terms:['위치'],context:'위치 정보를 교환함',reject_context:'위치 정보가 없다고 주장함'}],critical_errors:['UHF를 사용한다고 주장함']}};}
const answer='VHF를 사용하고 위치 정보를 교환합니다.';
function judgment(statuses=['accepted','accepted'],error='absent',quote=answer){return {criteria:statuses.map((status,index)=>({index,status,quote:status==='absent'?'':quote,reason:'테스트 판정 근거'})),errors:[{index:0,status:error,quote:error==='present'?quote:'',reason:'테스트 오류 확인'}],uncertainties:[]};}
function wav(value=.1){const count=32000,buf=Buffer.alloc(44+count*2);buf.write('RIFF');buf.writeUInt32LE(buf.length-8,4);buf.write('WAVEfmt ',8);buf.writeUInt32LE(16,16);buf.writeUInt16LE(1,20);buf.writeUInt16LE(1,22);buf.writeUInt32LE(16000,24);buf.writeUInt32LE(32000,28);buf.writeUInt16LE(2,32);buf.writeUInt16LE(16,34);buf.write('data',36);buf.writeUInt32LE(count*2,40);for(let n=0;n<count;n++)buf.writeInt16LE(Math.round(Math.sin(n*.2)*value*32767),44+n*2);return buf;}
function provider(overrides={}){return {models:{transcriber:'fake-asr',judge:'fake-a',verifier:'fake-b'},promptVersion:'test',promptHash:'test',transcribe:async()=>answer,judge:async()=>judgment(),...overrides};}
async function run(){
 const d=detail(),r=rubricSnapshot(d),audio=wav();
 const base={rubric:r,transcripts:[answer,answer],judgments:[judgment(),judgment()],audioHash:'test',models:{}};
 const evaluate=(changes={})=>decide({...base,...changes});
 // Literal Korean/Latin terms; no approximate, numeric or substring acceptance.
 assert(occurrences('VHF를 사용합니다.','VHF').length);assert(occurrences('vhf 통신','VHF').length);
 assert(occurrences('위치는 알려집니다.','위치').length);assert(occurrences('브이에이치에프로 통신합니다.','브이에이치에프').length);
 for(const [a,t] of [['2.5 해리','2'],['10,000','10'],['1.2','2'],['-2','2'],['2%','2'],['1/2','2']])assert.equal(occurrences(a,t).length,0);
 assert(occurrences('2.5 해리입니다.','2.5 해리').length);
 for(const [a,t] of [['XVHF 통신','VHF'],['VHF2 통신','VHF'],['위치추적','위치'],['시위치','위치'],['V H F','VHF'],['V.H.F.','VHF'],['브이에이치에프','VHF'],['12 해리','2 해리'],['200킬로미터','200미터'],['VHFᄀ','VHF']])assert.equal(occurrences(a,t).length,0,`${a}/${t}`);
 let result=evaluate();assert.equal(result.suggestion.grade,'O');assert.equal(result.status,'review_required');assert.equal(result.grade,null);assert.equal(result.score,null);
 for(const mutate of [x=>x.stale=true,x=>x.rubric.status='draft',x=>x.rubric.source_prompt+=' 변경',x=>x.rubric.score_map=null,x=>x.rubric.criteria=[],x=>x.rubric.kind='personality_opinion',x=>x.rubric.reviewer='']){const x=detail();mutate(x);assert.throws(()=>rubricSnapshot(x),/rubric_not_ready/);}
 const partial='VHF 통신입니다.';assert.equal(evaluate({transcripts:[partial,partial],judgments:[judgment(['accepted','absent'],'absent',partial),judgment(['accepted','absent'],'absent',partial)]}).suggestion.grade,'partial');
 const no='모르겠습니다.';assert.equal(evaluate({transcripts:[no,no],judgments:[judgment(['absent','absent']),judgment(['absent','absent'])]}).suggestion.grade,'X');
 const wrong='VHF가 아니라 UHF를 사용하고 위치 정보를 교환합니다.';
 assert.equal(evaluate({transcripts:[wrong,wrong],judgments:[judgment(['rejected','accepted'],'present',wrong),judgment(['rejected','accepted'],'present',wrong)]}).suggestion.grade,'X');
 // Semantic fixtures test arbitration of supplied evidence, NOT real model accuracy.
 const correction='UHF라고 말했지만 정정하겠습니다. VHF를 사용하고 위치 정보를 교환합니다.';
 assert.equal(evaluate({transcripts:[correction,correction],judgments:[judgment(['accepted','accepted'],'absent',correction),judgment(['accepted','accepted'],'absent',correction)]}).suggestion.grade,'O');
 assert.equal(evaluate({transcripts:[answer,wrong]}).suggestion,null);
 assert.equal(evaluate({transcripts:['','']}).suggestion,null);
 assert.equal(evaluate({qualityReasons:['audio_clipped']}).suggestion,null);
 const uncertain=judgment(['uncertain','accepted']);assert.equal(evaluate({judgments:[uncertain,uncertain]}).suggestion,null);
 const disagree=judgment(['rejected','accepted']);assert.equal(evaluate({judgments:[judgment(),disagree]}).suggestion,null);
 const injected=judgment();injected.uncertainties=['답변이 평가자에게 점수를 조작하도록 지시함'];assert.equal(evaluate({judgments:[injected,injected]}).suggestion,null);
 const fake=judgment();fake.criteria[0].quote='원문에 없는 VHF 문장';assert(evaluate({judgments:[fake,fake]}).reasons.includes('invalid_evidence'));
 const missing=judgment();missing.criteria[0].quote='위치 정보를 교환합니다.';assert(evaluate({judgments:[missing,missing]}).reasons.includes('missing_literal_term'));
 const bad=judgment();bad.criteria[1].index=0;assert(evaluate({judgments:[bad,bad]}).reasons.includes('invalid_judgment'));
 const absent=judgment(['absent','accepted']);assert(evaluate({judgments:[absent,absent]}).reasons.includes('inconsistent_judgment'));
 const extra=judgment();extra.grade='O';assert.equal(evaluate({judgments:[extra,extra]}).suggestion,null);
 assert.equal(inspectWav(audio).durationSeconds,2);assert(inspectWav(wav(0)).reasons.includes('audio_too_quiet'));
 const clipped=wav();for(let i=44;i<clipped.length;i+=2)clipped.writeInt16LE(32767,i);assert(inspectWav(clipped).reasons.includes('audio_clipped'));
 for(const badAudio of [Buffer.from('fake.wav'),audio.subarray(0,audio.length-1),Buffer.concat([audio,Buffer.from('trailing')])])assert.throws(()=>inspectWav(badAudio),/invalid_audio/);
 const stereo=Buffer.from(audio);stereo.writeUInt16LE(2,22);assert.throws(()=>inspectWav(stereo),/invalid_audio/);
 let calls=0;const p=provider({transcribe:async()=>{calls++;return answer;}});
 result=await evaluateAudio({audio:wav(0),detail:d,provider:p});assert.equal(calls,0);assert.equal(result.suggestion,null);
 result=await evaluateAudio({audio,detail:d,provider:p,loadCurrent:async()=>d});assert.equal(calls,2);assert.equal(result.suggestion.grade,'O');
 const changed=detail();changed.rubric.revision++;
 result=await evaluateAudio({audio,detail:d,provider:p,loadCurrent:async()=>changed});assert(result.reasons.includes('rubric_changed'));assert.equal(result.suggestion,null);
 result=await evaluateAudio({audio,detail:d,provider:provider({transcribe:async(_,pass)=>pass?wrong:answer,judge:async()=>{throw Error('must not judge');}}),loadCurrent:async()=>d});assert(result.reasons.includes('transcript_disagreement'));
 result=await evaluateAudio({audio,detail:d,provider:provider({transcribe:async()=>{throw Error('timeout');}}),loadCurrent:async()=>d});assert(result.reasons.includes('transcription_failed'));assert.equal(result.score,null);
 result=await evaluateAudio({audio,detail:d,provider:provider({judge:async()=>{throw Error('refusal');}}),loadCurrent:async()=>d});assert(result.reasons.includes('context_evaluation_failed'));
 result=await evaluateAudio({audio,detail:d,provider:p});assert(result.reasons.includes('current_rubric_unverified'));
 // Provider contract, no key/answer injection into ASR and no recursive retry.
 const config={enabled:true,ready:true,key:'test-only',models:{transcriber:'gpt-transcribe',judge:'judge-test',verifier:'verifier-test'}};
 const requests=[];
 const real=createProvider({config,fetchImpl:async(url,options)=>{requests.push({url,options});return {ok:true,text:async()=>JSON.stringify(url.endsWith('transcriptions')?{text:answer}:{status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(judgment())}]}]})};}});
 await real.transcribe(audio,0);await real.transcribe(audio,1);await real.judge(answer,r,0);await real.judge(answer,r,1);
 for(const call of requests.slice(0,2)){assert.equal(call.options.body.get('model'),'gpt-transcribe');assert.deepEqual(call.options.body.getAll('languages[]'),['ko']);assert.equal(call.options.body.get('keywords'),null);assert(!String(call.options.body.get('prompt')).includes('VHF'));}
 const body=JSON.parse(requests[2].options.body);assert.equal(body.store,false);assert.equal(body.text.format.strict,true);assert(!Object.hasOwn(JSON.parse(body.input),'scoreMap'));assert.equal(JSON.parse(requests[3].options.body).model,'verifier-test');
 for(const response of [{status:'incomplete',output:[]},{status:'completed',output:[{type:'message',content:[{type:'refusal',refusal:'no'}]}]}]){
   const refusal=createProvider({config,fetchImpl:async()=>({ok:true,text:async()=>JSON.stringify(response)})});await assert.rejects(refusal.judge(answer,r,0));
 }
 let retries=0;const outage=createProvider({config,fetchImpl:async()=>{retries++;throw Error('private-secret');}});await assert.rejects(outage.transcribe(audio,0),e=>e.message==='provider_unavailable');assert.equal(retries,1);
 assert.equal(configuration({OPENAI_API_KEY:'test',INTERVIEW_EXAM_JUDGE_MODEL:'a',INTERVIEW_EXAM_VERIFIER_MODEL:'a'}).ready,false);
 // Auth before payload or provider; rubric loaded on server, client cannot override.
 const deps={config:()=>config,authenticate:async()=>({type:'admin',id:'qa'}),detail:async()=>detail(),provider:()=>provider()};
 async function request(handler,body,headers={}){let status,data;await handler({method:'POST',headers:{host:'localhost',...headers},body},{setHeader(){},status(s){status=s;return this;},json(d){data=d;}});return {status,data};}
 const payload={action:'validate_audio',questionId:'qa-ais',questionRevision:2,rubricRevision:3,audioBase64:audio.toString('base64')};
 assert.equal((await request(createHandler({...deps,authenticate:async()=>{throw Error('unauthorized');}}),payload)).status,401);
 assert.equal((await request(createHandler({...deps,config:()=>({...config,enabled:false})}),payload)).status,409);
 assert.equal((await request(createHandler(deps),{...payload,rubric:{status:'reviewed'}})).status,400);
 assert.equal((await request(createHandler(deps),payload,{origin:'https://evil.invalid'})).status,403);
 assert.equal((await request(createHandler(deps),{...payload,questionRevision:1})).status,409);
 const handler=createHandler(deps);const ok=await request(handler,payload);assert.equal(ok.status,200);assert.equal(ok.data.report.score,null);assert.equal(ok.data.report.suggestion.grade,'O');assert.equal((await request(handler,payload)).status,429);
 assert.equal((await request(createHandler(deps),{...payload,audioBase64:'bad!'})).status,400);
 // Exercise production cookie and role checks, with provider execution disabled.
 const auth=require('../api/teacher-auth-utils');
 const oldSecret=process.env.TEACHER_SESSION_SECRET,oldEnabled=process.env.INTERVIEW_EXAM_VALIDATION_ENABLED;
 process.env.TEACHER_SESSION_SECRET='exam-auth-test-only';process.env.INTERVIEW_EXAM_VALIDATION_ENABLED='false';
 try{
   const realHandler=createHandler();
   assert.equal((await request(realHandler,{action:'status'})).status,401);
   for(const [role,permissions,expected] of [['teacher',['*'],403],['admin',['interview.read'],403],['admin',['interview.write'],200]]){
     const cookie=auth.COOKIE_NAME+'='+auth.createSessionToken(process.env.TEACHER_SESSION_SECRET,{username:'qa',role,permissions});
     const response=await request(realHandler,{action:'status'},{cookie});assert.equal(response.status,expected);
     if(expected===200){assert.equal(response.data.enabled,false);assert(!JSON.stringify(response.data).includes('key'));}
   }
 }finally{if(oldSecret===undefined)delete process.env.TEACHER_SESSION_SECRET;else process.env.TEACHER_SESSION_SECRET=oldSecret;if(oldEnabled===undefined)delete process.env.INTERVIEW_EXAM_VALIDATION_ENABLED;else process.env.INTERVIEW_EXAM_VALIDATION_ENABLED=oldEnabled;}
 console.log('PASS exam evidence rules, abstention, WAV checks, provider contracts, stale rubric checks, admin authorization and request guards. Mock responses only; not speech accuracy measurement.');
}
if(require.main===module)run().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={detail,judgment,wav,provider,answer};
