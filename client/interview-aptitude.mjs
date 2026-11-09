const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const SECTIONS=['언어이해','언어비판','수열추리','도형추리','문제해결'];
const labels={half:'하프',full:'본시험'},states={draft:'작성 중',open:'응시 가능',closed:'응시 종료'};
const errors={unauthorized:'로그인 시간이 만료되었습니다. 다시 로그인해주세요.',not_enrolled:'현재 면접반 이용 등록과 수강 기간을 확인해주세요.',forbidden:'이 자료를 볼 권한이 없습니다.',revision_conflict:'다른 기기 또는 관리자가 먼저 저장했습니다. 입력을 보관하고 최신 내용을 확인해주세요.',already_submitted:'이미 제출한 회차입니다. 제출 결과를 다시 확인해주세요.',exam_not_open:'현재 응시 기간이 아닙니다.',empty_answers:'답안을 한 문항 이상 입력해주세요.',answer_key_incomplete:'모든 문항의 정답을 입력한 뒤 응시를 개방해주세요.',correction_reason_required:'제출자가 있는 시험의 정답을 변경하려면 정정 사유를 5자 이상 입력해주세요.',exam_structure_locked:'개방된 시험의 유형을 변경하거나 작성 중으로 되돌릴 수 없습니다.',results_already_released:'결과를 공개한 회차는 다시 개방할 수 없습니다.',round_exists:'같은 유형·회차가 이미 있습니다.',invalid_answers:'답안 문항 수와 선지를 확인해주세요.',invalid_file:'20MB 이하의 PDF 파일을 선택해주세요.',file_limit:'해설지는 회차당 최대 5개입니다. 불필요한 파일을 삭제해주세요.',invalid_request:'입력한 값을 확인해주세요.',aptitude_unavailable:'일시적으로 연결하지 못했습니다. 입력을 보관하고 다시 확인해주세요.',file_unavailable:'해설지를 불러오지 못했습니다. 잠시 후 다시 열어주세요.'};
export function parseAnswerKey(text,count){const value=String(text).replace(/[①②③④⑤]/g,c=>String('①②③④⑤'.indexOf(c)+1)).trim();if(!/^[1-5\s,;]+$/.test(value))throw Error('정답 1~5만 공백 또는 쉼표로 구분해 입력해주세요.');const values=value.split(/[\s,;]+/).map(Number);if(values.length!==count)throw Error(`정답 ${count}개가 필요합니다. 현재 ${values.length}개입니다.`);return values;}
export function newRound(kind='half',roundNo=1){const n=kind==='full'?150:75;return {round:{id:crypto.randomUUID(),kind,roundNo,title:`${labels[kind]} ${roundNo}회`,revision:0,state:'draft',resultsReleased:false,opensAt:null,closesAt:null,questionCount:n,perSection:n/5,sections:SECTIONS},answerKey:Array(n).fill(null),files:[],submittedCount:0};}
export function createAptitudeRequest({fetchImpl=fetch,credentials=()=>({})}={}){return async(action,body={})=>{
 const response=await fetchImpl('/api/interview-aptitude',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,...credentials(),action})});
 const data=await response.json();if(!response.ok||data.ok!==true)throw Object.assign(Error(data.error||'aptitude_unavailable'),{code:data.error||'aptitude_unavailable'});return data;
};}
const fmt=v=>v===null||v===undefined?'—':Number(v).toLocaleString('ko-KR',{maximumFractionDigits:4});
const date=v=>v?new Date(v).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'제한 없음';
const localDate=v=>v?new Date(Date.parse(v)+9*3600000).toISOString().slice(0,16):'';
const button=(label,action,extra='',primary=false)=>`<button type="button" class="ip-btn ${primary?'ip-primary':''}" data-ia-action="${action}" ${extra}>${label}</button>`;
export async function mountAptitude(host,{admin=false,canWrite=false,request=createAptitudeRequest()}={}){
 if(!document.querySelector('link[data-aptitude-style]')){const link=document.createElement('link');link.rel='stylesheet';link.href='/interview-aptitude.css?v=20261109-aptitude-count';link.dataset.aptitudeStyle='';document.head.append(link);}
 host.classList.add('ia-root');let dead=false,busy=false,dirty=false,generation=0,kind='half',adminDraft=null,data=null,rounds=[],section=null,page=0,answers=[],owner='',revision=0,pendingKey=null,uncertain=false,backupConflict=false;
 const originalRequest=request;
 request=async(action,payload={})=>{const value=await originalRequest(action,{...payload,...(!admin&&owner?{accountId:owner}:{})});if(!admin&&owner&&value.studentId&&value.studentId!==owner)throw Object.assign(Error('forbidden'),{code:'forbidden'});return value;};
 const key=()=>`interview-aptitude:${encodeURIComponent(owner)}:${data?.round.id}`;
 function backup(){if(admin||!owner||!data||data.attempt?.state==='submitted'||!dirty&&!uncertain)return true;try{localStorage.setItem(key(),JSON.stringify({answers,revision,pendingKey,uncertain}));return true;}catch{return false;}}
 function clearBackup(){try{localStorage.removeItem(key());}catch{}}
 function message(text,bad=false){const node=host.querySelector('[data-ia-message]');if(node){node.textContent=text;node.setAttribute('role',bad?'alert':'status');}}
 function fail(error){message(errors[error.code]||error.message||'처리하지 못했습니다. 입력을 보관하고 다시 확인해주세요.',true);}
 function setBusy(value){busy=value;host.querySelectorAll('button,input,select,textarea').forEach(el=>{if(!el.hasAttribute('data-ia-readonly'))el.disabled=value;});if(!value)drawLocks();}
 function drawLocks(){
  if(admin&&!canWrite)host.querySelectorAll('[data-ia-write],input,textarea,select').forEach(el=>{el.disabled=true;el.dataset.iaReadonly='';});
  if(!admin&&data&&(uncertain||data.attempt?.state==='submitted'||data.round.state!=='open'||data.round.accepting===false))host.querySelectorAll('[data-answer],[data-clear],[data-ia-action="save"],[data-ia-action="submit"]').forEach(el=>el.disabled=true);
 }
 function canLeave(){if(busy)return false;return !dirty||confirm('서버에 저장하지 않은 입력이 있습니다. 이 화면을 나갈까요?');}
 function shell(title){host.innerHTML=`${admin?`<div class="ia-heading"><h2>${esc(title)}</h2>${data?button('목록','list'):''}</div>`:''}<p data-ia-message role="status" class="ia-message"></p><div data-ia-body></div>`;}
 function typeBar(){return `<div class="ia-toolbar"><nav class="ia-types" aria-label="시험 유형">${Object.entries(labels).map(([id,label])=>button(label,'kind',`data-kind="${id}" aria-pressed="${kind===id}"`,kind===id)).join('')}</nav>${!admin?`<select data-round-select aria-label="회차 선택">${rounds.filter(r=>r.kind===kind).map(r=>`<option value="${r.id}" ${data?.round.id===r.id?'selected':''}>${r.roundNo}회</option>`).join('')||'<option value="">등록된 회차 없음</option>'}</select>`:canWrite?button('회차 추가','new','',true):''}</div>`;}
 function listView(){data=null;dirty=false;shell('적성 모의고사 관리');
  const filtered=rounds.filter(r=>r.kind===kind);
  host.querySelector('[data-ia-body]').innerHTML=typeBar()+(!filtered.length?'<div class="ia-empty">등록된 회차가 없습니다.</div>':admin?`<div class="ia-panel ia-table"><table><thead><tr><th>회차</th><th>응시 상태</th><th>응시 시작</th><th>마감</th><th>결과</th><th>관리</th></tr></thead><tbody>${filtered.map(r=>`<tr><td>${esc(r.title)}</td><td>${states[r.state]}</td><td>${r.opensAt?date(r.opensAt):'—'}</td><td>${r.closesAt?date(r.closesAt):'—'}</td><td>${r.resultsReleased?'공개':'대기'}</td><td>${button('관리','open',`data-id="${r.id}"`)}</td></tr>`).join('')}</tbody></table></div>`:'');
 }
 async function loadList(){const ticket=++generation;setBusy(true);try{const result=await request(admin?'admin_list':'list');if(dead||ticket!==generation)return;rounds=result.rounds;if(result.studentId)owner=result.studentId;
  const first=rounds.find(r=>r.kind===kind);if(!admin&&first)await loadDetail(first.id);else listView();
 }catch(e){if(!dead){shell('적성 모의고사');fail(e);}}finally{if(!dead&&ticket===generation)setBusy(false);}}
 async function loadDetail(id){const ticket=++generation;let resolvedUncertain=false;setBusy(true);try{const value=await request(admin?'admin_get':'get',{id});if(dead||ticket!==generation)return;data=value;adminDraft=null;kind=value.round.kind;section=null;page=0;dirty=false;backupConflict=false;uncertain=false;
   if(!admin){owner=value.studentId;revision=value.attempt?.revision||0;answers=value.attempt?.answers||Array(value.round.questionCount).fill(0);pendingKey=value.attempt?.requestKey||null;
    if(value.attempt?.state==='submitted')clearBackup();else try{const saved=JSON.parse(localStorage.getItem(key())||'null');if(saved&&Array.isArray(saved.answers)&&saved.answers.length===answers.length&&saved.answers.every(v=>Number.isInteger(v)&&v>=0&&v<=5)){
     if(saved.revision===revision){answers=saved.answers;dirty=true;pendingKey=saved.pendingKey;resolvedUncertain=!!saved.uncertain;uncertain=false;}else backupConflict=true;
    }}catch{}
   }drawDetail();if(resolvedUncertain){backup();message('서버에서 아직 미제출 상태임을 확인했습니다. 답안을 확인한 뒤 다시 제출할 수 있습니다.');}
  }catch(e){if(!dead)fail(e);}finally{if(!dead&&ticket===generation)setBusy(false);}}
 function fileList(files=[]){if(!admin&&!files.length)return '';return `<section class="ia-panel ia-files"><h3>해설지</h3>${files.map(f=>`<div class="ia-file"><span>${esc(f.name)} ${f.state==='pending'?'<small>전송 확인 필요</small>':''}</span>${f.state!=='pending'?button('열기','file',`data-file-id="${f.id}"`):''}${admin&&canWrite?button('삭제','delete-file',`data-file-id="${f.id}" data-ia-write`):''}</div>`).join('')||'<div class="ia-empty">등록된 파일이 없습니다.</div>'}${admin&&canWrite?'<label class="ia-upload">PDF 업로드 · 최대 20MB<input type="file" accept="application/pdf,.pdf" data-upload data-ia-write></label>':''}</section>`;}
 function subjectList(){const r=data.round,submitted=data.attempt?.state==='submitted';
  if(admin)return `<div class="ia-panel ia-table"><table><thead><tr><th>과목</th><th>문항</th><th>정답 입력</th><th>관리</th></tr></thead><tbody>${SECTIONS.map((label,i)=>`<tr><td>${label}</td><td>${r.perSection}</td><td>${data.answerKey.slice(i*r.perSection,(i+1)*r.perSection).filter(Boolean).length}/${r.perSection}</td><td>${button('정답 입력','section',`data-section="${i}"`)}</td></tr>`).join('')}</tbody></table></div>`;
  return `<div class="ia-subjects">${SECTIONS.map((label,i)=>{const count=answers.slice(i*r.perSection,(i+1)*r.perSection).filter(Boolean).length;return `<article class="ia-subject"><div><strong>${label}</strong><span>${submitted?'제출 완료':`${count}/${r.perSection} 입력`}</span></div>${button(submitted||!r.accepting?'보기':'답안 입력','section',`data-section="${i}"`)}</article>`;}).join('')}</div>`;
 }
 function scoreView(){const v=data.result;return v?`<section class="ia-score" aria-label="성적"><div><span>정답 수</span><strong>${fmt(v.correctCount)} / ${fmt(v.totalQuestions)}</strong></div><div><span>정답률</span><strong>${fmt(v.accuracy)}%</strong></div><div><span>등수</span><strong>${v.rank} / ${v.participants}명</strong></div></section>`:'';}
 function drawDetail(){const r=data.round,settings=adminDraft||r,submitted=data.attempt?.state==='submitted';shell(r.title);const body=host.querySelector('[data-ia-body]');
  if(admin){body.innerHTML=`<form data-admin-form><details class="ia-panel ia-settings" ${!r.revision?'open':''}><summary>회차 설정</summary><div class="ia-form"><label>회차<input name="roundNo" type="number" min="1" max="9999" value="${settings.roundNo}" data-ia-write></label><label>제목<input name="title" maxlength="120" value="${esc(settings.title)}" data-ia-write></label><label>응시 상태<select name="state" data-ia-write>${Object.entries(states).map(([id,label])=>`<option value="${id}" ${settings.state===id?'selected':''}>${label}</option>`).join('')}</select></label><label>결과 공개<select name="resultsReleased" data-ia-write><option value="false" ${!settings.resultsReleased?'selected':''}>대기</option><option value="true" ${settings.resultsReleased?'selected':''}>공개</option></select></label><label>응시 시작<input name="opensAt" type="datetime-local" value="${localDate(settings.opensAt)}" data-ia-write></label><label>응시 마감<input name="closesAt" type="datetime-local" value="${localDate(settings.closesAt)}" data-ia-write></label></div></details>
   ${section===null?subjectList():`<section class="ia-panel"><div class="ia-subject-heading"><h3>${SECTIONS[section]}</h3>${button('과목 목록','subjects')}</div><div data-question-grid></div><details class="ia-bulk"><summary>정답 일괄 입력</summary><label>전체 정답 ${r.questionCount}개<textarea data-key-paste rows="3" data-ia-write></textarea></label>${button('반영','paste','data-ia-write')}</details>${data.submittedCount?'<label>정정 사유<textarea name="reason" rows="2" maxlength="1000" data-ia-write></textarea></label>':''}</section>`}
   <div class="ia-actions">${button('저장','admin-save','data-ia-write',true)}${r.revision?button('응시·성적 현황','report'):''}${r.revision&&r.state==='draft'?button('회차 삭제','delete-round','data-ia-write'):''}</div></form>${r.revision&&section===null?fileList(data.files):''}`;
  }else{body.innerHTML=`${typeBar()}${section===null?`${scoreView()}<div class="ia-round-status"><span>${submitted?(data.result?'결과 공개':'제출 완료 · 결과 대기'):r.accepting?'응시 가능':'응시 기간 아님'}</span>${button('새로고침','reload')}</div>${subjectList()}${backupConflict?'<p role="alert">다른 기기의 저장 내용이 있습니다.</p>'+button('기기 답안 보기','backup'):''}<div class="ia-actions">${!submitted?button('전체 답안 제출','submit','',true):''}</div>${data.result?fileList(data.files):''}`:`<section class="ia-panel"><div class="ia-subject-heading"><h3>${SECTIONS[section]}</h3>${button('과목 목록','subjects')}</div><div class="ia-progress"><span data-answer-count></span></div><div data-question-grid></div><div class="ia-page-nav">${button('이전','page',`data-page="${page-1}" ${page===0?'data-ia-readonly disabled':''}`)}<span>${page+1} / ${Math.ceil(r.perSection/10)}</span>${button('다음','page',`data-page="${page+1}" ${page>=Math.ceil(r.perSection/10)-1?'data-ia-readonly disabled':''}`)}</div>${!submitted?`<div class="ia-actions">${button('임시저장','save','',true)}${button('과목 목록','subjects')}</div>`:''}</section>`}`;
  }drawGrid();drawLocks();if(uncertain)message('제출 상태를 확인해주세요.',true);
 }
 function drawGrid(){const r=data.round,start=section*r.perSection,grid=host.querySelector('[data-question-grid]');if(!grid||section===null)return;
  if(admin){grid.className='ia-key-grid';grid.innerHTML=Array.from({length:Math.ceil(r.perSection/5)},(_,group)=>{const indices=Array.from({length:Math.min(5,r.perSection-group*5)},(_,i)=>group*5+i);return `<div class="ia-table"><table class="ia-key-table"><thead><tr><th>문항</th>${indices.map(i=>`<th>${i+1}</th>`).join('')}</tr></thead><tbody><tr><th>정답</th>${indices.map(i=>`<td><select aria-label="${SECTIONS[section]} ${i+1}번 정답" data-key-index="${start+i}" data-ia-write><option value="">—</option>${[1,2,3,4,5].map(v=>`<option value="${v}" ${data.answerKey[start+i]===v?'selected':''}>${v}</option>`).join('')}</select></td>`).join('')}</tr></tbody></table></div>`;}).join('');return;}
  grid.className='ia-answer-grid';grid.innerHTML=Array.from({length:Math.min(10,r.perSection-page*10)},(_,i)=>{const local=page*10+i,index=start+local,correct=data.correctAnswers?.[index];return `<article class="ia-answer ${answers[index]?'answered':''}"><div class="ia-answer-number"><strong>${local+1}번</strong>${correct?`<small>정답 ${correct}</small>`:''}</div><div class="ia-choices">${[1,2,3,4,5].map(v=>`<button type="button" data-ia-action="answer" data-answer="${index}" data-choice="${v}" aria-label="${SECTIONS[section]} ${local+1}번 ${v}번 선택" aria-pressed="${answers[index]===v}">${v}</button>`).join('')}</div></article>`;}).join('');
  const count=host.querySelector('[data-answer-count]');if(count)count.textContent=`${answers.slice(start,start+r.perSection).filter(Boolean).length}/${r.perSection} 입력`;
 }
 async function saveStudent(submit){if(!data||busy)return;if(submit&&!answers.some(Boolean)){message(errors.empty_answers,true);return;}if(submit&&!confirm(`미응답 ${answers.filter(v=>!v).length}문항입니다. 제출 후 수정할 수 없습니다. 최종 제출할까요?`))return;
  if(submit&&!pendingKey)pendingKey=crypto.randomUUID();if(submit)uncertain=true;backup();setBusy(true);
  try{const next=await request(submit?'submit':'save',{id:data.round.id,revision,answers:[...answers],...(submit?{requestKey:pendingKey}:{})});if(dead)return;data=next;revision=next.attempt.revision;dirty=false;uncertain=false;clearBackup();drawDetail();message(submit?'제출 완료':'저장 완료');}
  catch(e){if(!dead){backup();fail(e);if(submit)drawLocks();}}finally{if(!dead)setBusy(false);}}
 function adminPayload(){const f=new FormData(host.querySelector('[data-admin-form]')),r=data.round;
  return {id:r.id,revision:r.revision,kind:r.kind,roundNo:Number(f.get('roundNo')),title:String(f.get('title')),state:String(f.get('state')),resultsReleased:f.get('resultsReleased')==='true',
   opensAt:f.get('opensAt')?new Date(f.get('opensAt')+'+09:00').toISOString():null,closesAt:f.get('closesAt')?new Date(f.get('closesAt')+'+09:00').toISOString():null,answerKey:[...data.answerKey],reason:String(f.get('reason')??adminDraft?.reason??'')};
 }
 async function openFile(fileId){const popup=window.open('about:blank','_blank');if(popup)popup.opener=null;
  try{const value=await request(admin?'admin_file':'file',{id:data.round.id,fileId}),url=new URL(value.url);if(url.protocol!=='https:'||!url.pathname.includes('/object/sign/interview-aptitude/'))throw Error('파일 주소를 확인하지 못했습니다.');if(popup)popup.location.replace(url.href);else{const a=document.createElement('a');a.href=url.href;a.target='_blank';a.rel='noopener noreferrer';a.textContent='해설지 열기';host.querySelector('[data-ia-message]').replaceChildren(a);}}
  catch(e){popup?.close();if(!dead)fail(e);}}
 async function upload(file){if(!file||busy||!canWrite)return;if(dirty){message('정답·설정을 먼저 저장한 뒤 파일을 업로드해주세요.',true);return;}if(!file.name.toLowerCase().endsWith('.pdf')||file.size>20971520||file.size<10){message(errors.invalid_file,true);return;}
  setBusy(true);message('해설지 파일을 전송하고 확인하고 있습니다.');let prepared;
  try{prepared=await request('admin_upload_prepare',{id:data.round.id,revision:data.round.revision,name:file.name,bytes:file.size});const url=new URL(prepared.uploadUrl);if(url.protocol!=='https:'||!url.pathname.includes('/object/upload/sign/interview-aptitude/'))throw Error('파일 전송 주소를 확인하지 못했습니다.');
   const uploaded=await fetch(url.href,{method:'PUT',body:file,credentials:'omit',redirect:'error',headers:{'Content-Type':'application/pdf','x-upsert':'false'}});if(!uploaded.ok)throw Error('파일 전송을 완료하지 못했습니다.');
   await request('admin_upload_complete',{id:data.round.id,fileId:prepared.fileId});if(dead)return;await loadDetail(data.round.id);message('해설지를 업로드했습니다.');
  }catch(e){if(prepared)await request('admin_upload_abort',{id:data.round.id,fileId:prepared.fileId}).catch(()=>{});if(!dead)fail(e);}finally{if(!dead)setBusy(false);}}
 async function click(event){const el=event.target.closest('[data-ia-action]');if(!el||busy||dead||el.disabled)return;const action=el.dataset.iaAction;
  if(['list','kind','open','new','reload','report'].includes(action)&&!canLeave())return;
  if(action==='list')return loadList();if(action==='kind'){kind=el.dataset.kind;const first=rounds.find(r=>r.kind===kind);if(!admin&&first)return loadDetail(first.id);listView();return;}
  if(action==='open'||action==='reload')return loadDetail(el.dataset.id||data.round.id);
  if(action==='new'){adminDraft=null;data=newRound(kind,Math.max(0,...rounds.filter(r=>r.kind===kind).map(r=>r.roundNo))+1);dirty=true;section=null;page=0;drawDetail();return;}
  if(admin&&['section','subjects','page'].includes(action))try{adminDraft=adminPayload();}catch(e){fail(e);return;}
  if(action==='section'){section=Number(el.dataset.section);page=0;drawDetail();return;}
  if(action==='subjects'){section=null;page=0;drawDetail();return;}
  if(action==='page'){page=Math.max(0,Math.min(Math.ceil(data.round.perSection/10)-1,Number(el.dataset.page)));drawDetail();return;}
  if(action==='answer'){if(uncertain||data.attempt?.state==='submitted'||!data.round.accepting)return;const index=Number(el.dataset.answer),value=Number(el.dataset.choice);answers[index]=value;dirty=true;const stored=backup(),row=el.closest?.('.ia-answer');if(row){row.classList.add('answered');row.querySelectorAll('[data-choice]').forEach(choice=>choice.setAttribute('aria-pressed',String(Number(choice.dataset.choice)===value)));const count=host.querySelector('[data-answer-count]'),start=section*data.round.perSection;if(count)count.textContent=`${answers.slice(start,start+data.round.perSection).filter(Boolean).length}/${data.round.perSection} 입력`;}else drawGrid();drawLocks();if(!stored)message('기기 저장 실패. 임시저장을 눌러주세요.',true);return;}
  if(action==='clear'){answers[Number(el.dataset.clear)]=0;dirty=true;const stored=backup();drawGrid();drawLocks();if(!stored)message('이 기기에 임시 보관하지 못했습니다. 창을 닫기 전에 서버에 임시저장해주세요.',true);return;}
  if(action==='save'||action==='submit')return saveStudent(action==='submit');
  if(action==='backup'){const text=document.createElement('textarea');text.readOnly=true;try{text.value=JSON.parse(localStorage.getItem(key())).answers.join(' ');}catch{}host.querySelector('[data-ia-message]').replaceChildren(text);return;}
  if(action==='file')return openFile(el.dataset.fileId);
  if(action==='delete-round'){
   if(!canWrite||!canLeave()||!confirm('작성 중 회차와 해설지를 삭제할까요?'))return;setBusy(true);
   try{await request('admin_delete',{id:data.round.id,revision:data.round.revision});if(!dead){dirty=false;await loadList();}}catch(e){if(!dead)fail(e);}finally{if(!dead)setBusy(false);}return;
  }
  if(action==='paste')try{
   if(!canWrite)return;data.answerKey=parseAnswerKey(host.querySelector('[data-key-paste]').value,data.round.questionCount);
   dirty=true;drawGrid();message('화면에 반영했습니다. 저장 버튼을 눌러주세요.');return;
  }catch(e){fail(e);return;}
  if(action==='admin-save'){
   if(!canWrite)return;let payload;try{payload=adminPayload();}catch(e){fail(e);return;}setBusy(true);
   try{const value=await request('admin_save',payload);if(dead)return;dirty=false;await loadDetail(value.round.id);message(`저장했습니다.${value.rescored?' 제출자 '+value.rescored+'명의 정답 수·등수를 재계산했습니다.':''}`);}catch(e){if(!dead)fail(e);}finally{if(!dead)setBusy(false);}return;
  }
  if(action==='delete-file'){
   if(!canWrite||dirty){message('정답·설정을 먼저 저장해주세요.',true);return;}if(!confirm('이 해설지를 삭제할까요?'))return;setBusy(true);
   try{await request('admin_file_delete',{id:data.round.id,fileId:el.dataset.fileId,revision:data.round.revision});if(!dead)await loadDetail(data.round.id);}catch(e){if(!dead)fail(e);}finally{if(!dead)setBusy(false);}return;
  }
  if(action==='report'){setBusy(true);try{const value=await request('admin_report',{id:data.round.id});if(dead)return;shell('응시·성적 현황');host.querySelector('[data-ia-body]').innerHTML=`${button('회차 관리로','open',`data-id="${data.round.id}"`)}<div class="ia-table"><table><thead><tr><th>학생</th><th>제출 상태</th><th>정답 수</th><th>정답률</th><th>등수</th></tr></thead><tbody>${value.students.map(s=>`<tr><td>${esc(s.name)}</td><td>${({submitted:'제출',draft:'임시저장',not_submitted:'미제출'})[s.state]}</td><td>${s.correctCount==null?'—':`${s.correctCount}/${value.round.questionCount}`}</td><td>${s.accuracy==null?'—':`${fmt(s.accuracy)}%`}</td><td>${fmt(s.rank)}</td></tr>`).join('')}</tbody></table></div>`;}catch(e){if(!dead)fail(e);}finally{if(!dead)setBusy(false);}}
 }
 const changed=event=>{const el=event.target;if(dead)return;if(el.matches('[data-round-select]')){if(el.value&&el.value!==data?.round.id){if(canLeave())void loadDetail(el.value);else el.value=data.round.id;}return;}if(el.matches('[data-upload]')){void upload(el.files?.[0]);return;}
  if(el.hasAttribute('data-answer')){answers[Number(el.dataset.answer)]=Number(el.value);dirty=true;const stored=backup();host.querySelector('[data-answer-count]').textContent=`${answers.filter(Boolean).length} / ${data.round.questionCount}문항 입력`;if(!stored)message('기기 저장 실패. 임시저장을 눌러주세요.',true);}
  else if(admin&&canWrite){if(el.hasAttribute('data-key-index'))data.answerKey[Number(el.dataset.keyIndex)]=el.value?Number(el.value):null;dirty=true;}
 };
 host.addEventListener('click',click);host.addEventListener('change',changed);host.addEventListener('input',changed);
 const unload=e=>{if(dirty||busy){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',unload);
 await loadList();return {canLeave,destroy(){dead=true;++generation;backup();host.removeEventListener('click',click);host.removeEventListener('change',changed);host.removeEventListener('input',changed);window.removeEventListener('beforeunload',unload);host.classList.remove('ia-root');}};
}
