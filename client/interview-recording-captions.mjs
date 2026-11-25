export function captionEstimate(estimate){
 if(estimate?.state==='completed')return '녹음 자막이 준비되었습니다.';
 if(estimate?.state==='uploading')return '녹음 전송이 끝나면 예상 소요 시간을 안내합니다.';
 if(estimate?.state==='waiting')return '자막 변환 대기 중입니다. 작업이 재개되면 예상 시간을 안내합니다.';
 if(estimate?.state==='failed')return '일부 녹음 자막을 만들지 못했습니다. 저장된 녹음은 계속 들을 수 있습니다.';
 if(estimate?.state==='unavailable')return '자막을 만들 수 있는 녹음이 없습니다.';
 if(estimate?.state!=='pending')return '예상 소요 시간을 확인하고 있습니다.';
 const min=Math.max(1,Math.ceil(estimate.minSeconds/60)),max=Math.max(min,Math.ceil(estimate.maxSeconds/60));
 return `녹음 자막 완료까지 약 ${min===max?min:min+'~'+max}분 예상됩니다. 녹음 길이와 대기 상황에 따라 달라질 수 있습니다.`;
}
export function captionMessage(row){
 if(row?.status==='completed')return row.studentText!=null?(row.studentText.trim()||'수정한 자막 내용이 없습니다.'):(row.text?.trim()||'녹음에서 인식된 음성이 없습니다.');
 return {uploading:'녹음 전송 후 자막을 준비합니다.',pending:'녹음 자막 준비 중입니다.',processing:'녹음 자막을 만들고 있습니다.',failed:'녹음 자막을 만들지 못했습니다. 저장된 녹음은 계속 들을 수 있습니다.',unavailable:'자막을 만들 수 있는 녹음이 없습니다.'}[row?.status]||'녹음 자막을 확인하고 있습니다.';
}
export const captionSlot=number=>`<section class="ip-recording-caption" data-recording-caption="${Number(number)}" aria-label="녹음 자막"><strong>녹음 자막</strong><p data-caption-text>${captionMessage(null)}</p><small data-caption-edited></small><button type="button" class="ip-mock-practice-button ip-btn" data-caption-action="edit" hidden>자막 수정</button><div data-caption-editor hidden><textarea aria-label="녹음 자막 수정" data-caption-input maxlength="30000" rows="7"></textarea><button type="button" class="ip-mock-practice-button ip-btn" data-caption-action="save">수정 저장</button><button type="button" class="ip-mock-practice-button ip-btn" data-caption-action="cancel">취소</button><p data-caption-save-status role="status" aria-live="polite"></p></div></section>`;
export const captionNotice=()=>`<div class="ip-recording-caption-status" data-caption-overview hidden><p data-caption-estimate></p><p data-caption-status role="status" aria-live="polite" hidden></p></div>`;

