// Preview-only: use the real app UI with local example data.
(() => {
  ensureStudyCafeRemoteLoaded = () => {};
  ensureStudyCafeShopLoaded = () => {};
  ensureStudyRoomLoaded = () => {};
  ensureStudyCafePreviewClock = () => {};
  // A design preview has no server timer to pause or reconcile in the background.
  scheduleStudyCafeAutoPause = () => {};
  reconcileStudyCafeAfterBackgroundAutoPause = async () => {};
  if (studyCafeAutoPauseTimer) clearTimeout(studyCafeAutoPauseTimer);
  clearStudyCafeAutoPauseRecovery();
  if (studyCafePreviewClock) clearInterval(studyCafePreviewClock);
  studyCafePreviewState.selectedSeatId = STUDY_CAFE_PREVIEW_SEATS[6].id;
  studyCafePreviewState.subject = '해양경찰학';
  studyCafePreviewState.running = true;
  studyCafePreviewState.paused = false;
  studyCafePreviewState.nickname = '공부하는 나';
  studyCafePreviewState.startedAt = Date.now();
  studyCafePreviewState.subjectElapsedMs = {'해양경찰학':10800000,'해사법규':9000000,'항해학':7200000};
  studyCafePreviewState.activeRoomIndex = 0;
  const emptySeatPreview = new URLSearchParams(location.search).get('seat') === 'empty'
    || new URLSearchParams(window.parent.location.search).get('seat') === 'empty';
  if (emptySeatPreview) {
    studyCafePreviewState.selectedSeatId = '';
    studyCafePreviewState.subject = '';
    studyCafePreviewState.running = false;
  }
  const today = formatStudyBusinessDateKey(new Date());
  studyTimerStatsState.anchorDate = parseStudyTimerDateKey(today);

  const originalSeatCard = renderStudyCafeMySeatCard;
  renderStudyCafeMySeatCard = function(student, seatNumber) {
    const card = originalSeatCard(student, seatNumber);
    const time = card.querySelector('.study-cafe-my-seat-actions time');
    time.textContent = '7시간 30분';
    return card;
  };
  const originalCafe = renderStudentStudyCafe;
  renderStudentStudyCafe = function() {
    const page = originalCafe();
    const actions = page.querySelector('.study-cafe-room-label-actions');
    if (!actions) return page;
    const link = el('button', {
      type: 'button', className: 'study-cafe-ranking-button cafe-stats-preview-link', ariaLabel: '공부시간 통계 보기',
      onclick: () => {
        studyTimerStatsState.mode = 'stats';
        studyTimerStatsState.period = 'daily';
        studyTimerStatsState.anchorDate = parseStudyTimerDateKey(today);
        navigate('study-timer');
      },
    });
    link.textContent = '통계';
    const ranking = actions.querySelector('.study-cafe-ranking-button');
    if (ranking) ranking.after(link);
    else actions.prepend(link);
    actions.closest('.study-cafe-room-label-row').classList.add('cafe-stats-preview-navigation');
    return page;
  };
  const style = document.createElement('style');
  style.textContent = `.study-cafe-room .study-cafe-my-seat-actions time{white-space:nowrap}.study-cafe-room .cafe-stats-preview-link{min-height:28px;padding:3px 9px;white-space:nowrap;background:#edf6f7;border-color:#adc9cf;color:var(--room-ink)}.study-cafe-room .cafe-stats-preview-navigation{gap:6px}.study-cafe-room .cafe-stats-preview-navigation .study-cafe-room-label-actions{gap:5px}.study-cafe-room .cafe-stats-preview-navigation .study-cafe-ranking-help-button{flex-shrink:0}`;
  document.head.append(style);

  function exampleStudySeconds(date) {
    const dayOffset = Math.round((Date.parse(today+'T12:00:00Z')-Date.parse(date+'T12:00:00Z'))/86400000);
    if (dayOffset < 0 || dayOffset % 17 === 12) return 0;
    return dayOffset === 0 ? 27000 : [21600,27000,19800,23400,25200,21600,14400][new Date(date+'T12:00:00Z').getUTCDay()];
  }
  function statsData(range) {
    const days = enumerateStudyTimerDateKeys(range.dateFrom, range.dateTo).map((date, index) => ({
      date, totalSeconds: exampleStudySeconds(date),
      longestSeconds: 10800, firstStartedAt: date+'T09:00:00+09:00', lastEndedAt: date+'T18:00:00+09:00',
    }));
    const totalSeconds = days.reduce((sum, day) => sum + day.totalSeconds, 0), studiedDays = days.filter(day=>day.totalSeconds).length;
    return {ok:true,serverNow:new Date().toISOString(),...range,days,summary:{totalSeconds,studiedDays,dailyAverageSeconds:Math.floor(totalSeconds/(studiedDays||1)),maxDailySeconds:Math.max(0,...days.map(day=>day.totalSeconds))},subjectTotals:{'해양경찰학':Math.floor(totalSeconds*.4),'해사법규':Math.floor(totalSeconds/3),'항해학':totalSeconds-Math.floor(totalSeconds*.4)-Math.floor(totalSeconds/3)}};
  }
  const originalStats = renderStudyTimerStats;
  const originalHeader = renderStudyTimerHeaderActions;
  function primeStats() {const range=getStudyTimerStatsRange();studyTimerStatsState.cache[range.dateFrom+':'+range.dateTo]=statsData(range);studyTimerStatsState.error='';}
  renderStudyTimerStats = function() {primeStats();return originalStats();};
  renderStudyTimerHeaderActions = function(active) {primeStats();return originalHeader(active);};
  const originalTimerPage = renderStudentStudyTimer;
  renderStudentStudyTimer = function() {
    const page = originalTimerPage();
    if (studyTimerStatsState.mode !== 'stats') return page;
    const head = page.querySelector('.study-timer-page-head');
    if (!head) return page;
    const title = head.querySelector('h2');
    const share = head.querySelector('.study-timer-share-button');
    const status = head.querySelector('.study-timer-active-chip');
    const back = el('button', {
      type:'button', className:'cafe-stats-preview-back', ariaLabel:'스터디카페로 돌아가기',
      onclick:() => navigate('study-cafe'),
    }, '‹');
    const heading = el('div', {className:'cafe-stats-preview-title'}, [back, title]);
    const top = el('div', {className:'cafe-stats-preview-heading'}, [heading, share]);
    const meta = el('div', {className:'cafe-stats-preview-meta'}, [
      status ? el('span', {className:'cafe-stats-preview-status'}, status.textContent) : null,
      el('span', {}, '하루 기록은 오전 4시에 시작됩니다'),
    ]);
    head.classList.add('cafe-stats-preview-head');
    head.replaceChildren(top, meta);
    return page;
  };
  style.textContent += `.study-timer-page-head.cafe-stats-preview-head{display:flex;flex-direction:column;align-items:stretch;gap:9px;padding-top:2px;padding-bottom:2px}.cafe-stats-preview-head .cafe-stats-preview-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}.cafe-stats-preview-head .cafe-stats-preview-heading h2{margin:0;font-size:1.15rem;line-height:1.35}.cafe-stats-preview-head .cafe-stats-preview-meta{display:flex;align-items:center;flex-wrap:wrap;gap:6px 9px}.cafe-stats-preview-head .cafe-stats-preview-meta>span{font-size:.65rem;line-height:1.5;color:#a9c9dc}.cafe-stats-preview-head .cafe-stats-preview-meta .cafe-stats-preview-status{color:#bee9e5;white-space:nowrap;display:inline-flex;align-items:center;gap:5px}.cafe-stats-preview-status:before{content:'';display:inline-block;width:5px;height:5px;border-radius:50%;background:currentColor}`;
  requestStudyTimerStats = () => {};
  style.textContent += `.cafe-stats-preview-title{display:flex;align-items:center;gap:4px;min-width:0}.cafe-stats-preview-title h2{white-space:nowrap}.cafe-stats-preview-back{display:grid;place-items:center;width:36px;min-width:36px;height:44px;padding:0;border:0;border-radius:8px;background:transparent;color:#fff;font:inherit;font-size:1.7rem;line-height:1;cursor:pointer}.cafe-stats-preview-back:hover{background:rgba(255,255,255,.08)}`;
  loadStudyTimerSharePlans = async range => enumerateStudyTimerDateKeys(range.dateFrom,range.dateTo).filter(date=>date<=today).map(studyDate=>({studyDate,total:10,completed:8}));
  const originalShareOpen = window.StudyRecordShare.open;
  window.StudyRecordShare.open = async function(options) {
    const photoState = { image: null };
    const selection = {period:options.period,anchor:new Date(studyTimerStatsState.anchorDate)};
    const labels = {daily:'일간',weekly:'주간',monthly:'월간'};
    let emptyView = null;
    function closeEmptyView() {
      if (!emptyView) return;
      const view=emptyView;emptyView=null;view.remove();
      document.documentElement.classList.remove('study-record-share-open');
      window.removeEventListener('hashchange',closeEmptyView);
      document.querySelector('.study-timer-share-button')?.focus({preventScroll:true});
    }
    function rangeForSelection() {
      let start = new Date(selection.anchor), end = new Date(selection.anchor);
      if (selection.period === 'weekly') {
        start.setDate(start.getDate() - (start.getDay() || 7) + 1);
        end = new Date(start); end.setDate(end.getDate()+6);
      } else if (selection.period === 'monthly') {
        start = new Date(start.getFullYear(),start.getMonth(),1,12);
        end = new Date(start.getFullYear(),start.getMonth()+1,0,12);
      }
      return {dateFrom:formatStudyTimerDateKey(start),dateTo:formatStudyTimerDateKey(end)};
    }
    function showSelection(focusLabel) {
      closeEmptyView();
      const range = rangeForSelection();
      const data = statsData(range);
      if (!data.summary.totalSeconds) {
        // Dispose of the previous file, including any PNG generation still in flight.
        window.StudyRecordShare.close();
        emptyView=el('dialog',{className:'study-record-share-dialog'},[
          el('div',{className:'study-record-share-layout'},[
            el('header',{className:'study-record-share-head'},[
              el('button',{type:'button',className:'study-record-share-back',ariaLabel:'통계로 돌아가기',onclick:closeEmptyView},'‹'),
              el('h2',{},'기록 공유'),
            ]),
            el('div',{className:'study-record-share-content'},[el('p',{className:'study-record-share-status',role:'status'},'선택한 날짜에는 공부 기록이 없습니다.')]),
            el('footer',{className:'study-record-share-actions'},[
              el('button',{type:'button',className:'btn secondary',disabled:true},'이미지 저장'),
              el('button',{type:'button',className:'btn',disabled:true},'공유하기'),
            ]),
          ]),
        ]);
        const view=emptyView;
        view.addEventListener('close',()=>{if(emptyView===view)closeEmptyView();});
        window.addEventListener('hashchange',closeEmptyView);
        document.body.append(view);document.documentElement.classList.add('study-record-share-open');view.showModal();
      }
      const opened = data.summary.totalSeconds ? originalShareOpen({...options,photoState,period:selection.period,data,loadPlans:()=>loadStudyTimerSharePlans(range)}) : Promise.resolve();
      const dialog = document.querySelector('.study-record-share-dialog');
      if (!dialog) return opened;
      const layout = dialog.querySelector('.study-record-share-layout');
      layout.classList.add('cafe-share-with-picker');
      const tabs = el('nav', {className:'study-timer-stats-periods',ariaLabel:'공유할 기록 기간 선택'},
        Object.entries(labels).map(([period,label])=>el('button', {
          type:'button',className:`study-timer-stats-period-button ${selection.period===period?'active':''}`,
          'aria-pressed':String(selection.period===period),
          onclick:()=>{if(selection.period!==period){selection.period=period;showSelection(label);}},
        }, label)));
      const from = parseStudyTimerDateKey(range.dateFrom), to = parseStudyTimerDateKey(range.dateTo);
      const rangeLabel = selection.period === 'daily' ? `${from.getFullYear()}년 ${from.getMonth()+1}월 ${from.getDate()}일`
        : selection.period === 'monthly' ? `${from.getFullYear()}년 ${from.getMonth()+1}월`
          : `${from.getFullYear()}. ${from.getMonth()+1}.${from.getDate()} – ${to.getFullYear()!==from.getFullYear()?to.getFullYear()+'. ':''}${to.getMonth()+1}.${to.getDate()}`;
      function move(amount) {
        if (selection.period==='monthly') selection.anchor.setMonth(selection.anchor.getMonth()+amount,1);
        else selection.anchor.setDate(selection.anchor.getDate()+amount*(selection.period==='weekly'?7:1));
        showSelection(amount<0?'이전 기간':'다음 기간');
      }
      function dateArrow(direction) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 16 16');
        svg.setAttribute('width', '16'); svg.setAttribute('height', '16');
        svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', direction < 0 ? 'M10 4L6 8L10 12' : 'M6 4L10 8L6 12');
        path.setAttribute('fill', 'none'); path.setAttribute('stroke', 'currentColor');
        path.setAttribute('stroke-width', '1.8'); path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-linejoin', 'round'); svg.append(path);
        return svg;
      }
      const dateNav = el('div', {className:'study-timer-stats-date-nav cafe-share-picker-dates'}, [
        el('button',{type:'button',className:'study-timer-stats-date-button',ariaLabel:'이전 기간',onclick:()=>move(-1)},dateArrow(-1)),
        el('strong',{'aria-live':'polite'},rangeLabel),
        el('button',{type:'button',className:'study-timer-stats-date-button',ariaLabel:'다음 기간',disabled:range.dateTo>=today,onclick:()=>move(1)},dateArrow(1)),
      ]);
      const controls = el('div',{className:'cafe-share-picker'},[tabs,dateNav]);
      layout.querySelector('.cafe-share-picker')?.remove();
      layout.querySelector('.study-record-share-head').after(controls);
      dialog.setAttribute('aria-label',`${labels[selection.period]} 기록 공유, ${rangeLabel}`);
      if (focusLabel) {
        const target = Array.from(controls.querySelectorAll('button')).find(button=>(button.getAttribute('aria-label')||button.textContent)===focusLabel);
        (target && !target.disabled ? target : tabs.querySelector('.active')).focus({preventScroll:true});
      }
      return opened;
    }
    return showSelection();
  };
  style.textContent += `.study-record-share-layout.cafe-share-with-picker{grid-template-rows:auto auto minmax(0,1fr) auto}.cafe-share-picker{padding:0 16px 13px;display:grid;gap:10px}.cafe-share-picker .cafe-share-picker-dates strong{font-size:.8rem;color:inherit;white-space:normal;text-align:center;line-height:1.4}.cafe-share-picker .study-timer-stats-date-button{height:32px;min-height:32px}.cafe-share-picker .study-timer-stats-period-button{font:inherit;font-size:.76rem;font-weight:900}`;
  style.textContent += `.cafe-share-picker .cafe-share-picker-dates{grid-template-columns:32px minmax(0,1fr) 32px}.cafe-share-picker .study-timer-stats-date-button{width:32px;height:32px;min-width:32px;padding:0;display:grid;place-items:center;line-height:1}.cafe-share-picker .study-timer-stats-date-button svg{display:block;width:16px;height:16px}`;
  render();
})();
