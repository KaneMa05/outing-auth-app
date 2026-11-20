'use strict';
const fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('C:/Users/W11/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out=path.resolve('artifacts/app-store-public-20261119-v2');
const report=JSON.parse(fs.readFileSync(path.join(out,'verification.json'),'utf8'));
if(report.failures.length||report.stories.length!==4)throw Error('Invalid public image set');
const variants=[['iphone-1320x2868',1320,2868],['iphone-1206x2622',1206,2622],['ipad-2064x2752',2064,2752]];
const files=[];
for(const [folder,w,h] of variants){
 for(const story of report.stories){
  const file=folder+'/'+story.id+'.png',data=fs.readFileSync(path.join(out,file));
  if(data.readUInt32BE(16)!==w||data.readUInt32BE(20)!==h||data[25]!==2)throw Error('Invalid PNG: '+file);
  files.push(file);
 }
}
const html=`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>론박스터디 공개용 소개 이미지</title><style>
*{box-sizing:border-box}body{margin:0;background:#f4f5f7;color:#191f27;font-family:'Malgun Gothic',sans-serif}main{max-width:1080px;margin:auto;padding:24px}nav{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:22px}button,a{font:inherit;font-size:12px;border:1px solid #d5dbe0;padding:9px 14px;border-radius:22px;color:#19334b;background:#fff;text-decoration:none;cursor:pointer}.download{margin-left:auto}section{display:grid;grid-template-columns:1fr 1fr;gap:24px}article a{padding:0;border:0;background:none;display:block}img{width:100%;display:block;border-radius:6px;box-shadow:0 5px 22px #17334b0c}body.contact nav{display:none}@media(max-width:600px){main{padding:12px}section{gap:12px}.download{margin-left:0}}
</style><main><nav><button data-folder="iphone-1320x2868">아이폰 대형</button><button data-folder="iphone-1206x2622">아이폰 중형</button><button data-folder="ipad-2064x2752">아이패드</button><a class="download" href="ronpark-app-store-public-20261119.zip" download>공개용 파일 다운로드</a></nav><section>${report.stories.map(story=>`<article><a href="iphone-1320x2868/${story.id}.png" target="_blank"><img src="iphone-1320x2868/${story.id}.png" alt="${story.label}"></a></article>`).join('')}</section></main><script>document.querySelectorAll('button').forEach(button=>button.onclick=()=>document.querySelectorAll('article').forEach(article=>{const image=article.querySelector('img'),file=image.getAttribute('src').split('/').pop(),url=button.dataset.folder+'/'+file;image.src=url;article.querySelector('a').href=url;}));</script></html>`;
fs.writeFileSync(path.join(out,'index.html'),html.replace('ronpark-app-store-public-20261119.zip','ronpark-app-store-public-20261119-v2.zip'));
fs.writeFileSync(path.join(out,'README.txt'),'론박스터디 공개용 소개 이미지\n\n01 공부 시간 기록 · 인터넷 수강생\n02 오늘의 할 일 · 인터넷 수강생\n03 공지사항 · 오프라인 수강생\n04 수강 정보 · 오프라인 수강생\n\n각 기능의 실제 화면 일부만 확대했습니다.\n아이폰 대형·중형 및 아이패드 규격으로 각 4장, 총 12장입니다.\n화면의 이름, 수강 정보, 공부 시간, 공지와 할 일은 예시 데이터입니다.\n흰 배경과 짧은 제목을 유지했습니다. 스토어 게시 전 검토용 파일입니다.\n\n다시 만들기\nnode scripts/app-store-showcase/generate.cjs --public\nnode scripts/app-store-showcase/finalize-public.cjs\n');
fs.writeFileSync(path.join(out,'README.txt'),fs.readFileSync(path.join(out,'README.txt'),'utf8').replace('각 기능의 실제 화면 일부만 확대했습니다.','각 기능의 실제 앱 화면을 기기 프레임 안에 크게 배치했습니다. 앱의 헤더와 화면 구성을 확인할 수 있습니다. 스터디카페·홈·출석·외출 화면은 별도 소개 이미지로 포함하지 않았습니다.'));
(async()=>{let browser;try{
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const page=await browser.newPage({viewport:{width:1100,height:700}});
 await page.goto(pathToFileURL(path.join(out,'index.html')).href,{waitUntil:'load'});
 await page.evaluate(()=>{document.body.classList.add('contact');return document.fonts.ready;});
 await page.screenshot({path:path.join(out,'preview.jpg'),fullPage:true,type:'jpeg',quality:93});
 for(const [folder] of variants){await page.locator('[data-folder="'+folder+'"]').evaluate(button=>button.click());await page.waitForFunction(()=>[...document.images].every(image=>image.complete&&image.naturalWidth>0));}
 fs.writeFileSync(path.join(out,'public-manifest.json'),JSON.stringify({created:'2026-11-19',files,features:['공부 시간 기록','오늘의 할 일','공지사항','수강 정보'],imageCount:12,failures:[]},null,2));
 console.log('Verified 12 public PNG files and preview');
}finally{await browser?.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
