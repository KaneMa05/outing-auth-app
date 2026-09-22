const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {PGlite}=require(process.env.OX_PGLITE_MODULE || 'C:/Users/Public/Documents/ESTsoft/CreatorTemp/ox-db-tools/node_modules/@electric-sql/pglite');
const {validate}=require('../api/criminal-law-ox')._private;

test('cohorts intersect existing filters before pagination and follow the roster rule',async()=>{
  const db=new PGlite(),admin={type:'admin',id:'admin'};
  const call=async(action,body={},actor=admin)=>(await db.query('select ox_service($1,$2::jsonb,$3::jsonb) result',[action,JSON.stringify(actor),JSON.stringify(body)])).rows[0].result;
  const list=body=>call('admin_members',{registeredOnly:false,...body});
  try {
    await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create table students(id text primary key,name text default '학생',class_name text default '반',student_category text default 'offline',cohort smallint,account_type text default 'student',is_active boolean default true);grant select on students to service_role;");
    for(const file of ['20260917124608_criminal_law_ox.sql','20260917124623_criminal_law_ox_members.sql','20260920114238_ox_progressive_loading.sql','20260921113944_ox_book_access.sql','20260922044735_ox_member_cohort_filter.sql']) await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
    await db.exec("insert into students(id,name,cohort) select 's'||i,'학생'||lpad(i::text,2,'0'),18 from generate_series(1,35)i;insert into students(id,cohort) values('18001',17),('17002',null),('unassigned',null),('inactive',19),('teacher',20);update students set is_active=false where id='inactive';update students set account_type='teacher' where id='teacher';insert into students(id,student_category,cohort) values('21001','lecture',21),('managed','online_managed',18),('pending','online_managed',null);");
    await db.exec(fs.readFileSync('tests/fixtures/ox-lecture-identities.sql','utf8'));
    await db.exec("insert into lecture_applications(approved_student_id,status,lecture_id) values('s1','approved','RonPark_01'),('s2','pending','pending-id'),('s2','rejected','rejected-id'),('s2','cancelled','cancelled-id'),('s3','approved','<b>private</b>'),('21001','approved','LectureUser');insert into final_score_identities(cohort,student_id,lecture_id_normalized) values('18','s1','ronpark_01'),('17','s1','another-id'),('18','s2','score-only'),('18',null,'external-only');");
    await db.exec('set role service_role');
    for(const search of ['RONPARK','ronpark_01','ＲｏｎＰａｒｋ',' ron park_01 ']) {
      const found=await list({search,cohort:'18'});assert.equal(found.total,1);assert.equal(found.items[0].id,'s1');
      assert.deepEqual(found.items[0].lecture_ids,['another-id','RonPark_01']);
    }
    assert.equal((await list({search:'another-id'})).items[0].id,'s1');
    assert.equal((await list({search:'score-only'})).items[0].id,'s2');
    assert.equal((await list({search:'LECTUREUSER',cohort:'lecture'})).items[0].id,'21001');
    for(const search of ['pending-id','rejected-id','cancelled-id','external-only']) assert.equal((await list({search})).total,0);
    assert.equal((await list({search:'ronpark',cohort:'17'})).total,0);
    assert.deepEqual((await list({search:'17002'})).items[0].lecture_ids,[]);
    let result=await list({cohort:'18'});
    assert.equal(result.total,36);assert.equal(result.items.length,30);
    assert.deepEqual(result.cohorts,['18','17']);
    assert.ok(result.items.every(s=>s.cohort==='18'));
    const next=await list({cohort:'18',page:1});
    assert.equal(next.total,36);assert.equal(next.items.length,6);
    assert.equal(new Set([...result.items,...next.items].map(s=>s.id)).size,36);
    assert.deepEqual((await list({cohort:'17'})).items.map(s=>s.id),['17002','18001']);
    result=await list({cohort:'lecture'});assert.equal(result.total,1);assert.equal(result.items[0].cohort,null);
    assert.equal((await list({cohort:'21'})).total,0);
    assert.deepEqual((await list({cohort:'unassigned'})).items.map(s=>s.id),['pending','unassigned']);
    assert.equal((await list({cohort:'18',search:'학생01'})).total,1);
    assert.equal((await list({cohort:'17',search:'18001'})).total,1);
    result=await list({cohort:'17',search:'학생01'});assert.equal(result.total,0);assert.deepEqual(result.cohorts,['18','17']);
    assert.equal((await call('admin_members',{cohort:'18'})).total,0);
    await call('admin_import',{collections:[{id:'criminal-law',sort_order:1}],chapters:[],questions:[]});
    await call('admin_book_set',{memberId:'s1',collectionIds:['criminal-law'],active:true,revision:0,purchaseDate:'2026-01-01',reason:'확인'});
    const before=await call('admin_member_history',{memberId:'s1'});
    assert.equal((await call('admin_members',{cohort:'18'})).total,1);
    assert.equal((await list({cohort:'18',search:'RONPARK',collectionId:'criminal-law',bookStatus:'active'})).total,1);
    assert.equal((await list({cohort:'17',collectionId:'criminal-law',bookStatus:'active'})).total,0);
    assert.deepEqual(await call('admin_member_history',{memberId:'s1'}),before,'Filtering never changes access history');
    await call('admin_book_set',{memberId:'s1',collectionIds:['criminal-law'],active:false,revision:1,reason:'중지'});
    assert.equal((await list({cohort:'18',search:'RONPARK',collectionId:'criminal-law',bookStatus:'active'})).total,0);
    assert.equal((await list({cohort:'18',search:'RONPARK',collectionId:'criminal-law',bookStatus:'stopped'})).total,1);
    await assert.rejects(call('admin_members',{cohort:'18'},{type:'student',id:'s1'}),/forbidden/);
    for(const cohort of [null,18,{},[],true,'100','18기',"18' OR true --"]){
      assert.throws(()=>validate({action:'admin_members',cohort}),/invalid_request/);
      await assert.rejects(list({cohort}),/invalid_request/);
    }
    for(const cohort of ['','18','17','lecture','unassigned']) assert.doesNotThrow(()=>validate({action:'admin_members',cohort}));
    await db.exec('set role anon');await assert.rejects(list({cohort:'18'}),/permission denied/);
  } finally {await db.close();}
});

test('migration changes only the administrator member-list branch',()=>{
  const old=fs.readFileSync('supabase/migrations/20260921113944_ox_book_access.sql','utf8').replace(/\r\n/g,'\n');
  const current=fs.readFileSync('supabase/migrations/20260922044735_ox_member_cohort_filter.sql','utf8').replace(/\r\n/g,'\n');
  const strip=s=>s.slice(s.indexOf('create or replace function public.ox_service')).replace(/  if p_action='admin_members' then[\s\S]*?(?=  if p_action='admin_member_history' then)/,'').trimEnd();
  assert.equal(strip(current),strip(old.slice(0,old.indexOf('create or replace function public.ox_learning_data'))));
});
