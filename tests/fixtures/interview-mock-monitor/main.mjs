import {mountAdmin} from '/interview-prep-ui.js';
const host=document.querySelector('#host'),scenario=document.querySelector('#scenario'),diagnostics=document.querySelector('#diagnostics');
let monitorCalls=0,unexpected=0;const errors=[];
addEventListener('error',e=>{errors.push(e.message);diagnostics.textContent='화면 오류: '+errors.join(', ');});
const request=async action=>{
 if(action==='admin_catalog')return {topics:[],categoryCounts:{job:{total:48,draft:0,published:48},personality:{total:30,draft:0,published:30}},enabled:true};
 if(action==='admin_applications')return {summary:{students:42,pending:1},applications:[]};
 if(action==='admin_review_students')return {pendingStudents:3,revisionStudents:1};
 if(action==='admin_questions')return {questions:[],page:0,total:0};
 if(action==='admin_cli_status')return {checkedAt:new Date().toISOString(),workers:['core25','questions','answers'].map(id=>({id,available:true,enabled:true,connected:true,running:0,queued:0,lastSeenAt:new Date().toISOString()}))};
 if(action==='admin_draft_worker_status')return {enabled:true,connected:true,running:0,queued:0,lastSeenAt:new Date().toISOString(),lastCompletedAt:new Date(Date.now()-3600000).toISOString(),checkedAt:new Date().toISOString()};
 if(action==='admin_mock_monitor'){
  monitorCalls++;diagnostics.textContent=`모니터 조회 ${monitorCalls}회 · 예상 밖 요청 ${unexpected}회 · 화면 오류 ${errors.length}건`;
  const response=await fetch('/preview/monitor?scenario='+encodeURIComponent(scenario.value));if(!response.ok)throw Error('preview_unavailable');return response.json();
 }
 unexpected++;throw Error('preview_action');
};
const view=await mountAdmin(host,{initialSection:'home',request,canWrite:false});
scenario.addEventListener('change',()=>void view.openSection('home'));
document.querySelectorAll('[data-section]').forEach(button=>button.onclick=()=>{if(view.canLeave())void view.openSection(button.dataset.section);});
document.querySelector('#width').onclick=()=>document.body.classList.toggle('qa-narrow');
