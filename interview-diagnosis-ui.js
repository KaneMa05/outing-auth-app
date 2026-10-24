import {diagnoseExperiences,diagnosisStages,renderDiagnosisChart} from './interview-diagnosis.js?v=20261021-life-diagnosis';
import {experienceText} from './interview-life-graph.js?v=20261021-life-save-fix';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const blank=()=>({background:'',qualifications:[],affiliations:[],awards:[],experiences:[],none:[]});
const errors={revision_conflict:'다른 화면에서 인생그래프가 변경되었습니다. 입력을 복사해 보관한 뒤 최신 내용을 불러와주세요.',unauthorized:'로그인이 만료되었습니다. 입력을 보관한 뒤 다시 로그인해주세요.',not_enrolled:'면접반 이용 등록과 기간을 확인해주세요.'};
const diagnosisStatus=level=>level===4?'ready':level===0?'missing':'needs-work';
const diagnosisStatusLabel=level=>level===4?'근거 확인':level===0?'경험 추가 필요':'보완 필요';

export function mountDiagnosis(host,{request,initialTopic='',onLife=()=>{}}){
 let life,items=[],selected=initialTopic,editing=null,dirty=false,destroyed=false,busy=false,blocked=false;
 let savedAnswers={},answerDraft=[],answerDirty=false,answerBlocked=false,answerLoadFailed=false;
 host.className='ip-diagnosis';
 const rows=()=>life?.profile?.content?.experiences||[];
 const writtenRows=()=>rows().filter(row=>experienceText(row).content?.trim());
 function introduction(){
  items=[];
  const count=writtenRows().length;
  host.innerHTML=`<section class="ip-panel"><h3>인생그래프 진단하기</h3><p>${count?`내용을 작성한 경험 ${count}개가 저장되어 있습니다.`:'인생그래프에 경험을 먼저 작성해주세요.'}</p><p class="ip-help">${count?'아래 버튼을 누르면 저장한 경험에서 13가지 인성 소재의 근거를 확인합니다.':'경험의 내용과 어필할 점을 작성하고 저장한 뒤 진단할 수 있습니다. 아직 작성하지 않은 내용은 보완 대상으로 표시하지 않습니다.'}</p><div class="ip-life-toolbar"><button type="button" class="ip-btn ip-primary" data-diagnosis-start ${count?'':'disabled'}>인생그래프 진단하기</button><button type="button" class="ip-btn" data-diagnosis-life>${count?'인생그래프 확인·수정':'인생그래프 작성하기'}</button></div></section>`;
 }
 const tell=(text,error=false)=>{const node=host.querySelector('[data-diagnosis-message]');if(node){node.textContent=text;node.dataset.error=String(error);}};
 const canLeave=()=>!busy&&(!(dirty||answerDirty)||confirm('저장하지 않은 답변 또는 경험 수정이 있습니다. 버리고 이동할까요?'));
 const beforeUnload=e=>{if(dirty||answerDirty||busy){e.preventDefault();e.returnValue='';}};
 window.addEventListener('beforeunload',beforeUnload);
 function refresh(){
  items=diagnoseExperiences(rows(),life.competencies||[]);
  const ready=items.filter(item=>item.level===4).length;
  host.querySelector('[data-diagnosis-summary]').innerHTML=`<section class="ip-panel"><div class="ip-row"><div><span class="ip-diagnosis-kicker">인생그래프 경험만으로 진단</span><h3>나의 13가지 인성 소재 진단</h3></div><span class="ip-badge">경험 근거 확인 ${ready} / 13</span></div><p class="ip-help">인생그래프에 저장한 경험의 내용과 어필할 점에서 13개 항목의 근거를 찾습니다. 부족한 항목의 질문을 참고해 해당 경험을 보완해주세요.</p><div class="ip-diagnosis-chart-scroll">${renderDiagnosisChart(items)}</div><p class="ip-diagnosis-legend"><span></span>경험 근거 확인 · 중심 0 → 바깥 4</p><details class="ip-diagnosis-method"><summary>진단 기준 알아보기</summary><p>관련 경험 내용, 본인의 행동 표현, 결과·변화 표현, 어필할 점(10자 이상)을 각각 1단계로 확인합니다. 같은 항목에 경험이 여러 개면 가장 많은 근거가 확인된 경험을 표시합니다.</p><p>인생그래프의 키워드·기존 연결 항목과 문장 표현을 확인하는 기본 진단입니다. 표현에 따라 근거를 놓칠 수 있으므로 연결된 원문도 확인해주세요. 인성 능력이나 면접 평가 점수는 아닙니다.</p><p>별도 인성 항목의 답변, 기본 이력, 나이와 만족도는 진단에 반영하지 않습니다.</p></details>${!rows().length?'<p class="ip-help">아직 인생그래프에 경험이 없어 모든 항목이 0으로 표시됩니다. 아래 질문으로 실제 경험을 떠올려 인생그래프에 추가해주세요.</p>':''}<button type="button" class="ip-btn" data-diagnosis-life>인생그래프 전체 보기</button></section>`;
  host.querySelector('[data-diagnosis-items]').innerHTML=`<div class="ip-row"><h3>항목별 진단과 보완 질문</h3><span class="ip-help">항목을 눌러 경험 보완하기</span></div><div class="ip-diagnosis-items">${[...items].sort((a,b)=>a.level-b.level).map(item=>`<button type="button" class="ip-diagnosis-item" data-diagnosis-status="${diagnosisStatus(item.level)}" data-diagnosis-topic="${item.id}" aria-pressed="${selected===item.id}"><span class="ip-diagnosis-status">${diagnosisStatusLabel(item.level)}</span><span>${esc(item.title)}</span><strong>${item.level}/4 · ${diagnosisStages[item.level]}</strong><small>인생그래프 관련 경험 ${item.evidence.length}개</small></button>`).join('')}</div>`;
 }
 function evidence(){
  const item=items.find(item=>item.id===selected);if(!item)return;
  host.querySelector('[data-diagnosis-evidence]').innerHTML=`<section class="ip-panel"><span class="ip-diagnosis-kicker">선택한 항목</span><h3>${esc(item.title)}</h3><p>${item.level}/4 · ${diagnosisStages[item.level]}</p><h4>인생그래프에서 찾은 근거</h4>${item.evidence.length?item.evidence.map(row=>`<article><details><summary>${esc(row.title||'제목 미작성')} · ${row.level}/4</summary><p class="ip-help">연결 근거: ${esc(row.tagged?'이 항목에 연결한 경험':row.matches.join(', '))}</p><p class="ip-life-text">${esc(row.content)}</p><p class="ip-life-text"><strong>어필할 점</strong><br>${esc(row.appeal||'미작성')}</p></details><p class="ip-help">${row.checks.map(check=>`${check.found?'확인':'보완'}: ${check.label}`).join(' · ')}</p><button type="button" class="ip-btn" data-diagnosis-edit="${esc(row.id)}">이 경험 보완하기</button></article>`).join(''):'<p class="ip-help">인생그래프에서 관련 경험을 아직 찾지 못했습니다. 표현에 따라 연결되지 않을 수 있으므로 기존 경험을 선택해 보완하거나 새 경험을 추가해주세요.</p>'}<h4>경험을 채우는 질문</h4><ul class="ip-diagnosis-questions">${item.questions.map(question=>`<li>${esc(question)}</li>`).join('')}</ul><p class="ip-help">질문을 참고해 아래 인생그래프의 ‘내용’과 ‘어필할 점’을 작성해주세요. 실제로 겪은 일만 기록해주세요.</p><div class="ip-life-toolbar"><label>보완할 기존 경험<select data-diagnosis-existing><option value="">경험 선택</option>${rows().map(row=>`<option value="${esc(row.id)}">${esc(row.title||'제목 미작성')}</option>`).join('')}</select></label><button type="button" class="ip-btn" data-diagnosis-add>새 경험을 인생그래프에 추가</button></div></section>`;
  const questions=savedAnswers[selected]?.prompts||item.questions;
  const list=host.querySelector('.ip-diagnosis-questions');
  if(answerLoadFailed){
   list.nextElementSibling.textContent='인생그래프 진단과 경험 보완은 계속 이용할 수 있습니다.';
   list.outerHTML='<div class="ip-diagnosis-answer-list"><p class="ip-message" data-diagnosis-answer-message role="status" data-error="true">저장한 답변을 불러오지 못했습니다. 답변을 다시 불러온 후 작성해주세요.</p><button type="button" class="ip-btn" data-diagnosis-answers-reload>답변 다시 불러오기</button></div>';
   return;
  }
  list.outerHTML=`<div class="ip-diagnosis-answer-list">${questions.map((question,i)=>`<div class="ip-diagnosis-answer"><label for="diagnosis-answer-${i}">${i+1}. ${esc(question)}</label><textarea id="diagnosis-answer-${i}" data-diagnosis-answer="${i}" rows="2" maxlength="2000" placeholder="이 질문에 대한 답변을 작성해주세요.">${esc(answerDraft[i]||'')}</textarea><div class="ip-life-toolbar"><button type="button" class="ip-btn" data-diagnosis-answer-save="${i}">답변 저장</button><span class="ip-help" data-diagnosis-answer-state="${i}">${answerState(i)}</span></div></div>`).join('')}<div class="ip-life-toolbar"><button type="button" class="ip-btn ip-primary" data-diagnosis-answers-save>답변 모두 저장</button><button type="button" class="ip-btn" data-diagnosis-answers-reload>저장한 답변 불러오기</button></div><p class="ip-message" data-diagnosis-answer-message role="status"></p></div>`;
  host.querySelector('.ip-diagnosis-answer-list').nextElementSibling.textContent='답변은 이 항목에 저장됩니다. 인생그래프에도 반영하려면 아래에서 경험을 보완해주세요.';
 }
 function answerState(i){const saved=savedAnswers[selected]?.answers[i]||'';return answerDraft[i]!==saved?'저장하지 않은 답변':saved?'저장됨':'미작성';}
 function answerMessage(text,error=false){const el=host.querySelector('[data-diagnosis-answer-message]');if(el){el.textContent=text;el.dataset.error=String(error);}}
 function resetAnswers(){answerDraft=[...(savedAnswers[selected]?.answers||Array(5).fill(''))];answerDirty=false;}
 async function saveAnswers(index=null){
  if(busy||destroyed||answerLoadFailed)return false;
  if(answerBlocked){answerMessage('입력한 답변을 보관한 뒤 저장한 답변을 불러와 변경 사항을 확인해주세요.',true);return false;}
  if(answerDraft.some(value=>[...value].length>2000)){answerMessage('답변은 질문당 2,000자 이하로 작성해주세요.',true);return false;}
  busy=true;const controls=[...host.querySelectorAll('button,input,textarea,select')].map(n=>[n,n.disabled]);controls.forEach(([n])=>n.disabled=true);
  try{
   const saved=savedAnswers[selected],answers=index===null?[...answerDraft]:[...(saved?.answers||Array(5).fill(''))];
   if(index!==null)answers[index]=answerDraft[index];
   const result=await request('diagnosis_save',{topicId:selected,revision:saved?.revision||0,prompts:saved?.prompts||items.find(item=>item.id===selected).questions,answers});
   if(destroyed)return false;
   savedAnswers[selected]=result.answer;refresh();answerDirty=answerDraft.some((value,i)=>value!==result.answer.answers[i]);
   host.querySelectorAll('[data-diagnosis-answer-state]').forEach(el=>el.textContent=answerState(Number(el.dataset.diagnosisAnswerState)));
   answerMessage(index===null?'답변을 모두 저장했습니다.':`${index+1}번 답변을 저장했습니다.`);return true;
  }catch(error){if(!destroyed){answerBlocked=['revision_conflict','unauthorized','not_enrolled','topic_changed'].includes(error.code||error.message);answerMessage((error.code||error.message)==='revision_conflict'?'다른 화면에서 답변이 수정되었습니다. 입력을 보관한 뒤 저장한 답변을 불러와주세요.':'답변을 저장하지 못했습니다. 입력 내용은 유지됩니다. 다시 시도해주세요.',true);}return false;}
  finally{busy=false;controls.forEach(([n,disabled])=>n.disabled=disabled);}
 }
 function editor(){
  const box=host.querySelector('[data-diagnosis-editor]');
  if(!editing){box.innerHTML='';return;}
  const isNew=!rows().some(row=>row.id===editing.id);
  box.innerHTML=`<section class="ip-panel"><h3>${isNew?'새 인생그래프 경험':'인생그래프 경험 보완'}</h3><p class="ip-help">저장하면 인생그래프의 이 경험이 수정되고 13각형 진단표가 다시 계산됩니다.</p>${[['age','당시 나이 (세)',120],['satisfaction','만족도 (−25~+25점)',25],['title','키워드',2000],['content','내용',12000],['appeal','면접관에게 어필할 점',2000]].map(([key,label,max])=>`<label>${label}${['content','appeal'].includes(key)?`<textarea data-diagnosis-field="${key}" maxlength="${max}">${esc(editing[key])}</textarea>`:`<input data-diagnosis-field="${key}" ${['age','satisfaction'].includes(key)?`type="number" min="${key==='age'?0:-25}" max="${max}" step="1"`:`maxlength="${max}"`} value="${esc(editing[key])}">`}</label>`).join('')}<p class="ip-message" data-diagnosis-message role="status"></p><div class="ip-life-toolbar"><button type="button" class="ip-btn ip-primary" data-diagnosis-save>인생그래프에 저장하고 다시 진단</button><button type="button" class="ip-btn" data-diagnosis-retry>최신 내용 불러오기</button><button type="button" class="ip-btn" data-diagnosis-cancel>닫기</button></div></section>`;
 }
 function select(id,scroll=false){
  if(!items.some(item=>item.id===id)||!canLeave())return;
  selected=id;editing=null;dirty=false;answerBlocked=false;resetAnswers();refresh();evidence();editor();
  if(scroll)host.querySelector('[data-diagnosis-evidence]').scrollIntoView({block:'start',behavior:'smooth'});
 }
 function edit(id){
  if(!canLeave())return;
  if(answerDirty){resetAnswers();evidence();}
  const row=rows().find(row=>row.id===id);
  if(!row&&(rows().length>=40||['qualifications','affiliations','awards','experiences'].reduce((n,key)=>n+(life.profile?.content?.[key]?.length||0),0)>=80)){host.querySelector('[data-diagnosis-editor]').innerHTML='<p role="alert">경험은 40개, 전체 이력은 80개까지 추가할 수 있습니다.</p>';return;}
  editing=row?structuredClone(experienceText(row)):{id:crypto.randomUUID(),age:'',satisfaction:'',title:'',content:'',appeal:'',competencyIds:[]};
  dirty=false;editor();host.querySelector('[data-diagnosis-editor]').scrollIntoView({block:'start',behavior:'smooth'});host.querySelector('[data-diagnosis-field=content]')?.focus({preventScroll:true});
 }
 async function save(){
  if(busy||destroyed||!editing)return false;
  if(blocked){tell('입력을 보관한 뒤 최신 내용을 불러와 변경 사항을 확인해주세요.',true);return false;}
  if(!/^\d{1,3}$/.test(String(editing.age))||Number(editing.age)>120){tell('당시 나이를 0~120세의 정수로 입력해주세요.',true);return false;}
  if(!String(editing.title||'').trim()||!String(editing.content||'').trim()){tell('경험의 키워드와 내용을 입력해주세요.',true);return false;}
  if(editing.satisfaction!==''&&editing.satisfaction!==undefined&&(!/^-?\d+$/.test(String(editing.satisfaction))||Math.abs(Number(editing.satisfaction))>25)){tell('만족도는 −25~+25 사이의 정수로 입력해주세요.',true);return false;}
  if(['title','content','appeal'].some(key=>[...String(editing[key]||'')].length>(key==='content'?12000:2000))){tell('입력 가능한 글자 수를 초과했습니다.',true);return false;}
  busy=true;const controls=[...host.querySelectorAll('button,input,textarea,select')].map(node=>[node,node.disabled]);controls.forEach(([node])=>node.disabled=true);
  try{
   const content=structuredClone(life.profile?.content||blank()),index=content.experiences.findIndex(row=>row.id===editing.id);
   if(index<0)content.experiences.push(structuredClone(editing));else content.experiences[index]=structuredClone(editing);
   const result=await request('life_save',{revision:life.profile?.revision||0,status:'draft',content});
   if(destroyed)return false;
   life.profile=result.profile;editing=structuredClone(experienceText(rows().find(row=>row.id===editing.id)));dirty=false;refresh();evidence();editor();tell('인생그래프에 저장하고 진단표를 갱신했습니다.');return true;
  }catch(error){if(!destroyed){blocked=['revision_conflict','unauthorized','not_enrolled'].includes(error.code||error.message);tell(errors[error.code||error.message]||'저장하지 못했습니다. 입력 내용은 유지됩니다. 다시 시도해주세요.',true);}return false;}
  finally{busy=false;controls.forEach(([node,disabled])=>node.disabled=disabled);}
 }
 async function load(run=false){
  busy=true;host.innerHTML=`<p role="status">${run?'저장한 인생그래프를 진단하는 중…':'저장한 인생그래프를 확인하는 중…'}</p>`;
  try{
   const result=await Promise.allSettled([request('life_get'),run?request('diagnosis_get'):Promise.resolve({answers:[]})]);if(destroyed)return;
   if(result[0].status==='rejected')throw result[0].reason;
   if(result[1].status==='rejected'&&['unauthorized','not_enrolled'].includes(result[1].reason?.code||result[1].reason?.message))throw result[1].reason;
   life=result[0].value;answerLoadFailed=result[1].status==='rejected'||!Array.isArray(result[1].value?.answers);
   savedAnswers=answerLoadFailed?{}:Object.fromEntries(result[1].value.answers.map(row=>[row.topic_id,row]));answerDirty=false;answerBlocked=false;
   editing=null;dirty=false;blocked=false;
   if(!run||!writtenRows().length){introduction();return;}
   host.innerHTML='<div data-diagnosis-summary></div><section class="ip-panel" data-diagnosis-items></section><div data-diagnosis-evidence></div><div data-diagnosis-editor></div>';
   refresh();busy=false;select(items.some(item=>item.id===selected)?selected:[...items].sort((a,b)=>a.level-b.level)[0].id);
  }catch(error){if(!destroyed)host.innerHTML=`<section class="ip-panel"><p role="alert">${esc(errors[error.code||error.message]||'진단 자료를 불러오지 못했습니다. 다시 시도해주세요.')}</p><button type="button" class="ip-btn" data-diagnosis-retry>다시 시도</button></section>`;}
  finally{busy=false;}
 }
 host.oninput=e=>{if(busy||destroyed)return;if(e.target.hasAttribute('data-diagnosis-answer')){const i=Number(e.target.dataset.diagnosisAnswer);answerDraft[i]=e.target.value;answerDirty=answerDraft.some((value,j)=>value!==(savedAnswers[selected]?.answers[j]||''));host.querySelector(`[data-diagnosis-answer-state="${i}"]`).textContent=answerState(i);answerMessage('작성한 뒤 답변 저장을 눌러주세요.');return;}if(!editing||!e.target.dataset.diagnosisField)return;editing[e.target.dataset.diagnosisField]=e.target.value;dirty=true;tell('인생그래프에 저장하면 진단표에 반영됩니다.');};
 host.onchange=e=>{if(e.target.matches('[data-diagnosis-existing]')&&e.target.value){edit(e.target.value);e.target.value='';}};
 host.onclick=async e=>{
  const target=e.target.closest('button');if(!target||target.disabled||destroyed||busy)return;
  if(target.hasAttribute('data-diagnosis-life'))onLife();
  else if(target.hasAttribute('data-diagnosis-start')){if(canLeave())await load(true);}
  else if(target.hasAttribute('data-diagnosis-answer-save'))await saveAnswers(Number(target.dataset.diagnosisAnswerSave));
  else if(target.hasAttribute('data-diagnosis-answers-save'))await saveAnswers();
  else if(target.hasAttribute('data-diagnosis-answers-reload')){
   if(answerDirty&&!confirm('저장하지 않은 답변을 버리고 저장된 답변을 불러올까요?'))return;
   busy=true;const controls=[...host.querySelectorAll('button,input,textarea,select')].map(n=>[n,n.disabled]);controls.forEach(([n])=>n.disabled=true);
   try{const result=await request('diagnosis_get');if(destroyed)return;savedAnswers=Object.fromEntries(result.answers.map(row=>[row.topic_id,row]));answerLoadFailed=false;answerBlocked=false;resetAnswers();evidence();answerMessage('저장한 답변을 불러왔습니다.');}catch{if(!destroyed)answerMessage('답변을 불러오지 못했습니다. 입력 내용은 유지됩니다.',true);}finally{busy=false;controls.forEach(([n,disabled])=>n.disabled=disabled);}
  }
  else if(target.hasAttribute('data-diagnosis-retry')){if(canLeave())load();}
  else if(target.hasAttribute('data-diagnosis-topic'))select(target.dataset.diagnosisTopic,true);
  else if(target.hasAttribute('data-diagnosis-edit'))edit(target.dataset.diagnosisEdit);
  else if(target.hasAttribute('data-diagnosis-add'))edit();
  else if(target.hasAttribute('data-diagnosis-save'))save();
  else if(target.hasAttribute('data-diagnosis-cancel')&&canLeave()){editing=null;dirty=false;editor();}
 };
 const ready=load();
 return {ready,canLeave,async savePending(){if(busy||blocked||answerBlocked||answerDirty&&!(await saveAnswers())||dirty&&!(await save()))throw Error('save_failed');},destroy(){destroyed=true;host.onclick=null;host.oninput=null;host.onchange=null;window.removeEventListener('beforeunload',beforeUnload);}};
}
