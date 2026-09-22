// Isolated QA: actual OX API, SQL and admin renderer, synthetic students only.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {spawn}=require('node:child_process');
const crypto=require('node:crypto');
const assert=require('node:assert/strict');
const {PGlite}=require(process.env.OX_PGLITE_MODULE || 'C:/Users/Public/Documents/ESTsoft/CreatorTemp/ox-db-tools/node_modules/@electric-sql/pglite');
const {createHandler}=require('../api/criminal-law-ox');
const auth=require('../api/teacher-auth-utils');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'.tmp/ox-books-qa');
fs.mkdirSync(dir,{recursive:true});
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
function extract(source,name){const match=new RegExp('(?:async )?function '+name+'\\(').exec(source);assert.ok(match,name);const tail=source.slice(match.index),end=tail.search(/\n(?:async )?function /);return end<0?tail:tail.slice(0,end);}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const db=new PGlite();let server,browser,ws;
  try {
    await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create table students(id text primary key,name text,class_name text,student_category text,cohort smallint,account_type text default 'student',is_active boolean default true);grant select on students to service_role;");
    await db.query("insert into students(id,name,class_name,student_category) values ('offline','오프라인 예시','오프라인반','offline'),('managed','온라인 예시','관리반','online_managed'),('lecture','인터넷 예시','인터넷반','lecture')");
    await db.exec(read('supabase/migrations/20260917124608_criminal_law_ox.sql'));
    await db.exec(read('supabase/migrations/20260917124623_criminal_law_ox_members.sql'));
    await db.exec(read('supabase/migrations/20260920114238_ox_progressive_loading.sql'));
    await db.exec(read('supabase/migrations/20260921113944_ox_book_access.sql'));
    await db.exec(read('tests/fixtures/ox-lecture-identities.sql'));
    await db.exec("insert into lecture_applications(approved_student_id,status,lecture_id) values('managed','approved','RonPark_18'),('lecture','approved','<b>LectureUser</b>');insert into final_score_identities(cohort,student_id,lecture_id_normalized) values('17','managed','score_alias'),('lecture','lecture','longidlongidlongidlongidlongidlongidlongidlongidlongidlongidlongidlongidlongid');");
    await db.exec(read('supabase/migrations/20260922044735_ox_member_cohort_filter.sql'));
    await db.exec("update students set cohort=case when id='offline' then 18 when id='managed' then 17 else null end");
    await db.exec(read('tests/fixtures/ox-app-devices.sql'));
    await db.exec(read('supabase/add-student-devices.sql').replace('create extension if not exists "pgcrypto";',''));
    await db.exec('grant select on student_devices to service_role');
    for(const id of ['offline','managed','lecture']) for(const token of ['fixture-token']) await db.query('insert into student_devices(student_id,device_token_hash,device_label) values($1,$2,$3)',[id,crypto.createHash('sha256').update(token).digest('hex'),token]);
    await db.exec(read('supabase/migrations/20260922044751_ox_device_policy.sql'));
    await db.exec(read('supabase/migrations/20260922044806_ox_verified_purchase_required.sql'));
    await db.exec(read('supabase/migrations/20260922044821_ox_bulk_access_grants.sql'));
    await db.exec('set role service_role');
    const counts={};
    const invoke=async(action,actor,body={})=>{counts[action]=(counts[action]||0)+1;const rpc=action.startsWith('admin_grant_')?'ox_grant_admin':actor.deviceHash||action.startsWith('device_')||action.startsWith('admin_device_')?'ox_device_gateway':action==='questions'||(action==='bootstrap'&&body.summaryOnly===true)?'ox_learning_data':'ox_service';return (await db.query(`select ${rpc}($1,$2::jsonb,$3::jsonb) result`,[action,JSON.stringify(actor),JSON.stringify(body)])).rows[0].result;};
    const bookIds=['criminal-law','criminal-procedure-investigation-evidence','criminal-procedure-trial'];
    await invoke('admin_import',{type:'admin',id:'qa'},{collections:bookIds.map((id,i)=>({id,name:['형법','수사·증거','공판'][i],scope:['형법','수사·증거','공판'][i],sort_order:i+1})),chapters:bookIds.map((id,i)=>({id:'c'+i,collection_id:id,display_name:'검증 단원 '+i,part_title:i===0?'형법총론':'공판',sort_order:i+1})),questions:bookIds.flatMap((id,i)=>Array.from({length:3},(_,j)=>({id:'q'+i+j,chapter_id:'c'+i,prompt:'로컬 검증 지문 '+i+'-'+j,context:'',correct_answer:'O',explanation_html:'로컬 검증 해설',source_question_number:String(j+1),reviewed:true,status:'published'})))});
    process.env.TEACHER_SESSION_SECRET='local-ox-members-qa-only';
    const handler=createHandler({invoke,authenticate:async body=>['offline','managed','lecture'].includes(body.studentId) && ['fixture-token','fixture-two','fixture-three','fixture-four'].includes(body.deviceToken)?{id:body.studentId}:null});
    const deviceHandler=require('../api/student-devices').createHandler({
      manage:async args=>(await db.query('select student_device_manage($1,$2::jsonb,$3::jsonb) result',[args.p_action,JSON.stringify(args.p_actor),JSON.stringify(args.p_body)])).rows[0].result,
      register:async args=>(await db.query('select register_student_device($1,$2,$3,$4,$5) result',[args.studentId,args.passwordHash,crypto.createHash('sha256').update(args.deviceToken).digest('hex'),'',args.deviceLabel])).rows[0].result,
      validateDevice:async args=>(await db.query('select validate_student_device($1,$2) result',[args.studentId,crypto.createHash('sha256').update(args.deviceToken).digest('hex')])).rows[0].result,
      revokeDevice:async args=>(await db.query('select revoke_student_device($1,$2,$3,$4,$5) result',[args.studentId,args.requesterTokenHash,args.targetDeviceId,args.actor,args.reason])).rows[0].result,
    });
    const shared=read('shared.js'),app=read('app.js');
    const html=`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><body><main id="app" style="max-width:1050px;margin:24px auto"></main><div id="student"></div><script>
      ${extract(shared,'el')} ${extract(shared,'button')}
      let canWrite=true;const hasTeacherPermission=p=>p==='criminal_ox.read'||canWrite;
      const APP_MODE='student';let student={id:'offline'};let studentToken='fixture-token';
      const getAuthedStudent=()=>student,getStudentProfile=()=>({deviceToken:studentToken}),isStandaloneStudentApp=()=>false;
      ${extract(app,'criminalLawOxEntryHint')} ${extract(app,'requestCriminalLawOx')} ${extract(app,'renderCriminalLawOxLocalEntry')} ${extract(app,'renderCriminalLawOxLocalPreview')} ${extract(app,'renderStudentMypage')} ${extract(app,'renderStudentDeviceRegistrationCard')} ${extract(app,'renderStudentDeviceManagementCard')} ${extract(app,'mountStudentDeviceManagement')} ${extract(app,'requestStudentDeviceAction')}
      const getStudentDeviceLabel=()=>({'fixture-token':'휴대폰','fixture-two':'태블릿','fixture-three':'새 휴대폰','fixture-four':'추가 기기'})[studentToken];
      const getStudentCategory=()=>student.id==='lecture'?'lecture':student.id==='managed'?'online_managed':'offline',getStudentCategoryLabel=()=>getStudentCategory(),normalizeCoastGuardTrack=v=>v;
      const state={settings:{}},profileItem=(label,value)=>el('p',{},label+': '+value),isOnlineStudentExperience=()=>true,notify=()=>{};
      const renderStudentPenaltyHistoryButton=()=>null,renderStudentPushNotificationCard=()=>null,renderStudentOtherSettingsCard=()=>null,renderHomeScreenInstallCard=()=>null;
      const renderDataLoadingState=message=>el('p',{},message);
      window.enterOx=()=>{window.myPage=false;window.learning=true;document.querySelector('#app').hidden=true;document.querySelector('#student').replaceChildren(renderCriminalLawOxLocalPreview());};
      const navigate=route=>{if(route==='criminal-law-ox')return enterOx();if(route==='mypage'){window.learning=false;window.myPage=true;document.querySelector('#app').hidden=true;document.querySelector('#student').replaceChildren(renderStudentMypage());}};
      window.showStudent=id=>{student={id,name:({'offline':'오프라인 예시','managed':'온라인 예시','lecture':'인터넷 예시'})[id]};requestCriminalLawOx.statusCache=null;document.querySelector('#student').replaceChildren(renderCriminalLawOxLocalEntry());};
      window.candidate=()=>{const host=document.createElement('div');document.querySelector('#student').replaceChildren(host);mountStudentDeviceManagement(host,{studentId:student.id,deviceToken:studentToken,passwordHash:'fixture-password'},()=>enterOx());};
      window.studentRequest=async(action,body={})=>{try{await requestCriminalLawOx('device_register');const started=await requestCriminalLawOx('device_start');return await requestCriminalLawOx(action,{...body,sessionId:started.sessionId});}catch(e){return {error:e.code};}};
      ${read('criminal-law-ox-admin.js')}
      function render(){if(window.myPage){document.querySelector('#student').replaceChildren(renderStudentMypage());}else if(window.learning){document.querySelector('#student').replaceChildren(renderCriminalLawOxLocalPreview());}else{document.querySelector('#app').replaceChildren(renderCriminalLawOxAdmin());}}
      render();
      </script></body></html>`;
    const assets=new Set(['styles.css','criminal-law-ox-admin.css','criminal-law-ox.css','criminal-law-ox.js','criminal-law-ox-access.js','criminal-law-ox-device-admin.js','student-device-manager.js','criminal-law-ox-grants-admin.js']);
    server=http.createServer(async(req,res)=>{
      const url=new URL(req.url,'http://localhost');
      if(['/api/criminal-law-ox','/api/student-devices'].includes(url.pathname)) {
        res.status=n=>{res.statusCode=n;return res;};res.json=data=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));};
        return (url.pathname==='/api/student-devices'?deviceHandler:handler)(req,res);
      }
      if(url.pathname==='/') {
        const cookie=auth.createSessionToken(process.env.TEACHER_SESSION_SECRET,{username:'qa',role:'teacher',permissions:['criminal_ox.read','criminal_ox.write','students.read','students.reset']});
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
    await wait("document.querySelector('[data-members]')?.textContent.includes('조건에 맞는 등록 수강생이 없습니다')");
    const errors=[];
    ws.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);});
    await send('Runtime.enable');
    await click('[data-admin=enabled]');await wait("document.querySelector('.ox-admin-availability').textContent.includes('등록 수강생만 사용 중')");
    await evaluate("document.querySelector('[name=registeredOnly]').value='false';document.querySelector('[data-member-form]').requestSubmit()");
    await wait("document.querySelectorAll('[data-admin=book-add]').length===3");
    assert.deepEqual(await evaluate("Array.from(document.querySelector('[data-member-cohort]').options).map(o=>o.value)"),['','18','17','lecture','unassigned']);
    for(const [cohort,studentId,label] of [['18','offline','18기'],['17','managed','17기'],['lecture','lecture','기수 없음']]) {
      await evaluate(`document.querySelector('[data-member-cohort]').value='${cohort}';document.querySelector('[data-member-cohort]').dispatchEvent(new Event('change'))`);
      await wait(`document.querySelectorAll('[data-admin=book-add]').length===1 && document.querySelector('[data-admin=book-add]').dataset.id==='${studentId}'`);
      assert.equal(await evaluate(`document.querySelector('[data-members]').textContent.includes('${label}')`),true);
    }
    await evaluate("document.querySelector('[data-member-cohort]').value='unassigned';document.querySelector('[data-member-cohort]').dispatchEvent(new Event('change'))");
    await wait("document.querySelector('[data-members]').textContent.includes('검색 결과가 없습니다')");
    assert.equal(await evaluate("document.querySelector('[data-member-cohort]').options.length"),5);
    await evaluate("document.querySelector('[data-member-cohort]').value='';document.querySelector('[data-member-cohort]').dispatchEvent(new Event('change'))");
    await wait("document.querySelectorAll('[data-admin=book-add]').length===3");
    for(const search of ['RONPARK','score_alias']) {
      await evaluate(`document.querySelector('[name=memberSearch]').value='${search}';document.querySelector('[data-member-form]').requestSubmit()`);
      await wait("document.querySelectorAll('[data-admin=book-add]').length===1 && document.querySelector('[data-admin=book-add]').dataset.id==='managed'");
      assert.equal(await evaluate("document.querySelector('[data-members]').textContent.includes('인강 아이디: RonPark_18 / score_alias')"),true);
      await click('[data-admin=book-add][data-id=managed]');
      assert.equal(await evaluate("document.querySelector('[data-book-editor]').textContent.includes('인강 아이디: RonPark_18 / score_alias')"),true);
    }
    await evaluate("document.querySelector('[name=memberSearch]').value='';document.querySelector('[data-member-form]').requestSubmit()");
    await wait("document.querySelectorAll('[data-admin=book-add]').length===3");
    assert.equal(await evaluate("document.querySelector('[data-members]').textContent.includes('<b>LectureUser</b>') && !document.querySelector('[data-members] b')"),true);
    assert.equal(await evaluate("document.querySelector('[data-members]').textContent.includes('인강 아이디: 미등록')"),true);
    // Every category gets the same My manager before buying any OX book.
    for(const id of ['offline','managed','lecture']){
      await evaluate(`showStudent('${id}');navigate('mypage')`);
      assert.equal(await evaluate("document.querySelectorAll('[data-my-ox-devices]').length"),1);
      assert.equal(await evaluate("document.querySelector('.student-device-card')===null"),true);
      assert.equal(await evaluate("document.querySelector('[data-my-ox-devices] h2').textContent"),'기기 등록·관리');
      await click('[data-my-ox-devices]');await wait("document.querySelector('[data-device-registered]')");
      assert.equal(await evaluate("document.querySelector('.ox-device-panel').textContent.includes('OX')"),false);
      assert.equal(await evaluate("document.querySelector('[data-device-enter]')===null"),true,'No second registration for existing app devices');
      assert.equal((await evaluate("studentRequest('bootstrap')")).error,'ox_not_registered');
    }
    await evaluate("window.myPage=false;window.learning=false;document.querySelector('#student').replaceChildren();document.querySelector('#app').hidden=false;render()");
    await wait("document.querySelector('[data-member-form]')");
    await evaluate("document.querySelector('[name=registeredOnly]').value='false';document.querySelector('[data-member-form]').requestSubmit()");
    await wait("document.querySelectorAll('[data-admin=book-add]').length===3");
    // Exercise the real administrator form for all student categories, one different book each.
    for(const [index,id] of ['offline','managed','lecture'].entries()) {
      await click(`[data-admin=book-add][data-id=${id}]`);
      await click(`[name=book][value=${bookIds[index]}]`);
      await evaluate("document.querySelector('[name=reason]').value='학원 구매 확인';document.querySelector('[data-book-form]').requestSubmit()");
      await wait("document.querySelector('[data-member-message]').textContent.includes('등록을 완료')");
      await evaluate(`showStudent('${id}')`);
      const bootstrap=await evaluate("studentRequest('bootstrap')");
      assert.equal(bootstrap.catalog.questions.length,3);
      assert.equal(bootstrap.catalog.chapters[0].collection_id,bookIds[index]);
      assert.equal(bootstrap.catalog.collections.filter(c=>c.accessible).length,1);
    }
    await click('[data-admin=book-add][data-id=lecture]');
    assert.equal(await evaluate("document.querySelector('[name=book][value=criminal-procedure-trial]')===null"),true,'Active books cannot be purchased twice');
    for(const width of [390,1100]) {
      await send('Emulation.setDeviceMetricsOverride',{width,height:950,deviceScaleFactor:1,mobile:width<500});
      assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,`Admin overflow at ${width}`);
      const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync(path.join(dir,`admin-books-${width}.png`),Buffer.from(shot.data,'base64'));
    }
    await click('[data-admin=book-close]');
    await evaluate("showStudent('lecture');enterOx()");
    await wait("document.querySelector('#criminal-ox-preview .ox-content h2')?.textContent==='오늘 학습'");
    await click('[data-action=daily]');
    assert.equal(await evaluate("document.querySelector('[data-action=collection][aria-pressed=true]').dataset.id"),'criminal-procedure-trial');
    await click('[data-action=collection][data-id=criminal-law]');
    assert.equal(await evaluate("document.querySelector('.ox-content').textContent.includes('형법 이용 권한 확인 필요')"),true);
    assert.equal(await evaluate("document.querySelectorAll('[data-action=chapter]').length"),0);
    for(const width of [390,1100]) {
      await send('Emulation.setDeviceMetricsOverride',{width,height:950,deviceScaleFactor:1,mobile:width<500});
      assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,`Student overflow at ${width}`);
      const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(dir,`student-locked-${width}.png`),Buffer.from(shot.data,'base64'));
    }
    await click('[data-action=collection][data-id=criminal-procedure-trial]');
    await click('[data-action=chapter][data-id=c2]');await wait("document.querySelector('.ox-answer-grid')");
    await click('[data-action=answer][data-answer=X]');await wait("document.querySelector('.ox-explanation')");
    assert.equal(await evaluate("document.querySelector('.ox-explanation').textContent"),'로컬 검증 해설');
    await click('[data-action=next]');await wait("document.querySelector('.ox-answer-grid')");
    await invoke('admin_book_set',{type:'admin',id:'qa'},{memberId:'lecture',collectionIds:[bookIds[2]],active:false,reason:'구매 취소',revision:1});
    await click('[data-action=answer][data-answer=O]');await wait("document.querySelector('.ox-device-panel')?.textContent.includes('현재 이용 가능한 교재가 없습니다')");
    assert.equal(await evaluate("document.querySelector('.ox-answer-grid')===null"),true);
    await invoke('admin_book_set',{type:'admin',id:'qa'},{memberId:'lecture',collectionIds:[bookIds[2]],active:true,reason:'재개방',purchaseDate:'2026-01-01',revision:2});
    await click('[data-device-retry]');await wait("document.querySelector('.ox-content h2')?.textContent==='오늘 학습'");
    assert.equal((await evaluate("studentRequest('bootstrap')")).progress.length,1);
    // Additional purchases take effect through the explicit refresh control.
    await invoke('admin_book_set',{type:'admin',id:'qa'},{memberId:'lecture',collectionIds:[bookIds[0]],active:true,reason:'추가 구매',purchaseDate:'2026-01-01',revision:3});
    await click('[data-action=daily]');await click('[data-action=collection][data-id=criminal-law]');await click('[data-action=refresh-books]');
    await wait("document.querySelector('.ox-content h2')?.textContent==='오늘 학습'");
    await click('[data-action=daily]');assert.equal(await evaluate("document.querySelector('[data-action=collection][data-id=criminal-law]').textContent.includes('잠금')"),false);
    await evaluate("window.learning=false;window.myPage=false;document.querySelector('#app').hidden=false;document.querySelector('#student').replaceChildren();renderCriminalLawOxLocalPreview.view=null;render()");
    await wait("document.querySelector('[data-admin=book-stop][data-id=lecture]')");
    await click('[data-admin=book-stop][data-id=lecture]');await click('[name=book][value=criminal-law]');
    await evaluate("document.querySelector('[name=reason]').value='교재 반품 확인';document.querySelector('[data-book-form]').requestSubmit()");
    await wait("document.querySelector('[data-member-message]').textContent.includes('이용을 중지')");
    await click('[data-admin=book-history][data-id=lecture]');await wait("document.querySelector('[data-book-history]').textContent.includes('교재 반품 확인')");
    assert.equal((await invoke('bootstrap',{type:'student',id:'lecture'},{})).catalog.chapters.length,1);
    // Real device policy screens: second device takeover, self replacement, exception approval.
    const openDevice=async token=>{
      await evaluate(`renderCriminalLawOxLocalPreview.view?.controller?.destroy();renderCriminalLawOxLocalPreview.view=null;studentToken='${token}';showStudent('lecture');enterOx()`);
    };
    const openMyDevices=async()=>{await evaluate("navigate('mypage')");await click('[data-my-ox-devices]');await wait("document.querySelector('.ox-device-panel .ox-device-list')");};
    await db.query('select register_student_device($1,$2,$3,$4,$5)',['lecture','fixture-password',crypto.createHash('sha256').update('fixture-two').digest('hex'),'','태블릿']);
    await openDevice('fixture-two');
    await wait("document.querySelector('[data-device-enter]')?.textContent.includes('이 기기로 이어서')");
    await click('[data-device-enter]');await wait("document.querySelector('.ox-content h2')?.textContent==='오늘 학습'");
    assert.equal(await evaluate("document.querySelector('.ox-more-menu,[data-device-manage],[data-my-ox-devices]')===null"),true,'Learning has no device menu');
    await openMyDevices();await wait("document.querySelectorAll('.ox-device-list li').length===2");
    await evaluate("enterOx()");await wait("document.querySelector('.ox-content h2')?.textContent==='오늘 학습'");
    await openDevice('fixture-three');await evaluate("candidate()");await wait("document.querySelector('[data-device-replace]')");
    await evaluate("document.querySelector('[data-device-replace] [name=reason]').value='새 휴대폰 구매';document.querySelector('[data-device-replace]').requestSubmit()");
    await wait("document.querySelector('[data-device-enter]')?.textContent.includes('이 기기로 이어서')");await click('[data-device-enter]');
    await wait("document.querySelector('.ox-content h2')?.textContent==='오늘 학습'");
    await openDevice('fixture-four');await evaluate("candidate()");await wait("document.querySelector('[data-device-replace] button')?.textContent.includes('관리자에게')");
    await evaluate("document.querySelector('[data-device-replace] [name=reason]').value='기기 고장으로 추가 교체';document.querySelector('[data-device-replace]').requestSubmit()");
    await wait("document.querySelector('.ox-device-panel')?.textContent.includes('승인 대기 중')");
    for(const width of [390,1100]){
      await send('Emulation.setDeviceMetricsOverride',{width,height:950,deviceScaleFactor:1,mobile:width<500});
      assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,`Device form overflow at ${width}`);
      const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync(path.join(dir,`device-policy-${width}.png`),Buffer.from(shot.data,'base64'));
    }
    await evaluate("renderCriminalLawOxLocalPreview.view?.controller?.destroy();renderCriminalLawOxLocalPreview.view=null;window.learning=false;window.myPage=false;document.querySelector('#app').hidden=false;document.querySelector('#student').replaceChildren();render()");
    await wait("document.querySelector('[data-admin=device-requests]')");await click('[data-admin=device-requests]');
    await wait("document.querySelector('[data-device-review]')");
    await evaluate("document.querySelector('[data-device-review] [name=reason]').value='고장 확인 후 승인'");
    await click('[data-device-review] [value=approve]');
    await wait("document.querySelector('[data-book-editor]')?.textContent.includes('추가 교체 신청이 없습니다')");
    await openDevice('fixture-four');await wait("document.querySelector('[data-device-enter]')");
    await click('[data-device-enter]');await wait("document.querySelector('.ox-content h2')?.textContent==='오늘 학습'");
    assert.equal((await evaluate("studentRequest('bootstrap')")).progress.length,1,'Records survive approved device replacement');
    // Hide/reopen refreshes server records; detaching never leaves a heartbeat running.
    await evaluate("Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))");
    await wait("document.querySelector('.ox-device-panel')?.textContent.includes('학습 일시 대기')");
    await evaluate("Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'))");
    await wait("document.querySelector('.ox-content h2')?.textContent==='오늘 학습'");
    // Actual administrator flow for independent offline benefits.
    await evaluate("renderCriminalLawOxLocalPreview.view?.controller?.destroy();renderCriminalLawOxLocalPreview.view=null;window.learning=false;window.myPage=false;document.querySelector('#app').hidden=false;document.querySelector('#student').replaceChildren();render()");
    await click('[data-admin=grants]');await wait("document.querySelector('[data-grant-form]')");
    await evaluate("document.querySelector('[data-grant-form] [name=cohort]').value='18';document.querySelector('[data-grant-form] [name=reason]').value='18기 재원생 지원';document.querySelector('[data-grant-form]').requestSubmit()");
    await wait("document.querySelector('[data-grant-issue]')?.textContent.includes('1명')");
    assert.equal(await evaluate("document.querySelector('[data-book-editor]').textContent.includes('오프라인 예시')"),true);
    for(const width of [390,1100]){
      await send('Emulation.setDeviceMetricsOverride',{width,height:950,deviceScaleFactor:1,mobile:width<500});
      assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,`Grant review overflow at ${width}`);
      const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync(path.join(dir,`bulk-grants-${width}.png`),Buffer.from(shot.data,'base64'));
    }
    await click('[data-grant-issue]');await wait("document.querySelector('[data-grant-revoke]')");
    await evaluate("studentToken='fixture-token';showStudent('offline')");
    assert.equal((await evaluate("studentRequest('bootstrap')")).catalog.chapters.length,3,'Offline recipient gets all selected scopes');
    assert.equal((await invoke('bootstrap',{type:'student',id:'managed'},{})).catalog.chapters.length,1,'Online students receive no offline grant');
    await evaluate("document.querySelector('[data-grant-revoke] [name=reason]').value='지원 종료';document.querySelector('[data-grant-revoke]').requestSubmit()");
    await wait("document.querySelector('[data-book-editor]').textContent.includes('회수 사유: 지원 종료')");
    assert.equal((await evaluate("studentRequest('bootstrap')")).catalog.chapters.length,1,'Purchased scope survives batch revocation');
    await click('[data-grant-history]');await wait("document.querySelector('[data-grant-detail]')");
    await evaluate("renderCriminalLawOxLocalPreview.view?.controller?.destroy();renderCriminalLawOxLocalPreview.view=null;window.learning=false;window.myPage=false;document.querySelector('#app').hidden=false;document.querySelector('#student').replaceChildren();canWrite=false;render()");await wait("document.querySelector('[data-admin=book-add]')?.disabled");
    assert.equal(await evaluate("Array.from(document.querySelectorAll('[data-admin=book-add],[data-admin=book-stop],[data-admin=member-set]')).every(b=>b.disabled)"),true);
    await click('[data-admin=grants]');await wait("document.querySelector('[data-grant-new]')?.disabled");
    assert.equal(await evaluate("document.querySelector('[data-grant-form]')===null"),true,'Read-only admins can inspect history but not issue');
    assert.deepEqual(errors,[]);
    console.log('OX book browser QA passed: three student types; admin grant/stop/history; locked scopes; trial-first entry; revoke during quiz; restored records; refresh after extra purchase; read-only controls; 390px/1100px without overflow.');
  } finally {
    ws?.close();browser?.kill();if(server)await new Promise(r=>server.close(r));await db.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
