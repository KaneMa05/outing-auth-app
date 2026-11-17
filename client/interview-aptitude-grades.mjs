import {createAptitudeRequest,SECTIONS} from './interview-aptitude.mjs?v=20261117-aptitude-subject-scores';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const kinds={half:'하프',full:'본시험'};
const states={submitted:'제출',draft:'임시저장',not_submitted:'미제출'};
const roundStates={draft:'작성 중',open:'응시 가능',closed:'응시 종료'};
const fmt=value=>value==null?'—':Number(value).toLocaleString('ko-KR',{maximumFractionDigits:2});
const dateFormat=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
const submittedDate=value=>{if(!value)return '—';const p=Object.fromEntries(dateFormat.formatToParts(new Date(value)).map(({type,value})=>[type,value]));return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;};
const button=(label,action)=>`<button type="button" class="ip-btn" data-ag-action="${action}">${label}</button>`;

export function summarizeGrades(students){
  const submitted=students.filter(s=>s.state==='submitted');
  const scores=submitted.filter(s=>s.correctCount!=null&&s.accuracy!=null);
  return {total:students.length,submitted:submitted.length,draft:students.filter(s=>s.state==='draft').length,
    notSubmitted:students.filter(s=>s.state==='not_submitted').length,
    averageAccuracy:scores.length?scores.reduce((sum,s)=>sum+Number(s.accuracy),0)/scores.length:null,
    highestCorrect:scores.length?Math.max(...scores.map(s=>Number(s.correctCount))):null};
}

export function filterGrades(students,{query='',state='all'}={}){
  const text=query.trim().toLocaleLowerCase('ko-KR');
  return students.filter(s=>(state==='all'||s.state===state)&&(!text||[s.name,s.studentId].some(value=>String(value??'').toLocaleLowerCase('ko-KR').includes(text))));
}

export function aptitudeGradesCsv(round,students){
  // Quote every cell and neutralize text that spreadsheet programs treat as formulas.
  const cell=value=>'"'+String(value??'').replace(/^[\s\uFEFF]*[=+@-]/,"'$&").replaceAll('"','""')+'"';
  const rows=[['시험 유형','회차','시험명','학생','학생 ID','제출 상태',...SECTIONS.map(label=>`${label} 정답 수`),'정답 수','전체 문항','정답률(%)','등수','제출 시각(한국시간)'],
    ...students.map(s=>{const submitted=s.state==='submitted';return [kinds[round.kind],round.roundNo,round.title,s.name,s.studentId,states[s.state],
      ...SECTIONS.map((_,i)=>submitted?s.subjectCorrectCounts?.[i]:null),submitted?s.correctCount:null,round.questionCount,submitted?s.accuracy:null,submitted?s.rank:null,submitted&&s.submittedAt?submittedDate(s.submittedAt):null];})];
  return '\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n';
}

