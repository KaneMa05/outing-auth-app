const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const flush=async()=>{for(let i=0;i<100;i++)await Promise.resolve();};
function extract(file,name){
  const source=fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n');
  const start=source.search(new RegExp('^(?:async )?function '+name+'\\(','m'));
  assert.ok(start>=0,name);const next=source.slice(start+1).search(/^(?:async )?function /m);
  return next<0?source.slice(start):source.slice(start,start+next+1);
}
for(const kind of ['shop','ranking','notifications','examNumbers','push','applications']){
  test(kind+': rerenders never retry failures; explicit retry recovers',async()=>{
    let calls=0,ok=false,ensure,retry;
    const student={id:'fixture',studentCategory:'lecture'};
    const c={console:{error(){}},currentRoute:'',getAuthedStudent:()=>student,getStudentCategory:()=> 'lecture',
      isOnlineStudentExperience:()=>true,isStudyCafeLocalPreview:()=>false,getStudentProfile:()=>({deviceToken:'fixture'}),
      updateStudentNotificationBadge(){},mapLectureApplication:x=>x,
      studyCafeRemoteState:{available:true,rankingPeriods:{}},studyCafeShopState:{loaded:false,loading:false},
      studentNotificationInboxState:{studentId:student.id,loaded:false,loading:false},
      requestStudyCafeAction:async()=>{assert.ok(++calls<10,'retry storm');return {ok,ranking:[],summary:{}};},
      fetch:async()=>{assert.ok(++calls<10,'retry storm');return {ok,json:async()=>({ok})};},
      render:()=>ensure(),renderStudyCafeStateUpdate:()=>ensure(),
      hydrateStudyCafeShop:()=>{c.studyCafeShopState.loaded=true;c.studyCafeShopState.available=true;},
    };
    vm.createContext(c);
    if(kind==='shop'){
      c.currentRoute='study-cafe';vm.runInContext(extract('study-shop.js','ensureStudyCafeShopLoaded'),c);
      ensure=()=>c.ensureStudyCafeShopLoaded();retry=()=>c.ensureStudyCafeShopLoaded({force:true});
    }else if(kind==='ranking'){
      c.currentRoute='study-ranking';vm.runInContext(extract('app.js','requestStudyRankingPeriod'),c);
      ensure=()=>c.requestStudyRankingPeriod('weekly');retry=()=>c.requestStudyRankingPeriod('weekly',{force:true});
    }else if(kind==='notifications'){
      c.currentRoute='notifications';vm.runInContext(extract('app.js','ensureStudentNotificationInboxLoaded'),c);
      ensure=()=>c.ensureStudentNotificationInboxLoaded(student);retry=()=>c.ensureStudentNotificationInboxLoaded(student,{force:true});
    }else{
      const specs={examNumbers:['studentExamNumberAdminState','student-exam-numbers','ensureStudentExamNumberAdminLoaded','loadStudentExamNumberAdminData'],
        push:['studentPushAdminState','student-push','ensureStudentPushAdminLoaded','loadStudentPushAdminData'],
        applications:['lectureApplicationAdminState','students','ensureLectureApplicationsLoaded','loadLectureApplications']};
      const [state,route,entry,load]=specs[kind];c[state]={loaded:false,loading:false,dirtyStudentIds:new Set()};c.currentRoute=route;
      vm.runInContext(extract('teacher-students.js',entry)+'\n'+extract('teacher-students.js',load),c);
      ensure=()=>c[entry]();retry=()=>c[load]({force:true});
    }
    await ensure();await flush();assert.equal(calls,1);
    for(let i=0;i<10;i++)ensure();await flush();assert.equal(calls,1);
    ok=true;await retry();await flush();assert.equal(calls,2);
    await ensure();await flush();assert.equal(calls,2,'successful state is cached');
  });
}

test('home/planner summaries cannot satisfy the subsequent full cafe load',async()=>{
  const calls=[],hydrated=[];
  const c={console,Date,currentRoute:'home',getAuthedStudent:()=>({id:'student'}),isOnlineStudentExperience:()=>true,
    studyCafeRemoteState:{studentId:'student',loading:false,loaded:false,available:null},
    ensureStudyCafeRemoteTimers(){},studyCafeSessionRevision:0,studyTodoMutationRevision:0,studySubjectMutationRevision:0,
    studyCafeTimerActionPending:false,studyCafeCountdownInterval:null,studyTodoDeletePendingKeys:new Set(),
    requestStudyCafeAction:async action=>{calls.push(action);return {ok:true,scope:action==='personal_load'?'personal':undefined};},
    hydrateStudyCafeSnapshot:(data,options)=>hydrated.push({data,options}),updateStudyCafeHomeLiveCount(){},updateLectureHomeSummary(){},
    isStudyCafeRoute:()=>true,renderStudyCafeStateUpdate(){},
  };
  vm.createContext(c);vm.runInContext(extract('app.js','ensureStudyCafeRemoteLoaded'),c);
  assert.equal(await c.ensureStudyCafeRemoteLoaded(),true);
  c.currentRoute='study-todo';await c.ensureStudyCafeRemoteLoaded();assert.deepEqual(calls,['personal_load']);
  c.currentRoute='study-cafe';await c.ensureStudyCafeRemoteLoaded();assert.deepEqual(calls,['personal_load','load']);
  c.currentRoute='home';await c.ensureStudyCafeRemoteLoaded({force:true});assert.equal(calls.at(-1),'personal_load');
  c.currentRoute='study-ranking';await c.ensureStudyCafeRemoteLoaded();assert.equal(calls.at(-1),'load');
  assert.equal(hydrated.length,4);
});

test('partial hydration preserves existing seats, rankings and equipment',()=>{
  const source=extract('app.js','hydrateStudyCafeSnapshot');
  const c={studyCafeRemoteState:{studyDateKey:'2026-10-14',plannerDateKey:'2026-10-14',room:['seat'],ranking:['rank'],rankingPeriods:{daily:{ranking:['rank']}},todosByDate:{},subjectGoalsByDate:{}},
    studyCafePreviewState:{},hydrateStudyCafeShopSummary:()=>assert.fail('equipment must not be reloaded'),
  };
  vm.createContext(c);vm.runInContext(source.slice(0,source.indexOf('  const totals ='))+'}',c);
  c.hydrateStudyCafeSnapshot({scope:'personal',studyDate:'2026-10-14',subjects:['Law'],todos:[{id:'todo'}],summary:{focusedCount:3}});
  assert.deepEqual(c.studyCafeRemoteState.room,['seat']);assert.deepEqual(c.studyCafeRemoteState.ranking,['rank']);
  assert.equal(c.studyCafeRemoteState.todos[0].id,'todo');assert.equal(c.studyCafeRemoteState.summary.focusedCount,3);
});
