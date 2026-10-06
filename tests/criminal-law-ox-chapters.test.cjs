const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const source=fs.readFileSync('criminal-law-ox.js','utf8');
const ids=['criminal-law-10-punishment-types','criminal-law-11-sentencing','criminal-law-12-recidivism','criminal-law-13-suspension','criminal-law-14-limitation-extinction'];
const names=['형벌의 종류','형의 양정','누범','형의 유예제도','형의 시효와 소멸'];

function records(countFor=()=>2) {
  const chapters=ids.map((id,i)=>({id,collection_id:'criminal-law',part_title:'형법총론 · 제3편 형벌론',sort_order:10+i,display_name:names[i],question_count:[23,12,6,14,2][i]}));
  chapters.unshift({id:'before',collection_id:'criminal-law',part_title:'형법총론',sort_order:9,display_name:'죄수론',question_count:1});
  chapters.push({id:'specific',collection_id:'criminal-law',part_title:'형법각론',sort_order:15,display_name:'각론 유지',question_count:1});
  chapters.push({id:'trial',collection_id:'criminal-procedure-trial',part_title:'공판',sort_order:10,display_name:'공판 유지',question_count:1});
  const questions=chapters.flatMap(c=>Array.from({length:c.question_count},(_,i)=>({id:c.id+'-q'+i,chapter_id:c.id,version:1,prompt:c.id+'-q'+i,context:'',correct_answer:'O'})));
  const counts=Object.fromEntries(questions.map(q=>{const attempts=countFor(q);return [q.id,{attempts,correct:Math.max(0,attempts-1),wrong:Math.min(1,attempts)}];}));
  const progress=questions.filter(q=>counts[q.id].attempts>0).map(q=>({question_id:q.id,content_version:1,answer:'O',correct:true,wrong_count:1,answered_at:'2026-10-06T00:00:00Z'}));
  return {catalog:{collections:[{id:'criminal-law',name:'형법',scope:'형법',accessible:true},{id:'criminal-procedure-trial',name:'공판',scope:'공판',accessible:true}],chapters,questions},progress,attemptCounts:counts,
    notes:[{question_id:ids[4]+'-q1',memo:'기존 메모',bookmark:true,mastered_version:1}],statistics:{},todayCount:0};
}

function fixture(bootstrap=records()) {
  const main={innerHTML:'',querySelectorAll:()=>[]};
  const nodes=new Map([['main',main],...['nav','.ox-header','.ox-app-nav'].map(key=>[key,{style:{},replaceChildren(){}}])]);
  const listeners=new Map(),requests=[];
  const root={isConnected:true,querySelector:key=>nodes.get(key)||null,addEventListener:(name,fn)=>listeners.set(name,fn),setAttribute(){},removeAttribute(){}};
  main.prepend=node=>nodes.set('[data-ox-error]',node);
  const context=vm.createContext({crypto,console,DOMParser:class{parseFromString(){return {body:{childNodes:[]}};}},document:{createElement:()=>({dataset:{},setAttribute(){}})}});
  vm.runInContext(source.replace('export function mount','function mount'),context);
  const state=structuredClone(bootstrap);
  context.mount({innerHTML:'',querySelector:()=>root},{bootstrap:structuredClone(state),request:async(action,body)=>{
    requests.push({action,body:structuredClone(body)});
    assert.equal(action,'submit');
    const question=state.catalog.questions.find(q=>q.id===body.questionId);
    assert.ok(question,'Original question ID is sent to the server');
    assert.equal(body.version,question.version);
    const counts=state.attemptCounts[question.id];counts.attempts++;counts.correct++;
    let progress=state.progress.find(p=>p.question_id===question.id);
    if(!progress){progress={question_id:question.id,content_version:question.version,wrong_count:0};state.progress.push(progress);}
    Object.assign(progress,{answer:body.answer,correct:true,answered_at:new Date().toISOString()});
    return structuredClone({question,progress,attemptCounts:{[question.id]:counts},statistics:{}});
  }});
  return {requests,state,html:()=>main.innerHTML,click:(action,dataset={})=>listeners.get('click')({target:{closest:()=>({dataset:{action,...dataset},disabled:false})}})};
}

test('10–14 merge into one learner chapter with 57 questions without changing source records or other subjects',async()=>{
  const original=records(),snapshot=structuredClone(original),f=fixture(original);
  await f.click('daily');
  assert.match(f.html(),/2단원 · 58문항/);
  assert.match(f.html(),/형별론/);assert.match(f.html(),/57문항/);
  assert.equal((f.html().match(/data-action="chapter"/g)||[]).length,2);
  for(const name of names)assert.ok(!f.html().includes(name));
  await f.click('law-part',{part:'specific'});assert.match(f.html(),/각론 유지/);
  await f.click('collection',{id:'criminal-procedure-trial'});assert.match(f.html(),/공판 유지/);
  assert.deepEqual(original,snapshot);
});

