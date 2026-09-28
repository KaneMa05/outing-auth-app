const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('criminal-law-ox.js', 'utf8');

function fixture() {
  const data = {
    collections: [{ id: 'law', name: '형법' }],
    chapters: [
      { id: 'a', display_name: '형법의 적용범위', collection_id: 'law', question_count: 50 },
      { id: 'b', display_name: '구성요건', collection_id: 'law', question_count: 20 },
      { id: 'small', display_name: '기록 적음', collection_id: 'law', question_count: 10 },
      { id: 'empty', display_name: '미학습', collection_id: 'law', question_count: 10 },
      { id: 'clean', display_name: '오답 없음', collection_id: 'law', question_count: 5 },
      { id: 'short', display_name: '짧은 단원', collection_id: 'law', question_count: 2 }
    ], questions: []
  };
  const progress = [];
  for (const [chapter, count, wrong] of [['a',20,8],['b',10,5],['small',1,1],['clean',5,0],['short',2,1]]) {
    for (let i=0;i<count;i++) {
      const id = `${chapter}-${i}`;
      data.questions.push({ id, chapter_id: chapter, version: 1, prompt: '예시 지문', correct_answer: 'O' });
      progress.push({ question_id: id, correct: chapter !== 'b' || i >= wrong, answer: chapter !== 'b' || i >= wrong ? 'O' : 'X', wrong_count: i < wrong ? i===0 ? 4 : 1 : 0 });
    }
  }
  const context = vm.createContext({
    data, bootstrap: { progress, attemptCounts:Object.fromEntries(progress.map(p=>[p.question_id,{attempts:p.wrong_count+Number(p.correct),correct:Number(p.correct),wrong:p.wrong_count}])), notes: [{ question_id:'a-0', mastered_version:1, memo:'보존할 메모', bookmark:true }], statistics:{}, todayCount:0 },
    main:{innerHTML:''}, byId:new Map(data.questions.map(q=>[q.id,q])), chapters:new Map(data.chapters.map(c=>[c.id,c])), collections:new Map(data.collections.map(c=>[c.id,c])),
    esc:s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
    button:(label,action,extra='',classes='')=>`<button data-action="${action}" class="${classes}" ${extra}>${label}</button>`,
    questionPresentation:q=>({prompt:q.prompt}), safeHtml:s=>s||'', questionStatsMarkup:()=>'', render:()=>{}
  });
  vm.runInContext(source.slice(source.indexOf('    const attempts ='),source.indexOf('    const meter =')),context);
  vm.runInContext(source.slice(source.indexOf('let reviewMode ='),source.indexOf('// Injected into the production mount closure')),context);
  vm.runInContext(fs.readFileSync('docs/criminal-law-ox-proposal/session-start.js','utf8'),context);
  const actions=fs.readFileSync('docs/criminal-law-ox-proposal/history-actions.js','utf8');
  vm.runInContext(`function action(action,id,dataset={}) { const b={dataset}; if(false){} ${actions} }`,context);
  const run=code=>vm.runInContext(code,context);
  return { run, json:code=>JSON.parse(JSON.stringify(run(code))), html:()=>context.main.innerHTML };
}

test('20 attempts / 8 wrong followed by 8 corrections shows 71.4%, and history survives more practice and completion',()=>{
  const f=fixture();
  f.run("for(let i=0;i<20;i++)attemptCounts.set('a-'+i,{attempts:i<8?2:1,correct:1,wrong:i<8?1:0})");
  assert.equal(f.run("cumulativeAccuracyLabel(weaknessStats()[0])"),'71.4%');
  assert.equal(f.run("weaknessStats()[0].accuracy"),100);
  f.run(`for(let n=0;n<10;n++)for(let i=0;i<8;i++){const id='a-'+i;attempts.push({id,answer:'O',correct:true});const c=attemptCounts.get(id);c.attempts++;c.correct++;note(id).mastered=true;}`);
  assert.deepEqual(f.json('((s)=>[s.solved,s.past,s.regained,s.totalAttempts,s.totalCorrect,s.totalWrong,s.repeated])(weaknessStats()[0])'),[20,8,8,108,100,8,1]);
  assert.equal(f.run("cumulativeAccuracyLabel(weaknessStats()[0])"),'92.6%');
  f.run('weakness()');
  assert.match(f.html(),/이전 오답 8문항 · 남은 오답 0문항/);
  assert.match(f.html(),/어려웠던 단원을 다시 복습할 수 있도록 목록에 남겨두었어요/);
  assert.equal(f.run("note('a-0').text"),'보존할 메모');
  assert.equal(f.run("note('a-0').bookmark"),true);
});

