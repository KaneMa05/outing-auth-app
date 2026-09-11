const fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
const sceneFn=src.slice(src.indexOf('function scene('),src.indexOf('function time(')).replace('class="fire-svg"','class="fire-svg" preserveAspectRatio="none"');
const html=`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>랭킹룸 좌석 · 불꽃 적용 시안</title><link rel="stylesheet" href="character-base.css"><link rel="stylesheet" href="preview.css"><link rel="stylesheet" href="fire.css"><link rel="stylesheet" href="seat-preview.css"><body><main id="app"></main><script>
let paused=false;const stages=['공부 시작','집중의 불씨','타오르는 집중','몰입의 불꽃','뜨거운 몰입','황금 불꽃'].map(name=>({name}));
${sceneFn}
const times=['06:02:43','04:28:45','03:54:44','03:51:46','03:30:33','03:25:09','03:24:59','03:21:45','03:11:06','03:10:58','02:55:00','02:32:39','02:30:46','02:23:58','02:03:32','01:48:33','01:41:50','01:31:00','01:20:00','01:10:00'];
function level(t){const p=t.split(':').map(Number);const s=p[0]*3600+p[1]*60+p[2];return [10800,18000,25200,32400,36000].filter(v=>s>=v).length}
function seat(n,t,l=level(t),demo=false){return '<div class="seat '+(demo?'demo':'')+'"><span class="rank r'+n+'">'+n+'</span><span class="name">'+(demo?'나의 좌석':'수강생 '+n)+'<small>공채</small></span><time>'+t+'</time>'+(n===16?'<span class="paused-icon">Ⅱ</span>':'')+scene(l)+'</div>'}
function room(){return '<section class="room-phone"><div class="app-brand"><span class="logo">R</span>RONPARK STUDY<span class="d-day">D-43</span></div><div class="room-shell"><div class="room-head"><div><strong>RONPARK STUDYCAFE</strong><small>랭킹룸 · 오늘 순공 랭킹 &nbsp; <b>랭킹룸 안내</b></small></div><span class="online">● 30명 집중 중</span></div><div class="my-card"><div class="my-visual">'+scene(0)+'</div><div class="my-copy"><small>내 좌석</small><div><strong>랭킹룸 30</strong><span>착석 중</span></div><b>집중하는수달 · 선생님</b><p>공부할 과목을 선택해주세요</p><div class="my-actions"><span>과목 선택</span><span>자리 비우기</span></div></div><time>00:02:34</time></div><div class="room-tools"><b>랭킹룸 · 순위 30 · 다음 과목 ···</b><span>♜ 순공 랭킹</span><span>☷ 스터디룸 목록</span></div><div class="room-tabs"><div class="chosen">랭킹룸<small>30/48</small></div><div>자유석<small>0/48</small></div></div><div class="seat-label">좌석 현황</div><div class="seats">'+times.map((t,i)=>seat(i+1,t)).join('')+'</div></div></section>'}
const hours=[0,3,5,7,9,10];
app.innerHTML='<div class="sheet"><div class="sheet-head"><small>RONPARK · FIRE IN THE STUDY ROOM</small><h1>이 화면에서는, 자리 안에서만 자라는 불꽃.</h1><p>첨부 화면을 기준으로 재구성한 적용 시안 · 캐릭터 크기와 4열 좌석 배치는 유지합니다.</p></div><div class="sheet-body"><div class="room-column">'+room()+'<p class="reconstruction">닉네임은 예시로 대체 · 공부시간은 첨부 화면 참고</p></div><section class="explanation"><div class="section-number">01 / 지금 보내주신 화면</div><h2>각자의 오늘 순공시간에 맞춰 켜져요.</h2><div class="mapping"><div><b>내 좌석</b><span>00:02:34</span><em>기본 모습</em></div><div><b>1위</b><span>06:02:43</span><em class="orange">5시간 · 주황 불꽃</em></div><div><b>2~9위</b><span>3~4시간대</span><em class="yellow">3시간 · 노란 불씨</em></div><div><b>10위 이후</b><span>3시간 미만</span><em>기본 모습</em></div></div><div class="section-number second">02 / 같은 좌석의 단계별 변화</div><h2>작은 칸에서는, 작고 또렷하게.</h2><p class="sub">아래는 좌석만 약 1.65배 확대했습니다. 실제 크기는 왼쪽 화면에서 확인하세요.</p><div class="seat-examples">'+hours.map((h,i)=>'<article><div class="example-title">'+(h?h+'시간':'기본')+'</div><div class="example-seat">'+seat(30,String(h).padStart(2,'0')+':00:00',i,true)+'</div><p>'+['불꽃 없음','작은 노란 불씨','주황 불꽃','짙은 주황','붉은 불꽃','황금 불꽃'][i]+'</p></article>').join('')+'</div><div class="rules"><b>이름·시간·순위는 그대로 읽히게</b><p>불꽃은 머리와 몸 뒤에만 표시하고, 책상 앞에는 나오지 않아요.<br>작은 좌석은 정지 불꽃, 내 좌석·상세에서만 천천히 일렁여요.<br>쉬어도 불꽃 단계는 유지하고, 공부시간 집계와 움직임만 멈춰요.</p></div><div class="footnote">랭킹과 불꽃 단계는 별개 · 하루 기준은 기존 순공 집계와 동일한 오전 4시</div></section></div><div class="sheet-footer">디자인 검토용 · 운영 앱 미반영<span>원본 캐릭터 CSS + 좌석에 맞춘 SVG 불꽃</span></div></div>';
</script></body></html>`;
const mapping='<div class="mapping"><div><b>1위</b><span>10:12:43</span><em class="yellow">10시간 · 황금 불꽃</em></div><div><b>2위</b><span>09:28:45</span><em class="orange">9시간 · 붉은 불꽃</em></div><div><b>3위</b><span>07:54:44</span><em class="orange">7시간 · 짙은 주황</em></div><div><b>4위</b><span>06:02:43</span><em class="orange">5시간 · 주황 불꽃</em></div><div><b>5~10위</b><span>3시간대</span><em class="yellow">3시간 · 노란 불씨</em></div><div><b>11위 이후</b><span>3시간 미만</span><em>기본 모습</em></div></div>';
const revised=html
 .replace("'06:02:43','04:28:45','03:54:44','03:51:46'","'10:12:43','09:28:45','07:54:44','06:02:43'")
 .replace('닉네임은 예시로 대체 · 공부시간은 첨부 화면 참고','전체 단계 비교용 예시 · 닉네임과 공부시간은 가상 데이터')
 .replace('01 / 지금 보내주신 화면','01 / 모든 단계가 함께 있는 좌석현황')
 .replace('각자의 오늘 순공시간에 맞춰 켜져요.','첫 줄에서 10 · 9 · 7 · 5시간을 비교해요.')
 .replace(/<div class="mapping">[\s\S]*?<div class="section-number second">/,mapping+'<div class="section-number second">');
fs.writeFileSync(path.join(__dirname,'seat-preview.html'),revised);
let render=fs.readFileSync(path.join(__dirname,'render-preview.cjs'),'utf8');
render=render.slice(0,render.indexOf(' const base='))+` const base=pathToFileURL(path.join(__dirname,'seat-preview.html')).href;
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
`;
fs.writeFileSync(path.join(__dirname,'render-seat-preview.cjs'),render);
