const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {PGlite}=require(process.env.OX_PGLITE_MODULE||'C:/Users/Public/Documents/ESTsoft/CreatorTemp/ox-db-tools/node_modules/@electric-sql/pglite');
const {createHandler,_private:{invokeLearning}}=require('../api/criminal-law-ox');
const migration='20260928071629_ox_entry_summary_and_deferred_statistics.sql';

test('atomic summary entry, deferred data/stats and legacy behavior preserve records and security',async()=>{
  const db=new PGlite(),admin={type:'admin',id:'qa'};
  const actor=(id,device='phone')=>({type:'student',id,deviceHash:crypto.createHash('sha256').update(device).digest('hex')});
  const rpc=async(action,who,body={})=>(await db.query('select ox_device_gateway($1,$2::jsonb,$3::jsonb) result',[action,JSON.stringify(who),JSON.stringify(body)])).rows[0].result;
  const core=async(action,body={})=>(await db.query('select ox_service($1,$2::jsonb,$3::jsonb) result',[action,JSON.stringify(admin),JSON.stringify(body)])).rows[0].result;
  const learn=(action,body={})=>rpc(action,actor('a'),body);
  const read=name=>fs.readFileSync('supabase/migrations/'+name,'utf8');
  try{
    await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create table students(id text primary key,name text default '학생',class_name text default '반',student_category text default 'offline',cohort smallint default 18,account_type text default 'student',is_active boolean default true);grant select on students to service_role;insert into students(id) values('a'),('b'),('nonbuyer');insert into students(id,account_type) values('teacher','teacher');");
    await db.exec(fs.readFileSync('tests/fixtures/ox-app-devices.sql','utf8'));
    await db.exec(fs.readFileSync('supabase/add-student-devices.sql','utf8').replace('create extension if not exists "pgcrypto";',''));
    await db.exec('grant select on student_devices to service_role');
    await db.exec(fs.readFileSync('tests/fixtures/ox-lecture-identities.sql','utf8'));
    for(const name of ['20260917124608_criminal_law_ox.sql','20260917124623_criminal_law_ox_members.sql','20260920114238_ox_progressive_loading.sql','20260921113944_ox_book_access.sql','20260922044735_ox_member_cohort_filter.sql','20260922044751_ox_device_policy.sql','20260922044806_ox_verified_purchase_required.sql','20260922044821_ox_bulk_access_grants.sql'])await db.exec(read(name));
    await db.exec(fs.readFileSync('tests/fixtures/ox-exam-subjects.sql','utf8'));
    for(const name of ['20260922060528_ox_grant_recipient_selection.sql','20260922061015_ox_member_track_filter.sql','20260923022213_ox_teacher_learning_access.sql','20260923022226_ox_cumulative_learning_accuracy.sql'])await db.exec(read(name));
    const books=['criminal-law','criminal-procedure-trial'];
    await core('admin_import',{collections:books.map((id,i)=>({id,sort_order:i})),chapters:books.map((id,i)=>({id:'c'+i,collection_id:id,sort_order:i})),questions:Array.from({length:6},(_,i)=>({id:'q'+i,chapter_id:i===5?'c1':'c0',prompt:'질문'+i,context:'',correct_answer:'O',explanation_html:'해설',source_question_number:String(i),reviewed:true,status:'published'}))});
    await core('admin_enabled',{enabled:true});
    for(const id of ['a','b','nonbuyer','teacher'])await db.query('select register_student_device($1,$2,$3)',[id,'fixture-password',actor(id).deviceHash]);
    await db.query('select register_student_device($1,$2,$3)',['a','fixture-password',actor('a','tablet').deviceHash]);
    for(const memberId of ['a','b'])await core('admin_book_set',{memberId,collectionIds:books,active:true,revision:0,purchaseDate:'2026-01-01',reason:'구매'});
    let sessionId=(await learn('device_start')).sessionId;
    const submit=(questionId,answer='X',who='a',session=sessionId)=>rpc('submit',actor(who),{sessionId:session,questionId,version:1,answer,submissionId:crypto.randomUUID()});
    for(let i=0;i<6;i++)await submit('q'+i);
    await submit('q1','O'); // corrected, not pending
    await learn('note',{sessionId,questionId:'q2',version:1,mastered:true}); // completed
    await db.exec("update ox_questions set content_version=2 where id='q3';update ox_questions set status='archived' where id='q4';");
    await core('admin_book_set',{memberId:'a',collectionIds:[books[1]],active:false,revision:1,reason:'중지'});
    const bs=(await rpc('device_start',actor('b'))).sessionId;
    const ts=(await rpc('device_start',actor('teacher'))).sessionId;
    await submit('q0','O','b',bs);await submit('q0','O','teacher',ts);
    const before=await learn('bootstrap',{sessionId,summaryOnly:true});
    const records=(await db.query('select * from ox_progress order by student_id,question_id')).rows;
    await db.exec(read(migration));
    assert.deepEqual((await db.query('select * from ox_progress order by student_id,question_id')).rows,records);
    await db.exec('set role service_role');
    const after=await learn('bootstrap',{sessionId,summaryOnly:true});
    const {statisticsDeferred,...legacy}=after;
    assert.equal(statisticsDeferred,false);assert.deepEqual(legacy,before,'Old bootstrap content remains identical');
    const entry=await learn('device_start',{includeBootstrap:true,homeOnly:true});
    assert.equal(entry.sessionId,sessionId);assert.equal(entry.bootstrap.home.reviewCount,1);
    assert.equal(entry.bootstrap.todayCount,before.todayCount);assert.deepEqual(entry.bootstrap.catalog.questions,[]);
    assert.deepEqual(entry.bootstrap.progress,[]);assert.equal(entry.bootstrap.attemptCounts,undefined);
    assert.equal((await learn('device_start')).bootstrap,undefined,'Old start response remains unchanged');
    const deferred=await learn('bootstrap',{sessionId,summaryOnly:true,deferStatistics:true});
    assert.deepEqual(deferred.catalog,after.catalog);assert.deepEqual(deferred.progress,after.progress);assert.deepEqual(deferred.notes,after.notes);
    assert.deepEqual(deferred.statistics,{});assert.deepEqual(deferred.attemptCounts,{});assert.equal(deferred.statisticsDeferred,true);
    assert.deepEqual((await learn('attempt_counts',{sessionId})).attemptCounts,before.attemptCounts);
    const detail=await learn('detail',{sessionId,questionId:'q0',version:1,includeStatistics:true});
    assert.deepEqual(detail.statistics,before.statistics.q0);assert.equal(detail.statistics.answered,2,'Teacher practice never enters student statistics');
    await assert.rejects(learn('detail',{sessionId,questionId:'q3',version:2,includeStatistics:true}),/answer_required/);
    await assert.rejects(learn('detail',{sessionId,questionId:'q5',version:1,includeStatistics:true}),/ox_book_required|question_unavailable/);
    await assert.rejects(learn('attempt_counts',{sessionId:crypto.randomUUID()}),/device_session_changed/);
    await assert.rejects(rpc('device_start',actor('nonbuyer'),{includeBootstrap:true,homeOnly:true}),/ox_not_registered/);
    const teacher=await rpc('device_start',actor('teacher'),{includeBootstrap:true,homeOnly:true});assert.equal(teacher.bootstrap.homeOnly,true);

    // API -> database remains exactly one RPC, including bootstrap compaction.
    let calls=0;
    const handler=createHandler({authenticate:async()=>({id:'a'}),sessionSecret:()=>'',invoke:(action,who,body)=>invokeLearning(action,who,body,async(method,path,args)=>{
      calls++;assert.equal(path,'rpc/ox_device_gateway');return rpc(args.p_action,args.p_actor,args.p_body);
    })});
    const res={setHeader(){},status(n){this.code=n;return this;},json(v){this.data=v;}};
    await handler({method:'POST',headers:{host:'localhost'},body:{action:'device_start',studentId:'a',deviceToken:'phone',includeBootstrap:true,homeOnly:true}},res);
    assert.equal(res.code,200);assert.equal(calls,1);assert.equal(res.data.bootstrap.home.reviewCount,1);
    await assert.rejects(rpc('device_start',actor('a','tablet'),{includeBootstrap:true,homeOnly:true}),/device_in_use/);
    const switched=await rpc('device_start',actor('a','tablet'),{includeBootstrap:true,homeOnly:true,takeover:true,expectedSessionId:sessionId});
    assert.equal(switched.bootstrap.home.reviewCount,1);
    await assert.rejects(learn('attempt_counts',{sessionId}),/device_session_changed/);
    sessionId=(await learn('device_start',{takeover:true,expectedSessionId:switched.sessionId})).sessionId;

    // A bootstrap failure must also roll back a takeover; test in a nested transaction.
    await db.exec('reset role');
    await db.exec('begin');
    await db.exec("create or replace function ox_learning_data(p_action text,p_actor jsonb,p_body jsonb default '{}'::jsonb) returns jsonb language plpgsql as $$begin raise exception 'fixture_bootstrap_failure';end$$;");
    await assert.rejects(rpc('device_start',actor('a','tablet'),{includeBootstrap:true,homeOnly:true,takeover:true,expectedSessionId:sessionId}),/fixture_bootstrap_failure/);
    await db.exec('rollback');
    assert.equal((await learn('device_state')).activeSessionId,sessionId);

    // A representative question count proves the initial response no longer grows with the catalog.
    await db.exec("insert into ox_questions(id,chapter_id,entry,status,reviewed) select 'scale-'||n,'c0',jsonb_build_object('id','scale-'||n,'chapter_id','c0','prompt','fixture','correct_answer','O','source_question_number',n::text),'published',true from generate_series(1,2500)n;");
    const full=await learn('bootstrap',{sessionId,summaryOnly:true});
    const tiny=(await learn('device_start',{includeBootstrap:true,homeOnly:true})).bootstrap;
    assert.ok(Buffer.byteLength(JSON.stringify(tiny))*50<Buffer.byteLength(JSON.stringify(full)));
    const measurements={questions:full.catalog.questions.length,fullBytes:Buffer.byteLength(JSON.stringify(full)),homeBytes:Buffer.byteLength(JSON.stringify(tiny)),plans:{}};
    for(const [label,body] of [['full',{sessionId,summaryOnly:true}],['deferred',{sessionId,summaryOnly:true,deferStatistics:true}],['home',{sessionId,summaryOnly:true,homeOnly:true}]]){
      const result=await db.query('explain (analyze,buffers,format json) select ox_device_gateway($1,$2::jsonb,$3::jsonb)',['bootstrap',JSON.stringify(actor('a')),JSON.stringify(body)]);
      measurements.plans[label]=result.rows[0]['QUERY PLAN'][0]['Execution Time'];
    }
    fs.mkdirSync('.tmp/ox-entry-performance',{recursive:true});fs.writeFileSync('.tmp/ox-entry-performance/measurements.json',JSON.stringify(measurements,null,2));
    console.log('Synthetic local comparison:',JSON.stringify(measurements));
    // Aggregate statistics can be unavailable without blocking either home or catalog.
    await db.exec('begin');
    await db.exec("create or replace function ox_attempt_counts(p_student text,p_question text default null) returns jsonb language plpgsql as $$begin raise exception 'fixture_counts_failure';end$$;");
    assert.equal((await learn('device_start',{includeBootstrap:true,homeOnly:true})).bootstrap.homeOnly,true);
    assert.equal((await learn('bootstrap',{sessionId,summaryOnly:true,deferStatistics:true})).statisticsDeferred,true);
    await assert.rejects(learn('attempt_counts',{sessionId}),/fixture_counts_failure/);await db.exec('rollback');
    for(const role of ['anon','authenticated']){
      await db.exec('set role '+role);await assert.rejects(learn('attempt_counts',{sessionId}),/permission denied/);
      await assert.rejects(db.query('select ox_attempt_counts($1)',['a']),/permission denied/);
      await assert.rejects(db.query("select ox_learning_data('bootstrap',$1::jsonb,$2::jsonb)",[JSON.stringify(actor('a')),JSON.stringify({homeOnly:true})]),/permission denied/);
      await db.exec('reset role');
    }
    const security=(await db.query("select bool_and(not prosecdef and proconfig @> array['search_path=\"\"']) safe from pg_proc where oid in ('ox_device_gateway(text,jsonb,jsonb)'::regprocedure,'ox_learning_data(text,jsonb,jsonb)'::regprocedure,'ox_attempt_counts(text,text)'::regprocedure)")).rows[0];assert.equal(security.safe,true);
    await db.exec("update student_devices set revoked_at=now() where student_id='a'");
    await assert.rejects(learn('device_start',{includeBootstrap:true,homeOnly:true}),/unauthorized/);
  }finally{await db.close();}
});
