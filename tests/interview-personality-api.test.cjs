'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID}=require('node:crypto');
const {createDb}=require('./helpers/interview-db.cjs');
const {createHandler}=require('../api/interview-personality');
const {question,provider,transcript,analysis}=require('./helpers/interview-personality-fixture.cjs');
const {wav}=require('./interview-exam.test.cjs');
async function fixture(t){
 const {db,invoke:prep}=await createDb();t.after(()=>db.close());
 for(const suffix of ['_interview_keyword_rules_reports.sql','_interview_student_job_exam.sql','_interview_student_personality.sql']){const file=fs.readdirSync('supabase/migrations').find(n=>n.endsWith(suffix));await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));}
 await db.exec("update ip_settings set enabled=true;insert into ip_members(student_id,track,exam_number,expires_on) values('ip-a','공채','qa-a','2099-01-01'),('ip-b','기관','qa-b','2099-01-01');");
 await db.query("insert into ip_questions(id,prompt,category,revision,status,tracks) values($1,$2,'personality',2,'published',array['공채'])",[question.id,question.prompt]);
 await prep('admin_rubric_save',{type:'admin',id:'qa'},{id:question.id,revision:0,questionRevision:2,kind:'personality_experience',rationale:'인성 답변 구조 연습을 위한 가상 문항입니다.',criteria:[],criticalErrors:[],verificationNote:'로컬 검증용이며 실제 출제 승인과 무관합니다.',scoreMap:null,status:'reviewed'});
 const invoke=async(action,actor,body={})=>(await db.query('select ip_personality_service($1,$2::jsonb,$3::jsonb) result',[action,JSON.stringify(actor),JSON.stringify(body)])).rows[0].result;
 const files=new Map();let identity='ip-a',analyses=0,transcriptions=0,uploadFail=false;
 const deps={requireMockAccess:async()=>{},config:()=>({enabled:true,ready:true,storageReady:true}),authenticateWeb:async()=>({id:identity}),previewAllowed:()=>false,authenticateDevice:async()=>null,invoke,
 provider:()=>provider({transcribe:async()=>{transcriptions++;return transcript;},analyze:async()=>{analyses++;return analysis();}}),
 storage:()=>({put:async(id,audio)=>{if(uploadFail)throw Error('recording_unavailable');files.set(id,Buffer.from(audio));},signed:async id=>'https://example.invalid/personality/'+id,remove:async id=>{files.delete(id);}}),cronSecret:'p'.repeat(32)};
 async function call(body,options={}){let status,data;await createHandler({...deps,...options.deps})({method:'POST',headers:{host:'localhost',...options.headers},body},{setHeader(){},status(s){status=s;return this;},json(d){data=d;}});return {status,data};}
 async function start(){const r=await call({action:'start',questionId:question.id,requestKey:randomUUID()});assert.equal(r.status,200,JSON.stringify(r.data));return r.data.run;}
 return {db,prep,invoke,call,start,files,deps,identity:id=>identity=id,uploadFail:value=>uploadFail=value,get analyses(){return analyses;},get transcriptions(){return transcriptions;}};
}
test('student personality practice: admission, frozen question, structure report and owner reads',async t=>{
 const f=await fixture(t);let run;
 await t.test('approved personal experience questions are served without reviewer notes or model fields',async()=>{
  const status=await f.call({action:'status'});assert.equal(status.data.ready,true,JSON.stringify(status));assert.equal((await f.call({action:'questions'})).data.questions.length,1);
  f.identity('ip-b');assert.equal((await f.call({action:'questions'})).data.questions.length,0);
  f.identity('ip-c');assert.equal((await f.call({action:'status'})).data.ready,false);f.identity('ip-a');
  run=await f.start();assert.equal(run.report,null);assert.equal(JSON.stringify(run).includes('analysis_version'),false);
 });
 await t.test('a later question edit does not change the original analysis or create grades',async()=>{
  await f.db.query("update ip_questions set prompt=prompt||' 변경 문구',revision=revision+1 where id=$1",[question.id]);
  const response=await f.call({action:'submit',id:run.id,audioBase64:wav().toString('base64')});assert.equal(response.status,200,JSON.stringify(response.data));const saved=response.data.run;
  assert.equal(saved.state,'completed');assert.equal(saved.question.prompt,question.prompt);assert.equal(saved.report.analysis.components.length,4);assert.equal(saved.report.analysis.order.status,'expected');assert.equal(saved.report.grade,null);assert.equal(saved.report.score,null);assert.equal(saved.report.audit,undefined);assert.equal(JSON.stringify(saved).includes('verification_note'),false);assert.ok(f.files.has(run.id));
 });
 await t.test('report rereads and repeated submissions do not repeat model calls',async()=>{
  assert.equal(f.analyses,1);assert.equal(f.transcriptions,2);
  const loaded=await f.call({action:'get',id:run.id},{deps:{config:()=>({enabled:false})}});assert.equal(loaded.data.run.report.analysis.components[0].id,'conclusion');
  assert.equal((await f.call({action:'submit',id:run.id,audioBase64:wav().toString('base64')})).data.run.state,'completed');assert.equal(f.analyses,1);
  assert.equal((await f.call({action:'submit',id:run.id,audioBase64:wav(.2).toString('base64')})).status,409);assert.equal(f.analyses,1);
 });
 await t.test('cross-student access, forged analysis and browser SQL roles are denied',async()=>{
  f.identity('ip-b');assert.equal((await f.call({action:'get',id:run.id})).status,404);assert.equal((await f.call({action:'list'})).data.runs.length,0);f.identity('ip-a');
  assert.equal((await f.call({action:'submit',id:run.id,audioBase64:wav().toString('base64'),analysis:{score:100}})).status,400);
  assert.equal((await f.call({action:'get',id:run.id},{headers:{origin:'https://evil.invalid'}})).status,403);
  await assert.rejects(f.invoke('internal_get',{type:'student',id:'ip-a'},{id:run.id}),/forbidden/);
  for(const role of ['anon','authenticated']){await f.db.exec('set role '+role);await assert.rejects(f.db.query('select * from ip_personality_attempts'),/permission denied/);await assert.rejects(f.invoke('list',{type:'student',id:'ip-a'}),/permission denied/);await f.db.exec('reset role');}
  const rls=(await f.db.query("select relrowsecurity from pg_class where relname='ip_personality_attempts'")).rows[0];assert.equal(rls.relrowsecurity,true);
  for(const row of (await f.db.query("select prosecdef,proconfig from pg_proc where proname in ('ip_personality_public','ip_personality_service')")).rows){assert.equal(row.prosecdef,false);assert.ok(row.proconfig.some(c=>c.startsWith('search_path=')));}
  assert.equal((await f.db.query('select count(*)::int n from ip_job_exam_attempts')).rows[0].n,0);assert.equal((await f.db.query('select count(*)::int n from ip_exam_reports')).rows[0].n,0);
 });
 await t.test('expired practice data is inaccessible and media is removed before metadata',async()=>{
  await f.db.query("update ip_personality_attempts set retain_until=now()-interval '1 day' where id=$1",[run.id]);assert.equal((await f.call({action:'get',id:run.id})).status,404);assert.equal((await f.call({action:'cleanup'})).status,401);
  const cleaned=await f.call({action:'cleanup'},{headers:{authorization:'Bearer '+'p'.repeat(32)}});assert.equal(cleaned.data.removed,1);assert.equal(f.files.has(run.id),false);
 });
});
test('audio storage retry and concurrent submissions perform exactly one structure analysis',async t=>{
 const f=await fixture(t),run=await f.start(),body={action:'submit',id:run.id,audioBase64:wav().toString('base64')};f.uploadFail(true);assert.equal((await f.call(body)).status,503);assert.equal(f.analyses,0);assert.equal(f.transcriptions,0);
 f.uploadFail(false);await Promise.all([f.call(body),f.call(body)]);assert.equal(f.analyses,1);assert.equal(f.transcriptions,2);assert.equal((await f.call({action:'get',id:run.id})).data.run.state,'completed');
});
test('unverifiable evidence is saved as a held report, never as valid structure feedback',async t=>{
 const f=await fixture(t),run=await f.start();
 const r=await f.call({action:'submit',id:run.id,audioBase64:wav().toString('base64')},{deps:{provider:()=>provider({analyze:async()=>{const a=analysis();a.components.experience.quote='실제로 말하지 않은 경험';return a;}})}});
 assert.equal(r.status,200);assert.equal(r.data.run.report.status,'review_required');assert.equal(r.data.run.report.analysis,null);assert.ok(r.data.run.report.reasons.includes('invalid_evidence'));
});
test('lost result persistence never triggers automatic re-analysis',async t=>{
 const f=await fixture(t),run=await f.start(),body={action:'submit',id:run.id,audioBase64:wav().toString('base64')};
 assert.equal((await f.call(body,{deps:{invoke:async(action,actor,b)=>{if(action==='complete')throw Error('lost_database_response');return f.invoke(action,actor,b);}}})).status,503);
 assert.equal((await f.call(body)).data.run.state,'unknown');assert.equal(f.analyses,1);
});
test('expiry, daily caps and malformed audio are enforced before model calls',async t=>{
 const f=await fixture(t),run=await f.start();assert.equal((await f.call({action:'submit',id:run.id,audioBase64:Buffer.from('not audio'.repeat(20)).toString('base64')})).status,400);assert.equal(f.analyses,0);
 await f.db.query("update ip_personality_attempts set deadline=now()-interval '1 second' where id=$1",[run.id]);assert.equal((await f.call({action:'submit',id:run.id,audioBase64:wav().toString('base64')})).status,409);
 for(let i=0;i<2;i++){const r=await f.start();await f.call({action:'cancel',id:r.id});}assert.equal((await f.call({action:'start',questionId:question.id,requestKey:randomUUID()})).status,429);
});
