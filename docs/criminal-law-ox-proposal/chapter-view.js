// Inserted into the local preview module by build-local-preview.py.
let criminalLawPart = 'general';

function chapterView() {
  const isCriminalLaw = collection === 'criminal-law';
  const lawParts = [
    { id: 'general', label: '형법 총론', prefix: '형법총론' },
    { id: 'specific', label: '형법 각론', prefix: '형법각론' },
  ];
  const selectedPart = lawParts.find(part => part.id === criminalLawPart) || lawParts[0];
  const list = data.chapters.filter(c => c.collection_id === collection
    && (!isCriminalLaw || String(c.part_title || '').replace(/\s/g, '').startsWith(selectedPart.prefix)));
  const scopeLabel = isCriminalLaw ? selectedPart.label : collections.get(collection).scope;
  const count = list.reduce((sum, c) => sum + c.question_count, 0);
  const visible = allChapters ? list : list.slice(0, 8);
  const short = ['형법', '수사·증거', '공판'];
  main.innerHTML = `
    <div class="ox-page-heading"><h2>단원 학습</h2><button type="button" class="ox-set-size-trigger" data-action="chapter-size" aria-haspopup="dialog">한 번에 ${chapterSetSize}문항 <span aria-hidden="true">⌄</span></button></div>
    <div class="ox-filters ox-subject-filters" role="group" aria-label="학습 과목">
      ${data.collections.map((c, i) => `<button type="button" class="mini-btn ox-filter" aria-pressed="${c.id === collection}" data-action="collection" data-id="${c.id}">${short[i]}</button>`).join('')}
    </div>
    ${isCriminalLaw ? `<div class="ox-law-filters" role="group" aria-label="형법 학습 범위">
      ${lawParts.map(part => `<button type="button" class="ox-law-filter" aria-pressed="${part.id === selectedPart.id}" data-action="law-part" data-part="${part.id}">${part.label}</button>`).join('')}
    </div>` : ''}
    <section class="ox-chapter-panel" aria-label="${esc(scopeLabel)} 단원 목록">
      <header class="ox-chapter-head">
        <h3>${esc(scopeLabel)}</h3>
        <span class="ox-sub">${list.length}단원 · ${count.toLocaleString()}문항</span>
      </header>
      <div class="ox-chapter-list">
        ${visible.map(c => {
          const s = chapterCompletion(c);
          return `<button type="button" class="ox-chapter" data-action="chapter" data-id="${c.id}">
            <span class="ox-chapter-index">${String(c.sort_order).padStart(2, '0')}</span>
            <span class="ox-chapter-body">
              <strong>${esc(c.display_name)}</strong>
              <span class="ox-chapter-meta"><span>${c.question_count}문항</span><span class="${s.solved ? 'ox-chapter-started' : ''}">${s.complete ? `1회독 완료 · 정답률 ${Math.round(s.accuracy)}%` : s.solved ? `${s.solved}문항 학습` : '미학습'}</span></span>
              ${meter(s.progress, '단원 학습률')}
            </span>
            <span class="ox-chapter-chevron" aria-hidden="true">›</span>
          </button>`;
        }).join('')}
      </div>
      ${list.length > 8 ? `<div class="ox-chapter-bottom"><button type="button" class="ox-chapter-more" data-action="expand-chapters">${allChapters ? '단원 접기' : `전체 ${list.length}개 단원 보기`}<span aria-hidden="true">${allChapters ? '−' : '+'}</span></button></div>` : ''}
    </section>`;
}
