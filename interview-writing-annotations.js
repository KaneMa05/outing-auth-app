const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={underline:'밑줄',strike:'빨간 취소선',bracket:'괄호',comment:'코멘트',color:'글자색 적용'};
const validColor=value=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value);
// Only original text contributes to offsets. Inline comments never shift them.
export function validMarks(text,marks){
 const length=[...text].length;
 return (Array.isArray(marks)?marks:[]).filter(m=>m&&Object.hasOwn(labels,m.type)&&Number.isInteger(m.start)&&Number.isInteger(m.end)&&m.start>=0&&(m.type==='comment'?m.start<=m.end:m.start<m.end)&&m.end<=length&&typeof m.note==='string'&&m.note.length<=1000&&(m.color===undefined||validColor(m.color))&&(m.type!=='color'||validColor(m.color))).slice(0,100);
}
const comment=(note,index,{editing=false,disabled=false,legacy=false,color}={})=>`<span class="ip-inline-comment" data-comment-container ${editing?'contenteditable="false"':''} ${validColor(color)?`style="color:${color}"`:''}>〔<span class="ip-comment-label">교사: </span><span ${legacy?'data-inline-legacy':`data-inline-comment="${index}"`} ${editing?`contenteditable="${disabled?'false':'plaintext-only'}" role="textbox" aria-label="${legacy?'기존 교사 코멘트':`${index+1}번 교사 코멘트`}" aria-multiline="true" aria-readonly="${disabled}" data-placeholder="여기에 코멘트를 입력하세요"`:''}>${esc(note)}</span>${editing?`<button type="button" class="ip-comment-remove" ${legacy?'data-remove-legacy':`data-remove-comment="${index}"`} aria-label="${legacy?'기존 코멘트':`${index+1}번 코멘트`} 삭제" ${disabled?'disabled':''}>×</button>`:''}〕</span>`;
export function annotatedText(text='',marks=[],options={}){
 const chars=[...text],safe=validMarks(text,marks),cuts=[...new Set([0,chars.length,...safe.flatMap(m=>[m.start,m.end])])].sort((a,b)=>a-b);
 const notesAt=offset=>safe.map((m,index)=>m.end===offset&&(m.note||options.editing&&m.type==='comment')?comment(m.note,index,{...options,color:m.color}):'').join('');
 const result=notesAt(0)+cuts.slice(0,-1).map((start,i)=>{
  const end=cuts[i+1],active=safe.filter(m=>m.type!=='comment'&&m.start<=start&&m.end>=end);
  const classes=[...new Set(active.map(m=>'ip-mark-'+m.type))];
  if(safe.some(m=>m.type==='bracket'&&m.start===start))classes.push('ip-bracket-start');
  if(safe.some(m=>m.type==='bracket'&&m.end===end))classes.push('ip-bracket-end');
  const color=active.filter(m=>m.type==='color').at(-1)?.color;
  return `<span ${color?`style="color:${color}"`:''} data-original-start="${start}" data-original-end="${end}" class="${classes.join(' ')}">${esc(chars.slice(start,end).join(''))}</span>${notesAt(end)}`;
 }).join('');
 return result+(options.feedback?comment(options.feedback,-1,{...options,legacy:true}):'');
}
export function writingCorrections(saved){
 if(!saved?.annotation_marks?.length&&!saved?.feedback)return '';
 const body=saved.feedback_body??(saved.feedback_revision===saved.submitted_revision?saved.submitted_body:'')??'';
 const prior=saved.feedback_revision!==saved.submitted_revision?'이전 제출 · ':'';
 return `<div class="ip-corrections"><strong>${prior}${saved.feedback_round||saved.submission_round||1}차 원문 첨삭</strong><div class="ip-annotated-text">${annotatedText(body,saved.annotation_marks,{feedback:saved.feedback})}</div></div>`;
}
export function mountAnnotations(host,{text='',marks=[],feedback='',canWrite=false,onChange=()=>{}}){
 let current=validMarks(text,marks).map(m=>({...m})),legacy=feedback,selection=null,commentIndex=null,disabled=!canWrite;
 let sourceComposition=null,compositionTimer=null;
 const undo=[];
 const snapshot=()=>{undo.push({marks:current.map(m=>({...m})),legacy});if(undo.length>100)undo.shift();};
 host.innerHTML=`<div class="ip-annotation-editor"><div class="ip-toolbar" aria-label="원문 첨삭 도구">${Object.entries(labels).filter(([id])=>id!=='comment').map(([id,label])=>`${id==='color'?`<label class="ip-color-control">글자색<input type="color" data-mark-color value="#c62828" aria-label="첨삭 글자색 선택" ${disabled?'disabled':''}></label>`:''}<button type="button" class="ip-btn" data-mark="${id}" ${disabled?'disabled':''}>${label}</button>`).join('')}<button type="button" class="ip-btn" data-mark-clear ${disabled?'disabled':''}>선택 표시 지우기</button><button type="button" class="ip-btn" data-mark-undo disabled>되돌리기</button></div><p class="ip-help">문장을 선택해 밑줄·취소선·괄호를 표시하세요. 원문의 원하는 위치를 클릭해 바로 입력하면 교사 코멘트가 들어갑니다. 학생 원문은 그대로 보존됩니다. 글자색은 문장을 선택하거나 코멘트를 누른 뒤 색을 골라 적용하세요.</p><p role="status" data-mark-message></p><div class="ip-annotated-text ip-annotation-source" tabindex="0" role="textbox" aria-multiline="true" contenteditable="${disabled?'false':'true'}" aria-readonly="${disabled}" aria-label="원문 첨삭 편집기" data-mark-source></div></div>`;
 const source=host.querySelector('[data-mark-source]'),message=host.querySelector('[data-mark-message]');
 const syncUndo=()=>{host.querySelector('[data-mark-undo]').disabled=disabled||!undo.length;};
 const changed=()=>{syncUndo();onChange();};
 function render(){selection=null;commentIndex=null;source.innerHTML=annotatedText(text,current,{editing:true,disabled,feedback:legacy});syncUndo();}
 const pointOffset=(container,offset)=>{
  const prefix=document.createRange();prefix.selectNodeContents(source);prefix.setEnd(container,offset);
  const fragment=prefix.cloneContents();fragment.querySelectorAll('[data-comment-container]').forEach(n=>n.remove());
  return [...fragment.textContent].length;
 };
 const capture=()=>{
  if(sourceComposition)return;
  const s=window.getSelection();if(!s?.rangeCount)return;
  const range=s.getRangeAt(0),insideComment=n=>(n.nodeType===1?n:n.parentElement)?.closest('[data-comment-container]');
  if(!source.contains(range.startContainer)||!source.contains(range.endContainer))return;
  const note=insideComment(range.startContainer),endNote=insideComment(range.endContainer);
  if(note||endNote){
   if(note&&note===endNote){const field=note.querySelector('[data-inline-comment],[data-inline-legacy]');commentIndex=field?.hasAttribute('data-inline-legacy')?-1:Number(field?.dataset.inlineComment);selection=null;}
   return;
  }
  commentIndex=null;
  selection={start:pointOffset(range.startContainer,range.startOffset),end:pointOffset(range.endContainer,range.endOffset)};
 };
 document.addEventListener('selectionchange',capture);
 host.onpointerdown=e=>{if(e.target.matches('[data-mark-color]')){capture();return;}if(e.target.closest('[data-mark],[data-mark-clear],[data-mark-undo]')){capture();e.preventDefault();}};
 const editable=target=>target.closest('[data-inline-comment],[data-inline-legacy]');
 const activeComment=target=>editable(target)||(host.contains(document.activeElement)?editable(document.activeElement):null);
 const ensureComment=()=>{
  if(disabled)return null;capture();
  if(!selection)return null;
  if(current.length>=100){message.textContent='첨삭 표시는 최대 100개까지 추가할 수 있습니다.';return null;}
  const end=selection.end;snapshot();current.push({start:end,end,type:'comment',note:'',color:host.querySelector('[data-mark-color]').value});render();changed();
  const field=source.querySelector('[data-inline-comment="'+(current.length-1)+'"]');field.focus();const range=document.createRange();range.selectNodeContents(field);range.collapse(false);const s=window.getSelection();s.removeAllRanges();s.addRange(range);return field;
 };
 const protectOriginal=()=>{
  if(sourceComposition)return;
  if([...source.querySelectorAll('[data-original-start]')].map(n=>n.textContent).join('')!==text){render();message.textContent='학생 원문은 보존됩니다. 수정 의견은 원문 위치를 클릭해 코멘트로 입력해주세요.';}
 };
 host.onkeydown=e=>{
  if(disabled||sourceComposition||e.isComposing||!source.contains(e.target)||editable(e.target))return;
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();host.querySelector('[data-mark-undo]').click();return;}
  if(!e.ctrlKey&&!e.metaKey&&!e.altKey&&e.key.length===1)ensureComment();
 };
 const finishComposition=()=>{
  if(!sourceComposition)return;const composing=sourceComposition;sourceComposition=null;clearTimeout(compositionTimer);compositionTimer=null;
  if(composing.value&&current.length<100){snapshot();current.push({start:composing.end,end:composing.end,type:'comment',note:composing.value.slice(0,1000),color:host.querySelector('[data-mark-color]').value});render();changed();
   const field=source.querySelector('[data-inline-comment="'+(current.length-1)+'"]');field.focus();const range=document.createRange();range.selectNodeContents(field);range.collapse(false);getSelection().removeAllRanges();getSelection().addRange(range);
  }else render();
 };
 const onCompositionstart=e=>{if(!disabled&&source.contains(e.target)&&!activeComment(e.target)){capture();if(selection)sourceComposition={...selection,value:''};}};
 const onCompositionupdate=e=>{if(sourceComposition)sourceComposition.value=e.data||'';};
 const commitInput=target=>{
  if(disabled)return;const field=activeComment(target);if(!field)return;
  const limit=field.hasAttribute('data-inline-legacy')?8000:1000;
  let value=field.textContent;
  if(value.length>limit){value=value.slice(0,limit);field.textContent=value;message.textContent=`코멘트는 최대 ${limit.toLocaleString()}자까지 입력할 수 있습니다.`;}
  const index=Number(field.dataset.inlineComment),previous=field.hasAttribute('data-inline-legacy')?legacy:current[index]?.note;
  if(value===previous)return;snapshot();if(field.hasAttribute('data-inline-legacy'))legacy=value;else current[index].note=value;changed();
 };
 host.oninput=e=>{e.stopPropagation();if(sourceComposition)return;if(!e.isComposing){commitInput(e.target);protectOriginal();}};
 const onCompositionend=e=>{if(sourceComposition){sourceComposition.value=e.data??sourceComposition.value;compositionTimer=setTimeout(finishComposition,0);return;}commitInput(e.target);protectOriginal();};
 for(const [type,listener] of [['compositionstart',onCompositionstart],['compositionupdate',onCompositionupdate],['compositionend',onCompositionend]])host.addEventListener(type,listener);
 const insertText=(field,value)=>{
  const s=window.getSelection();if(!s?.rangeCount)return;const range=s.getRangeAt(0);
  if(!field.contains(range.startContainer)||!field.contains(range.endContainer))return;
  const limit=field.hasAttribute('data-inline-legacy')?8000:1000;
  if(field.textContent.length-range.toString().length+value.length>limit){message.textContent=`코멘트는 최대 ${limit.toLocaleString()}자까지 입력할 수 있습니다.`;return;}
  range.deleteContents();const node=document.createTextNode(value);range.insertNode(node);range.setStartAfter(node);range.collapse(true);s.removeAllRanges();s.addRange(range);commitInput(field);
 };
 host.onpaste=e=>{if(disabled||!source.contains(e.target))return;e.preventDefault();const field=activeComment(e.target)||ensureComment();if(field)insertText(field,e.clipboardData.getData('text/plain'));};
 host.onbeforeinput=e=>{
  if(disabled||sourceComposition||!source.contains(e.target))return;
  const field=activeComment(e.target);
  if(field){if(['insertParagraph','insertLineBreak'].includes(e.inputType)){e.preventDefault();insertText(field,'\n');}return;}
  e.preventDefault();
  if(['insertText','insertReplacementText','insertParagraph','insertLineBreak'].includes(e.inputType)){const note=ensureComment();if(note)insertText(note,e.data??'\n');}
 };
 host.onclick=e=>{
  e.stopPropagation();const b=e.target.closest('[data-mark],[data-mark-clear],[data-mark-undo],[data-remove-comment],[data-remove-legacy]');if(!b||b.disabled||disabled)return;
  if(b.hasAttribute('data-mark-undo')){const previous=undo.pop();if(previous){current=previous.marks;legacy=previous.legacy;render();changed();}return;}
  if(b.hasAttribute('data-remove-legacy')||b.hasAttribute('data-remove-comment')){
   snapshot();if(b.hasAttribute('data-remove-legacy'))legacy='';else{const i=Number(b.dataset.removeComment);if(current[i].type==='comment')current.splice(i,1);else current[i].note='';}render();changed();return;
  }
  if(b.dataset.mark==='color'&&commentIndex!==null){
   const color=host.querySelector('[data-mark-color]').value;if(!validColor(color))return;
   if(commentIndex===-1){
    // Preserve older freeform feedback while moving its color into structured comments.
    const chunks=[];let part='';for(const c of legacy){if(part.length+c.length>1000){chunks.push(part);part='';}part+=c;}if(part)chunks.push(part);
    if(current.length+chunks.length>100){message.textContent='첨삭 표시를 줄인 뒤 색을 적용해주세요.';return;}
    snapshot();const end=[...text].length;current.push(...chunks.map(note=>({start:end,end,type:'comment',note,color})));legacy='';
   }else{snapshot();current[commentIndex].color=color;}
   render();changed();message.textContent='코멘트 글자색을 변경했습니다.';return;
  }
  if(!selection||selection.start===selection.end){message.textContent='먼저 원문에서 표시할 문장을 선택해주세요.';return;}
  if(b.hasAttribute('data-mark-clear')){
   const {start,end}=selection;snapshot();current=current.flatMap(m=>m.type!=='comment'&&m.start<end&&m.end>start?(m.note?[{...m,type:'comment'}]:[]):[m]);render();changed();message.textContent='선택한 부분의 표시를 지웠습니다.';return;
  }
  if(current.length>=100){message.textContent='첨삭 표시는 최대 100개까지 추가할 수 있습니다.';return;}
  snapshot();current.push({...selection,type:b.dataset.mark,note:'',...(b.dataset.mark==='color'?{color:host.querySelector('[data-mark-color]').value}:{})});render();changed();
  message.textContent='표시를 추가했습니다.';
 };
 render();
 return {getMarks:()=>{finishComposition();return current.filter(m=>m.type!=='comment'||m.note.trim()).map(m=>({...m}));},getFeedback:()=>legacy,setDisabled(value){disabled=value||!canWrite;host.querySelectorAll('button,input').forEach(n=>n.disabled=disabled);host.querySelectorAll('[data-inline-comment],[data-inline-legacy],[data-mark-source]').forEach(n=>{n.contentEditable=disabled?'false':n===source?'true':'plaintext-only';n.setAttribute('aria-readonly',String(disabled));});syncUndo();},destroy(){for(const [type,listener] of [['compositionstart',onCompositionstart],['compositionupdate',onCompositionupdate],['compositionend',onCompositionend]])host.removeEventListener(type,listener);clearTimeout(compositionTimer);sourceComposition=null;document.removeEventListener('selectionchange',capture);host.onclick=null;host.onpointerdown=null;host.oninput=null;host.onpaste=null;host.oncompositionend=null;host.onbeforeinput=null;host.onkeydown=null;host.oncompositionstart=null;host.oncompositionupdate=null;}};
}
