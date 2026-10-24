import {renderLifeGraph,experienceText} from './interview-life-graph.js?v=20261021-life-save-fix';
import {basicFields,identityFields,identityGenders,emptyBasic,schoolStatuses,basicFieldText,normalizeBirthDate,validBirthDate} from './client/interview-basic-fields.js?v=20261024-school-status';
import {mountLifeFollowup} from './interview-life-followup-ui.js?v=20261021-followup-entry';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const titles={basic:'기본 정보',qualifications:'자격·어학',affiliations:'소속 이력',awards:'수상·성과',experiences:'핵심 경험'};
const schema={
  qualifications:[['type','구분'],['date','취득·예정 시기'],['name','자격·면허·어학명'],['effort','어떤 노력을 통해 취득했나요?']],
  affiliations:[['type','소속 구분'],['name','소속명'],['period','기간 (시작~종료 또는 현재)'],['role','직책·역할'],['activities','주요 담당 업무·활동']],
  awards:[['date','수상·성과 시기'],['name','대회·프로젝트·성과명'],['issuer','수여 기관'],['rank','수상 등급'],['contribution','본인 기여도 % (선택, 0~100)'],['action','본인이 직접 한 일']],
  experiences:[['age','당시 나이 (세, 필수)'],['satisfaction','만족도 (−25~+25점)'],['title','키워드'],['content','내용'],['appeal','면접관에게 어필할 점']],
};
const statusLabels={draft:'작성 중',submitted:'첨삭 대기',needs_revision:'보완 필요',approved:'강사 확인'};
const blank=()=>({background:'',qualifications:[],affiliations:[],awards:[],experiences:[],none:[]});
const button=(text,action,extra='')=>`<button type="button" class="ip-btn" data-life-action="${action}" ${extra}>${text}</button>`;
const isLanguage=row=>/어학|외국어|언어/.test(row.type||'');
const sameData=(a,b)=>{
  const stable=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
  return stable(a)===stable(b);
};
const errorMessage=e=>({
  revision_conflict:'다른 기기 또는 관리자가 수정했습니다. 입력 내용을 복사해 보관한 뒤 최신 내용을 불러오세요.',
  incomplete_life:'기본 이력과 각 영역을 확인해주세요. 이력이 없으면 ‘해당 없음’을 선택하고, 경험은 1개 이상 나이·키워드·내용·면접관에게 어필할 점을 작성해주세요.',
  invalid_request:'저장 형식을 확인하지 못했습니다. 입력 내용은 유지됩니다. 다시 시도해도 같으면 관리자에게 알려주세요.',
  invalid_experience_date:'당시 나이는 0~120세의 정수로 입력해주세요.',
  incomplete_experience_date:'각 경험의 당시 나이를 입력해주세요.',
  invalid_satisfaction:'만족도는 −25점부터 +25점까지 정수로 입력해주세요.',
  request_too_large:'내용이 저장 한도를 넘었습니다. 긴 내용을 핵심 행동 중심으로 줄여주세요.',
  not_submitted:'학생이 첨삭 요청으로 제출한 후 피드백을 남길 수 있습니다.',
  not_enrolled:'면접반 이용 등록과 기간을 확인해주세요.',
  forbidden:'이 내용을 볼 권한이 없습니다.',unauthorized:'로그인이 만료되었습니다. 다시 로그인해주세요.',
}[e.code||e.message]||'처리하지 못했습니다. 입력 내용은 유지됩니다. 연결을 확인하고 다시 시도해주세요.');

