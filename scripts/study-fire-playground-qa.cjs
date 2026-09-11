const fs=require('node:fs'),path=require('node:path');
const {spawn}=require('node:child_process');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'tmp/study-fire-playground-qa');
fs.mkdirSync(dir,{recursive:true});
const browser=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=9357',`--user-data-dir=${path.join(dir,'browser')}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 let tabs;for(let i=0;i<60;i++){try{tabs=await(await fetch('http://127.0.0.1:9357/json')).json();break}catch{await delay(250)}}if(!tabs)throw new Error('Browser unavailable');
 const ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));
 const pending=new Map();let id=0;ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result)}});
 const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}))});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value};
 const assert=(value,message)=>{if(!value)throw new Error(message)};
 await send('Page.enable');await send('Page.navigate',{url:pathToFileURL(path.join(root,'docs/study-character-progression/playground/index.html')).href});await delay(350);
 const problems=await evaluate(`(()=>{const failures=[];const check=(v,m)=>{if(!v)failures.push(m)};const avatar=document.querySelector('#hero .study-cafe-avatar');
 [0,3,5,7,9,10].forEach((h,i)=>{document.querySelector('#stage-buttons [data-hour="'+h+'"]').click();check(document.querySelector('#hero .study-cafe-fire').dataset.studyFireStage===String(i),'preset '+h)});
 check(avatar===document.querySelector('#hero .study-cafe-avatar'),'DOM preservation');
 document.querySelectorAll('#comparison .study-cafe-fire').forEach((f,i)=>check(f.dataset.studyFireStage===String(i),'comparison '+i));
 for(const h of [3,5,7,9,10]){document.getElementById('threshold').value=String(h);document.getElementById('before').click();check(document.querySelector('#hero .study-cafe-fire').dataset.studyFireStage===String([3,5,7,9,10].indexOf(h)),'before '+h);document.getElementById('exact').click();check(document.querySelector('#hero .study-cafe-fire').dataset.studyFireStage===String([3,5,7,9,10].indexOf(h)+1),'at '+h);document.getElementById('after').click()}
 document.getElementById('time-input').value='07:15:30';document.getElementById('apply-time').click();check(document.getElementById('time-display').textContent==='07:15:30','custom time');
 document.getElementById('time-input').value='12:00:01';document.getElementById('apply-time').click();check(document.getElementById('time-display').textContent==='07:15:30'&&document.getElementById('time-error').textContent.length>0,'invalid time');
 document.getElementById('pause').click();check(!document.querySelector('#hero .study-cafe-fire').classList.contains('is-running'),'pause motion');check(document.querySelector('#hero .study-cafe-fire').dataset.studyFireStage==='3','pause stage');document.getElementById('pause').click();
 document.getElementById('hair').value='ponytail';document.getElementById('hair').dispatchEvent(new Event('change'));document.getElementById('equipment').click();check(!!document.querySelector('#hero .item-head-coast-guard-dress-cap'),'equipment');check(!!document.querySelector('#hero [data-hair-style="ponytail"]'),'hair');
 document.getElementById('equipment').click();document.getElementById('hair').value='default';document.getElementById('hair').dispatchEvent(new Event('change'));
 document.querySelector('#comparison [data-hour="9"]').click();check(document.getElementById('time-display').textContent==='09:00:00','seat click');return failures})()`);
 assert(!problems.length,problems.join(', '));console.log('Presets, all boundaries, custom/invalid time, pause, equipment, comparison clicks and DOM preservation passed.');
 await evaluate(`document.getElementById('threshold').value='3';document.getElementById('crossing').click()`);await delay(4700);
 assert(await evaluate(`document.querySelector('#hero .study-cafe-fire').dataset.studyFireStage==='1'&&!document.getElementById('auto').checked`),'Timed threshold crossing');
 await evaluate(`document.querySelector('#stage-buttons [data-hour="0"]').click();document.getElementById('speed').value='3600';document.getElementById('auto').click()`);await delay(450);
 assert(await evaluate(`ownSeconds>300`),'Fast clock');
 await evaluate(`document.getElementById('pause').click();window.pausedSeconds=ownSeconds`);await delay(350);
 assert(await evaluate(`ownSeconds===window.pausedSeconds`),'Paused clock');
 await evaluate(`document.getElementById('auto').checked=false;document.getElementById('pause').click();document.querySelector('#stage-buttons [data-hour="10"]').click()`);
 console.log('Automatic boundary crossing, fast clock and paused clock passed.');
 for(const width of [390,1100]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1.5,mobile:false});await delay(900);
  assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'Horizontal overflow '+width);
  const h=await evaluate('document.documentElement.scrollHeight');const {data}=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width,height:h,scale:1}});
  fs.writeFileSync(path.join(root,`docs/study-character-progression/playground/preview-${width}.png`),Buffer.from(data,'base64'));console.log(width+'px layout passed');
 }
 await send('Browser.close').catch(()=>{});ws.close();
})().catch(e=>{console.error(e);browser.kill();process.exitCode=1});
