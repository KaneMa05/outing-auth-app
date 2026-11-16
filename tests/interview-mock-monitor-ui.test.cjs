'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {buildStatus}=require('../lib/interview-mock-monitor.cjs');
const source=fs.readFileSync('interview-mock-monitor.js','utf8');
let imported;const load=()=>imported||=import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const data=()=>({checkedAt:new Date().toISOString(),metricsAvailable:true,modes:['job','personality','live','report'].map(kind=>({kind,state:'ready',enabled:true,transport:kind==='live'?'live':'pc',queued:0,running:0,attention:0,held:0,interrupted:0,completed24h:0,failed24h:0,message:'준비됨',checks:[{label:'<img onerror=x>',ok:true}],runtimeChecks:[]}))});
const flush=()=>new Promise(r=>setImmediate(r));
test('four modes show distinct activation, processing and error labels; data is escaped',async()=>{
 const {renderMockMonitor}=await load();let d=data();d.modes[0].state='completed';d.modes[1].state='disconnected';d.modes[2].state='disabled';d.modes[3].state='health_unknown';
 const html=renderMockMonitor(d);for(const text of ['최근 처리 완료','PC 연결 확인','신규 접수 꺼짐','실행 상태 미확인','전공·직무 시험','인성 연습','실전 AI 면접','종합 분석'])assert(html.includes(text));assert.doesNotMatch(html,/<img/);assert.match(html,/&lt;img/);
 d.modes[0].kind='unknown';assert.match(renderMockMonitor(d),/현재 상태를 확인하지 못했습니다/);assert.match(renderMockMonitor(buildStatus(null,{env:{},metricsAvailable:false})),/처리 집계 연결/);
});

test('PC connection is visible independently of readiness and never inferred from configuration or failed reads',async()=>{
 const {renderMockMonitor}=await load(),d=data();
 d.modes[0].state='disabled';d.modes[1].state='health_unknown';d.modes[3].state='configuration';
 for(const mode of d.modes)mode.runtimeChecks=[{label:'PC 접속 신호',ok:true}];
 let html=renderMockMonitor(d);assert.equal((html.match(/data-pc-connection="connected"/g)||[]).length,3);assert.match(html,/PC 연결됨/);
 for(const label of ['신규 접수 꺼짐','실행 상태 미확인','설정 확인 필요'])assert(html.includes(label));
 for(const mode of d.modes)mode.runtimeChecks[0].ok=false;
 html=renderMockMonitor(d);assert.equal((html.match(/data-pc-connection="disconnected"/g)||[]).length,3);assert.match(html,/PC 연결 안 됨/);assert.doesNotMatch(html,/PC 연결됨/);
 for(const mode of d.modes)mode.runtimeChecks=[];
 html=renderMockMonitor(d);assert.equal((html.match(/data-pc-connection="unknown"/g)||[]).length,3);assert.match(html,/PC 연결 미확인/);
 for(const mode of d.modes)mode.runtimeChecks=[{label:'PC 접속 신호',ok:true}];
 d.metricsAvailable=false;html=renderMockMonitor(d);assert.doesNotMatch(html,/PC 연결됨/);assert.equal((html.match(/data-pc-connection="unknown"/g)||[]).length,3);
 d.metricsAvailable=true;for(const mode of d.modes)mode.transport='api';assert.doesNotMatch(renderMockMonitor(d),/data-pc-connection/);
});
test('manual monitoring never polls or refreshes on tab return and safely handles errors and navigation',async t=>{
 const {mountMockMonitor}=await load();let listeners=0,calls=0,resolve;
 t.mock.timers.enable({apis:['setTimeout','setInterval']});
 const doc={hidden:false,addEventListener(){listeners++;},removeEventListener(){}},host={innerHTML:''};
 const view=mountMockMonitor(host,{doc,request:async action=>{assert.equal(action,'admin_mock_monitor');calls++;if(calls===3)return new Promise(r=>resolve=r);if(calls===2)throw Error('offline');const d=data();d.modes[0].state='completed';return d;}});
 await view.ready;assert.equal(calls,1);assert.match(host.innerHTML,/data-level="success"/);assert.equal(view.canLeave(),true);assert.equal(listeners,0);assert.doesNotMatch(host.innerHTML,/10초마다/);
 t.mock.timers.tick(60000);await flush();assert.equal(calls,1,'No scheduled polling');doc.hidden=true;doc.hidden=false;await flush();assert.equal(calls,1,'No refresh when returning to the tab');
 host.onclick({target:{closest:()=>({})},stopPropagation(){}});await flush();assert.equal(calls,2);assert.match(host.innerHTML,/현재 상태를 확인하지 못했습니다/);assert.match(host.innerHTML,/새로고침을 눌러/);assert.doesNotMatch(host.innerHTML,/data-level="success"/);
 const pending=view.refresh();await view.refresh();assert.equal(calls,3);const before=host.innerHTML;view.destroy();resolve(data());await pending;await view.refresh();assert.equal(calls,3);assert.equal(host.innerHTML,before);assert.equal(host.onclick,null);
});