// Synchronous controller allows the parent to dispose an in-flight initial load.
export function mountLife(host,{request,followupRequest,admin=false,studentId='',canWrite=true,embedded=false,initialSection='basic',simpleEditor=false,combined=false}){
  combined=combined&&embedded&&!admin;
  const experienceOnly=combined&&initialSection==='experiences';
  const combinedSections=experienceOnly?['experiences']:['basic','qualifications','awards'];
  let data,content=blank(),profile=null,section=Object.hasOwn(titles,initialSection)?initialSection:'basic',dirty=false,busy=false,destroyed=false,blocked=false,experienceDialog=null;
  const editingExperiences=new Set();
  let followup=null,followupEnabled=false,followupProgress={};
  const rowDirty=id=>!sameData(content.experiences.find(r=>r.id===id),profile?.content.experiences.find(r=>r.id===id));
  const rowState=id=>rowDirty(id)?'저장하지 않은 변경 내용':editingExperiences.has(id)?'수정 중':'저장됨';
  const followupLabel=id=>rowDirty(id)?'저장 후 추가 질문 시작':followupProgress[id]?.summary_ready?'정리 내용 확인':followupProgress[id]?'추가 질문 이어쓰기':'추가 질문으로 자세히 쓰기';
  const followupButton=id=>followupEnabled&&!admin?button(followupLabel(id),'followup',`data-row="${esc(id)}"`):'';
  const tell=(text,error=false)=>{const n=host.querySelector('[data-life-message]');if(n){n.textContent=text;n.dataset.error=String(error);}};
  const mark=()=>{dirty=true;host.querySelectorAll('[data-life-save-state]').forEach(n=>n.textContent='저장하지 않은 변경 내용');host.querySelectorAll('[data-experience-state]').forEach(n=>n.textContent=rowState(n.dataset.experienceState));host.querySelectorAll('[data-life-action=followup]').forEach(n=>n.textContent=followupLabel(n.dataset.row));};
  const canLeave=()=>{if(followup&&!followup.canLeave())return false;if(busy){tell('저장·불러오기가 끝난 뒤 이동해주세요.');return false;}if(!dirty)return true;if(!confirm('인생그래프에 저장하지 않은 내용이 있습니다. 변경 내용을 버리고 이동할까요?'))return false;dirty=false;return true;};
  const beforeUnload=e=>{if(dirty||busy){e.preventDefault();e.returnValue='';}};
  window.addEventListener('beforeunload',beforeUnload);
  const currentRows=(id=section)=>content[id]||[];
  const selectEventSection=target=>{
    if(!combined)return;
    const id=target.closest('[data-life-section]')?.dataset.lifeSection;
    if(Object.hasOwn(titles,id))section=id;
  };
  function satisfactionInput(row,readonly=false){
    return `<input type="number" min="-25" max="25" step="1" ${readonly?'readonly':''} data-life-field="satisfaction" data-row="${esc(row.id)}" placeholder="−25~+25" value="${esc(row.satisfaction)}">`;
  }
  function qualificationTypeInput(row){
    const types=['자격·면허','어학','기타'],value=row.type||'';
    return `<select data-life-field="type" data-row="${esc(row.id)}"><option value="">선택해주세요</option>${value&&!types.includes(value)?`<option value="${esc(value)}" selected>${esc(value)} (기존 입력)</option>`:''}${types.map(type=>`<option value="${type}" ${value===type?'selected':''}>${type}</option>`).join('')}</select>`;
  }
  function qualificationLabel(row,key,fallback){
    const labels=isLanguage(row)?{date:'응시·예정 시기',name:'시험명',effort:'어떻게 준비했나요?'}:row.type==='자격·면허'?{name:'자격·면허명'}:row.type==='기타'?{date:'취득·참여 시기',name:'활동·성과명',effort:'어떤 준비와 노력을 했나요?'}:{};
    return labels[key]||fallback;
  }
  function rowView(row,index,id=section){
    if(id==='experiences')row=experienceText(row);
    const readonly=id==='experiences'&&!editingExperiences.has(row.id);
    return `<article class="ip-panel" data-life-row="${esc(row.id)}"><div class="ip-row"><h4>${index+1}. ${esc(row.title||row.name||titles[id])}</h4>${!admin?`<div>${button('위로','up',`data-row="${esc(row.id)}" ${index===0?'disabled':''}`)} ${button('삭제','remove',`data-row="${esc(row.id)}"`)}</div>`:''}</div>
      ${schema[id].map(([key,label])=>[key,id==='qualifications'?qualificationLabel(row,key,label):label]).map(([key,label])=>admin?`<h4>${esc(label)}</h4><p class="ip-life-text">${esc(row[key]||'미작성')}</p>`:
        `<label><span data-life-label="${key}">${esc(label)}</span>${id==='qualifications'&&key==='type'?qualificationTypeInput(row):key==='satisfaction'?satisfactionInput(row,readonly):['effort','activities','action','content','appeal'].includes(key)?`<textarea ${readonly?'readonly':''} data-life-field="${key}" data-row="${esc(row.id)}" maxlength="${key==='content'?12000:2000}">${esc(row[key])}</textarea>`:`<input ${readonly?'readonly':''} data-life-field="${key}" data-row="${esc(row.id)}" maxlength="${['age','contribution'].includes(key)?3:2000}" ${['age','contribution'].includes(key)?'inputmode="numeric"':''} ${key==='age'?'placeholder="예: 23"':''} value="${esc(row[key])}">`}</label>`).join('')}
      ${id==='experiences'&&!admin?`<div class="ip-life-toolbar">${button('내용 수정','edit-experience',`data-row="${esc(row.id)}" ${readonly?'':'disabled'}`)}${followupButton(row.id)}${button('저장','save-experience',`data-row="${esc(row.id)}" ${readonly?'disabled':''}`)}<span data-experience-state="${esc(row.id)}" role="status">${rowState(row.id)}</span>${followupEnabled&&followupProgress[row.id]?`<span class="ip-help">답변 ${followupProgress[row.id].answered}개 저장됨</span>`:''}</div><p class="ip-help">수정한 내용은 저장 버튼을 눌러야 반영됩니다.${followupEnabled?' 추가 질문에서는 이 경험의 상황·선택 이유·행동을 더 자세히 적을 수 있습니다.':''}</p>`:''}
      </article>`;
  }
  function identityView(){
    return `<div class="ip-basic-grid ip-identity-fields">${identityFields.map(([key,label])=>{
      const value=content.basicInfo?.[key]?.text||'';
      if(admin)return `<div><h4>${label}</h4><p class="ip-life-text">${esc(key==='gender'?(identityGenders.find(([id])=>id===value)?.[1]||'미작성'):value||'미작성')}</p></div>`;
      const attrs=`id="ip-basic-${key}" data-basic-field="${key}" data-identity-field="${key}"`;
      return `<div class="ip-basic-field"><label for="ip-basic-${key}">${label}</label>${key==='gender'?`<select ${attrs}><option value="">선택해주세요</option>${identityGenders.map(([id,title])=>`<option value="${id}" ${value===id?'selected':''}>${title}</option>`).join('')}</select>`:`<input ${attrs} type="text" ${key==='birthDate'?`inputmode="numeric" maxlength="10" autocomplete="bday" placeholder="예: 20000315" aria-describedby="ip-birth-help"`:'maxlength="100" autocomplete="name" placeholder="이름 입력"'} value="${esc(key==='birthDate'?value.replaceAll('-',''):value)}">`}${key==='birthDate'?'<span id="ip-birth-help" class="ip-help">생년월일 8자리를 입력해주세요.</span>':''}</div>`;
    }).join('')}</div>`;
  }
  function schoolStatusView(value){
    return `<fieldset class="ip-school-status"><legend>학적 상태</legend>${schoolStatuses.map(([id,label])=>`<label><input type="radio" name="ip-school-status" data-school-status value="${id}" ${value.status===id?'checked':''} ${value.none?'disabled':''}>${label}</label>`).join('')}</fieldset>`;
  }
  function sectionView(id){
    return `<div data-life-section="${id}">${id==='basic'?`<section class="ip-panel"><h3>지원자 기본 정보</h3><p>지원 직렬: <strong>${esc(data.member.track)}</strong> · 수험번호: ${esc(data.member.exam_number)}</p>
      ${identityView()}
      ${admin?'':'<div class="ip-basic-grid">'}${basicFields.map(([key,label])=>{const value=content.basicInfo?.[key]||{text:'',none:false},short=['school','major','clubs','role'].includes(key);return admin?`<h4>${label}</h4><p class="ip-life-text">${esc(basicFieldText(key,value)||'미작성')}</p>`:`<div class="ip-basic-field" ${short?'data-basic-short':''}><div class="ip-row"><label for="ip-basic-${key}">${label}</label><label class="ip-basic-none"><input type="checkbox" data-basic-none="${key}" ${value.none?'checked':''}> 해당 없음</label></div><textarea id="ip-basic-${key}" data-basic-field="${key}" rows="${short?1:3}" maxlength="2000" ${value.none?'disabled':''} placeholder="${key==='school'?'예: ○○고등학교, ○○대학교':label+' 입력'}">${esc(value.text)}</textarea>${key==='school'?schoolStatusView(value):''}</div>`;}).join('')}${admin?'':'</div>'}
      ${content.background?`<details class="ip-legacy-background"><summary>이전에 작성한 소개</summary><p class="ip-life-text">${esc(content.background)}</p><p class="ip-help">기존 내용은 보관됩니다. 위 항목별 입력을 저장하면 새 내용이 초안에 사용됩니다.</p></details>`:''}</section>
      ${combined?'':timeline()}`:
      `<div class="ip-row"><h3>${id==='experiences'&&combined?'경험·인생그래프':titles[id]} · ${currentRows(id).length}개</h3>${!admin?button('항목 추가','add',content.none.includes(id)?'disabled':''):''}</div>
      ${id!=='experiences'?admin?`<p>${content.none.includes(id)?'해당 없음으로 확인함':''}</p>`:`<label><input type="checkbox" data-life-none ${content.none.includes(id)?'checked':''} ${currentRows(id).length?'disabled':''}> 해당 이력이 없습니다.</label>`:'<p class="ip-help">실패·갈등·도전·일상의 작은 일도 좋습니다. 경험의 내용과 면접관에게 어필할 점을 적어주세요.</p>'}
      ${currentRows(id).map((row,index)=>rowView(row,index,id)).join('')||`<p class="ip-empty">${content.none.includes(id)?'해당 없음':'아직 입력한 내용이 없습니다.'}</p>`}`}</div>`;
  }
  function timeline(){
    return `<div data-life-graph>${renderLifeGraph(content.experiences,{interactive:!admin})}</div>`;
  }
  function updateGraph(){const box=host.querySelector('[data-life-graph]');if(box)box.innerHTML=renderLifeGraph(content.experiences,{interactive:!admin});}
  function openExperience(id){
    const original=content.experiences.find(r=>r.id===id);if(!original)return;const experience=experienceText(original);
    closeExperience();
    const dialog=document.createElement('dialog'),titleId='life-experience-'+crypto.randomUUID();
    dialog.className='ip-life-dialog';dialog.setAttribute('aria-labelledby',titleId);
    const fields=[['age','당시 나이'],['satisfaction','만족도'],['content','내용'],['appeal','면접관에게 어필할 점']];
    dialog.innerHTML=`<div class="ip-row"><h3 id="${titleId}">${esc(experience.title||'경험 상세')}</h3><button type="button" class="ip-btn" data-experience-close autofocus>닫기</button></div><dl>${fields.map(([key,label])=>`<div><dt>${label}</dt><dd>${esc(experience[key]===undefined||experience[key]===''?'미작성':key==='age'?experience[key]+'세':key==='satisfaction'?(Number(experience[key])>0?'+':'')+experience[key]+'점':experience[key])}</dd></div>`).join('')}</dl><div class="ip-life-dialog-actions">${!admin?'<button type="button" class="ip-btn" data-experience-edit>내용 수정</button>':''}</div>`;
    dialog.addEventListener('close',()=>{dialog.remove();if(experienceDialog===dialog)experienceDialog=null;});
    dialog.onclick=e=>{e.stopPropagation();if(e.target.closest('[data-experience-close]'))dialog.close();else if(e.target.closest('[data-experience-edit]')){dialog.close();editExperience(id);}};
    if(followupEnabled&&!admin){const b=document.createElement('button');b.type='button';b.className='ip-btn';b.dataset.lifeAction='followup';b.dataset.row=id;b.textContent=followupLabel(id);b.onclick=e=>{e.stopPropagation();dialog.close();openFollowup(id);};dialog.querySelector('.ip-life-dialog-actions').append(b);}
    host.append(dialog);experienceDialog=dialog;dialog.showModal();
  }
  function closeExperience(){if(experienceDialog){experienceDialog.close();experienceDialog.remove();experienceDialog=null;}}
  function editExperience(id){
    if(!content.experiences.some(r=>r.id===id)||combined&&!experienceOnly)return;
    editingExperiences.add(id);section='experiences';render();
    const row=[...host.querySelectorAll('[data-life-row]')].find(n=>n.dataset.lifeRow===id);
    if(!row){section='experiences';render();return editExperience(id);}
    row.scrollIntoView({block:'start',behavior:'smooth'});row.querySelector('[data-life-field=title]')?.focus({preventScroll:true});
  }
  function render(){
    if(destroyed||!data)return;
    closeExperience();
    host.innerHTML=`${embedded?'':`<div class="ip-hero"><h2>인생그래프·경험 DB</h2><p>${esc(data.member.name)} · ${esc(data.member.track)} · ${esc(statusLabels[profile?.status]||'미작성')}</p><p>이력과 작은 경험들을 모아 면접 답변의 근거로 활용하세요.</p></div>
      <p class="ip-help">본인의 실제 내용과 당시 나이를 적어주세요. 저장된 내용은 본인과 권한 있는 관리자에게만 보입니다.</p>
      <div class="ip-life-toolbar">${!admin?`${button('임시저장','save')}${button('작성 완료·첨삭 요청','submit')}`:''}${button('최신 내용 불러오기','reload')}<span data-life-save-state>${dirty?'저장하지 않은 변경 내용':profile?'서버에 저장됨':'아직 저장된 내용 없음'}</span></div>`}
      <p class="ip-message" data-life-message role="status"></p>
      ${profile?.feedback?`<div class="ip-feedback"><strong>강사 피드백</strong><br>${esc(profile.feedback)}</div>`:''}
      ${embedded?'':`<nav class="ip-tabs" aria-label="인생그래프 입력 영역">${Object.entries(titles).map(([id,title])=>button(title,'section',`data-section="${id}" ${section===id?'aria-current="page"':''}`)).join('')}</nav>`}
      <div data-life-body ${combined?'class="ip-life-combined"':''}>${combined?(experienceOnly?timeline():'')+combinedSections.map(sectionView).join(''):(section==='experiences'?timeline():'')+sectionView(section)}</div>
      ${!admin&&(embedded||section!=='basic')?`<div class="ip-life-toolbar">${simpleEditor?button('저장','save'):`${button('임시저장','save')}${button('작성 완료·첨삭 요청','submit')}`}<span data-life-save-state>${dirty?'저장하지 않은 변경 내용':profile?'서버에 저장됨':'아직 저장된 내용 없음'}</span></div>`:''}

      ${admin?`<section class="ip-panel"><h3>인생그래프 첨삭</h3><label>피드백<textarea data-life-feedback maxlength="8000" ${!canWrite?'disabled':''}>${esc(profile?.feedback||'')}</textarea></label><label>처리<select data-life-feedback-status ${!canWrite?'disabled':''}><option value="needs_revision">보완 요청</option><option value="approved" ${profile?.status==='approved'?'selected':''}>강사 확인 완료</option></select></label>${button('피드백 공개','feedback',!canWrite||!profile||profile.status==='draft'?'disabled':'')}<p class="ip-help">학생이 작성 완료로 제출한 뒤 피드백을 남길 수 있습니다.</p></section>`:''}`;
  }
  async function load(){
    busy=true;
    if(!data)host.innerHTML='<p role="status">인생그래프를 불러오는 중…</p>';
    try{
      const result=await request(admin?'admin_life_get':'life_get',admin?{targetStudentId:studentId}:{});
      if(destroyed)return;
      data=result;profile=result.profile;content=structuredClone(profile?.content||blank());
      dirty=false;blocked=false;editingExperiences.clear();render();
    }catch(e){if(!data){host.innerHTML=`<p role="alert">${esc(errorMessage(e))}</p>${button('다시 시도','reload')}`;}else tell(errorMessage(e),true);}
    finally{busy=false;}
  }
  async function refreshFollowup(){
    if(!followupRequest||admin)return;
    try{const result=await followupRequest('availability');if(destroyed)return;followupEnabled=result.enabled;followupProgress=Object.fromEntries((result.sessions||[]).map(s=>[s.experience_id,s]));if(!followup&&!dirty&&!busy)render();}catch{followupEnabled=false;}
  }
  async function openFollowup(id){
    if(!followupEnabled||busy||followup)return;
    const row=content.experiences.find(r=>r.id===id),text=experienceText(row||{});
    if(!row||String(row.age??'')===''||!text.title?.trim()||!text.content?.trim()){tell('당시 나이·키워드·내용을 작성한 뒤 시작해주세요.',true);return;}
    const initialView=!rowDirty(id)&&followupProgress[id]?.summary_ready?'summary':'questions';
    if(rowDirty(id)&&!(await save('draft',id)))return;
    closeExperience();
    const original=document.createElement('div');while(host.firstChild)original.append(host.firstChild);original.hidden=true;host.append(original);
    const panel=document.createElement('div');host.append(panel);
    followup=mountLifeFollowup(panel,{request:followupRequest,experienceId:id,initialView,onApplied:async()=>{
      const latest=await request('life_get',{});if(destroyed)return;
      const fresh=latest.profile.content.experiences.find(r=>r.id===id);
      content.experiences=content.experiences.map(r=>r.id===id?structuredClone(fresh):r);profile=latest.profile;data=latest;dirty=!sameData(content,profile.content);
    },onClose:()=>{followup?.destroy();followup=null;render();refreshFollowup();},onAdd:()=>{followup?.destroy();followup=null;section='experiences';add();}});
  }
  function add(competencyId){
    if(currentRows().length>=40||Object.keys(schema).reduce((n,k)=>n+content[k].length,0)>=80){tell('영역별 40개, 전체 80개까지 추가할 수 있습니다.',true);return;}
    const row=Object.fromEntries(schema[section].map(([key])=>[key,'']));
    if(section==='qualifications')row.issuer=''; // Preserve the existing storage contract without an input field.
    row.id=crypto.randomUUID();
    if(section==='experiences'){row.competencyIds=competencyId?[competencyId]:[];row.satisfaction='';editingExperiences.add(row.id);}
    content[section].push(row);mark();render();
    host.querySelector(`[data-life-row="${row.id}"] input`)?.focus();
  }
  async function save(status,experienceId=null){
    if(blocked){tell('입력 내용을 보관한 뒤 최신 내용을 불러와 충돌을 해결해주세요.',true);return false;}
    if(busy||destroyed)return false;
    if(!admin){
      for(const input of host.querySelectorAll('[data-identity-field]')){
        if(input.dataset.identityField==='birthDate')input.setCustomValidity(validBirthDate(input.value)?'':'생년월일 8자리를 확인해주세요. 실제 날짜이며 오늘 또는 그 이전이어야 합니다.');
        if(!input.reportValidity())return false;
      }
      for(const [i,r] of content.experiences.entries()){
        if(experienceId&&r.id!==experienceId)continue;
        const text=experienceText(r);
        for(const [key,label,limit] of [['title','키워드',2000],['content','내용',12000],['appeal','면접관에게 어필할 점',2000]]){
          if([...String(text[key]||'')].length>limit){tell(`경험 ${i+1}번의 ${label}은 ${limit.toLocaleString()}자 이하로 입력해주세요.`,true);return false;}
        }
        if(r.satisfaction!==''&&r.satisfaction!==undefined&&!/^(-([1-9]|1[0-9]|2[0-5])|[0-9]|1[0-9]|2[0-5])$/.test(String(r.satisfaction))){tell(errorMessage({code:'invalid_satisfaction'}),true);return false;}
        const age=String(r.age??'');
        const invalid=age!==''&&(!/^\d{1,3}$/.test(age)||Number(age)>120);
        if(invalid||(status==='submitted'||experienceId)&&!r.age){
          tell(`핵심 경험 ${i+1}번: `+errorMessage({code:invalid?'invalid_experience_date':'incomplete_experience_date'}),true);return false;
        }
      }
    }
    busy=true;
    const controls=[...host.querySelectorAll('button,input,textarea,select')].map(n=>[n,n.disabled]);
    controls.forEach(([n])=>n.disabled=true);
    try{
      let savedContent=structuredClone(content);
      if(experienceId){
        savedContent=structuredClone(profile?.content||blank());
        const row=structuredClone(content.experiences.find(r=>r.id===experienceId));
        const index=savedContent.experiences.findIndex(r=>r.id===experienceId);
        if(index<0)savedContent.experiences.push(row);else savedContent.experiences[index]=row;
      }
      const payload=admin?{targetStudentId:studentId,revision:profile?.revision||0,status:host.querySelector('[data-life-feedback-status]').value,feedback:host.querySelector('[data-life-feedback]').value}:
        {revision:profile?.revision||0,content:savedContent,status};
      const result=await request(admin?'admin_life_feedback':'life_save',payload);
      if(destroyed)return;
      for(const row of result.profile.content.experiences){
        if(followupProgress[row.id]&&!sameData(row,profile?.content.experiences.find(r=>r.id===row.id)))followupProgress[row.id].summary_ready=false;
      }
      profile=result.profile;dirty=!admin&&!sameData(content,profile.content);
      if(experienceId)editingExperiences.delete(experienceId);else editingExperiences.clear();
      render();tell(admin?'피드백을 공개했습니다.':status==='submitted'?(simpleEditor?'저장했습니다.':'첨삭을 요청했습니다.'):'서버에 저장했습니다.');
      return true;
    }catch(e){
      if(destroyed)return;
      if(['revision_conflict','unauthorized','not_enrolled'].includes(e.code||e.message))blocked=true;
      // Re-enable controls without replacing the unsaved form or its feedback.
      controls.forEach(([n,disabled])=>n.disabled=disabled);
      tell(errorMessage(e),true);
      return false;
    }finally{busy=false;}
  }
  host.oninput=e=>{
    e.stopPropagation();if(busy||destroyed)return;
    if(e.target.readOnly)return;
    selectEventSection(e.target);
    if(e.target.matches('[data-basic-field]')){content.basicInfo??=emptyBasic();const key=e.target.dataset.basicField;content.basicInfo[key]??={text:'',none:false};content.basicInfo[key].text=key==='birthDate'?normalizeBirthDate(e.target.value):e.target.value;if(key==='birthDate')e.target.setCustomValidity('');mark();}
    if(e.target.matches('[data-life-field]')){
      const row=currentRows().find(r=>r.id===e.target.dataset.row);if(row){row[e.target.dataset.lifeField]=e.target.value;mark();if(section==='qualifications'&&e.target.dataset.lifeField==='type'){const article=e.target.closest('[data-life-row]');for(const [key,label]of schema.qualifications){const node=article.querySelector(`[data-life-label="${key}"]`);if(node)node.textContent=qualificationLabel(row,key,label);}}if(section==='experiences')updateGraph();}
    }
    if(e.target.matches('[data-life-feedback]'))mark();
  };
  host.onchange=e=>{
    e.stopPropagation();if(busy||destroyed)return;
    selectEventSection(e.target);
    if(e.target.matches('select[data-life-field]'))host.oninput(e);
    if(e.target.matches('[data-school-status]')&&e.target.checked){content.basicInfo??=emptyBasic();content.basicInfo.school??={text:'',none:false};if(!content.basicInfo.school.none&&schoolStatuses.some(([id])=>id===e.target.value)){content.basicInfo.school.status=e.target.value;mark();}}
    if(e.target.matches('[data-identity-field]')){content.basicInfo??=emptyBasic();const key=e.target.dataset.basicField,value=key==='birthDate'?normalizeBirthDate(e.target.value):e.target.value;content.basicInfo[key]??={text:'',none:false};if(content.basicInfo[key].text!==value){content.basicInfo[key].text=value;mark();}if(key==='birthDate'){if(validBirthDate(value))e.target.value=value.replaceAll('-','');e.target.setCustomValidity(validBirthDate(value)?'':'생년월일 8자리를 확인해주세요. 실제 날짜이며 오늘 또는 그 이전이어야 합니다.');}}
    if(e.target.matches('[data-basic-none]')){content.basicInfo??=emptyBasic();const key=e.target.dataset.basicNone;content.basicInfo[key]??={text:'',none:false};content.basicInfo[key].none=e.target.checked;mark();const input=host.querySelector(`[data-basic-field="${key}"]`);if(input)input.disabled=e.target.checked;if(key==='school')host.querySelectorAll('[data-school-status]').forEach(n=>n.disabled=e.target.checked);}
    if(e.target.matches('[data-life-none]')){content.none=content.none.filter(k=>k!==section);if(e.target.checked)content.none.push(section);mark();render();}
    if(e.target.matches('[data-life-feedback-status]'))mark();
  };
  host.onclick=async e=>{
    e.stopPropagation();
    const point=e.target.closest('[data-life-point]');if(point&&!busy&&!destroyed&&!admin){e.preventDefault();openExperience(point.dataset.lifePoint);return;}
    const target=e.target.closest('[data-life-action]');if(!target||target.disabled||busy||destroyed)return;
    selectEventSection(target);
    const action=target.dataset.lifeAction;
    if(action==='section'){
      if(admin&&dirty&&!confirm('작성 중인 피드백을 버리고 다른 영역을 볼까요?'))return;
      if(admin)dirty=false;
      section=target.dataset.section;render();
    }else if(action==='add')add();
    else if(action==='edit-experience')editExperience(target.dataset.row);
    else if(action==='followup')await openFollowup(target.dataset.row);
    else if(action==='save-experience'){
      const id=target.dataset.row;target.textContent='저장 중…';
      const success=await save('draft',id);
      if(!success&&!destroyed){target.textContent='저장';const n=[...host.querySelectorAll('[data-experience-state]')].find(n=>n.dataset.experienceState===id);if(n)n.textContent=host.querySelector('[data-life-message]')?.textContent||'저장하지 못했습니다. 다시 시도해주세요.';}
    }
    else if(action==='up'){
      const rows=currentRows(),i=rows.findIndex(r=>r.id===target.dataset.row);
      if(i>0){[rows[i-1],rows[i]]=[rows[i],rows[i-1]];mark();render();}
    }else if(action==='remove'&&confirm('이 항목을 삭제할까요? 저장하면 삭제 내용이 반영됩니다.')){
      content[section]=currentRows().filter(r=>r.id!==target.dataset.row);mark();render();
    }else if(action==='reload'){
      if(dirty&&!confirm('저장하지 않은 입력을 버리고 최신 내용을 불러올까요?'))return;
      await load();
      await refreshFollowup();
    }else if(['save','submit','feedback'].includes(action))await save(action==='submit'?'submitted':'draft');
  };
  const ready=load();ready.then(refreshFollowup);
  host.onkeydown=e=>{const point=e.target.closest('[data-life-point]');if(point&&point.tagName.toLowerCase()!=='button'&&['Enter',' '].includes(e.key)){e.preventDefault();point.dispatchEvent(new MouseEvent('click',{bubbles:true}));}};
  return {ready,canLeave,async savePending(){
    if(busy||blocked||destroyed||!data)throw Error('save_failed');
    if(dirty&&!(await save('draft')))throw Error('save_failed');
  },destroy(){destroyed=true;followup?.destroy();closeExperience();window.removeEventListener('beforeunload',beforeUnload);host.oninput=null;host.onchange=null;host.onclick=null;host.onkeydown=null;}};
}
