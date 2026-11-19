import {mountPractice as mountRecordingPractice} from './interview-practice-core.mjs?v=20261119-input-check';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const symbols={
 mic:'<path fill="currentColor" d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M6 10v1a6 6 0 0 0 12 0v-1m-6 7v4m-4 0h8"/>',
 speaker:'<path fill="currentColor" d="M3 9h4l5-4v14l-5-4H3Z"/><path d="M16 8c2.2 2.1 2.2 5.9 0 8m3-11c3.8 3.8 3.8 10.2 0 14"/>',
 back:'<path d="m14 6-6 6 6 6"/>',
 next:'<path d="m9 6 6 6-6 6"/>',
 list:'<path d="M8 6h12M8 12h12M8 18h12M3 6h.1M3 12h.1M3 18h.1"/>',
 clock:'<path d="M3 11a9 9 0 1 1 3 8M3 5v6h6m3-5v6l4 2"/>',
 star:'<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z"/>'
};
const icon=name=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${symbols[name]||''}</svg>`;
const button=(label,action,{primary=false,disabled=false,attrs='',className=''}={})=>`<button type="button" class="ip-mock-practice-button ${primary?'is-primary':''} ${className}" data-practice-action="${action}" ${disabled?'disabled':''} ${attrs}>${label}</button>`;
const formatDate=value=>new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'});
const time=value=>Math.floor(value/60)+':'+String(Math.floor(value%60)).padStart(2,'0');

export function renderPractice(state){
 const {screen,mode,busy,talking,countdown,index,selected,run,field,region,count,stars,notice,fields,all,catalog,favorites,records,progress,audio}=state;
 const title=mode==='job'?'직무(전공) 연습모드':'인성 연습모드';
 const pageTitle={catalog:'질문 골라 연습',records:'내 면접 기록',result:'면접 결과',review:'답변 돌아보기'}[screen];
 const active=['live','review'].includes(screen);
 const closeLabel=screen==='home'?'닫기':'뒤로';
 let html=`<section class="ip-mock-practice" data-practice-screen="${screen}" aria-label="${title}"><nav class="ip-mock-practice-nav" aria-label="면접 화면"><button type="button" data-practice-action="back" aria-label="${closeLabel}">${icon('back')}<span>${closeLabel}</span></button><h1>모의면접</h1><span aria-hidden="true"></span></nav><div class="ip-mock-practice-content"><header class="ip-mock-practice-heading"><span class="ip-mock-practice-beta">베타</span><div class="ip-mock-practice-title"><h2>${title}</h2><span>${esc(run&&['result','review'].includes(screen)?run.track:catalog?.track||'')}</span></div></header>`;
 if(pageTitle)html+=`<h3 class="ip-mock-practice-page-title">${pageTitle}</h3>`;
 const select=(label,attribute,value,options)=>`<label class="ip-mock-practice-select"><span>${label}</span><select ${attribute} ${busy?'disabled':''}>${options.map(([id,text])=>`<option value="${esc(id)}" ${String(value)===String(id)?'selected':''}>${esc(text)}</option>`).join('')}</select></label>`;
 const fieldChoice=label=>select(label,'data-practice-field',field,[['','전체 분야'],...fields.map(f=>[f.id,f.label])]);
 const regions=[...new Set((catalog?.questions||[]).flatMap(q=>q.regions||[]))].sort();
 if(screen==='home'||screen==='settings'){
  html+=`<div class="ip-mock-practice-selection ${mode==='job'?'has-region':''}">${fieldChoice(mode==='job'?'내용 분야':'인성 분야')}${mode==='job'?select('기출 지역','data-practice-region',region,[['','전체 지역'],...regions.map(r=>[r,r])]):''}</div>${select('연습 문항 수','data-practice-count',count,[3,5,10,15,20].map(n=>[n,n+'문항']))}`;
  if(catalog&&!all.length)html+='<p class="ip-mock-practice-note">선택 조건에 맞는 공개 문항이 없습니다. 분야나 지역을 변경해주세요.</p>';
  html+=button(busy?'준비 중…':'연습 시작','configured',{primary:true,disabled:busy||!catalog||!all.length});
  html+=`<div class="ip-mock-practice-menu">${button(`${icon('list')}<span>질문 골라 연습<small>분야별 질문 · 즐겨찾기</small></span>${icon('next')}`,'catalog',{disabled:busy||!catalog})}${button(`${icon('clock')}<span>내 면접 기록<small>지난 답변 다시 듣기</small></span>${icon('next')}`,'records',{disabled:busy})}</div>`;
  if(!catalog&&!busy)html+=button('문항 목록 다시 불러오기','retry',{primary:true});
 }
 if(screen==='catalog'){
  html+=fieldChoice('분야');
  html+=`<div class="ip-mock-practice-segments" aria-label="질문 보기">${button('전체 질문','all',{attrs:`aria-pressed="${!stars}"`})}${button('즐겨찾기','stars',{attrs:`aria-pressed="${stars}"`})}</div>`;
  const questions=all.filter(q=>!stars||favorites.has(q.id));html+=`<p class="ip-mock-practice-note">질문 ${questions.length}개${mode==='job'&&region?' · '+esc(region):''}</p>`;
  html+=questions.map(q=>`<article class="ip-mock-practice-card"><div class="ip-mock-practice-question-row"><h4>${esc(q.prompt)}</h4>${button(icon('star'),'favorite',{attrs:`data-id="${esc(q.id)}" aria-label="${favorites.has(q.id)?'즐겨찾기 해제':'즐겨찾기 추가'}" aria-pressed="${favorites.has(q.id)}"`,className:'ip-mock-practice-star'})}</div><p class="ip-mock-practice-note" data-progress="${esc(q.id)}">${esc(progress(q.id))}</p>${button('이 질문 연습하기','one',{attrs:`data-id="${esc(q.id)}"`,disabled:busy})}</article>`).join('')||`<p class="ip-mock-practice-note">${stars?'즐겨찾기한 질문이 없습니다. 질문 옆의 별을 눌러 저장해보세요.':'선택한 조건에 맞는 질문이 없습니다.'}</p>`;
 }
 if(screen==='live'){
  const preparing=countdown!==null;
  html+=`<div class="ip-mock-practice-turn"><strong>질문 ${index+1} / ${selected.length}</strong>${button('다시 듣기','replay',{disabled:preparing||talking||busy,className:'ip-mock-practice-text-button'})}</div><p class="ip-mock-practice-clock"><span data-practice-elapsed>0:00</span> / ${time(Math.max(600,selected.length*120))}</p>`;
  html+=`<div class="ip-mock-practice-voice ${talking?'is-speaking':''}" aria-label="${preparing?'면접 준비':talking?'면접관 질문 음성':'내 답변 음성'}"><div class="ip-mock-practice-voice-icon">${icon(talking?'speaker':'mic')}</div><div class="ip-mock-practice-voice-status">${icon(talking?'speaker':'mic')}<span class="ip-mock-practice-wave" data-practice-wave>${[0,1,2,3,4].map(n=>`<i style="--bar:${n}"></i>`).join('')}</span><small>${preparing?'준비':talking?'질문':'답변'}</small></div><progress data-level max="1" value="0" hidden></progress></div>`;
  html+=`<p class="ip-mock-practice-turn-status" data-live-status>${preparing?'면접 준비 중':talking?'질문을 듣는 중':'이제 답변해 주세요'}</p><p class="ip-mock-practice-prompt ${preparing?'is-countdown':''}">${preparing?countdown:esc(selected[index]?.prompt)}</p>`;
  html+=button(preparing?'면접 준비 중':talking?'질문 듣는 중':'답변 완료 →','answer',{primary:true,disabled:preparing||talking||busy})+button('면접 종료','end',{disabled:busy});
 }
 const turnCard=turn=>`<article class="ip-mock-practice-card"><h4>${turn.number}. ${esc(turn.question)}</h4><p class="ip-mock-practice-note">내 답변 · ${Math.round(turn.duration)}초</p><audio controls preload="metadata" src="${esc(audio(turn.blob))}"></audio></article>`;
 if(screen==='review'){
  html+=turnCard(run.turns.at(-1))+button(index+1===selected.length?'결과 보기':'다음 질문 →','next',{primary:true,disabled:busy})+button('면접 종료','end',{disabled:busy});
 }
 if(screen==='result'){
  html+=`<p class="ip-mock-practice-note">답변 ${run.turns.length} / ${run.questionCount}개 · ${run.completed?'면접 완료':'중단된 면접'}</p>`;
  html+=run.turns.map(turnCard).join('')||'<p class="ip-mock-practice-note">저장된 답변이 없습니다.</p>';
  html+=button('같은 질문으로 다시 연습','repeat',{primary:true,disabled:busy||!run.turns.length})+button('연습 홈으로','home')+button('내 면접 기록','records');
 }
 if(screen==='records'){
  html+=button('연습 홈으로','home');
  html+=records.map(r=>`<article class="ip-mock-practice-card"><h4>${esc(formatDate(r.recordedAt))}</h4><p class="ip-mock-practice-note">${esc(r.track)} · 답변 ${r.turns.length}/${r.questionCount}개 · ${r.completed?'완료':'중단'}</p>${r.fieldLabel||r.region?`<p class="ip-mock-practice-note">${esc([r.fieldLabel,r.region].filter(Boolean).join(' · '))}</p>`:''}${button('기록 보기','record',{attrs:`data-id="${esc(r.runId)}"`})}${button('기록 삭제','delete',{attrs:`data-id="${esc(r.runId)}"`,className:'ip-mock-practice-delete'})}</article>`).join('')||'<p class="ip-mock-practice-note">아직 저장된 기록이 없습니다.</p>';
 }
 if(notice)html+=`<p class="ip-mock-practice-notice" role="status">${esc(notice)}</p>`;
 return html+'</div></section>';
}

export async function mountPractice(host,options){
 if(!document.querySelector('[data-practice-styles]')){
  const link=document.createElement('link');link.rel='stylesheet';link.href='/client/interview-practice.css?v=20261118-app-ui';link.dataset.practiceStyles='';document.head.appendChild(link);
 }
 return mountRecordingPractice(host,{...options,renderView:renderPractice});
}
