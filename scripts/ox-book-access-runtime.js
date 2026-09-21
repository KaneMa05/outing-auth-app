// Injected into the production learning closure. Access decisions come from the server.
let bookAccessBlocked = false;
const bookLabels = {'criminal-law':'형법','criminal-procedure-investigation-evidence':'수사·증거','criminal-procedure-trial':'공판'};
function bookTabs() {
  return `<div class="ox-filters ox-subject-filters" role="group" aria-label="학습 과목">${data.collections.map(c=>`<button type="button" class="mini-btn ox-filter" aria-pressed="${c.id===collection}" data-action="collection" data-id="${esc(c.id)}">${esc(bookLabels[c.id] || c.scope)}${c.accessible===false?' · 잠금':''}</button>`).join('')}</div>`;
}
function lockedBookView() {
  const title=bookLabels[collection] || '해당';
  main.innerHTML=`<h2>단원 학습</h2>${bookTabs()}<section class="ox-card"><h3>${esc(title)} 교재 구매 후 이용 가능</h3><p class="ox-sub">${esc(title)} 교재 구매자에게 제공되는 학습 서비스입니다. 구매하셨다면 학원에 구매 확인을 요청해주세요.</p>${button('구매 권한 새로고침','refresh-books','','ox-wide')}</section>`;
}
function blockBookAccess(error) {
  if(!['ox_book_required','ox_not_registered','ox_disabled','unauthorized'].includes(error.code))return false;
  bookAccessBlocked=true;session=null;questionRenderVersion++;
  byId.clear();chapters.clear();progress.clear();notes.clear();statistics.clear();questionTextLoads.clear();
  data.questions.length=0;data.chapters.length=0;attempts.length=0;todayCount=0;
  renderBlockedBooks();
  return true;
}
function renderBlockedBooks() {
  nav.replaceChildren();nav.hidden=true;
  main.innerHTML=`<section class="ox-card" role="alert"><h2>이용 상태가 변경되었습니다</h2><p class="ox-sub">구매 권한과 이용 상태를 다시 확인해주세요. 기존 풀이 기록과 메모는 보존됩니다.</p>${button('이용 상태 새로고침','refresh-books','','ox-wide')}</section>`;
}
