'use strict';
const fs=require('node:fs'),{randomUUID}=require('node:crypto');
const {createDb}=require('./interview-db.cjs');
const {detail,wav,judgment}=require('../interview-exam.test.cjs');
const personality=require('./interview-personality-fixture.cjs');
const {createQueue}=require('../../lib/interview-mock-cli-queue.cjs');
async function fixture(){
 const {db,invoke:prep}=await createDb();
 for(const suffix of ['_interview_keyword_rules_reports.sql','_interview_student_job_exam.sql','_interview_student_personality.sql','_interview_live_sessions.sql','_interview_live_result_reports.sql','_interview_mock_test_access.sql','_interview_mock_cli_queue.sql']){
  const file=fs.readdirSync('supabase/migrations').find(n=>n.endsWith(suffix));await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
 }
 await db.exec("update ip_settings set enabled=true;insert into ip_members(student_id,track,exam_number,expires_on,mock_test_enabled) values('ip-a','공채','mock-a','2099-01-01',true),('ip-b','기관','mock-b','2099-01-01',true);");
 const d=detail();
 for(const [q,kind,criteria,errors,scoreMap] of [[d.question,'job_knowledge',d.rubric.criteria,d.rubric.critical_errors,d.rubric.score_map],[{...personality.question,category:'personality'},'personality_experience',[],[],null]]){
  await db.query("insert into ip_questions(id,prompt,category,revision,status,tracks) values($1,$2,$3,2,'published',array['공채'])",[q.id,q.prompt,q.category]);
  await prep('admin_rubric_save',{type:'admin',id:'qa'},{id:q.id,revision:0,questionRevision:2,kind,rationale:'CLI 연결을 검증하는 가상 기준입니다.',criteria,criticalErrors:errors,verificationNote:'운영 자료가 아닌 가상 자료입니다.',scoreMap,status:'reviewed'});
 }
 const rpc=name=>async(action,actor,body={})=>(await db.query(`select ${name}($1,$2::jsonb,$3::jsonb) result`,[action,JSON.stringify(actor),JSON.stringify(body)])).rows[0].result;
 const queue=createQueue({invoke:rpc('ip_mock_cli_queue_service')}),files=new Map();let identity='ip-a';
 const deps=kind=>({requireMockAccess:async id=>{const data=await rpc('ip_mock_access_service')('mock_status',{type:'student',id},{});if(!data.allowed)throw Error('forbidden');},
  config:()=>({mode:'pc',enabled:true,ready:true,storageReady:true}),authenticateWeb:async()=>({id:identity}),previewAllowed:()=>false,authenticateDevice:async()=>null,
  invoke:rpc(kind==='job'?'ip_job_exam_service':'ip_personality_service'),queue:()=>queue,provider:()=>{throw Error('external_api_must_not_run');},
  storage:()=>({put:async(id,audio)=>files.set(id,audio),read:async id=>files.get(id),signed:async id=>'/audio/'+id,remove:async id=>files.delete(id)}),cronSecret:'s'.repeat(32)});
 const handlers={job:require('../../api/interview-job-exam').createHandler(deps('job')),personality:require('../../api/interview-personality').createHandler(deps('personality'))};
 async function callHandler(handler,body,headers={}){let status,data;await handler({method:'POST',headers:{host:'localhost',...headers},body},{setHeader(){},status(n){status=n;return this;},json(value){data=value;}});return {status,data};}
 async function submit(kind){const start=await callHandler(handlers[kind],{action:'start',questionId:kind==='job'?d.question.id:personality.question.id,requestKey:randomUUID()});if(start.status!==200)throw Error(JSON.stringify(start));return callHandler(handlers[kind],{action:'submit',id:start.data.run.id,audioBase64:wav().toString('base64')});}
 const infer=async(input,options)=>options.schema.properties.components?personality.analysis():options.schema.properties.strengths?
  {summary:'저장된 답변의 구성과 행동 근거를 확인했습니다.',strengths:[{turnId:'1',quote:input.turns[0].answer,feedback:'본인의 행동과 결과를 설명했습니다.'}],improvements:[],nextPractice:[{turnId:'1',quote:input.turns[0].answer,feedback:'본인의 행동을 짧고 명확하게 다시 말해보세요.'}]}:judgment();
 return {db,queue,files,handlers,deps,callHandler,submit,infer,models:{judge:'test-judge',verifier:'test-verifier',analyzer:'test-analyzer',transcriber:'test-asr'},rpc,identity:id=>identity=id,personality,detail:d};
}
module.exports={fixture};
