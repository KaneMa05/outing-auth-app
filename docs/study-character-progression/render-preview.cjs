const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {pathToFileURL} = require('node:url');
const output = path.join(__dirname, 'images');
fs.mkdirSync(output,{recursive:true});
const browser = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',[
 '--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',
 '--remote-debugging-port=9348',`--user-data-dir=${path.resolve(__dirname,'../../tmp/character-preview-browser')}`,'about:blank'
],{windowsHide:true,stdio:'ignore'});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 let tabs;
 for(let i=0;i<60;i++){try{tabs=await(await fetch('http://127.0.0.1:9348/json')).json();break}catch{await delay(250)}}
 if(!tabs)throw new Error('Preview browser did not start');
 const ws = new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
 await new Promise(r=>ws.addEventListener('open',r,{once:true}));
 let id=0;const pending=new Map();ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result)}});
 const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}))});
 const evaluate=async expression=>(await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true})).result.value;
 await send('Page.enable');
 const base=pathToFileURL(path.join(__dirname,'index.html')).href;
 for(const hours of [null,0,3,5,7,9,10]){
  const board=hours===null;
  await send('Emulation.setDeviceMetricsOverride',{width:board?1440:390,height:board?1050:870,deviceScaleFactor:board?1.5:2,mobile:false});
  await send('Page.navigate',{url:base+(board?'?view=board':`?capture=1&stage=${hours}`)});
  for(let i=0;i<40;i++){await delay(50);if(await evaluate('document.readyState==="complete" && !!document.querySelector(".scene")'))break}
  await evaluate('document.fonts.ready.then(()=>true)');
  const h=await evaluate('Math.ceil(document.querySelector(".board,.phone").getBoundingClientRect().height)');
  const overflow=await evaluate('document.documentElement.scrollWidth > innerWidth');
  if(overflow)throw new Error('Horizontal overflow in '+hours);
  const {data}=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:board?1440:390,height:h,scale:1}});
  const file=board?'00-all-stages.png':`${String(hours).padStart(2,'0')}h-mobile.png`;
  fs.writeFileSync(path.join(output,file),Buffer.from(data,'base64'));
  console.log(`${file}: ${board?1440:390} x ${h}, no horizontal overflow`);
 }
 await send('Emulation.setDeviceMetricsOverride',{width:1200,height:950,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:base});await delay(200);
 const checks=await evaluate(`(()=>{let errors=[];for(let n=0;n<6;n++){document.querySelector('[data-step="'+n+'"]').click();if(!document.querySelector('.phone .stage-'+n))errors.push('stage '+n)}document.querySelector('#pause').click();if(!document.querySelector('.phone .paused'))errors.push('pause');if(!document.querySelector('.phone .stage-5 .achievement-star'))errors.push('achievement persistence');return errors})()`);
 if(checks.length)throw new Error(checks.join(', '));
 console.log('Interactive stage selection and pause preview passed.');
 await send('Browser.close').catch(()=>{});ws.close();
})().catch(err=>{console.error(err);browser.kill();process.exitCode=1});
