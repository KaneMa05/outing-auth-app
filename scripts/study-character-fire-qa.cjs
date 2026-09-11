// Local browser QA against the real render functions and styles; no app/API requests.
const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {pathToFileURL} = require('node:url');
const root = path.resolve(__dirname,'..');
const dir = path.join(root,'tmp/study-fire-qa');
fs.mkdirSync(dir,{recursive:true});
const app = fs.readFileSync(path.join(root,'app.js'),'utf8');
const shared = fs.readFileSync(path.join(root,'shared.js'),'utf8');
function extract(source,name) {
  const start=source.indexOf(`function ${name}(`);
  if(start<0)throw new Error(name);
  const rest=source.slice(start),end=rest.search(/\n(?:async )?function /);
  return end<0?rest:rest.slice(0,end);
}
const funcs=['renderStudyCafeAvatar','renderStudyCafeHair','renderStudyCafeSeatedVisual','renderStudyCafeChairBack','renderStudyCafeWritingArms','getStudyCafePublicEquipmentClass','renderStudyCafePublicCosmetics','isStudyCafeFireEnabled','getStudyCafeFireSeconds','renderStudyCafeFire','updateStudyCafeFireNode','renderStudyCafeFireProgress','updateStudyCafeFireProgress','updateStudyCafeFireStages','formatStudyBusinessDateKey'];
fs.writeFileSync(path.join(dir,'index.html'),`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="../../styles.css"><link rel="stylesheet" href="../../study-character-fire.css"><script src="../../study-character.js"></script><style>body{margin:0!important;padding:16px!important;background:#e9f0f2!important}body::after{display:none!important}.qa-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;margin:16px auto;max-width:420px;--room-seat:#fafbf5;--room-ink:#203c49;--room-accent:#477f8c}.qa-seat{height:122px;min-width:0}.qa-title{text-align:center;font-size:14px}.qa-details{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;max-width:850px;margin:auto}.qa-detail{min-width:0}.qa-detail .study-cafe-member-avatar-stage{background:#fff}.qa-my{position:relative;width:78px;height:122px;background:#fff;margin:auto}.qa-my .study-cafe-my-seat-scene{inset:0}.study-character-fire-progress{max-width:390px;margin:15px auto}@media(max-width:500px){.qa-details{grid-template-columns:1fr}}</style><body data-app-mode="teacher"><h1 class="qa-title">실제 캐릭터 렌더러 · 3 / 5 / 7 / 9 / 10시간</h1><div id="grid" class="qa-grid"></div><div id="mine" class="qa-my"></div><div id="progress"></div><div id="details" class="qa-details"></div><script>
${extract(shared,'el')}
${funcs.map(n=>extract(app,n)).join('\n')}
let category='lecture', ownSeconds=36000;
const getAuthedStudent=()=>({student_category:category});
const getStudentCategory=s=>s.student_category;
const getStudySubjectTotalElapsedMs=()=>ownSeconds*1000;
const STUDY_CAFE_PREVIEW_EPOCH=Date.now();
const studyCafeRemoteState={lastLoadedAt:Date.now(),studyDateKey:formatStudyBusinessDateKey(new Date())};
const studyCafePreviewState={running:true,hairStyle:'ponytail'};
const gear=[{id:'outfit_coast_guard_uniform',slot:'outfit'},{id:'head_coast_guard_dress_cap',slot:'head',icon:'🧢'},{id:'desk_plant',slot:'desk',icon:'🪴'},{id:'desk_lamp',slot:'desk',icon:'💡'},{id:'desk_clock',slot:'desk',icon:'⏰'},{id:'desk_laptop',slot:'desk',icon:'💻'}];
const getStudyCafeEquippedOutfitClass=()=> 'shop-outfit-coast-guard-uniform';
const getStudyCafeEquippedChairClass=()=> '';
const renderStudyCafeShopCosmetic=slot=>renderStudyCafePublicCosmetics(gear,slot);
const renderStudyCafeDeskCosmetics=()=>renderStudyCafePublicCosmetics(gear,'desk');
function scene(hours,hair='default',equipment=[],mine=false,detail=false){return renderStudyCafeSeatedVisual('mint',mine,{className:detail?'study-cafe-member-seat-scene':mine?'study-cafe-my-seat-scene':'',studying:true,hairStyle:hair,equipment,fireSource:{remote:true,status:'studying',todaySeconds:hours*3600}})}
[0,3,5,7,9,10,10,10].forEach((h,i)=>{const seat=el('div',{className:'study-cafe-seat qa-seat'},[el('time',{className:'study-cafe-member-time'},String(h).padStart(2,'0')+':00:00'),scene(h,i===6?'ponytail':'default',i===7?gear:[])]);document.getElementById('grid').appendChild(seat)});
document.getElementById('mine').appendChild(scene(10,'ponytail',gear,true));
document.getElementById('progress').appendChild(renderStudyCafeFireProgress());
['default','sport','spiky','mushroom','wave','ponytail'].forEach(hair=>document.getElementById('details').appendChild(el('div',{className:'qa-detail'},[el('p',{className:'qa-title'},hair+' · 10시간 · 모자/의상/소품'),el('div',{className:'study-cafe-member-avatar-stage'},[scene(10,hair,gear,false,true)])])));
window.qaChecks=()=>{
 const failures=[];const check=(v,msg)=>{if(!v)failures.push(msg)};
 document.querySelectorAll('.qa-seat').forEach((seat,i)=>{const f=seat.querySelector('.study-cafe-fire'),r=f.getBoundingClientRect(),s=seat.getBoundingClientRect(),t=seat.querySelector('time').getBoundingClientRect();if(f.dataset.studyFireStage!=='0')check(r.left>=s.left&&r.right<=s.right&&r.top>=t.bottom,'seat boundary '+i);check(getComputedStyle(f.querySelector('svg')).animationName==='none','grid animation '+i)});
 const mine=document.querySelector('#mine .study-cafe-fire'),avatar=document.querySelector('#mine .study-cafe-avatar');
 check(mine.dataset.studyFireStage==='5','own initial stage');
 studyCafePreviewState.running=false;updateStudyCafeFireStages();check(mine.dataset.studyFireStage==='5'&&!mine.classList.contains('is-running'),'pause retains stage');
 ownSeconds=10799;updateStudyCafeFireStages();check(mine.dataset.studyFireStage==='0','corrected total');
 ownSeconds=10800;studyCafePreviewState.running=true;updateStudyCafeFireStages();check(mine.dataset.studyFireStage==='1','live threshold');
 check(avatar===document.querySelector('#mine .study-cafe-avatar'),'avatar DOM retained');
 for(const c of ['online_managed','offline','teacher']){category=c;check(!scene(10).querySelector('.study-cafe-fire'),'scope '+c)}category='lecture';
 ownSeconds=36000;updateStudyCafeFireStages();
 document.querySelectorAll('.qa-detail').forEach((s,i)=>{check(!!s.querySelector('.shop-outfit-coast-guard-uniform'),'outfit '+i);check(!!s.querySelector('.item-head-coast-guard-dress-cap'),'hat '+i);check(s.querySelectorAll('.study-cafe-desk-cosmetics > *').length===4,'desk items '+i);check(Number(getComputedStyle(s.querySelector('.study-cafe-fire')).zIndex)<Number(getComputedStyle(s.querySelector('.study-cafe-avatar')).zIndex),'fire behind avatar '+i)});
 return failures;
};
</script></body></html>`);
const browser=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=9356',`--user-data-dir=${path.join(dir,'browser')}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 let tabs;for(let i=0;i<60;i++){try{tabs=await(await fetch('http://127.0.0.1:9356/json')).json();break}catch{await delay(250)}}if(!tabs)throw new Error('Browser unavailable');
 const ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));
 const pending=new Map();let id=0;ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result)}});
 const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}))});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value};
 await send('Page.enable');await send('Page.navigate',{url:pathToFileURL(path.join(dir,'index.html')).href});await delay(300);
 for(const width of [320,390,768]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1.5,mobile:false});await delay(900);
  const problems=await evaluate('qaChecks()');if(problems.length)throw new Error(width+': '+problems.join(', '));
  await delay(900);
  const h=await evaluate('Math.min(document.documentElement.scrollHeight,2600)');
  const {data}=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width,height:h,scale:1}});
  fs.writeFileSync(path.join(dir,`actual-render-${width}.png`),Buffer.from(data,'base64'));
  console.log(width+'px: real render, seat bounds, all stages, live update, pause, scope and equipment passed');
 }
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 const reduced=await evaluate('getComputedStyle(document.querySelector("#mine .study-cafe-fire > svg")).animationName');if(reduced!=='none')throw new Error('Reduced motion');console.log('Reduced motion passed');
 await send('Browser.close').catch(()=>{});ws.close();
})().catch(e=>{console.error(e);browser.kill();process.exitCode=1});
