'use strict';

// Creates local marketing assets from the real app UI using fictional data.
// No production database, live student session, App Store write, push or deployment.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('C:/Users/W11/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '../..');
const isPublic=process.argv.includes('--public');
const out = path.join(root, isPublic?'artifacts/app-store-public-20261119-v2':'artifacts/app-store-showcase-20261119-v4');
const raw = path.join(out, 'screens');
const stories = [
  { id:'01-timer', category:'lecture', route:'study-timer', label:'과목별 타이머', title:['과목별 타이머로','집중하는 시간'] },
  { id:'02-planner', category:'lecture', route:'study-todo', label:'학습 플래너', title:['오늘의 계획을','차근차근'] },
  { id:'03-cafe', category:'lecture', route:'study-cafe', label:'스터디카페', title:['함께 공부하는','스터디카페'] },
  { id:'04-stats', category:'lecture', route:'study-timer', label:'공부 시간 · 통계', title:['공부한 시간을','한눈에'] },
  { id:'05-character', category:'lecture', route:'study-character', label:'나의 캐릭터', title:['나만의 캐릭터로','더 즐겁게'] },
  { id:'06-calendar', category:'lecture', route:'study-todo', label:'월간 플래너', title:['한 달의 계획을','한눈에'] },
  { id:'07-ranking', category:'lecture', route:'study-ranking', label:'순공시간 랭킹', title:['함께 쌓는 기록','순공시간 랭킹'] },
  { id:'08-grades', category:'offline', route:'grades', label:'성적 조회', title:['나의 성적을','한눈에'] },
  ...(isPublic?[
    {id:'03-notices',category:'offline',route:'notices',label:'오프라인 · 공지사항',title:['필요한 공지를','한눈에']},
    {id:'04-profile',category:'offline',route:'mypage',label:'오프라인 · 수강 정보',title:['나의 수강 정보를','간편하게']},
  ]:[]),
].filter(story=>!isPublic||['01-timer','02-planner','03-notices','04-profile'].includes(story.id))
 .map(story=>isPublic&&story.id==='01-timer'?{...story,label:'공부 시간 기록',title:['공부한 시간을','차곡차곡']}:story);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2','.woff':'font/woff','.webmanifest':'application/manifest+json'};
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const statusIcons='<svg width="12" height="9" viewBox="0 0 12 9" fill="currentColor"><rect y="6" width="2" height="3" rx=".5"/><rect x="3" y="4" width="2" height="5" rx=".5"/><rect x="6" y="2" width="2" height="7" rx=".5"/><rect x="9" width="2" height="9" rx=".5"/></svg><svg width="12" height="9" viewBox="0 0 12 9" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M1 2.5Q6-1 11 2.5M3 5Q6 2.8 9 5M5 7.2Q6 6.4 7 7.2"/></svg><svg width="17" height="9" viewBox="0 0 17 9" fill="none" stroke="currentColor"><rect x=".5" y=".5" width="14" height="8" rx="2"/><path d="M16 3v3"/><rect x="2" y="2" width="11" height="5" rx=".8" fill="currentColor" stroke="none"/></svg>';

