const assert=require('node:assert/strict');
const {summarize,overview}=require('../lib/interview-assignment-overview.cjs');
const {createHandler}=require('../api/interview-prep');
const auth=require('../api/teacher-auth-utils');
(async()=>{
 const student={id:'one',name:'학생',enabled:true,is_active:true};
 let row=summarize(student,{content:{basicInfo:{major:{none:true}},experiences:[]}},[{kind:'introduction',body:'원문은 응답에 없어야 함'},{kind:'motivation',body:'',submitted_at:'2026-10-27'}],[{unit_id:'core-01',revision:1,latest_id:'submission'},{unit_id:'other',revision:1,latest_id:'old'}]);
 assert.equal(row.basic,'saved');assert.equal(row.life,'empty');assert.equal(row.introduction.status,'saved');assert.equal(row.motivation.status,'submitted');assert.equal(row.public_service.status,'empty');assert.deepEqual(row.core,{saved:1,submitted:1,total:25});assert(!JSON.stringify(row).includes('원문'));
 row=summarize(student,{content:{experiences:[{title:'경험'}]}},[],[]);assert.equal(row.basic,'empty');assert.equal(row.life,'saved');
 let queries=0;
 const invoke=async(action,actor,body)=>{assert.equal(action,'admin_review_students');assert.equal(body.page,1);return {students:[student],total:31,pageSize:30};};
 const read=async(method,path)=>{queries++;assert.equal(method,'GET');assert(path.includes('student_id=in.'));return [];};
 const data=await overview({page:1},{type:'admin'},invoke,read);assert.equal(queries,3);assert.equal(data.students.length,1);assert.equal(data.total,31);
 const old=process.env.TEACHER_SESSION_SECRET;process.env.TEACHER_SESSION_SECRET='assignment-overview-test';
 try{
  queries=0;const handler=createHandler({invoke,read});
  async function call(user){let status,data;const token=user?auth.createSessionToken(process.env.TEACHER_SESSION_SECRET,user):'';await handler({method:'POST',body:{action:'admin_assignment_overview',page:1},headers:{host:'local',origin:'http://local',cookie:auth.COOKIE_NAME+'='+token}},{setHeader(){},status(n){status=n;return this;},json(d){data=d;}});return {status,data};}
  assert.equal((await call(null)).status,401);
  assert.equal((await call({username:'student',role:'teacher',permissions:['interview.read']})).status,403);assert.equal(queries,0);
  assert.equal((await call({username:'reader',role:'admin',permissions:['interview.read']})).status,200);assert.equal(queries,3);
 }finally{if(old===undefined)delete process.env.TEACHER_SESSION_SECRET;else process.env.TEACHER_SESSION_SECRET=old;}
 const {db,invoke:dbInvoke}=await require('./helpers/interview-db.cjs').createDb();
 try{
  await db.exec(require('fs').readFileSync('supabase/migrations/20261023064604_interview_preassignments.sql','utf8'));
  const actor={type:'admin',id:'overview-test'};
  await dbInvoke('admin_member_save',actor,{targetStudentId:'ip-a',track:'공채',examNumber:'OV-1',enabled:true});
  await db.query('insert into ip_life_profiles(student_id,content,status) values($1,$2,$3)',['ip-a',JSON.stringify({background:'이력',experiences:[]}),'draft']);
  await db.exec('set role service_role');
  const live=await overview({},actor,dbInvoke,async(method,path)=>{
   const [table,query]=path.split('?');const params=new URLSearchParams(query);
   assert(['ip_life_profiles','ip_writings','ip_pa_drafts'].includes(table));
   const columns=params.get('select');assert(/^[a-z_,]+$/.test(columns));
   return (await db.query(`select ${columns} from ${table} where student_id=$1 order by student_id limit 1000`,['ip-a'])).rows;
  });
  assert.equal(live.students[0].basic,'saved');assert.equal(live.students[0].life,'empty');assert.equal(live.students[0].core.submitted,0);
 }finally{await db.close();}
 console.log('PASS overview: profile areas, saved/submitted answers, core counts, bounded reads, no answer body, admin authorization and service-role database queries');
})().catch(e=>{console.error(e);process.exitCode=1;});
