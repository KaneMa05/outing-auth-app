// Real app screens with isolated in-memory preview data; no production APIs.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..'), dir = path.join(root, '.tmp/managed-shop-ui');
fs.mkdirSync(dir, { recursive: true });
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/config.js') { res.setHeader('Content-Type', 'text/javascript'); res.end('window.OUTING_APP_CONFIG={supabaseUrl:"",supabaseAnonKey:""};'); return; }
  if (pathname.startsWith('/api/')) { res.setHeader('Content-Type', 'application/json'); res.end('{"ok":false,"error":"local_qa_only"}'); return; }
  const filename = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!filename.startsWith(root + path.sep) || !fs.existsSync(filename) || !fs.statSync(filename).isFile()) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', ({ '.js':'text/javascript', '.html':'text/html', '.css':'text/css', '.svg':'image/svg+xml', '.json':'application/json' })[path.extname(filename)] || 'application/octet-stream');
  fs.createReadStream(filename).pipe(res);
});
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let browser, ws;
(async () => {
  await new Promise(resolve => server.listen(4329, '127.0.0.1', resolve));
  browser = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',
    '--remote-debugging-port=9359', `--user-data-dir=${path.join(dir, 'browser')}`, 'about:blank'], { windowsHide:true, stdio:'ignore' });
  let tabs;
  for (let i=0;i<60;i++) { try { tabs = await (await fetch('http://127.0.0.1:9359/json')).json(); break; } catch { await delay(250); } }
  if (!tabs) throw new Error('Browser unavailable');
  ws = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl);
  await new Promise(resolve => ws.addEventListener('open', resolve, { once:true }));
  const pending = new Map(); let nextId = 0;
  ws.addEventListener('message', event => { const message=JSON.parse(event.data); if (!message.id) return; const p=pending.get(message.id); pending.delete(message.id); message.error ? p.reject(message.error) : p.resolve(message.result); });
  const send = (method, params={}) => new Promise((resolve,reject) => { const id=++nextId; pending.set(id,{resolve,reject}); ws.send(JSON.stringify({id,method,params})); });
  const evaluate = async expression => { const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true}); if(result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails)); return result.result.value; };
  await send('Page.enable');
  await send('Network.enable');
  // Only loopback resources are ever allowed, even if application defaults change.
  await send('Network.setBlockedURLs', { urls:['https://*'] });
  await send('Page.navigate',{url:'http://127.0.0.1:4329/?studentMode=online#home'});
  let ready=false;
  for(let i=0;i<60;i++) { await delay(200); ready=await evaluate('typeof render === "function" && typeof state !== "undefined"'); if(ready) break; }
  if(!ready) throw new Error('App did not initialize');
  await evaluate("document.querySelectorAll('button').forEach(button=>{if(button.textContent.trim()==='좋아요!')button.click()})");
  for(const category of ['online_managed','lecture']) {
    await evaluate(`state.students=[{id:'20000',name:'테스트 수강생',studentCategory:${JSON.stringify(category)},className:'테스트반',isActive:true}];
      state.settings.studentAuthId='20000';state.settings.lastStudentId='20000';state.settings.onlineManagedStudyCafeEnabled=true;
      state.settings.studentProfiles={'20000':{passwordHash:'local-only',deviceToken:'local-only'}};
      studyCafeLocalFallback=true;studyCafeRemoteState.available=false;
      resetStudyCafeShopState();hydrateLocalStudyCafeShop(getAuthedStudent());navigate('mypage');`);
    await delay(250);
    await evaluate("document.querySelectorAll('button').forEach(button=>{if(button.textContent.trim()==='좋아요!')button.click()})");
    if(!await evaluate('!!document.querySelector(".student-character-card")')) throw new Error(category+': My character entry missing');
    await evaluate('document.querySelector(".student-character-card").click()');
    await delay(250);
    if(!await evaluate('!!document.querySelector(".student-study-character-page")')) throw new Error(category+': character page missing');
    for(const width of [320,390,768]) {
      await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
      for(const route of ['study-character','study-shop']) {
        await evaluate(`navigate(${JSON.stringify(route)})`); await delay(200);
        const check=await evaluate(`({route:currentRoute,overflow:document.documentElement.scrollWidth>innerWidth+1,body:document.body.className,
          page:!!document.querySelector(${JSON.stringify(route === 'study-shop' ? '.student-study-shop-page' : '.student-study-character-page')})})`);
        if(!check.page || check.route!==route || check.overflow) throw new Error(JSON.stringify({category,width,...check}));
        const {data}=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
        fs.writeFileSync(path.join(dir,`${category}-${route}-${width}.png`),Buffer.from(data,'base64'));
      }
    }
    await evaluate("navigate('study-character');document.querySelector('.study-character-shop-button').click()");
    if(!await evaluate("currentRoute==='study-shop'")) throw new Error('Character to shop navigation');
    await evaluate("document.querySelector('.study-character-back-button').click()");
    if(!await evaluate("currentRoute==='study-character'")) throw new Error('Shop back navigation');
    console.log(`${category}: My -> character -> shop -> back; 320/390/768px real app screens passed`);
  }
  await send('Browser.close').catch(()=>{});
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{ws?.close();browser?.kill();server.close();});
