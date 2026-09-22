"""Reuse the approved screen templates with authenticated server persistence.
No question bank, answer fixtures or sample learning records enter this bundle.
"""
from pathlib import Path
import re
root=Path(__file__).resolve().parents[1]
source=(root/'docs/criminal-law-ox-proposal/local-app-preview.js').read_text(encoding='utf-8')
runtime=source[source.index('  return (() => {'):]
runtime=runtime.replace("const data = JSON.parse(root.querySelector('#criminal-ox-data').textContent);",'const data = bootstrap.catalog;')
runtime=re.sub(r'^    const source = q => .*?; };\n', '', runtime, flags=re.M)
begin=runtime.index('    const attempts = [];')
end=runtime.index("    let route='home'",begin)
runtime=runtime[:begin]+'''    const attempts = bootstrap.progress.map(p=>({id:p.question_id,answer:p.answer,correct:p.correct,seed:true}));
    let todayCount=bootstrap.todayCount;
    const progress=new Map(bootstrap.progress.map(p=>[p.question_id,p]));
    const statistics=new Map(Object.entries(bootstrap.statistics || {}));
    const notes = new Map();
    const note = id => { if(!notes.has(id)) notes.set(id,{text:'',bookmark:false,mastered:false}); return notes.get(id); };
    const updateNote=n=>{if(n)notes.set(n.question_id,{text:n.memo || '',hasMemo:n.has_memo || !!n.memo,bookmark:n.bookmark,mastered:n.mastered_version===byId.get(n.question_id)?.version});};
    bootstrap.notes.forEach(updateNote);
    let pending=false;
    const errorMessages={question_changed:'문제가 수정되었습니다. 화면을 새로고침해주세요.',question_unavailable:'현재 공개 중인 문제가 아닙니다. 화면을 새로고침해주세요.',ox_not_registered:'OX 이용 등록이 해제되었습니다. 관리자에게 문의해주세요.',ox_disabled:'학습 서비스가 잠시 중지되었습니다.',unauthorized:'다시 로그인해주세요.'};
    async function persist(action,body) {
      pending=true;root.setAttribute('aria-busy','true');
      try{return await request(action,body);}finally{pending=false;root.removeAttribute('aria-busy');}
    }
    function showError(error){let node=root.querySelector('[data-ox-error]');if(!node){node=document.createElement('p');node.dataset.oxError='true';node.setAttribute('role','alert');main.prepend(node);}node.textContent=errorMessages[error.code] || '저장하지 못했습니다. 연결을 확인하고 다시 시도해주세요.';}
''' +runtime[end:]
runtime=re.sub(r'    const stats = id => .*?; };',"""    const stats = id => { const p=progress.get(id), last=p?{id,answer:p.answer,correct:p.correct}:null, wrong=p?.wrong_count || 0; let label=wrong?(last.correct?'다시 맞힘':wrong>=3?'반복 오답':'복습 필요'):'';if(wrong&&note(id).mastered)label='복습 완료';return {last,wrong,label,priority:({'반복 오답':1,'복습 필요':2,'다시 맞힘':3,'복습 완료':4}[label]||5)}; };""",runtime)
runtime=runtime.replace('solved/c.question_count*100','c.question_count ? solved/c.question_count*100 : 0').replace('const enough=solved>=Math.min(5,c.question_count)','const enough=c.question_count>0 && solved>=Math.min(5,c.question_count)')
runtime=runtime.replace('const today = attempts.filter(a => !a.seed).length;', 'const today = todayCount;')
runtime=runtime.replace("parseFromString(html,'text/html')","parseFromString(html || '','text/html')")
runtime=runtime.replace('    seedChapterCompletionPreview();','')
runtime=re.sub(r'function seedChapterCompletionPreview\(\) \{.*?\n\}', '',runtime,flags=re.S)
runtime=re.sub(r'// Reviewed presentation of the 10 derived questions.*?(?=function bookmarkedQuestions)',"function questionPresentation(q) { return {prompt:q.prompt,context:q.context}; }\n\n",runtime,flags=re.S)
runtime=re.sub(r'// Local design fixtures only\..*?(?=function quiz\()',"""function questionStatsMarkup(q) {
  const sample=statistics.get(q.id);
  const value=sample && sample.answered>=10?`${Math.round(sample.wrong/sample.answered*100)}%`:'집계 중';
  return `<div class="ox-question-stats"><div class="ox-question-stats-heading"><span>전체 수강생 오답률</span><strong>${value}</strong></div></div>`;
}

""",runtime,flags=re.S)
runtime=runtime.replace("root.addEventListener('click',e=>", "root.addEventListener('click',async e=>").replace('if(!b||b.disabled)return;', 'if(!b||b.disabled||pending)return;')
runtime=runtime.replace("    root.addEventListener('click'",'''    root.addEventListener('toggle',async event=>{
      const details=event.target,id=details.dataset?.questionDetail;
      if(!id || !details.open || details.dataset.loading)return;
      const q=byId.get(id);if(q.explanation_html)return;
      details.dataset.loading='true';
      try {
        const saved=await request('detail',{questionId:id,version:q.version});
        Object.assign(q,saved.question);updateNote(saved.note);
        const wrapper=document.createElement('div');wrapper.innerHTML=reviewItemMarkup({q,...stats(id)});
        if(details.isConnected)details.innerHTML=wrapper.querySelector('details').innerHTML;
      }catch(error){showError(error);}finally{delete details.dataset.loading;}
    },true);
    root.addEventListener('click' ''')