test('first mistake on another solved question adds one history item; repeated mistakes do not',()=>{
  const f=fixture();
  f.run("progress.set('a-8',{question_id:'a-8',correct:false,answer:'X',wrong_count:1});attempts.push({id:'a-8',correct:false,answer:'X'})");
  assert.equal(f.run('weaknessStats()[0].past'),9);
  f.run("progress.get('a-8').wrong_count=9;attempts.push({id:'a-8',correct:false,answer:'X'})");
  assert.equal(f.run('weaknessStats()[0].past'),9);
  assert.equal(f.run('weaknessStats()[0].accuracy'),95);
});

test('history includes completed items, respects chapter/status/repeat filters and leaves default review semantics intact',()=>{
  const f=fixture();
  f.run("openReview('history','a')");
  assert.equal(f.run('reviewItemsForFilter().length'),8);
  f.run("reviewRepeated=true;reviewStatus='regained'");
  assert.deepEqual(f.json('reviewItemsForFilter().map(s=>s.q.id)'),['a-0']);
  f.run("reviewStatus='wrong'");
  assert.equal(f.run('reviewItemsForFilter().length'),0);
  f.run('openReview()');
  assert.equal(f.run("reviewItemsForFilter().some(s=>s.q.id==='a-0')"),false);
  assert.equal(f.run("pendingReviewItems().length"),5);
  f.run("openReview('history','a');review()");
  assert.match(f.html(),/완료 취소/);
  assert.match(f.html(),/보존할 메모/);
});

test('one list ranks cumulative accuracy, retains corrected and low-sample chapters, and separates unlearned chapters',()=>{
  const f=fixture();f.run('weakness()');
  const html=f.html(),table=html.split('aria-label="취약 단원"')[1].split('</section>')[0];
  assert.ok(table.indexOf('data-weak-chapter="b"')<table.indexOf('data-weak-chapter="a"'));
  assert.ok(table.includes('data-weak-chapter="small"'));
  assert.ok(!html.includes('weak-view'));
  assert.ok(!html.includes('현재 정답률'));
  assert.match(html,/아직 풀어본 문항이 적어요/);
  assert.match(html,/오답 없는 단원 1개 보기/);
  assert.match(html,/미학습 1단원 보기/);
  assert.equal(f.run('weaknessStats()[3].cumulativeAccuracy'),null);
  assert.ok(f.run('weaknessStats()[5].rank')<5,'a two-question chapter can be measured after both questions');
  assert.equal(f.run('weaknessStats()[0].label'),'양호');
});

test('chapter replay includes completed history and uses the right return route',()=>{
  const f=fixture();
  f.run("route='weak';action('history-chapter-start','a')");
  assert.equal(f.run('session.ids.length'),8);
  assert.equal(f.run("session.ids.includes('a-0')"),true);
  assert.equal(f.run('origin'),'weak');
  f.run("action('history-chapter','a');action('history-repeat');action('history-status',null,{status:'regained'});start(reviewItemsForFilter().map(s=>s.q.id),'이전 오답')");
  assert.deepEqual(f.json('session.ids'),['a-0']);
  assert.equal(f.run('origin'),'review');
  f.run("route=origin");
  assert.equal(f.run('reviewChapterId'),'a');
  assert.equal(f.run('reviewRepeated'),true);
  f.run("openReview('history','missing')");
  assert.equal(f.run('reviewChapterId'),'a','unknown/unauthorized chapter does not replace scope');
});

test('reload reconstructs historical weakness from bootstrap without any old attempts',()=>{
  const f=fixture();
  assert.equal(f.run('attempts.length'),38);
  assert.equal(f.run("attempts.filter(a=>a.id==='a-0').length"),1);
  assert.equal(f.run("stats('a-0').wrong"),4);
  assert.equal(f.run('weaknessStats()[0].past'),8);
  assert.deepEqual(f.json('questionAttemptCounts("a-0")'),{attempts:5,correct:1,wrong:4});
});

test('rounding never turns a historical wrong answer into 100%; no-data is not a perfect score',()=>{
  const f=fixture();
  assert.equal(f.run('cumulativeAccuracyLabel({cumulativeAccuracy:99.999,totalWrong:1})'),'99.9%');
  assert.equal(f.run('cumulativeAccuracyLabel({cumulativeAccuracy:100,totalWrong:0})'),'100%');
  assert.equal(f.run('cumulativeAccuracyLabel({cumulativeAccuracy:null,totalWrong:0})'),'—');
});

test('new chapter content is escaped and missing measurements never render NaN',()=>{
  const f=fixture();f.run("data.chapters[0].display_name='<img src=x onerror=alert(1)>';weakness()");
  assert.ok(!f.html().includes('<img'));
  assert.match(f.html(),/&lt;img/);
  assert.ok(!f.html().includes('NaN'));
});

