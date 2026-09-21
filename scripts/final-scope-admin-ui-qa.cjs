// Isolated browser + API + SQL verification. Never connects to production.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {PGlite}=require(process.env.OX_PGLITE_MODULE || 'C:/Users/Public/Documents/ESTsoft/CreatorTemp/ox-db-tools/node_modules/@electric-sql/pglite');
const handler=require('../api/app-settings'),auth=require('../api/teacher-auth-utils');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'.tmp/final-scope-admin-qa');fs.mkdirSync(dir,{recursive:true});
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
function extract(source,name){const m=source.match(new RegExp(`^(?:async )?function ${name}\\([^]*?^}`, 'm'));assert(m,name);return m[0];}
let server,browser,ws,db;const originalFetch=global.fetch;
(async()=>{try{
 db=new PGlite();await db.exec('create table notices (id text primary key, body text, is_published boolean)');
 process.env.SUPABASE_URL='https://final-scope-qa.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='test-only';process.env.TEACHER_SESSION_SECRET='local-final-scope-qa-only';
 global.fetch=async(url,options)=>{
  if(!String(url).startsWith('https://final-scope-qa.invalid/rest/v1/'))return originalFetch(url,options);
  if(options.method==='GET')return new Response(JSON.stringify((await db.query('select body from notices where id=$1',['__app_settings__'])).rows),{status:200});
  const row=JSON.parse(options.body);assert.equal(row.id,'__app_settings__');assert.equal(row.is_published,false);
  await db.query('insert into notices values ($1,$2,$3) on conflict (id) do update set body=excluded.body,is_published=excluded.is_published',[row.id,row.body,row.is_published]);
  return new Response(null,{status:204});
 };
 const shared=read('shared.js'),app=read('app.js');
 const helpers=['el','button','panel','field','input'].map(n=>extract(shared,n)).join('\n');
 const student=['getFinalScopePlanData','getFinalScopeSubjects','canUseFinalScopePlan','formatFinalScopeRoundCode','formatFinalScopeUnitCode','renderFinalScopePlan','selectFinalScopeRound'].map(n=>extract(app,n)).join('\n');
 const html=`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/final-scope-admin.css"><style>body{padding:16px}#app{max-width:1080px;margin:auto}</style><body data-app-mode="teacher"><main id="app"></main><script src="/final-scope-data.js"></script><script src="/final-scope-model.js"></script><script>
 ${helpers}
 let currentRoute='final-scope-admin',canWrite=true,state={settings:{}},finalScopeSelectedRound=1,category='lecture';
 const hasTeacherPermission=p=>p==='curriculum.read'||canWrite;
 const applyRemoteAppSettings=s=>{state.settings=s;};const notify=m=>{window.lastNotice=m;};const renderForbidden=()=>el('p',{},'권한 없음');
 const getAuthedStudent=()=>({category}),getStudentCategory=s=>s.category,normalizeCoastGuardTrack=s=>s;
 const getConfiguredWeeklySubjectsForTrack=()=>Object.values(window.FINAL_SCOPE_PLAN.appSubjectByScopeSubject);
 ${student}
 function render(){document.querySelector('#app').replaceChildren(currentRoute==='final-scope-admin'?renderFinalScopeAdmin():renderFinalScopePlan());}
 async function showStudent(value){document.body.removeAttribute('data-app-mode');category=value;currentRoute='student';const data=await(await fetch('/api/app-settings')).json();applyRemoteAppSettings(data.settings);render();}
 </script><script src="/final-scope-admin.js"></script><script>render();</script></body></html>`;
 const assets=new Set(['styles.css','final-scope-admin.css','final-scope-data.js','final-scope-model.js','final-scope-admin.js',...fs.readdirSync(path.join(root,'fonts')).map(n=>'fonts/'+n)]);
 let failSave=false;
 server=http.createServer(async(req,res)=>{
  const p=new URL(req.url,'http://localhost').pathname.slice(1);
  if(p==='api/app-settings'){
   if(failSave&&req.method==='POST'){failSave=false;res.writeHead(500,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:false,error:'test_failure'}));}
   res.status=n=>{res.statusCode=n;return res;};res.json=data=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));};return handler(req,res);
  }
  if(!p){const token=auth.createSessionToken(process.env.TEACHER_SESSION_SECRET,{username:'qa',role:'admin',permissions:['*']});res.setHeader('Set-Cookie',`${auth.COOKIE_NAME}=${token}; HttpOnly; Path=/; SameSite=Strict`);res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html);}
  if(!assets.has(p)){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':p.endsWith('.woff2')?'font/woff2':'font/woff');res.end(fs.readFileSync(path.join(root,p)));
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+path.join(dir,'browser-'+Date.now()),'about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
 const debug=await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(Error('Chrome timeout')),15000);browser.stderr.on('data',c=>{output+=c;const m=output.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m){clearTimeout(timer);resolve(m[1]);}});browser.on('error',reject);});
 const tabs=await(await fetch('http://'+new URL(debug).host+'/json')).json();ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));let id=0;const pending=new Map();
 ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}else if(m.method==='Page.javascriptDialogOpening')send('Page.handleJavaScriptDialog',{accept:true});});
 const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));});
 const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const wait=async exp=>{for(let i=0;i<120;i++){if(await ev(exp))return;await new Promise(r=>setTimeout(r,50));}throw Error('Timeout '+exp);};
 const click=s=>ev(`document.querySelector(${JSON.stringify(s)}).click()`);
 const fill=(name,value)=>ev(`(()=>{const n=document.querySelector('[name="'+${JSON.stringify(name)}+'"]');n.value=${JSON.stringify(value)};n.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 const select=i=>ev(`(()=>{const n=document.querySelector('[name=finalScopeRound]');n.value='${i}';n.dispatchEvent(new Event('change'));})()`);
 await send('Page.enable');await send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port});await wait("typeof finalScopeAdmin !== 'undefined' && !!finalScopeAdmin.draft");
 await fill('finalScopeTitle','수정된 회독 플랜');await fill('finalScopeDate','9월 25일');await fill('finalScopeCode','15-1 ~ 15-4');await fill('unitText-0-0','수정한 형법 시험 범위');
 await select(1);await select(0);assert.equal(await ev("document.querySelector('[name=finalScopeDate]').value"),'9월 25일');
 failSave=true;await click('[data-final-scope-save]');await wait('!!finalScopeAdmin.error&&!finalScopeAdmin.saving');assert.equal(await ev('finalScopeAdmin.draft.title'),'수정된 회독 플랜');assert.equal((await db.query('select count(*)::int n from notices')).rows[0].n,0);
 await click('[data-final-scope-save]');await wait('!finalScopeAdmin.saving&&!isFinalScopeAdminDirty()');
 const stored=JSON.parse((await db.query('select body from notices')).rows[0].body);assert.equal(stored.finalScopePlan.rounds[0].subjects['형사법'][0].text,'수정한 형법 시험 범위');
 const reloaded=new Promise(resolve=>{const listener=e=>{if(JSON.parse(e.data).method==='Page.loadEventFired'){ws.removeEventListener('message',listener);resolve();}};ws.addEventListener('message',listener);});await send('Page.reload');await reloaded;await wait("typeof finalScopeAdmin !== 'undefined' && !!finalScopeAdmin.draft");assert.equal(await ev('finalScopeAdmin.draft.title'),'수정된 회독 플랜');
 for(const width of [390,1100]){await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<500});assert.equal(await ev('document.documentElement.scrollWidth>innerWidth'),false);const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(dir,`admin-${width}.png`),Buffer.from(shot.data,'base64'));}
 await select(1);await fill('finalScopeRoundNumber','1');await click('[data-final-scope-save]');await wait('!!finalScopeAdmin.error');assert((await ev('finalScopeAdmin.error')).includes('중복'));await fill('finalScopeRoundNumber','2');
 await ev("canWrite=false;render()");assert.equal(await ev("document.querySelector('[data-final-scope-save]').disabled && document.querySelector('fieldset').disabled"),true);
 for(const type of ['online_managed','lecture']){await ev(`showStudent('${type}')`);assert((await ev("document.querySelector('#app').textContent")).includes('수정한 형법 시험 범위'));assert((await ev("document.querySelector('#app').textContent")).includes('9월 25일'));assert.equal(await ev('FinalScopePlanModel.guideRows(getFinalScopePlanData())[0][1]'),'15일 동안 1회독');}
 await ev("showStudent('offline')");assert((await ev("document.querySelector('#app').textContent")).includes('이용할 수 없는 계정'));
 console.log('PASS: real admin renderer/API/SQL save and reload; failed saves keep drafts; duplicate rounds blocked; readonly permissions; 390px/1100px layouts; student plan and guide updates; offline remains excluded.');
}finally{global.fetch=originalFetch;ws?.close();browser?.kill();server?.close();await db?.close();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
