'use strict';
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{randomBytes}=require('node:crypto');
const {createDb}=require('../tests/helpers/interview-db.cjs');
const {createHandler}=require('../api/interview-job-exam');
const {detail,provider,judgment}=require('../tests/interview-exam.test.cjs');
(async()=>{
 const {db,invoke:prep}=await createDb();
 for(const suffix of ['_interview_keyword_rules_reports.sql','_interview_student_job_exam.sql']){const file=(await fs.readdir('supabase/migrations')).find(n=>n.endsWith(suffix));await db.exec(await fs.readFile('supabase/migrations/'+file,'utf8'));}
 await db.exec("update ip_settings set enabled=true;insert into ip_members(student_id,track,exam_number,expires_on) values('ip-a','공채','qa-only','2099-01-01');");
 const d=detail();await db.query("insert into ip_questions(id,prompt,category,revision,status,tracks) values($1,$2,'job',2,'published',array['공채'])",[d.question.id,d.question.prompt]);
 await prep('admin_rubric_save',{type:'admin',id:'qa'},{id:d.question.id,revision:0,questionRevision:2,kind:'job_knowledge',rationale:'실제 학생과 무관한 가상 전공 기준입니다.',criteria:d.rubric.criteria,criticalErrors:d.rubric.critical_errors,verificationNote:d.rubric.verification_note,scoreMap:d.rubric.score_map,status:'reviewed'});
 const invoke=async(action,actor,body={})=>(await db.query('select ip_job_exam_service($1,$2::jsonb,$3::jsonb) result',[action,JSON.stringify(actor),JSON.stringify(body)])).rows[0].result;
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'student-job-preview-')),token=randomBytes(32).toString('hex');
 const authenticated=req=>(req.headers.cookie||'').split(';').some(c=>c.trim()==='job_qa='+token);
 const handler=createHandler({config:()=>({enabled:true,ready:true,storageReady:true}),authenticateWeb:async req=>authenticated(req)?{id:'ip-a'}:null,previewAllowed:()=>false,authenticateDevice:async()=>null,invoke,provider:()=>provider(),storage:()=>({put:async(id,audio)=>fs.writeFile(path.join(root,id+'.wav'),audio),signed:async id=>'/audio/'+id,remove:async id=>fs.rm(path.join(root,id+'.wav'),{force:true})})});
 const repository=path.resolve(__dirname,'..');
 const server=http.createServer(async(req,res)=>{
  res.status=code=>{res.statusCode=code;return res;};res.json=value=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));};
  if(req.url==='/api/interview-job-exam')return handler(req,res);
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname.startsWith('/audio/')){
   try{if(!authenticated(req))throw Error();const id=pathname.slice(7);if(!/^[a-f0-9-]{36}$/.test(id))throw Error();await invoke('get',{type:'student',id:'ip-a'},{id});const bytes=await fs.readFile(path.join(root,id+'.wav'));res.setHeader('Content-Type','audio/wav');return res.end(bytes);}catch{res.statusCode=404;return res.end();}
  }
  const relative=pathname.slice(1)||'tests/fixtures/interview-student-job/index.html';
  if(!/^(interview-[a-z0-9-]+\.(js|css)|client\/interview-[a-z0-9-]+\.(js|mjs)|client\/interview-attempts\/[a-z-]+\.mjs|tests\/fixtures\/interview-student-job\/(index\.html|main\.mjs))$/.test(relative)){res.statusCode=404;return res.end();}
  try{const bytes=await fs.readFile(path.join(repository,relative));res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type',relative.endsWith('.html')?'text/html; charset=utf-8':relative.endsWith('.css')?'text/css':'text/javascript');
   res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; media-src 'self' blob:; connect-src 'self'; img-src 'self' data:");if(pathname==='/')res.setHeader('Set-Cookie',`job_qa=${token}; HttpOnly; SameSite=Strict; Path=/`);res.end(bytes);
  }catch{res.statusCode=404;res.end();}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});console.log(JSON.stringify({origin:'http://127.0.0.1:'+server.address().port,audioRoot:root,scope:'synthetic audio, local PGlite and mocked AI'}));
 process.on('SIGINT',()=>{server.close();void db.close().then(()=>process.exit(0));});
})().catch(e=>{console.error(e.message);process.exitCode=1;});
