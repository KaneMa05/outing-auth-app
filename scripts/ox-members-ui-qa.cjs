// Isolated QA: actual OX API, SQL and admin renderer, synthetic students only.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {spawn}=require('node:child_process');
const assert=require('node:assert/strict');
const {PGlite}=require(process.env.OX_PGLITE_MODULE || 'C:/Users/Public/Documents/ESTsoft/CreatorTemp/ox-db-tools/node_modules/@electric-sql/pglite');
const {createHandler}=require('../api/criminal-law-ox');
const auth=require('../api/teacher-auth-utils');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'.tmp/ox-members-qa');
fs.mkdirSync(dir,{recursive:true});
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
function extract(source,name){const match=new RegExp('(?:async )?function '+name+'\\(').exec(source);assert.ok(match,name);const tail=source.slice(match.index),end=tail.search(/\n(?:async )?function /);return end<0?tail:tail.slice(0,end);}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const db=new PGlite();let server,browser,ws;
  try {
    await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create table students(id text primary key,name text,class_name text,student_category text,account_type text default 'student',is_active boolean default true);grant select on students to service_role;");
    await db.query("insert into students(id,name,class_name,student_category) values ('offline','오프라인 예시','오프라인반','offline'),('managed','온라인 예시','관리반','online_managed'),('lecture','인터넷 예시','인터넷반','lecture')");
    await db.exec(read('supabase/migrations/20260917124608_criminal_law_ox.sql'));
    await db.exec(read('supabase/migrations/20260917124623_criminal_law_ox_members.sql'));
    await db.exec(read('supabase/migrations/20260920114238_ox_progressive_loading.sql'));
    await db.exec('set role service_role');
    const counts={};
    const invoke=async(action,actor,body={})=>{counts[action]=(counts[action]||0)+1;const rpc=action==='questions'||(action==='bootstrap'&&body.summaryOnly===true)?'ox_learning_data':'ox_service';return (await db.query(`select ${rpc}($1,$2::jsonb,$3::jsonb) result`,[action,JSON.stringify(actor),JSON.stringify(body)])).rows[0].result;};
    await invoke('admin_import',{type:'admin',id:'qa'},{collections:[{id:'criminal-law',name:'형법',scope:'형법',sort_order:1}],chapters:[{id:'c1',collection_id:'criminal-law',display_name:'테스트 단원',part_title:'형법총론',sort_order:1}],questions:Array.from({length:12},(_,i)=>({id:'q'+i,chapter_id:'c1',prompt:'로컬 성능 검증 지문 '+i,context:'',correct_answer:'O',explanation_html:'로컬 검증 해설',source_question_number:String(i+1),source_page:1,reviewed:true,status:'published'}))});
    process.env.TEACHER_SESSION_SECRET='local-ox-members-qa-only';
    const handler=createHandler({invoke,authenticate:async body=>['offline','managed','lecture'].includes(body.studentId) && body.deviceToken==='fixture-token'?{id:body.studentId}:null});
    const shared=read('shared.js'),app=read('app.js');
    const html=`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><body><main id="app" style="max-width:1050px;margin:24px auto"></main><div id="student"></div><script>
      ${extract(shared,'el')} ${extract(shared,'button')}
      let canWrite=true;const hasTeacherPermission=p=>p==='criminal_ox.read'||canWrite;
      const APP_MODE='student';let student={id:'offline'};
      const getAuthedStudent=()=>student,getStudentProfile=()=>({deviceToken:'fixture-token'}),isStandaloneStudentApp=()=>false;
      ${extract(app,'criminalLawOxEntryHint')} ${extract(app,'requestCriminalLawOx')} ${extract(app,'renderCriminalLawOxLocalEntry')} ${extract(app,'renderCriminalLawOxLocalPreview')}
      const renderDataLoadingState=message=>el('p',{},message);
      window.enterOx=()=>{document.querySelector('#app').hidden=true;document.querySelector('#student').replaceChildren(renderCriminalLawOxLocalPreview());};
      const navigate=()=>{};
      window.showStudent=id=>{student={id};requestCriminalLawOx.statusCache=null;document.querySelector('#student').replaceChildren(renderCriminalLawOxLocalEntry());};
      window.studentRequest=(action,body)=>requestCriminalLawOx(action,body).catch(e=>({error:e.code}));
      ${read('criminal-law-ox-admin.js')}
      function render(){document.querySelector('#app').replaceChildren(renderCriminalLawOxAdmin());}
      render();
      </script></body></html>`;
    const assets=new Set(['styles.css','criminal-law-ox-admin.css','criminal-law-ox.css','criminal-law-ox.js']);
    server=http.createServer(async(req,res)=>{
      const url=new URL(req.url,'http://localhost');
      if(url.pathname==='/api/criminal-law-ox') {
        res.status=n=>{res.statusCode=n;return res;};res.json=data=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));};
        return handler(req,res);
      }
      if(url.pathname==='/') {
        const cookie=auth.createSessionToken(process.env.TEACHER_SESSION_SECRET,{username:'qa',role:'teacher',permissions:['criminal_ox.read','criminal_ox.write']});
        res.setHeader('Set-Cookie',`${auth.COOKIE_NAME}=${cookie}; HttpOnly; Path=/; SameSite=Strict`);
        res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html);
      }
      if(assets.has(url.pathname.slice(1))){res.setHeader('Content-Type',url.pathname.endsWith('.js')?'text/javascript':'text/css');return res.end(read(url.pathname.slice(1)));}
      if(['/fonts/NanumGothic-Regular.woff','/fonts/NanumGothic-Bold.woff'].includes(url.pathname)){res.setHeader('Content-Type','font/woff');return res.end(fs.readFileSync(path.join(root,url.pathname.slice(1))));}
      res.statusCode=404;res.end();
    });
    await new Promise(r=>server.listen(0,'127.0.0.1',r));
    const origin=`http://127.0.0.1:${server.address().port}`;
    browser=spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+path.join(dir,'browser-'+Date.now()),'about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
    const debuggerUrl=await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(Error('Chrome startup timed out')),15000);browser.stderr.on('data',chunk=>{output+=chunk;const match=output.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match){clearTimeout(timer);resolve(match[1]);}});browser.on('error',reject);});
    const tabs=await(await fetch('http://'+new URL(debuggerUrl).host+'/json')).json();
    ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));
    let id=0;const pending=new Map();
    ws.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}});
    const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));});
    const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
    const wait=async expression=>{for(let n=0;n<100;n++){if(await evaluate(expression))return;await delay(50);}throw Error('Timeout: '+expression);};
    const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
    await send('Page.enable');await send('Page.navigate',{url:origin});
    await wait("document.querySelector('[data-members]')?.textContent.includes('등록된 수강생이 없습니다')");
    // Opening learning while the roster is empty must not expose anyone.
    await click('[data-admin=enabled]');await wait("document.querySelector('.ox-admin-availability').textContent.includes('등록 수강생만 사용 중')");
    for(const student of ['offline','managed','lecture']) {
      await evaluate(`showStudent('${student}')`);
      assert.equal((await evaluate("studentRequest('status')")).enabled,false);
      assert.equal(await evaluate("document.querySelector('#student button').hidden"),true);
      for(const action of ['bootstrap','detail','submit','note']) {
        const body={questionId:'q',version:1,answer:'O',submissionId:'00000000-0000-0000-0000-000000000001'};
        assert.equal((await evaluate(`studentRequest('${action}',${JSON.stringify(body)})`)).error,'ox_not_registered');
      }
    }
    await evaluate("document.querySelector('[name=registeredOnly]').value='false';document.querySelector('[data-member-form]').requestSubmit()");
    await wait("document.querySelectorAll('[data-admin=member-set]').length===3");
    await click('[data-admin=member-set][data-id=offline]');await wait("document.querySelector('[data-id=offline][data-allowed=false]')");
    await evaluate("showStudent('offline')");await wait("document.querySelector('#student button')?.hidden===false");
    assert.equal(await evaluate("showStudent('offline');document.querySelector('#student button').hidden"),false,'Saved enrollment must show the card before a new status response');
    assert.equal((await evaluate("studentRequest('bootstrap')")).ok,true);
    await evaluate("showStudent('lecture')");assert.equal((await evaluate("studentRequest('status')")).enabled,false);
    // Search and filter remain independent of the question list.
    await evaluate("document.querySelector('[name=memberSearch]').value='오프라인';document.querySelector('[data-member-form]').requestSubmit()");
    await wait("document.querySelectorAll('[data-admin=member-set]').length===1");
    for(const width of [390,1100]) {
      await send('Emulation.setDeviceMetricsOverride',{width,height:950,deviceScaleFactor:1,mobile:width<500});
      assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,`overflow at ${width}`);
      const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync(path.join(dir,`admin-${width}.png`),Buffer.from(shot.data,'base64'));
    }
    await click('[data-admin=member-set][data-id=offline]');await wait("document.querySelector('[data-id=offline][data-allowed=true]')");
    await evaluate("showStudent('offline')");assert.equal((await evaluate("studentRequest('bootstrap')")).error,'ox_not_registered');
    await evaluate("document.querySelector('[name=memberSearch]').value='';document.querySelector('[data-member-form]').requestSubmit()");
    await wait("document.querySelectorAll('[data-admin=member-set]').length===3");
    for(const student of ['managed','lecture']) {
      await click(`[data-admin=member-set][data-id=${student}]`);await wait(`document.querySelector('[data-id=${student}][data-allowed=false]')`);
      await evaluate(`showStudent('${student}')`);await wait("document.querySelector('#student button')?.hidden===false");
      assert.equal((await evaluate("studentRequest('bootstrap')")).ok,true);
    }
    const before=counts.bootstrap;
    await evaluate("enterOx();window.oxPage=renderCriminalLawOxLocalPreview.view.element;enterOx();enterOx()");
    await wait("document.querySelector('#criminal-ox-preview .ox-content h2')?.textContent==='오늘 학습'");
    assert.equal(counts.bootstrap-before,1,'Repeated rendering must share one bootstrap');
    await click('[data-action=daily]');await click('[data-action=chapter][data-id=c1]');
    await wait("document.querySelector('.ox-answer-grid')");
    await evaluate("enterOx();enterOx()");
    assert.equal(await evaluate("document.querySelector('.criminal-law-ox-local-page')===oxPage && !!document.querySelector('.ox-answer-grid')"),true,'Rerender reset the learning screen');
    assert.equal(counts.bootstrap-before,1,'Rerender fetched the question bank again');
    await click('[data-action=answer][data-answer=X]');
    await wait("document.querySelector('.ox-grade-copy h3')?.textContent==='오답이에요'");
    assert.equal(await evaluate("document.querySelector('.ox-explanation').textContent"),'로컬 검증 해설');
    await click('[data-action=next]');await wait("document.querySelector('.ox-answer-grid')");
    const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(dir,'learning-after-rerender.png'),Buffer.from(shot.data,'base64'));
    await evaluate("document.querySelector('#app').hidden=false;document.querySelector('#student').replaceChildren();renderCriminalLawOxLocalPreview.view=null");
    console.log('OX loading QA passed: one bootstrap during repeated renders, same quiz/session retained, compact questions grade and show explanations.');
    await click('[data-admin=enabled]');await wait("document.querySelector('.ox-admin-availability').textContent.includes('준비 중')");
    assert.equal((await evaluate("studentRequest('bootstrap')")).error,'ox_disabled');
    await evaluate('canWrite=false;render()');await wait("document.querySelector('[data-admin=enabled]')?.disabled");
    await evaluate("document.querySelector('[name=registeredOnly]').value='false';document.querySelector('[data-member-form]').requestSubmit()");
    await wait("document.querySelectorAll('[data-admin=member-set]').length===3");
    assert.equal(await evaluate("Array.from(document.querySelectorAll('[data-admin=member-set]')).every(b=>b.disabled)"),true);
    console.log('OX browser QA passed: admin registration/search/revocation, all three student categories, direct API denial, read-only controls, 390px/1100px layouts.');
  } finally {
    ws?.close();browser?.kill();if(server)await new Promise(r=>server.close(r));await db.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
