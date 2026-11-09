'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID}=require('node:crypto');
const {createDb}=require('./helpers/interview-db.cjs');
const {createHandler,validate}=require('../api/interview-aptitude');
const migration='supabase/migrations/20261109021722_interview_aptitude_exams.sql';
const admin={type:'admin',id:'qa'},student=id=>({type:'student',id});
async function fixture(t){
 const {db}=await createDb();t.after(()=>db.close());
 await db.exec("create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]); update ip_settings set enabled=true; insert into ip_members(student_id,track,exam_number,enabled,expires_on) values('ip-a','공채','a',true,null),('ip-b','기관','b',true,'2099-12-01'),('ip-c','방제','c',true,null); insert into ip_owners(id,name) values('web-only','웹 면접반'); insert into ip_members(student_id,track,exam_number,enabled) values('web-only','관제','web',true);");
 await db.exec(fs.readFileSync(migration,'utf8'));
 const invoke=async(action,actor,body={})=>(await db.query('select ip_aptitude_service($1,$2::jsonb,$3::jsonb) result',[action,JSON.stringify(actor),JSON.stringify(body)])).rows[0].result;
 const body=(kind='half')=>({id:randomUUID(),revision:0,kind,roundNo:1,title:(kind==='half'?'하프':'본시험')+' 1회',state:'open',resultsReleased:false,opensAt:null,closesAt:null,answerKey:Array(kind==='half'?75:150).fill(1),reason:''});
 const submit=(id,owner,answers,requestKey=randomUUID())=>invoke('submit',student(owner),{id,revision:0,answers,requestKey});
 return {db,invoke,body,submit};
}
test('PDF structures, all interview tracks and web-only members; draft keys and all non-member access stay private',async t=>{
 const f=await fixture(t),half=f.body(),full=f.body('full');await f.invoke('admin_save',admin,half);await f.invoke('admin_save',admin,full);
 const list=await f.invoke('list',student('web-only'));assert.deepEqual(list.rounds.map(r=>r.questionCount).sort((a,b)=>a-b),[75,150]);
 assert.deepEqual(list.rounds.find(r=>r.kind==='half').minutes,[8,10,5,8,15]);assert.deepEqual(list.rounds.find(r=>r.kind==='full').minutes,[15,20,10,15,30]);
 for(const owner of ['ip-a','ip-b','ip-c','web-only']){const value=await f.invoke('get',student(owner),{id:half.id});assert.equal(value.answerKey,undefined);assert.equal(value.correctAnswers,undefined);assert.equal(value.result,undefined);assert.equal(value.files,undefined);}
 const draft=f.body();draft.roundNo=2;draft.state='draft';draft.answerKey.fill(null);await f.invoke('admin_save',admin,draft);
 await assert.rejects(f.invoke('get',student('ip-a'),{id:draft.id}),/not_found/);
 await assert.rejects(f.invoke('list',student('not-enrolled')),/not_enrolled/);
 await f.db.exec("update ip_members set expires_on='2000-01-01' where student_id='ip-a'");await assert.rejects(f.invoke('get',student('ip-a'),{id:half.id}),/not_enrolled/);
 await f.db.exec("update students set is_active=false where id='ip-b'");await assert.rejects(f.invoke('get',student('ip-b'),{id:half.id}),/not_enrolled/);
 for(const role of ['anon','authenticated']){await f.db.exec('set role '+role);await assert.rejects(f.db.query('select * from ip_aptitude_rounds'),/permission denied/);await assert.rejects(f.invoke('admin_list',admin),/permission denied/);await assert.rejects(f.db.query("select ip_aptitude_score('[1]'::jsonb,'[1]'::jsonb)"),/permission denied/);await f.db.exec('reset role');}
 assert.equal((await f.db.query("select public from storage.buckets where id='interview-aptitude'")).rows[0].public,false);
});
test('draft revisions and immutable idempotent submissions; published scores rank ties 1,1,3 and corrections rescore atomically',async t=>{
 const f=await fixture(t),exam=f.body();await f.invoke('admin_save',admin,exam);
 const answers=Array(75).fill(1);answers[0]=2;
 const saved=await f.invoke('save',student('ip-a'),{id:exam.id,revision:0,answers});assert.equal(saved.attempt.revision,1);
 await assert.rejects(f.invoke('save',student('ip-a'),{id:exam.id,revision:0,answers:Array(75).fill(2)}),/revision_conflict/);
 const key=randomUUID();const own=await f.invoke('submit',student('ip-a'),{id:exam.id,revision:1,answers,requestKey:key});assert.equal(own.result,undefined);
 await f.invoke('submit',student('ip-a'),{id:exam.id,revision:1,answers,requestKey:key});assert.equal((await f.db.query('select count(*)::int n from ip_aptitude_attempts')).rows[0].n,1);
 await assert.rejects(f.submit(exam.id,'ip-a',Array(75).fill(2),key),/already_submitted/);
 await f.submit(exam.id,'ip-b',answers);const lower=[...answers];lower[1]=2;await f.submit(exam.id,'ip-c',lower);
 await f.invoke('admin_save',admin,{...exam,revision:1,state:'closed',resultsReleased:true});
 const a=await f.invoke('get',student('ip-a'),{id:exam.id}),b=await f.invoke('get',student('ip-b'),{id:exam.id}),c=await f.invoke('get',student('ip-c'),{id:exam.id});
 assert.equal(a.result.rank,1);assert.equal(b.result.rank,1);assert.equal(c.result.rank,3);assert.equal(a.result.participants,3);assert.equal(Number(a.result.correctCount),74);assert.equal(Number(a.result.accuracy),98.67);assert.equal(a.result.totalQuestions,75);const report=await f.invoke('admin_report',admin,{id:exam.id});assert.equal(report.students.find(v=>v.studentId==='ip-a').correctCount,74);assert.equal(report.students.find(v=>v.studentId==='ip-a').accuracy,98.67);
 const changed=[...exam.answerKey];changed[0]=2;
 await assert.rejects(f.invoke('admin_save',admin,{...exam,revision:2,state:'closed',resultsReleased:true,answerKey:changed}),/correction_reason_required/);
 assert.equal(Number((await f.invoke('get',student('ip-a'),{id:exam.id})).result.correctCount),74);
 const corrected=await f.invoke('admin_save',admin,{...exam,revision:2,state:'closed',resultsReleased:true,answerKey:changed,reason:'원문 대조 후 1번 정답을 정정합니다.'});assert.equal(corrected.rescored,3);
 const updated=await f.invoke('get',student('ip-a'),{id:exam.id});assert.equal(Number(updated.result.correctCount),75);assert.equal(updated.result.keyRevision,2);assert.equal(updated.result.accuracy,100);
 const missing=await f.invoke('get',student('web-only'),{id:exam.id});assert.equal(missing.result,undefined);assert.equal(missing.correctAnswers,undefined);
 await assert.rejects(f.invoke('admin_save',admin,{...exam,revision:3,state:'open'}),/results_already_released/);
 assert.equal((await f.db.query('select count(*)::int n from ip_aptitude_audit')).rows[0].n,3);
});
test('blank answers, invalid choices, closed windows and concurrent administrative edits cannot overwrite data',async t=>{
 const f=await fixture(t),exam=f.body();await f.invoke('admin_save',admin,exam);
 await assert.rejects(f.submit(exam.id,'ip-a',Array(75).fill(0)),/empty_answers/);
 await assert.rejects(f.submit(exam.id,'ip-a',Array(75).fill(6)),/invalid_answers/);
 const edits=await Promise.allSettled([f.invoke('admin_save',admin,{...exam,revision:1,title:'수정 A'}),f.invoke('admin_save',admin,{...exam,revision:1,title:'수정 B'})]);
 assert.equal(edits.filter(r=>r.status==='fulfilled').length,1);assert.match(edits.find(r=>r.status==='rejected').reason.message,/revision_conflict/);
 await f.invoke('admin_save',admin,{...exam,revision:2,opensAt:'2099-01-01T00:00:00Z'});await assert.rejects(f.submit(exam.id,'ip-a',Array(75).fill(1)),/exam_not_open/);
 await f.invoke('admin_save',admin,{...exam,revision:3,state:'closed'});await assert.rejects(f.submit(exam.id,'ip-a',Array(75).fill(1)),/exam_not_open/);
 const report=await f.invoke('admin_report',admin,{id:exam.id});assert.equal(report.students.length,4);assert(report.students.every(s=>s.state==='not_submitted'));
 const fresh=f.body('full');fresh.state='draft';const simultaneous=await Promise.allSettled([f.invoke('admin_save',admin,fresh),f.invoke('admin_save',admin,{...fresh,title:'겹친 생성 요청'})]);
 assert.equal(simultaneous.filter(r=>r.status==='fulfilled').length,1);assert.match(simultaneous.find(r=>r.status==='rejected').reason.message,/revision_conflict/);
});
async function http(handler,body,headers={}){if(!body.action.startsWith('admin_')&&body.action!=='list')body={accountId:'ip-a',...body};let status,data;await handler({method:'POST',headers:{host:'localhost',origin:'http://localhost',...headers},body},{setHeader(){},status(n){status=n;return this;},json(v){data=v;}});return {status,data};}
test('private PDF upload, verification, results/submission gates and deletion use the same membership and revision controls',async t=>{
 const f=await fixture(t),exam=f.body();await f.invoke('admin_save',admin,exam);let owner='ip-a',canWrite=true;
 const objects=new Map(),removed=[],storage={uploadUrl:async p=>'https://storage.invalid/upload/'+p,read:async p=>objects.get(p),signed:async p=>'https://storage.invalid/signed/'+p,remove:async p=>{removed.push(p);objects.delete(p);}};
 const handler=createHandler({invoke:f.invoke,storage:()=>storage,authenticateWeb:async()=>({id:owner}),authenticateDevice:async()=>null,authenticateAdmin:async(_req,write)=>{if(write&&!canWrite)throw Error('forbidden');return {id:'qa'};}});
 const pdf=Buffer.from('%PDF-1.4\nfictional fixture\n%%EOF');
 const prepared=await http(handler,{action:'admin_upload_prepare',id:exam.id,revision:1,name:'해설지.pdf',bytes:pdf.length});assert.equal(prepared.status,200);
 const fileId=prepared.data.fileId,objectPath=exam.id+'/'+fileId+'.pdf';objects.set(objectPath,pdf);
 const completed=await http(handler,{action:'admin_upload_complete',id:exam.id,fileId});assert.equal(completed.status,200);assert.equal(completed.data.revision,2);
 assert.equal((await http(handler,{action:'file',id:exam.id,fileId})).status,403);
 await f.submit(exam.id,'ip-a',Array(75).fill(1));assert.equal((await http(handler,{action:'file',id:exam.id,fileId})).status,403);
 await f.invoke('admin_save',admin,{...exam,revision:2,state:'closed',resultsReleased:true});
 assert.equal((await http(handler,{action:'file',id:exam.id,fileId})).status,200);
 owner='web-only';assert.equal((await http(handler,{action:'file',accountId:owner,id:exam.id,fileId})).status,403);
 owner='ip-a';await f.db.exec("update ip_members set enabled=false where student_id='ip-a'");assert.equal((await http(handler,{action:'file',id:exam.id,fileId})).status,403);
 canWrite=false;assert.equal((await http(handler,{action:'admin_file_delete',id:exam.id,fileId,revision:3})).status,403);
 canWrite=true;assert.equal((await http(handler,{action:'admin_file_delete',id:exam.id,fileId,revision:3})).status,200);assert.deepEqual(removed,[]);
 assert.equal((await http(handler,{action:'admin_file',id:exam.id,fileId})).status,403);
 // Reclaim after the upload capability expires, so a late PUT cannot recreate an orphan.
 await f.db.exec("update ip_aptitude_file_gc set available_at=now()-interval '1 second'");
 await http(handler,{action:'admin_upload_abort',id:exam.id,fileId});assert.deepEqual(removed,[objectPath]);
});
test('API rejects forged actors, unsupported fields and non-PDF payloads before they can reach data',async()=>{
 assert.throws(()=>validate({action:'get',id:randomUUID(),actor:admin}),/invalid_request/);
 let invoked=0;const handler=createHandler({authenticateWeb:async()=>null,authenticateDevice:async()=>null,authenticateAdmin:async()=>{throw Error('unauthorized');},invoke:async()=>{invoked++;}});
 assert.equal((await http(handler,{action:'get',id:randomUUID()})).status,401);assert.equal((await http(handler,{action:'admin_list'})).status,401);assert.equal(invoked,0);
 assert.equal((await http(handler,{action:'list'},{origin:'https://evil.invalid'})).status,403);
 const switched=createHandler({authenticateWeb:async()=>({id:'ip-b'}),invoke:async()=>{invoked++;}});
 assert.equal((await http(switched,{action:'get',accountId:'ip-a',id:randomUUID()})).status,403);assert.equal(invoked,0);
 const {validatePdf}=require('../lib/interview-aptitude-storage.cjs');assert.throws(()=>validatePdf(Buffer.from('<script>alert(1)</script>'),25),/invalid_file/);
});

