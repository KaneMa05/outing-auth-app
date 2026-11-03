import {renderJobReport} from '/client/interview-job-exam.mjs';
import {renderPersonalityReport} from '/client/interview-personality.mjs';
import {summaryMarkup} from '/client/interview-mock-summary.mjs';
const find=s=>document.querySelector(s),names={job:'전공 답변 분석',personality:'인성 답변 분석',report:'종합 분석'},states={queued:'분석 대기',running:'분석 중',completed:'분석 완료',failed:'확인 필요',unknown:'확인 필요'};
let kind=new URLSearchParams(location.search).get('kind')||'job',timer,version=0;
if(!names[kind])kind='job';
async function refresh(){const current=++version;try{const response=await fetch('/preview/data?kind='+kind),data=await response.json();if(current!==version)return;
 document.querySelectorAll('[data-kind]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.kind===kind)));
 find('[data-question]').textContent=data.question;find('[data-answer]').textContent=data.transcript;find('[data-source]').textContent=data.source;find('[data-result-title]').textContent=names[kind];find('[data-state]').textContent=states[data.processing.state]||'확인 중';
 find('[data-notice]').textContent=data.processing.state==='queued'?'답변을 저장했습니다. 분석을 실행하면 대기열에서 처리합니다.':data.processing.state==='running'?'답변의 문장과 근거를 확인하고 있습니다.':data.processing.state==='completed'?'저장된 결과입니다. 다시 조회해도 분석을 재실행하지 않습니다.':'분석 상태를 확인해주세요.';
 find('[data-process]').hidden=data.processing.state==='completed';find('[data-process]').disabled=data.processing.state!=='queued';
 find('[data-result]').innerHTML=data.report?(kind==='job'?renderJobReport(data.report):kind==='personality'?renderPersonalityReport(data.report):summaryMarkup(data.report)):'<p class="empty">분석이 끝나면 실제 답변의 근거 문장과<br>다음 연습을 위한 피드백을 보여드립니다.</p>';
 clearTimeout(timer);if(data.processing.state==='running')timer=setTimeout(refresh,500);
 }catch{find('[data-notice]').textContent='미리보기 연결을 확인해주세요.';}}
document.querySelectorAll('[data-kind]').forEach(b=>b.onclick=()=>{kind=b.dataset.kind;history.replaceState(null,'','?kind='+kind);clearTimeout(timer);void refresh();});
find('[data-process]').onclick=async()=>{find('[data-process]').disabled=true;await fetch('/preview/process?kind='+kind,{method:'POST'});await refresh();};
void refresh();

if(matchMedia('(max-width:720px)').matches)document.querySelector('.source-card').open=false;
