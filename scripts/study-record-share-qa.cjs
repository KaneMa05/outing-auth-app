// Offline browser QA: actual render functions and share module, fixture data, no API calls.
const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {pathToFileURL} = require('node:url');
const root=path.resolve(__dirname,'..'), dir=path.join(root,'tmp/study-record-share-qa');
fs.mkdirSync(dir,{recursive:true});
const app=fs.readFileSync(path.join(root,'app.js'),'utf8'),shared=fs.readFileSync(path.join(root,'shared.js'),'utf8');
function extract(source,name){const match=new RegExp('(?:async )?function '+name+'\\(').exec(source);if(!match)throw Error(name);const tail=source.slice(match.index),end=tail.search(/\n(?:async )?function /);return end<0?tail:tail.slice(0,end)}
const names=['renderStudentStudyTimer','renderStudyTimerHeaderActions','renderStudyTimerStats','renderStudyTimerModeTabs','renderStudyTimerStatsPeriodButton','renderStudyTimerDailyOverview','renderStudyTimerDailyMetric','renderStudyTimerWeeklyChart','renderStudyTimerMonthlyCalendar','renderStudyTimerStatsSummary','renderStudyTimerStatsMetric','renderStudyTimerSubjectStats','formatStudyTimerStatsRangeLabel','formatStudyTimerStatsDayLabel','formatStudyTimerStatsWeekday','formatStudyTimerStatsClock','formatStudyCafeCompactDuration','formatStudyTimerChartDuration','formatStudyCafeElapsed','parseStudyTimerDateKey','formatStudyBusinessDateKey','formatStudyTimerDateKey','getStudyTimerStatsRange','shiftStudyTimerStatsDate','canMoveStudyTimerStatsForward','enumerateStudyTimerDateKeys','openStudyTimerRecordShare','loadStudyTimerSharePlans','isOnlineStudentExperience'];
fs.writeFileSync(path.join(dir,'index.html'),`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="../../styles.css"><style>body{background:#0b2746!important;padding:16px!important}body::after{display:none!important}#app{max-width:430px;margin:auto}.qa-spacer{height:70px}</style><body class="student-online-mode"><div class="qa-spacer"></div><main id="app"></main><script src="../../study-record-share.js"></script><script>
${extract(shared,'el')}
${extract(shared,'button')}
${names.map(name=>extract(app,name)).join('\n')}
const studyTimerStatsState={mode:'stats',period:'daily',anchorDate:new Date(2026,8,15,12),cache:{},loadingKey:'',error:''};
const studyCafePreviewState={selectedSeatId:'',subject:'',paused:false,timerFullscreen:false};
let currentRoute='study-timer', student={id:'qa',student_category:'lecture'};
const getAuthedStudent=()=>student,getStudentCategory=s=>s?.student_category,isOnlineManagedStudyCafeEnabled=()=>false,isStudyCafeLocalPreview=()=>false;
const ensureStudyCafeRemoteLoaded=()=>{},ensureStudyCafePreviewClock=()=>{},getStudyTimerSubjects=()=>[],getStudySubjectTotalElapsedMs=()=>0,renderStudySubjectManagement=()=>null,renderStudySubjectTimerRow=()=>null,openStudyTimerFullscreen=()=>{},renderStudyTimerFullscreen=()=>null;
const notify=message=>{window.lastNotice=message};
const requestStudyTimerStats=()=>{};
const plans=[5,6,4,6,5,5,3].map((completed,i)=>({studyDate:'2026-09-'+(14+i),completed,total:[6,8,5,6,5,6,4][i]}));
let failPlans=false, planGate=null;
async function requestStudyCafeAction(action,payload){if(action!=='todo_month_summary')throw Error('Unexpected API action');if(planGate)await planGate;return {ok:!failPlans,plans:plans.filter(p=>p.studyDate.startsWith(payload.monthKey))};}
function dataFor(period){const weekly=[6,7.5,5.5,6.5,7,6,4],days=period==='daily'?[{date:'2026-09-15',totalSeconds:27000,longestSeconds:10800,firstStartedAt:'2026-09-15T09:00:00+09:00',lastEndedAt:'2026-09-15T18:00:00+09:00'}]:period==='weekly'?weekly.map((h,i)=>({date:'2026-09-'+(14+i),totalSeconds:h*3600})):Array.from({length:30},(_,i)=>({date:'2026-09-'+String(i+1).padStart(2,'0'),totalSeconds:i===0?43500:i===1?86400:[5,12,19,26].includes(i)?0:21600}));const totalSeconds=days.reduce((n,d)=>n+d.totalSeconds,0),studiedDays=days.filter(d=>d.totalSeconds).length;return{ok:true,serverNow:'2026-09-30T12:00:00Z',dateFrom:days[0].date,dateTo:days.at(-1).date,days,summary:{totalSeconds,studiedDays,dailyAverageSeconds:Math.floor(totalSeconds/studiedDays),maxDailySeconds:Math.max(...days.map(d=>d.totalSeconds))},subjectTotals:{'해양경찰학':Math.floor(totalSeconds*.4),'해사법규':Math.floor(totalSeconds*.3),'항해학':totalSeconds-Math.floor(totalSeconds*.4)-Math.floor(totalSeconds*.3)}};}
['daily','weekly','monthly'].forEach(p=>{const data=dataFor(p);studyTimerStatsState.cache[data.dateFrom+':'+data.dateTo]=data;});
function render(){document.querySelector('#app').replaceChildren(renderStudentStudyTimer());}
const renderStudyCafeStateUpdate=render;
window.setPeriod=p=>{window.StudyRecordShare.close();studyTimerStatsState.period=p;studyTimerStatsState.mode='stats';render()};
window.openShare=()=>document.querySelector('.study-timer-share-button').click();
window.problems=()=>Array.from(document.querySelectorAll('.study-timer-weekly-day > time,.study-timer-monthly-day time')).filter(n=>n.scrollWidth>n.clientWidth).map(n=>n.textContent);
render();
</script></body></html>`);
const browser=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=9369','--user-data-dir='+path.join(dir,'browser'),'about:blank'],{windowsHide:true,stdio:'ignore'});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 let tabs;for(let n=0;n<60;n++){try{tabs=await(await fetch('http://127.0.0.1:9369/json')).json();break}catch{await delay(200)}}if(!tabs)throw Error('Browser unavailable');
 const ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));let id=0;const pending=new Map();
 ws.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result)}});
 const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}))});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value};
 const check=async(expression,message)=>{if(!(await evaluate(expression)))throw Error(message)};
 const waitFor=async expression=>{for(let n=0;n<100;n++){if(await evaluate(expression))return;await delay(50)}throw Error('Timeout: '+expression)};
 await send('Page.enable');await send('Emulation.setTimezoneOverride',{timezoneId:'Asia/Seoul'});
 await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:path.join(dir,'downloads')});
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:false});
 await send('Page.navigate',{url:pathToFileURL(path.join(dir,'index.html')).href});await delay(600);await evaluate('document.fonts.ready');
 for(const width of [320,390]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:2,mobile:false});
  for(const period of ['daily','weekly','monthly']){
   await evaluate('setPeriod('+JSON.stringify(period)+')');
   await check('problems().length===0',width+' '+period+' clipped time label');
   if(period==='daily'){
    await check("!document.querySelector('.study-timer-daily-total p')",'Removed copy returned');
    await check("!document.querySelector('.study-timer-stats-summary-head strong').textContent.includes('~')",'Daily date range returned');
   }
   await evaluate('window.scrollTo(0,50);window.beforeScroll=window.scrollY;openShare()');
   await waitFor("!!document.querySelector('.study-record-share-image')?.src");
   await check("document.querySelector('.study-record-share-image').naturalWidth===1080",'PNG resolution');
   await check("document.querySelector('.study-record-share-dialog').scrollWidth<=window.innerWidth",'Dialog overflow');
   if(width===390){
    const base64=await evaluate("fetch(document.querySelector('.study-record-share-image').src).then(r=>r.blob()).then(b=>new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(b)}))");
    fs.writeFileSync(path.join(dir,period+'-export.png'),Buffer.from(base64,'base64'));
    const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(dir,period+'-preview.png'),Buffer.from(shot.data,'base64'));
   }
   await evaluate("document.querySelector('.study-record-share-back').click()");
   await check('window.scrollY===window.beforeScroll','Scroll position changed');
  }
 }
 console.log('320/390px statistics, full minute labels (including 12:05 and 24:00), three PNG exports and scroll restoration passed.');
 await evaluate("setPeriod('weekly');Object.defineProperty(navigator,'canShare',{configurable:true,writable:true,value:()=>true});Object.defineProperty(navigator,'share',{configurable:true,writable:true,value:async data=>{window.sentFile=data.files[0];throw new DOMException('cancel','AbortError')}});openShare()");
 await waitFor("!!document.querySelector('.study-record-share-image')?.src");
 await evaluate("document.querySelector('.study-record-share-actions .btn:not(.secondary)').click()");await delay(80);
 await check("sentFile.type==='image/png' && sentFile.name.includes('2026-09-14_2026-09-20')",'Shared file mismatch');
 await check("document.querySelector('.study-record-share-dialog').open && !document.querySelector('.study-record-share-actions .btn:not(.secondary)').disabled",'Cancel did not preserve preview');
 await check("fetch(document.querySelector('.study-record-share-image').src).then(r=>r.blob()).then(blob=>blob.size===sentFile.size)",'Preview and shared bytes mismatch');
 await evaluate("document.querySelector('.study-record-share-actions .secondary').click()");await delay(300);
 const downloads=path.join(dir,'downloads');if(!fs.existsSync(downloads)||!fs.readdirSync(downloads).some(f=>f.endsWith('.png')))throw Error('PNG download missing');
 await evaluate("navigator.share=async()=>{throw new Error('blocked')};document.querySelector('.study-record-share-actions .btn:not(.secondary)').click()");await delay(60);
 await check("document.querySelector('.study-record-share-status').textContent.includes('이미지를 저장')",'Share failure guidance missing');
 await evaluate("StudyRecordShare.close();failPlans=true;openShare()");await waitFor("!!document.querySelector('.study-record-share-image')?.src");
 await check("!document.querySelector('.study-record-share-note').hidden",'Planner failure not explained');
 await evaluate("StudyRecordShare.close();failPlans=false;planGate=new Promise(resolve=>window.releasePlans=resolve);openShare();StudyRecordShare.close();releasePlans()");await delay(200);
 await check("!document.querySelector('.study-record-share-dialog')",'Closed async preview reopened');
 await evaluate("planGate=null;studyTimerStatsState.mode='timer';render()");await check("!document.querySelector('.study-timer-share-button')",'Share visible in timer mode');
 await evaluate("student={id:'other',student_category:'offline'};render()");await check("!document.querySelector('.study-timer-share-button')",'Share visible to offline student');
 console.log('Real PNG download, simulated native file sharing/cancel/failure, planner failure, async close and access checks passed.');
 await send('Browser.close').catch(()=>{});ws.close();
})().catch(error=>{console.error(error);browser.kill();process.exitCode=1});
