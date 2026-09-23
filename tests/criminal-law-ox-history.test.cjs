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
    data, bootstrap: { progress, notes: [{ question_id:'a-0', mastered_version:1, memo:'보존할 메모', bookmark:true }], statistics:{}, todayCount:0 },
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

test('20 solved / 8 historical mistakes stays 40% after all corrections, repetitions and completion',()=>{
  const f=fixture();
  assert.equal(f.run("weaknessStats()[0].historyRate"),40);
  assert.equal(f.run("weaknessStats()[0].accuracy"),100);
  f.run(`for(let n=0;n<10;n++)for(let i=0;i<8;i++){const id='a-'+i;attempts.push({id,answer:'O',correct:true});note(id).mastered=true;}`);
  assert.deepEqual(f.json('((s)=>[s.solved,s.past,s.regained,s.historyRate,s.accuracy,s.repeated])(weaknessStats()[0])'),[20,8,8,40,100,1]);
  f.run('weakness()');
  assert.match(f.html(),/20문항 중 8문항 틀린 이력 · 모두 다시 맞힘/);
  assert.match(f.html(),/취약 이력은 그대로 유지/);
  assert.equal(f.run("note('a-0').text"),'보존할 메모');
  assert.equal(f.run("note('a-0').bookmark"),true);
});

test('first mistake on another solved question adds one history item; repeated mistakes do not',()=>{
  const f=fixture();
  f.run("progress.set('a-8',{question_id:'a-8',correct:false,answer:'X',wrong_count:1});attempts.push({id:'a-8',correct:false,answer:'X'})");
  assert.equal(f.run('weaknessStats()[0].historyRate'),45);
  f.run("progress.get('a-8').wrong_count=9;attempts.push({id:'a-8',correct:false,answer:'X'})");
  assert.equal(f.run('weaknessStats()[0].past'),9);
  assert.equal(f.run('weaknessStats()[0].historyRate'),45);
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

test('history ranking uses unique-question rate, retains low-sample records, and separates no-history/unlearned chapters',()=>{
  const f=fixture();f.run('weakness()');
  const html=f.html(),table=html.split('aria-label="취약 이력 단원"')[1].split('</section>')[0];
  assert.ok(table.indexOf('data-weak-chapter="b"')<table.indexOf('data-weak-chapter="a"'));
  assert.ok(!table.includes('data-weak-chapter="small"'));
  assert.match(html,/학습 기록 적음 1단원 보기/);
  assert.match(html,/취약 이력 없음 1단원 보기/);
  assert.match(html,/미학습 1단원 보기/);
  assert.equal(f.run('weaknessStats()[3].historyRate'),null);
  assert.ok(f.run('weaknessStats()[5].rank')<5,'a two-question chapter can be measured after both questions');
  f.run("weakView='current';weakness()");
  assert.match(f.html(),/현재 취약도 단원/);
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
  assert.equal(f.run('weaknessStats()[0].historyRate'),40);
});

test('new chapter content is escaped and missing measurements never render NaN',()=>{
  const f=fixture();f.run("data.chapters[0].display_name='<img src=x onerror=alert(1)>';weakness()");
  assert.ok(!f.html().includes('<img'));
  assert.match(f.html(),/&lt;img/);
  assert.ok(!f.html().includes('NaN'));
});