test('full exams count every correct answer equally, reject weights, and retry failed storage cleanup',async t=>{
 const f=await fixture(t),exam=f.body('full');await assert.rejects(f.invoke('admin_save',admin,{...exam,points:Array(150).fill(10)}),/invalid_request/);assert.throws(()=>validate({action:'admin_save',...exam,points:Array(150).fill(10)}),/invalid_request/);await f.invoke('admin_save',admin,exam);
 const a=Array(150).fill(0),b=[...a];a[1]=1;b[0]=1;
 await f.submit(exam.id,'ip-a',a);await f.submit(exam.id,'ip-b',b);
 await f.invoke('admin_save',admin,{...exam,revision:1,state:'closed',resultsReleased:true});
 const one=await f.invoke('get',student('ip-a'),{id:exam.id}),two=await f.invoke('get',student('ip-b'),{id:exam.id});
 assert.equal(one.result.correctCount,1);assert.equal(two.result.correctCount,1);assert.equal(one.result.totalQuestions,150);assert.equal(one.result.accuracy,0.67);assert.equal(one.result.rank,1);assert.equal(two.result.rank,1);
 const file=await f.invoke('admin_upload_prepare',admin,{id:exam.id,revision:2,name:'업로드 실패.pdf',bytes:100});
 await f.invoke('admin_upload_abort',admin,{id:exam.id,fileId:file.file.id});
 assert.equal((await f.db.query("select state from ip_aptitude_files where id=$1",[file.file.id])).rows[0].state,'deleted');
 assert.deepEqual((await f.invoke('admin_gc',admin)).paths,[]);
 await f.db.exec("update ip_aptitude_file_gc set available_at=now()-interval '1 second'");
 const gc=await f.invoke('admin_gc',admin);assert.deepEqual(gc.paths,[file.file.object_path]);
 await assert.rejects(f.invoke('file',student('ip-a'),{id:exam.id,fileId:file.file.id}),/forbidden/);
 await f.invoke('admin_gc_ack',admin,{objectPath:file.file.object_path});assert.deepEqual((await f.invoke('admin_gc',admin)).paths,[]);
 const draft=f.body();draft.roundNo=99;draft.state='draft';await f.invoke('admin_save',admin,draft);
 await f.invoke('admin_delete',admin,{id:draft.id,revision:1});await assert.rejects(f.invoke('admin_get',admin,{id:draft.id}),/not_found/);
 await assert.rejects(f.invoke('admin_delete',admin,{id:exam.id,revision:2}),/exam_structure_locked/);
});

