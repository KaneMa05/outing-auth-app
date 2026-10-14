// Opt-in native PostgreSQL 17 test. Uses a fresh disposable database on loopback
// only; never load the application's .env or connect to its Supabase database.
const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const connectionString=process.env.OX_NATIVE_TEST_URL;
test('heavy OX reads do not block device validation; concurrent revocation discards their response',
  {skip:!connectionString,timeout:60000},async()=>{
  const url=new URL(connectionString);
  assert.ok(['127.0.0.1','localhost','[::1]'].includes(url.hostname),'Local fixture server only');
  const {Client}=require(process.env.OX_PG_MODULE||'../.tmp/ox-native-pg/node_modules/pg');
  const admin=new Client({connectionString}),database='ox_read_lock_test_'+process.pid;
  const clients=[];let created=false;
  const read=name=>fs.readFileSync('supabase/migrations/'+name,'utf8').replace(/\r\n/g,'\n');
  const hash=device=>crypto.createHash('sha256').update(device).digest('hex');
  const actor=device=>({type:'student',id:'a',deviceHash:hash(device)});
  try {
    await admin.connect();await admin.query('create database '+database);created=true;
    url.pathname='/'+database;
    for(let i=0;i<3;i++){const client=new Client({connectionString:url.toString()});await client.connect();clients.push(client);}
    const [db,reader,writer]=clients;
    // Roles are cluster-wide; this is an isolated local cluster.
    for(const role of ['anon','authenticated','service_role']) {
      if(!(await db.query('select 1 from pg_roles where rolname=$1',[role])).rowCount)
        await db.query(`create role ${role}${role==='service_role'?' bypassrls':''}`);
    }
    await db.query("create table students(id text primary key,name text default 'fixture',class_name text default 'class',student_category text default 'offline',cohort smallint default 18,account_type text default 'student',is_active boolean default true);grant select on students to service_role;insert into students(id) values('a');");
    await db.query(fs.readFileSync('tests/fixtures/ox-app-devices.sql','utf8'));
    await db.query(fs.readFileSync('supabase/add-student-devices.sql','utf8').replace('create extension if not exists "pgcrypto";',''));
    await db.query('grant select on student_devices to service_role');
    await db.query(fs.readFileSync('tests/fixtures/ox-lecture-identities.sql','utf8'));
    for(const name of ['20260917124608_criminal_law_ox.sql','20260917124623_criminal_law_ox_members.sql','20260920114238_ox_progressive_loading.sql','20260921113944_ox_book_access.sql','20260922044735_ox_member_cohort_filter.sql','20260922044751_ox_device_policy.sql','20260922044806_ox_verified_purchase_required.sql','20260922044821_ox_bulk_access_grants.sql'])await db.query(read(name));
    await db.query(fs.readFileSync('tests/fixtures/ox-exam-subjects.sql','utf8'));
    for(const name of ['20260922060528_ox_grant_recipient_selection.sql','20260922061015_ox_member_track_filter.sql','20260923022213_ox_teacher_learning_access.sql','20260923022226_ox_cumulative_learning_accuracy.sql','20260928071629_ox_entry_summary_and_deferred_statistics.sql','20261001082345_ox_managed_grants_and_fast_preview.sql','20261001090401_ox_pass_only_access.sql','20261013112204_ox_compact_summary_sort.sql'])await db.query(read(name));
    const rpc=async(client,action,device,body={})=>(await client.query('select ox_device_gateway($1,$2::jsonb,$3::jsonb) result',[action,JSON.stringify(actor(device)),JSON.stringify(body)])).rows[0].result;
    const core=async(action,body={})=>db.query('select ox_service($1,$2::jsonb,$3::jsonb)',[action,JSON.stringify({type:'admin',id:'fixture'}),JSON.stringify(body)]);
    const books=['criminal-law','criminal-procedure-trial'];
    await core('admin_import',{collections:books.map((id,i)=>({id,sort_order:i})),chapters:books.map((id,i)=>({id:'c'+i,collection_id:id,sort_order:i})),questions:books.map((_,i)=>({id:'q'+i,chapter_id:'c'+i,prompt:'fixture',context:'',correct_answer:'O',explanation_html:'fixture',source_question_number:String(i),reviewed:true,status:'published'}))});
    await core('admin_enabled',{enabled:true});
    await db.query("insert into ox_members(student_id,allowed,updated_by) values('a',true,'fixture');insert into ox_individual_passes(student_id,collection_id,active,origin,updated_by) select 'a',id,true,'manual','fixture' from ox_collections;");
    for(const device of ['phone','tablet'])await db.query('select register_student_device($1,$2,$3)',['a','fixture-password',hash(device)]);
    await db.query(read('20261014063658_ox_narrow_catalog_and_short_read_locks.sql'));
    // Pause after producing real data so the other connection can revoke access.
    await db.query("alter function ox_learning_data(text,jsonb,jsonb) rename to ox_learning_data_fixture_original");
    await db.query(`create function ox_learning_data(p_action text,p_actor jsonb,p_body jsonb default '{}'::jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$declare result jsonb;begin result:=public.ox_learning_data_fixture_original(p_action,p_actor,p_body);perform pg_sleep(2);return result;end$$;revoke all on function ox_learning_data(text,jsonb,jsonb) from public,anon,authenticated;grant execute on function ox_learning_data(text,jsonb,jsonb) to service_role;`);
    await reader.query('set role service_role');
    await writer.query("set statement_timeout='700ms'");
    const readerPid=(await reader.query('select pg_backend_pid() pid')).rows[0].pid;
    for(const scenario of ['validate','revoke','takeover','pass']) {
      await db.query("update student_devices set revoked_at=null where student_id='a';delete from ox_device_sessions where student_id='a';update ox_individual_passes set active=true where student_id='a'");
      const sessionId=(await rpc(db,'device_start','phone')).sessionId;
      const pending=rpc(reader,'bootstrap','phone',{sessionId,summaryOnly:true,deferStatistics:true})
        .then(value=>({value}),error=>({error}));
      const deadline=Date.now()+5000;let paused=false;
      while(Date.now()<deadline) {
        const activity=(await db.query('select wait_event from pg_stat_activity where pid=$1',[readerPid])).rows[0];
        if(activity?.wait_event==='PgSleep'){paused=true;break;}
        await new Promise(resolve=>setTimeout(resolve,20));
      }
      assert.ok(paused,'Reader must reach expensive read before the mutation');
      assert.equal((await db.query("select count(*)::int n from pg_locks where pid=$1 and locktype='advisory'",[readerPid])).rows[0].n,0);
      const started=performance.now();
      if(scenario==='validate') {
        const checked=(await writer.query('select validate_student_device($1,$2) result',['a',hash('phone')])).rows[0].result;
        assert.equal(checked.valid,true);
      } else if(scenario==='takeover') {
        await rpc(writer,'device_start','tablet',{takeover:true,expectedSessionId:sessionId});
      } else {
        await writer.query('begin');
        await writer.query("select pg_advisory_xact_lock(hashtext('a')::bigint)");
        await writer.query(scenario==='revoke'
          ? "update student_devices set revoked_at=now() where student_id='a' and device_token_hash='"+hash('phone')+"'"
          : "update ox_individual_passes set active=false where student_id='a' and collection_id='criminal-law'");
        await writer.query('commit');
      }
      const elapsed=performance.now()-started;
      const result=await pending;
      if(scenario==='validate')assert.equal(result.value?.ok,true);
      else assert.match(result.error?.message||'',scenario==='revoke'?/unauthorized/:scenario==='takeover'?/device_session_changed/:/ox_book_required/);
      console.log(`${scenario}: concurrent operation ${elapsed.toFixed(1)}ms during a 2000ms read; response ${result.error?'blocked':'valid'}`);
    }
    // Detail takes a question row lock internally. Assert the device lock is
    // already held at that call, avoiding inverted lock order with submissions.
    await db.query("update ox_individual_passes set active=true where student_id='a'");
    const sessionId=(await rpc(db,'device_start','phone')).sessionId;
    await rpc(db,'submit','phone',{sessionId,questionId:'q0',version:1,answer:'X',submissionId:crypto.randomUUID()});
    await db.query('alter function ox_service(text,jsonb,jsonb) rename to ox_service_fixture_original');
    await db.query(`create function ox_service(p_action text,p_actor jsonb,p_body jsonb default '{}'::jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$begin
      if p_action='detail' and not exists(select 1 from pg_catalog.pg_locks where pid=pg_backend_pid() and locktype='advisory' and granted and mode='ExclusiveLock') then raise exception 'inverted_detail_lock_order';end if;
      return public.ox_service_fixture_original(p_action,p_actor,p_body);end$$;
      revoke all on function ox_service(text,jsonb,jsonb) from public,anon,authenticated;grant execute on function ox_service(text,jsonb,jsonb) to service_role;`);
    assert.equal((await rpc(reader,'detail','phone',{sessionId,questionId:'q0',version:1,includeStatistics:true})).ok,true);
  } finally {
    for(const client of clients){await client.query('rollback').catch(()=>{});await client.end();}
    if(created)await admin.query('drop database '+database);
    await admin.end();
  }
});
