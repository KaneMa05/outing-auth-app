const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.tmp/interview-my-resources-ui');fs.mkdirSync(out,{recursive:true});
const fixture={member:{name:'가상학생',track:'공채',exam_number:'PRIVATE-EXAM',expires_on:null},profile:{content:{basicInfo:{name:{text:'가상학생'},school:{text:'가상대학교',status:'graduated'}},experiences:[{age:'23',satisfaction:'0',title:'갈등 해결',content:'가상학생이 가상대학교에서 의견을 듣고 직접 조율했습니다.',appeal:'경청을 배웠습니다.'}]}}};
const html=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/interview-prep.css"><link rel="stylesheet" href="/interview-portal.css"><link rel="stylesheet" href="/interview-app.css"><div id="host"></div><script type="module">
import {mountInterviewApp} from '/interview-app-ui.js';import {mountWorkspace} from '/interview-workspace.js';
window.calls=[];window.failure='';window.delayed=false;window.resolvers=[];window.fixture=${JSON.stringify(fixture)};
const request=async action=>{window.calls.push(action);if(['life_get','diagnosis_get'].includes(action)&&window.delayed)await new Promise(r=>window.resolvers.push(r));if(['life_get','diagnosis_get'].includes(action)&&window.failure)throw Object.assign(Error(window.failure),{code:window.failure});if(action==='mock_status')return {allowed:false};if(action==='bootstrap')return {member:window.fixture.member};if(action==='life_get')return structuredClone(window.fixture);if(action==='diagnosis_get')return {answers:[{topic_id:'public',prompts:['왜 공익을 택했나요?'],answers:['안전을 우선했습니다.']}]};throw Error('Unexpected '+action);};
window.mount=async mode=>{window.view?.destroy();const host=document.querySelector('#host');host.replaceChildren();history.replaceState(null,'',mode==='app'?'#interview-prep?tab=my':'#my');window.calls=[];window.view=await(mode==='app'?mountInterviewApp:mountWorkspace)(host,{request,account:{id:'fake-owner',name:'가상학생'},initialPage:'my',aiRequest(){throw Error('AI must never be called');}});};window.ready=true;
</script>`;
let server,browser,ws;
(async()=>{try{
 server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/'){res.setHeader('Content-Type','text/html;charset=utf-8');res.end(html);return;}
  const file=path.resolve(root,'.'+pathname);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!['.js','.mjs','.css'].includes(path.extname(file))){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',file.endsWith('.css')?'text/css':'application/javascript');res.end(fs.readFileSync(file));
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 browser=spawn(process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+path.join(out,'browser-'+Date.now()),'about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
 const debug=await new Promise((resolve,reject)=>{let text='';const timeout=setTimeout(()=>reject(Error('Chrome timeout')),15000);browser.stderr.on('data',part=>{text+=part;const m=text.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m){clearTimeout(timeout);resolve(m[1]);}});browser.on('error',reject);});
 const tabs=await(await fetch('http://'+new URL(debug).host+'/json',{signal:AbortSignal.timeout(8000)})).json();ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));
 let id=0;const pending=new Map(),errors=[];
 ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);});
 const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>{pending.delete(n);reject(Error('CDP timeout '+method));},15000);pending.set(n,{resolve(v){clearTimeout(timer);resolve(v);},reject(e){clearTimeout(timer);reject(e);}});ws.send(JSON.stringify({id:n,method,params}));});
 const ev=async expression=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
 const wait=async expression=>{for(let n=0;n<160;n++){if(await ev(expression))return;await new Promise(r=>setTimeout(r,40));}throw Error('Timeout '+expression);};
 const click=selector=>ev('document.querySelector('+JSON.stringify(selector)+').click()');
 const trustedClick=async selector=>{const point=await ev('(()=>{const b=document.querySelector('+JSON.stringify(selector)+');b.scrollIntoView({block:"center"});const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()');await send('Page.bringToFront');for(const type of ['mousePressed','mouseReleased'])await send('Input.dispatchMouseEvent',{type,...point,button:'left',clickCount:1});};
 const shot=async(name,width)=>{await send('Emulation.setDeviceMetricsOverride',{width,height:1200,deviceScaleFactor:1,mobile:false});await new Promise(r=>setTimeout(r,100));assert.equal(await ev('document.documentElement.scrollWidth>innerWidth'),false,name+' overflow');const result=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(result.data,'base64'));};
 await send('Runtime.enable');await send('Page.enable');await send('Browser.grantPermissions',{origin:base,permissions:['clipboardReadWrite','clipboardSanitizedWrite']});await send('Page.navigate',{url:base});await wait('window.ready===true');
 for(const mode of ['web','app']){
  await ev('window.mount('+JSON.stringify(mode)+')');await wait('!!document.querySelector("[data-my-export-open]")');
  assert.deepEqual(await ev('window.calls'),mode==='web'?['bootstrap']:['mock_status','bootstrap']);
  assert.equal(await ev('document.querySelectorAll("[data-my-guide]").length'),5);
  await shot(mode+'-my',mode==='web'?1200:390);
  await click('[data-my-export-open]');await wait('!document.querySelector("[data-my-export-preview]").hidden');
  const exported=await ev('document.querySelector("[data-my-export-text]").value');assert.match(exported,/만족도: 0점/);assert.match(exported,/질문: 왜 공익을 택했나요\?\n답변: 안전을 우선했습니다\./);assert.doesNotMatch(exported,/가상학생|가상대학교|PRIVATE-EXAM|공통 원칙|AI 지침/);
  await trustedClick('[data-my-export-copy]');await wait('document.querySelector("[data-my-export-message]").textContent.startsWith("복사했습니다.")');assert.equal((await ev('navigator.clipboard.readText()')).replace(/\r\n/g,'\n'),exported);await shot(mode+'-db-copy',mode==='web'?1200:390);
  const calls=await ev('window.calls');
  for(const role of ['experience_coach','answer_coach','interviewer','review_coach','fact_checker']){
   await click('[data-my-guide='+role+']');const guide=await ev('document.querySelector("[data-my-guide-text]").value');assert.match(guide,/^\[역할:/);assert.doesNotMatch(guide,/PRIVATE-EXAM|가상학생/);await trustedClick('[data-my-guide-copy]');await wait('document.querySelector("[data-my-guide-message]").textContent.startsWith("복사했습니다.")');assert.equal((await ev('navigator.clipboard.readText()')).replace(/\r\n/g,'\n'),guide);
  }
  assert.deepEqual(await ev('window.calls'),calls,'Role selection and copying make no backend/AI requests');
  await shot(mode+'-role-guide',mode==='web'?1200:320);
  await ev("Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>Promise.reject(Error('denied'))}})");await click('[data-my-export-copy]');await wait('document.querySelector("[data-my-export-message]").dataset.error==="true"');await click('[data-my-export-select]');assert.equal(await ev('(()=>{const t=document.querySelector("[data-my-export-text]");return t.selectionEnd-t.selectionStart})()'),exported.length);await ev('delete navigator.clipboard');
  await ev("window.failure='unauthorized'");await click('[data-my-export-open]');await wait('document.querySelector("[data-my-load-message]").textContent.includes("로그인이 만료")');assert.equal(await ev('document.querySelector("[data-my-export-text]").value'),'');assert.equal(await ev('document.querySelector("[data-my-export-preview]").hidden'),true);
  await ev("window.failure='';window.fixture.profile.content.experiences=[]");await click('[data-my-export-open]');await wait('document.querySelector("[data-my-load-message]").textContent.includes("작성하고 저장")');assert.equal(await ev('document.querySelector("[data-my-export-text]").value'),'');
  await ev('window.fixture='+JSON.stringify(fixture));await ev('window.delayed=true');await click('[data-my-export-open]');await wait('window.resolvers.length===2');await ev('window.view.destroy();window.resolvers.splice(0).forEach(resolve=>resolve());window.delayed=false');await new Promise(r=>setTimeout(r,60));assert.equal(await ev('document.querySelector("[data-my-export-text]")?.value||""'),'','Disposed request cannot restore personal text');
 }
 assert.deepEqual(errors,[]);console.log('PASS real app/web My: lazy own-DB reads, masked export, zero and saved question pairing, 5 separate role copies, actual clipboard equality, denial/manual selection, authentication failure, empty DB, stale-load disposal, 320/390/1200px and no AI/backend mutations.');
}finally{if(ws)ws.close();if(browser)browser.kill();if(server)server.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
