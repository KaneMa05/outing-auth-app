const kinds={self_intro:'자기소개 초안',motivation:'지원동기 초안',public_service:'공직관 초안',core30:'핵심 문항 초안'};
const statuses={QUEUED:'대기 중',PROCESSING:'생성 중',COMPLETED:'생성 완료',NEEDS_INPUT:'자료 보완 필요',FAILED:'생성 실패',BLOCKED:'처리 확인 필요',CANCELED:'중단됨',queued:'대기 중',processing:'생성 중',running:'생성 중',completed:'생성 완료',failed:'생성 실패',stale:'자료 변경됨',started:'시작됨',uploading:'업로드 중',upload_failed:'업로드 실패',evaluating:'분석 중',unknown:'처리 확인 필요',cancelled:'중단됨',expired:'만료됨',interrupted:'중간 종료',connecting:'연결 중',active:'진행 중',ready:'완료',needs_input:'자료 보완 필요'};
const labels={question:'질문',prompt:'질문',answer:'답변',text:'내용',title:'제목',content:'내용',status:'상태',state:'상태',reason:'사유',result:'결과',report:'결과',attempts:'실행 횟수',executions:'실행 기록',dispatch_state:'실행 상태',createdAt:'요청 시각',created_at:'요청 시각',updatedAt:'변경 시각',finished_at:'완료 시각',at:'처리 시각',event:'처리',missing:'보완할 내용',source_refs:'근거',quote:'원문 근거',answer_excerpt:'답변 구절',experience_coverage:'활용한 경험',situation:'상황',action:'행동',role:'역할',learning:'배운 점',fields:'작성 내용',summary:'요약',strengths:'강점',improvements:'보완할 점',feedback:'피드백',nextPractice:'다음 연습',transcript:'답변 전사',criteria:'평가 기준',label:'항목',evidence:'근거',checks:'확인 결과',notes:'안내',complete:'답변 완료 여부',batch:'질문 묶음',topic:'주제',kind:'유형',refs:'근거',usage:'사용량',input_tokens:'입력 토큰',output_tokens:'출력 토큰',total_tokens:'전체 토큰',definition:'문항 설명',score:'점수',grade:'등급'};
const hidden=new Set(['id','source_id','experience_id','request_key','schema_version','version','sourceHash','source_hash','answerHash','answer_hash','policyVersion','engineVersion']);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=v=>v?new Date(v).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}):'—';
function valueHTML(value,key=''){
 if(value===null||value===undefined)return '<span>기록 없음</span>';
 if(Array.isArray(value))return value.length?`<ol>${value.map(v=>`<li>${valueHTML(v)}</li>`).join('')}</ol>`:'<p>기록 없음</p>';
 if(typeof value==='object')return `<dl>${Object.entries(value).filter(([k])=>!hidden.has(k)).map(([k,v])=>`<dt>${esc(labels[k]||k)}</dt><dd>${valueHTML(v,k)}</dd>`).join('')}</dl>`;
 if(typeof value==='boolean')return value?'예':'아니요';
 return `<span class="ip-review-text">${esc(['status','state'].includes(key)?statuses[value]||value:/^(created_at|createdAt|updatedAt|finished_at|at)$/.test(key)?date(value):value)}</span>`;
}
export function mountAIUsage(host,{request,studentId}={}){
 let destroyed=false,version=0,detailVersion=0,page=0,cursors=[null],source='',data=null,loading=false;
 const payload=()=>({...studentId?{targetStudentId:studentId}:{},...source?{source}:{}});
 async function detail(index){
  const record=data?.records[index];if(!record)return;
  const current=++detailVersion,ticket=version,box=host.querySelector('[data-ai-detail]');
  box.innerHTML='<p role="status">생성 결과를 불러오는 중…</p>';
  try{
   const result=await request('admin_ai_usage',{...payload(),source:record.source,recordId:record.id});
   if(destroyed||ticket!==version||current!==detailVersion)return;
   const currentRecord=result.record||record;
   box.innerHTML=`<section class="ip-panel"><div class="ip-row"><h4 tabindex="-1">${esc(kinds[currentRecord.kind]||currentRecord.title)} · ${esc(date(currentRecord.createdAt))}</h4><button type="button" class="ip-btn" data-ai-close>결과 닫기</button></div><p>${[...new Set(currentRecord.statuses||[])].map(s=>esc(statuses[s]||'상태 확인 필요')).join(' · ')}</p>${currentRecord.error?`<p role="alert">처리 실패 · ${esc(currentRecord.error)}</p>`:''}${result.sections.map(s=>`<details open><summary>${esc(s.title)}</summary>${valueHTML(s.value)}</details>`).join('')||'<p>아직 저장된 생성 결과가 없습니다.</p>'}</section>`;
   box.querySelector('h4')?.focus({preventScroll:true});
   box.scrollIntoView({block:'start',behavior:'smooth'});
  }catch{if(!destroyed&&ticket===version&&current===detailVersion)box.innerHTML=`<p role="alert">생성 결과를 불러오지 못했습니다.</p><button type="button" class="ip-btn" data-ai-open="${index}">다시 시도</button>`;}
 }
 function render(){
  host.innerHTML=`<section class="ip-panel ip-ai-history" aria-label="AI 생성 기록"><div class="ip-row"><h4>AI 생성 기록</h4><button type="button" class="ip-btn" data-ai-usage-refresh>기록 새로고침</button></div><p class="ip-help">서버에 저장된 초안·후속 질문·진단·모의면접 기록을 최근 요청 순으로 표시합니다. 대기·실패 기록도 포함합니다. 결과 보기를 눌러 생성 내용과 보관된 요청 자료를 확인하세요. 초안 요청만으로 제출한 글에 AI를 사용했다고 판단할 수는 없습니다.</p><label>생성 종류 <select data-ai-source><option value="">전체 생성 기록</option>${data.sources.map(s=>`<option value="${esc(s.id)}" ${source===s.id?'selected':''}>${esc(s.title)}</option>`).join('')}</select></label>
   ${data.unavailable.length?`<p role="status">아직 기록 저장 기능이 준비되지 않은 항목: ${data.unavailable.map(id=>esc(data.sources.find(s=>s.id===id)?.title||id)).join(' · ')}. 준비된 항목의 기록은 아래에 표시됩니다.</p>`:''}
   <div class="ip-table-wrap"><table class="ip-review-table"><thead><tr><th scope="col">요청 시각</th>${studentId?'':'<th scope="col">학생·요청자</th>'}<th scope="col">생성 항목</th><th scope="col">상태</th><th scope="col">조회</th></tr></thead><tbody>${data.records.map((r,i)=>`<tr><td>${esc(date(r.createdAt))}</td>${studentId?'':`<td>${esc(r.studentName||r.createdBy||r.studentId||'—')}</td>`}<td>${esc(kinds[r.kind]||r.title)}${r.subject?`<small>${esc(({generate_questions:'심화 질문',summarize:'경험 요약'})[r.subject]||r.subject)}</small>`:''}</td><td>${[...new Set(r.statuses)].map(s=>esc(statuses[s]||'상태 확인 필요')).join(' · ')||'상태 확인 필요'}${r.error?'<small>실패 기록 있음</small>':''}</td><td><button type="button" class="ip-btn" data-ai-open="${i}">결과 보기</button></td></tr>`).join('')||`<tr><td colspan="${studentId?4:5}">저장된 생성 요청 기록이 없습니다.</td></tr>`}</tbody></table></div>
   <div class="ip-toolbar"><button type="button" class="ip-btn" data-ai-prev ${page?'':'disabled'}>이전</button><span>${page+1}페이지</span><button type="button" class="ip-btn" data-ai-next ${data.nextCursor?'':'disabled'}>다음</button></div><div data-ai-detail></div></section>`;
 }
 async function load(navigate=false){
  const current=++version;++detailVersion;loading=true;
  host.innerHTML='<p role="status">AI 생성 기록을 확인하는 중…</p>';
  try{
   const result=await request('admin_ai_usage',{...payload(),...cursors[page]?{cursor:cursors[page]}:{}});
   if(destroyed||current!==version)return;
   data=result;render();if(navigate)host.scrollIntoView?.({block:'start',behavior:'smooth'});
  }catch{if(!destroyed&&current===version)host.innerHTML='<p role="alert">AI 생성 기록을 불러오지 못했습니다.</p><button type="button" class="ip-btn" data-ai-usage-refresh>다시 시도</button>';}
  finally{if(current===version)loading=false;}
 }
 host.onclick=e=>{
  const n=e.target.closest('button');if(!n)return;e.stopPropagation();if(loading||destroyed)return;
  if(n.hasAttribute('data-ai-usage-refresh')){page=0;cursors=[null];load(true);}
  else if(n.hasAttribute('data-ai-next')&&data.nextCursor){cursors[++page]=data.nextCursor;load(true);}
  else if(n.hasAttribute('data-ai-prev')&&page){--page;load(true);}
  else if(n.hasAttribute('data-ai-open'))detail(Number(n.dataset.aiOpen));
  else if(n.hasAttribute('data-ai-close')){++detailVersion;host.querySelector('[data-ai-detail]').replaceChildren();}
 };
 host.onchange=e=>{if(e.target.matches('[data-ai-source]')){e.stopPropagation();source=e.target.value;page=0;cursors=[null];load(true);}};
 const ready=load();return {ready,canLeave:()=>true,destroy(){destroyed=true;++version;++detailVersion;host.onclick=null;host.onchange=null;}};
}
