const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createDb}=require('./helpers/interview-db.cjs');
const exporter=()=>import('../client/interview-roster-export.mjs');

function zipEntries(bytes){
  const entries=new Map();
  for(let offset=0;bytes.readUInt32LE(offset)===0x04034b50;){
    assert.equal(bytes.readUInt16LE(offset+8),0);
    const size=bytes.readUInt32LE(offset+18),nameLength=bytes.readUInt16LE(offset+26),extraLength=bytes.readUInt16LE(offset+28);
    const start=offset+30+nameLength+extraLength;
    entries.set(bytes.toString('utf8',offset+30,offset+30+nameLength),bytes.toString('utf8',start,start+size));
    offset=start+size;
  }
  return entries;
}

test('full registered roster spans database pages, includes web accounts and both courses, excludes unregistered/inactive accounts',async t=>{
  const {db}=await createDb();t.after(()=>db.close());
  await db.exec("create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);");
  for(const file of ['20261030140517_interview_mock_test_access.sql','20261031052127_fix_mock_access_portal_accounts.sql','20261109053559_interview_aptitude_exams.sql','20261109054842_interview_apple_login.sql','20261110074450_interview_access_products.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8').replace(/\r\n/g,'\n'));
  await db.exec(`insert into ip_owners(id,name) select 'roster-'||lpad(n::text,3,'0'),'가상 수강생 '||n from generate_series(1,65) n;
    insert into ip_members(student_id,track,exam_number,access_product,enabled,expires_on)
      select id,'공채','000'||right(id,3),case when right(id,3)::int%2=0 then 'aptitude_only' else 'interview_package' end,
        right(id,3)::int<>2,case when right(id,3)::int=3 then current_date-1 else null end from ip_owners;
    insert into ip_members(student_id,track,exam_number) values('ip-a','기관','00123'),('ip-b','방제','00099');
    update students set is_active=false where id='ip-b';set role service_role;`);
  const {loadInterviewRoster,createInterviewRosterWorkbook}=await exporter(),calls=[];
  const request=async(action,body)=>{
    calls.push({action,body});
    return (await db.query('select ip_mock_access_service($1,$2::jsonb,$3::jsonb) result',[action,JSON.stringify({type:'admin',id:'roster-admin'}),JSON.stringify(body)])).rows[0].result;
  };
  const members=await loadInterviewRoster(request);
  assert.equal(members.length,66);
  assert.deepEqual(calls.map(c=>c.body),[0,1,2].map(page=>({registeredOnly:true,page})));
  assert(members.some(m=>m.exam_number==='000002'),'Stopped registration is included');
  assert(members.some(m=>m.exam_number==='000003'),'Expired registration is included');
  assert(!members.some(m=>m.exam_number==='00099'));
  assert(members.every(m=>Object.keys(m).join(',')==='name,track,exam_number,access_product'));
  const blob=createInterviewRosterWorkbook(members),entries=zipEntries(Buffer.from(await blob.arrayBuffer()));
  assert.equal(blob.type,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  const sheet=entries.get('xl/worksheets/sheet1.xml');
  assert.equal((sheet.match(/<row /g)||[]).length,67);
  for(const label of ['이름','직렬','수험번호','과정','면접 패키지','인적성 단과'])assert(sheet.includes(label));
  assert.match(sheet,/<c r="C2" s="0" t="inlineStr"><is><t xml:space="preserve">00123/);
  assert.match(sheet,/autoFilter ref="A1:D67"/);
  assert.doesNotMatch(sheet,/roster-001|ip-a|feedback|notes/);
  await assert.rejects(db.query("select ip_mock_access_service('admin_members','{\"type\":\"student\",\"id\":\"ip-a\"}','{}')"),/forbidden/);
});

test('text cells preserve zeroes, special characters and literal formula text; legacy product defaults to package',async()=>{
  const {createInterviewRosterWorkbook}=await exporter();
  const blob=createInterviewRosterWorkbook([{name:'=1+1 & <가상>\u0001',track:'기관',exam_number:'0000123'}]);
  const sheet=zipEntries(Buffer.from(await blob.arrayBuffer())).get('xl/worksheets/sheet1.xml');
  assert.match(sheet,/=1\+1 &amp; &lt;가상&gt;/);assert.match(sheet,/>0000123</);assert.match(sheet,/면접 패키지/);
  assert.doesNotMatch(sheet,/<f[ >]|\u0001/);
});

test('empty results, failures, duplicate pages and navigation cancellation cannot produce a partial export',async()=>{
  const {loadInterviewRoster}=await exporter();
  assert.deepEqual(await loadInterviewRoster(async()=>({members:[]})),[]);
  await assert.rejects(loadInterviewRoster(async()=>({})),/invalid_roster_data/);
  const page=Array.from({length:30},(_,i)=>({id:String(i),track:'공채'}));
  await assert.rejects(loadInterviewRoster(async()=>({members:page})),/invalid_roster_data/);
  await assert.rejects(loadInterviewRoster(async(action,body)=>{if(body.page)throw Error('unauthorized');return {members:page};}),/unauthorized/);
  let active=true;
  assert.equal(await loadInterviewRoster(async()=>{active=false;return {members:page};},{isCurrent:()=>active}),null);
});