test('notebook filters chapters in both modes and sorts by actual last answer time or wrong count',()=>{
  const f=fixture();
  f.run("progress.get('a-1').answered_at='2026-09-28T10:00:00Z';progress.get('a-2').answered_at='2026-09-28T09:00:00Z';progress.get('a-0').answered_at='2026-09-27T09:00:00Z'");
  f.run("openReview('history');setReviewFilter('chapter','a')");
  assert.deepEqual(f.json('reviewItemsForFilter().slice(0,3).map(s=>s.q.id)'),['a-1','a-2','a-0']);
  f.run("setReviewFilter('sort','wrong')");
  assert.deepEqual(f.json('reviewItemsForFilter().slice(0,3).map(s=>s.q.id)'),['a-0','a-1','a-2']);
  f.run("action('review-mode',null,{mode:'pending'})");
  assert.equal(f.run('reviewChapterId'),'a');
  assert.equal(f.run('reviewSort'),'wrong');
  assert.equal(f.run("reviewItemsForFilter().some(s=>s.q.id==='a-0')"),false);
  assert.ok(f.run("reviewItemsForFilter().every(s=>s.q.chapter_id==='a')"));
  f.run("start(reviewItemsForFilter().map(s=>s.q.id),'오답 모아 풀기')");
  assert.deepEqual(f.json('session.ids.slice(0,2)'),['a-1','a-2']);
  f.run("setReviewFilter('chapter','missing');setReviewFilter('sort','invalid')");
  assert.equal(f.run('reviewChapterId'),'a');
  assert.equal(f.run('reviewSort'),'wrong');
});

test('chapter choices include completed history, group subjects, and escape chapter labels',()=>{
  const f=fixture();
  f.run("data.chapters[0].display_name='<단원>';openReview();review()");
  assert.match(f.html(), /value="collection:law"[^>]*>형법 전체/);
  assert.match(f.html(), /&lt;단원&gt;/);
  assert.match(f.html(), /최신순/);
  assert.match(f.html(), /누적 오답 횟수순/);
  assert.ok(!f.html().includes('option value="empty"'));
  f.run("openReview('history','a',true);action('review-mode',null,{mode:'pending'});review()");
  assert.match(f.html(), /취약단원으로/);
  assert.match(f.html(), /value="a" selected/);
});

test('selecting a subject includes its chapters and preserves scope for tabs, counts and replay',()=>{
  const f=fixture();
  f.run("data.collections.push({id:'procedure',name:'수사·증거'});collections.set('procedure',data.collections[1]);data.chapters[1].collection_id='procedure';openReview('history');setReviewFilter('chapter','collection:law');review()");
  assert.ok(f.run("reviewItemsForFilter().every(s=>s.q.chapter_id!=='b')"));
  assert.equal(f.run('reviewItemsForFilter().length'),10);
  assert.match(f.html(), /형법 오답노트/);
  assert.match(f.html(), /전체 이력 10/);
  f.run("action('review-mode',null,{mode:'pending'});setReviewFilter('sort','wrong');start(reviewItemsForFilter().map(s=>s.q.id),'모아 풀기')");
  assert.equal(f.run('reviewCollectionId'),'law');
  assert.equal(f.run('session.ids.length'),9);
  assert.ok(f.run("session.ids.every(id=>byId.get(id).chapter_id!=='b')"));
  f.run("setReviewFilter('chapter','collection:procedure');review()");
  assert.equal(f.run('reviewItemsForFilter().length'),5);
  assert.match(f.html(), /수사·증거 오답노트/);
  f.run("setReviewFilter('chapter','collection:missing')");
  assert.equal(f.run('reviewCollectionId'),'procedure');
  f.run("setReviewFilter('chapter','a')");
  assert.equal(f.run('reviewCollectionId'),null);
  assert.equal(f.run('reviewChapterId'),'a');
  f.run("setReviewFilter('chapter','')");
  assert.equal(f.run('reviewChapterId'),null);
  assert.equal(f.run('reviewItemsForFilter().length'),14);
});

test('compact filters start collapsed, preserve selection when closed, and reset without changing history mode',()=>{
  const f=fixture();
  f.run("openReview('history');review()");
  assert.match(f.html(), /id="ox-review-filter-panel"[^>]* hidden/);
  assert.ok(!f.html().includes('마지막으로 푼 문제가 먼저 보여요'));
  f.run("action('review-filters-toggle');setReviewFilter('chapter','a');setReviewFilter('sort','wrong');action('history-status',null,{status:'regained'});action('history-repeat');review()");
  assert.equal(f.run('reviewFiltersOpen'),true);
  assert.ok(!f.html().includes('ox-review-filter-count'));
  assert.equal(f.run('reviewItemsForFilter().length'),1);
  f.run("action('review-filters-close');review()");
  assert.equal(f.run('reviewFiltersOpen'),false);
  assert.equal(f.run('reviewItemsForFilter().length'),1);
  assert.match(f.html(), /aria-expanded="false"/);
  f.run("action('review-filters-toggle');action('review-filters-reset');review()");
  assert.equal(f.run('reviewFiltersOpen'),true);
  assert.equal(f.run('reviewMode'),'history');
  assert.equal(f.run('reviewItemsForFilter().length'),15);
});
