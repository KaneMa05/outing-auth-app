const assert=require('node:assert/strict');
module.exports=async({invoke,ev,wait,click,submit,screenshot,failNext,send,openPopup,closePopup,getCalls,setSession})=>{
 const eraseComment=async index=>{
  await ev(`{const field=document.querySelector('[data-inline-comment="${index}"]');field.focus();const range=document.createRange();range.selectNodeContents(field);getSelection().removeAllRanges();getSelection().addRange(range);}`);
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8});
 };
 const student={type:'student',id:'18120'},key={kind:'introduction',itemId:''};
 const old=(await invoke('writing_list',student)).writings.find(w=>w.kind==='introduction');
 const text='안녕😀하세요. 저는 국민의 안전을 지키는 지원자입니다.\n어떤 상황에서도 성실하게 소통하겠습니다.\n작은 일에도 책임감을 갖고 끝까지 해결하겠습니다.';
 await invoke('writing_save',student,{...key,revision:old?.revision||0,status:'submitted',text});
 await click('[data-review-view=board]');await wait("!!document.querySelector('[data-board-open]')");
 await ev("document.querySelector('[data-board-filter] [name=search]').value='2026-001';document.querySelector('[data-board-filter] [name=kind]').value='introduction'");
 await submit('[data-board-filter]');await wait("document.querySelectorAll('.ip-board-table tbody tr').length===1 && !!document.querySelector('[data-board-open]')");
 assert.deepEqual(await ev("[...document.querySelectorAll('.ip-board-table thead th')].map(n=>n.textContent)"),['번호','학생','항목','차수','제출일','관리','처리상태']);
 assert.equal(await ev("document.querySelector('.ip-board-table tbody tr').children[3].textContent"),`${(await invoke('writing_list',student)).writings.find(w=>w.kind==='introduction').submission_round}차`);
 await screenshot('annotation-board-desktop',1200);
 const beforeCancel=getCalls().length;
 await ev("window.__confirm=window.confirm;window.confirm=()=>false");await click('[data-board-delete]');
 assert.equal(getCalls().length,beforeCancel,'Cancel never sends a deletion request');
 await ev("window.confirm=window.__confirm");
 failNext();await click('[data-board-delete]');await wait("document.querySelector('[data-board-message]').textContent.includes('삭제하지 못했습니다')");
 assert.equal(await ev("document.querySelector('[data-board-delete]').disabled"),false);
 await click('[data-board-delete]');await wait("document.querySelector('[data-board-message]').textContent==='게시판에서 삭제했습니다.' && !document.querySelector('[data-board-open]')");
 const removed=(await invoke('writing_list',student)).writings.find(w=>w.kind==='introduction');
 assert.equal(removed.body,text);
 await invoke('writing_save',student,{...key,revision:removed.revision,status:'submitted',text});
 await click('[data-board-action=reload]');await wait("!!document.querySelector('[data-board-open]')");
 // A blocked popup leaves a usable link and keeps the list available.
 await ev("window.__originalOpen=window.open;window.open=()=>null");await click('[data-board-open]');
 assert.equal(await ev("document.querySelector('[data-board-message] a').target"),'_blank');
 await ev("window.open=window.__originalOpen");
 const beforeOpen=getCalls().length;
 await openPopup();await wait("!!document.querySelector('[data-mark-source]')");
 assert.equal(await ev('window.opener===null'),true);
 assert.equal(getCalls().slice(beforeOpen).includes('admin_ai_usage'),false,'Opening corrections must not load AI generation history');
 assert.equal(await ev("!!document.querySelector('[data-board-ai-usage],.ip-ai-usage')"),false);
 assert.deepEqual(await ev("[...document.querySelector('[data-writing-review]').options].map(n=>n.textContent)"),['보완요청','첨삭완료 (수고하셨습니다.)']);
 assert.equal(await ev("document.querySelector('[data-mark-source]').textContent"),text);
 assert.equal(await ev("document.querySelectorAll('[data-mark-list],.ip-annotation-notes,[data-writing-feedback],[data-mark-note],[data-mark=comment]').length"),0);
 await ev(`window.selectAnnotation=(start,end)=>{
  document.querySelector('[data-mark-source]').focus();
  const parts=[...document.querySelectorAll('[data-mark-source] [data-original-start]')],range=document.createRange();
  const point=value=>{const part=parts.find(p=>Number(p.dataset.originalStart)<=value&&Number(p.dataset.originalEnd)>=value);return [part.firstChild,[...part.textContent].slice(0,value-Number(part.dataset.originalStart)).join('').length];};
  range.setStart(...point(start));range.setEnd(...point(end));const selection=getSelection();selection.removeAllRanges();selection.addRange(range);document.dispatchEvent(new Event('selectionchange'));
 };window.selectAnnotation(0,7);`);
 await click('[data-mark=underline]');
 await ev('window.selectAnnotation(2,15)');await click('[data-mark=strike]');
 await ev('window.selectAnnotation(8,19)');await click('[data-mark=bracket]');
 await ev('window.selectAnnotation(19,19)');
 await send('Input.insertText',{text:'<img src=x onerror="window.__annotationXss=true">'});
 assert.equal(await ev("document.querySelectorAll('[data-mark-source] img').length"),0);
 await ev("{const field=document.querySelector('[data-inline-comment]');field.textContent='국민의 안전을 지킨 구체적인 경험을 한 문장 추가해주세요.';field.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText'}))}");
 assert.equal(await ev("document.querySelector('[data-mark-source]').textContent.includes('교사:')"),false);
 assert.equal(await ev("document.querySelector('.ip-inline-comment').textContent"),'국민의 안전을 지킨 구체적인 경험을 한 문장 추가해주세요.');
 assert.equal(await ev("document.querySelectorAll('[data-remove-comment],[data-remove-legacy],.ip-comment-remove').length"),0);
 // Selection beyond inline comments must still use original source offsets.
 await ev('window.selectAnnotation(30,35)');await click('[data-mark=bracket]');await click('[data-mark-undo]');
 await ev('window.selectAnnotation(0,0)');await send('Input.insertText',{text:'시작 코멘트'});
 await eraseComment(4);await click('[data-mark-undo]');
 assert((await ev("document.querySelector('[data-mark-source]').textContent")).includes('시작 코멘트'));
 await eraseComment(4);
 await ev('window.selectAnnotation(7,8)');await click('[data-mark-clear]');
 assert.equal(await ev("document.querySelectorAll('[data-mark-source] .ip-mark-strike').length"),0);
 await click('[data-mark-undo]');
 assert.equal(await ev("getComputedStyle(document.querySelector('.ip-mark-strike')).color"),'rgb(198, 40, 40)');
 assert.equal(await ev("getComputedStyle(document.querySelector('.ip-bracket-start'),'::before').content"),'"("');
 // Real IME composition starts on the original, and must leave its text intact.
 await ev('window.selectAnnotation(0,0)');
 await send('Input.imeSetComposition',{text:'ㅎ',selectionStart:1,selectionEnd:1});
 await send('Input.imeSetComposition',{text:'한글',selectionStart:2,selectionEnd:2});
 await send('Input.insertText',{text:'한글 코멘트'});
 await wait("document.querySelector('[data-inline-comment=\"5\"]')?.textContent==='한글 코멘트'");
 assert.equal(await ev("[...document.querySelectorAll('[data-mark-source] [data-original-start]')].map(n=>n.textContent).join('')"),text);
 assert.equal(await ev("document.querySelector('[data-inline-comment=\"5\"]').textContent"),'한글 코멘트');
 await eraseComment(5);
 await ev('window.selectAnnotation(30,35)');await click('[data-color-toggle]');
 assert.equal(await ev("document.querySelectorAll('[data-palette-color]').length"),5);
 assert.equal(await ev("!!document.querySelector('[data-mark=color]')"),false);
 assert.deepEqual(await ev("[...document.querySelectorAll('[data-palette-color]')].map(n=>n.getAttribute('aria-label'))"),['빨강','파랑','검정','초록','보라']);
 await screenshot('annotation-color-palette-desktop',1200);
 await click('[data-palette-color="#1d4ed8"]');
 assert.equal(await ev("document.querySelector('[data-color-palette]').hidden"),true);
 assert.equal(await ev("getComputedStyle(document.querySelector('[data-original-start=\"30\"]')).color"),'rgb(29, 78, 216)');
 await ev('window.selectAnnotation(32,36)');await click('[data-color-toggle]');await click('[data-palette-color="#7e22ce"]');
 assert.equal(await ev("getComputedStyle(document.querySelector('[data-original-start=\"32\"]')).color"),'rgb(126, 34, 206)');
 await click('[data-mark-undo]');
 await ev("{const field=document.querySelector('[data-inline-comment=\"3\"]');field.focus();const range=document.createRange();range.selectNodeContents(field);getSelection().removeAllRanges();getSelection().addRange(range);document.dispatchEvent(new Event('selectionchange'));}");await click('[data-color-toggle]');await click('[data-palette-color="#15803d"]');
 assert.equal(await ev("getComputedStyle(document.querySelector('[data-inline-comment=\"3\"]')).color"),'rgb(21, 128, 61)');
 failNext();await click('[data-writing-save=feedback]');await wait("document.querySelector('[data-writing-message]').dataset.error==='true'");
 assert((await ev("document.querySelector('[data-inline-comment=\"3\"]').textContent")).includes('구체적인 경험'));
 assert.equal(await ev("document.querySelector('[data-inline-comment=\"3\"]').contentEditable"),'plaintext-only');
 await click('[data-writing-save=feedback]');await wait("document.querySelector('[data-writing-message]').textContent==='피드백을 저장했습니다.'");
 const saved=(await invoke('writing_list',student)).writings.find(w=>w.kind==='introduction');
 assert.equal(saved.annotation_marks.length,5);assert.equal(saved.submitted_body,text);assert.equal(saved.feedback,'');
 assert.deepEqual(saved.annotation_marks[3],{start:19,end:19,type:'comment',note:'국민의 안전을 지킨 구체적인 경험을 한 문장 추가해주세요.',color:'#15803d'});
 await ev("document.querySelector('[data-writing-annotations]').scrollIntoView({block:'start',behavior:'instant'})");
 await screenshot('annotation-editor-desktop',1200);
 await screenshot('annotation-editor-mobile-initial',390);
 await ev("window.scrollBy({top:document.querySelector('[data-writing-annotations]').getBoundingClientRect().top-180,behavior:'instant'})");
 await screenshot('annotation-editor-mobile',390);
 await click('[data-color-toggle]');await screenshot('annotation-color-palette-mobile',390);
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});
 assert.equal(await ev("document.querySelector('[data-color-palette]').hidden"),true);
 assert(await ev('document.documentElement.scrollWidth<=innerWidth'));
 await closePopup();
 assert.equal(await ev("!!document.querySelector('[data-board-open]')"),false,'Revision requests leave the administrator to-do list');
 assert.equal(await ev("document.querySelector('[data-board-action=revision] strong').textContent"),'1');
 await click('[data-board-action=revision] strong');await wait("document.querySelector('[data-board-heading]').textContent==='보완요청 제출물' && !!document.querySelector('[data-board-open]')");
 await openPopup();await wait("!!document.querySelector('[data-inline-comment]')");
 assert.equal(await ev("document.querySelector('[data-inline-comment]').textContent"),saved.annotation_marks[3].note);
 assert.equal(await ev("getComputedStyle(document.querySelector('[data-inline-comment]')).color"),'rgb(21, 128, 61)');
 assert.equal(await ev("getComputedStyle(document.querySelector('[data-original-start=\"30\"]')).color"),'rgb(29, 78, 216)');
 // Edit an existing inline comment using real browser text input, then persist.
 await ev("{const field=document.querySelector('[data-inline-comment]');field.focus();const range=document.createRange();range.selectNodeContents(field);const s=getSelection();s.removeAllRanges();s.addRange(range)}");
 await send('Input.insertText',{text:'지원자의 실제 행동과 결과를 구체적으로 적어주세요.'});
 await click('[data-writing-save=feedback]');await wait("document.querySelector('[data-writing-message]').textContent==='피드백을 저장했습니다.'");
 assert.equal((await invoke('writing_list',student)).writings.find(w=>w.kind==='introduction').annotation_marks[3].note,'지원자의 실제 행동과 결과를 구체적으로 적어주세요.');
 await closePopup();
 await ev("document.querySelector('[data-board-filter] [name=status]').value='approved'");await submit('[data-board-filter]');
 await wait("document.querySelector('.ip-board-table').textContent.includes('조건에 맞는 제출물이 없습니다')");
 await ev("document.querySelector('[data-board-filter] [name=status]').value='needs_revision'");await submit('[data-board-filter]');await wait("!!document.querySelector('[data-board-open]')");
 await openPopup();await wait("!!document.querySelector('[data-writing-review]')");
 await ev("document.querySelector('[data-writing-review]').value='approved';document.querySelector('[data-writing-review]').dispatchEvent(new Event('change',{bubbles:true}))");
 await click('[data-writing-save=feedback]');await wait("document.querySelector('[data-writing-message]').textContent==='피드백을 저장했습니다.'");
 await closePopup();
 assert.equal(await ev("!!document.querySelector('[data-board-open]')"),false,'Completed submissions disappear from the default board');
 assert.equal(await ev("document.querySelector('[data-board-action=completed] strong').textContent"),'1');
 await click('[data-board-action=completed] strong');await wait("!!document.querySelector('[data-board-open]') && document.querySelector('[data-board-heading]').textContent==='첨삭완료 제출물'");
 assert.equal(await ev("document.querySelector('.ip-board-table tbody tr').lastElementChild.textContent"),'첨삭완료 (수고하셨습니다.)');
 assert.equal(await ev("document.querySelector('[data-board-filter] [name=search]').value"),'2026-001');
 assert.equal(await ev("document.querySelector('[data-board-filter] [name=kind]').value"),'introduction');
 await screenshot('annotation-completed-board-desktop',1200);
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:1000,deviceScaleFactor:1,mobile:true});
 await ev("document.querySelector('.ip-review-summary').scrollIntoView({block:'start',behavior:'instant'})");
 await screenshot('annotation-completed-board-mobile',390);
 await click('[data-board-action=active]');await wait("document.querySelector('[data-board-heading]').textContent==='제출물 첨삭 게시판' && document.querySelector('[data-board-results]').getAttribute('aria-busy')!=='true'");
 assert.equal(await ev("!!document.querySelector('[data-board-open]')"),false);
 assert.equal(await ev("document.querySelector('[data-board-filter] [name=status]').value"),'submitted');
 await click('[data-board-action=completed]');await wait("!!document.querySelector('[data-board-open]')");
 setSession({username:'qa',role:'admin',permissions:['interview.read']});
 await openPopup();await wait("!!document.querySelector('[data-mark-source]')");
 assert.equal(await ev("document.querySelector('[data-mark-source]').contentEditable"),'false');
 assert.equal(await ev("document.querySelector('[data-writing-save=feedback]').disabled && [...document.querySelectorAll('[data-palette-color]')].every(n=>n.disabled)"),true);
 await closePopup();
 for(const user of [null,{username:'qa',role:'teacher',permissions:['*']}]){
  setSession(user);const before=getCalls().length;
  await openPopup();await wait("!!document.querySelector('[role=alert]')");
  assert.equal(await ev("!!document.querySelector('[data-mark-source]')"),false);
  assert.equal(getCalls().slice(before).includes('admin_writing_list'),false,'Rejected sessions do not load student writing');
  await closePopup();
 }
 setSession({username:'qa',role:'admin',permissions:['*']});
 // Exercise the shared writer as a student: feedback still renders and a draft
 // save must never rewrite the submitted snapshot or its correction history.
 const origin=await ev('location.origin');
 await send('Page.navigate',{url:origin+'/'});await wait('window.ready===true');
 await ev(`(async()=>{
  window.controller.destroy();
  const {mountWorkspace}=await import('/interview-workspace.js?v=20261120-writing-open');
  const request=async(action,payload={})=>{const r=await fetch('/api/interview-prep',{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,action,studentId:'18120',deviceToken:'qa-device'})});const d=await r.json();if(!r.ok||!d.ok)throw Error(d.error);return d;};
  window.controller=await mountWorkspace(document.querySelector('#app'),{request,initialPage:'introduction'});
 })()`);
 assert.equal(await ev("document.querySelector('[data-writing-text]').value"),text);
 assert.equal(await ev("document.querySelector('.ip-corrections').textContent.includes('지원자의 실제 행동과 결과를 구체적으로 적어주세요.')"),true);
 assert.equal(await ev("!!document.querySelector('[data-writing-review]')"),false);
 assert.equal(await ev("document.querySelectorAll('.ip-comment-label').length"),0);
 assert.equal(await ev("document.querySelector('.ip-corrections .ip-inline-comment').textContent"),'지원자의 실제 행동과 결과를 구체적으로 적어주세요.');
 await screenshot('student-annotation-feedback-mobile',390);
 await ev("document.querySelector('[data-writing-text]').value+=' 다음 답변을 준비합니다.';document.querySelector('[data-writing-text]').dispatchEvent(new Event('input',{bubbles:true}))");
 await click('[data-writing-save=draft]');await wait("document.querySelector('[data-writing-message]').textContent==='임시저장했습니다.'");
 const afterDraft=(await invoke('writing_list',student)).writings.find(w=>w.kind==='introduction');
 assert.equal(afterDraft.submitted_body,text);assert.equal(afterDraft.submission_round,saved.submission_round);
 assert.equal(afterDraft.annotation_marks[3].note,'지원자의 실제 행동과 결과를 구체적으로 적어주세요.');
 // All three student editors now accept submissions immediately, including
 // resubmissions of previously completed work. Empty answers still stay local.
 for(const [kind,title] of [['introduction','자기소개 작성하기'],['motivation','지원동기 작성하기'],['public_service','공직관 작성하기']]){
  if(kind!=='introduction'){
   await click(`[data-workspace-page="${kind}"]`);
   await wait(`document.querySelector('h2').textContent===${JSON.stringify(title)} && !!document.querySelector('[data-writing-text]')`);
  }
  assert.equal(await ev("document.querySelector('[data-writing-save=submitted]').disabled"),false);
  assert.equal(await ev("document.body.textContent.includes('11/23 이후')"),false);
  const before=(await invoke('writing_list',student)).writings.find(w=>w.kind===kind);
  if(!before)assert.equal(await ev("document.querySelector('[data-writing-save=submitted]').textContent"),'교사에게 제출');
  const answer=`${title} · 오늘부터 제출 가능한 답변입니다.`;
  if(kind==='introduction'){
   await ev("document.querySelector('[data-writing-text]').value='';document.querySelector('[data-writing-text]').dispatchEvent(new Event('input',{bubbles:true}))");
   await click('[data-writing-save=submitted]');
   assert.equal(await ev("document.querySelector('[data-writing-message]').textContent"),'답변을 입력한 뒤 제출해주세요.');
   assert.equal((await invoke('writing_list',student)).writings.find(w=>w.kind===kind).revision,before.revision);
  }
  await ev(`document.querySelector('[data-writing-text]').value=${JSON.stringify(answer)};document.querySelector('[data-writing-text]').dispatchEvent(new Event('input',{bubbles:true}))`);
  if(kind==='motivation'){
   failNext();await click('[data-writing-save=submitted]');await wait("document.querySelector('[data-writing-message]').dataset.error==='true'");
   assert.equal(await ev("document.querySelector('[data-writing-text]').value"),answer);
   assert.equal(await ev("document.querySelector('[data-writing-save=submitted]').disabled"),false);
  }
  await click('[data-writing-save=submitted]');await wait("document.querySelector('[data-writing-message]').textContent==='교사에게 제출했습니다. 피드백을 기다려주세요.'");
  const submitted=(await invoke('writing_list',student)).writings.find(w=>w.kind===kind);
  assert.equal(submitted.submitted_body,answer);assert.equal(submitted.submission_status,'submitted');
  assert.equal(submitted.submission_round,(before?.submission_round||0)+1);
  const board=await invoke('admin_writing_board',{type:'admin',id:'qa'},{status:'submitted',search:'2026-001',kind});
  assert.equal(board.total,1);assert.equal(board.submissions[0].submission_status,'submitted');assert.equal(board.approved,0);
 }
 await ev("document.querySelector('.ip-writing-actions').scrollIntoView({block:'center',behavior:'instant'})");
 await screenshot('student-submission-open-mobile',390);
 console.log('PASS separate correction windows, ordered columns, blocked-popup recovery, no AI-history reads, read-only/denied sessions, saved status refresh, 5-color palette without an apply button; direct typing, IME, original/comment colors and inline comments: no separate list/feedback field, caret insertion, Unicode offsets after comments, real Korean text input, inline editing/deletion, undo, escaping, failure retry, persistence and mobile layout.');
};
