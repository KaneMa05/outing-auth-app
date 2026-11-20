const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {createDb}=require('./helpers/interview-db.cjs');
const {normalizePhone}=require('../lib/interview-admin-contacts.cjs');
const admin={type:'admin',id:'qa'};
const call=async(handler,body,headers={})=>{
  let status,data;await handler({method:'POST',body,headers:{host:'test.local',...headers}},{setHeader(){},status(n){status=n;return this;},json(d){data=d;}});return {status,data};
};
test('phone validation preserves leading zeroes and accepts common formatting and clearing',()=>{
  for(const phone of ['01012345678','010-1234-5678','010 1234 5678','+82 10-1234-5678'])assert.equal(normalizePhone(phone),'01012345678');
  assert.equal(normalizePhone('  '),'');
  for(const phone of [null,1234,'1234','abc01012345678','010123456789','01012345678\nDROP TABLE','----'])assert.throws(()=>normalizePhone(phone),/invalid_phone/);
});
test('admin contact storage, conflicts, API permissions and unchanged student payloads',async t=>{
  const {db,invoke:base}=await createDb();t.after(()=>db.close());
  await db.exec(fs.readFileSync('supabase/migrations/20261120080108_interview_admin_contacts.sql','utf8'));
  await base('admin_member_save',admin,{targetStudentId:'ip-a',track:'공채',examNumber:'001',enabled:true});
  await db.exec("update ip_settings set enabled=true;insert into ip_owners(id,name) values('contact-web','가상 웹 수강생');insert into ip_members(student_id,track,exam_number) values('contact-web','기관','002');set role service_role;");
  const invoke=async(action,actor,body)=>action.startsWith('admin_contact_')?(await db.query('select ip_admin_contacts_service($1,$2::jsonb,$3::jsonb) result',[action,JSON.stringify(actor),JSON.stringify(body)])).rows[0].result:base(action,actor,body);
  const save=(phone,revision,targetStudentId='contact-web')=>invoke('admin_contact_save',admin,{targetStudentId,phone,revision});
  assert.equal((await save('01012345678',0)).revision,1);
  await assert.rejects(save('01099998888',0),/revision_conflict/);
  assert.equal((await save('01022223333',1)).revision,2);
  assert.equal((await save('',2)).phone,'');
  await assert.rejects(save('invalid',3),/invalid_request/);
  await assert.rejects(save('01012345678',0,'ip-c'),/student_unavailable/);
  await assert.rejects(invoke('admin_contact_list',{type:'student',id:'ip-a'},{studentIds:['contact-web']}),/forbidden/);
  await assert.rejects(invoke('admin_contact_list',admin,{studentIds:Array(31).fill('contact-web')}),/invalid_request/);
  const auth=require('../api/teacher-auth-utils'),oldSecret=process.env.TEACHER_SESSION_SECRET;process.env.TEACHER_SESSION_SECRET='contact-unit-test-secret';
  t.after(()=>{if(oldSecret===undefined)delete process.env.TEACHER_SESSION_SECRET;else process.env.TEACHER_SESSION_SECRET=oldSecret;});
  const cookie=permissions=>({cookie:auth.COOKIE_NAME+'='+auth.createSessionToken(process.env.TEACHER_SESSION_SECRET,{username:'qa',role:'admin',permissions})});
  const handler=require('../api/interview-prep').createHandler({invoke,authenticateWeb:async()=>({id:'ip-a'})});
  const body={action:'admin_contact_save',targetStudentId:'ip-a',phone:'010-5555-6666',revision:0};
  assert.equal((await call(handler,{...body})).status,401);
  assert.equal((await call(handler,{...body},cookie(['interview.read']))).status,403);
  assert.equal((await call(handler,{...body},{...cookie(['*']),origin:'https://evil.invalid'})).status,403);
  assert.equal((await call(handler,{...body,phone:'abc'},cookie(['*']))).status,400);
  const saved=await call(handler,{...body},cookie(['interview.write']));assert.equal(saved.status,200);assert.equal(saved.data.phone,'01055556666');
  const plain=(await call(handler,{action:'admin_members'},cookie(['interview.read']))).data;
  assert(plain.members.every(m=>!Object.hasOwn(m,'phone')),'Unchanged admin screens do not receive contacts');
  const enriched=await call(handler,{action:'admin_members',includeContacts:true},cookie(['interview.read']));assert.equal(enriched.status,200);
  assert.equal(enriched.data.members.find(m=>m.id==='ip-a').phone,'01055556666');
  assert.equal((await call(handler,{action:'bootstrap',includeContacts:true})).status,400);
  const student=await invoke('bootstrap',{type:'student',id:'ip-a'},{});assert(!JSON.stringify(student).includes('01055556666'));
  for(const role of ['anon','authenticated']){
    await db.exec('reset role;set role '+role);
    await assert.rejects(db.query('select * from ip_admin_contacts'),/permission denied/);
    await assert.rejects(invoke('admin_contact_list',admin,{studentIds:['ip-a']}),/permission denied/);
  }
  await db.exec('reset role');
  const meta=(await db.query("select prosecdef,proconfig from pg_proc where proname='ip_admin_contacts_service'")).rows[0];assert.equal(meta.prosecdef,false);assert(meta.proconfig.some(s=>s.startsWith('search_path=')));
});
