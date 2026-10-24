const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const reasons={audio_too_quiet:'음성이 너무 작거나 발화 구간이 부족합니다.',audio_clipped:'음성이 깨질 정도로 크게 녹음되었습니다.',transcription_failed:'음성 변환을 완료하지 못했습니다.',empty_or_invalid_transcript:'유효한 발화를 확인하지 못했습니다.',transcript_disagreement:'두 전사 결과가 달라 원음 확인이 필요합니다.',context_evaluation_failed:'문맥 판정을 완료하지 못했습니다.',context_uncertain:'답변 문맥이 불확실합니다.',judgment_disagreement:'두 문맥 판정이 다릅니다.',invalid_evidence:'판정 근거를 원문에서 확인하지 못했습니다.',missing_literal_term:'인정된 항목에 지정 표현이 없습니다.',inconsistent_judgment:'표현 검출 결과와 판정이 다릅니다.',invalid_judgment:'판정 응답 형식을 검증하지 못했습니다.',rubric_changed:'검증 중 질문 또는 기준이 변경되었습니다.',human_validation_required:'실제 음성 검증이 완료되기 전에는 관리자가 확인해야 합니다.'};
const errors={validation_not_configured:'음성 검증 API가 아직 설정되지 않았습니다.',rubric_not_ready:'전공 지식형 기준을 검토 완료로 저장한 뒤 실행해주세요.',rubric_changed:'질문 또는 기준이 변경되었습니다. 화면을 다시 열어주세요.',validation_busy:'다른 검증을 처리 중이거나 실행 간격이 너무 짧습니다. 잠시 후 확인해주세요.',invalid_audio:'16 kHz · 모노 · 16비트 PCM WAV, 1~90초 파일을 사용해주세요.',forbidden:'음성 검증 권한이 없습니다.',unauthorized:'관리자 로그인이 필요합니다.'};
export function mountExamValidation(host,{detail,canWrite,isDirty=()=>false}){
  let stopped=false,running=false,controller,audioUrl,reportUrl;
  host.innerHTML=`<h4>음성 채점 검증</h4><p>원음과 전사문을 비교하는 관리자 검증용입니다. 학생 성적에 반영되지 않습니다.</p>
    <p class="ip-help">검토 완료한 전공 지식형 질문에 사용할 수 있습니다. 파일은 실행 시 OpenAI API로 전송됩니다. 이 검증 화면에서는 서버에 음성·결과를 보관하지 않습니다.</p>
    <label>답변 음성 파일<input type="file" accept=".wav,audio/wav" data-exam-file ${canWrite?'':'disabled'}></label>
    <audio data-exam-playback controls hidden preload="metadata"></audio>
    <p class="ip-help">16 kHz · 모노 · 16비트 PCM WAV, 1~90초, 최대 3 MB</p>
    <button type="button" class="ip-btn" data-exam-run disabled>음성 채점 검증 실행</button><p role="status" data-exam-status>연결 상태 확인 중…</p><div data-exam-result></div>`;
  const status=s=>{if(!stopped)host.querySelector('[data-exam-status]').textContent=s;};
  async function request(body){
    controller=new AbortController();const timer=setTimeout(()=>controller.abort(),110000);
    try{const r=await fetch('/api/interview-exam',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal});
      const data=await r.json();if(!r.ok||!data.ok)throw Object.assign(new Error(data.error),{code:data.error});return data;
    }finally{clearTimeout(timer);}
  }
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
    running=true;button.disabled=true;fileInput.disabled=true;if(reportUrl)URL.revokeObjectURL(reportUrl);host.querySelector('[data-exam-result]').innerHTML='';status('음성 변환과 문맥 검증 중입니다. 최대 약 2분이 걸릴 수 있습니다.');
    try{
      const bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
      const {report}=await request({action:'validate_audio',questionId:detail.question.id,questionRevision:detail.question.revision,rubricRevision:detail.rubric.revision,audioBase64:btoa(binary)});
      if(stopped)return;
      status('검증이 끝났습니다. 확정 점수는 부여하지 않았습니다.');
      const label={O:'O',partial:'△',X:'X'};
      reportUrl=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));
      host.querySelector('[data-exam-result]').innerHTML=`<h4>관리자 검토 필요</h4>
        <p><a href="${esc(reportUrl)}" download="interview-validation-report.json">검증 결과 내려받기</a> · 원음 재생과 함께 근거를 확인해주세요.</p>
        <p>${report.suggestion?`검토용 제안: ${esc(label[report.suggestion.grade])} · ${esc(report.suggestion.score)}점 (미확정)`:'판정 제안을 보류했습니다.'}</p>
        <ul>${report.reasons.map(r=>`<li>${esc(reasons[r]||'추가 확인이 필요합니다.')}</li>`).join('')}</ul>
        ${report.transcripts.map((t,i)=>`<h5>전사 ${i+1}</h5><p style="white-space:pre-wrap">${esc(t||'전사 없음')}</p>`).join('')}
        ${report.judgments.map((j,i)=>`<details><summary>문맥 판정 ${i+1} 근거</summary>${j.criteria.map(c=>`<p><strong>${esc(report.rubric.criteria[c.index].label)} · ${esc({accepted:'충족',rejected:'불인정',absent:'표현 없음',uncertain:'불확실'}[c.status])}</strong><br>${esc(c.quote)}<br>${esc(c.reason)}</p>`).join('')}${j.errors.map(c=>`<p><strong>핵심 오류 ${c.index+1} · ${esc({present:'해당',absent:'없음',uncertain:'불확실'}[c.status])}</strong><br>${esc(c.quote)}<br>${esc(c.reason)}</p>`).join('')}</details>`).join('')}`;
    }catch(e){status(errors[e.code]||'검증을 완료하지 못했습니다. API 처리가 이미 진행되었을 수 있어 자동 재시도하지 않습니다.');}
    finally{running=false;if(!stopped){button.disabled=false;fileInput.disabled=!canWrite;}}
  };
  return {ready,isRunning:()=>running,destroy(){stopped=true;controller?.abort();host.querySelector('[data-exam-playback]').pause();if(audioUrl)URL.revokeObjectURL(audioUrl);if(reportUrl)URL.revokeObjectURL(reportUrl);button.onclick=fileInput.onchange=null;}};
}
