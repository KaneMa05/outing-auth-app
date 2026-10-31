import {topicQuestions,elementQuestions,getTopicQuestions} from './interview-prep-prompts.js';
import {mountLife} from './interview-life-ui.js?v=20261024-school-status';
import {mountDraftWorkerStatus} from './interview-draft-worker-status.js?v=20261031';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const states={draft:'작성 중',submitted:'작성 완료',needs_revision:'보완 필요',approved:'강사 확인',no_experience:'소재 찾기',empty:'미작성'};
const kinds={experience:'경험형',value:'가치관형',situation:'인성 상황형'};
const templates={
  experience:[['situation','어떤 상황이었나요?'],['role','목표와 본인의 역할은 무엇이었나요?'],['action','본인이 직접 한 행동을 적어주세요.'],['result','실제 결과는 어땠나요?'],['learning','배운 점과 이후 바꾼 행동은 무엇인가요?']],
  value:[['position','본인의 생각·지원 계기를 적어주세요.'],['reason','그렇게 생각하는 이유와 근거는 무엇인가요?'],['application','실제 준비 노력 또는 직무에서 실천할 방법을 적어주세요.']],
  situation:[['criteria','판단할 때 가장 먼저 고려할 기준은 무엇인가요?'],['steps','어떤 순서로 행동하겠습니까?'],['caution','주의할 점과 그 이유는 무엇인가요?']],
};
const errors={unauthorized:'로그인이 만료되었습니다. 다시 로그인해주세요.',not_enrolled:'면접반 이용 등록 또는 이용 기간을 확인해주세요.',
  review_note_required:'학생이 확인할 보완 사유를 입력해주세요.',
  revision_conflict:'다른 기기 또는 관리자가 내용을 수정했습니다. 입력 내용을 복사해 보관한 후 최신 내용을 불러오세요.',
  topic_changed:'준비 항목이 변경되었습니다. 입력 내용을 보관한 뒤 최신 항목을 불러오세요.',
  topic_in_use:'학생이 작성 중인 항목의 양식은 바꿀 수 없습니다. 새 항목을 추가하세요.',
  incomplete_note:'모든 항목에 10자 이상 입력해주세요. 글자 수는 내용 품질을 보장하지 않으며 강사가 별도로 확인합니다.',
  help_reason_required:'어떤 부분이 막히는지 5자 이상 적어주세요.',not_submitted:'학생이 작성 완료로 제출한 내용만 확인 완료할 수 있습니다.',
  forbidden:'이 작업을 수행할 권한이 없습니다.',student_unavailable:'사용 가능한 수강생을 찾을 수 없습니다.',
  invalid_topic:'연결할 항목은 사용 중인 인성 준비 항목으로 선택하거나 선택을 해제해주세요.',invalid_request:'입력 항목을 확인해주세요.',
  interview_unavailable:'면접 준비 기능에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.'};
const message = e=>errors[e.code] || errors[e.message] || '처리하지 못했습니다. 입력 내용을 유지하고 다시 시도해주세요.';
const btn=(label,action,extra='',primary=false)=>`<button type="button" class="ip-btn${primary?' ip-primary':''}" data-ip="${action}" ${extra}>${label}</button>`;
const badge=n=>`<span class="ip-badge ${esc(n?.status||'')}">${states[n?.status]||states.empty}</span>`;
const options=(rows,value)=>rows.map(([id,title])=>`<option value="${esc(id)}" ${id===value?'selected':''}>${esc(title)}</option>`).join('');
const tracks=['공채','항해','기관','방제','관제','기타'];
const analysisDispositions={personal:'학생 인성 소재 연결 후보',knowledge_review:'직무·시사 재분류 검토',context_needed:'앞선 문맥 확인',rapport:'안부·진행 질문',sensitive_review:'개인정보 수집 범위 검토',unresolved:'요소 판정 보류'};
const analysisForms={experience:'실제 경험',value:'가치·이유',situation:'가정 상황',profile:'자기 설명',mixed:'복합 질문',context:'문맥 필요'};
const analysisStates={draft:'검토 대기',reviewed:'관리자 검토 완료',missing:'분석 없음',stale:'질문 변경·재분석 필요'};
function notify(host,text,error=false){const n=host.querySelector('[data-message]');if(n){n.textContent=text;n.dataset.error=String(error);}}
function topicApplicable(t,track){return t.active && (!t.tracks.length || t.tracks.includes(track));}