test('second and third passes use the minimum per-question count, not total attempts',async()=>{
  for(const rounds of [2,3]){
    const f=fixture(records(q=>q.id===ids[0]+'-q0'?99:rounds));
    await f.click('daily');assert.match(f.html(),new RegExp(rounds+'회독 완료'));
    await f.click('chapter',{id:ids[0]});assert.match(f.html(),new RegExp('<h2>'+rounds+'회독 완료</h2>'));
    assert.match(f.html(),new RegExp((rounds+1)+'회독 진행 중 · 1 / 57문항'));
  }
  const f=fixture(records(q=>q.id===ids[4]+'-q1'?1:9));
  await f.click('chapter',{id:ids[0]});assert.match(f.html(),/<h2>1회독 완료<\/h2>/);
  await f.click('chapter-restart',{id:ids[0]});
  assert.match(f.html(),/<strong>1<\/strong> \/ 1/);assert.match(f.html(),new RegExp(ids[4]+'-q1'));
  await f.click('answer',{answer:'O'});await f.click('next');assert.match(f.html(),/<h2>2회독 완료<\/h2>/);
  assert.equal(f.requests[0].body.questionId,ids[4]+'-q1');
});

test('partial next pass resumes from persisted counts after reload and preserves original server chapter IDs',async()=>{
  const state=records(q=>ids.includes(q.chapter_id)?(q.id.endsWith('-q0')?3:2):1);
  const f=fixture(state);await f.click('chapter',{id:ids[0]});
  assert.match(f.html(),/3회독 진행 중 · 5 \/ 57문항/);
  await f.click('chapter-restart',{id:ids[0]});await f.click('answer',{answer:'O'});
  const answered=f.requests[0].body.questionId;
  assert.ok(!answered.endsWith('-q0'),'Already covered questions are not replayed in this pass');
  assert.equal(f.state.catalog.questions.find(q=>q.id===answered).chapter_id,state.catalog.questions.find(q=>q.id===answered).chapter_id);
  const reload=fixture(f.state);await reload.click('chapter',{id:ids[0]});
  assert.match(reload.html(),/2회독 완료/);assert.match(reload.html(),/3회독 진행 중 · 6 \/ 57문항/);
});

test('a full merged replay crosses study-set boundaries once per question and completes the next pass',async()=>{
  const f=fixture();await f.click('chapter',{id:ids[0]});await f.click('chapter-restart',{id:ids[0]});
  for(let i=0;i<57;i++){
    await f.click('answer',{answer:'O'});await f.click('next');
    if(i<56 && (i+1)%10===0){
      assert.match(f.html(),/data-action="chapter-continue"/);
      await f.click('chapter-continue');
    }
  }
  assert.equal(new Set(f.requests.map(r=>r.body.questionId)).size,57);
  assert.match(f.html(),/<h2>3회독 완료<\/h2>/);
  assert.match(f.html(),/4회독 시작하기/);
  const reload=fixture(f.state);await reload.click('daily');
  const row=reload.html().split('data-id="'+ids[0]+'"')[1].split('</button>')[0];
  assert.match(row,/3회독 완료/);
});

test('new/unanswered current-version questions and incomplete catalogs cannot claim a completed pass',async()=>{
  const fresh=records(q=>q.id===ids[4]+'-q1'?0:2),f=fixture(fresh);
  await f.click('daily');assert.match(f.html(),/56문항 학습/);
  await f.click('chapter',{id:ids[0]});assert.match(f.html(),/<strong>1<\/strong> \/ 1/);
  const partial=records();partial.catalog.questions=partial.catalog.questions.filter(q=>q.id!==ids[4]+'-q1');
  partial.progress=partial.progress.filter(p=>p.question_id!==ids[4]+'-q1');
  const g=fixture(partial);await g.click('daily');
  const row=g.html().split('data-id="'+ids[0]+'"')[1].split('</button>')[0];
  assert.doesNotMatch(row,/회독 완료/);
});

test('review, history replay, weakness and bookmarks all use the merged chapter and retain notes',async()=>{
  const f=fixture();await f.click('history-chapter',{id:ids[0]});
  assert.match(f.html(),/형별론 · 오답노트/);assert.match(f.html(),/57문항/);assert.match(f.html(),/기존 메모/);
  assert.equal((f.html().match(/data-review-filter="chapter-toggle"/g)||[]).length,4);
  await f.click('history-chapter-start',{id:ids[4]});assert.match(f.html(),/<strong>1<\/strong> \/ 57/);
  await f.click('nav',{oxRoute:'weak'});
  assert.match(f.html(),/이전 오답 57문항/);
  for(const id of ids.slice(1))assert.ok(!f.html().includes('data-weak-chapter="'+id+'"'));
  await f.click('nav',{oxRoute:'bookmarks'});assert.match(f.html(),/형별론/);assert.match(f.html(),new RegExp(ids[4]+'-q1'));
});

test('catalog grouping is repeatable and never adds chapters outside the authorized catalog',()=>{
  const context=vm.createContext({});vm.runInContext(fs.readFileSync('docs/criminal-law-ox-proposal/chapter-catalog.js','utf8'),context);
  const catalog=records().catalog;
  const once=context.learningCatalog(catalog),twice=context.learningCatalog(once);
  assert.deepEqual(JSON.parse(JSON.stringify(once)),JSON.parse(JSON.stringify(twice)));
  const trialOnly={...catalog,chapters:catalog.chapters.filter(c=>c.collection_id==='criminal-procedure-trial')};
  assert.equal(context.learningCatalog(trialOnly).chapters.length,1);
});
