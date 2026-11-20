const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/W11/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {createDb}=require('./helpers/interview-db.cjs');
const {createHandler}=require('../api/interview-prep.js');
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts/interview-writing-save');
const id='qa-interview-only-writing',actor={type:'student',id},admin={type:'admin',id:'qa'};
const testNow=Date.parse('2026-11-24T09:00:00+09:00');
(async()=>{
 const {db,invoke}=await createDb();let browser,server,page;
 const report={engine:'Chrome desktop and mobile touch emulation',cases:[],errors:[]};
 try{
  // A new interview-only owner, with existing submissions and revisions.
  await db.query('insert into ip_owners(id,name) values($1,$2)',[id,'저장 확인용 계정']);
  await db.query("insert into ip_members(student_id,track,exam_number,enabled,expires_on) values($1,'항해','QA-SAVE',true,'2026-12-20')",[id]);
  await invoke('admin_enabled',{type:'admin',id:'qa'},{enabled:true});
  async function review(kind){
   const row=(await invoke('writing_list',actor)).writings.find(w=>w.kind===kind);
   if(!row?.awaiting_feedback)return row;
   return (await invoke('admin_writing_feedback',admin,{targetStudentId:id,kind,itemId:'',revision:row.revision,status:'approved',feedback:'가상 교사가 현재 제출을 확인했습니다.'})).writing;
  }
  for(const kind of ['introduction','motivation','public_service']){
   await invoke('writing_save',actor,{kind,itemId:'',revision:0,status:'submitted',text:'기존에 제출한 답변입니다.'});
   const checked=await review(kind);
   await invoke('writing_save',actor,{kind,itemId:'',revision:checked.revision,status:'submitted',text:'두 번째로 제출한 답변입니다.'});
   await review(kind);
   await db.query('update ip_writings set revision=12,submitted_revision=12,feedback_revision=12 where student_id=$1 and kind=$2',[id,kind]);
  }
  const handler=createHandler({authenticateWeb:async()=>({id}),invoke,now:()=>testNow});
  server=http.createServer(async(req,res)=>{
   const url=new URL(req.url,'http://localhost');
   if(url.pathname==='/api/interview-prep'){
    let raw='';for await(const chunk of req)raw+=chunk;
    req.body=JSON.parse(raw);
    if(req.body.action==='mock_status'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({ok:true,allowed:false}));}
    const wrapped={setHeader:(...args)=>res.setHeader(...args),status:n=>{res.statusCode=n;return wrapped;},json:v=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(v));}};
    return handler(req,wrapped);
   }
   if(url.pathname==='/qa'){
    res.setHeader('Content-Type','text/html; charset=utf-8');
    return res.end('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/interview-prep.css"><link rel="stylesheet" href="/interview-portal.css"><link rel="stylesheet" href="/interview-app.css"><body class="ip-portal"><div id="host"></div></body></html>');
   }
   const file=path.resolve(root,'.'+url.pathname);
   if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.statusCode=404;return res.end();}
   res.setHeader('Content-Type',file.endsWith('.js')||file.endsWith('.mjs')?'text/javascript':file.endsWith('.css')?'text/css':'application/octet-stream');res.end(fs.readFileSync(file));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  fs.mkdirSync(out,{recursive:true});
  for(const surface of ['portal','app'])for(const width of [390,1280]){
   for(const kind of ['introduction','motivation','public_service'])await review(kind);
   const mobile=width===390;
   const context=await browser.newContext({viewport:{width,height:900},isMobile:mobile,hasTouch:mobile});
   page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
   await page.addInitScript(now=>{const RealDate=Date;window.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}};},testNow);
   await page.goto('http://127.0.0.1:'+server.address().port+'/qa');
   await page.evaluate(async({surface,id})=>{
    const request=async(action,payload={})=>{const r=await fetch('/api/interview-prep',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,action})});const d=await r.json();if(!r.ok||!d.ok)throw Object.assign(Error(d.error),{code:d.error});return d;};
    const aiRequest=async()=>({ok:true,enabled:false,dbReady:false,requests:[]});
    if(surface==='app'){
     history.replaceState(null,'','#interview-prep?tab=writing&page=introduction');
     const {mountInterviewApp}=await import('/interview-app-ui.js');
     window.view=await mountInterviewApp(document.querySelector('#host'),{request,aiRequest,account:{id}});
    }else{
     const {mountWorkspace}=await import('/interview-workspace.js');
     window.view=await mountWorkspace(document.querySelector('#host'),{request,aiRequest,initialPage:'introduction'});
    }
   },{surface,id});
   const press=selector=>mobile?page.locator(selector).tap():page.locator(selector).click();
   for(const kind of ['introduction','motivation','public_service']){
    if(kind!=='introduction')await press('[data-workspace-page="'+kind+'"]');
    await page.locator('[data-writing-text]').waitFor();
    const before=(await invoke('writing_list',actor)).writings.find(w=>w.kind===kind);
    for(const status of ['draft','saved','submitted']){
     const text='수정된 답변 '+surface+' '+width+' '+kind+' '+status+' 입니다.';
     await page.locator('[data-writing-text]').fill(text);
     assert.equal(await page.locator('[data-writing-text]').evaluate(n=>n===document.activeElement),true);
     await press('[data-writing-save="'+status+'"]');
     const message=status==='draft'?'임시저장했습니다.':status==='saved'?'저장했습니다.':'교사에게 제출했습니다. 피드백을 기다려주세요.';
     await page.waitForFunction(text=>document.querySelector('[data-writing-message]')?.textContent===text,message,{timeout:5000});
     const saved=(await invoke('writing_list',actor)).writings.find(w=>w.kind===kind);
     assert.equal(saved.body,text);
     assert.equal(saved.revision,before.revision+['draft','saved','submitted'].indexOf(status)+1);
     assert.equal(saved.submitted_body,status==='submitted'?text:before.submitted_body);
     assert.equal(saved.submission_round,before.submission_round+(status==='submitted'?1:0));
     assert.equal(await page.locator('[data-writing-save="saved"]').isEnabled(),true);
     report.cases.push({surface,width,input:mobile?'touch':'mouse',kind,status,passed:true});
    }
    if(surface==='app'&&mobile&&kind==='introduction')await page.screenshot({path:path.join(out,'mobile-saved.png'),fullPage:true});
   }
   // Saving must not break navigation or leave a stale focus listener behind.
   if(surface==='app'){
    await press('[data-app-tab="my"]');
    await page.waitForFunction(()=>!!document.querySelector('.ip-app-profile'));
   }
   await page.evaluate(()=>window.view.destroy());await context.close();page=null;
  }
  assert.deepEqual(report.errors,[]);
  assert.equal(Number((await db.query('select count(*) n from students where id=$1',[id])).rows[0].n),0);
  fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(report,null,2));
  console.log('PASS writing save: '+report.cases.length+' browser cases; focused-answer touch/mouse draft/save/resubmit, interview-only owner, revision and submission preservation, navigation and no JS errors.');
 }catch(error){if(page)await page.screenshot({path:path.join(out,'failure.png'),fullPage:true});throw error;}
 finally{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
