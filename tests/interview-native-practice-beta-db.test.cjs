const assert=require('node:assert/strict'),fs=require('node:fs');
const {createDb}=require('./helpers/interview-db.cjs');
const {createHandler}=require('../api/interview-native-practice');
const nativeAuth=require('../lib/interview-native-practice-auth.cjs'),legacyAuth=require('../lib/interview-native-auth');
async function call(handler,body){let status,data;await handler({method:'POST',headers:{host:'localhost'},body},{setHeader(){},status(n){status=n;return this;},json(value){data=value;}});return {status,data};}
(async()=>{
 const {db,invoke:prep}=await createDb();let access=true;
 const native=async(action,actor,body)=>(await db.query('select public.ip_native_launch_service($1,$2::jsonb,$3::jsonb) result',[action,JSON.stringify({...actor,testApp:true}),JSON.stringify(body)])).rows[0].result;
 try{
  for(const file of ['20261021060740_interview_live_sessions.sql','20261021085929_interview_native_launch.sql','20261030140517_interview_mock_test_access.sql','20261031052127_fix_mock_access_portal_accounts.sql','20261111021049_interview_native_portal_launch.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
  await db.exec("insert into ip_owners(id,name) values('native-beta-ordinary','일반 수강생');insert into ip_members(student_id,exam_number,track,enabled,expires_on,mock_test_enabled) values('native-beta-ordinary','N-1','공채',true,null,false)");await prep('admin_enabled',{type:'admin',id:'qa'},{enabled:true});
  await db.exec('set role service_role');
  const handler=createHandler({enabled:true,secret:'k'.repeat(64),authenticateWeb:async()=>({id:'native-beta-ordinary'}),requireAccess:async()=>{if(!access)throw Error('forbidden');},invoke:native,bootstrap:async()=>({ok:true})});
  let launch=await call(handler,{action:'launch',mode:'job'});assert.equal(launch.status,200);
  // The old Live service cannot consume the same raw code, even for a test actor.
  await assert.rejects(native('consume',{type:'server',id:'qa'},{codeHash:legacyAuth.hash(launch.data.code)}),/unauthorized/);
  assert.equal((await call(handler,{action:'exchange',mode:'personality',code:launch.data.code})).status,401);
  const results=await Promise.all([call(handler,{action:'exchange',mode:'job',code:launch.data.code}),call(handler,{action:'exchange',mode:'job',code:launch.data.code})]);assert.equal(results.filter(r=>r.status===200).length,1);assert.equal(results.filter(r=>r.status===401).length,1);
  launch=await call(handler,{action:'launch',mode:'personality'});await db.exec('reset role');await db.exec("update ip_native_launch_codes set expires_at=now()-interval '1 second'");await db.exec('set role service_role');assert.equal((await call(handler,{action:'exchange',mode:'personality',code:launch.data.code})).status,401);
  launch=await call(handler,{action:'launch',mode:'job'});access=false;assert.equal((await call(handler,{action:'exchange',mode:'job',code:launch.data.code})).status,403);
  access=true;launch=await call(handler,{action:'launch',mode:'job'});await db.exec('reset role');await db.exec("update ip_members set enabled=false where student_id='native-beta-ordinary'");await db.exec('set role service_role');assert.equal((await call(handler,{action:'exchange',mode:'job',code:launch.data.code})).status,403);
  await db.exec('set role anon');await assert.rejects(native('issue',{type:'student',id:'native-beta-ordinary'},{codeHash:nativeAuth.codeHash('a'.repeat(43),'job')}),/permission denied/);await assert.rejects(db.query('select * from ip_native_launch_codes'),/permission denied/);
  console.log('PASS native practice with actual existing SQL: ordinary portal enrollment, domain/mode separation, atomic single consume, expiry, revoked access and anon denial. Local database only.');
 }finally{await db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
