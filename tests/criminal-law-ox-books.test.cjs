const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const crypto=require('node:crypto');
const {PGlite}=require(process.env.OX_PGLITE_MODULE || 'C:/Users/Public/Documents/ESTsoft/CreatorTemp/ox-db-tools/node_modules/@electric-sql/pglite');
const {validate}=require('../api/criminal-law-ox')._private;
const {createHandler}=require('../api/criminal-law-ox');
const auth=require('../api/teacher-auth-utils');
const books=['criminal-law','criminal-procedure-investigation-evidence','criminal-procedure-trial'];
const migration='supabase/migrations/20260921113944_ox_book_access.sql';

test('book scopes: all eight purchase combinations, legacy preservation, both loaders, writes, revocation, history and role isolation',async()=>{
  const db=new PGlite();
  const admin={type:'admin',id:'admin'},student=id=>({type:'student',id});
  const invoke=async(fn,action,actor,body={})=>(await db.query(`select ${fn}($1,$2::jsonb,$3::jsonb) result`,[action,JSON.stringify(actor),JSON.stringify(body)])).rows[0].result;
  const call=(action,actor=admin,body={})=>invoke('ox_service',action,actor,body);
  const lazy=(action,actor,body={})=>invoke('ox_learning_data',action,actor,body);
  const grant=(id,ids,revision=0,active=true)=>call('admin_book_set',admin,{memberId:id,collectionIds:ids,revision,active,purchaseDate:'2026-01-01',reason:'구매 확인'});
  const answer=(id,i)=>call('submit',student(id),{questionId:'q'+i,version:1,answer:'X',submissionId:crypto.randomUUID()});
  try {
    await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create table students(id text primary key,name text default '학생',class_name text default '반',student_category text default 'offline',cohort smallint,account_type text default 'student',is_active boolean default true);grant select on students to service_role;insert into students(id) values('legacy'),('revoked'),('inactive'),('teacher');update students set is_active=false where id='inactive';update students set account_type='teacher' where id='teacher';insert into students(id) select 's'||i from generate_series(0,7)i;");
    for(const file of ['20260917124608_criminal_law_ox.sql','20260917124623_criminal_law_ox_members.sql','20260920114238_ox_progressive_loading.sql']) await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
    await call('admin_import',admin,{collections:books.map((id,i)=>({id,sort_order:i+1,scope:id})),chapters:books.map((id,i)=>({id:'c'+i,collection_id:id,sort_order:i+1})),questions:books.map((id,i)=>({id:'q'+i,chapter_id:'c'+i,prompt:'문제 '+i,context:'',correct_answer:'O',explanation_html:'해설 '+i,source_question_number:'1',reviewed:true,status:'published'}))});
    await call('admin_member_set',admin,{memberId:'legacy',allowed:true});
    await call('admin_member_set',admin,{memberId:'revoked',allowed:false});
    await call('admin_enabled',admin,{enabled:true});
    await answer('legacy',2);
    await call('note',student('legacy'),{questionId:'q2',version:1,memo:'보존 메모',bookmark:true});
    await db.exec(fs.readFileSync(migration,'utf8'));
    await db.exec(fs.readFileSync('tests/fixtures/ox-lecture-identities.sql','utf8'));
    await db.exec(fs.readFileSync('supabase/migrations/20260922044735_ox_member_cohort_filter.sql','utf8'));
    await db.exec('set role service_role');
    assert.equal((await call('bootstrap',student('legacy'))).catalog.questions.length,3);
    assert.equal((await call('bootstrap',student('legacy'))).notes[0].has_memo,true);
    assert.equal((await db.query("select count(*)::int n from ox_book_access where student_id='revoked'")).rows[0].n,0);
    await assert.rejects(call('admin_member_set',admin,{memberId:'s0',allowed:true}),/book_selection_required/);
    for(let mask=0;mask<8;mask++) {
      const id='s'+mask,allowed=books.filter((_,i)=>mask&(1<<i));
      if(allowed.length) await grant(id,allowed);
      assert.equal((await call('status',student(id))).enabled,!!mask);
      if(!mask) {await assert.rejects(call('bootstrap',student(id)),/ox_not_registered/);continue;}
      await assert.rejects(grant(id,allowed,1),/book_already_active/);
      for(const loader of [call,lazy]) {
        const result=await loader('bootstrap',student(id));
        assert.deepEqual(result.catalog.collections.filter(c=>c.accessible).map(c=>c.id),allowed);
        assert.equal(result.catalog.chapters.length,allowed.length);
        assert.deepEqual(result.catalog.questions.map(q=>q.id),books.flatMap((_,i)=>mask&(1<<i)?['q'+i]:[]));
        assert.deepEqual(result.progress,[]);assert.deepEqual(result.notes,[]);
      }
      for(let i=0;i<3;i++) {
        if(mask&(1<<i)) {await answer(id,i);continue;}
        for(const action of ['detail','submit','note']) await assert.rejects(call(action,student(id),{questionId:'q'+i,version:1,answer:'O',submissionId:crypto.randomUUID(),memo:'forged',collectionId:allowed[0]}),/ox_book_required/);
        const own=books.findIndex(b=>allowed.includes(b));
        await assert.rejects(lazy('questions',student(id),{questions:[{id:'q'+own,version:1},{id:'q'+i,version:1}]}),/ox_book_required/);
      }
    }
    await grant('s1',[books[2]],1);
    assert.equal((await lazy('bootstrap',student('s1'))).catalog.questions.length,2);
    await answer('s1',2);
    await call('note',student('s1'),{questionId:'q2',version:1,memo:'다시 보일 메모',bookmark:true});
    await assert.rejects(grant('s1',[books[0]],1,false),/access_conflict/);
    await grant('s1',[books[2]],2,false);
    for(const loader of [call,lazy]) {
      const scoped=await loader('bootstrap',student('s1'));
      assert.deepEqual(scoped.catalog.questions.map(q=>q.id),['q0']);
      assert.deepEqual(scoped.progress.map(q=>q.question_id),['q0']);
      assert.deepEqual(scoped.notes,[]);assert.deepEqual(Object.keys(scoped.statistics),['q0']);
      assert.equal(scoped.todayCount,1);
    }
    await assert.rejects(answer('s1',2),/ox_book_required/);
    await grant('s1',[books[2]],3);
    assert.equal((await call('detail',student('s1'),{questionId:'q2',version:1})).note.memo,'다시 보일 메모');
    await grant('s1',[books[0],books[2]],4,false);
    assert.equal((await call('status',student('s1'))).enabled,false);
    assert.equal((await call('status',student('s1'))).hasAccessHistory,true);
    await assert.rejects(lazy('bootstrap',student('s1')),/ox_book_required/);
    const history=await call('admin_member_history',admin,{memberId:'s1'});
    assert.equal(history.history.length,6);
    assert.ok(history.history.every(h=>h.reason==='구매 확인'&&h.actor==='admin'));
    await assert.rejects(call('admin_book_set',student('s0'),{memberId:'s0'}),/forbidden/);
    for(const id of ['inactive','teacher','missing']) await assert.rejects(grant(id,[books[0]]),/student_unavailable/);
    for(const ids of [[],['bad'],[null],[books[0],books[0]]]) await assert.rejects(grant('s0',ids),/invalid_request/);
    const filtered=await call('admin_members',admin,{collectionId:books[0],bookStatus:'stopped'});
    assert.ok(filtered.items.some(s=>s.id==='s1'));
    await call('admin_member_set',admin,{memberId:'s2',allowed:false,revision:1});
    await grant('s2',[books[0]],2);
    assert.equal((await call('status',student('s2'))).enabled,false,'Purchasing cannot lift an explicit whole-account suspension');
    await call('admin_member_set',admin,{memberId:'s2',allowed:true,revision:3});
    assert.equal((await call('status',student('s2'))).enabled,true);
    for(const role of ['anon','authenticated']) {
      await db.exec('reset role;set role '+role);
      for(const table of ['ox_book_access','ox_book_access_history']) await assert.rejects(db.query('select * from '+table),/permission denied/);
      await assert.rejects(db.query("select ox_has_book('s1','criminal-law')"),/permission denied/);
      await assert.rejects(call('admin_book_set',admin,{}),/permission denied/);
    }
  } finally {await db.close();}
});

