/* Loaded only by the administrator shell. Statistics are requested on entry/manual refresh. */
function renderDataAnalyticsAdmin() {
  if (!hasTeacherPermission('analytics.read')) return renderForbidden();
  const host=el('section',{className:'card data-analytics'},[]);
  if (!document.querySelector('link[data-analytics-style]')) {
    document.head.appendChild(el('link',{rel:'stylesheet',href:'./data-analytics-admin.css?v=20261001-analytics','data-analytics-style':'true'}));
  }
  const firstDate='2026-09-17';
  const koreanToday=()=>new Date(Date.now()+9*3600000).toISOString().slice(0,10);
  const shiftDate=(date,days)=>new Date(Date.parse(date+'T00:00:00Z')+days*86400000).toISOString().slice(0,10);
  const number=value=>Number(value || 0).toLocaleString('ko-KR');
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let busy=false;
  host.innerHTML=`
    <div class="analytics-heading"><div><p class="analytics-eyebrow">학습 이용 현황</p><h2>형사법 OX 데이터 분석</h2>
      <p>날짜별 이용자 수와 풀이 횟수를 확인하세요.</p></div><span class="analytics-timezone">한국시간 기준</span></div>
    <form class="analytics-filters">
      <label>시작일<input type="date" name="startDate" required min="${firstDate}" max="${koreanToday()}"></label>
      <span class="analytics-date-separator" aria-hidden="true">—</span>
      <label>종료일<input type="date" name="endDate" required min="${firstDate}" max="${koreanToday()}"></label>
      <button class="btn" type="submit">조회 · 새로고침</button>
      <div class="analytics-presets" role="group" aria-label="조회 기간 빠른 선택">
        <button class="mini-btn" type="button" data-period="7">최근 7일</button>
        <button class="mini-btn" type="button" data-period="30">최근 30일</button>
        <button class="mini-btn" type="button" data-period="month">이번 달</button>
      </div>
    </form>
    <p class="analytics-definition">하루에 답안을 1개 이상 저장한 계정을 1명으로 집계합니다. 접속만 한 계정은 제외하며, 수강생과 교사를 구분합니다.</p>
    <p class="analytics-status" role="status" data-analytics-status></p>
    <div data-analytics-results></div>`;
  const form=host.querySelector('form');
  const start=form.elements.startDate, end=form.elements.endDate;
  const status=host.querySelector('[data-analytics-status]');
  const results=host.querySelector('[data-analytics-results]');

  function setPeriod(period) {
    const today=koreanToday();
    start.max=end.max=today;
    end.value=today;
    start.value=[firstDate,period==='month'?today.slice(0,7)+'-01':shiftDate(today,1-Number(period))].sort().at(-1);
  }
  function renderReport(report) {
    const summary=report.summary, rows=report.daily;
    const max=Math.max(1,...rows.map(row=>Math.max(row.students,row.teachers)));
    const cards=[['이용 수강생',summary.students,'기간 내 중복 제외 · 명'],['이용 교사',summary.teachers,'기간 내 중복 제외 · 명'],
      ['수강생 풀이',summary.studentAttempts,'재풀이 포함 · 회'],['교사 풀이',summary.teacherAttempts,'재풀이 포함 · 회']];
    results.innerHTML=`
      <div class="analytics-report-heading"><h3>${escape(report.startDate)} ~ ${escape(report.endDate)}</h3>
        <span>${escape(report.checkedAt)} 집계</span></div>
      <div class="analytics-summary">${cards.map(([label,count,unit])=>`<article><span>${label}</span><strong>${number(count)}</strong><small>${unit}</small></article>`).join('')}</div>
      ${!summary.students&&!summary.teachers?'<p class="analytics-empty">선택한 기간에 저장된 풀이 기록이 없습니다.</p>':''}
      <div class="analytics-chart-heading"><h3>일별 이용자 추이</h3><div class="analytics-legend"><span>수강생</span><span>교사</span></div></div>
      <p class="analytics-chart-hint">오래된 날짜부터 표시합니다. 날짜별 정확한 수치는 아래 표에서 확인할 수 있습니다.</p>
      <div class="analytics-chart-scroll" tabindex="0" role="region" aria-label="일별 이용자 추이, 좌우 스크롤 가능">
        <div class="analytics-chart" aria-hidden="true">${[...rows].reverse().map(row=>`<div class="analytics-day" title="${escape(row.date)} · 수강생 ${number(row.students)}명 · 교사 ${number(row.teachers)}명">
          <div class="analytics-bars"><span style="height:${row.students/max*100}%"></span><span style="height:${row.teachers/max*100}%"></span></div>
          <span>${escape(row.date.slice(5).replace('-','/'))}</span></div>`).join('')}</div>
      </div>
      <div class="analytics-table-heading"><h3>날짜별 상세</h3><span>최신 날짜순 · ${rows.length}일</span></div>
      <div class="analytics-table-scroll" tabindex="0" role="region" aria-label="형사법 OX 날짜별 이용 통계">
        <table><caption>하루 단위 중복 제외 이용자 수와 재풀이를 포함한 풀이 횟수</caption>
          <thead><tr><th scope="col">날짜</th><th scope="col">수강생 (명)</th><th scope="col">교사 (명)</th><th scope="col">수강생 풀이 (회)</th><th scope="col">교사 풀이 (회)</th></tr></thead>
          <tbody>${rows.map(row=>`<tr><th scope="row">${escape(row.date)}${row.date===koreanToday()?'<span class="analytics-today">오늘</span>':''}</th><td>${number(row.students)}</td><td>${number(row.teachers)}</td><td>${number(row.studentAttempts)}</td><td>${number(row.teacherAttempts)}</td></tr>`).join('')}</tbody>
        </table>
      </div>
      <p class="analytics-footnote">기간 내 이용자 수는 날짜별 인원을 더한 값이 아닙니다. 같은 계정이 여러 날 이용해도 기간 전체에서는 1명으로 계산합니다. 오늘 수치는 집계 시점까지이며, 현재 비활성 계정의 보존된 풀이 기록도 포함합니다.</p>`;
  }
  async function load() {
    if (busy || !form.reportValidity()) return;
    const startDate=start.value, endDate=end.value;
    if (startDate>endDate || (Date.parse(endDate)-Date.parse(startDate))/86400000>365 || endDate>koreanToday()) {
      status.textContent='시작일과 종료일을 확인해주세요. 오늘까지 최대 366일을 조회할 수 있습니다.';
      return;
    }
    busy=true;
    form.querySelectorAll('input,button').forEach(control=>control.disabled=true);
    host.setAttribute('aria-busy','true');
    results.replaceChildren();
    status.textContent='이용 현황을 불러오는 중입니다…';
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),20000);
    try {
      const response=await fetch('/api/criminal-law-ox',{method:'POST',credentials:'same-origin',cache:'no-store',
        headers:{'Content-Type':'application/json'},signal:controller.signal,
        body:JSON.stringify({action:'admin_analytics',startDate,endDate})});
      const report=await response.json();
      if (!response.ok || !report.ok) {
        const messages={unauthorized:'로그인이 만료되었습니다. 다시 로그인해주세요.',forbidden:'데이터 분석 조회 권한이 없습니다.',invalid_request:'조회 기간을 확인해주세요. 최대 366일까지 조회할 수 있습니다.'};
        throw Error(messages[report.error] || '데이터를 불러오지 못했습니다. 잠시 후 조회 · 새로고침을 눌러주세요.');
      }
      renderReport(report);
      status.textContent='조회가 완료되었습니다. 최신 현황은 조회 · 새로고침으로 확인하세요.';
    } catch (error) {
      status.textContent=error.name==='AbortError'?'응답이 지연되고 있습니다. 조회 · 새로고침을 눌러 다시 시도해주세요.':error.message;
    } finally {
      clearTimeout(timer);
      busy=false;
      host.setAttribute('aria-busy','false');
      form.querySelectorAll('input,button').forEach(control=>control.disabled=false);
    }
  }
  form.addEventListener('submit',event=>{event.preventDefault();load();});
  form.addEventListener('click',event=>{
    const preset=event.target.closest('[data-period]');
    if (!preset || busy) return;
    setPeriod(preset.dataset.period);load();
  });
  setPeriod('30');
  load();
  return host;
}
