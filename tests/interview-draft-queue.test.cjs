const assert=require('node:assert/strict'),fs=require('node:fs');
const {createDb}=require('./helpers/interview-db.cjs');
(async()=>{const {db,invoke}=await createDb();try{
 await db.exec(fs.readFileSync('supabase/migrations/20261026105057_interview_draft_questions_queue.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261026111931_fix_draft_question_owner_reference.sql','utf8'));
 const admin={type:'admin',id:'qa'},a={type:'student',id:'ip-a'},b={type:'student',id:'ip-b'},worker={type:'worker'};
 await invoke('admin_enabled',admin,{enabled:true});for(const id of ['ip-a','ip-b'])await invoke('admin_member_save',admin,{targetStudentId:id,track:'공채',examNumber:id,enabled:true});
 const call=async(action,actor,body={})=>(await db.query('select ip_draft_question_service($1,$2::jsonb,$3::jsonb) r',[action,JSON.stringify(actor),JSON.stringify(body)])).rows[0].r;
 const experience={title:'팀 발표',content:'팀원이 발표를 어려워해서 제가 자료를 정리하고 발표했습니다.'};
 await assert.rejects(call('request',a,{experience}),/questions_unavailable/);
 await call('poll',worker);const job=await call('request',a,{experience});assert.equal(job.state,'queued');
 assert.equal((await call('request',a,{experience})).id,job.id);
 await assert.rejects(call('status',b,{id:job.id}),/not_found/);
 await assert.rejects(call('request',{type:'student',id:'ip-c'},{experience}),/not_enrolled/);
 await assert.rejects(call('request',a,{experience:{...experience,content:experience.content+' 다른 경험'}}),/admission_busy/);
 const claimed=(await call('poll',worker)).jobs[0];assert.equal(claimed.id,job.id);assert.equal((await call('poll',worker)).jobs.length,0);
 await assert.rejects(call('complete',worker,{...claimed,questions:['하나']}),/invalid_output/);
 await call('complete',worker,{...claimed,questions:['발표를 맡기로 한 이유는 무엇인가요?','어떤 자료를 정리했나요?']});
 // Interview-only accounts have an owner and enrollment, but no legacy student record.
 await db.exec("insert into ip_owners(id,name) values('web-only-qa','신규 면접 테스트');");
 await invoke('admin_member_save',admin,{targetStudentId:'web-only-qa',track:'공채',examNumber:'qa',enabled:true});
 const newcomer={type:'student',id:'web-only-qa'};
 assert.equal((await db.query("select count(*)::int n from students where id='web-only-qa'")).rows[0].n,0);
 const newJob=await call('request',newcomer,{experience});assert.equal(newJob.state,'queued');
 const newClaim=(await call('poll',worker)).jobs[0];assert.equal(newClaim.id,newJob.id);
 await call('complete',worker,{...newClaim,questions:['자료 조사 역할을 맡긴 이유는 무엇인가요?','정리한 자료는 어떻게 구성했나요?']});
 assert.equal((await call('status',newcomer,{id:newJob.id})).questions.length,2);
 assert.equal((await call('request',newcomer,{experience})).id,newJob.id);
 await assert.rejects(call('status',a,{id:newJob.id}),/not_found/);
 assert.equal((await call('status',a,{id:job.id})).questions.length,2);assert.equal((await call('request',a,{experience})).state,'completed');
 for(let i=1;i<10;i++){await call('request',a,{experience:{...experience,content:experience.content+i}});const next=(await call('poll',worker)).jobs[0];await call('fail',worker,next);}
 await assert.rejects(call('request',a,{experience:{...experience,content:experience.content+'11'}}),/daily_limit/);
 await db.exec('set role anon');await assert.rejects(db.query('select * from ip_draft_question_jobs'),/permission denied/);await assert.rejects(call('poll',worker),/permission denied/);await db.exec('reset role');
 console.log('PASS queue: enrollment, worker offline, ownership, cache/dedup, leases, 2 questions, durable daily limit and anonymous isolation');
}finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
