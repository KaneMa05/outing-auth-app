import {renderConceptReport} from './client/interview-concept-report.mjs?v=20261030';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const reasons={undefined_partial_credit:'부분 인정 기준이 없는 개념을 부분 충족으로 판정하여 검토가 필요합니다.',audio_too_quiet:'음성이 너무 작거나 발화 구간이 부족합니다.',audio_clipped:'음성이 깨질 정도로 크게 녹음되었습니다.',transcription_failed:'음성 변환을 완료하지 못했습니다.',empty_or_invalid_transcript:'유효한 발화를 확인하지 못했습니다.',transcript_disagreement:'두 전사 결과가 달라 원음 확인이 필요합니다.',context_evaluation_failed:'문맥 판정을 완료하지 못했습니다.',context_uncertain:'답변 문맥이 불확실합니다.',judgment_disagreement:'두 문맥 판정이 다릅니다.',invalid_evidence:'판정 근거를 원문에서 확인하지 못했습니다.',missing_literal_term:'인정된 항목에 지정 표현이 없습니다.',inconsistent_judgment:'표현 검출 결과와 판정이 다릅니다.',invalid_judgment:'판정 응답 형식을 검증하지 못했습니다.',rubric_changed:'검증 중 질문 또는 기준이 변경되었습니다.',human_validation_required:'실제 음성 검증이 완료되기 전에는 관리자가 확인해야 합니다.'};
const errors={validation_not_configured:'음성 검증 API가 아직 설정되지 않았습니다.',rubric_not_ready:'전공 지식형 기준을 검토 완료로 저장한 뒤 실행해주세요.',rubric_changed:'질문 또는 기준이 변경되었습니다. 화면을 다시 열어주세요.',validation_busy:'다른 검증을 처리 중이거나 실행 간격이 너무 짧습니다. 잠시 후 확인해주세요.',invalid_audio:'16 kHz · 모노 · 16비트 PCM WAV, 1~90초 파일을 사용해주세요.',forbidden:'음성 검증 권한이 없습니다.',unauthorized:'관리자 로그인이 필요합니다.'};
export function mountExamValidation(host,{detail,canWrite,isDirty=()=>false}){
  let stopped=false,running=false,audioUrl,reportUrl,page=0,historyVersion=0;
  const controllers=new Set();
  host.innerHTML=`<h4>음성 채점 검증</h4><p>원음과 전사문을 비교하는 관리자 검증용입니다. 학생 성적에 반영되지 않습니다.</p>
    <p class="ip-help">검토 완료한 전공 지식형 질문에 사용할 수 있습니다. 파일은 실행 시 OpenAI API로 전송됩니다. 판정 리포트는 서버에 저장하며 원음 파일은 이 화면에서 서버에 보관하지 않습니다.</p>
    <label>답변 음성 파일<input type="file" accept=".wav,audio/wav" data-exam-file ${canWrite?'':'disabled'}></label>
    <audio data-exam-playback controls hidden preload="metadata"></audio>
    <p class="ip-help">16 kHz · 모노 · 16비트 PCM WAV, 1~90초, 최대 3 MB</p>
    <button type="button" class="ip-btn" data-exam-run disabled>음성 채점 검증 실행</button><p role="status" data-exam-status>연결 상태 확인 중…</p><div data-exam-result></div><section data-exam-history><h4>저장된 판정 리포트</h4><button type="button" class="ip-btn" data-report-refresh>기록 새로고침</button><p role="status" data-report-status></p><div data-report-list></div><button type="button" class="ip-btn" data-report-prev disabled>이전</button><span data-report-page></span><button type="button" class="ip-btn" data-report-next disabled>다음</button></section>`;
  const status=s=>{if(!stopped)host.querySelector('[data-exam-status]').textContent=s;};
  async function request(body){
    const active=new AbortController();controllers.add(active);const timer=setTimeout(()=>active.abort(),110000);
    try{const r=await fetch('/api/interview-exam',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:active.signal});
      const data=await r.json();if(!r.ok||!data.ok)throw Object.assign(new Error(data.error),{code:data.error});return data;
    }finally{clearTimeout(timer);controllers.delete(active);}
  }
  function showReport(report){
    if(reportUrl)URL.revokeObjectURL(reportUrl);
    reportUrl=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));
    const label={O:'O',partial:'△',X:'X'};
    host.querySelector('[data-exam-result]').innerHTML=`<h4>관리자 검토 필요 · 미확정 리포트</h4>
      <p><a href="${esc(reportUrl)}" download="interview-validation-report.json">리포트 내려받기</a></p>
      <p>${esc(report.rubric?.question||'')}</p><p>문항 버전 ${esc(report.audit?.questionRevision)} · 기준 버전 ${esc(report.audit?.rubricRevision)}</p>
      <p>${report.suggestion?`검토용 제안: ${esc(label[report.suggestion.grade])} · ${esc(report.suggestion.score)}점 (미확정)`:'판정 제안을 보류했습니다.'}</p>
      <ul>${report.reasons.map(r=>`<li>${esc(reasons[r]||'추가 확인이 필요합니다.')}</li>`).join('')}</ul>
      ${report.conceptResults?.length?renderConceptReport(report):''}
      <h5>키워드 확인</h5><p class="ip-help">전사문에 표현이 있는지 확인한 결과입니다. 개념 방식의 키워드는 참고용이며 미발화만으로 오답을 확정하지 않습니다. 올바른 문맥인지는 판정 근거와 함께 확인해주세요.</p>
      ${(report.keywordResults||[]).map(k=>`<article><strong>${esc(k.label)} · ${k.match==='all'?'모두 충족':'하나 충족'}</strong><ul>${k.keywords.map(g=>`<li>${esc(g.term)} — ${g.missing?'표현 누락':'발화 표현: '+esc(g.matched.join(', '))}${g.aliases.length?` (허용: ${esc(g.aliases.join(', '))})`:''}</li>`).join('')}</ul></article>`).join('')}
      ${report.transcripts.map((t,i)=>`<h5>전사 ${i+1}</h5><p style="white-space:pre-wrap">${esc(t||'전사 없음')}</p>`).join('')}
      ${report.judgments.map((j,i)=>`<details><summary>문맥 판정 ${i+1} 근거</summary>${j.criteria.map(c=>`<p><strong>${esc(report.rubric.criteria[c.index].label)} · ${esc({accepted:'충족',rejected:'불인정',absent:'표현 없음',uncertain:'불확실',partial:'부분 충족'}[c.status])}</strong><br>${esc(c.quote)}<br>${esc(c.reason)}</p>`).join('')}${j.errors.map(c=>`<p><strong>핵심 오류 ${c.index+1} · ${esc({present:'해당',absent:'없음',uncertain:'불확실',partial:'부분 충족'}[c.status])}</strong><br>${esc(c.quote)}<br>${esc(c.reason)}</p>`).join('')}</details>`).join('')}`;
  }
  async function loadHistory(){
    const version=++historyVersion;
    try{
      const data=await request({action:'report_list',questionId:detail.question.id,page});
      if(stopped||version!==historyVersion)return;
      host.querySelector('[data-report-status]').textContent=data.reports.length?'조회할 리포트를 선택해주세요.':'저장된 리포트가 없습니다.';
      host.querySelector('[data-report-list]').innerHTML=data.reports.map(r=>`<p><button type="button" class="ip-btn" data-report-id="${esc(r.id)}">${esc(new Date(r.created_at).toLocaleString('ko-KR'))} · ${esc({processing:'처리 중·종료 미확인',completed:'저장 완료',failed:'생성 실패'}[r.state])} · 기준 ${esc(r.rubric_revision)}</button></p>`).join('');
      host.querySelector('[data-report-prev]').disabled=page===0;host.querySelector('[data-report-next]').disabled=data.reports.length<30;host.querySelector('[data-report-page]').textContent=String(page+1)+' 페이지';
    }catch{if(!stopped&&version===historyVersion)host.querySelector('[data-report-status]').textContent='리포트 기록을 불러오지 못했습니다. DB 적용과 조회 권한을 확인해주세요.';}
  }
  const history=host.querySelector('[data-exam-history]');
  history.onclick=async e=>{
    const b=e.target.closest('button');if(!b||running||stopped)return;e.stopPropagation();
    if(b.hasAttribute('data-report-id')){
      const version=++historyVersion;
      try{const data=await request({action:'report_get',id:b.dataset.reportId});if(stopped||version!==historyVersion)return;
        if(data.record.state!=='completed'){status('생성이 완료된 리포트만 조회할 수 있습니다. 자동으로 재실행하지 않습니다.');return;}
        showReport(data.record.report);status('서버에 저장된 리포트를 조회했습니다. AI를 다시 호출하지 않았습니다.');
      }catch{status('리포트를 조회하지 못했습니다.');}
    }else{if(b.hasAttribute('data-report-prev'))page=Math.max(0,page-1);if(b.hasAttribute('data-report-next'))page++;await loadHistory();}
  };
  void loadHistory();
  const eligible=canWrite&&!detail.stale&&detail.rubric?.status==='reviewed'&&detail.rubric?.kind==='job_knowledge';
  const button=host.querySelector('[data-exam-run]');
  const fileInput=host.querySelector('[data-exam-file]');
  fileInput.onchange=()=>{
    if(audioUrl)URL.revokeObjectURL(audioUrl);
    const file=fileInput.files[0],player=host.querySelector('[data-exam-playback]');
    player.pause();player.removeAttribute('src');player.hidden=true;
    if(file&&file.size<=3000000){audioUrl=URL.createObjectURL(file);player.src=audioUrl;player.hidden=false;}
  };
  const ready=(async()=>{
    if(!eligible){status('먼저 전공 지식형 채점 기준을 검토 완료로 저장해주세요.');return;}
    try{const s=await request({action:'status'});if(stopped)return;button.disabled=!s.enabled;status(s.enabled?'음성 파일을 선택해 검증할 수 있습니다.':'음성 검증 API 설정 전입니다.');}
    catch{status('음성 검증 서비스에 연결하지 못했습니다.');}
  })();
  button.onclick=async e=>{
    e.stopPropagation();if(running||stopped)return;
    if(isDirty()){status('수정 중인 채점 기준을 먼저 저장해주세요.');return;}
    const file=host.querySelector('[data-exam-file]').files[0];
    if(!file||file.size>3000000||file.size<44){status('3 MB 이하의 WAV 파일을 선택해주세요.');return;}
    running=true;historyVersion++;button.disabled=true;fileInput.disabled=true;if(reportUrl)URL.revokeObjectURL(reportUrl);host.querySelector('[data-exam-result]').innerHTML='';status('음성 변환과 문맥 검증 중입니다. 최대 약 2분이 걸릴 수 있습니다.');
    try{
      const bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
      const data=await request({requestKey:crypto.randomUUID(),action:'validate_audio',questionId:detail.question.id,questionRevision:detail.question.revision,rubricRevision:detail.rubric.revision,audioBase64:btoa(binary)});
      if(stopped)return;
      showReport(data.report);
      status(data.persisted?'판정 리포트를 서버에 저장했습니다. 확정 점수는 부여하지 않았습니다.':'판정은 완료했지만 리포트 저장을 확인하지 못했습니다. 결과를 내려받아 보관해주세요. AI를 자동 재실행하지 않습니다.');
      await loadHistory();
    }catch(e){status(errors[e.code]||'검증을 완료하지 못했습니다. API 처리가 이미 진행되었을 수 있어 자동 재시도하지 않습니다.');}
    finally{running=false;if(!stopped){button.disabled=false;fileInput.disabled=!canWrite;}}
  };
  return {ready,isRunning:()=>running,destroy(){stopped=true;historyVersion++;for(const active of controllers)active.abort();history.onclick=null;host.querySelector('[data-exam-playback]').pause();if(audioUrl)URL.revokeObjectURL(audioUrl);if(reportUrl)URL.revokeObjectURL(reportUrl);button.onclick=fileInput.onchange=null;}};
}
