'use strict';
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),{randomBytes}=require('node:crypto');
const {createDb}=require('../tests/helpers/interview-db.cjs');
const {createReportRepository}=require('../lib/interview-exam-reports.cjs');
const {createHandler:createExam}=require('../api/interview-exam');
const {createHandler:createPrep}=require('../api/interview-prep');
const auth=require('../api/teacher-auth-utils');
const {wav,provider}=require('../tests/interview-exam.test.cjs');
const {conceptDetail,conceptJudgment,correct,wrong,partial}=require('../tests/helpers/interview-concept-fixture.cjs');
const {conceptItems,conceptRule}=require('../lib/interview-concept-rules.cjs');
const {createHandler:createJob}=require('../api/interview-job-exam');
const os=require('node:os');
const {keywordCoverage}=require('../lib/interview-keyword-rules.cjs');
const {occurrences}=require('../lib/interview-exam-scoring');
(async()=>{
 const {db,invoke}=await createDb(),admin={type:'admin',id:'keyword-report-qa'},fixture=conceptDetail();
 for(const suffix of ['_interview_keyword_rules_reports.sql','_interview_student_job_exam.sql','_interview_concept_assessment.sql']){const migration=(await fs.readdir('supabase/migrations')).find(n=>n.endsWith(suffix));await db.exec(await fs.readFile('supabase/migrations/'+migration,'utf8'));}
 await db.exec("update ip_settings set enabled=true;insert into ip_members(student_id,track,exam_number,expires_on) values('ip-a','공채','fixture','2099-01-01');");
 await db.query("insert into ip_questions(id,prompt,category,revision,status) values($1,$2,$3,$4,'published')",[fixture.question.id,fixture.question.prompt,'job',fixture.question.revision]);
 await invoke('admin_rubric_save',admin,{id:fixture.question.id,revision:0,questionRevision:2,kind:'job_knowledge',rationale:'브라우저 검증용 가상 전공 기준입니다.',criteria:fixture.rubric.criteria,criticalErrors:fixture.rubric.critical_errors,verificationNote:fixture.rubric.verification_note,scoreMap:{O:2,partial:1,X:0},status:'reviewed'});
 process.env.TEACHER_SESSION_SECRET=randomBytes(32).toString('hex');
 const cookie=auth.createSessionToken(process.env.TEACHER_SESSION_SECRET,{username:admin.id,role:'admin',permissions:['interview.read','interview.write']});
 const reports=createReportRepository({invoke:async(action,actor,body)=>(await db.query('select ip_exam_report_service($1,$2::jsonb,$3::jsonb) result',[action,JSON.stringify(actor),JSON.stringify(body)])).rows[0].result});
 const authenticate=async(req,permission)=>{
  const s=auth.readSessionToken(auth.readCookie(req,auth.COOKIE_NAME),process.env.TEACHER_SESSION_SECRET);
  if(!s)throw Error('unauthorized');if(s.role!=='admin'||(permission&&!auth.hasPermission(s,permission)))throw Error('forbidden');return {type:'admin',id:s.username};
 };
 const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'interview-concept-preview-'));
 let scenario='correct';const answers={correct,wrong,partial,correction:wrong+' 아니, 정정하겠습니다. '+correct};
 const mock=()=>provider({transcribe:async()=>answers[scenario],judge:async(text,rubric)=>{
  const status=scenario==='wrong'?'rejected':scenario==='partial'?'partial':'accepted';
  const items=conceptItems(rubric),base={criteria:rubric.criteria.flatMap((c,index)=>conceptRule(c)?[]:[{index,status:keywordCoverage(c,text,occurrences).literalSatisfied?'accepted':'rejected',quote:text,reason:'격리 fixture의 고정 문맥 판정입니다.'}]),errors:rubric.criticalErrors.map((_,index)=>({index,status:scenario==='wrong'?'present':'absent',quote:scenario==='wrong'?text:'',reason:'격리 fixture의 고정 오류 판정입니다.'})),uncertainties:[]};
  if(items.length)base.concepts=items.map(item=>({index:item.index,status,quote:text,reason:conceptJudgment(status,text).concepts[0].reason}));return base;
 }});
 const examDeps={authenticate,reports,config:()=>({enabled:true,ready:true}),detail:(actor,id)=>invoke('admin_rubric_detail',actor,{id}),provider:mock};
 const jobDeps={config:()=>({enabled:true,ready:true,storageReady:true}),authenticateWeb:async req=>{try{await authenticate(req);return {id:'ip-a'};}catch{return null;}},previewAllowed:()=>false,invoke:async(a,actor,body)=>(await db.query('select ip_job_exam_service($1,$2::jsonb,$3::jsonb) result',[a,JSON.stringify(actor),JSON.stringify(body)])).rows[0].result,provider:mock,storage:()=>({put:async(id,audio)=>fs.writeFile(path.join(temporary,id+'.wav'),audio),signed:async id=>'/audio/'+id})};
 const prep=createPrep({invoke});
 const server=http.createServer(async(req,res)=>{
  res.status=code=>{res.statusCode=code;return res;};res.json=data=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));};
  if(req.url==='/api/interview-exam')return createExam(examDeps)(req,res);
  if(req.url==='/api/interview-job-exam')return createJob(jobDeps)(req,res);
  if(req.url==='/qa/case'){try{await authenticate(req);if(req.method!=='POST'||new URL(req.headers.origin).host!==req.headers.host)throw Error();let raw='';for await(const c of req){raw+=c;if(raw.length>1000)throw Error();}const data=JSON.parse(raw);if(!Object.hasOwn(answers,data.scenario))throw Error();scenario=data.scenario;return res.json({ok:true});}catch{return res.status(403).json({ok:false});}}
  if(req.url.startsWith('/audio/')){try{await authenticate(req);const id=req.url.slice(7);if(!/^[a-f0-9-]{36}$/.test(id))throw Error();await jobDeps.invoke('get',{type:'student',id:'ip-a'},{id});res.setHeader('Content-Type','audio/wav');return res.end(await fs.readFile(path.join(temporary,id+'.wav')));}catch{return res.status(404).end();}}
  if(req.url==='/prep-api')return prep(req,res);
  const relative=new URL(req.url,'http://localhost').pathname.slice(1)||'tests/fixtures/interview-concept/index.html';
  if(!/^(interview-[a-z0-9-]+\.(js|css)|client\/interview-[a-z0-9-]+\.(js|mjs)|client\/interview-attempts\/[a-z-]+\.mjs|tests\/fixtures\/interview-concept\/(index\.html|main\.mjs))$/.test(relative)){res.statusCode=404;return res.end();}
  try{
   const data=await fs.readFile(path.join(__dirname,'..',relative));res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type',relative.endsWith('.html')?'text/html; charset=utf-8':relative.endsWith('.css')?'text/css':'text/javascript; charset=utf-8');
   res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; media-src 'self' blob:; connect-src 'self'");
   if(req.url==='/')res.setHeader('Set-Cookie',`${auth.COOKIE_NAME}=${cookie}; HttpOnly; SameSite=Strict; Path=/`);
   res.end(data);
  }catch{res.statusCode=500;res.end('preview_unavailable');}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const audioPath=path.join(temporary,'fixture-answer.wav');await fs.writeFile(audioPath,wav());
 console.log(JSON.stringify({origin:'http://127.0.0.1:'+server.address().port,audioPath,scope:'isolated PGlite and mock AI'}));
 process.on('SIGINT',()=>{server.close();void db.close().then(()=>process.exit(0));});
})().catch(e=>{console.error(e);process.exitCode=1;});
