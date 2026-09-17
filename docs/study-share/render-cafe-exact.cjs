// Local-only screenshot of the real app. No configuration, API or user data is served.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),out=__dirname;
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.woff2':'font/woff2','.woff':'font/woff','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/json'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');
 if(url.pathname==='/config.js'){res.setHeader('Content-Type',mime['.js']);res.end('window.OUTING_APP_CONFIG={};');return;}
 if(url.pathname.startsWith('/api/')){res.writeHead(503,{'Content-Type':'application/json'});res.end('{"ok":false,"error":"offline_preview"}');return;}
 const file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));
 if(!file.startsWith(root+path.sep)||url.pathname.split('/').some(part=>part.startsWith('.'))||!mime[path.extname(file)]||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',mime[path.extname(file)]);res.end(fs.readFileSync(file));
});
const delay=ms=>new Promise(r=>setTimeout(r,ms));let browser,ws;
(async()=>{
 await new Promise(r=>server.listen(3198,'127.0.0.1',r));
 browser=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=9378','--user-data-dir='+path.join(root,'tmp/cafe-share-exact-browser'),'about:blank'],{windowsHide:true,stdio:'ignore'});
 let tabs;for(let i=0;i<70;i++){try{tabs=await(await fetch('http://127.0.0.1:9378/json')).json();break;}catch{await delay(100);}}
 if(!tabs)throw Error('Browser unavailable');
 ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));
 let id=0;const pending=new Map();ws.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}});
 const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 await send('Page.enable');await send('Network.enable');await send('Network.setBlockedURLs',{urls:['https://*','http://localhost:*']});
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:false});
 await send('Page.navigate',{url:'http://127.0.0.1:3198/?studentMode=online#study-cafe'});
 for(let i=0;i<150;i++){if(await evaluate("!!document.querySelector('.study-cafe-room')"))break;await delay(60);}
 if(!await evaluate("!!document.querySelector('.study-cafe-room')"))throw Error(await evaluate('document.body.innerText.slice(0,1200)'));
 await evaluate(`
   ensureStudyCafeRemoteLoaded=()=>{};ensureStudyCafeShopLoaded=()=>{};ensureStudyRoomLoaded=()=>{};ensureStudyCafePreviewClock=()=>{};
   if(studyCafePreviewClock)clearInterval(studyCafePreviewClock);
   studyCafePreviewState.selectedSeatId=STUDY_CAFE_PREVIEW_SEATS[6].id;
   studyCafePreviewState.subject='해양경찰학';studyCafePreviewState.running=true;studyCafePreviewState.paused=false;
   studyCafePreviewState.nickname='공부하는 나';studyCafePreviewState.startedAt=Date.now();
   studyCafePreviewState.subjectElapsedMs={'해양경찰학':10800000,'해사법규':9000000,'항해학':7200000};
   studyCafePreviewState.activeRoomIndex=0;
   render();
   document.fonts.ready;
 `);
 await delay(300);await evaluate('document.fonts.ready');
 for(const width of [390,320]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:2,mobile:false});
  await evaluate(`document.querySelector('[data-cafe-share-mock]')?.remove();document.querySelector('.study-cafe-my-seat-actions time').textContent='7시간 30분';`);
  if(width===390){const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,'cafe-share-exact-before.png'),Buffer.from(shot.data,'base64'));}
  await evaluate(`
   (()=>{const actions=document.querySelector('.study-cafe-my-seat-actions');
   const shareButton=document.createElement('button');shareButton.type='button';shareButton.className='study-cafe-my-seat-fullscreen-button';shareButton.dataset.cafeShareMock='true';shareButton.textContent='기록 공유';
   actions.append(shareButton);})();
  `);
  const geometry=await evaluate(`(()=>{const card=document.querySelector('.study-cafe-my-seat-card'),button=document.querySelector('[data-cafe-share-mock]');const c=card.getBoundingClientRect(),b=button.getBoundingClientRect();return {width:innerWidth,cardHeight:c.height,buttonWithinCard:b.left>=c.left&&b.right<=c.right&&b.bottom<=c.bottom,buttonVisible:b.bottom<innerHeight,unclipped:button.scrollWidth<=button.clientWidth};})()`);
  console.log(geometry);if(!geometry.buttonWithinCard||!geometry.buttonVisible||!geometry.unclipped)throw Error('Button layout failed');
  const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(out,'cafe-share-exact-'+width+'.png'),Buffer.from(shot.data,'base64'));
 }
 await send('Browser.close');ws.close();server.close();
})().catch(error=>{console.error(error);ws?.close();browser?.kill();server.close();process.exitCode=1});
