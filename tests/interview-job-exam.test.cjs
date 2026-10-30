'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID}=require('node:crypto');
const {createDb}=require('./helpers/interview-db.cjs');
const {createHandler}=require('../api/interview-job-exam');
const {detail,wav,provider}=require('./interview-exam.test.cjs');
const admin={type:'admin',id:'job-qa'},student={type:'student',id:'ip-a'},server={type:'server',id:'job-exam'};
async function fixture(t){
 const {db,invoke:prep}=await createDb();t.after(()=>db.close());
 for(const suffix of ['_interview_keyword_rules_reports.sql','_interview_student_job_exam.sql']){const file=fs.readdirSync('supabase/migrations').find(n=>n.endsWith(suffix));await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));}
 await db.exec("update ip_settings set enabled=true;insert into ip_members(student_id,track,exam_number,expires_on) values('ip-a','공채','qa-a','2099-01-01'),('ip-b','기관','qa-b','2099-01-01');");
 const d=detail();await db.query("insert into ip_questions(id,prompt,category,revision,status,tracks) values($1,$2,'job',2,'published',array['공채'])",[d.question.id,d.question.prompt]);
 await prep('admin_rubric_save',admin,{id:d.question.id,revision:0,questionRevision:2,kind:'job_knowledge',rationale:'학생 응시용 가상 검증 기준입니다.',criteria:d.rubric.criteria,criticalErrors:d.rubric.critical_errors,verificationNote:d.rubric.verification_note,scoreMap:d.rubric.score_map,status:'reviewed'});
 const invoke=async(action,actor,body={})=>(await db.query('select ip_job_exam_service($1,$2::jsonb,$3::jsonb) result',[action,JSON.stringify(actor),JSON.stringify(body)])).rows[0].result;
 const files=new Map();let paid=0,uploads=0,identity='ip-a',uploadFail=false;
 const deps={config:()=>({enabled:true,ready:true,storageReady:true}),authenticateWeb:async()=>({id:identity}),previewAllowed:()=>false,authenticateDevice:async()=>null,invoke,
 provider:()=>provider({transcribe:async()=>{paid++;return 'VHF를 사용하고 위치 정보를 교환합니다.';}}),
 storage:()=>({put:async(id,audio)=>{uploads++;if(uploadFail)throw Error('recording_unavailable');files.set(id,Buffer.from(audio));},signed:async id=>'https://example.invalid/private/'+id,remove:async id=>{files.delete(id);}}),cronSecret:'x'.repeat(32)};
 async function call(body,options={}){let status,data;await createHandler({...deps,...options.deps})({method:'POST',headers:{host:'localhost',...options.headers},body},{setHeader(){},status(s){status=s;return this;},json(d){data=d;}});return {status,data};}
 async function start(){const response=await call({action:'start',questionId:d.question.id,requestKey:randomUUID()});assert.equal(response.status,200,JSON.stringify(response.data));return response.data.run;}
 return {db,prep,invoke,deps,call,start,files,get paid(){return paid;},get uploads(){return uploads;},identity:value=>identity=value,uploadFail:value=>uploadFail=value,d};
}
test('student exam admission, frozen rubric, submission and private report lifecycle',async t=>{
 const f=await fixture(t);let run;
 await t.test('only published reviewed track questions are available; no answer keys are exposed',async()=>{
  try{await f.invoke('ready',student);}catch(e){throw Error('ready SQL: '+e.message);}
  const status=await f.call({action:'status'});assert.equal(status.data.ready,true,JSON.stringify(status));
  const q=await f.call({action:'questions'});assert.equal(q.data.questions.length,1);assert.equal(JSON.stringify(q.data).includes('terms'),false);
  f.identity('ip-b');assert.equal((await f.call({action:'questions'})).data.questions.length,0);
  f.identity('ip-c');assert.equal((await f.call({action:'status'})).data.ready,false);assert.equal((await f.call({action:'start',questionId:f.d.question.id,requestKey:randomUUID()})).status,403);f.identity('ip-a');
  run=await f.start();assert.equal(JSON.stringify(run).includes('criteria'),false);assert.equal(run.report,null);
 });
 await t.test('answer grading uses the snapshot frozen before the author changes the criteria',async()=>{
  await f.db.query("update ip_question_rubrics set criteria=$1::jsonb,revision=revision+1 where question_id=$2",[JSON.stringify([{label:'새 기준',terms:['새키워드'],context:'변경 후 기준',reject_context:'변경 전 답변'}]),f.d.question.id]);
  const submit=await f.call({action:'submit',id:run.id,audioBase64:wav().toString('base64')});assert.equal(submit.status,200,JSON.stringify(submit.data));assert.equal(submit.data.run.state,'completed');assert.equal(submit.data.run.report.suggestion.grade,'O');assert.equal(submit.data.run.report.grade,null);
  assert.equal(submit.data.run.report.keywordResults[0].keywords[0].term,'VHF');assert.equal(JSON.stringify(submit.data).includes('reviewer'),false);assert.equal(submit.data.run.report.rubric,undefined);assert.ok(f.files.has(run.id));
 });
 await t.test('repeated submission reads the same result without more AI or uploads',async()=>{
  const paid=f.paid,uploads=f.uploads;assert.equal((await f.call({action:'submit',id:run.id,audioBase64:wav().toString('base64')})).data.run.state,'completed');assert.equal(f.paid,paid);assert.equal(f.uploads,uploads);
  assert.equal((await f.call({action:'submit',id:run.id,audioBase64:wav(.2).toString('base64')})).status,409);assert.equal(f.paid,paid);
  const result=await f.call({action:'get',id:run.id},{deps:{config:()=>({enabled:false})}});assert.equal(result.data.run.state,'completed');assert.equal(f.paid,paid);
 });
 await t.test('ownership, request forgery and unprivileged SQL roles are denied',async()=>{
  f.identity('ip-b');assert.equal((await f.call({action:'get',id:run.id})).status,404);assert.equal((await f.call({action:'list'})).data.runs.length,0);
  f.identity('ip-a');assert.equal((await f.call({action:'submit',id:run.id,audioBase64:wav().toString('base64'),grade:'O'})).status,400);
  assert.equal((await f.call({action:'get',id:run.id},{headers:{origin:'https://evil.invalid'}})).status,403);
  await assert.rejects(f.invoke('internal_get',student,{id:run.id}),/forbidden/);
  assert.equal((await f.db.query("select relrowsecurity from pg_class where relname='ip_job_exam_attempts'")).rows[0].relrowsecurity,true);
  for(const fn of (await f.db.query("select prosecdef,proconfig from pg_proc where proname in ('ip_job_exam_service','ip_job_exam_public')")).rows){assert.equal(fn.prosecdef,false);assert.ok(fn.proconfig.some(s=>s.startsWith('search_path=')));}
  for(const role of ['anon','authenticated']){await f.db.exec('set role '+role);await assert.rejects(f.db.query('select * from ip_job_exam_attempts'),/permission denied/);await assert.rejects(f.invoke('list',student),/permission denied/);await f.db.exec('reset role');}
 });
 await t.test('retention blocks playback/report access and authenticated cleanup removes media first',async()=>{
  await f.db.query("update ip_job_exam_attempts set retain_until=now()-interval '1 day' where id=$1",[run.id]);
  assert.equal((await f.call({action:'get',id:run.id})).status,404);assert.equal((await f.call({action:'cleanup'})).status,401);
  const clean=await f.call({action:'cleanup'},{headers:{authorization:'Bearer '+'x'.repeat(32)}});assert.equal(clean.data.removed,1);assert.equal(f.files.has(run.id),false);assert.equal((await f.db.query('select count(*)::int n from ip_job_exam_attempts')).rows[0].n,0);
 });
});
test('storage failure can retry exact audio; concurrent claims never duplicate paid grading',async t=>{
 const f=await fixture(t),run=await f.start(),body={action:'submit',id:run.id,audioBase64:wav().toString('base64')};f.uploadFail(true);
 assert.equal((await f.call(body)).status,503);assert.equal(f.paid,0);assert.equal((await f.call({action:'get',id:run.id})).data.run.state,'upload_failed');
 f.uploadFail(false);const results=await Promise.all([f.call(body),f.call(body)]);assert.ok(results.every(r=>r.status===200));assert.equal(f.paid,2);assert.equal((await f.call({action:'get',id:run.id})).data.run.state,'completed');
});
test('invalid audio, disabled service, expiration and daily caps preserve existing modes',async t=>{
 const f=await fixture(t),run=await f.start();
 assert.equal((await f.call({action:'submit',id:run.id,audioBase64:Buffer.from('not wav'.repeat(15)).toString('base64')})).status,400);assert.equal(f.paid,0);
 assert.equal((await f.call({action:'status'},{deps:{config:()=>({enabled:false})}})).data.ready,false);
 await f.db.query("update ip_job_exam_attempts set deadline=now()-interval '1 second' where id=$1",[run.id]);assert.equal((await f.call({action:'submit',id:run.id,audioBase64:wav().toString('base64')})).status,409);
 for(let i=0;i<2;i++){const next=await f.start();await f.call({action:'cancel',id:next.id});}
 assert.equal((await f.call({action:'start',questionId:f.d.question.id,requestKey:randomUUID()})).status,429);
 assert.equal((await f.db.query('select count(*)::int n from ip_exam_reports')).rows[0].n,0); // admin reports unaffected
});
test('student pipeline enforces all keyword groups and accepts registered aliases',async t=>{
 const f=await fixture(t);
 const criteria=[{label:'통신과 보고',match:'all',keywords:[{term:'VHF',aliases:['브이에이치에프']},{term:'상황실',aliases:['상황센터']}],terms:['VHF','브이에이치에프','상황실','상황센터'],context:'VHF로 상황실에 보고함',reject_context:'통신 또는 보고 관계를 부정함'}];
 await f.db.query('update ip_question_rubrics set criteria=$1::jsonb where question_id=$2',[JSON.stringify(criteria),f.d.question.id]);
 function supplied(text){return ()=>provider({transcribe:async()=>text,judge:async()=>({criteria:[{index:0,status:'accepted',quote:text,reason:'모의 판단'}],errors:[{index:0,status:'absent',quote:'',reason:'오류 없음'}],uncertainties:[]})});}
 const missing=await f.start(),held=await f.call({action:'submit',id:missing.id,audioBase64:wav().toString('base64')},{deps:{provider:supplied('브이에이치에프를 사용합니다.')}});
 assert.equal(held.data.run.state,'completed');assert.equal(held.data.run.report.suggestion,null);assert.ok(held.data.run.report.reasons.includes('missing_literal_term'));assert.equal(held.data.run.report.keywordResults[0].keywords[1].missing,true);
 const complete=await f.start(),correct=await f.call({action:'submit',id:complete.id,audioBase64:wav().toString('base64')},{deps:{provider:supplied('브이에이치에프로 상황센터에 보고합니다.')}});
 assert.equal(correct.data.run.report.suggestion.grade,'O');assert.equal(correct.data.run.report.grade,null);
});
test('lost result persistence never automatically repeats paid analysis',async t=>{
 const f=await fixture(t),run=await f.start(),body={action:'submit',id:run.id,audioBase64:wav().toString('base64')};
 const result=await f.call(body,{deps:{invoke:async(action,actor,payload)=>{if(action==='complete')throw Error('database_unavailable');return f.invoke(action,actor,payload);}}});
 assert.equal(result.status,503);assert.equal(f.paid,2);assert.equal((await f.call({action:'get',id:run.id})).data.run.state,'unknown');
 assert.equal((await f.call(body)).data.run.state,'unknown');assert.equal(f.paid,2);
});
test('migration provisions a private audio bucket and refuses an existing public bucket',async()=>{
 const files=fs.readdirSync('supabase/migrations'),keyword=files.find(n=>n.endsWith('_interview_keyword_rules_reports.sql')),job=files.find(n=>n.endsWith('_interview_student_job_exam.sql'));
 for(const existingPublic of [false,true]){
  const {db}=await createDb();
  try{
   await db.exec(fs.readFileSync('supabase/migrations/'+keyword,'utf8'));
   await db.exec('create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);');
   if(existingPublic)await db.exec("insert into storage.buckets(id,name,public) values('interview-job-exam','interview-job-exam',true)");
   if(existingPublic){await assert.rejects(db.exec(fs.readFileSync('supabase/migrations/'+job,'utf8')),/unsafe_bucket_configuration/);await db.exec('rollback');}
   else{await db.exec(fs.readFileSync('supabase/migrations/'+job,'utf8'));const row=(await db.query("select * from storage.buckets where id='interview-job-exam'")).rows[0];assert.equal(row.public,false);assert.equal(Number(row.file_size_limit),3000000);}
  }finally{await db.close();}
 }
});
