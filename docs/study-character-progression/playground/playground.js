'use strict';
let ownSeconds = 0;
let tone = 'navy';
let equipped = false;
let previousTick = performance.now();
let crossingStopAt = null;
const STUDY_CAFE_PREVIEW_EPOCH = Date.now();
const studyCafeRemoteState = { lastLoadedAt: Date.now(), studyDateKey: formatStudyBusinessDateKey(new Date()) };
const studyCafePreviewState = { running: true, hairStyle: 'default' };
const getAuthedStudent = () => ({ student_category: 'lecture' });
const getStudentCategory = student => student.student_category;
const getStudySubjectTotalElapsedMs = () => ownSeconds * 1000;
const equipment = [{id:'outfit_coast_guard_uniform',slot:'outfit'}, {id:'head_coast_guard_dress_cap',slot:'head',icon:'🧢'}, {id:'desk_plant',slot:'desk',icon:'🪴'}, {id:'desk_lamp',slot:'desk',icon:'💡'}, {id:'desk_clock',slot:'desk',icon:'⏰'}, {id:'desk_laptop',slot:'desk',icon:'💻'}];
const getStudyCafeEquippedOutfitClass = () => equipped ? 'shop-outfit-coast-guard-uniform' : '';
const getStudyCafeEquippedChairClass = () => '';
const renderStudyCafeShopCosmetic = slot => equipped ? renderStudyCafePublicCosmetics(equipment, slot) : null;
const renderStudyCafeDeskCosmetics = () => equipped ? renderStudyCafePublicCosmetics(equipment, 'desk') : null;
const $ = id => document.getElementById(id);
const hours = [0,3,5,7,9,10];
const formatTime = seconds => { const value = Math.floor(seconds); return [Math.floor(value/3600),Math.floor(value%3600/60),value%60].map(n=>String(n).padStart(2,'0')).join(':'); };
function renderScene(mine = true, h = 0, detail = false) {
  return renderStudyCafeSeatedVisual(tone, mine, {className: detail ? 'study-cafe-member-seat-scene' : '', studying: studyCafePreviewState.running, hairStyle: studyCafePreviewState.hairStyle, equipment: equipped ? equipment : [], fireSource: {todaySeconds:h*3600,remote:true,status:'paused'}});
}
function rebuildCharacters() {
  $('hero').replaceChildren(renderScene(true,0,true));
  $('selected-seat').replaceChildren(el('span',{className:'study-cafe-seat-number'},'나'),el('time',{className:'study-cafe-member-time',id:'seat-time'}),renderScene());
  $('progress').replaceChildren(renderStudyCafeFireProgress());
  $('comparison').replaceChildren(...hours.map((h,i)=>{
    const button=el('button',{type:'button',className:'comparison-item','data-hour':String(h),onclick:()=>selectTime(h*3600),'aria-label':`${h}시간 캐릭터 보기`},[
      el('strong',{},h ? `${h}시간` : '기본'),
      el('span',{className:'study-cafe-seat comparison-seat'},[el('span',{className:'study-cafe-seat-number'},String(i+1)),el('time',{className:'study-cafe-member-time'},formatTime(h*3600)),renderScene(false,h)]),
      el('small',{},StudyCharacterStyles.fire.names[i])]);
    return button;
  }));
  updateDisplay();
}
function updateDisplay() {
  studyCafeRemoteState.studyDateKey=formatStudyBusinessDateKey(new Date());
  const formatted=formatTime(ownSeconds);
  $('time-display').textContent=formatted;
  $('seat-time').textContent=formatted;
  $('seconds-range').value=String(Math.floor(ownSeconds));
  if(document.activeElement!==$('time-input'))$('time-input').value=formatted;
  $('status').textContent=studyCafePreviewState.running?'공부 중':'휴식 중';
  $('pause').textContent=studyCafePreviewState.running?'휴식으로 전환':'공부로 전환';
  $('pause').setAttribute('aria-pressed',String(!studyCafePreviewState.running));
  const stage=StudyCharacterStyles.fire.getStage(ownSeconds);
  document.querySelectorAll('[data-hour]').forEach(button=>{const active=StudyCharacterStyles.fire.getStage(Number(button.dataset.hour)*3600)===stage;button.classList.toggle('selected',active);button.setAttribute('aria-pressed',String(active));});
  // Keep character nodes in place so actual 800ms fire transitions are visible.
  document.querySelectorAll('#hero .study-cafe-seat-visual,#selected-seat .study-cafe-seat-visual').forEach(scene=>{scene.classList.toggle('is-studying',studyCafePreviewState.running);scene.classList.toggle('is-idle',!studyCafePreviewState.running);});
  updateStudyCafeFireStages();
}
function setTime(seconds) { ownSeconds=Math.min(43200,Math.max(0,seconds));updateDisplay(); }
function selectTime(seconds) { $('auto').checked=false;crossingStopAt=null;$('time-error').textContent='';setTime(seconds); }
hours.forEach(h=>$('stage-buttons').appendChild(el('button',{type:'button','data-hour':String(h),onclick:()=>selectTime(h*3600)},h ? `${h}시간` : '기본')));
StudyCharacterStyles.styles.forEach(style=>$('hair').appendChild(el('option',{value:style.id},style.name)));
$('seconds-range').addEventListener('input',e=>selectTime(Number(e.target.value)));
function applyTime(){const match=$('time-input').value.trim().match(/^(\d{1,2}):([0-5]\d):([0-5]\d)$/);const seconds=match?Number(match[1])*3600+Number(match[2])*60+Number(match[3]):-1;if(seconds<0||seconds>43200){$('time-error').textContent='00:00:00~12:00:00 범위로 입력해주세요.';return;}$('time-input').value=formatTime(seconds);selectTime(seconds);}
$('apply-time').onclick=applyTime;
$('time-input').addEventListener('keydown',event=>{if(event.key==='Enter')applyTime();});
[['before',-1],['exact',0],['after',1]].forEach(([id,offset])=>$(id).onclick=()=>selectTime(Number($('threshold').value)*3600+offset));
$('crossing').onclick=()=>{const target=Number($('threshold').value)*3600;selectTime(target-2);studyCafePreviewState.running=true;$('speed').value='1';$('auto').checked=true;crossingStopAt=target+2;previousTick=performance.now();updateDisplay();};
$('pause').onclick=()=>{studyCafePreviewState.running=!studyCafePreviewState.running;previousTick=performance.now();updateDisplay();};
$('auto').onchange=()=>{crossingStopAt=null;previousTick=performance.now();};
$('speed').onchange=()=>{crossingStopAt=null;previousTick=performance.now();};
$('hair').onchange=()=>{studyCafePreviewState.hairStyle=$('hair').value;rebuildCharacters();};
$('tone').onchange=()=>{tone=$('tone').value;rebuildCharacters();};
$('equipment').onchange=()=>{equipped=$('equipment').checked;rebuildCharacters();};
rebuildCharacters();
window.setInterval(()=>{const now=performance.now();const delta=Math.min((now-previousTick)/1000,.5);previousTick=now;if(document.visibilityState==='hidden'||!$('auto').checked||!studyCafePreviewState.running)return;setTime(ownSeconds+delta*Number($('speed').value));if(ownSeconds>=43200||(crossingStopAt!==null&&ownSeconds>=crossingStopAt)){$('auto').checked=false;crossingStopAt=null;}},100);
