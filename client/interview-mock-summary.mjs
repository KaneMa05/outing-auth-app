const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function summaryMarkup(report){
 if(!report?.analysis)return '';
 const a=report.analysis;
 return `<p class="il-sub">답변 원문에 근거한 연습 피드백입니다. 확정 성적은 아닙니다.</p>${report.interrupted?'<p>중단된 면접에서 저장된 답변만 분석했습니다.</p>':''}<p>${esc(a.summary)}</p>`+
  [['strengths','잘한 점'],['improvements','보완할 점'],['nextPractice','다음 연습']].map(([key,label])=>`<section><h4>${label}</h4>${a[key].map(f=>`<article><p><strong>${esc(f.turnId)}번 답변</strong></p><blockquote>${esc(f.quote)}</blockquote><p>${esc(f.feedback)}</p></article>`).join('')||'<p>확인할 근거가 충분하지 않습니다.</p>'}</section>`).join('');
}
export function mountMockSummary(host,{request,runId,initial=null}={}){
 let destroyed=false,busy=false,processing=initial,timer,notice='';
 const states={queued:'분석 순서를 기다리고 있습니다.',running:'저장된 답변을 분석하고 있습니다.',completed:'종합 분석이 완료되었습니다.',failed:'분석을 완료하지 못했습니다. 담당자 확인이 필요합니다.',unknown:'처리 완료 여부를 확인 중입니다. 자동으로 다시 실행하지 않습니다.',cancelled:'이용 권한 또는 보관 기간을 확인해주세요.'};
 function draw(){if(destroyed)return;
  host.innerHTML=`<h3>종합 분석</h3><p role="status">${esc(notice||states[processing?.state]||'저장된 답변을 바탕으로 강점과 다음 연습을 확인하세요.')}</p>${processing?.state==='completed'?summaryMarkup(processing.report):`<button type="button" class="ip-btn ip-primary" data-mock-summary ${busy||processing?'disabled':''}>종합 분석 받기</button>`}`;
 }
 function schedule(){clearTimeout(timer);if(!['queued','running'].includes(processing?.state)||destroyed)return;timer=setTimeout(async()=>{
  if(globalThis.document?.hidden){schedule();return;}
  try{const data=await request('analysis_get',{runId});if(destroyed)return;processing=data.processing;notice='';}catch{notice='상태를 확인하지 못했습니다. 잠시 후 다시 확인합니다.';}
  draw();schedule();
 },5000);}
 host.onclick=async e=>{if(!e.target.closest('[data-mock-summary]')||busy||processing||destroyed)return;busy=true;draw();
  try{const data=await request('analysis_request',{runId});if(destroyed)return;processing=data.processing;notice='';}catch{notice='분석을 접수하지 못했습니다. 기록과 연결 상태를 확인한 뒤 다시 시도해주세요.';}
  finally{busy=false;if(!destroyed){draw();schedule();}}
 };
 draw();schedule();return {destroy(){destroyed=true;clearTimeout(timer);host.onclick=null;}};
}