// Update caption nodes only: polling must never replace or interrupt audio players.
export function createRecordingCaptions({host,request,intervalMs=30000,maxPolls=20}){
 let run=null,rows=[],estimate,error=false,loading=false,closed=false,generation=0,timer,polls=0;
 const drafts=new Map();
 const pending=()=>['pending','waiting','uploading'].includes(estimate?.state)||run?.turns.some(t=>!['completed','failed','unavailable'].includes(rows.find(r=>r.number===t.number)?.status));
 function paint(){
  for(const slot of host.querySelectorAll('[data-recording-caption]')){
   const row=rows.find(r=>r.number===Number(slot.dataset.recordingCaption));
   slot.querySelector('[data-caption-text]').textContent=error&&!row?'연결 상태를 확인하고 기록을 다시 열어주세요.':captionMessage(row);
   const draft=drafts.get(Number(slot.dataset.recordingCaption));
   slot.querySelector('[data-caption-text]').hidden=!!draft;
   slot.querySelector('[data-caption-edited]').hidden=!!draft;
   slot.querySelector('[data-caption-edited]').textContent=row?.studentText!=null?'직접 수정한 자막'+(row.studentUpdatedAt?' · '+new Date(row.studentUpdatedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):''):'';
   slot.querySelector('[data-caption-action=edit]').hidden=row?.status!=='completed'||!!draft;
   slot.querySelector('[data-caption-editor]').hidden=!draft;
   if(draft){const input=slot.querySelector('[data-caption-input]');if(input.value!==draft.text)input.value=draft.text;input.disabled=draft.saving;
    slot.querySelectorAll('[data-caption-action=save],[data-caption-action=cancel]').forEach(b=>b.disabled=draft.saving);
    slot.querySelector('[data-caption-save-status]').textContent=draft.saving?'저장 중…':draft.error||'';}
  }
  const timing=host.querySelector('[data-caption-estimate]');if(timing){timing.textContent=captionEstimate(estimate);timing.hidden=!pending()||error;}
  const status=host.querySelector('[data-caption-status]');
  if(status){status.textContent=error?'녹음 자막을 불러오지 못했습니다. 연결 상태를 확인하고 기록을 다시 열어주세요.':'';status.hidden=!error;}
  const overview=host.querySelector('[data-caption-overview]');if(overview)overview.hidden=(!timing||timing.hidden)&&(!status||status.hidden);
 }
 function schedule(){clearTimeout(timer);if(!closed&&run&&!document.hidden&&!error&&pending()&&polls<maxPolls)timer=setTimeout(()=>void refresh(),intervalMs);}
 async function refresh(){
  if(closed||!run||loading||document.hidden)return;
  const ticket=generation,id=run.runId;loading=true;error=false;clearTimeout(timer);paint();
  try{
   const result=await request('/api/interview-practice-records',{action:'captions',runId:id});
   if(closed||ticket!==generation)return;
   if(result.runId!==id||!Array.isArray(result.captions))throw Error('invalid_captions');
   rows=result.captions.map(row=>{const prior=rows.find(r=>r.number===row.number);return (prior?.studentRevision??0)>(row.studentRevision??0)?prior:row;});estimate=result.estimate;polls++;
  }catch{if(!closed&&ticket===generation)error=true;}
  finally{if(!closed&&ticket===generation){loading=false;paint();schedule();}}
 }
 function show(value){
  const next=value?.turns.length?value:null;
  if(next?.runId===run?.runId){run=next;paint();return;}
  generation++;clearTimeout(timer);run=next;rows=[];estimate=null;drafts.clear();loading=false;error=false;polls=0;paint();if(run)void refresh();
 }
 async function save(number){
  const draft=drafts.get(number);if(!run||!draft||draft.saving)return;
  const id=run.runId,ticket=generation;draft.saving=true;draft.error='';paint();
  try{
   const result=await request('/api/interview-practice-records',{action:'caption_update',runId:id,mode:run.mode,number,studentRevision:draft.revision,text:draft.text});
   if(closed||ticket!==generation)return;
   if(result.runId!==id||result.caption?.number!==number)throw Error('invalid_captions');
   rows=rows.map(r=>r.number===number?result.caption:r);drafts.delete(number);
  }catch(e){if(!closed&&ticket===generation){draft.saving=false;draft.error=e.code==='revision_conflict'||e.message==='revision_conflict'?'다른 화면에서 먼저 수정했습니다. 입력한 내용을 복사한 뒤 취소하고 기록을 다시 열어주세요.':'수정본을 저장하지 못했습니다. 입력한 내용은 유지됩니다. 다시 저장해주세요.';}}
  finally{if(!closed&&ticket===generation)paint();}
 }
 function click(event){
  const button=event.target.closest('[data-caption-action]'),slot=button?.closest('[data-recording-caption]');if(!slot||button.disabled)return;
  const number=Number(slot.dataset.recordingCaption),row=rows.find(r=>r.number===number);
  if(button.dataset.captionAction==='edit'&&row?.status==='completed'){const text=row.studentText??row.text;drafts.set(number,{text,initial:text,revision:row.studentRevision??0,saving:false,error:''});paint();slot.querySelector('textarea').focus();}
  if(button.dataset.captionAction==='cancel'){drafts.delete(number);paint();}
  if(button.dataset.captionAction==='save')void save(number);
 }
 function input(event){const slot=event.target.closest('[data-recording-caption]');if(!slot||!event.target.matches('[data-caption-input]'))return;const draft=drafts.get(Number(slot.dataset.recordingCaption));if(draft){draft.text=event.target.value;draft.error='';}}
 const unsaved=()=>[...drafts.values()].some(d=>d.saving||d.text!==d.initial);
 function unload(event){if(unsaved()){event.preventDefault();event.returnValue='';}}
 function visibility(){if(document.hidden)clearTimeout(timer);else if(run&&pending())void refresh();}
 host.addEventListener('click',click);host.addEventListener('input',input);document.addEventListener('visibilitychange',visibility);window.addEventListener('beforeunload',unload);
 return {show,refresh,allowLeave(){return ![...drafts.values()].some(d=>d.saving)&&(!unsaved()||confirm('저장하지 않은 녹음 자막 수정 내용이 있습니다. 이동할까요?'));},destroy(){closed=true;generation++;clearTimeout(timer);drafts.clear();host.removeEventListener('click',click);host.removeEventListener('input',input);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('beforeunload',unload);}};
}
