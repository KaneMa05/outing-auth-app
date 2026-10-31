'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createPublicationFixture}=require('./helpers/interview-publication-fixture.cjs');
function element(){
 const nodes=new Map();return {nodes,innerHTML:'',textContent:'',className:'',hidden:false,disabled:false,dataset:{},
  querySelector(key){if(!nodes.has(key))nodes.set(key,element());return nodes.get(key);},querySelectorAll(){return [];},
  append(){},insertAdjacentHTML(){},scrollIntoView(){},remove(){},classList:{add(){},remove(){},toggle(){}}};
}
(async()=>{
 const f=await createPublicationFixture();
 try{
  const calls=[],confirms=[];let accept=true,lockControl=null;
  const context={window:{addEventListener(){},removeEventListener(){}},confirm:message=>{confirms.push(message);return accept;},
   console,FormData,AbortController,location:{reload(){}}};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('interview-prep-ui.js','utf8').replace(/^import .*\r?\n/gm,'').replaceAll('export ',''),context);
  const host=element(),request=async(action,body={})=>{if(action==='admin_question_publication'&&lockControl)assert.equal(lockControl.disabled,true,'Typing is blocked during approval requests');calls.push({action,...JSON.parse(JSON.stringify(body))});return f.invoke(action,f.admin,body);};
  const view=await context.mountAdmin(host,{request,initialSection:'questions'});
  const content=()=>host.querySelector('[data-content]').innerHTML;
  assert.match(content(),/공개 승인 여부/);assert.match(content(),/공개 승인 완료/);assert.match(content(),/승인 대기/);
  assert.match(content(),/data-ip="question-approval"/);
  const click=async(dataset,disabled=false)=>{const target={dataset,disabled};await host.onclick({target:{closest:()=>target}});};
  accept=false;
  await click({ip:'question-approval',id:'publication-personality',revision:'1',approved:'true'});
  assert.equal((await f.question('publication-personality')).status,'draft');
  assert.equal(calls.filter(c=>c.action==='admin_question_publication').length,0);
  accept=true;
  lockControl={disabled:false};host.querySelector('[data-editor]').querySelectorAll=()=>[lockControl];
  await click({ip:'question-approval',id:'publication-personality',revision:'1',approved:'true'});
  assert.equal(lockControl.disabled,false);
  assert.equal((await f.question('publication-personality')).status,'published');
  assert.match(content(),/data-id="publication-personality" data-revision="2" data-approved="false"/);
  assert.match(host.querySelector('[data-message]').textContent,/공개 승인했습니다/);
  await click({ip:'question-approval',id:'publication-personality',revision:'1',approved:'false'});
  assert.equal((await f.question('publication-personality')).status,'published');
  assert.match(host.querySelector('[data-message]').textContent,/다른 기기 또는 관리자/);
  await click({ip:'question-edit',id:'publication-personality'});
  const editor=host.querySelector('[data-editor]');assert.match(editor.innerHTML,/원본 출처와 해설/);
  assert.match(editor.innerHTML,/공개 승인은 아래 별도 버튼/);
  assert.match(editor.innerHTML,/data-ip="question-approval"/);
  host.oninput({target:{closest:()=>editor}});
  const before=calls.length,unsaved=editor.innerHTML;
  await click({ip:'question-approval',id:'publication-personality',revision:'2',approved:'false'});
  assert.equal(calls.length,before);assert.equal(editor.innerHTML,unsaved);
  assert.match(host.querySelector('[data-message]').textContent,/먼저 저장/);
  await click({ip:'question-publish'});assert.equal(calls.length,before);assert.equal(editor.innerHTML,unsaved);
  assert.match(host.querySelector('[data-message]').textContent,/먼저 저장/);
  await click({ip:'close'});
  await click({ip:'question-approval',id:'publication-personality',revision:'2',approved:'false'});
  assert.equal((await f.question('publication-personality')).status,'draft');
  assert.match(host.querySelector('[data-message]').textContent,/승인을 취소/);
  assert(confirms.some(s=>s.includes('원문 해설')));
  await view.openSection('job');assert.match(content(),/data-id="publication-job"/);
  await click({ip:'question-approval',id:'publication-job',revision:'1',approved:'true'});
  assert.equal((await f.question('publication-job')).status,'published');
  await view.openSection('core');assert.match(content(),/data-id="publication-personality"/);
  assert.match(content(),/선택 문항 공개 승인/);view.destroy();lockControl=null;
  const readonly=element(),readView=await context.mountAdmin(readonly,{request,initialSection:'questions',canWrite:false});
  const readonlyContent=readonly.querySelector('[data-content]').innerHTML;
  assert.match(readonlyContent,/data-ip="question-approval"[^>]*disabled/);
  const readCalls=calls.length,target={dataset:{ip:'question-approval',id:'publication-personality',revision:'3',approved:'true'},disabled:false};
  await readonly.onclick({target:{closest:()=>target}});assert.equal(calls.length,readCalls);
  readView.destroy();
  // Classification/rubric review has its own explicit publication control.
  const source=(await f.question('publication-personality'));
  await f.db.query("insert into ip_question_rubrics(question_id,source_prompt,source_category,kind,rationale) values($1,$2,$3,'personality_experience','test rubric for separate approval')",[source.id,source.prompt,source.category]);
  const rubricContext=vm.createContext({window:context.window,confirm:context.confirm,FormData,loadModule:async()=>({mountExamValidation:()=>({isRunning:()=>false,destroy(){}})})});
  vm.runInContext(fs.readFileSync('interview-rubric-ui.js','utf8').replaceAll('export ','').replaceAll('await import(','await loadModule('),rubricContext);
  const rubricHost=element(),rubricView=rubricContext.mountRubrics(rubricHost,{request,initialQuestionId:source.id});await rubricView.ready;
  assert.match(rubricHost.querySelector('[data-rubric-editor]').innerHTML,/질문 공개 승인 여부/);
  const rubricClick=async approved=>{const b={dataset:{rubric:'publication',id:source.id,revision:String((await f.question(source.id)).revision),approved:String(approved)},disabled:false};await rubricHost.onclick({target:{closest:()=>b},stopPropagation(){}});};
  await rubricClick(true);assert.equal((await f.question(source.id)).status,'published');
  assert.equal((await f.invoke('admin_rubric_detail',f.admin,{id:source.id})).rubric.status,'draft','Publishing a question does not approve its rubric');
  rubricHost.oninput({target:{closest:()=>({}),name:'rationale'}});
  await rubricClick(false);assert.equal((await f.question(source.id)).status,'published');
  assert.match(rubricHost.querySelector('[data-rubric-message]').textContent,/먼저 저장/);rubricView.destroy();
  console.log('PASS publication UI: approve/cancel, stale errors, dirty-editor protection, job/core controls and read-only permissions.');
 }finally{await f.db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
