const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {test}=require('node:test');
function node(){
 const nodes=new Map();
 return {innerHTML:'',textContent:'',dataset:{},nextElementSibling:{},
 querySelector(s){if(!nodes.has(s))nodes.set(s,node());return nodes.get(s);},querySelectorAll(){return [];}};
}
function harness(experiences){
 const host=node(),calls=[];let evaluated=0,goLife=0,current=experiences,fail=false,resolve;
 const context={window:{addEventListener(){},removeEventListener(){}},confirm:()=>true,
 experienceText:r=>({...r,content:r.content??r.situation??''}),
 diagnoseExperiences(){evaluated++;return [{id:'test',title:'테스트',level:0,evidence:[],questions:[]}];},
 diagnosisStages:['미확인'],renderDiagnosisChart:()=>'<svg></svg>'};
 vm.createContext(context);
 vm.runInContext(fs.readFileSync('interview-diagnosis-ui.js','utf8').replace(/^import .*\r?\n/gm,'').replace('export function','function'),context);
 const request=async action=>{calls.push(action);if(fail)throw Error('offline');if(resolve)await new Promise(r=>resolve.push(r));return action==='life_get'?{profile:{content:{experiences:current}},competencies:[]}:{answers:[]};};
 const view=context.mountDiagnosis(host,{request,onLife:()=>goLife++});
 return {host,calls,view,get evaluated(){return evaluated;},get goLife(){return goLife;},setRows:r=>current=r,setFail:()=>fail=true,pause:()=>resolve=[],release:()=>resolve.forEach(r=>r()),
 click:attribute=>host.onclick({target:{closest:()=>({disabled:false,hasAttribute:key=>key===attribute})}})};
}
test('empty or title-only graph shows a neutral writing guide, not results',async()=>{
 for(const rows of [[],[{title:'제목',content:'  '}]] ){
  const h=harness(rows);await h.view.ready;
  assert.equal(h.evaluated,0);assert.deepEqual(h.calls,['life_get']);
  assert.match(h.host.innerHTML,/인생그래프 작성하기/);assert.match(h.host.innerHTML,/data-diagnosis-start disabled/);
  assert.doesNotMatch(h.host.innerHTML,/data-diagnosis-items|data-diagnosis-status/);
  await h.click('data-diagnosis-life');assert.equal(h.goLife,1);h.view.destroy();
 }
});
test('saved experiences wait for a click, then use a fresh read for diagnosis',async()=>{
 const h=harness([{content:'경험 내용'}]);await h.view.ready;
 assert.equal(h.evaluated,0);assert.match(h.host.innerHTML,/경험 1개/);
 await h.click('data-diagnosis-start');assert(h.evaluated>0);
 assert.deepEqual(h.calls,['life_get','life_get','diagnosis_get']);
 assert.match(h.host.innerHTML,/data-diagnosis-items/);h.view.destroy();
});
test('if another screen clears the graph, clicking diagnose returns to the guide',async()=>{
 const h=harness([{content:'경험 내용'}]);await h.view.ready;h.setRows([]);
 await h.click('data-diagnosis-start');assert.equal(h.evaluated,0);assert.match(h.host.innerHTML,/인생그래프 작성하기/);h.view.destroy();
});
test('failed loads show retry instead of zero scores',async()=>{
 const h=harness([{content:'경험 내용'}]);await h.view.ready;h.setFail();
 await h.click('data-diagnosis-start');assert.equal(h.evaluated,0);assert.match(h.host.innerHTML,/다시 시도/);h.view.destroy();
});
test('leaving while diagnosis loads never paints a late result',async()=>{
 const h=harness([{content:'경험 내용'}]);await h.view.ready;
 h.pause();const pending=h.click('data-diagnosis-start');h.view.destroy();
 h.host.innerHTML='다른 화면';h.release();await pending;
 assert.equal(h.evaluated,0);assert.equal(h.host.innerHTML,'다른 화면');
});