function poster(story, device, file) {
  const tablet=device==='ipad';
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><title>${escape(story.label)}</title><style>
  *{box-sizing:border-box}html,body{margin:0;width:${tablet?1032:440}px;height:${tablet?1376:956}px;overflow:hidden}
  body{font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif;background:#fff;color:#191f27;-webkit-font-smoothing:antialiased}
  .art{height:100%;position:relative;overflow:hidden;background:#fff}
  h1{position:absolute;top:${tablet?76:43}px;left:20px;right:20px;margin:0;text-align:center;font-size:${tablet?56:32}px;line-height:1.34;letter-spacing:${tablet?'-2px':'-1.1px'};font-weight:800;white-space:nowrap}
  h1 span{display:block}
  .device{position:absolute;left:${tablet?62:43}px;top:${tablet?300:180}px;width:${tablet?908:354}px;height:${tablet?1040:768}px;border:4px solid #e8ebef;border-radius:${tablet?35:41}px;background:#f4f7fa;box-shadow:0 10px 32px #17334b16;overflow:hidden}
  .device img{display:block;width:100%;height:100%;object-fit:fill}
  .device::after{content:'';position:absolute;left:38%;bottom:7px;width:24%;height:4px;border-radius:4px;background:#192b3d;opacity:.65}
  .top-speaker{height:${tablet?30:25}px;display:flex;align-items:center;justify-content:space-between;padding:0 ${tablet?25:17}px;background:${['lecture','online_managed'].includes(story.category)?'#123b59':'#f4f7fa'};font-size:${tablet?12:10}px;font-weight:700;color:${['lecture','online_managed'].includes(story.category)?'#fff':'#193149'}}
  .screen{height:calc(100% - ${tablet?30:25}px);overflow:hidden}
  .status-icons{display:flex;gap:4px;align-items:center}
  </style><main class="art"><h1>${story.title.map(t=>`<span>${escape(t)}</span>`).join('')}</h1><div class="device"><div class="top-speaker"><span>9:41</span><span class="status-icons">${statusIcons}</span></div><div class="screen"><img src="/${file.replace(/\\/g,'/')}"></div></div></main></html>`;
}

async function seed(page, category, route, storyId) {
  await page.evaluate(({category,route,storyId})=>{
    const id='99990',today=formatStudyBusinessDateKey(new Date());
    Object.assign(state,defaultState());
    state.students=Array.from({length:12},(_,i)=>({id:String(Number(id)+i),name:i===0?'론박 수강생':`수강생 ${String(i).padStart(2,'0')}`,studentCategory:category,className:'론박 학습반',cohort:18,isActive:true,appRegisteredAt:'2026-10-01T00:00:00Z',track:'경찰직 - 공채(순경)',gender:'남'}));
    Object.assign(state.settings,{studentAuthId:id,lastStudentId:id,onlineManagedStudyCafeEnabled:true,studentDday:{title:'나의 목표일',date:'2027-03-20'},studentDdayVisible:true,attendanceDeadlineEnabled:true,attendanceDeadline:'10:00',studentProfiles:{[id]:{passwordHash:'local-example',deviceToken:'local-example',gender:'남',track:'경찰직 - 공채(순경)'}}});
    state.notices=[{id:'sample-notice-1',title:'이번 주 학습 일정 안내',content:'이번 주 학습 계획과 공지사항을 확인해주세요.',createdAt:'2026-11-19T00:00:00Z',important:true,isImportant:true},{id:'sample-notice-2',title:'론박스터디 앱 이용 안내',content:'수강 유형에 맞는 메뉴를 이용할 수 있습니다.',createdAt:'2026-11-18T00:00:00Z',important:true,isImportant:true}];
    isStandaloneStudentApp=()=>true;
    studyCafeLocalFallback=true;
    Object.assign(studyCafeRemoteState,{studentId:id,available:false,loaded:true,loadedScope:'full',loading:false,lastAttemptAt:Date.now(),lastLoadedAt:Date.now(),studyDateKey:today,plannerDateKey:today,error:''});
    Object.assign(studyCafePreviewState,{selectedSeatId:'seat-9',nickname:'론박 수강생',temporaryNickname:'',running:false,paused:true,subject:'해사법규',elapsedMs:17520000,subjectElapsedMs:{'해사법규':7200000,'해양경찰학개론':5760000,'형사법':4560000},customSubjects:['해사법규','해양경찰학개론','형사법']});
    const todos=[{id:'todo1',subject:'해사법규',content:'핵심 개념 복습하고 기출문제 풀기',completed:true},{id:'todo2',subject:'해양경찰학개론',content:'오늘 배운 내용 정리하기',completed:true},{id:'todo3',subject:'형사법',content:'틀린 문제 다시 풀고 오답 정리하기',completed:false},{id:'todo4',subject:'해사법규',content:'주요 조문 암기 확인하기',completed:false}];
    setStudyTodosForDate(today,todos);
    studyCafeRemoteState.subjectGoalsByDate[today]=[{subject:'해사법규',targetSeconds:10800},{subject:'해양경찰학개론',targetSeconds:7200},{subject:'형사법',targetSeconds:7200}];
    if(storyId==='06-calendar'){
      studyTodoCalendarOpen=true;
      studyTodoCalendarMonthKey=today.slice(0,7);
      studyCafeRemoteState.todoMonthSummaries[studyTodoCalendarMonthKey]=Object.fromEntries(Array.from({length:19},(_,i)=>[studyTodoCalendarMonthKey+'-'+String(i+1).padStart(2,'0'),{total:4,completed:i===18?2:[4,3,4,2,4,0,4][i%7]}]));
    }
    if(storyId==='07-ranking'){
      // The normal ranking UI receives fictional response data in memory only.
      studyCafeRemoteState.available=true;
      studyCafeRemoteState.rankingPeriods.daily={ranking:[{name:'김○○',totalSeconds:25200,tone:'blue'},{name:'이○○',totalSeconds:21600,tone:'mint'},{name:'박○○',totalSeconds:19800,tone:'purple'},{name:'론박 수강생',totalSeconds:17520,tone:'navy',isMine:true},{name:'정○○',totalSeconds:14400,tone:'rose'},{name:'최○○',totalSeconds:12600,tone:'orange'}],summary:{studiedCount:6,focusedCount:4},dateFrom:today,dateTo:today};
      studyRankingPreviewState.period='daily';studyRankingPreviewState.dateOffset=0;
    }
    localStorage.setItem('ronpark-study-cafe-timer-pause-guide-v2','1');
    if(storyId==='01-timer')studyTimerStatsState.mode='timer';
    if(storyId==='04-stats'){
      studyTimerStatsState.mode='stats';studyTimerStatsState.period='weekly';
      const range=getStudyTimerStatsRange(),days=enumerateStudyTimerDateKeys(range.dateFrom,range.dateTo).map((date,i)=>({date,totalSeconds:[21600,25200,19800,17520,0,0,0][i],longestSeconds:7200,sessionCount:i<4?3:0,subjects:{}}));
      studyTimerStatsState.cache[`${range.dateFrom}:${range.dateTo}`]={ok:true,...range,days,subjectTotals:{'해사법규':32400,'해양경찰학개론':28800,'형사법':22920},summary:{totalSeconds:84120,studiedDays:4,dailyAverageSeconds:21030,maxDailySeconds:25200,sessionCount:12}};
    }
    if(route==='grades'){
      state.finalExamScores=state.students.flatMap((student,i)=>[1,2,3].map(round=>{
        const names=getFinalGradeSubjectHeadersForTrack(student.track),offset=[0,10,5,15,-5,-10,-15,-20,-25,-30,-35,-40][i];
        const subjectScores=Object.fromEntries(names.map((subject,j)=>{const score=Math.min(100,Math.max(20,70+j*5+(round-1)*5+offset));return [subject,{score,maxScore:100,wrongCount:(100-score)/5,status:'submitted'}];}));
        return {studentId:student.id,studentName:student.name,track:student.track,cohort:'18',round,subjectScores};
      }));
    }
    resetStudyCafeShopState();hydrateLocalStudyCafeShop(getAuthedStudent());
    navigate(route);render();
    document.querySelectorAll('.modal-backdrop').forEach(n=>n.remove());
    document.querySelector('#app-startup')?.remove();
  },{category,route,storyId});
  await page.waitForTimeout(500);
  if(route==='grades')await page.evaluate(()=>{studentGradesView='lookup';studentGradeLookupType='final';selectedStudentFinalRound=3;render();});
  if(route==='student'){
    await page.locator('textarea[name="detail"]').fill('병원 진료 후 복귀하겠습니다.');
    await page.locator('select[name="expectedReturnHour"]').selectOption('11');
    await page.locator('select[name="expectedReturnMinute"]').selectOption('30');
  }
  await page.evaluate(()=>{document.querySelectorAll('button').forEach(b=>{if(b.textContent.trim()==='좋아요!')b.click()});});
}

(async()=>{
  fs.mkdirSync(raw,{recursive:true});
  const selectedStories=process.argv.includes('--only-replacements')?stories.filter(story=>story.id==='01-timer'):stories;
  if(process.argv.includes('--only-replacements')){
    const previous=path.join(root,'artifacts/app-store-showcase-20261119-v3');
    for(const folder of ['iphone-1320x2868','iphone-1206x2622','ipad-2064x2752']){
      fs.mkdirSync(path.join(out,folder),{recursive:true});
      for(const story of stories.filter(story=>!selectedStories.includes(story)))fs.copyFileSync(path.join(previous,folder,story.id+'.png'),path.join(out,folder,story.id+'.png'));
    }
  }
  const server=http.createServer((req,res)=>{
    const pathname=new URL(req.url,'http://localhost').pathname;
    res.setHeader('Cache-Control','no-store');
    if(pathname==='/config.js'){res.setHeader('Content-Type',types['.js']);return res.end('window.OUTING_APP_CONFIG={supabaseUrl:"",supabaseAnonKey:""};');}
    if(pathname.startsWith('/api/')){res.setHeader('Content-Type','application/json');return res.end('{"ok":false,"error":"isolated_store_assets"}');}
    if(pathname.startsWith('/poster/')){
      const [id,device]=pathname.slice(8).split('/'),story=stories.find(item=>item.id===id);
      if(!story){res.writeHead(404);return res.end();}
      res.setHeader('Content-Type',types['.html']);return res.end(poster(story,device,path.relative(root,path.join(raw,device+'-'+id+'.png'))));
    }
    const filename=path.resolve(root,'.'+decodeURIComponent(pathname==='/'?'/index.html':pathname));
    if(!filename.startsWith(root+path.sep)||pathname.includes('/.')||!types[path.extname(filename)]||pathname==='/sw.js'||!fs.existsSync(filename)||!fs.statSync(filename).isFile()){res.writeHead(404);return res.end();}
    res.setHeader('Content-Type',types[path.extname(filename)]);fs.createReadStream(filename).pipe(res);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  let browser;
  try{
    browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
    const failures=[];
    for(const [device,viewport] of [['iphone',{width:402,height:854}],['ipad',{width:1024,height:1140}]]){
      const context=await browser.newContext({viewport,deviceScaleFactor:device==='iphone'?3:2,locale:'ko-KR',timezoneId:'Asia/Seoul',serviceWorkers:'block'});
      await context.route('**/*',route=>route.request().url().startsWith(base)||route.request().url().startsWith('data:')?route.continue():route.abort());
      await context.addInitScript(()=>{const NativeDate=Date,fixed=Date.parse('2026-11-19T09:41:00+09:00');window.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[fixed]));}static now(){return fixed;}};});
      for(const story of selectedStories){
        const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
        await page.goto(base+'/?storePreview=1#home',{waitUntil:'load'});
        await page.waitForFunction(()=>typeof render==='function'&&typeof state!=='undefined');
        await seed(page,story.category,story.route,story.id);
        await page.evaluate(()=>document.fonts.ready);
        const info=await page.evaluate(()=>({route:currentRoute,overflow:document.documentElement.scrollWidth>innerWidth+1,text:document.body.innerText.slice(0,2800),category:getAuthedStudent()?.studentCategory}));
        await page.screenshot({path:path.join(raw,device+'-'+story.id+'.png')});
        if(info.route!==story.route||info.overflow||errors.length||(story.id==='08-grades'&&info.text.includes('총점\n0/300점'))||(story.id==='02-planner'&&!info.text.includes('핵심 개념 복습'))||(story.id==='06-calendar'&&!info.text.includes('2026년 11월'))||(story.id==='07-ranking'&&(!info.text.includes('순공시간 랭킹')||info.text.includes('로컬 미리보기 데이터'))))failures.push({device,id:story.id,errors,...info});
        console.log(JSON.stringify({device,id:story.id,...info}));
        await page.close();
      }
      await context.close();
    }
    const variants=[['iphone-1320x2868','iphone',440,956,3],['iphone-1206x2622','iphone',402,874,3],['ipad-2064x2752','ipad',1032,1376,2]];
    for(const [folder,device,width,height,scale] of variants){
      fs.mkdirSync(path.join(out,folder),{recursive:true});
      const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:scale});
      for(const story of selectedStories){
        await page.goto(base+'/poster/'+story.id+'/'+device,{waitUntil:'load'});
        if(width===402)await page.addStyleTag({content:'html,body{width:402px;height:874px}.art{width:440px;height:956px;transform:scale(.913636);transform-origin:top left}'});
        await page.evaluate(()=>document.fonts.ready);
        const checks=await page.evaluate(()=>({images:[...document.images].every(img=>img.complete&&img.naturalWidth>0),titleFits:[...document.querySelectorAll('h1 span')].every(span=>{const range=document.createRange();range.selectNodeContents(span);const box=range.getBoundingClientRect();return box.right<=innerWidth+1&&box.left>=0;}),whiteBackground:getComputedStyle(document.querySelector('.art')).backgroundColor==='rgb(255, 255, 255)',minimalComposition:document.querySelector('.art').children.length===2,deviceFits:document.querySelector('.device').getBoundingClientRect().bottom<=innerHeight+1,screenAspect:Math.abs(document.querySelector('.screen img').naturalWidth/document.querySelector('.screen img').naturalHeight-document.querySelector('.screen').clientWidth/document.querySelector('.screen').clientHeight)<.001}));
        if(Object.values(checks).some(value=>value!==true))failures.push({folder,id:story.id,...checks});
        await page.screenshot({path:path.join(out,folder,story.id+'.png'),omitBackground:false});
      }
      await page.close();
    }
    fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({created:'2026-11-19',designRevision:4,appId:'6827374000',sampleData:true,productionWrites:false,background:'#ffffff',composition:'short-title-and-large-app-screen',replaced:['01-timer'],references:['https://apps.apple.com/kr/app/id6795790129','https://apps.apple.com/kr/app/id1018769995'],stories,failures},null,2));
    for(const folder of ['iphone-1320x2868','iphone-1206x2622','ipad-2064x2752']){
      const stale=path.join(out,folder,'05-ranking.png');if(fs.existsSync(stale))fs.unlinkSync(stale);
    }
    for(const device of ['iphone','ipad']){const stale=path.join(raw,device+'-05-ranking.png');if(fs.existsSync(stale))fs.unlinkSync(stale);}
    console.log('Created all showcase images. Capture issues: '+failures.length);
  }finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
