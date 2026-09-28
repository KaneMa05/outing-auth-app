const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');

function fixture(initial){
  const requests=[],listeners=new Map(),nodes=new Map();
  const main={innerHTML:'',prepend:node=>nodes.set('[data-ox-error]',node)};
  for(const key of ['nav','.ox-header','.ox-app-nav'])nodes.set(key,{style:{},replaceChildren(){}});
  nodes.set('main',main);
  const root={isConnected:true,querySelector:selector=>nodes.get(selector)||null,setAttribute(){},removeAttribute(){},addEventListener:(name,fn)=>listeners.set(name,fn)};
  const host={innerHTML:'',querySelector:()=>root};
  const context=vm.createContext({crypto,DOMParser:class{parseFromString(){return {body:{childNodes:[]}};}},document:{createElement:()=>({dataset:{},setAttribute(){}})}});
  vm.runInContext(fs.readFileSync('criminal-law-ox.js','utf8').replace('export function mount','function mount'),context);
  const controller=context.mount(host,{bootstrap:initial||{homeOnly:true,statisticsDeferred:true,home:{reviewCount:1},todayCount:7,catalog:{collections:[],chapters:[],questions:[]},progress:[],notes:[]},request:(action,body)=>new Promise((resolve,reject)=>requests.push({action,body,resolve,reject}))});
  const q={id:'q',chapter_id:'c',version:1,prompt:'테스트 지문',context:'',correct_answer:'O'};
  const data={ok:true,statisticsDeferred:true,catalog:{collections:[{id:'law',name:'형법',scope:'형법',accessible:true}],chapters:[{id:'c',collection_id:'law',display_name:'테스트 단원',sort_order:1,question_count:1}],questions:[q]},progress:[{question_id:'q',content_version:1,answer:'X',correct:false,wrong_count:2}],notes:[],attemptCounts:{},statistics:{},todayCount:7};
  return {root,main,requests,controller,data,listeners,
    click:(action,dataset={})=>listeners.get('click')({target:{closest:()=>({dataset:{action,...dataset},disabled:false})}}),
    respond:(i,value=data)=>requests[i].resolve(structuredClone(value)),
    reject:(i,code='ox_unavailable')=>requests[i].reject(Object.assign(Error(code),{code})),
    flush:()=>new Promise(resolve=>setImmediate(resolve))};
}

test('home renders authoritative counters without fetching a catalog; chapters load once without statistics',async()=>{
  const f=fixture();assert.equal(f.requests.length,0);assert.match(f.main.innerHTML,/오늘 7문항/);assert.match(f.main.innerHTML,/<strong>1<\/strong> 문항/);
  await f.click('daily');assert.equal(f.requests[0].action,'bootstrap');assert.equal(f.requests[0].body.deferStatistics,true);
  await f.click('nav',{oxRoute:'chapters'});assert.equal(f.requests.length,1);
  f.respond(0);await f.flush();assert.match(f.main.innerHTML,/테스트 단원/);assert.equal(f.requests.length,1);
  await f.click('nav',{oxRoute:'home'});await f.click('daily');assert.equal(f.requests.length,1);
});

test('weakness loads cumulative counts on demand and retries without showing invented zero rates',async()=>{
  const f=fixture();await f.click('nav',{oxRoute:'weak'});f.respond(0);await f.flush();
  assert.equal(f.requests[1].action,'attempt_counts');assert.match(f.main.innerHTML,/role="status"/);assert.doesNotMatch(f.main.innerHTML,/누적 정답률 낮은 순/);
  await f.click('nav',{oxRoute:'weak'});assert.equal(f.requests.length,2);
  f.reject(1);await f.flush();assert.match(f.main.innerHTML,/다시 시도/);
  await f.click('retry-questions');await f.flush();assert.equal(f.requests[2].action,'attempt_counts');
  f.respond(2,{ok:true,attemptCounts:{q:{attempts:4,correct:2,wrong:2}}});await f.flush();
  assert.match(f.main.innerHTML,/50%/);assert.match(f.main.innerHTML,/누적 4회 풀이/);
  await f.click('nav',{oxRoute:'home'});await f.click('nav',{oxRoute:'weak'});assert.equal(f.requests.length,3);
});

test('home navigation cancels pending rendering and unnecessary statistics; failure retries catalog',async()=>{
  const f=fixture();await f.click('nav',{oxRoute:'weak'});await f.click('nav',{oxRoute:'home'});
  f.respond(0);await f.flush();assert.equal(f.requests.length,1);assert.match(f.main.innerHTML,/오늘 학습/);
  const retry=fixture();await retry.click('daily');retry.reject(0);await retry.flush();assert.match(retry.main.innerHTML,/다시 시도/);
  await retry.click('retry-questions');retry.respond(1);await retry.flush();assert.match(retry.main.innerHTML,/테스트 단원/);
});

test('bookmarks and review load records without cumulative or cohort aggregates; detail opts into statistics',async()=>{
  const f=fixture();f.controller.openBookmarks();assert.equal(f.requests[0].action,'bootstrap');
  f.respond(0,{...f.data,notes:[{question_id:'q',bookmark:true}]});await f.flush();assert.match(f.main.innerHTML,/테스트 지문/);
  await f.click('review-needed');assert.equal(f.requests.length,1);
  const details={dataset:{questionDetail:'q'},open:true,isConnected:false};
  const toggle=f.listeners.get('toggle')({target:details});
  assert.equal(f.requests[1].action,'detail');assert.equal(f.requests[1].body.includeStatistics,true);
  f.reject(1);await toggle;assert.equal(details.dataset.loading,undefined);
});

test('a stale counts response cannot overwrite a newer saved answer',async()=>{
  const f=fixture();await f.click('nav',{oxRoute:'weak'});f.respond(0);await f.flush();
  await f.click('nav',{oxRoute:'chapters'});await f.click('one',{id:'q'});
  const save=f.click('answer',{answer:'O'});assert.equal(f.requests[2].action,'submit');
  f.respond(2,{question:{...f.data.catalog.questions[0],explanation_html:'해설'},progress:{...f.data.progress[0],answer:'O',correct:true,answered_at:'2026-09-28T01:00:00Z'},attemptCounts:{q:{attempts:5,correct:3,wrong:2}},statistics:{answered:10,wrong:2}});await save;
  f.respond(1,{ok:true,attemptCounts:{q:{attempts:4,correct:2,wrong:2}}});await f.flush();
  await f.click('nav',{oxRoute:'weak'});await f.flush();assert.equal(f.requests[3].action,'attempt_counts');
  f.respond(3,{ok:true,attemptCounts:{q:{attempts:5,correct:3,wrong:2}}});await f.flush();assert.match(f.main.innerHTML,/60%/);
});

test('legacy full bootstrap avoids deferred requests; disconnected or revoked views never render late data',async()=>{
  const template=fixture();const full={...template.data,statisticsDeferred:false,attemptCounts:{q:{attempts:4,correct:2,wrong:2}}};
  const old=fixture(full);await old.click('nav',{oxRoute:'weak'});assert.equal(old.requests.length,0);assert.match(old.main.innerHTML,/50%/);
  const gone=fixture();await gone.click('daily');gone.root.isConnected=false;gone.respond(0);await gone.flush();assert.doesNotMatch(gone.main.innerHTML,/테스트 단원/);
  const denied=fixture();await denied.click('daily');denied.reject(0,'ox_book_required');await denied.flush();assert.match(denied.main.innerHTML,/이용 상태가 변경/);
});
