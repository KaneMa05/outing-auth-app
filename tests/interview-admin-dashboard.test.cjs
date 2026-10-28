const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const source=fs.readFileSync('interview-prep-ui.js','utf8');
const start=source.indexOf("      const summary=host.querySelector('[data-dashboard-summary]');");
const end=source.indexOf('      return;',start);
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const render=new AsyncFunction('host','box','request','catalog','btn','destroyed','version','loadVersion',source.slice(start,end));
const button=(label,action,extra)=>`<button ${extra}>${label}</button>`;
async function run(request,destroyed=false){
 const summary={innerHTML:'loading'},box={innerHTML:'loading'};
 await render({querySelector:()=>summary},box,request,{categoryCounts:{personality:{total:2997,draft:2997,published:0}}},button,destroyed,1,1);
 return {summary:summary.innerHTML,content:box.innerHTML};
}
test('dashboard uses global totals, preserves zero, and separates question counts',async()=>{
 const calls=[];
 const result=await run(async(action,body)=>{calls.push([action,body]);return action==='admin_applications'?{summary:{students:42,pending:0},applications:[]}:{pendingStudents:35,revisionStudents:8,students:[]};});
 assert.equal(calls.length,2);
 assert.equal(calls[1][1].status,'');
 assert.match(result.summary,/42<\/strong> 명 이용 가능/);
 assert.match(result.summary,/0<\/strong> 건 신청 대기/);
 assert.match(result.summary,/35<\/strong> 명 확인 대기/);
 assert.doesNotMatch(result.summary,/2,997/);
 assert.match(result.content,/2,997/);
 assert.match(result.content,/data-section="home"/);
});
test('partial failure retains successful totals and marks unavailable counts',async()=>{
 const result=await run(async action=>{if(action==='admin_review_students')throw Error('offline');return {summary:{students:5,pending:1}};});
 assert.match(result.summary,/5<\/strong> 명 이용 가능/);
 assert.match(result.summary,/—<\/strong> 명 확인 대기/);
 assert.match(result.content,/role="alert"/);
});
test('late responses cannot update a destroyed dashboard',async()=>{
 const result=await run(async()=>({}),true);
 assert.equal(result.summary,'loading');
 assert.equal(result.content,'loading');
});
