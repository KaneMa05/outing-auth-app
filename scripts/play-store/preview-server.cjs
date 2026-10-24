// Local-only store asset preparation. No production data or API connectivity.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const fixture = `
(() => {
  const category = new URLSearchParams(location.search).get('category') || 'offline';
  const id = '99990';
  Object.assign(state, defaultState());
  state.students = [{id,name:'수강생',studentCategory:category,className:'학습반',isActive:true,
    appRegisteredAt:'2026-10-01T00:00:00Z',track:'경찰직 - 공채(순경)',gender:'남'}];
  Object.assign(state.settings,{studentAuthId:id,lastStudentId:id,onlineManagedStudyCafeEnabled:true,
    studentProfiles:{[id]:{passwordHash:'local-preview-only',deviceToken:'local-preview-only',gender:'남',track:'경찰직 - 공채(순경)'}}});
  isStandaloneStudentApp = () => true;
  studyCafeLocalFallback = true;
  studyCafeRemoteState.available = false;
  studyCafeRemoteState.loaded = true;
  studyCafeRemoteState.studentId = id;
  localStorage.setItem('ronpark-study-cafe-timer-pause-guide-v2','1');
  render();
  document.body.dataset.storePreview = category;
})();
`;
const feature = `<!doctype html><html lang="ko"><meta charset="utf-8">
<style>
*{box-sizing:border-box}html,body{margin:0;width:1024px;height:500px;overflow:hidden}
body{font-family:"Malgun Gothic",sans-serif;background:#062c53;color:white}
.canvas{width:1024px;height:500px;position:relative;display:flex;align-items:center;padding:62px 68px;gap:55px;background:linear-gradient(120deg,#092b4e,#075b80)}
.orb{position:absolute;border:1px solid #ffffff17;border-radius:50%;width:600px;height:600px;right:-195px;top:-225px}
.orb.second{width:450px;height:450px;right:-120px;top:225px}
img{width:228px;height:228px;border-radius:42px;position:relative;box-shadow:0 20px 60px #00152b66}
.copy{position:relative}.eyebrow{font-size:13px;letter-spacing:4px;color:#78d8ef;font-weight:700;margin:0 0 17px}
h1{font-size:55px;letter-spacing:-3px;line-height:1.2;margin:0 0 25px;font-weight:800}
.subtitle{font-size:24px;line-height:1.55;margin:0;color:#e5f1f8;letter-spacing:-.8px}
.line{width:45px;height:3px;background:#49d1ee;margin:27px 0 19px}
.footer{font-size:14px;letter-spacing:1px;color:#b5d7e7}
</style><div class="canvas"><div class="orb"></div><div class="orb second"></div>
<img src="/icon-512.png" alt="론박스터디"><div class="copy"><p class="eyebrow">RONPARK STUDY</p>
<h1>론박스터디</h1><p class="subtitle">계획부터 기록까지<br>매일의 공부를 함께</p>
<div class="line"></div><div class="footer">학습 관리 · 플래너 · 스터디카페</div></div></div></html>`;
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.woff':'font/woff','.webmanifest':'application/manifest+json'};
http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://127.0.0.1').pathname;
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Security-Policy',"default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; worker-src 'none'");
  if(pathname==='/config.js'){res.setHeader('Content-Type',types['.js']);return res.end('window.OUTING_APP_CONFIG={supabaseUrl:"",supabaseAnonKey:""};');}
  if(pathname==='/__store-fixture.js'){res.setHeader('Content-Type',types['.js']);return res.end(fixture);}
  if(pathname==='/feature'){res.setHeader('Content-Type',types['.html']);return res.end(feature);}
  if(pathname.startsWith('/api/')){res.setHeader('Content-Type','application/json');return res.end('{"ok":false,"error":"isolated_store_preview"}');}
  if(pathname==='/'||pathname==='/index.html'){
    res.setHeader('Content-Type',types['.html']);
    return res.end(fs.readFileSync(path.join(root,'index.html'),'utf8').replace('</body>','<script src="/__store-fixture.js" defer></script></body>'));
  }
  const filename=path.resolve(root,'.'+decodeURIComponent(pathname));
  if(!filename.startsWith(root+path.sep)||!types[path.extname(filename)]||pathname.includes('/.')||
     pathname==='/sw.js'||pathname.startsWith('/api/')||pathname.startsWith('/tools/')||
     !fs.existsSync(filename)||!fs.statSync(filename).isFile()){res.writeHead(404);return res.end();}
  res.setHeader('Content-Type',types[path.extname(filename)]);
  fs.createReadStream(filename).pipe(res);
}).listen(4337,'127.0.0.1',()=>console.log('Store asset preview: http://127.0.0.1:4337'));
