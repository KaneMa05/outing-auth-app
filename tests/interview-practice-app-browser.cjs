const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const root=process.cwd(),output=path.join(root,'.tmp/practice-app-ui-review');fs.mkdirSync(output,{recursive:true});
 const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://local').pathname;
  if(pathname==='/qa'){res.setHeader('Content-Type','text/html');return res.end('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/interview-prep.css"><link rel="stylesheet" href="/interview-app.css"><body style="margin:0" class="ip-portal ip-portal-app"><main id="host"></main></body></html>');}
  const file=path.resolve(root,'.'+pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.statusCode=404;return res.end();}
  res.setHeader('Content-Type',/\.m?js$/.test(file)?'text/javascript':file.endsWith('.css')?'text/css':'application/json');res.end(fs.readFileSync(file));
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required']});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://qa.supabase.co/**',route=>route.fulfill({status:200}));
  await page.goto('http://127.0.0.1:'+server.address().port+'/qa');
  await page.evaluate(()=>{
   Object.defineProperty(window,'speechSynthesis',{value:{cancel(){},speak(value){setTimeout(()=>value.onend(),window.speechDelay||20);}},configurable:true});
   window.calls=[];window.account='a';
   window.mount=async(mode,tab='mock')=>{
    window.view?.destroy();location.hash='#interview-prep?tab='+tab+(mode?'&mockMode='+mode:'');
    const {mountInterviewApp}=await import('/interview-app-ui.js');
    window.view=await mountInterviewApp(document.querySelector('#host'),{account:{id:window.account,accessProduct:'interview_package'},request:async action=>{window.calls.push({action});return {ok:true,allowed:false,betaAllowed:true};},aiRequest:async(url,body)=>{
     window.calls.push({url,...body});
     if(body.action==='practice_bootstrap'){if(window.failBootstrap)throw Error('network');return {ok:true,accountId:window.account,mode,track:'공채',fields:[{id:'coast_guard',label:'공통 직무'},{id:'teamwork',label:'협동심·팀워크'}],questions:[1,2,3].map(i=>({id:mode+'-q-'+i,prompt:mode==='job'?'해양경찰의 주요 임무를 설명해주세요.':'함께 협력해 문제를 해결한 경험을 말해주세요.',category:mode,tracks:['공채'],fieldIds:[mode==='job'?'coast_guard':'teamwork'],regions:['서해']}))};}
     if(url!=='/api/interview-practice-records')throw Error('Unexpected production API '+url);
     return {ok:true,uploads:body.action==='sync'?body.turns.map(t=>({number:t.number,audioHash:t.audioHash,url:'https://qa.supabase.co/storage/v1/object/upload/sign/interview-practice/'+body.runId+'/'+t.number+'-'+t.audioHash+'.'+({'audio/mp4':'m4a','audio/webm':'webm','audio/ogg':'ogg'}[t.audioMime])+'?token=fixture'})):[]};
    }});
   };
  });
  await page.evaluate(()=>window.mount(''));
  const badge=page.locator('.ip-app-beta-label');assert.equal(await badge.count(),1);
  const position=await badge.evaluate(n=>({badge:n.getBoundingClientRect().toJSON(),title:n.nextElementSibling.getBoundingClientRect().toJSON()}));assert(position.badge.bottom<=position.title.top);assert(Math.abs(position.badge.left-position.title.left)<1);
  assert.equal(await page.locator('.ip-mock-menu .ip-badge').count(),0);await page.screenshot({path:path.join(output,'menu.png'),fullPage:true});
  for(const mode of ['job','personality']){
   await page.evaluate(mode=>window.mount(mode),mode);await page.locator('[data-practice-action=configured]:enabled').waitFor();
   assert.equal(await page.locator('[data-pilot]').count(),0);assert.equal(await page.locator('.ip-app-footer').isVisible(),false);
   assert.equal(await page.locator('[data-practice-field]').count(),1);assert.equal(await page.locator('[data-practice-region]').count(),mode==='job'?1:0);
   const titlePlacement=await page.locator('.ip-mock-practice-beta').evaluate(n=>({badge:n.getBoundingClientRect().toJSON(),title:n.nextElementSibling.querySelector('h2').getBoundingClientRect().toJSON()}));assert(titlePlacement.badge.bottom<titlePlacement.title.top);assert.equal(titlePlacement.badge.left,titlePlacement.title.left);
   for(const width of [320,390,844]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:path.join(output,mode+'-preparation-'+width+'.png'),fullPage:true});}
   await page.setViewportSize({width:390,height:844});
   await page.locator('[data-practice-action=catalog]').click();await page.locator('[data-practice-action=favorite]').first().click();await page.locator('[data-practice-action=stars]').click();assert.equal(await page.locator('[data-practice-action=one]').count(),1);await page.locator('[data-practice-action=back]').click();
   await page.locator('[data-practice-field]').selectOption(mode==='job'?'coast_guard':'teamwork');if(mode==='job')await page.locator('[data-practice-region]').selectOption('서해');
   await page.locator('[data-practice-count]').selectOption('3');await page.locator('[data-practice-action=configured]').click();
   await page.locator('.is-countdown').waitFor();assert.equal(await page.locator('[data-practice-action=answer]').isDisabled(),true);
   for(let i=0;i<3;i++){
    await page.locator('[data-practice-action=answer]:enabled').waitFor();assert.equal(await page.evaluate(()=>window.view.canLeave()),false);
    await page.waitForTimeout(1100);
    if(i===0){await page.locator('[data-practice-action=replay]').click();await page.locator('[data-practice-action=answer]:enabled').waitFor();await page.screenshot({path:path.join(output,mode+'-live.png'),fullPage:true});}
    await page.locator('[data-practice-action=answer]').click();
    if(mode==='job'){await page.locator('[data-practice-screen=review]').waitFor();assert.equal(await page.locator('audio').count(),1);assert.equal(await page.evaluate(()=>window.view.canLeave()),false);if(i===0)await page.screenshot({path:path.join(output,'job-review.png'),fullPage:true});await page.locator('[data-practice-action=next]').click();}
   }
   await page.locator('[data-practice-screen=result]').waitFor();assert.equal(await page.locator('audio').count(),3);
   await page.locator('audio').first().evaluate(a=>a.play());await page.waitForFunction(()=>document.querySelector('audio').currentTime>0);
   await page.waitForFunction(mode=>window.calls.some(c=>c.action==='sync'&&c.mode===mode&&c.completed&&c.turns.length===3),mode);
   await page.screenshot({path:path.join(output,mode+'-result.png'),fullPage:true});
   await page.locator('[data-practice-action=records]').click();await page.locator('[data-practice-screen=records]').waitFor();assert.equal(await page.locator('[data-practice-action=record]').count(),1);await page.screenshot({path:path.join(output,mode+'-records.png'),fullPage:true});
   await page.locator('[data-practice-action=record]').click();await page.locator('[data-practice-action=back]').click();await page.locator('[data-practice-screen=records]').waitFor();
   await page.evaluate(async mode=>{window.account='b';await window.mount(mode);},mode);await page.locator('[data-practice-action=records]').click();assert.equal(await page.locator('[data-practice-action=record]').count(),0);await page.evaluate(()=>window.account='a');
  }
  await page.evaluate(async()=>{window.failBootstrap=true;await window.mount('job');});
  await page.locator('[data-practice-action=retry]').waitFor();assert.equal(await page.locator('[data-practice-action=configured]').isDisabled(),true);
  await page.evaluate(()=>window.failBootstrap=false);await page.locator('[data-practice-action=retry]').click();await page.locator('[data-practice-action=configured]:enabled').waitFor();
  await page.evaluate(async()=>{window.originalMic=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);window.delayedStream=await window.originalMic({audio:true});navigator.mediaDevices.getUserMedia=()=>new Promise(resolve=>window.resolveMic=resolve);});
  await page.locator('[data-practice-action=configured]').click();await page.waitForFunction(()=>typeof window.resolveMic==='function');await page.locator('[data-practice-action=back]').click();
  await page.evaluate(()=>{window.resolveMic(window.delayedStream);navigator.mediaDevices.getUserMedia=window.originalMic;});await page.waitForFunction(()=>window.delayedStream.getTracks().every(t=>t.readyState==='ended'));assert.equal(await page.locator('[data-practice-screen=home]').count(),1);
  await page.locator('[data-practice-action=configured]').click();await page.locator('.is-countdown').waitFor();
  await page.evaluate(()=>{window.qaHidden=true;Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.qaHidden});document.dispatchEvent(new Event('visibilitychange'));});
  await page.locator('[data-practice-screen=result]').waitFor();await page.waitForTimeout(3200);assert.equal(await page.locator('[data-practice-screen=result]').count(),1);assert.equal(await page.locator('audio').count(),0);
  await page.evaluate(()=>{window.qaHidden=false;document.dispatchEvent(new Event('visibilitychange'));});
  await page.evaluate(()=>window.mount('personality'));await page.locator('[data-practice-action=configured]:enabled').waitFor();await page.locator('[data-practice-action=configured]').click();await page.locator('[data-practice-action=answer]:enabled').waitFor();await page.waitForTimeout(1100);
  await page.evaluate(()=>window.speechDelay=2000);await page.locator('[data-practice-action=replay]').click();await page.waitForFunction(()=>document.querySelector('[data-live-status]').textContent.includes('질문'));
  page.once('dialog',dialog=>dialog.accept());await page.locator('[data-practice-action=end]').click();await page.locator('[data-practice-screen=result]').waitFor();assert.equal(await page.locator('audio').count(),1);
  await page.evaluate(async()=>{
   window.speechDelay=20;window.signalContext=new AudioContext();await window.signalContext.resume();window.signalGain=window.signalContext.createGain();window.signalGain.gain.value=0;
   const oscillator=window.signalContext.createOscillator(),destination=window.signalContext.createMediaStreamDestination();oscillator.connect(window.signalGain);window.signalGain.connect(destination);oscillator.start();
   navigator.mediaDevices.getUserMedia=async()=>destination.stream;await window.mount('job');
  });
  await page.locator('[data-practice-action=configured]:enabled').waitFor();await page.locator('[data-practice-action=configured]').click();await page.locator('[data-practice-action=answer]:enabled').waitFor();
  await page.waitForTimeout(4800);assert.equal(await page.locator('[data-practice-screen=live]').count(),1);assert.match(await page.locator('.ip-mock-practice-turn').innerText(),/질문 1 \/ 3/);
  await page.getByRole('status').filter({hasText:'마이크 입력이 확인되지 않습니다'}).waitFor();
  await page.evaluate(()=>window.signalGain.gain.value=.15);await page.waitForTimeout(1000);await page.evaluate(()=>window.signalGain.gain.value=0);
  await page.locator('[data-practice-screen=review]').waitFor({timeout:7000});assert.equal(await page.locator('audio').count(),1);
  page.once('dialog',dialog=>dialog.accept());await page.locator('[data-practice-action=end]').click();await page.locator('[data-practice-screen=result]').waitFor();
  await page.evaluate(async()=>{navigator.mediaDevices.getUserMedia=window.originalMic;await window.signalContext.close();});
  assert.equal(await page.evaluate(()=>window.calls.some(c=>/interview-(openai|live|job-exam|personality|native)/.test(c.url||''))),false);
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('PASS app recording: original UI and lifecycle; silent input stays on question one and warns; sustained input followed by four seconds of silence advances; replay/audio/history/upload/account isolation preserved. No production writes or paid APIs.');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
