const assert=require('node:assert/strict'),fs=require('node:fs');
const {createDb}=require('./helpers/interview-db.cjs');
const {createHandler}=require('../api/interview-prep');
const auth=require('../api/teacher-auth-utils');
const admin={type:'admin',id:'qa'},a={type:'student',id:'ip-a'},b={type:'student',id:'ip-b'};
(async()=>{
 const {db,invoke}=await createDb();
 try{
  await db.exec(fs.readFileSync('supabase/seeds/interview-corpus.sql','utf8'));
  const count=Number((await db.query('select count(*) n from ip_questions')).rows[0].n);assert.equal(count,5083);
  assert.equal(Number((await db.query('select count(*) n from ip_occurrences')).rows[0].n),5434);
  await db.exec(fs.readFileSync('supabase/seeds/interview-corpus.sql','utf8')); // re-import must not duplicate
  assert.equal(Number((await db.query('select count(*) n from ip_questions')).rows[0].n),5083);
  assert.equal((await invoke('status',a)).enabled,false);
  await assert.rejects(invoke('bootstrap',a),/not_enrolled/);
  for(const id of ['ip-a','ip-b'])await invoke('admin_member_save',admin,{targetStudentId:id,track:'공채',examNumber:'A-2026',enabled:true});
  await invoke('admin_enabled',admin,{enabled:true});
  const boot=await invoke('bootstrap',a);assert.equal(boot.topics.length,13);
  assert.equal((await invoke('questions',a)).questions.length,0); // imported drafts private
  const first=(await invoke('admin_questions',admin,{track:'공채',topicId:'teamwork'})).questions[0];
  await invoke('admin_question_save',admin,{id:first.id,revision:1,prompt:first.prompt,category:'personality',topicIds:first.topic_ids,tracks:first.tracks,status:'published'});
  const detail=await invoke('question_detail',a,{id:first.id});assert(detail.sources.length>0);assert(!('answer' in detail.sources[0]));
  const bulk=(await invoke('admin_questions',admin,{track:'공채',topicId:'teamwork'})).questions.slice(1,3);
  if(bulk.length===2){
    await assert.rejects(invoke('admin_question_publish',admin,{items:[{id:bulk[0].id,revision:1},{id:bulk[1].id,revision:99}]}),/revision_conflict/);
    assert.equal((await invoke('admin_question_detail',admin,{id:bulk[0].id})).question.status,'draft');
    await invoke('admin_question_publish',admin,{items:bulk.map(q=>({id:q.id,revision:1}))});
    assert.equal((await invoke('admin_question_detail',admin,{id:bulk[1].id})).question.status,'published');
  }
  await assert.rejects(invoke('admin_question_save',admin,{id:first.id,revision:1,prompt:'변경',category:'personality',topicIds:['teamwork'],tracks:[],status:'published'}),/revision_conflict/);
  const job=(await invoke('admin_questions',admin,{category:'job',track:'공채'})).questions[0];
  assert.equal(job.topic_ids.length,0);
  await assert.rejects(invoke('admin_question_save',admin,{...job,category:'job',topicIds:['teamwork'],tracks:job.tracks,status:'published'}),/invalid_topic/);
  await invoke('admin_question_save',admin,{...job,category:'job',topicIds:[],tracks:job.tracks,status:'published'});
  assert((await invoke('questions',a,{category:'personality'})).questions.every(q=>q.category==='personality'));
  assert((await invoke('questions',a,{category:'job'})).questions.every(q=>q.category==='job'));
  await assert.rejects(invoke('note_save',a,{topicId:'knowledge',topicRevision:1,revision:0,fields:{},status:'draft'}),/invalid_topic/);
  await assert.rejects(invoke('note_save',a,{topicId:'teamwork',topicRevision:1,revision:0,fields:{},status:'submitted'}),/incomplete_note/);
  const fields={situation:'학교 팀 과제를 수행하던 상황입니다.',role:'전체 자료를 정리하는 역할을 맡았습니다.',action:'모든 팀원의 의견을 먼저 듣고 조율했습니다.',result:'정해진 기한에 과제를 마무리했습니다.',learning:'상대방의 상황을 이해하는 태도를 배웠습니다.'};
  const n=await invoke('note_save',a,{topicId:'teamwork',topicRevision:1,revision:0,fields,status:'submitted',studentId:'ip-b'});assert.equal(n.note.student_id,'ip-a');
  assert.equal((await invoke('bootstrap',b)).notes.length,0);
  assert.equal((await invoke('admin_members',admin,{topicId:'teamwork',noteStatus:'empty'})).members.length,1);
  assert.equal((await invoke('admin_members',admin,{topicId:'teamwork',noteStatus:'submitted'})).members[0].id,'ip-a');
  assert.equal((await invoke('history',b,{topicId:'teamwork',targetStudentId:'ip-a'})).history.length,0);
  await assert.rejects(invoke('note_save',a,{topicId:'teamwork',topicRevision:1,revision:0,fields,status:'draft'}),/revision_conflict/);
  await invoke('admin_feedback',admin,{targetStudentId:'ip-a',topicId:'teamwork',revision:1,status:'approved',feedback:'본인의 행동이 명확합니다.'});
  await invoke('note_save',a,{topicId:'teamwork',topicRevision:1,revision:2,fields:{...fields,action:'수정한 행동을 구체적으로 다시 작성했습니다.'},status:'draft'});
  assert.equal((await invoke('bootstrap',a)).notes[0].status,'draft'); // approval invalidated on edit
  assert.equal((await invoke('history',a,{topicId:'teamwork'})).history.length,3);
  const topic=boot.topics.find(t=>t.id==='teamwork');
  await invoke('admin_topic_save',admin,{...topic,revision:1,sortOrder:3,guidance:'변경된 안내',tracks:[]});
  await assert.rejects(invoke('note_save',a,{topicId:'teamwork',topicRevision:1,revision:3,fields,status:'submitted'}),/topic_changed/);
  await assert.rejects(invoke('admin_topic_save',admin,{...topic,revision:2,kind:'value',sortOrder:3,tracks:[]}),/topic_in_use/);
  const noExperience=await invoke('note_save',a,{topicId:'achievement',topicRevision:1,revision:0,fields:{help:'적절한 경험을 찾기가 어렵습니다.'},status:'no_experience'});
  assert.equal(noExperience.note.status,'no_experience');
  await assert.rejects(invoke('admin_feedback',admin,{targetStudentId:'ip-a',topicId:'achievement',revision:1,status:'approved',feedback:'통과'}),/not_submitted/);
  const deleted=await invoke('admin_question_delete',admin,{id:first.id,revision:2});assert.equal(deleted.result,'archived');
  assert.equal((await invoke('admin_question_detail',admin,{id:first.id})).sources.length,detail.sources.length);
  await assert.rejects(invoke('question_detail',a,{id:first.id}),/question_unavailable/);
  await invoke('admin_member_save',admin,{targetStudentId:'ip-a',track:'공채',examNumber:'A',enabled:true,expiresOn:'2020-01-01'});
  await assert.rejects(invoke('bootstrap',a),/not_enrolled/);
  assert.equal((await invoke('status',a)).enabled,false);
  await assert.rejects(invoke('admin_catalog',b),/forbidden/);
  for(const role of ['anon','authenticated']){
    await db.exec('set role '+role);
    await assert.rejects(db.query('select * from ip_notes'),/permission denied/);
    await assert.rejects(db.query(`select ip_service('admin_catalog','{"type":"admin","id":"attacker"}')`),/permission denied/);
    await db.exec('reset role');
  }
  const rls=(await db.query(`select relname,relrowsecurity from pg_class where relname in ('ip_notes','ip_questions','ip_members','ip_history')`)).rows;
  assert(rls.every(r=>r.relrowsecurity));
  await db.exec('set role service_role');
  assert.equal((await invoke('admin_catalog',admin)).ok,true);
  assert.equal((await invoke('bootstrap',b)).ok,true);await db.exec('reset role');
  // Real HTTP handler boundary, with trusted DB invocation and fake device verifier.
  process.env.TEACHER_SESSION_SECRET='interview-test-only';
  let calls=0;
  const handler=createHandler({previewAllowed:id=>['ip-a','ip-b'].includes(id),authenticate:async body=>body.studentId==='ip-b'&&body.deviceToken==='valid'?{id:'ip-b'}:null,
    invoke:async(...args)=>{calls++;return invoke(...args);}});
  const call=async(body,headers={})=>{let status=0,data;await handler({method:'POST',headers:{host:'localhost',...headers},body},{setHeader(){},status(n){status=n;return this;},json(x){data=x;}});return {status,data};};
  assert.equal((await call({action:'bootstrap',studentId:'ip-a',deviceToken:'invalid'})).status,401);
  assert.equal((await call({action:'admin_catalog',actor:admin,studentId:'ip-b',deviceToken:'valid'})).status,401);
  assert.equal((await call({action:'bootstrap',studentId:'ip-b',deviceToken:'valid',actor:admin})).data.notes.length,0);
  const cookie=auth.COOKIE_NAME+'='+auth.createSessionToken(process.env.TEACHER_SESSION_SECRET,{username:'qa',role:'admin',permissions:['*']});
  assert.equal((await call({action:'admin_catalog'},{cookie})).status,200);
  assert.equal((await call({action:'admin_enabled',enabled:true},{cookie,origin:'https://evil.invalid'})).status,403);
  assert.equal((await call({action:'note_save',studentId:'ip-b',deviceToken:'valid'})).status,400);
  await db.query("delete from students where id='ip-a'");
  assert.equal(Number((await db.query("select count(*) n from ip_history where student_id='ip-a'")).rows[0].n),0);
  console.log('PASS interview DB/API: 5,434 sources, idempotent import, drafts, ownership, grants/RLS, revisions, feedback, archive, expiry, CSRF and forged actors.');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
