'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID}=require('node:crypto');
const {createDb}=require('./helpers/interview-db.cjs');
const {conceptDetail,conceptJudgment,correct}=require('./helpers/interview-concept-fixture.cjs');
const {wav,provider}=require('./interview-exam.test.cjs');
const {createHandler:createExam}=require('../api/interview-exam');
const {createHandler:createJob}=require('../api/interview-job-exam');
const {createReportRepository}=require('../lib/interview-exam-reports.cjs');
const {createProvider}=require('../lib/interview-exam-provider');
const {rubricSnapshot}=require('../lib/interview-exam-scoring');
const {validate}=require('../api/interview-prep')._private;
async function call(handler,body){let status,data;await handler({method:'POST',headers:{host:'localhost'},body},{setHeader(){},status(s){status=s;return this;},json(d){data=d;}});return {status,data};}
test('concept criteria and reports round-trip through actual local DB and admin/student APIs',async t=>{
 const {db,invoke:prep}=await createDb();t.after(()=>db.close());
 for(const suffix of ['_interview_keyword_rules_reports.sql','_interview_student_job_exam.sql','_interview_concept_assessment.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+fs.readdirSync('supabase/migrations').find(n=>n.endsWith(suffix)),'utf8'));
 const d=conceptDetail(),admin={type:'admin',id:'concept-qa'},student={type:'student',id:'ip-a'};
 await db.exec("update ip_settings set enabled=true;insert into ip_members(student_id,track,exam_number,expires_on) values('ip-a','공채','fixture','2099-01-01');");
 await db.query("insert into ip_questions(id,prompt,category,revision,status) values($1,$2,'job',2,'published')",[d.question.id,d.question.prompt]);
 const body={action:'admin_rubric_save',id:d.question.id,revision:0,questionRevision:2,kind:'job_knowledge',rationale:'개념 판정 로컬 검증을 위한 가상 기준입니다.',criteria:d.rubric.criteria,criticalErrors:d.rubric.critical_errors,verificationNote:d.rubric.verification_note,scoreMap:d.rubric.score_map,status:'reviewed'};
 validate(body);await prep(body.action,admin,body);
 await t.test('reviewed concepts, relations, partial boundaries and examples persist exactly',async()=>{
  const saved=await prep('admin_rubric_detail',admin,{id:d.question.id});assert.deepEqual(saved.rubric.criteria,d.rubric.criteria);assert.equal(rubricSnapshot(saved).criteria[0].assessment.match,'all');
 });
 await t.test('both JS API validation and direct SQL reject malformed new criteria',async()=>{
  for(const mutate of [a=>a.mode='term',a=>a.concepts[0].claim='',a=>a.concepts[0].partial=null,a=>a.concepts[0].reject='',a=>a.rejectedExamples=[''],a=>a.acceptedExamples=Array(6).fill('예시'),a=>a.concepts.push({...a.concepts[0]}),a=>a.extra=true]){
   const b=structuredClone(body);b.revision=1;mutate(b.criteria[0].assessment);assert.throws(()=>validate(b));await assert.rejects(prep(body.action,admin,b),/invalid_request/);
  }
  const b=structuredClone(body);b.kind='personality_experience';b.revision=1;assert.throws(()=>validate(b));await assert.rejects(prep(body.action,admin,b),/invalid_request/);
  const c=structuredClone(body);c.revision=1;c.criteria=Array.from({length:7},()=>structuredClone(body.criteria[0]));for(const x of c.criteria)x.assessment.concepts=Array.from({length:5},(_,i)=>({...x.assessment.concepts[0],claim:'개념 '+i}));assert.throws(()=>validate(c));await assert.rejects(prep(body.action,admin,c),/invalid_request/);
 });
 const invoke=async(service,action,actor,b={})=>(await db.query('select '+service+'($1,$2::jsonb,$3::jsonb) result',[action,JSON.stringify(actor),JSON.stringify(b)])).rows[0].result;
 const reports=createReportRepository({invoke:(a,actor,b)=>invoke('ip_exam_report_service',a,actor,b)});let transcribes=0;
 const p=()=>provider({transcribe:async()=>{transcribes++;return correct;},judge:async()=>conceptJudgment()});
 const deps={config:()=>({enabled:true,ready:true}),authenticate:async()=>admin,reports,detail:()=>prep('admin_rubric_detail',admin,{id:d.question.id}),provider:p};
 let stored;
 await t.test('admin validation persists evidence and a reread never invokes inference',async()=>{
  const response=await call(createExam(deps),{action:'validate_audio',questionId:d.question.id,questionRevision:2,rubricRevision:1,audioBase64:wav().toString('base64'),requestKey:randomUUID()});assert.equal(response.status,200,JSON.stringify(response.data));stored=response.data.record;
  assert.equal(stored.report.suggestion.grade,'O');assert.equal(stored.report.conceptResults[0].concepts[0].evidence.length,2);assert.equal(stored.report.keywordResults[0].literalSatisfied,false);
  const count=transcribes,read=await call(createExam({...deps,provider:()=>{throw Error('No AI on reads');}}),{action:'report_get',id:stored.id});assert.deepEqual(read.data.record.report,stored.report);assert.equal(transcribes,count);
 });
 await t.test('student starts freeze the new rule; later author edits do not alter its report',async()=>{
  const jobDeps={config:()=>({enabled:true,ready:true,storageReady:true}),authenticateWeb:async()=>student,previewAllowed:()=>false,invoke:(a,actor,b)=>invoke('ip_job_exam_service',a,actor,b),provider:p,storage:()=>({put:async()=>{},signed:async()=>'/fixture.wav'})};
  const started=await call(createJob(jobDeps),{action:'start',questionId:d.question.id,requestKey:randomUUID()});assert.equal(started.status,200,JSON.stringify(started.data));assert(!JSON.stringify(started.data).includes('concepts'));
  const edited=structuredClone(body);edited.revision=1;edited.criteria[0].assessment.concepts[0].claim='변경된 미래 기준';await prep('admin_rubric_save',admin,edited);
  const submitted=await call(createJob(jobDeps),{action:'submit',id:started.data.run.id,audioBase64:wav().toString('base64')});assert.equal(submitted.status,200,JSON.stringify(submitted.data));const r=submitted.data.run.report;assert.equal(r.suggestion.grade,'O');assert.equal(r.conceptResults[0].concepts[0].claim,body.criteria[0].assessment.concepts[0].claim);assert.equal(r.grade,null);assert.equal(r.rubric,undefined);
  const count=transcribes;const repeated=await call(createJob(jobDeps),{action:'submit',id:started.data.run.id,audioBase64:wav().toString('base64')});assert.deepEqual(repeated.data.run.report,r);assert.equal(transcribes,count);
  assert.deepEqual((await reports.get(admin,stored.id)).record.report,stored.report);
  await assert.rejects(invoke('ip_job_exam_service','get',{type:'student',id:'ip-b'},{id:started.data.run.id}),/not_found/);
 });
 await t.test('new database function is invoker-only with browser grants denied',async()=>{
  const fn=(await db.query("select prosecdef,proconfig from pg_proc where proname='ip_validate_concept_rules'")).rows[0];assert.equal(fn.prosecdef,false);assert(fn.proconfig.some(v=>v.startsWith('search_path=')));
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(db.query('select * from ip_question_rubrics'),/permission denied/);await db.exec('reset role');}
 });
});
test('provider sends reviewed concept statements and strict indexed evidence schema to independent judges',async()=>{
 const calls=[],r=rubricSnapshot(conceptDetail()),p=createProvider({config:{enabled:true,ready:true,key:'test-key',models:{judge:'fixture-a',verifier:'fixture-b',transcriber:'fixture-asr'}},fetchImpl:async(_url,options)=>{calls.push(JSON.parse(options.body));return {ok:true,text:async()=>JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(conceptJudgment())}]}]})};}});
 await p.judge(correct,r,0);await p.judge(correct,r,1);
 assert.equal(calls[0].model,'fixture-a');assert.equal(calls[1].model,'fixture-b');const input=JSON.parse(calls[0].input);assert.equal(input.conceptItems[0].claim,r.criteria[0].assessment.concepts[0].claim);assert(!('previousJudgment' in input));
 assert(calls[0].text.format.schema.required.includes('concepts'));assert(calls[0].text.format.schema.properties.concepts.items.properties.status.enum.includes('partial'));assert(calls[0].instructions.includes('keyword list is observational'));assert.equal(calls[0].store,false);
});
