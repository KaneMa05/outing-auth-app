const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');

(async()=>{
 const baseline=process.env.PRACTICE_ENTRY_REF;
 const root=process.cwd(),output=path.join(root,'.tmp/practice-entry-review'+(baseline?'-baseline':''));fs.mkdirSync(output,{recursive:true});
 const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://local').pathname;
  if(pathname==='/qa'){res.setHeader('Content-Type','text/html');return res.end('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/interview-prep.css"><link rel="stylesheet" href="/interview-portal.css"><link rel="stylesheet" href="/interview-app.css"><body style="margin:0" class="ip-portal ip-portal-app"><main id="host"></main><div style="height:1200px" aria-hidden="true"></div></body></html>');}
  const file=path.resolve(root,'.'+pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.statusCode=404;return res.end();}
  res.setHeader('Content-Type',/\.m?js$/.test(file)?'text/javascript':file.endsWith('.css')?'text/css':'application/json');
  try{res.end(baseline?execFileSync('git',['show',baseline+':'+path.relative(root,file).replaceAll('\\','/')],{cwd:root,stdio:['ignore','pipe','pipe']}):fs.readFileSync(file));}catch{res.statusCode=404;res.end();}
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required']});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844}});await context.grantPermissions([],{origin});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  let releaseCSS;const cssGate=new Promise(resolve=>releaseCSS=resolve);
  await page.route('**/client/interview-practice.css?*',async route=>{await cssGate;await route.continue();});
  await page.goto(origin+'/qa');
  await page.evaluate(async()=>{
   window.calls=[];window.bootstrapDelay=250;
   Object.defineProperty(window,'speechSynthesis',{value:{cancel(){},speak(value){setTimeout(()=>value.onend(),20);}},configurable:true});
   window.mount=async mode=>{
    window.view?.destroy();location.hash='#interview-prep?tab=mock'+(mode?'&mockMode='+mode:'');
    const {mountInterviewApp}=await import('/interview-app-ui.js');
    window.view=await mountInterviewApp(document.querySelector('#host'),{
     account:{id:'entry-qa',accessProduct:'interview_package'},
     request:async action=>{if(window.slowAccess)await new Promise(resolve=>setTimeout(resolve,250));return {ok:true,betaAllowed:true};},
     aiRequest:async(url,body)=>{
      window.calls.push({url,...body});
      if(body.action==='practice_bootstrap'){
       await new Promise(resolve=>setTimeout(resolve,window.bootstrapDelay));
       return {ok:true,accountId:'entry-qa',mode:body.mode,track:'공채',fields:[],questions:[{id:body.mode+'-q',prompt:'면접 연습 질문입니다.',category:body.mode,fieldIds:[],regions:[]}]};
      }
      if(url==='/api/interview-practice-records')return {ok:true,uploads:[]};
      throw Error('Unexpected API');
     }
    });
   };
   await window.mount('');
   window.slowAccess=true;window.scrollTo({top:80,behavior:'instant'});
   window.frames=[];window.watchFrames=true;
   const sample=()=>{if(!window.watchFrames)return;const host=document.querySelector('#host');window.frames.push({scroll:scrollY,mode:new URLSearchParams(location.hash.split('?')[1]).get('mockMode'),menu:!!host.querySelector('.ip-mock-menu'),placeholder:host.textContent.includes('준비 중입니다.'),loading:!!host.querySelector('.ip-app-practice-loading'),screen:host.querySelector('[data-practice-screen]')?.dataset.practiceScreen,titleTop:host.querySelector('.ip-mock-practice-title h2,.ip-app-practice-loading h2')?.getBoundingClientRect().top});requestAnimationFrame(sample);};requestAnimationFrame(sample);
  });
  assert.equal(await page.evaluate(()=>scrollY),80);
  await page.locator('[data-app-mock=job]').click();await page.waitForTimeout(650);
  await page.screenshot({path:path.join(output,'job-loading.png')});
  const beforeCSS=await page.evaluate(()=>({loading:!!document.querySelector('.ip-app-practice-loading'),screen:document.querySelector('[data-practice-screen]')?.dataset.practiceScreen,scroll:scrollY}));
  releaseCSS();await page.locator('[data-practice-action=configured]:enabled').waitFor();
  const frames=await page.evaluate(()=>{window.watchFrames=false;return window.frames.filter(f=>f.mode==='job');});
  fs.writeFileSync(path.join(output,baseline?'baseline-transition.json':'transition.json'),JSON.stringify({beforeCSS,frames},null,2));
  assert.equal(beforeCSS.loading,true,'show one stable loading frame while the stylesheet is pending');
  assert.equal(beforeCSS.screen,undefined,'do not paint the preparation UI before its stylesheet');
  assert.equal(beforeCSS.scroll,0,'reset previous list scroll before awaiting access or data');
  assert(frames.length>0);assert(frames.every(f=>f.scroll===0&&!f.menu&&!f.placeholder),'no clipped list or coming-soon flash during mode entry');
  const top=await page.locator('.ip-mock-practice-title h2').evaluate(n=>n.getBoundingClientRect().top);
  assert(frames.filter(f=>f.loading).every(f=>Math.abs(f.titleTop-top)<1),'loading and loaded titles keep the same position');
  await page.screenshot({path:path.join(output,'job-ready.png')});

  assert.equal(await page.evaluate(async()=> (await navigator.permissions.query({name:'microphone'})).state),'denied');
  for(const mode of ['job','personality']){
   if(mode==='personality')await page.evaluate(()=>window.mount('personality'));
   const before=await page.evaluate(()=>window.calls.filter(c=>c.action==='sync').length);
   await page.locator('[data-practice-action=configured]:enabled').click();
   await page.getByRole('status').filter({hasText:'마이크 사용을 허용해야'}).waitFor();
   assert.equal(await page.locator('[data-practice-screen=home]').count(),1);
   assert.equal(await page.locator('[data-practice-screen=live],.is-countdown').count(),0);
   assert.equal(await page.locator('[data-practice-action=configured]').isEnabled(),true);
   assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.action==='sync').length),before,'denial must not create/upload a run');
   await page.screenshot({path:path.join(output,mode+'-denied.png')});
  }
  // A resolved getUserMedia promise must contain a usable audio track as well.
  await page.evaluate(()=>{window.realMic=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async()=>new MediaStream();});
  await page.locator('[data-practice-action=configured]').click();await page.getByRole('status').filter({hasText:'사용 가능한 마이크가 없습니다'}).waitFor();
  assert.equal(await page.locator('[data-practice-screen=home]').count(),1);
  await page.evaluate(()=>navigator.mediaDevices.getUserMedia=window.realMic);
  await context.grantPermissions(['microphone'],{origin});
  await page.locator('[data-practice-action=configured]').click();await page.locator('.is-countdown').waitFor();
  await page.locator('[data-practice-action=answer]:enabled').waitFor();
  page.once('dialog',dialog=>dialog.accept());await page.locator('[data-practice-action=end]').click();await page.locator('[data-practice-screen=result]').waitFor();
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('PASS practice entry: delayed CSS/data keep a stable top-aligned screen; real browser microphone denial blocks both modes and creates no run; missing track blocks; granting permission retries successfully.');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
