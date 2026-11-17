const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function mountQuestionExample(host,{id,request,canWrite,onDirtyChange=()=>{},onClose=()=>{}}){
 let destroyed=false,saving=false,data,dirty=false;
 const date=value=>value?new Date(value).toLocaleString('ko-KR'):'수정 이력 없음';
 function render(){
  const example=data.example||{},sources=data.sources||[];
  host.innerHTML=`<div class="ip-row"><h3>해설·예시답변</h3><button type="button" class="ip-btn" data-example-close>닫기</button></div><p><strong>${esc(data.question.prompt)}</strong></p>
   <section aria-label="원본 출처와 해설"><h4>원본 출처와 해설</h4>${sources.map(source=>`<article class="ip-question"><p class="ip-help">${esc([source.year,source.track,source.region,source.number?'Q'+source.number:''].filter(Boolean).join(' · '))}<br>${esc(source.filename)} · ${esc(source.locator)}</p><div class="ip-feedback">${esc(source.answer?.trim()||'이 출처에는 해설이 등록되어 있지 않습니다.')}</div></article>`).join('')||'<p class="ip-help">등록된 원본 출처와 해설이 없습니다.</p>'}</section>
   <form data-example-form><label>앱에 표시할 예시답변<textarea name="answer" maxlength="20000" required ${canWrite?'':'readonly'} placeholder="예시답변을 입력해주세요.">${esc(example.answer)}</textarea></label>
   ${example.stale?'<p role="alert">질문이 수정되어 기존 예시답변의 재검토가 필요합니다. 내용을 확인하고 다시 저장해주세요.</p>':''}
   <p class="ip-help">원본 해설은 보존됩니다. 저장한 예시답변은 새 연습에 사용되며, 이미 저장된 예시답변과 결과는 유지됩니다.</p>
   <p class="ip-help">${example.custom?'저장 버전 '+esc(example.revision)+' · '+esc(example.updatedBy)+' · '+esc(date(example.updatedAt)):'아직 별도로 저장한 예시답변이 없습니다. 원본 해설을 기준으로 수정할 수 있습니다.'}</p>
   <div class="ip-toolbar">${canWrite?'<button class="ip-btn ip-primary" type="submit" data-example-save>예시답변 저장</button>':'<span class="ip-help">읽기 권한으로 열었습니다. 수정·저장은 편집 권한이 필요합니다.</span>'}<button type="button" class="ip-btn" data-example-reload>다시 불러오기</button></div><p role="status" data-example-status></p></form>
   ${(data.exampleHistory||[]).length?`<details><summary>최근 수정 이력</summary>${data.exampleHistory.map(row=>`<p class="ip-help">버전 ${esc(row.revision)} · ${esc(row.updated_by)} · ${esc(date(row.updated_at))}</p>`).join('')}</details>`:''}`;
 }
 async function load(){
  host.innerHTML='<p role="status">해설과 예시답변을 불러오는 중…</p>';
  try{const next=await request('admin_question_example_detail',{id});if(destroyed)return;data=next;dirty=false;onDirtyChange(false);render();}
  catch{if(!destroyed)host.innerHTML='<p role="alert">해설을 불러오지 못했습니다. 연결과 이용 권한을 확인해주세요.</p><button class="ip-btn" data-example-reload>다시 불러오기</button><button class="ip-btn" data-example-close>닫기</button>';}
 }
 host.oninput=e=>{if(e.target.name==='answer'&&data){dirty=e.target.value!==(data.example?.answer||'');onDirtyChange(dirty);}};
 host.onclick=async e=>{
  if(e.target.closest('[data-example-close]')){e.stopPropagation();if(!saving)onClose();}
  if(e.target.closest('[data-example-reload]')){e.stopPropagation();if(!saving&&(!dirty||confirm('입력한 내용을 버리고 저장된 예시답변을 다시 불러올까요?')))await load();}
 };
 host.onsubmit=async e=>{
  e.preventDefault();e.stopPropagation();if(!canWrite||saving||!data)return;
  const answer=new FormData(e.target).get('answer')?.trim();
  const status=host.querySelector('[data-example-status]');
  if(!answer){status.textContent='예시답변 내용을 입력해주세요.';return;}
  saving=true;host.querySelectorAll('button,textarea').forEach(node=>node.disabled=true);status.textContent='저장 중…';
  try{
   const saved=await request('admin_question_example_save',{id,revision:data.example?.revision||0,questionRevision:data.question.revision,answer});
   if(destroyed)return;data=saved;dirty=false;onDirtyChange(false);render();host.querySelector('[data-example-status]').textContent='예시답변을 저장했습니다.';
  }catch(error){if(!destroyed){status.setAttribute('role','alert');status.textContent=error.message==='revision_conflict'?'다른 곳에서 문항 또는 예시답변이 수정됐습니다. 입력한 내용은 유지했습니다. 복사해 둔 뒤 다시 불러와 확인해주세요.':'저장하지 못했습니다. 입력한 내용은 유지했으니 연결을 확인하고 다시 저장해주세요.';}}
  finally{saving=false;if(!destroyed)host.querySelectorAll('button,textarea').forEach(node=>node.disabled=false);}
 };
 const ready=load();
 return {ready,canLeave:()=>!saving,destroy(){destroyed=true;host.oninput=null;host.onclick=null;host.onsubmit=null;host.replaceChildren();}};
}