export async function mountStudent(host,{request,enableJob=true,notesTitle,embedded=false,initialTopic='',simpleEditor=false}) {
  host.className='ip-root'+(embedded?' ip-embedded-note':'');
  let life=null;
  let data,topicId='',category='personality',personalityView='notes',questionSearch='',dirty=false,blocked=false,timer=null,saving=null,destroyed=false,editVersion=0,questionPage=0;
  const categoryTabs=()=>enableJob&&!embedded?`<nav class="ip-tabs ip-category-tabs" aria-label="면접 상위 카테고리">${[['personality','인성'],['job','직무']].map(([id,label])=>btn(label,'category',`data-category="${id}" ${id===category?'aria-current="page"':''}`)).join('')}</nav>`:'';
  const personalityTabs=()=>embedded?'':`<nav class="ip-tabs" aria-label="인성 준비">${[['notes',notesTitle||'나의 준비 노트'],['life','인생그래프·경험 DB'],['core','핵심인성 30제']].map(([id,label])=>btn(esc(label),'personality-view',`data-view="${id}" ${id===personalityView?'aria-current="page"':''}`)).join('')}</nav>`;
  const beforeUnload=e=>{if(dirty){e.preventDefault();e.returnValue='';}};
  window.addEventListener('beforeunload',beforeUnload);
  const topic=()=>data.topics.find(t=>t.id===topicId);
  const note=()=>data.notes.find(n=>n.topic_id===topicId);
  const fields=()=>({...simpleEditor?note()?.fields||{}:{},...Object.fromEntries([...host.querySelectorAll('[data-note-field]')].map(n=>[n.name,n.value]))});
  function setSave(text){const n=host.querySelector('[data-save]');if(n)n.textContent=text;}
  async function save(status='draft'){
    clearTimeout(timer);
    if(saving){await saving;if(blocked)return false;}
    if(!dirty && status==='draft')return !blocked;
    if(blocked || destroyed)return false;
    const currentTopic=topicId,version=editVersion,payload=fields();
    saving=(async()=>{
      setSave('저장 중…');
      try {
        const result=await request('note_save',{topicId:currentTopic,topicRevision:topic().revision,revision:note()?.revision||0,fields:payload,status});
        if(destroyed)return false;
        data.notes=data.notes.filter(n=>n.topic_id!==currentTopic).concat(result.note);
        dirty=version!==editVersion;
        setSave(dirty?'변경 내용 저장 대기':'서버에 저장됨');
        notify(host,status==='submitted'?(simpleEditor?'저장했습니다.':'작성 완료로 제출했습니다. 강사 확인을 기다려주세요.'):status==='no_experience'?'소재 찾기 도움을 요청했습니다.':'');
        updateSummary();
        if(dirty)timer=setTimeout(()=>save(),1000);
        return true;
      }catch(e){if(['revision_conflict','topic_changed','unauthorized','not_enrolled'].includes(e.code))blocked=true;setSave('저장되지 않음');notify(host,simpleEditor&&['revision_conflict','topic_changed'].includes(e.code)?'다른 곳에서 내용이 변경되었습니다. 현재 입력을 복사해 보관한 후 페이지를 새로고침해주세요.':message(e),true);return false;}
      finally{saving=null;}
    })();
    return saving;
  }
  function updateSummary(){
    const required=data.topics.filter(t=>t.required),complete=required.filter(t=>data.notes.some(n=>n.topic_id===t.id && n.topic_revision===t.revision && ['submitted','approved'].includes(n.status))).length;
    const approved=required.filter(t=>data.notes.some(n=>n.topic_id===t.id && n.topic_revision===t.revision && n.status==='approved')).length;
    host.querySelector('[data-summary]').innerHTML=`<span><strong>${complete}/${required.length}</strong>필수 작성</span><span><strong>${approved}</strong>강사 확인</span><span><strong>${required.length-complete}</strong>준비 필요</span>`;
    host.querySelector('progress').value=complete;host.querySelector('progress').max=required.length||1;
    const activeStatus=host.querySelector('[data-note-status]');if(activeStatus)activeStatus.innerHTML=badge(note());
    host.querySelector('[data-topic-list]').innerHTML=data.topics.map(t=>{const n=data.notes.find(n=>n.topic_id===t.id),stale=n&&n.topic_revision!==t.revision;
      return `<button class="ip-topic" data-ip="topic" data-id="${esc(t.id)}" ${t.id===topicId?'aria-current="true"':''}><span>${esc(t.title)}<small>${t.required?'필수':'선택'} · ${kinds[t.kind]}</small></span>${stale?'<span class="ip-badge needs_revision">항목 변경</span>':badge(n)}</button>`;}).join('');
  }
  function render(){
    life?.destroy();life=null;
    if(category==='personality'&&personalityView==='life'){
      host.innerHTML=`${categoryTabs()}${personalityTabs()}<section data-life-host></section>`;
      life=mountLife(host.querySelector('[data-life-host]'),{request});return;
    }
    if(category==='personality'&&personalityView==='core'){
      host.innerHTML=`${categoryTabs()}${personalityTabs()}<div class="ip-hero"><h2>핵심인성 30제</h2><p>질문을 읽고, 본인의 경험과 생각에서 답변 근거를 찾아보세요.</p></div>
      <p class="ip-help">교재 제목은 ‘핵심인성 30제’이며 본문은 핵심 주제 25개와 추가 상황형 22개입니다. 관리자가 공개한 질문만 표시됩니다.</p>
      <p class="ip-message" data-message role="status"></p><section class="ip-panel"><form data-job-search class="ip-toolbar"><label>핵심 질문 검색<input name="questionSearch" maxlength="200" value="${esc(questionSearch)}"></label><button class="ip-btn ip-primary">검색</button></form><div data-questions></div><div class="ip-toolbar">${btn('이전','qprev')}${btn('다음','qnext')}</div></section>`;
      loadQuestions();return;
    }
    if(category==='job'){
      host.innerHTML=`${categoryTabs()}<div class="ip-hero"><div class="ip-eyebrow">JOB INTERVIEW</div><h2>직무 기출문제</h2><p>${esc(data.member.track)} 직렬의 공개된 직무 질문을 확인하세요.</p></div>
      <p class="ip-help">직무는 기출 학습 영역입니다. 개인 경험 입력과 필수 작성률은 인성 영역에서 관리합니다.</p>
      <p class="ip-message" data-message role="status"></p><section class="ip-panel"><form data-job-search class="ip-toolbar"><label>직무 질문 검색<input name="questionSearch" maxlength="200" value="${esc(questionSearch)}"></label><button class="ip-btn ip-primary">검색</button></form>
      <div data-questions></div><div class="ip-toolbar">${btn('이전','qprev')}${btn('다음','qnext')}</div></section>`;
      loadQuestions();return;
    }
    const t=topic(),n=note();
    host.innerHTML=`${categoryTabs()}${personalityTabs()}<div class="ip-hero"><div class="ip-eyebrow">PERSONAL INTERVIEW NOTE</div><h2>${esc(notesTitle||'나의 인성 준비 노트')}</h2><p>${esc(data.member.track)} · 실제 경험과 생각을 하나씩 준비하세요.</p><progress aria-label="인성 필수 항목 작성 현황" value="0" max="1"></progress><div class="ip-summary" data-summary></div></div>
      <p class="ip-message" role="status" data-message></p><div class="ip-layout"><details class="ip-topic-picker" ${matchMedia('(min-width:721px)').matches?'open':''}><summary>준비 항목 선택 · ${esc(t?.title||'전체')}</summary><aside class="ip-topics" data-topic-list></aside></details>
      <section class="ip-panel" data-note-panel>${t?`<div class="ip-row"><h3>${esc(t.title)}</h3><span data-note-status>${badge(n)}</span></div><p>${esc(topicQuestions[t.id]?.kind===t.kind?topicQuestions[t.id].opening:t.guidance)}</p>
      <details class="ip-element-prompts"><summary>이 경험에서 더 살펴볼 질문</summary><p class="ip-help">같은 경험을 아래 관점으로 보완해 작성하세요. 모든 질문에 별도의 경험을 만들 필요는 없습니다.</p>${elementQuestions.filter(e=>e[0]===t.id).map(e=>`<div class="ip-question" data-element-prompt="${esc(e[1])}"><strong>${esc(e[2])}</strong><p>${esc(e[3])}</p></div>`).join('')}</details>
      <p class="ip-help">${simpleEditor?'입력 내용은 자동으로 임시저장됩니다. 각 칸을 10자 이상 작성한 뒤 저장해주세요.':'입력 후 자동 저장됩니다. 각 칸 10자 이상 작성하면 제출할 수 있으며 내용의 충실도는 강사가 확인합니다.'}</p>
      ${n?.feedback?`<div class="ip-feedback"><strong>강사 피드백</strong><br>${esc(n.feedback)}</div>`:''}
      <label>다른 항목의 소재 가져오기<select data-copy><option value="">직접 작성하기</option>${options(data.topics.filter(x=>x.id!==t.id&&x.kind===t.kind&&data.notes.some(y=>y.topic_id===x.id)).map(x=>[x.id,x.title]),'')}</select></label>
      <form data-note-form>${getTopicQuestions(t,templates).map(([key,label])=>`<label>${label}<textarea data-note-field name="${key}" maxlength="3000">${esc(n?.fields?.[key]||'')}</textarea></label>`).join('')}
      ${simpleEditor?'':`<details ${n?.status==='no_experience'?'open':''}><summary>소재가 떠오르지 않거나 도움이 필요해요</summary><p class="ip-help">학교·아르바이트·군 복무·동아리에서의 작은 경험도 괜찮습니다. 없는 경험을 만들지 마세요.</p><label>어떤 부분이 막히나요?<textarea data-note-field name="help" maxlength="1500">${esc(n?.fields?.help||'')}</textarea></label>${btn('소재 찾기 도움 요청','help')}</details>`}
      <div class="ip-toolbar">${btn('임시저장','save')}${btn(simpleEditor?'저장':'작성 완료·첨삭 요청','submit','',true)}${simpleEditor?'':btn('수정 이력','history')+btn('최신 내용 불러오기','reload')}</div><span class="ip-save" data-save>서버에 저장된 내용</span></form>
      ${simpleEditor?'':`<details open><summary>관련 기출 질문</summary><p class="ip-help">관리자가 검토하여 공개한 질문만 표시됩니다.</p><div data-questions></div><div class="ip-toolbar">${btn('이전','qprev')}${btn('다음','qnext')}</div></details><div data-history></div>`}`:'<p>등록된 준비 항목이 없습니다.</p>'}</section></div>`;
    updateSummary();if(!simpleEditor)loadQuestions();
  }
  async function loadQuestions(){
    if(category==='personality'&&personalityView==='notes'&&!topic())return;
    const id=topicId,group=category,view=personalityView,page=questionPage,box=host.querySelector('[data-questions]');box.textContent='질문을 불러오는 중…';
    const core=group==='personality'&&view==='core';
    try{const result=await request(core?'core_questions':'questions',{category:group,topicId:group==='personality'&&!core?id:'',search:group==='job'||core?questionSearch:'',page});if(destroyed||group!==category||view!==personalityView||id!==topicId||page!==questionPage)return;
      box.innerHTML=result.questions.map(q=>`<div class="ip-question">${core?`<small>${q.kind==='main'?'핵심 주제':'추가 상황형'} ${q.position}</small>`:''}<p>${esc(q.prompt)}</p>${core?q.topic_ids.filter(id=>data.topics.some(t=>t.id===id)).map(id=>btn(data.topics.find(t=>t.id===id).title+' 준비하기','core-note',`data-topic="${esc(id)}"`)).join(''):''}<button class="ip-link" data-ip="source" data-id="${esc(q.id)}">출처 ${q.source_count}건 보기</button><div data-source="${esc(q.id)}"></div></div>`).join('')||'<p class="ip-empty">공개된 관련 질문이 없습니다.</p>';
      host.querySelector('[data-ip=qprev]').disabled=page===0;host.querySelector('[data-ip=qnext]').disabled=result.questions.length<30;
    }catch(e){box.textContent=message(e);}
  }
  host.oninput=e=>{if(e.target.matches('[data-note-field]')){dirty=true;editVersion++;setSave('변경 내용 저장 대기');clearTimeout(timer);if(!blocked)timer=setTimeout(()=>save(),1200);}};
  host.onchange=e=>{if(e.target.matches('[data-copy]')&&e.target.value){if(!confirm('현재 입력 내용을 선택한 항목의 소재로 바꿀까요?'))return;
    const source=data.notes.find(n=>n.topic_id===e.target.value);for(const n of host.querySelectorAll('[data-note-field]'))n.value=source?.fields[n.name]||'';
    dirty=true;editVersion++;save();}};
  host.onsubmit=e=>{e.preventDefault();if(e.target.matches('[data-job-search]')){questionSearch=new FormData(e.target).get('questionSearch');questionPage=0;loadQuestions();}};
  host.onclick=async e=>{
    const target=e.target.closest('[data-ip]');if(!target||target.disabled)return;
    const action=target.dataset.ip;
    target.disabled=true;
    try{
      if(['category','personality-view'].includes(action)&&life&&!life.canLeave())return;
      if(action==='category'){if(!enableJob&&target.dataset.category==='job')return;if(!(await save()))return;category=target.dataset.category;questionPage=0;render();}
      else if(action==='personality-view'){if(!(await save()))return;personalityView=target.dataset.view;questionSearch='';questionPage=0;render();}
      else if(action==='core-note'){personalityView='notes';topicId=target.dataset.topic;questionPage=0;render();}
      else if(action==='topic'){if(!(await save()))return;topicId=target.dataset.id;questionPage=0;render();}
      else if(action==='save')await save();
      else if(action==='submit'||action==='help')await save(action==='submit'?'submitted':'no_experience');
      else if(action==='reload'){if(dirty&&!confirm('저장되지 않은 입력을 버리고 최신 내용을 불러올까요?'))return;clearTimeout(timer);if(saving)await saving;data=await request('bootstrap');dirty=false;blocked=false;render();}
      else if(action==='qprev'||action==='qnext'){questionPage+=action==='qnext'?1:-1;await loadQuestions();}
      else if(action==='source'){const r=await request('question_detail',{id:target.dataset.id});host.querySelector(`[data-source="${target.dataset.id}"]`).textContent=r.sources.map(s=>`${s.year||'연도 미상'} · ${s.track} · ${s.region} · Q${s.number} · ${s.filename}`).join('\n');}
      else if(action==='history'){const r=await request('history',{topicId});host.querySelector('[data-history]').innerHTML='<h3>최근 수정 이력</h3>'+r.history.map(h=>`<div class="ip-history"><strong>${esc(new Date(h.created_at).toLocaleString('ko-KR'))} · ${states[h.snapshot.status]}</strong><p>${esc(Object.values(h.snapshot.fields||{}).filter(Boolean).join('\n'))}</p>${esc(h.snapshot.feedback)}</div>`).join('');}
    }catch(e){notify(host,message(e),true);}finally{target.disabled=false;}
  };
  try{data=await request('bootstrap');topicId=data.topics.some(t=>t.id===initialTopic)?initialTopic:data.topics[0]?.id||'';render();}
  catch(e){host.innerHTML=`<section class="ip-panel"><h2>면접 준비 노트</h2><p role="alert">${esc(message(e))}</p>${btn('다시 시도','retry')}</section>`;host.querySelector('button').onclick=()=>location.reload();}
  return {async savePending(){
    if(life)return life.savePending();
    do {if(!(await save()))throw Error('save_failed');} while(dirty&&!destroyed);
    if(destroyed)throw Error('save_failed');
  },destroy(){destroyed=true;life?.destroy();clearTimeout(timer);window.removeEventListener('beforeunload',beforeUnload);host.oninput=null;host.onclick=null;host.onchange=null;},canLeave:()=>life?life.canLeave():!dirty||confirm('아직 저장되지 않은 내용이 있습니다. 이 화면을 나갈까요?')};
}

