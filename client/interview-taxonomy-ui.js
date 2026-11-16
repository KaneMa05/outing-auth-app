import {taxonomyConfig} from './interview-taxonomy.js?v=20261102-taxonomy';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const options=(items,value)=>items.map(([id,label])=>`<option value="${esc(id)}" ${id===(value||'')?'selected':''}>${esc(label)}</option>`).join('');
const values=items=>items.map(x=>[x.id,x.label]);
const name=(items,id)=>items.find(x=>x.id===id)?.label||id;
const checks=(key,items,selected)=>`<div class="ip-checks">${items.map(x=>`<label><input type="checkbox" name="${key}" value="${esc(x.id)}" ${selected.includes(x.id)?'checked':''}> ${esc(x.label)}</label>`).join('')}</div>`;
export function taxonomyFilters(f={}){
 return `<label>내용 분야<select name="fieldId">${options([['','전체 분야'],...values(taxonomyConfig.fields)],f.fieldId)}</select></label>
 <label>답변 방식<select name="answerFormat">${options([['','전체 방식'],...values(taxonomyConfig.formats)],f.answerFormat)}</select></label>
 <label>소재<select name="materialTag">${options([['','전체 소재'],...values(taxonomyConfig.tags)],f.materialTag)}</select></label>
 <label>분류 상태<select name="taxonomyStatus">${options([['','전체'],['classified','분류 완료'],['needs_context','추가 검토'],['unclassified','미분류']],f.taxonomyStatus)}</select></label>
 <label>모아보기<select name="taxonomyView">${options([['','전체'],['public_navigation','공채 항해']],f.taxonomyView)}</select></label>`;
}
export function taxonomySummary(q){
 const t=q.taxonomy;if(!t)return '<p class="ip-help">내용 분류: 미분류</p>';
 const fields=[...(t.primary_field?[name(taxonomyConfig.fields,t.primary_field)]:[]),...(t.related_fields||[]).map(id=>name(taxonomyConfig.fields,id))];
 const pending=t.stale||t.review_status==='needs_context';
 return `<div class="ip-question"><strong>${esc(fields.join(' · ')||(q.category==='personality'?'인성':'주분야 보류'))}</strong><br><small>${esc((t.answer_formats||[]).map(id=>name(taxonomyConfig.formats,id)).join(' · '))}${t.material_tags?.length?' / '+esc(t.material_tags.map(id=>name(taxonomyConfig.tags,id)).join(' · ')):''}</small><br><span class="ip-badge ${pending?'needs_revision':'approved'}">${pending?'추가 검토':'분류 완료'}</span>${t.content_note?'<small>문항 확인 사항 있음</small>':''}</div>`;
}
export function taxonomyEditor(q,sources=[]){
 const t=q.taxonomy||{},fields=taxonomyConfig.fields;
 return `<h3>질문 내용 분류</h3><h4>${esc(q.prompt)}</h4><p class="ip-help">현재 ${q.category==='job'?'직무':'인성'} 질문 · 출제 직렬 ${esc(q.tracks.join(' · ')||'공통')}. 내용 분류를 저장해도 원문·직렬·공개 승인 상태는 바뀌지 않습니다.</p>
 ${t.stale?'<p role="alert">질문 원문 또는 상위 카테고리가 변경되었습니다. 현재 질문을 기준으로 다시 검토해주세요.</p>':''}
 <form data-taxonomy-form>
 <label>분류 상태<select name="reviewStatus">${options([['classified','분류 완료'],['needs_context','추가 검토']],t.stale?'needs_context':t.review_status||'needs_context')}</select></label>
 <label>주분야<select name="primaryField" ${q.category==='personality'?'disabled':''}>${options([['',q.category==='personality'?'인성 - 전공 주분야 없음':'선택 또는 보류'],...values(fields)],q.category==='personality'?'':t.primary_field)}</select></label>
 <strong>연관 분야 (선택)</strong><p class="ip-help">주분야와 중복 선택하지 마세요. 인성 질문에도 관련 소재의 분야를 표시할 수 있습니다.</p>${checks('relatedFields',fields,t.related_fields||[])}
 <strong>답변 방식</strong>${checks('answerFormats',taxonomyConfig.formats,t.answer_formats||['knowledge'])}
 <strong>소재 태그 (선택)</strong>${checks('materialTags',taxonomyConfig.tags,t.material_tags||[])}
 <label>판단 근거<textarea name="rationale" minlength="5" maxlength="4000" required>${esc(t.rationale||'')}</textarea></label>
 <label>문항 확인 사항 (선택)<textarea name="contentNote" maxlength="4000">${esc(t.content_note||'')}</textarea></label>
 <div class="ip-toolbar"><button class="ip-btn ip-primary" data-write>분류 저장</button><button type="button" class="ip-btn" data-ip="close">닫기</button></div></form>
 ${sources.length?'<h3>원본 출처와 해설</h3>'+sources.map(s=>`<details><summary>${esc(s.filename)} · ${esc(s.number)}</summary><p>${esc(s.original_prompt)}</p><div class="ip-feedback">${esc(s.answer||'원문에 해설 없음')}</div></details>`).join(''):''}`;
}
export function taxonomyPayload(q,f){
 return {id:q.id,questionRevision:q.revision,revision:q.taxonomy?.revision||0,primaryField:f.get('primaryField')||'',relatedFields:f.getAll('relatedFields'),answerFormats:f.getAll('answerFormats'),materialTags:f.getAll('materialTags'),reviewStatus:f.get('reviewStatus'),rationale:f.get('rationale'),contentNote:f.get('contentNote')};
}
