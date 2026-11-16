// Portal cookies authenticate the sender; recordings and answers are never attached.
export function openStudentFeedback({screen='portal.my',fetchImpl=fetch}={}){
 const dialog=document.createElement('dialog');dialog.className='ip-feedback-dialog';dialog.setAttribute('aria-labelledby','ip-feedback-title');
 dialog.innerHTML=`<form><h2 id="ip-feedback-title">의견 보내기</h2><label>종류<select name="kind"><option value="bug">오류 신고</option><option value="suggestion">개선 의견</option></select></label><label>의견 내용<textarea name="content" maxlength="2000" required minlength="2" placeholder="어느 화면에서 어떤 점이 불편했는지 알려주세요."></textarea></label><p>비밀번호 등 민감한 정보는 적지 마세요. 작성 내용은 관리자에게만 전달되며 녹음·답변은 자동으로 첨부하지 않습니다.</p><p data-count>0 / 2,000자</p><p data-message role="status" aria-live="polite"></p><div class="ip-feedback-actions"><button type="button" data-close>취소</button><button type="submit" disabled>의견 보내기</button></div></form>`;
 const form=dialog.querySelector('form'),content=form.elements.content,kind=form.elements.kind,submit=form.querySelector('[type=submit]'),close=form.querySelector('[data-close]'),message=form.querySelector('[data-message]');
 let requestId=crypto.randomUUID(),sending=false,sent=false,dead=false;
 const previous=document.activeElement;
 function destroy(){dead=true;dialog.close();dialog.remove();if(previous?.isConnected)previous.focus();}
 function update(){if(sending||sent)return;requestId=crypto.randomUUID();message.textContent='';message.setAttribute('role','status');dialog.querySelector('[data-count]').textContent=content.value.length+' / 2,000자';submit.disabled=content.value.trim().length<2||content.value.length>2000;}
 content.oninput=update;kind.onchange=update;
 close.onclick=()=>{if(!sending)destroy();};dialog.oncancel=e=>{e.preventDefault();if(!sending)destroy();};
 form.onsubmit=async e=>{
  e.preventDefault();if(sending||sent||content.value.trim().length<2||content.value.length>2000)return;
  sending=true;content.disabled=kind.disabled=submit.disabled=close.disabled=true;submit.textContent='보내는 중…';message.textContent='';
  try{
   const response=await fetchImpl('/api/interview-app-feedback',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId,kind:kind.value,content:content.value.trim(),screen,appVersion:'web'}),signal:AbortSignal.timeout(20000)});
   const data=await response.json();if(!response.ok||!data.ok)throw Object.assign(Error('feedback_failed'),{code:data.error});
   if(dead)return;sent=true;message.setAttribute('role','status');message.textContent='의견을 접수했습니다. 감사합니다.';close.textContent='닫기';submit.hidden=true;
  }catch(error){if(dead)return;message.setAttribute('role','alert');message.textContent=error.code==='unauthorized'?'로그인이 만료되었습니다. 작성한 내용을 복사한 뒤 다시 로그인해주세요.':error.code==='rate_limited'?'오늘 접수 한도에 도달했습니다. 작성한 내용은 유지됩니다.':'보내지 못했습니다. 작성한 내용은 유지됩니다. 다시 시도해주세요.';
  }finally{sending=false;if(!dead){close.disabled=false;content.disabled=kind.disabled=sent;submit.disabled=sent;submit.textContent='의견 보내기';}}
 };
 document.body.append(dialog);dialog.showModal();content.focus();
 return {canLeave:()=>!sending,destroy};
}