export async function mountAptitudeGrades(host,{request=createAptitudeRequest()}={}){
  if(!document.querySelector('link[data-aptitude-grades-style]')){
    const link=document.createElement('link');link.rel='stylesheet';link.href='/client/interview-aptitude-grades.css?v=20261117-aptitude-subject-scores';link.dataset.aptitudeGradesStyle='';document.head.append(link);
  }
  let dead=false,busy=false,generation=0,rounds=[],kind='half',selectedId='',report=null,query='',state='all';
  host.classList.add('ag-root');
  host.innerHTML=`<h2>적성 모의고사 성적관리</h2><p class="ip-message" data-ag-message role="status"></p><div data-ag-controls></div><div data-ag-report></div>`;
  const message=(text,error=false)=>{const node=host.querySelector('[data-ag-message]');node.textContent=text;node.setAttribute('role',error?'alert':'status');};
  const current=()=>rounds.filter(r=>r.kind===kind);
  const visible=()=>filterGrades(report?.students||[],{query,state});
  function lock(value){busy=value;host.querySelectorAll('button,input,select').forEach(el=>el.disabled=value);if(!value){const download=host.querySelector('[data-ag-action="export"]');if(download)download.disabled=!report||!visible().length;}}
  function controls(){
    host.querySelector('[data-ag-controls]').innerHTML=`<div class="ag-toolbar"><nav aria-label="성적 시험 유형">${Object.entries(kinds).map(([id,label])=>`<button type="button" class="ip-btn ${id===kind?'ip-primary':''}" data-ag-action="kind" data-kind="${id}" aria-pressed="${id===kind}">${label}</button>`).join('')}</nav><label>회차 선택<select data-ag-round>${current().map(r=>`<option value="${r.id}" ${r.id===selectedId?'selected':''}>${r.roundNo}회 · ${esc(r.title)}</option>`).join('')||'<option value="">등록된 회차 없음</option>'}</select></label>${button('새로고침','refresh')}</div>`;
  }
  function table(){
    if(!report)return;
    const rows=visible(),round=report.round;
    host.querySelector('[data-ag-count]').textContent=`${rows.length}명 / 전체 ${report.students.length}명`;
    host.querySelector('[data-ag-rows]').innerHTML=rows.map(s=>{const submitted=s.state==='submitted';return `<tr><td>${esc(s.name)}</td><td>${esc(s.studentId)}</td><td>${states[s.state]||'—'}</td>${SECTIONS.map((_,i)=>`<td>${submitted&&s.subjectCorrectCounts?.[i]!=null?`${fmt(s.subjectCorrectCounts[i])} / ${round.perSection}`:'—'}</td>`).join('')}<td>${submitted&&s.correctCount!=null?`${fmt(s.correctCount)} / ${round.questionCount}`:'—'}</td><td>${submitted&&s.accuracy!=null?fmt(s.accuracy)+'%':'—'}</td><td>${submitted?fmt(s.rank):'—'}</td><td>${submitted?esc(submittedDate(s.submittedAt)):'—'}</td></tr>`;}).join('')||`<tr><td colspan="${7+SECTIONS.length}" class="ag-empty">조건에 맞는 학생이 없습니다.</td></tr>`;
    const download=host.querySelector('[data-ag-action="export"]');if(download)download.disabled=busy||!rows.length;
  }
  function draw(){
    controls();
    const box=host.querySelector('[data-ag-report]');
    if(!report){box.innerHTML='<p class="ag-empty">선택한 유형에 등록된 회차가 없습니다.</p>';return;}
    const r=report.round,summary=summarizeGrades(report.students);
    box.innerHTML=`<section class="ag-heading"><h3>${esc(r.title)}</h3><p>${kinds[r.kind]} · ${r.questionCount}문항 · ${roundStates[r.state]} · 학생 결과 ${r.resultsReleased?'공개':'비공개'}</p></section>
      <div class="ag-summary" aria-label="전체 응시 현황">${[['전체 인원',summary.total,'명'],['제출',summary.submitted,'명'],['임시저장',summary.draft,'명'],['미제출',summary.notSubmitted,'명'],['평균 정답률',summary.averageAccuracy,summary.averageAccuracy==null?'':'%'],['최고 정답 수',summary.highestCorrect,summary.highestCorrect==null?'':` / ${r.questionCount}`]].map(([label,value,suffix])=>`<div><span>${label}</span><strong>${fmt(value)}${suffix}</strong></div>`).join('')}</div>
      <p class="ag-help">평균과 최고 정답 수는 제출자 기준입니다. ${r.state==='open'?'현재 제출자 기준 등수이며, 추가 제출에 따라 달라질 수 있습니다.':'동점자는 공동 등수로 표시됩니다.'}</p>
      <div class="ag-filters"><label>학생 검색<input type="search" data-ag-query placeholder="이름 또는 학생 ID" value="${esc(query)}"></label><label>제출 상태<select data-ag-state><option value="all">전체</option>${Object.entries(states).map(([id,label])=>`<option value="${id}" ${state===id?'selected':''}>${label}</option>`).join('')}</select></label>${button('CSV 다운로드','export')}</div>
      <p class="ag-help" data-ag-count role="status"></p><div class="ag-table" role="region" aria-label="학생별 성적" tabindex="0"><table><caption class="ag-sr-only">${esc(r.title)} 학생별 성적</caption><thead><tr><th scope="col">학생</th><th scope="col">학생 ID</th><th scope="col">제출 상태</th>${SECTIONS.map(label=>`<th scope="col">${label}</th>`).join('')}<th scope="col">정답 수</th><th scope="col">정답률</th><th scope="col">등수</th><th scope="col">제출 시각 (한국시간)</th></tr></thead><tbody data-ag-rows></tbody></table></div><p class="ag-help">과목별 정답 수는 각 과목의 전체 문항 수와 함께 표시됩니다. CSV에는 현재 검색·상태 조건에 해당하는 학생이 포함됩니다.</p>`;
    table();
  }
  async function load(reloadList=false){
    const ticket=++generation;report=null;host.querySelector('[data-ag-report]').replaceChildren();lock(true);message('성적을 불러오는 중…');
    try{
      if(reloadList){const value=await request('admin_list');if(dead||ticket!==generation)return;rounds=[...value.rounds].sort((a,b)=>b.roundNo-a.roundNo);}
      if(!current().some(r=>r.id===selectedId))selectedId=current()[0]?.id||'';
      controls();lock(true);
      if(selectedId){const value=await request('admin_report',{id:selectedId});if(dead||ticket!==generation)return;report=value;}
      if(dead||ticket!==generation)return;draw();message('');
    }catch(error){if(!dead&&ticket===generation){controls();host.querySelector('[data-ag-report]').replaceChildren();message(({unauthorized:'로그인 시간이 만료되었습니다. 다시 로그인해주세요.',forbidden:'성적을 조회할 권한이 없습니다.',not_found:'회차를 찾을 수 없습니다. 새로고침해주세요.'})[error.code]||'성적을 불러오지 못했습니다. 새로고침으로 다시 시도해주세요.',true);}}
    finally{if(!dead&&ticket===generation)lock(false);}
  }
  function download(){
    if(!report||!visible().length)return;
    const url=URL.createObjectURL(new Blob([aptitudeGradesCsv(report.round,visible())],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download=`적성모의고사_${kinds[report.round.kind]}_${report.round.roundNo}회_성적.csv`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  const click=event=>{const el=event.target.closest('[data-ag-action]');if(!el||dead||busy||el.disabled)return;
    if(el.dataset.agAction==='refresh')void load(true);
    if(el.dataset.agAction==='kind'&&Object.hasOwn(kinds,el.dataset.kind)){kind=el.dataset.kind;selectedId='';void load();}
    if(el.dataset.agAction==='export')download();
  };
  const change=event=>{if(dead||busy)return;const el=event.target;if(el.matches('[data-ag-round]')){selectedId=el.value;void load();}if(el.matches('[data-ag-state]')){state=el.value;table();}};
  const input=event=>{if(!dead&&!busy&&event.target.matches('[data-ag-query]')){query=event.target.value;table();}};
  host.addEventListener('click',click);host.addEventListener('change',change);host.addEventListener('input',input);
  await load(true);
  return {canLeave:()=>true,destroy(){dead=true;++generation;report=null;host.removeEventListener('click',click);host.removeEventListener('change',change);host.removeEventListener('input',input);host.classList.remove('ag-root');}};
}
