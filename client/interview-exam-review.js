(function(){
 'use strict';
 const model=window.InterviewExamReview,data=JSON.parse(document.getElementById('review-dataset').textContent),host=document.getElementById('review-app'),view=window.InterviewExamReviewView;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let slot='a',review=model.createReview(data),index=0,visibleIssues=[],revision=0,db=null,saving=Promise.resolve(),dirty=false,conflict=false,session=0,editId=0;
 const key=()=>data.datasetHash+':'+slot;
 const current=()=>data.cases[index];
 const byQuestion=()=>data.questions.find(q=>q.id===current().questionId);
 function setMessage(text,error=false){const box=document.getElementById('review-message');box.textContent=text;box.className=error?'error':'';}
 function openStorage(){return new Promise((resolve,reject)=>{const request=indexedDB.open('ronpark-exam-human-review',1);request.onupgradeneeded=()=>request.result.createObjectStore('reviews');request.onerror=()=>reject(Error('storage_unavailable'));request.onblocked=()=>reject(Error('storage_blocked'));request.onsuccess=()=>resolve(request.result);});}
 function readStored(id){return new Promise((resolve,reject)=>{const tx=db.transaction('reviews','readonly'),request=tx.objectStore('reviews').get(id);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(Error('storage_unavailable'));});}
 function commitStored(id,value,expected){return new Promise((resolve,reject)=>{const tx=db.transaction('reviews','readwrite'),store=tx.objectStore('reviews'),read=store.get(id);let stale=false;
  read.onsuccess=()=>{if((read.result?.revision||0)!==expected){stale=true;tx.abort();return;}store.put({revision:expected+1,review:value},id);};
  tx.oncomplete=()=>resolve(expected+1);tx.onabort=tx.onerror=()=>reject(Error(stale?'stale_review':'storage_unavailable'));
 });}
 function refreshProgress(){const p=model.progress(data,review);document.getElementById('review-progress').textContent=`완료 ${p.cases} / ${p.totalCases}`;document.getElementById('review-final-state').textContent=review.reviewedAt?'검수 완료':'검수 중';}
 function save(){
  dirty=true;const value=structuredClone(review),id=key(),current=session,edit=++editId;
  saving=saving.then(async()=>{
   if(current!==session)return;
   if(conflict||!db){setMessage(conflict?'다른 창에서 기록이 변경되었습니다. 현재 초안을 내보낸 뒤 새로고침해주세요.':'브라우저 저장을 사용할 수 없습니다. 초안 내보내기로 기록을 보존해주세요.',true);return;}
   try{revision=await commitStored(id,value,revision);if(edit===editId)dirty=false;setMessage('이 브라우저에 저장됨');}
   catch(e){conflict=e.message==='stale_review';setMessage(conflict?'다른 창에서 먼저 저장했습니다. 덮어쓰지 않았습니다. 현재 초안을 내보내고 새로고침해주세요.':'저장하지 못했습니다. 현재 초안을 내보내 보존해주세요.',true);}
  });return saving;
 }
 function markChanged(){review.reviewedAt=null;visibleIssues=[];refreshProgress();refreshRuleResults();showIssues();void save();}
 function render(){host.innerHTML=view.render(data,review,{index,slot});refreshProgress();refreshRuleResults();showIssues();}
 const simpleIssue={reviewer_required:'검수자 이름을 적어주세요.',question_review_required:'위의 문제 기준을 확인하고 의견을 한 줄 남겨주세요.',case_review_required:'설명과 오류를 확인하고, 판단 이유를 한 줄 적어주세요.',invalid_concept_quote:'근거는 위 답변에 있는 문장으로 남겨주세요.',invalid_error_quote:'오류가 있는 문장을 위 답변에서 가져와주세요.',undefined_partial:'이 설명에는 부분 인정 기준이 없습니다.',hold_reason_required:'판단하기 어려운 이유를 골라주세요.',grade_conflict:'전체 판정과 설명별 확인 내용이 다릅니다. 다시 확인해주세요.'};
 const issueText=issue=>simpleIssue[issue.code]||issue.message;
 function refreshRuleResults(){
  const box=document.getElementById('rule-result');if(!box)return;const row=review.cases.find(r=>r.id===current().id),expected=model.expectedGrade(byQuestion(),row),problem=model.problems(data,review).find(p=>p.id===current().id);
  box.textContent=problem?issueText(problem):expected?'확인을 마쳤습니다. 저장하고 다음 답변으로 넘어가세요.':'설명과 오류를 하나씩 확인해주세요.';box.className=problem&&problem.code!=='case_review_required'?'rule-result error':'rule-result';
 }
 function showIssues(){const box=document.getElementById('review-issues');if(!box)return;box.innerHTML=visibleIssues.length?'<strong>아래 항목을 확인해주세요</strong><ul>'+visibleIssues.slice(0,8).map(issue=>{const position=data.cases.findIndex(c=>c.id===issue.id),prefix=position>=0?'답변 '+(position+1):issue.id==='reviewer'?'이름':'문항 기준';return `<li><button type="button" data-issue-id="${esc(issue.id)}">${prefix}: ${esc(issueText(issue))}</button></li>`;}).join('')+'</ul>':'';}
 function chooseCase(next){if(!Number.isInteger(next)||next<0||next>=data.cases.length)return;index=next;visibleIssues=[];render();window.scrollTo({top:0,behavior:'auto'});}
 function checkCurrent(){visibleIssues=model.problems(data,review).filter(issue=>['reviewer',current().id,byQuestion().id].includes(issue.id));showIssues();if(visibleIssues.length){setMessage('아직 확인하지 않은 항목이 있습니다.',true);document.getElementById('review-issues').scrollIntoView({block:'nearest'});return false;}return true;}
 async function finish(){
  visibleIssues=model.problems(data,review);showIssues();if(visibleIssues.length){setMessage('아직 확인하지 않은 항목이 있습니다.',true);document.getElementById('review-issues').scrollIntoView({block:'nearest'});return;}
  if(conflict){setMessage('다른 창에서 기록이 바뀌었습니다. 초안을 보관한 뒤 새로고침해주세요.',true);return;}
  host.inert=true;review.reviewedAt=new Date().toISOString();refreshProgress();await save();host.inert=false;if(conflict){review.reviewedAt=null;refreshProgress();return;}download(review,'');
 }
 function download(value,suffix){const blob=new Blob([JSON.stringify(value,null,2)+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='reviewer-'+slot+suffix+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 async function loadSlot(next){host.inert=true;await saving;if(dirty){setMessage('아직 브라우저에 저장되지 않은 기록이 있습니다. 초안을 내보낸 뒤 새로고침해주세요.',true);document.getElementById('review-slot').value=slot;host.inert=false;return;}slot=next;session++;revision=0;conflict=false;review=model.createReview(data);if(db){try{const stored=await readStored(key());if(stored){review=model.readReview(data,stored.review,{reopen:false});if(!Number.isSafeInteger(stored.revision)||stored.revision<1)throw Error();revision=stored.revision;}}catch{conflict=true;render();setMessage('저장 기록을 읽지 못해 저장을 중단했습니다. 기존 기록은 덮어쓰지 않습니다.',true);host.inert=false;return;}}const unfinished=new Set(model.problems(data,review).map(p=>p.id));const nextCase=data.cases.findIndex(c=>unfinished.has(c.id));index=nextCase<0?data.cases.length-1:nextCase;render();setMessage('검수자 '+slot.toUpperCase()+'의 기록');host.inert=false;}
 host.addEventListener('input',e=>{
  const el=e.target;if(el.id==='reviewer-name')review.reviewer=el.value;
  else if(el.dataset.qField){const row=review.questions.find(row=>row.id===byQuestion().id);row[el.dataset.qField]=el.dataset.qField==='decision'?(el.value||'pending'):el.value;row.approved=row.decision==='approved';}
  else if(el.dataset.case){const row=review.cases.find(row=>row.id===el.dataset.case),field=el.dataset.field;if(['concepts','errors','conceptQuotes','errorQuotes'].includes(field))row[field][Number(el.dataset.index)]=['concepts','errors'].includes(field)?el.value||null:el.value;else row[field]=field==='grade'?el.value||null:el.value;}
  else return;markChanged();if(el.dataset.field==='concepts'||el.dataset.field==='errors')render();
 });
 host.addEventListener('change',async e=>{
  if(e.target.id==='review-slot')return loadSlot(e.target.value);
  if(e.target.id==='review-jump')return chooseCase(Number(e.target.value));
  if(e.target.id!=='import-review')return;
  try{const file=e.target.files[0];if(!file||file.size>3000000)throw Error();const imported=JSON.parse(await file.text());
   // Only accept the shape this tool itself exports; imported approvals always reopen as drafts.
   const template=model.readReview(data,imported);
   await saving;if(dirty||conflict)throw Error();
   if(review.reviewer||review.questions.some(q=>q.note||q.decision!=='pending')||review.cases.some(c=>c.note||c.grade||c.concepts.some(Boolean)||c.errors.some(Boolean)||c.conceptQuotes.some(Boolean)||c.errorQuotes.some(Boolean))){
    setMessage('현재 기록을 보존하기 위해 가져오기를 중단했습니다. 비어 있는 검수 기록 또는 다른 브라우저에서 가져와주세요.',true);return;
   }
   review=template;render();markChanged();
  }catch{setMessage('가져오지 못했습니다. 같은 문항 버전의 검수 파일인지 확인해주세요. 기존 기록은 유지했습니다.',true);}
 });
 host.addEventListener('click',async e=>{
  const button=e.target.closest('button');if(!button)return;
  const c=current(),row=review.cases.find(r=>r.id===c.id);
  if(button.dataset.grade){if(!model.GRADES.includes(button.dataset.grade))return;row.grade=button.dataset.grade;markChanged();render();return;}
  if(button.dataset.copy){const field=button.dataset.copy,i=Number(button.dataset.index);if(!['conceptQuotes','errorQuotes'].includes(field)||!Number.isInteger(i)||i<0||i>=row[field].length)return;row[field][i]=c.transcript;markChanged();render();return;}
  if(button.dataset.questionDecision){const q=review.questions.find(r=>r.id===byQuestion().id);if(button.dataset.questionDecision==='approved'&&!q.note.trim()){setMessage('기준에 대한 확인 의견을 한 줄 남겨주세요.',true);host.querySelector('[data-q-field=note]').focus();return;}q.decision=button.dataset.questionDecision;q.approved=q.decision==='approved';markChanged();render();return;}
  if(button.dataset.issueId){const id=button.dataset.issueId,position=data.cases.findIndex(c=>c.id===id);if(id==='reviewer'){document.getElementById('reviewer-name').focus();return;}if(position>=0){chooseCase(position);return;}const target=data.cases.findIndex(c=>c.questionId===id);if(target>=0){if(byQuestion().id!==id)chooseCase(target);const details=document.getElementById('question-check');details.open=true;details.scrollIntoView({block:'start'});}return;}
  if(button.id==='no-errors'){row.errors=row.errors.map(()=> 'absent');markChanged();render();return;}
  if(button.id==='previous-answer')return chooseCase(index-1);
  if(button.id==='skip-answer')return chooseCase(index+1);
  if(button.id==='next-answer'){if(!checkCurrent())return;if(index===data.cases.length-1)return finish();return chooseCase(index+1);}
  if(button.id==='export-draft'){download({...review,reviewedAt:null},'-draft');return;}
  if(button.id==='finish-review')return finish();
 });
 window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
 render();host.inert=true;openStorage().then(value=>{db=value;return loadSlot('a');}).catch(()=>{host.inert=false;setMessage('브라우저 저장을 사용할 수 없습니다. 초안 내보내기로 기록을 보존해주세요.',true);});
})();