export async function mountAdmin(host,{request,canWrite=true,initialSection,onSection}) {
  host.className='ip-root';
  let life=null;
  let catalog,analysisCatalog,category='personality',tab='questions',page=0,filter={},list=[],busy=false,selected=null,destroyed=false,loadVersion=0,dirty=false;
  const questionAudio={},questionAudioLoading={};
  async function loadQuestionAudio(audioCategory){
    if(!['job','personality'].includes(audioCategory))return;
    if(questionAudio[audioCategory])return;
    if(!questionAudioLoading[audioCategory])questionAudioLoading[audioCategory]=(async()=>{
      try{
        const response=await fetch(`./assets/interview-${audioCategory}-audio/catalog.json`,{cache:'no-cache'});
        if(!response.ok)throw Error('audio_catalog_unavailable');
        const data=await response.json();
        if(data.version!==1||!Array.isArray(data.clips))throw Error('invalid_audio_catalog');
        questionAudio[audioCategory]=new Map(data.clips.filter(q=>/^q-[a-f0-9]+$/.test(q.id)&&new RegExp('^'+q.id+'-[a-f0-9]{16}\\.mp3$').test(q.file)).map(q=>[q.id,q]));
      }catch{questionAudio[audioCategory]=null;}
      finally{questionAudioLoading[audioCategory]=null;}
    })();
    await questionAudioLoading[audioCategory];
  }
  function questionAudioMarkup(q){
    if(!['job','personality'].includes(q.category))return '';
    const audio=questionAudio[q.category],clip=audio?.get(q.id);
    if(!audio)return '<p class="ip-help" role="status">질문 음성 목록을 불러오지 못했습니다. 다시 검색하거나 질문을 열어 재시도해주세요.</p>';
    if(!clip)return '<p class="ip-help">질문 음성 미연결</p>';
    if(clip.prompt!==q.prompt)return '<p class="ip-help">질문이 변경되어 음성 재연결이 필요합니다.</p>';
    return `<div data-linked-question-audio><p class="ip-help">질문 음성 연결됨</p><audio data-question-audio controls preload="none" aria-label="질문 읽기 음성" src="./assets/interview-${esc(q.category)}-audio/${esc(clip.file)}"></audio><details><summary>음성 대본</summary><p>${esc(clip.spokenPrompt)}</p></details><p data-audio-status role="status"></p></div>`;
  }
  function questionTitle(q){
    const clip=questionAudio[q.category]?.get(q.id);
    return clip?.prompt===q.prompt&&clip.spokenPrompt?clip.spokenPrompt:q.prompt;
  }
  function questionOriginal(q){
    return questionTitle(q)!==q.prompt?`<details><summary>기출 원문</summary><p>${esc(q.prompt)}</p></details>`:'';
  }
  function bindQuestionAudio(){
    host.querySelectorAll('audio[data-question-audio]').forEach(audio=>{
      audio.onplay=()=>host.querySelectorAll('audio[data-question-audio]').forEach(other=>{if(other!==audio)other.pause();});
      audio.onerror=()=>{audio.parentElement.querySelector('[data-audio-status]').textContent='질문 음성 파일을 재생하지 못했습니다. 파일 연결을 확인해주세요.';};
    });
  }
  function stopQuestionAudio(){host.querySelectorAll('audio[data-question-audio]').forEach(audio=>audio.pause());}
  const validSections=['home','applications','preassignments','review','members','topics','core','questions','analysis','job','rubrics','live'];
  function setSection(section){
    category=['job','rubrics'].includes(section)?'job':'personality';
    tab=section==='home'?'dashboard':section==='job'?'questions':section;
    page=0;filter={};dirty=false;
  }
  if(validSections.includes(initialSection))setSection(initialSection);
  const beforeUnload=e=>{if(dirty){e.preventDefault();e.returnValue='';}};
  window.addEventListener('beforeunload',beforeUnload);
  const canLeave=()=>{if(life&&!life.canLeave())return false;if(!dirty)return true;if(!confirm('저장하지 않은 관리자 입력이 있습니다. 이동할까요?'))return false;dirty=false;return true;};
  async function openSection(section){
    if(destroyed||!validSections.includes(section))return;
    setSection(section);
    try{await refresh();}catch(e){notify(host,message(e),true);}
  }
  const checks=(name,rows,values)=>`<div class="ip-checks">${rows.map(([id,label])=>`<label><input type="checkbox" name="${name}" value="${esc(id)}" ${values.includes(id)?'checked':''}> ${esc(label)}</label>`).join('')}</div>`;
  const topicChecks=values=>checks('topicIds',catalog.topics.filter(t=>t.active).map(t=>[t.id,t.title]),values);
  const trackChecks=values=>checks('tracks',tracks.map(t=>[t,t]),values);
  const publicationLabels={draft:'승인 대기',published:'공개 승인 완료',archived:'보관'};
  const approvalButton=q=>btn(q.status==='published'?'승인 취소':'공개 승인','question-approval',
    `data-id="${esc(q.id)}" data-revision="${esc(q.revision)}" data-approved="${q.status!=='published'}" aria-pressed="${q.status==='published'}" data-write ${canWrite&&q.status!=='archived'?'':'disabled'}`,q.status!=='published');
  const approvalBadge=q=>`<span class="ip-badge ${q.status==='published'?'approved':''}" data-question-approval="${esc(q.status)}">${publicationLabels[q.status]}</span>`;
  const applicationSummary=summary=>[['students','수강생 수'],['pending','신청 대기'],['approved','승인 완료'],['rejected','반려']]
    .map(([key,label])=>`<span><strong>${Number.isSafeInteger(summary?.[key])?summary[key].toLocaleString('ko-KR'):'—'}</strong>${label}</span>`).join('');
  function shell(){
    stopQuestionAudio();
    life?.destroy();life=null;
    const counts=catalog.categoryCounts?.[category]||{total:0,draft:0,published:0};
    host.innerHTML=`<nav class="ip-tabs ip-category-tabs" aria-label="면접 상위 카테고리">${[['personality','인성'],['job','직무']].map(([key,label])=>btn(label,'category',`data-category="${key}" ${key===category?'aria-current="page"':''}`)).join('')}</nav>
    ${tab==='applications'?`<div class="ip-hero"><div class="ip-eyebrow">ENROLLMENT MANAGEMENT</div><h2>수강 신청·승인 현황</h2><p>면접반 수강생과 신청 현황을 확인하고, 수강 신청을 검토·승인하세요.</p><div class="ip-summary" data-application-summary role="status" aria-label="전체 수강 신청 현황">${applicationSummary()}</div><p class="ip-help">수강생 수는 이용 중지·기간 만료를 제외한 현재 이용 가능한 등록 학생 수입니다.</p></div>`:`<div class="ip-hero"><div class="ip-eyebrow">INTERVIEW MANAGEMENT</div><h2>${tab==='dashboard'?'면접반 홈':category==='personality'?'인성 준비 관리':'직무 기출 관리'}</h2><p>${category==='personality'?'인성 기출과 학생 개인 경험·가치관을 관리합니다.':'직무 기출을 별도로 관리합니다. 학생 개인 준비 노트와 작성률에는 포함하지 않습니다.'}</p><div class="ip-summary"><span><strong>${counts.total}</strong>질문</span><span><strong>${counts.draft}</strong>승인 대기</span><span><strong>${counts.published}</strong>공개 승인</span></div></div>
    <div class="ip-row"><p>학생 이용: <strong>${catalog.enabled?'등록 학생에게 개방':'준비 중'}</strong></p>${btn(catalog.enabled?'이용 중지':'등록 학생에게 개방','enabled',canWrite?'':'disabled')}</div>`}
    <div class="ip-tabs">${(category==='personality'?[['dashboard','면접반 홈'],['applications','수강 신청·승인'],['review','피드백 관리'],['questions','인성 기출'],['core','핵심인성 30제'],['analysis','질문 요소 분석'],['topics','인성 준비 항목'],['members','학생별 인성 준비 현황']]:[['questions','직무 기출']]).map(([key,label])=>btn(label,'tab',`data-tab="${key}" ${key===tab?'aria-current="page"':''}`)).join('')}</div>
    <p class="ip-message" data-message role="status"></p><div data-content></div><section class="ip-panel" data-editor hidden></section>`;
    host.querySelector('.ip-tabs:not(.ip-category-tabs)').insertAdjacentHTML('beforeend',btn('과제 관리','tab',`data-tab="preassignments" ${tab==='preassignments'?'aria-current="page"':''}`));
    if(tab==='dashboard'){
      host.querySelector('.ip-hero h2').textContent='면접반 운영 현황';
      host.querySelector('.ip-hero>p').textContent='수강 신청과 학생 작성 현황을 확인하고 필요한 업무로 이동하세요.';
      const summary=host.querySelector('.ip-hero .ip-summary');
      summary.dataset.dashboardSummary='';
      summary.setAttribute('role','status');
      summary.textContent='운영 현황을 불러오는 중…';
      host.querySelector('[data-content]').insertAdjacentHTML('beforebegin','<section class="ip-panel" data-draft-worker-status></section>');
      life=mountDraftWorkerStatus(host.querySelector('[data-draft-worker-status]'),{request});
    }
    if(tab==='preassignments'){
      host.querySelector('.ip-hero h2').textContent='과제 관리';
      host.querySelector('.ip-hero>p').textContent='핵심 25제, 기본이력, 인생그래프, 자기소개, 지원동기, 공직관의 작성 내용과 상태를 확인합니다.';
      host.querySelector('.ip-hero .ip-summary').remove();
      host.querySelector('[data-ip=enabled]').closest('.ip-row').remove();
    }
    host.querySelector('.ip-tabs:not(.ip-category-tabs)').insertAdjacentHTML('beforeend',btn('분류·채점 기준','tab',`data-tab="rubrics" ${tab==='rubrics'?'aria-current="page"':''}`));
    host.querySelector('.ip-tabs:not(.ip-category-tabs)').insertAdjacentHTML('beforeend',btn('음성 모의면접 기록','tab',`data-tab="live" ${tab==='live'?'aria-current="page"':''}`));
    if(tab==='review'){
      host.querySelector('.ip-hero h2').textContent='피드백 관리';
      host.querySelector('.ip-hero>p').textContent='모든 면접반 수강생의 저장된 자료를 학생별로 확인합니다.';
      host.querySelector('.ip-hero .ip-summary').remove();
      host.querySelector('[data-ip=enabled]').closest('.ip-row').remove();
    }
    if(tab==='rubrics'){
      host.querySelector('.ip-hero h2').textContent='질문 분류·채점 기준';
      host.querySelector('.ip-hero>p').textContent='전공 질문과 재분류 대상의 출처를 확인하고 시험 채점 기준을 검토합니다.';
      host.querySelector('.ip-hero .ip-summary').remove();
      host.querySelector('[data-ip=enabled]').closest('.ip-row').remove();
    }
    if(tab==='live'){
      host.querySelector('.ip-hero h2').textContent='음성 모의면접 기록';
      host.querySelector('.ip-hero>p').textContent='학생별 최초 답변과 꼬리 질문 답변, 저장된 음성을 확인합니다.';
      host.querySelector('.ip-hero .ip-summary').remove();
      host.querySelector('[data-ip=enabled]').closest('.ip-row').remove();
    }
  }
  const editor=(html,row=null)=>{
    stopQuestionAudio();
    life?.destroy();life=null;dirty=false;
    const n=host.querySelector('[data-editor]');
    (row||host).append(n);n.hidden=false;n.innerHTML=html;
    if(!row)n.scrollIntoView({block:'nearest',behavior:'smooth'});
    if(!canWrite)n.querySelectorAll('input,textarea,select,[data-write]').forEach(x=>x.disabled=true);
  };
  const formValue=(form,key)=>new FormData(form).get(key);
  async function load(){
    stopQuestionAudio();
    const version=++loadVersion;
    const box=host.querySelector('[data-content]');
    const inlineEditor=box.querySelector('[data-editor]');
    if(inlineEditor){inlineEditor.hidden=true;host.append(inlineEditor);}
    box.textContent='불러오는 중…';
    if(tab==='preassignments'){
      const {mountAssignmentManagement}=await import('./interview-assignment-management.js?v=20261027-overview-modal');
      if(destroyed||version!==loadVersion)return;
      const next=mountAssignmentManagement(box,{request,templates,canWrite});
      await next.ready;
      if(destroyed||version!==loadVersion)next.destroy();else life=next;
      return;
    }
    if(tab==='live'){
      const {mountLiveHistory}=await import('./interview-live-ui.js?v=20261021-live-vercel');
      if(destroyed||version!==loadVersion)return;
      life=await mountLiveHistory(box,{admin:true});return;
    }
    if(tab==='review'){
      const {mountReview}=await import('./interview-review-ui.js?v=20261027-overview-modal');
      if(destroyed||version!==loadVersion)return;
      life=mountReview(box,{request,templates,canWrite});
      await life.ready;
      return;
    }
    if(tab==='dashboard'){
      const summary=host.querySelector('[data-dashboard-summary]');
      const number=value=>Number.isSafeInteger(value)?value.toLocaleString('ko-KR'):'—';
      const metric=(value,label,section)=>btn(`<strong>${number(value)}</strong> ${label}`,'section',`data-section="${section}"`);
      const results=await Promise.allSettled([
        request('admin_applications',{status:'pending',page:0}),
        request('admin_review_students',{search:'',track:'',status:'',page:0})
      ]);
      if(destroyed||version!==loadVersion)return;
      const enrollment=results[0].status==='fulfilled'?results[0].value.summary:null;
      const review=results[1].status==='fulfilled'?results[1].value:null;
      summary.innerHTML=metric(enrollment?.students,'명 이용 가능','members')+metric(enrollment?.pending,'건 신청 대기','applications')+metric(review?.pendingStudents,'명 확인 대기','review')+metric(review?.revisionStudents,'명 보완·도움 요청','review');
      box.innerHTML=`<section class="ip-panel"><div class="ip-row"><h3>우선 확인할 업무</h3>${btn('현황 새로고침','section','data-section="home"')}</div>
      <p class="ip-help">이용 가능 수강생은 이용 중지·기간 만료를 제외합니다. 확인 대기와 보완·도움 요청은 전체 등록 학생의 저장 기록 기준이며, 같은 학생이 두 항목에 포함될 수 있습니다.</p>
      ${!enrollment||!review?'<p role="alert">일부 현황을 불러오지 못했습니다. —는 집계 불가를 의미합니다. 새로고침하거나 해당 관리 화면에서 확인하세요.</p>':''}
      <div class="ip-toolbar">${btn('수강 신청·승인','section','data-section="applications"',true)}${btn('피드백 관리','section','data-section="review"')}${btn('과제 관리','section','data-section="preassignments"')}${btn('학생 등록·첨삭','section','data-section="members"')}</div></section>
      <section class="ip-panel"><h3>기출 질문 현황</h3><p class="ip-help">질문 자료의 공개 상태이며 학생 수·제출물 수와 별도로 집계합니다.</p>
      ${[['personality','인성 기출','questions'],['job','직무 기출','job']].map(([key,label,section])=>{const c=catalog.categoryCounts?.[key];return `<div class="ip-question"><div class="ip-row"><strong>${label}</strong>${btn('관리 열기','section',`data-section="${section}"`)}</div><p>전체 ${number(c?.total)}개 · 승인 대기 ${number(c?.draft)}개 · 공개 승인 ${number(c?.published)}개</p></div>`;}).join('')}
      <div class="ip-toolbar">${btn('핵심인성 30제','section','data-section="core"')}${btn('질문 요소 분석','section','data-section="analysis"')}</div></section>`;
      return;
    }
    if(tab==='applications'){
      const summary=host.querySelector('[data-application-summary]');
      summary.innerHTML=applicationSummary();
      const r=await request('admin_applications',{...filter,status:filter.status??'pending',page});
      if(destroyed||version!==loadVersion)return;
      summary.innerHTML=applicationSummary(r.summary);
      if(!r.summary)notify(host,'전체 현황을 불러오지 못했습니다. 신청 목록은 아래에서 확인할 수 있습니다.',true);
      list=r.applications;
      const labels={pending:'승인 대기',approved:'승인 완료',rejected:'반려'};
      box.innerHTML=`<section class="ip-panel"><h3>면접반 수강 신청</h3><p>실제 수강 등록을 확인한 뒤 승인하세요. 신규 학생은 면접반 전용 계정으로 등록되고, 기존 학생은 원래 계정에 이용 권한이 추가됩니다.</p></section>
      <form data-filter class="ip-toolbar"><label>이름·수험번호 검색<input name="search" maxlength="200" value="${esc(filter.search||'')}"></label><label>상태<select name="status">${options([['pending','승인 대기'],['approved','승인 완료'],['rejected','반려'],['','전체']],filter.status??'pending')}</select></label><button class="ip-btn ip-primary">검색</button></form>
      <section class="ip-panel">${list.map(a=>`<article class="ip-question"><div class="ip-row"><strong>${esc(a.name)} · ${esc(a.track)}</strong><span>${labels[a.status]}</span></div><p>수험번호 ${esc(a.exam_number)} · ${a.legacy_student_id?'기존 학생 '+esc(a.legacy_student_id):'신규 면접반 전용 계정'}<br><small>신청 ${esc(new Date(a.created_at).toLocaleString('ko-KR'))}</small></p>${a.review_note?`<p>${esc(a.review_note)}</p>`:''}${a.status==='pending'?btn('신청 검토','application-edit',`data-id="${esc(a.id)}"`)+btn('반려','application-reject',`data-id="${esc(a.id)}" ${canWrite?'':'disabled'}`):''}</article>`).join('')||'<p class="ip-empty">신청 내역이 없습니다.</p>'}</section>
      <div class="ip-toolbar">${btn('이전','prev',page===0?'disabled':'')}<span>${page+1} 페이지</span>${btn('다음','next',list.length<30?'disabled':'')}</div>`;
      return;
    }
    if(tab==='rubrics'){
      const {mountRubrics}=await import('./interview-rubric-ui.js?v=20261030-question-approval');
      if(destroyed||version!==loadVersion)return;
      life=mountRubrics(box,{request,canWrite});await life.ready;return;
    }
    if(tab==='analysis'){await loadAnalysis(box,version);return;}
    if(tab==='core'){await loadCore(box,version);return;}
    if(tab==='topics'){
      box.innerHTML=`<div class="ip-toolbar">${btn('준비 항목 추가','topic-new',canWrite?'':'disabled')}</div><div class="ip-panel">${catalog.topics.map(t=>`<div class="ip-question"><div class="ip-row"><strong>${esc(t.title)}</strong>${btn('수정','topic-edit',`data-id="${esc(t.id)}"`)}</div><span class="ip-help">${kinds[t.kind]} · ${t.required?'필수':'선택'} · ${t.active?'사용 중':'보관'} · ${esc(t.tracks.join(', ')||'모든 직렬')}</span><p>${esc(t.guidance)}</p></div>`).join('')}</div>`;return;
    }
    const isQ=tab==='questions';
    const r=await request(isQ?'admin_questions':'admin_members',{...filter,category,page});
    if(destroyed||version!==loadVersion)return;
    list=isQ?r.questions:r.members;
    if(isQ){await loadQuestionAudio(category);if(destroyed||version!==loadVersion)return;}
    box.innerHTML=`<form data-filter class="ip-toolbar"><label>${isQ?'질문 검색':'이름·학생 ID'}<input name="search" value="${esc(filter.search||'')}" maxlength="200"></label>
    ${isQ?`${category==='personality'?`<label>인성 준비 항목<select name="topicId"><option value="">전체 항목</option>${options(catalog.topics.map(t=>[t.id,t.title]),filter.topicId)}</select></label>`:''}<label>직렬<select name="track"><option value="">전체 직렬</option>${options(tracks.map(t=>[t,t]),filter.track)}</select></label><label>상태<select name="status">${options([['','전체'],['draft','승인 대기'],['published','공개 승인 완료'],['archived','보관']],filter.status||'')}</select></label>`:
    `<label>대상<select name="registeredOnly">${options([['true','등록 학생'],['false','전체 학생·등록하기']],String(filter.registeredOnly!==false))}</select></label>
    <label>준비 항목<select name="topicId"><option value="">전체 항목</option>${options(catalog.topics.filter(t=>t.active).map(t=>[t.id,t.title]),filter.topicId)}</select></label>
    <label>작성 상태<select name="noteStatus">${options([['','전체'],['empty','미작성'],['draft','작성 중'],['submitted','작성 완료'],['needs_revision','보완 필요'],['approved','강사 확인'],['no_experience','소재 찾기'],['changed','항목 변경']],filter.noteStatus||'')}</select></label>`}
    <button class="ip-btn ip-primary">검색</button></form>${isQ?`<p class="ip-help">질문·분류·원문 해설을 확인한 뒤 공개 승인하세요. 승인된 질문만 수강생에게 표시됩니다. ${category==='personality'?'인성 준비 항목 연결은 선택 사항입니다. 연결하지 않아도 공개 승인할 수 있습니다.':'직무 질문에는 인성 준비 항목을 연결하지 않습니다.'} 승인 후 내용을 수정하면 다시 승인 대기로 바뀝니다.</p><div class="ip-toolbar">${btn('질문 추가','question-new',canWrite?'':'disabled')}${btn('선택 문항 공개 승인','question-publish',canWrite?'':'disabled')}</div>`:''}
    <div class="ip-panel ip-table-wrap">${isQ?`<table class="ip-audio-question-table"><thead><tr><th>질문</th><th>항목·직렬</th><th>공개 승인 여부</th><th>관리</th></tr></thead><tbody>${list.map(q=>`<tr><td><label><input type="checkbox" data-publish-id="${esc(q.id)}" ${canWrite&&q.status==='draft'?'':'disabled'}> ${esc(questionTitle(q))}</label>${questionOriginal(q)}<small>출처 ${q.source_count}건</small>${questionAudioMarkup(q)}</td><td>${esc(q.topic_ids.map(id=>catalog.topics.find(t=>t.id===id)?.title||id).join(' · ')||(q.category==='personality'?'미연결 (선택)':''))}<br><small>${esc(q.tracks.join(' · ')||'공통')}</small></td><td>${approvalBadge(q)}</td><td><div class="ip-question-actions">${btn('검토·수정','question-edit',`data-id="${esc(q.id)}"`)}${approvalButton(q)}</div></td></tr>`).join('')}</tbody></table>`:
    `<table class="ip-matrix"><thead><tr><th>학생·이용 관리</th><th>필수 작성</th>${catalog.topics.filter(t=>t.active).map(t=>`<th>${esc(t.title)}${t.required?' *':''}</th>`).join('')}</tr></thead><tbody>${list.map(s=>{const required=catalog.topics.filter(t=>t.required&&topicApplicable(t,s.track)),complete=required.filter(t=>s.notes.some(n=>n.topic_id===t.id&&n.topic_revision===t.revision&&['submitted','approved'].includes(n.status))).length;return `<tr><td><strong>${esc(s.name)}</strong><br><small>${esc(s.id)} · ${esc(s.track||'미등록')}<br>${s.track?(s.enabled?'이용 허용':'이용 중지'):''}${s.expires_on?' · '+esc(s.expires_on):''}<br>${s.mock_test_enabled?'모의면접 테스트 허용':'모의면접 테스트 비허용'}</small><br>${btn('등록·수정','member-edit',`data-id="${esc(s.id)}"`)}${s.track?btn('인생그래프','life',`data-id="${esc(s.id)}"`)+btn('작성 답변','writing',`data-id="${esc(s.id)}"`):''}</td><td>${s.track?`${complete} / ${required.length}`:'미등록'}</td>${catalog.topics.filter(t=>t.active).map(t=>{const n=s.notes.find(n=>n.topic_id===t.id);return `<td>${s.track&&!topicApplicable(t,s.track)?'대상 아님':`<button class="ip-link" data-ip="feedback" data-id="${esc(s.id)}" data-topic="${esc(t.id)}">${n&&n.topic_revision!==t.revision?'항목 변경':badge(n)}</button>`}</td>`;}).join('')}</tr>`;}).join('')}</tbody></table>`}
    ${list.length?'':'<p class="ip-empty">검색 결과가 없습니다.</p>'}</div>
    <div class="ip-toolbar">${btn('이전','prev',page===0?'disabled':'')}<span>${page+1} 페이지</span>${btn('다음','next',list.length<30?'disabled':'')}</div>`;
    bindQuestionAudio();
  }
  async function refresh(){stopQuestionAudio();catalog=await request('admin_catalog');shell();await load();}
  async function updateQuestionPublication(action,payload,success){
    const controls=[...host.querySelector('[data-editor]').querySelectorAll('input,textarea,select,button')].map(node=>({node,disabled:node.disabled}));
    controls.forEach(({node})=>node.disabled=true);
    try{await request(action,payload);await refresh();notify(host,success);}
    finally{controls.forEach(({node,disabled})=>node.disabled=disabled);}
  }
  const elementTitle=id=>analysisCatalog.elements.find(e=>e.id===id)?.title||id;
  async function loadCore(box,version){
    const [r,info]=await Promise.all([request('admin_core_questions',{...filter,page}),request('admin_analysis_catalog')]);
    if(destroyed||version!==loadVersion)return;
    analysisCatalog=info;list=r.questions;
    box.innerHTML=`<section class="ip-panel"><h3>${esc(r.collection?.title||'핵심인성 30제')}</h3><p>${esc(r.collection?.description||'교재 자료를 준비 중입니다.')}</p><p class="ip-help">문항 번호와 원문을 보존했습니다. 교재의 연관 기출·해설은 각 질문의 ‘원본 출처와 해설’에서 확인하세요. 아래 요소는 교재 기준의 분석 초안이며 질문 공개와 관리자 검토는 별도로 진행합니다.</p></section>
      <form data-filter class="ip-toolbar"><label>질문 검색<input name="search" maxlength="200" value="${esc(filter.search||'')}"></label>
      <label>구성<select name="coreKind">${options([['','전체'],['main','핵심 주제 25개'],['appendix','추가 상황형 22개']],filter.coreKind||'')}</select></label>
      <label>상태<select name="status">${options([['','전체'],['draft','승인 대기'],['published','공개 승인 완료'],['archived','보관']],filter.status||'')}</select></label><button class="ip-btn ip-primary">검색</button></form>
      <p class="ip-help">질문·분류·원문 해설을 확인하고 공개 승인한 문항만 수강생에게 표시됩니다.</p>
      <div class="ip-toolbar">${btn('선택 문항 공개 승인','question-publish',canWrite?'':'disabled')}</div>
      <section class="ip-panel">${list.map(q=>`<article class="ip-question"><small>${q.kind==='main'?'Sub.':'Add.'}${q.position} · ${q.category==='personality'?'인성':'직무로 변경됨'} · ${publicationLabels[q.status]}</small>
      <label><input type="checkbox" data-publish-id="${esc(q.id)}" ${canWrite&&q.status==='draft'?'':'disabled'}> ${esc(q.prompt)}</label>
      <p><strong>교재 기준 요소</strong> ${esc(q.collection_element_ids.map(elementTitle).join(' · '))}</p><p>${esc(q.collection_analysis)}</p>
      <div class="ip-toolbar">${btn('질문·원문 검토','question-edit',`data-id="${esc(q.id)}"`)}${approvalButton(q)}${q.category==='personality'?btn('요소 분석·수정','analysis-edit',`data-id="${esc(q.id)}"`):''}</div></article>`).join('')||'<p>검색 결과가 없습니다.</p>'}</section>
      <div class="ip-toolbar">${btn('이전','prev',page===0?'disabled':'')}<span>${page+1} 페이지</span>${btn('다음','next',list.length<30?'disabled':'')}</div>`;
  }
  const elementCards=elements=>elements.map(e=>`<details class="ip-question"><summary>${esc(e.title)} · ${esc(catalog.topics.find(t=>t.id===e.topic_id)?.title||e.topic_id)}</summary>
    <p><strong>평가 관점</strong> ${esc(e.intent)}</p><strong>학생이 준비할 소재</strong><ul>${e.material_prompts.map(p=>`<li>${esc(p)}</li>`).join('')}</ul>
    <strong>답변 확인 기준</strong><ul>${e.checkpoints.map(p=>`<li>${esc(p)}</li>`).join('')}</ul></details>`).join('');
  async function loadAnalysis(box,version){
    const [info,result]=await Promise.all([request('admin_analysis_catalog'),request('admin_analysis_questions',{...filter,page})]);
    if(destroyed||version!==loadVersion)return;
    analysisCatalog=info;list=result.questions;
    box.innerHTML=`<section class="ip-panel"><h3>무엇을 평가하고 어떤 소재를 준비할까요?</h3>
      <p>인성 질문을 ${info.elements.length}개 세부 요소로 분석합니다. 질문 하나에 여러 요소를 연결할 수 있습니다.</p>
      <p class="ip-help">초기 연결에는 질문 표현에 따른 규칙 제안과 개별 문맥 해석 초안이 포함됩니다. 공식 채점표가 아닙니다. 관리자 검토 완료 ${info.reviewed}건. 분석을 저장해도 학생 질문 공개 상태나 개인 노트는 바뀌지 않습니다.</p>
      <details><summary>평가 요소·학생 소재·확인 기준 전체 보기</summary>${elementCards(info.elements)}</details>
      <div class="ip-summary">${Object.entries(analysisDispositions).map(([id,label])=>`<span><strong>${info.counts[id]||0}</strong>${label}</span>`).join('')}</div></section>
      <form data-filter class="ip-toolbar"><label>질문 검색<input name="search" maxlength="200" value="${esc(filter.search||'')}"></label>
      <label>평가 요소<select name="elementId">${options([['','전체 요소'],...info.elements.map(e=>[e.id,e.title])],filter.elementId||'')}</select></label>
      <label>수집·검토 구분<select name="disposition">${options([['','전체 구분'],...Object.entries(analysisDispositions)],filter.disposition||'')}</select></label>
      <label>분석 상태<select name="analysisStatus">${options([['','전체 상태'],...Object.entries(analysisStates)],filter.analysisStatus||'')}</select></label><button class="ip-btn ip-primary">검색</button></form>
      <div class="ip-panel ip-table-wrap"><table><thead><tr><th>질문</th><th>요소 후보</th><th>수집·검토 구분</th><th>분석</th></tr></thead><tbody>${list.map(q=>`<tr><td>${esc(q.prompt)}<small>${esc(q.tracks.join(' · '))}</small></td><td>${esc((q.element_ids||[]).map(elementTitle).join(' · ')||'판정 보류')}</td><td>${esc(analysisDispositions[q.disposition]||'분석 필요')}</td><td>${esc(analysisStates[q.analysis_status])}<br>${btn('요소 분석·검토','analysis-edit',`data-id="${esc(q.id)}"`)}</td></tr>`).join('')}</tbody></table>${list.length?'':'<p class="ip-empty">검색 결과가 없습니다.</p>'}</div>
      <div class="ip-toolbar">${btn('이전','prev',page===0?'disabled':'')}<span>${page+1} 페이지</span>${btn('다음','next',list.length<30?'disabled':'')}</div>`;
  }
  async function editAnalysis(id){
    const r=await request('admin_analysis_detail',{id}),a=r.analysis;
    selected={question:r.question,analysis:a};
    editor(`<h3>질문 요소 분석</h3><p><strong>${esc(r.question.prompt)}</strong></p>
      ${r.stale?'<p role="alert">질문이 변경되었습니다. 이전 분석 근거를 다시 확인해주세요.</p>':''}
      <p class="ip-help">질문 표현에서 찾은 근거는 후보 제안의 근거입니다. 평가 의도를 확정하는 근거는 아니므로 원문 문맥과 함께 검토하세요.</p>
      <p class="ip-help">분석 방식: ${a?.method==='analyst-semantic-v1'?'개별 문맥 해석 초안':a?.method==='core30-source-analysis-v1'?'핵심인성 교재 문맥 해석 초안':a?.method==='admin-review'?'관리자 작성':a?'표현 규칙 제안':'미분석'}</p>
      <details><summary>초기 연결 근거 ${a?.evidence?.length||0}건</summary>${(a?.evidence||[]).map(e=>`<p><strong>${esc(elementTitle(e.element_id))}</strong> · ${esc(e.basis)} · “${esc(e.quote)}”<br>${esc(e.interpretation)}</p>`).join('')||'<p>근거가 없습니다.</p>'}</details>
      <form data-analysis-form><label>수집·검토 구분<select name="disposition">${options(Object.entries(analysisDispositions),a?.disposition||'unresolved')}</select></label>
      <label>답변 형태<select name="answerForm">${options(Object.entries(analysisForms),a?.answer_form||'context')}</select></label>
      <strong>연결할 평가 요소 <small>(복수 선택)</small></strong>${checks('elementIds',analysisCatalog.elements.map(e=>[e.id,e.title]),a?.element_ids||[])}
      <label>질문 의도·판단 근거·필요 소재<textarea name="rationale" minlength="10" maxlength="4000" required>${esc(a?.rationale||'')}</textarea></label>
      <label>검토 상태<select name="status">${options([['draft','검토 대기'],['reviewed','관리자 검토 완료']],a?.status||'draft')}</select></label>
      <p class="ip-help">판정 보류는 검토 완료로 저장할 수 없습니다. 안부·문맥·민감 정보·직무 지식 질문은 학생 필수 데이터로 자동 전환하지 않습니다.</p>
      <div class="ip-toolbar"><button class="ip-btn ip-primary" data-write>분석 저장</button>${btn('원문·해설 확인','analysis-source',`data-id="${esc(id)}"`)}${btn('닫기','close')}</div></form>
      <div data-analysis-source></div><details><summary>선택한 요소의 학생 소재와 확인 기준</summary><div data-element-guides>${elementCards(analysisCatalog.elements.filter(e=>a?.element_ids.includes(e.id)))}</div></details>`);
  }
  async function editQuestion(id){
    const r=id?await request('admin_question_detail',{id}):null;
    if(r)await loadQuestionAudio(r.question.category);
    if(destroyed)return;
    stopQuestionAudio();
    selected=r?.question||{revision:0,prompt:'',category,topic_ids:[],tracks:[],status:'draft'};
    editor(`<h3>${id?'질문 검토·수정':'질문 추가'}</h3>${id?`<h4 data-question-title>${esc(questionTitle(selected))}</h4>`:''}<form data-question-form>
      <label>상위 카테고리<select name="category">${options([['personality','인성'],['job','직무']],selected.category)}</select></label>
      <label>질문 원문<textarea name="prompt" maxlength="4000" required>${esc(selected.prompt)}</textarea></label><p class="ip-help">음성이 연결된 질문의 제목은 음성 대본과 동일하게 표시합니다. 원문을 수정하면 기존 음성의 재연결이 필요합니다.</p><div data-topic-checks ${selected.category==='job'?'hidden':''}><strong>연결할 인성 준비 항목 (선택)</strong><p class="ip-help">선택하지 않아도 저장·공개 승인할 수 있습니다. 연결하면 수강생에게 관련 준비 노트를 안내합니다.</p>${topicChecks(selected.topic_ids)}</div>
      <strong>대상 직렬 <small>(선택하지 않으면 공통)</small></strong>${trackChecks(selected.tracks)}
      <p>공개 승인 여부: ${approvalBadge(selected)}</p>
      <label>관리 상태<select name="status">${options([['draft','승인 대기'],...(selected.status==='published'?[['published','공개 승인 완료']]:[]),['archived','보관']],selected.status)}</select></label>
      <p class="ip-help">공개 승인은 아래 별도 버튼에서 진행합니다. 질문·분류·연결 항목·직렬을 수정하면 다시 승인해야 수강생에게 표시됩니다. 수정 중인 내용은 먼저 저장해주세요.</p>
      <div class="ip-toolbar"><button class="ip-btn ip-primary" data-write>저장</button>${id?btn('삭제·보관','question-delete','data-write'):''}${btn('닫기','close')}</div></form>
      <div data-editor-question-audio>${questionAudioMarkup(selected)}</div>
      ${r?`<h3>원본 출처와 해설</h3>${r.sources.map(s=>`<details><summary>${esc(s.year)} · ${esc(s.track)} · ${esc(s.region)} · Q${esc(s.number)}</summary><p class="ip-help">${esc(s.filename)}<br>${esc(s.section_title)} · ${esc(s.locator)}</p><p>${esc(s.original_prompt)}</p><div class="ip-feedback">${esc(s.answer||'원문에 해설 없음')}</div></details>`).join('')}<div class="ip-toolbar">${approvalButton(selected)}</div>`:''}`);
    bindQuestionAudio();
  }
  function editTopic(id){
    selected=catalog.topics.find(t=>t.id===id)||{revision:0,title:'',kind:'experience',guidance:'',tracks:[],required:true,active:true,sort_order:catalog.topics.length+1};
    editor(`<h3>준비 항목 설정</h3><form data-topic-form><label>항목 이름<input name="title" maxlength="100" required value="${esc(selected.title)}"></label>
      <label>입력 양식<select name="kind">${options(Object.entries(kinds),selected.kind)}</select></label><label>작성 안내<textarea name="guidance" maxlength="4000">${esc(selected.guidance)}</textarea></label>
      <label>순서<input type="number" name="sortOrder" min="0" max="100000" value="${selected.sort_order}"></label>
      ${checks('flags',[['required','필수 항목'],['active','사용 중']],['required','active'].filter(k=>selected[k]))}
      <strong>대상 직렬 <small>(선택하지 않으면 공통)</small></strong>${trackChecks(selected.tracks)}
      <p class="ip-help">사용 중을 해제하면 보관됩니다. 기존 학생 기록은 유지합니다. 항목 변경 후에는 학생의 재확인을 받습니다.</p><button class="ip-btn ip-primary" data-write>저장</button></form>`);
  }
  function editMember(id){
    selected=list.find(s=>s.id===id);
    editor(`<h3>${esc(selected.name)} · 면접반 이용 등록</h3><form data-member-form><label>직렬<select name="track">${options(tracks.map(t=>[t,t]),selected.track||'공채')}</select></label><label>수험번호<input name="examNumber" required maxlength="80" value="${esc(selected.exam_number||'')}"></label><label>이용 종료일 <small>(빈칸이면 제한 없음)</small><input type="date" name="expiresOn" value="${esc(selected.expires_on||'')}"></label><label><input name="enabled" type="checkbox" ${selected.enabled!==false?'checked':''}> 이용 허용</label><label><input name="mockTestEnabled" type="checkbox" ${selected.mock_test_enabled===true?'checked':''}> 모의면접 테스트 허용</label><p class="ip-help">지정한 계정만 전공·인성·실전 모의면접을 사용할 수 있습니다.</p><button class="ip-btn ip-primary" data-write>저장</button></form>`);
  }
  async function feedback(id,topicId){
    const student=list.find(s=>s.id===id),t=catalog.topics.find(t=>t.id===topicId);
    if(!student.notes.some(n=>n.topic_id===topicId)){notify(host,'아직 작성한 내용이 없습니다.');return;}
    const {note:n}=await request('admin_note_detail',{targetStudentId:id,topicId});
    selected={student,n,t};
    editor(`<h3>${esc(student.name)} · ${esc(t.title)}</h3>${badge(n)}${getTopicQuestions(t,templates).map(([k,l])=>`<h4>${esc(l)}</h4><p style="white-space:pre-wrap">${esc(n.fields[k]||'미작성')}</p>`).join('')}
      ${n.fields.help?`<div class="ip-feedback">도움 요청: ${esc(n.fields.help)}</div>`:''}
      <form data-feedback-form><label>피드백<textarea name="feedback" maxlength="8000" required>${esc(n.feedback)}</textarea></label><label>처리<select name="status">${options([['needs_revision','보완 요청'],['approved','강사 확인 완료']],n.status==='approved'?'approved':'needs_revision')}</select></label><button class="ip-btn ip-primary" data-write>피드백 공개</button></form>${btn('수정 이력 보기','history')}<div data-history></div>`);
  }
  host.onclick=async e=>{
    const target=e.target.closest('[data-ip]');if(!target||busy||target.disabled)return;
    busy=true;target.disabled=true;
    try{
      const a=target.dataset.ip;
      if(['category','tab','section','prev','next','question-new','question-edit','analysis-edit','application-reject','application-edit','topic-new','topic-edit','member-edit','feedback','life','writing','close','enabled'].includes(a)&&!canLeave())return;
      if(['category','tab','section','close'].includes(a))dirty=false;
      if(a==='section'){if(onSection)onSection(target.dataset.section);else await openSection(target.dataset.section);}
      else if(a==='category'){category=target.dataset.category;tab='questions';page=0;filter={};shell();await load();}
      else if(a==='tab'){tab=target.dataset.tab;page=0;filter={};shell();await load();}
      else if(a==='enabled'){if(confirm(catalog.enabled?'면접 준비 기능 이용을 중지할까요?':'검토한 항목을 등록 학생에게 개방할까요?')){await request('admin_enabled',{enabled:!catalog.enabled});await refresh();}}
      else if(a==='prev'||a==='next'){page+=a==='next'?1:-1;await load();}
      else if(a==='question-new'||a==='question-edit')await editQuestion(target.dataset.id);
      else if(a==='analysis-edit')await editAnalysis(target.dataset.id);
      else if(a==='analysis-source'){
        const r=await request('admin_question_detail',{id:target.dataset.id});
        host.querySelector('[data-analysis-source]').innerHTML=r.sources.map(s=>`<details><summary>${esc(s.year)} · ${esc(s.track)} · Q${esc(s.number)}</summary><p>${esc(s.filename)} · ${esc(s.locator)}</p><p>${esc(s.original_prompt)}</p><div class="ip-feedback">${esc(s.answer||'원문에 해설 없음')}</div></details>`).join('');
      }
      else if(a==='question-publish'){
        if(!canWrite)return;
        if(dirty){notify(host,'수정한 내용을 먼저 저장한 뒤 공개 승인을 변경해주세요.',true);return;}
        const ids=[...host.querySelectorAll('[data-publish-id]:checked')].map(n=>n.dataset.publishId);
        const items=list.filter(q=>ids.includes(q.id)&&q.status==='draft').map(q=>({id:q.id,revision:q.revision}));
        if(!items.length){notify(host,'공개 승인할 대기 질문을 선택해주세요.');return;}
        if(confirm(`선택한 ${items.length}개 질문의 내용·분류·원문 해설을 확인했으며 수강생 공개를 승인할까요?`)){
          await updateQuestionPublication('admin_question_publish',{items},'선택한 질문의 공개를 승인했습니다.');
        }
      }
      else if(a==='question-approval'){
        if(!canWrite)return;
        if(dirty){notify(host,'수정한 내용을 먼저 저장한 뒤 공개 승인을 변경해주세요.',true);return;}
        const approved=target.dataset.approved==='true';
        if(confirm(approved?'이 질문의 내용·분류·원문 해설을 확인했으며 수강생 공개를 승인할까요?':'공개 승인을 취소하고 수강생에게 보이지 않도록 할까요?')){
          await updateQuestionPublication('admin_question_publication',{id:target.dataset.id,revision:Number(target.dataset.revision),approved},approved?'공개 승인했습니다. 수강생에게 표시됩니다.':'승인을 취소했습니다. 수강생에게 표시되지 않습니다.');
        }
      }
      else if(a==='topic-new'||a==='topic-edit')editTopic(target.dataset.id);
      else if(a==='member-edit')editMember(target.dataset.id);
      else if(a==='application-edit'||a==='application-reject'){
        if(!canWrite)return;
        const reject=a==='application-reject';
        selected=list.find(x=>x.id===target.dataset.id);
        editor(`<h3>면접반 신청 검토</h3><p>${esc(selected.name)} · ${esc(selected.track)} · 수험번호 ${esc(selected.exam_number)}</p><p>${selected.legacy_student_id?'기존 학생 계정 '+esc(selected.legacy_student_id):'신규 면접반 전용 계정'}</p>
        <form data-application-review><label>처리<select name="status"><option value="approved">수강 확인·승인</option><option value="rejected" ${reject?'selected':''}>반려</option></select></label><label>이용 종료일 (승인 시 적용, 빈칸은 제한 없음)<input name="expiresOn" type="date"></label><label>반려 사유 / 승인 안내 (반려 시 필수)<textarea name="reviewNote" maxlength="2000" ${reject?'required':''}></textarea></label><p class="ip-help">반려하면 학생에게 사유가 표시됩니다. 학생이 재신청해야 다시 승인 대기 목록에 표시됩니다.</p><button class="ip-btn ip-primary" data-write>${reject?'반려':'승인'}</button>${btn('닫기','close')}</form>`,target.closest('.ip-question'));
      }
      else if(a==='life'){
        editor(`${btn('닫기','close')}<div data-life-host></div>`);
        life=mountLife(host.querySelector('[data-life-host]'),{request,admin:true,studentId:target.dataset.id,canWrite});
      }
      else if(a==='writing'){
        const {mountWriting}=await import('./interview-writing-ui.js?v=20261024-colors');
        if(destroyed)return;
        editor(`${btn('닫기','close')}<h3>학생 작성 답변</h3><div data-writing-host></div>`);
        life=mountWriting(host.querySelector('[data-writing-host]'),{request,admin:true,studentId:target.dataset.id,canWrite});
      }
      else if(a==='feedback')await feedback(target.dataset.id,target.dataset.topic);
      else if(a==='close'){stopQuestionAudio();life?.destroy();life=null;host.querySelector('[data-editor]').hidden=true;}
      else if(a==='question-delete'){if(confirm('사용·출처 이력이 있는 질문은 보관 처리합니다. 삭제 또는 보관할까요?')){const r=await request('admin_question_delete',{id:selected.id,revision:selected.revision});await refresh();notify(host,r.result==='deleted'?'삭제했습니다.':'이력을 보존하고 보관했습니다.');}}
      else if(a==='history'){const r=await request('admin_history',{targetStudentId:selected.student.id,topicId:selected.t.id});host.querySelector('[data-history]').innerHTML=r.history.map(h=>`<div class="ip-history"><strong>${esc(new Date(h.created_at).toLocaleString('ko-KR'))} · ${states[h.snapshot.status]}</strong><p>${esc(Object.values(h.snapshot.fields||{}).join('\n'))}</p>${esc(h.snapshot.feedback)}</div>`).join('');}
    }catch(e){notify(host,message(e),true);}finally{busy=false;target.disabled=false;}
  };
  host.onsubmit=async e=>{
    e.preventDefault();if(busy)return;
    const form=e.target,f=new FormData(form);
    if(form.matches('[data-filter]')){filter=Object.fromEntries(f);if('registeredOnly' in filter)filter.registeredOnly=filter.registeredOnly==='true';page=0;try{await load();}catch(e){notify(host,message(e),true);}return;}
    if(!canWrite)return;
    busy=true;const submit=form.querySelector('button');submit.disabled=true;
    try{
      if(form.matches('[data-question-form]'))await request('admin_question_save',{id:selected.id,revision:selected.revision,prompt:f.get('prompt'),category:f.get('category'),topicIds:f.get('category')==='personality'?f.getAll('topicIds'):[],tracks:f.getAll('tracks'),status:f.get('status')});
      else if(form.matches('[data-topic-form]'))await request('admin_topic_save',{id:selected.id,revision:selected.revision,title:f.get('title'),kind:f.get('kind'),guidance:f.get('guidance'),sortOrder:Number(f.get('sortOrder')),required:f.getAll('flags').includes('required'),active:f.getAll('flags').includes('active'),tracks:f.getAll('tracks')});
      else if(form.matches('[data-member-form]'))await request('admin_member_save',{targetStudentId:selected.id,track:f.get('track'),examNumber:f.get('examNumber'),expiresOn:f.get('expiresOn'),enabled:f.has('enabled'),mockTestEnabled:f.has('mockTestEnabled')});
      else if(form.matches('[data-feedback-form]'))await request('admin_feedback',{targetStudentId:selected.student.id,topicId:selected.t.id,revision:selected.n.revision,status:f.get('status'),feedback:f.get('feedback')});
      else if(form.matches('[data-analysis-form]'))await request('admin_analysis_save',{id:selected.question.id,questionRevision:selected.question.revision,revision:selected.analysis?.revision||0,elementIds:f.getAll('elementIds'),disposition:f.get('disposition'),answerForm:f.get('answerForm'),rationale:f.get('rationale'),status:f.get('status')});
      else if(form.matches('[data-application-review]')){
        const note=String(f.get('reviewNote')||'').trim();
        if(f.get('status')==='rejected'&&!note){notify(host,'반려 사유를 입력해주세요.',true);form.querySelector('[name=reviewNote]').focus();return;}
        await request('admin_application_decide',{id:selected.id,revision:selected.revision,status:f.get('status'),reviewNote:note,expiresOn:f.get('expiresOn')});
      }
      dirty=false;await refresh();notify(host,'저장했습니다.');
    }catch(e){notify(host,message(e),true);}finally{busy=false;submit.disabled=false;}
  };
  host.onchange=e=>{
    if(e.target.matches('[data-application-review] [name=status]')){
      e.target.closest('form').querySelector('[data-write]').textContent=e.target.value==='approved'?'승인':'반려';
      e.target.closest('form').querySelector('[name=reviewNote]').required=e.target.value==='rejected';
    }
    if(e.target.closest('[data-editor]'))dirty=true;
    if(e.target.matches('[data-question-form] [name=category]'))host.querySelector('[data-topic-checks]').hidden=e.target.value==='job';
    if(e.target.matches('[data-analysis-form] [name=elementIds]')){
      const ids=new FormData(e.target.closest('form')).getAll('elementIds');
      host.querySelector('[data-element-guides]').innerHTML=elementCards(analysisCatalog.elements.filter(x=>ids.includes(x.id)));
    }
  };
  host.oninput=e=>{
    if(e.target.closest('[data-editor]'))dirty=true;
    if(e.target.name==='prompt'&&['job','personality'].includes(selected?.category)){
      stopQuestionAudio();
      host.querySelector('[data-editor-question-audio]').innerHTML=questionAudioMarkup({...selected,prompt:e.target.value});
      const title=host.querySelector('[data-question-title]');
      if(title)title.textContent=questionTitle({...selected,prompt:e.target.value});
      bindQuestionAudio();
    }
  };
  try{await refresh();}catch(e){host.innerHTML=`<section class="ip-panel"><h2>면접 준비 관리</h2><p role="alert">${esc(message(e))}</p>${btn('다시 시도','retry')}</section>`;host.querySelector('button').onclick=()=>location.reload();}
  return {openSection,canLeave,destroy(){stopQuestionAudio();destroyed=true;life?.destroy();window.removeEventListener('beforeunload',beforeUnload);host.onclick=null;host.onsubmit=null;host.onchange=null;host.oninput=null;}};
}
