'use strict';
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),{randomBytes}=require('node:crypto');
const {createDb}=require('../tests/helpers/interview-db.cjs');
const {createReportRepository}=require('../lib/interview-exam-reports.cjs');
const {createHandler:createExam}=require('../api/interview-exam');
const {createHandler:createPrep}=require('../api/interview-prep');
const auth=require('../api/teacher-auth-utils');
const {detail,wav,provider}=require('../tests/interview-exam.test.cjs');
const {keywordCoverage}=require('../lib/interview-keyword-rules.cjs');
const {occurrences}=require('../lib/interview-exam-scoring');
(async()=>{
 const {db,invoke}=await createDb(),admin={type:'admin',id:'keyword-report-qa'},fixture=detail();
 const migration=(await fs.readdir('supabase/migrations')).find(n=>n.endsWith('_interview_keyword_rules_reports.sql'));await db.exec(await fs.readFile('supabase/migrations/'+migration,'utf8'));
 await db.query('insert into ip_questions(id,prompt,category,revision) values($1,$2,$3,$4)',[fixture.question.id,fixture.question.prompt,'job',fixture.question.revision]);
 await invoke('admin_rubric_save',admin,{id:fixture.question.id,revision:0,questionRevision:2,kind:'job_knowledge',rationale:'브라우저 검증용 가상 전공 기준입니다.',criteria:fixture.rubric.criteria,criticalErrors:fixture.rubric.critical_errors,verificationNote:fixture.rubric.verification_note,scoreMap:{O:2,partial:1,X:0},status:'reviewed'});
 process.env.TEACHER_SESSION_SECRET=randomBytes(32).toString('hex');
 const cookie=auth.createSessionToken(process.env.TEACHER_SESSION_SECRET,{username:admin.id,role:'admin',permissions:['interview.read','interview.write']});
 const reports=createReportRepository({invoke:async(action,actor,body)=>(await db.query('select ip_exam_report_service($1,$2::jsonb,$3::jsonb) result',[action,JSON.stringify(actor),JSON.stringify(body)])).rows[0].result});
 const authenticate=async(req,permission)=>{
  const s=auth.readSessionToken(auth.readCookie(req,auth.COOKIE_NAME),process.env.TEACHER_SESSION_SECRET);
  if(!s)throw Error('unauthorized');if(s.role!=='admin'||(permission&&!auth.hasPermission(s,permission)))throw Error('forbidden');return {type:'admin',id:s.username};
 };
 const answer='VHF로 상황실에 위치 정보를 보고합니다.';
 const exam=createExam({authenticate,reports,config:()=>({enabled:true,ready:true}),detail:(actor,id)=>invoke('admin_rubric_detail',actor,{id}),provider:()=>provider({transcribe:async()=>answer,judge:async(text,rubric)=>({criteria:rubric.criteria.map((c,index)=>({index,status:keywordCoverage(c,text,occurrences).literalSatisfied?'accepted':'rejected',quote:text,reason:'모의 공급자의 고정 검증 결과입니다.'})),errors:rubric.criticalErrors.map((_,index)=>({index,status:'absent',quote:'',reason:'모의 공급자 오류 없음'})),uncertainties:[]})})});
 const prep=createPrep({invoke});
 const server=http.createServer(async(req,res)=>{
  res.status=code=>{res.statusCode=code;return res;};res.json=data=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));};
  if(req.url==='/api/interview-exam')return exam(req,res);
  if(req.url==='/prep-api')return prep(req,res);
  const relative=new URL(req.url,'http://localhost').pathname.slice(1)||'tests/fixtures/interview-keyword-reports/index.html';
  if(!/^(interview-rubric-ui\.js|interview-exam-validation-ui\.js|tests\/fixtures\/interview-keyword-reports\/(index\.html|main\.mjs))$/.test(relative)){res.statusCode=404;return res.end();}
  try{
   const data=await fs.readFile(path.join(__dirname,'..',relative));res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type',relative.endsWith('.html')?'text/html; charset=utf-8':'text/javascript; charset=utf-8');
   res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'unsafe-inline'; media-src 'self' blob:; connect-src 'self'");
   if(req.url==='/')res.setHeader('Set-Cookie',`${auth.COOKIE_NAME}=${cookie}; HttpOnly; SameSite=Strict; Path=/`);
   res.end(data);
  }catch{res.statusCode=500;res.end('preview_unavailable');}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const audioPath=path.join(require('node:os').tmpdir(),'interview-keyword-report-qa.wav');await fs.writeFile(audioPath,wav());
 console.log(JSON.stringify({origin:'http://127.0.0.1:'+server.address().port,audioPath,scope:'isolated PGlite and mock AI'}));
 process.on('SIGINT',()=>{server.close();void db.close().then(()=>process.exit(0));});
})().catch(e=>{console.error(e);process.exitCode=1;});
