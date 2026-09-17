// Preview server: actual app assets, isolated example data, no production API/configuration.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'../..');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.woff2':'font/woff2','.woff':'font/woff','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/json'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');
 res.setHeader('Cache-Control','no-store');
 res.setHeader('Content-Security-Policy',"default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: blob:; font-src 'self' data:; worker-src 'none'");
 if(url.pathname==='/'){
  res.setHeader('Content-Type',mime['.html']);
  res.end(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>스터디카페 통계 진입 시안</title><style>body{margin:0;background:#e9eef3;color:#18364e;font:14px 'Malgun Gothic',sans-serif}header{padding:14px 18px;display:flex;gap:12px;justify-content:space-between;align-items:center;background:#fff;flex-wrap:wrap}header span{color:#637787;font-size:12px}main{padding:18px 0}iframe{display:block;width:390px;max-width:100%;height:844px;height:min(844px,calc(100vh - 104px));min-height:500px;border:0;margin:auto;background:#0b2746;box-shadow:0 5px 28px #1a345320;border-radius:14px}a{color:#185c8b}@media(max-width:430px){main{padding:0}iframe{width:100%;height:calc(100vh - 80px);border-radius:0}}</style><header><strong>공부시간 → 통계 → 기록 공유</strong><span>실제 앱 디자인 · 예시 데이터 · <a href="/preview-app?studentMode=online#study-cafe">전체 화면</a></span></header><main><iframe title="스터디카페 로컬 시안" src="/preview-app?studentMode=online#study-cafe" allow="web-share"></iframe></main></html>`);return;
 }
 if(url.pathname==='/config.js'){res.setHeader('Content-Type',mime['.js']);res.end('window.OUTING_APP_CONFIG={};');return;}
 if(url.pathname.startsWith('/api/')||url.pathname==='/sw.js'){res.writeHead(503,{'Content-Type':'application/json'});res.end('{"ok":false,"error":"offline_preview"}');return;}
 if(url.pathname==='/preview-app'){
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace('</body>','<script src="/docs/study-share/cafe-stats-local.js" defer></script></body>');
  res.setHeader('Content-Type',mime['.html']);res.end(html);return;
 }
 const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
 if(!file.startsWith(root+path.sep)||url.pathname.split('/').some(part=>part.startsWith('.'))||!mime[path.extname(file)]||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',mime[path.extname(file)]);res.end(fs.readFileSync(file));
});
server.listen(3198,'127.0.0.1',()=>console.log('Preview ready: http://127.0.0.1:3198/'));
