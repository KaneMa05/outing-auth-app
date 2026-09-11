const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {pathToFileURL} = require('node:url');
const output = path.join(__dirname, 'images');
fs.mkdirSync(output,{recursive:true});
const browser = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',[
 '--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',
 '--remote-debugging-port=9348',`--user-data-dir=${path.resolve(__dirname,'../../../tmp/character-fire-preview-browser')}`,'about:blank'
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
 const base=pathToFileURL(path.join(__dirname,'seat-preview.html')).href;
 await send('Emulation.setDeviceMetricsOverride',{width:1260,height:1200,deviceScaleFactor:1.5,mobile:false});
 await send('Page.navigate',{url:base});await delay(250);await evaluate('document.fonts.ready.then(()=>true)');
 const h=await evaluate('Math.ceil(document.querySelector(".sheet").getBoundingClientRect().height)');
 const {data}=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:1260,height:h,scale:1}});
 fs.writeFileSync(path.join(output,'seat-context-all-levels.png'),Buffer.from(data,'base64'));
 const roomRect=await evaluate('(()=>{const r=document.querySelector(".room-phone").getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,scale:1}})()');
 const roomImage=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:roomRect});
 fs.writeFileSync(path.join(output,'seat-room-all-levels.png'),Buffer.from(roomImage.data,'base64'));
 const result=await evaluate('JSON.stringify({seats:document.querySelectorAll(".seats .seat").length, stages:[...document.querySelectorAll(".seats .scene")].slice(0,10).map(e=>e.className), horizontalOverflow:document.documentElement.scrollWidth>innerWidth})');
 console.log(result);
 const bounds=await evaluate('(()=>{let problems=[];document.querySelectorAll(".seat").forEach((s,i)=>{const f=s.querySelector(".fire-layer");if(getComputedStyle(f).display==="none")return;const r=f.getBoundingClientRect(),b=s.getBoundingClientRect(),t=s.querySelector("time").getBoundingClientRect();if(r.left<b.left||r.right>b.right||r.top<t.bottom)problems.push(i)});return problems})()');
 if(bounds.length)throw new Error('Flame overlaps seat or time: '+bounds.join(','));
 console.log('All flame layers fit inside seats below the time labels.');
 await send('Browser.close').catch(()=>{});ws.close();
})().catch(err=>{console.error(err);browser.kill();process.exitCode=1});
