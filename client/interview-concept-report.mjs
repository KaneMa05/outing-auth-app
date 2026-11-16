const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={accepted:'충족',partial:'부분 충족',rejected:'틀린 설명',absent:'설명 누락',uncertain:'검토 필요'};
export function renderConceptReport(report){
 if(!report.conceptResults?.length)return '';
 return `<section data-concept-report><h4>개념·관계 판정 근거</h4><p>서로 독립적으로 판정한 두 AI의 결과입니다. 참고 키워드의 발화 여부와 구분한 의미 판정이며, 전체 답변과 원음도 함께 확인해주세요.</p>${report.conceptResults.map(c=>`<article class="ip-panel"><h4>${esc(c.label)} · ${c.match==='all'?'모두 충족':'하나 충족'} · ${esc(labels[c.status]||'검토 필요')}</h4>${c.concepts.map(item=>`<section><h5>${esc(item.claim)} · ${esc(labels[item.status]||'검토 필요')}</h5>${item.relation?`<p>관계·조건: ${esc(item.relation)}</p>`:''}${item.partial?`<p>부분 인정 기준: ${esc(item.partial)}</p>`:''}<p>오류 경계: ${esc(item.reject)}</p>${item.evidence.map(e=>`<blockquote><p>AI 검토 ${esc(e.judge)} · ${esc(labels[e.status]||'검토 필요')}</p><p style="white-space:pre-wrap">${esc(e.quote||'인용 근거 없음')}</p><p>${esc(e.reason)}</p></blockquote>`).join('')}</section>`).join('')}</article>`).join('')}</section>`;
}
