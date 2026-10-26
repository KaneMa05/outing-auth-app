const assert=require('node:assert/strict');
const {createDb}=require('./helpers/interview-db.cjs');
const admin={type:'admin',id:'qa'};
(async()=>{
  const {db,invoke}=await createDb();
  try{
    const read=body=>invoke('admin_applications',admin,body);
    assert.deepEqual((await read()).summary,{students:0,pending:0,approved:0,rejected:0});
    await db.exec(`insert into ip_owners(id,name) select 'summary-'||n,'신청자 '||n from generate_series(1,35) n;
      insert into ip_applications(owner_id,name,track,exam_number)
      select id,name,'공채',id from ip_owners where id like 'summary-%';`);
    const first=await read({status:'pending'});
    assert.equal(first.applications.length,30);
    assert.deepEqual(first.summary,{students:0,pending:35,approved:0,rejected:0});
    assert.deepEqual((await read({search:'검색 결과 없음',status:'approved',page:8})).summary,first.summary);
    const [approved,rejected]=first.applications;
    await invoke('admin_application_decide',admin,{id:approved.id,revision:1,status:'approved'});
    await invoke('admin_application_decide',admin,{id:rejected.id,revision:1,status:'rejected',reviewNote:'수강 등록 확인 필요'});
    assert.deepEqual((await read()).summary,{students:1,pending:33,approved:1,rejected:1});
    for(const id of ['ip-a','ip-b','ip-c'])await invoke('admin_member_save',admin,{targetStudentId:id,track:'공채',examNumber:id,enabled:true});
    await db.exec("update ip_members set enabled=false where student_id='ip-a'; update ip_members set expires_on=current_date-1 where student_id='ip-b'; update students set is_active=false where id='ip-c';");
    assert.equal((await read()).summary.students,1,'Stopped, expired and inactive members are excluded');
    await db.exec("update students set is_active=true,account_type='teacher' where id='ip-c'; update ip_members set expires_on=current_date where student_id='ip-b';");
    assert.equal((await read()).summary.students,2,'Expiry today is inclusive; non-student accounts are excluded');
    await db.query('update ip_owners set active=false where id=$1',[approved.owner_id]);
    assert.equal((await read()).summary.students,1,'Inactive interview-only owners are excluded');
    await assert.rejects(invoke('admin_applications',{type:'student',id:'ip-b'}),/forbidden/);
    for(const role of ['anon','authenticated']){
      await db.exec('set role '+role);
      await assert.rejects(read(),/permission denied/);
      await db.exec('reset role');
    }
    await db.exec('set role service_role');
    assert.equal((await read()).summary.pending,33);
    console.log('PASS application summary: full counts across filters/pages, approval/rejection refresh, active membership and unchanged access controls');
  }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