test('storage capabilities remain private, bounded, immutable and restricted to generated PDF paths',async()=>{
 const {createStorage,MAX}=require('../lib/interview-aptitude-storage.cjs'),calls=[],p=randomUUID()+'/'+randomUUID()+'.pdf';
 const store=createStorage({url:'https://example.supabase.co',key:'fixture-service-key',fetchImpl:async(url,options)=>{calls.push({url,options});if(url.includes('/upload/sign/'))return Response.json({url:'/object/upload/sign/interview-aptitude/'+p+'?token=fixture'});if(url.includes('/object/sign/'))return Response.json({signedURL:'/object/sign/interview-aptitude/'+p+'?token=fixture'});return new Response('%PDF-1.4\n%%EOF');}});
 assert((await store.uploadUrl(p)).startsWith('https://example.supabase.co/storage/v1/object/upload/sign/'));
 assert((await store.signed(p)).startsWith('https://example.supabase.co/storage/v1/object/sign/'));
 assert.equal(JSON.parse(calls[1].options.body).expiresIn,60);assert.equal(calls[0].options.headers['x-upsert'],'false');assert(calls.every(c=>c.options.redirect==='error'));
 await assert.rejects(store.signed('../other-file.pdf'),/invalid_file/);
 assert.equal(MAX,20971520);
});