test('book API rejects malformed grants and requires write permission',async()=>{
  const valid={action:'admin_book_set',memberId:'s',collectionIds:[books[0]],active:true,purchaseDate:'2026-01-01',reason:'판매 확인',revision:0};
  assert.doesNotThrow(()=>validate(valid));
  for(const change of [{collectionIds:[]},{collectionIds:[books[0],books[0]]},{collectionIds:['unknown']},{revision:-1},{revision:0.5},{reason:''},{purchaseDate:'2026-02-30'},{purchaseDate:'9999-01-01'},{active:'true'},{memberId:''}]) assert.throws(()=>validate({...valid,...change}),/invalid_request/);
  process.env.TEACHER_SESSION_SECRET='ox-books-test';
  const calls=[];
  const handler=createHandler({invoke:async(...args)=>{calls.push(args);return {ok:true};}});
  const request=async(body,permissions)=>{
    let status,result;
    const token=auth.createSessionToken(process.env.TEACHER_SESSION_SECRET,{username:'teacher',role:'teacher',permissions});
    await handler({method:'POST',headers:{host:'localhost',cookie:auth.COOKIE_NAME+'='+token},body},{setHeader(){},status(v){status=v;return this;},json(v){result=v;}});
    return {status,result};
  };
  assert.equal((await request(valid,['criminal_ox.read'])).status,403);
  assert.equal(calls.length,0);
  assert.equal((await request(valid,['criminal_ox.write'])).status,200);
  assert.equal((await request({action:'admin_member_history',memberId:'s'},['criminal_ox.read'])).status,200);
});
