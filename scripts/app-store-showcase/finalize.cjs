'use strict';
const fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('C:/Users/W11/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'artifacts/app-store-showcase-20261119-v4');
const report=JSON.parse(fs.readFileSync(path.join(out,'verification.json'),'utf8'));
if(report.failures.length)throw Error('Resolve capture issues before packaging: '+JSON.stringify(report.failures));
const variants=[['iphone-1320x2868',1320,2868],['iphone-1206x2622',1206,2622],['ipad-2064x2752',2064,2752]];
const imageFiles=[];
for(const [folder,width,height] of variants){
  for(const story of report.stories){
    const filename=path.join(out,folder,story.id+'.png'),buffer=fs.readFileSync(filename);
    if(buffer.toString('hex',0,8)!=='89504e470d0a1a0a'||buffer.readUInt32BE(16)!==width||buffer.readUInt32BE(20)!==height||buffer[25]!==2)throw Error('Expected opaque RGB PNG at exact size: '+filename);
    imageFiles.push({file:folder+'/'+story.id+'.png',width,height,bytes:buffer.length,color:'RGB',alpha:false});
  }
}
const description=`론박스터디\n공부와 수강 생활을 한곳에서\n\n매일의 공부와 수강 생활을 론박스터디에서 관리하세요.\n수강 유형에 맞는 화면에서 오늘의 학습을 계획하고, 공부 기록과 필요한 정보를 확인할 수 있습니다.\n\n오늘의 할 일과 학습 플래너\n과목별 할 일을 적고 목표 시간을 설정해보세요. 완료한 항목과 오늘의 달성률을 확인하고 월간 플래너로 학습 계획을 살펴볼 수 있습니다.\n\n함께 집중하는 스터디카페\n나의 자리에서 공부를 시작하고 수강생들의 학습 현황을 확인하세요. 캐릭터와 함께 공부에 작은 즐거움을 더할 수 있습니다.\n\n순공시간과 학습 통계\n과목별 공부 시간을 기록하고 일간·주간·월간 통계로 학습 흐름을 확인하세요. 꾸준히 쌓인 기록을 다음 학습 계획에 활용할 수 있습니다.\n\n출석과 외출·복귀 관리\n오프라인 수강생은 사진으로 출석을 인증하고 등원 전 사유를 신청할 수 있습니다. 외출 사유와 복귀 예정 시간을 등록하고 외출·복귀 과정을 확인할 수 있습니다.\n\n성적과 평가 결과 확인\n지원되는 수강 유형에서 주간평가, 파이널 성적, 체력평가 결과를 확인하고 나의 학습 상태를 점검하세요.\n\n수강 정보와 계정 관리\n마이페이지에서 수강 정보와 계정 관련 메뉴를 확인할 수 있습니다.\n\n이용 안내\n• 론박스터디 수강생 계정과 로그인이 필요합니다.\n• 오프라인 수강생, 온라인 관리반, 인터넷 수강생 등 수강 유형과 이용 권한에 따라 제공되는 화면과 기능이 다릅니다.\n• 소개 이미지의 이름, 학습 시간, 할 일과 성적은 기능 설명을 위한 예시입니다.\n`;
fs.writeFileSync(path.join(out,'app-description-ko.txt'),description);
fs.writeFileSync(path.join(out,'promotional-text-ko.txt'),'오늘의 할 일부터 순공시간, 스터디카페와 성적 확인까지. 론박스터디에서 나에게 맞는 학습 흐름을 이어가세요. 이용 메뉴는 수강 유형과 권한에 따라 다릅니다.\n');
const captions=report.stories.map((story,i)=>`${i+1}. ${story.label}\n${story.title.join(' ')}`).join('\n\n');
fs.writeFileSync(path.join(out,'README.txt'),`론박스터디 앱스토어 소개 이미지\n제작일: 2026-11-19\n앱 Apple ID: 6827374000\n\n구성\n- iphone-1320x2868: 아이폰 대형 화면용 PNG 8장\n- iphone-1206x2622: 아이폰 중형 화면용 PNG 8장\n- ipad-2064x2752: 아이패드 13형용 PNG 8장\n- index.html: 기기별 이미지를 비교하고 원본을 열 수 있는 미리보기\n- preview.jpg: 아이폰 8장 전체 미리보기\n- app-description-ko.txt: 앱 소개 본문 초안\n- promotional-text-ko.txt: 프로모션 문구 초안\n\n권장 순서\n${captions}\n\n화면 구성\n홈: 온라인 관리반\n플래너·스터디카페·학습 통계·캐릭터: 인터넷 수강생\n출석·외출·성적: 오프라인 수강생\n실제 앱의 화면을 로컬에서 실행해 예시 데이터로 촬영하고, 설명 문구와 기기 프레임을 더했습니다. 실제 수강생 개인정보와 운영 데이터는 사용하지 않았습니다. 기능과 메뉴는 수강 유형 및 권한에 따라 다릅니다.\n\n검증\nPNG 24장의 크기, RGB 색상 모드, 불투명 배경을 확인했습니다. 폰트·이미지 로딩, 화면 가로 넘침과 이동 경로를 확인했습니다.\n앱 소스 변경, 운영 데이터 변경, 스토어 업로드, 푸시 및 배포는 실행하지 않았습니다.\n\n규격 참고\nhttps://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/\n\n다시 만들기\nnode scripts/app-store-showcase/generate.cjs\nnode scripts/app-store-showcase/finalize.cjs\n`);
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cards=report.stories.map((story,i)=>`<article><a class="image-link" href="iphone-1320x2868/${story.id}.png" target="_blank"><img src="iphone-1320x2868/${story.id}.png" alt="${escape(story.label)} 소개 이미지"></a><div class="caption"><span>${String(i+1).padStart(2,'0')}</span><h2>${escape(story.label)}</h2><a class="original" href="iphone-1320x2868/${story.id}.png" download>PNG 원본</a></div></article>`).join('');
const html=`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>론박스터디 · 앱스토어 소개 이미지</title><style>
*{box-sizing:border-box}body{margin:0;background:#f5f4ef;color:#123046;font-family:'Malgun Gothic',sans-serif}main{max-width:1700px;margin:auto;padding:52px 44px 36px}.eyebrow{margin:0 0 12px;font-size:12px;letter-spacing:2.5px;color:#4a7d70}header{display:flex;gap:32px;align-items:end;justify-content:space-between;border-bottom:1px solid #cdd7d5;padding-bottom:28px}h1{font-size:34px;letter-spacing:-1.6px;margin:0 0 10px}p{margin:0;line-height:1.6;color:#617984;font-size:13px}.badge{font-size:12px;padding:7px 13px;background:#e0ebe4;border-radius:25px;white-space:nowrap;color:#2b725d}.toolbar{display:flex;justify-content:space-between;gap:20px;align-items:center;padding:25px 0}.tabs{display:flex;gap:8px}button,.download{font:inherit;font-size:12px;border:1px solid #c9d7d3;background:transparent;color:#284a5d;padding:10px 16px;border-radius:24px;cursor:pointer;text-decoration:none}button.active,.download{background:#123c51;color:#fff;border-color:#123c51}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:26px 20px}article{min-width:0}.image-link{display:block}article img{width:100%;height:auto;display:block;border-radius:8px;box-shadow:0 8px 25px #12304612}.caption{display:flex;align-items:center;gap:10px;padding:12px 1px}.caption span{font-size:11px;color:#699085}h2{font-size:13px;margin:0;font-weight:700}.original{margin-left:auto;font-size:11px;color:#487b6a;text-decoration:none}footer{border-top:1px solid #cdd7d5;margin-top:32px;padding-top:20px;display:flex;justify-content:space-between;gap:25px;font-size:12px;color:#6f838a}footer a{color:#427b68}body.contact .toolbar,body.contact footer{display:none}body.contact main{padding:36px 36px 24px}body.contact header{padding-bottom:20px;margin-bottom:26px}body.contact .grid{gap:24px 18px}body.contact .caption .original{display:none}body.contact h1{font-size:28px}@media(max-width:950px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}main{padding:26px 20px}header,.toolbar,footer{align-items:start;flex-direction:column}h1{font-size:26px}.tabs{flex-wrap:wrap}}@media(max-width:480px){.grid{gap:20px 12px}.caption{flex-wrap:wrap}.caption .original{display:none}h2{font-size:11px}}
</style><main><header><div><p class="eyebrow">RONPARK STUDY / APP STORE</p><h1>매일의 공부를 보여주는 8가지 화면</h1><p>론박스터디 · 실제 앱 화면과 기능별 소개 문구</p></div><span class="badge">스토어 등록 전 검토용</span></header><div class="toolbar"><div class="tabs"><button class="active" data-folder="iphone-1320x2868">아이폰 대형</button><button data-folder="iphone-1206x2622">아이폰 중형</button><button data-folder="ipad-2064x2752">아이패드 13형</button></div><a class="download" href="ronpark-app-store-showcase-20261119.zip" download>전체 파일 다운로드</a></div><section class="grid">${cards}</section><footer><span>화면 속 학습 기록은 예시입니다. 이용 메뉴는 수강 유형과 권한에 따라 다릅니다.</span><span><a href="app-description-ko.txt">앱 소개 본문</a> · <a href="README.txt">파일 안내</a></span></footer></main><script>document.querySelectorAll('[data-folder]').forEach(button=>button.onclick=()=>{document.querySelectorAll('[data-folder]').forEach(b=>b.classList.toggle('active',b===button));document.querySelectorAll('article').forEach(article=>{const img=article.querySelector('img'),file=img.getAttribute('src').split('/').pop(),url=button.dataset.folder+'/'+file;img.src=url;article.querySelectorAll('a').forEach(a=>a.href=url);});});</script></html>`;
const cleanGalleryStyle=`
body{background:#f4f5f7}main{padding-top:28px}header{padding-bottom:8px;border:0}header p,.badge,footer{display:none}h1{font-size:21px;letter-spacing:-.6px;margin:0}.toolbar{padding:16px 0 24px}.caption{padding:10px 1px}body.contact header,body.contact .caption{display:none}body.contact main{padding:24px}body.contact .grid{gap:20px}article img{border-radius:6px;box-shadow:0 4px 16px #172c4210}
`;
const cleanHtml=html.replace('</style>',cleanGalleryStyle+'</style>')
  .replace('<h1>매일의 공부를 보여주는 8가지 화면</h1>','<h1>론박스터디 · 소개 이미지</h1>')
  .replace('ronpark-app-store-showcase-20261119.zip','ronpark-app-store-showcase-20261119-v4.zip');
fs.writeFileSync(path.join(out,'index.html'),cleanHtml);
fs.appendFileSync(path.join(out,'README.txt'),'\n수정본 v2\n모든 이미지의 배경을 흰색(#FFFFFF)으로 통일했습니다. 별도 브랜드 헤더, 기능 라벨, 부가 설명, 하단 키워드, 안내 문구와 페이지 번호를 제거했습니다. 짧은 제목과 확대된 실제 앱 화면만 배치했습니다. 기존 앱 자체의 UI는 유지했습니다.\n\n구성 참고\nhttps://apps.apple.com/kr/app/id6795790129\nhttps://apps.apple.com/kr/app/id1018769995\n');
fs.writeFileSync(path.join(out,'README.txt'),fs.readFileSync(path.join(out,'README.txt'),'utf8')
  .replace('출석·외출·성적: 오프라인 수강생','월간 플래너·순공시간 랭킹: 인터넷 수강생\n성적: 오프라인 수강생')
  .replace('홈: 온라인 관리반\n','')
  .replace('플래너·스터디카페·학습 통계·캐릭터: 인터넷 수강생','과목별 타이머·플래너·스터디카페·학습 통계·캐릭터: 인터넷 수강생')
  .replace('수정본 v2','수정본 v4\n01 홈 화면을 과목별 타이머로 교체했습니다. 06 월간 플래너, 07 순공시간 랭킹을 포함한 나머지 7개 이미지 원본은 v3와 동일합니다. 홈, 출석 인증, 외출·복귀 소개 이미지는 포함하지 않았습니다.')
  .replace('node scripts/app-store-showcase/generate.cjs','node scripts/app-store-showcase/generate.cjs --only-replacements'));
(async()=>{
 let browser;
 try{
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});
  await page.goto(pathToFileURL(path.join(out,'index.html')).href,{waitUntil:'load'});
  await page.evaluate(()=>{document.body.classList.add('contact');return document.fonts.ready;});
  await page.screenshot({path:path.join(out,'preview.jpg'),fullPage:true,type:'jpeg',quality:92});
  for(const folder of variants.map(item=>item[0])){
    await page.locator('[data-folder="'+folder+'"]').evaluate(button=>button.click());
    await page.waitForFunction(()=>[...document.images].every(img=>img.complete&&img.naturalWidth>0));
    if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Gallery overflow: '+folder);
  }
  await page.screenshot({path:path.join(out,'preview-ipad.jpg'),fullPage:true,type:'jpeg',quality:92});
  report.exports=imageFiles;report.galleryVerified=true;fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({images:imageFiles.length,alpha:false,failures:report.failures,galleryVerified:true}));
 }finally{await browser?.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
