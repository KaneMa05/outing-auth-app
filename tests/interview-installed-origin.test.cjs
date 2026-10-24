const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createDb}=require('./helpers/interview-db.cjs');
const webAuth=require('../lib/interview-web-auth');
const auth=require('../api/interview-auth');
const prep=require('../api/interview-prep');
const origins=['https://app.ronparkpass.com','https://outing-auth-app.vercel.app'];
const cfg={enabled:true,origin:origins[0],clientId:'test-client',clientSecret:'test-secret'};
(async()=>{
 const {db,invoke}=await createDb();
 try{
  const admin={type:'admin',id:'qa'},rpc=(action,body)=>invoke(action,{type:'server'},body);
  await db.query('update students set password_hash=$1 where id=$2',[webAuth.hash('ExistingPassword!'),'ip-a']);
  await invoke('admin_enabled',admin,{enabled:true});
  await invoke('admin_member_save',admin,{targetStudentId:'ip-a',track:'공채',examNumber:'app-test',enabled:true});
  let exchanges=0;
  const exchangeOrigins=[];
  const handler=auth.createHandler({getConfig:()=>cfg,invoke:rpc,exchange:async(code,config)=>{
   exchanges++;exchangeOrigins.push(config.origin);return 'installed-app-user';
  }});
  const prepHandler=prep.createHandler({previewAllowed:()=>false,invoke,
   authenticateWeb:req=>webAuth.authenticatePortal(req,{getConfig:()=>cfg,call:rpc})});
  async function call(handler,origin,jar,body,{method='POST',query='',requestOrigin=origin}={}){
   const result={headers:{}};
   await handler({method,url:'/api/interview-auth'+query,body,
    headers:{host:new URL(origin).host,origin:requestOrigin,cookie:Object.entries(jar).map(([k,v])=>k+'='+v).join('; ')},socket:{remoteAddress:'installed-test'}},
    {setHeader(k,v){result.headers[k]=v;},set statusCode(n){result.status=n;},status(n){result.status=n;return this;},json(data){result.data=data;},end(){}});
   for(const value of [].concat(result.headers['Set-Cookie']||[])){
    assert(!/;\s*Domain=/i.test(value),'Cookies must stay host-only');
    const [pair]=value.split(';'),i=pair.indexOf('=');if(pair.slice(i+1))jar[pair.slice(0,i)]=pair.slice(i+1);else delete jar[pair.slice(0,i)];
   }
   return result;
  }
  for(const origin of origins){
   const jar={};
   const login=await call(handler,origin,jar,{action:'legacy_login',studentId:'ip-a',password:'ExistingPassword!',intent:'login'});
   assert.equal(login.status,200);
   const session=await call(handler,origin,jar,undefined,{method:'GET',query:'?action=session'});
   assert.equal(session.data.authenticated,true);assert.equal(session.data.available,true);
   for(const action of ['bootstrap','life_get','writing_list']){
    const read=await call(prepHandler,origin,jar,{action});assert.equal(read.status,200,origin+' '+action);assert.equal(read.data.ok,true);
   }
   // Even the other trusted app host cannot issue cross-origin mutations/reads.
   for(const foreign of [origins.find(x=>x!==origin),'https://evil.test','https://app.ronparkpass.com.evil.test','null','']){
    assert.equal((await call(handler,origin,jar,{action:'logout'},{requestOrigin:foreign})).status,403);
    const denied=await call(prepHandler,origin,jar,{action:'bootstrap'},{requestOrigin:foreign});
    assert([403,503].includes(denied.status));assert.equal(denied.data.ok,false);
   }
   const start=await call(handler,origin,jar,{action:'kakao_start',intent:'link'});
   assert.equal(start.status,200);const url=new URL(start.data.url),state=url.searchParams.get('state');
   assert.equal(url.searchParams.get('redirect_uri'),origin+'/api/interview-auth?action=callback');
   const callbackQuery='?action=callback&state='+state+'&code=test-code';
   const before=exchanges;
   assert.match((await call(handler,origin,{},undefined,{method:'GET',query:callbackQuery})).headers.Location,/oauth_state_invalid/);
   assert.equal(exchanges,before);
   const finish=await call(handler,origin,jar,undefined,{method:'GET',query:callbackQuery});
   assert.equal(finish.status,303);assert.equal(finish.headers.Location,'/interview');
   assert.equal(new URL(finish.headers.Location,origin).origin,origin,'Return to installed app origin');
   assert.equal(exchangeOrigins.at(-1),origin);
   assert.match((await call(handler,origin,jar,undefined,{method:'GET',query:callbackQuery})).headers.Location,/oauth_state_invalid/);
   assert.equal(exchanges,before+1);
   const authed=await call(prepHandler,origin,jar,{action:'bootstrap'});assert.equal(authed.status,200);
   const saved={...jar};assert.equal((await call(handler,origin,jar,{action:'logout'})).status,200);
   assert.equal((await call(prepHandler,origin,saved,{action:'bootstrap'})).status,403);
   console.log('PASS installed origin login, home reads, OAuth return, CSRF, replay and logout: '+origin);
  }
  for(const origin of ['https://untrusted.vercel.app','https://outing-auth-app.vercel.app.evil.test']){
   const r=await call(handler,origin,{},undefined,{method:'GET',query:'?action=session'});
   assert.equal(r.data.enabled,false);assert.equal(r.data.authenticated,false);
  }
  assert.equal(webAuth.requestConfig({headers:{host:'outing-auth-app.vercel.app'}},{...cfg,origin:'https://staging.test'}).enabled,false);
  for(const r of JSON.parse(fs.readFileSync('vercel.json','utf8')).redirects||[])assert.notEqual(r.source,'/interview','Do not redirect installed app outside its origin');
  console.log('PASS unknown hosts rejected and installed interview entry stays on the same origin');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