# The quote-preserving insertion above leaves an intentional space before the comma.
runtime=runtime.replace("const action=b.dataset.action,id=b.dataset.id;", "const action=b.dataset.action,id=b.dataset.id;\n      try {")
runtime=re.sub(r"else if\(action==='answer'\).*?(?=\n      else if\(action==='next')", """else if(action==='answer'){
        if(session.answers[session.index])return;
        const q=byId.get(session.ids[session.index]), answer=b.dataset.answer;
        session.submissions ||= {};
        session.submissions[session.index] ||= {id:crypto.randomUUID(),answer};
        const submission=session.submissions[session.index];
        const saved=await persist('submit',{questionId:q.id,version:q.version,answer:submission.answer,submissionId:submission.id});
        Object.assign(q,saved.question);progress.set(q.id,saved.progress);statistics.set(q.id,saved.statistics);updateNote(saved.note);
        const a={id:q.id,answer:submission.answer,correct:submission.answer===q.correct_answer};attempts.push(a);todayCount++;session.answers[session.index]=a;
      }""",runtime,flags=re.S)
runtime=runtime.replace("else if(action==='bookmark')note(id).bookmark=!note(id).bookmark;", "else if(action==='bookmark'){const saved=await persist('note',{questionId:id,version:byId.get(id).version,bookmark:!note(id).bookmark});updateNote(saved.note);}")
runtime=re.sub(r"else if\(action==='memo'\).*?(?=\n      else if)","else if(action==='memo'){const saved=await persist('note',{questionId:id,version:byId.get(id).version,memo:root.querySelector('#ox-memo').value});updateNote(saved.note);root.querySelector('#ox-message').textContent='메모를 저장했어요.';return;}",runtime)
runtime=runtime.replace("else if(action==='master')note(id).mastered=!note(id).mastered;", "else if(action==='master'){const saved=await persist('note',{questionId:id,version:byId.get(id).version,mastered:!note(id).mastered});updateNote(saved.note);}")
runtime=runtime.replace('      render();\n    });','      render();\n      } catch(error){showError(error);}\n    });')
runtime=runtime.replace("return { openBookmarks() { route='bookmarks'; render(); } };", "return { openBookmarks() { if(pending || route==='quiz')return; route='bookmarks'; render(); } };")
# Do not keep an unanswered session as a client-side source of truth after reload.
# Chapters resume from persisted unique progress; all records are server-owned.
assert 'function render(){' in runtime
runtime=runtime.replace('function render(){','function renderLoadedView(){',1)
runtime=runtime.replace('    function renderLoadedView(){',(root/'scripts/ox-question-loading-runtime.js').read_text(encoding='utf-8')+'\n    function renderLoadedView(){',1)
# Book entitlements are supplied for all three catalog labels; learning data is server-filtered.
runtime=runtime.replace("collection='criminal-law'", "collection=(data.collections.find(c=>c.accessible!==false)?.id || 'criminal-law')")
runtime=runtime.replace('function chapterView() {', "function chapterView() {\n  if(collections.get(collection)?.accessible===false){lockedBookView();return;}")
tabs_start=runtime.index('    <div class="ox-filters ox-subject-filters"')
tabs_end=runtime.index('    </div>',tabs_start)+len('    </div>')
runtime=runtime[:tabs_start]+'    ${bookTabs()}'+runtime[tabs_end:]
runtime=runtime.replace("    function showError(error){", "    function showError(error){if(blockBookAccess(error))return;")
runtime=runtime.replace("function renderLoadedView(){", "function renderLoadedView(){if(bookAccessBlocked){renderBlockedBooks();return;}")
runtime=runtime.replace("      if(action==='nav')", "      if(action==='refresh-books'){onAccessRefresh?.();return;}\n      if(bookAccessBlocked)return;\n      if(action==='nav')")
runtime=runtime.replace("if(pending || route==='quiz')return;", "if(bookAccessBlocked || pending || route==='quiz')return;")
runtime=runtime.replace('    function renderLoadedView(){',(root/'scripts/ox-book-access-runtime.js').read_text(encoding='utf-8')+'\n    function renderLoadedView(){',1)
markup='<div id="criminal-ox-preview"><header class="ox-header"></header><nav class="ox-nav" aria-label="OX 학습 메뉴"></nav><main class="ox-content"></main><footer class="ox-app-nav"></footer></div>'
output='// Generated by scripts/build-ox-learning.py. Edit the approved templates or generator.\nexport function mount(host, {bootstrap,request,onAccessRefresh}) {\n  host.innerHTML = '+repr(markup)+';\n'+runtime
assert 'exampleQuestionStats' not in output and 'add(\'criminal-law' not in output and 'seedChapterCompletionPreview' not in output
assert 'standaloneDerivedIds' not in output and 'original_prompt' not in output
(root/'criminal-law-ox.js').write_text(output,encoding='utf-8')
(root/'criminal-law-ox.css').write_text((root/'docs/criminal-law-ox-proposal/local-app-preview.css').read_text(encoding='utf-8').replace('/* Local OX only.', '/* Scoped OX learning styles.')+'\n'+(root/'scripts/ox-device-policy.css').read_text(encoding='utf-8'),encoding='utf-8')
print('Built criminal-law-ox.js without question-bank fixtures')
