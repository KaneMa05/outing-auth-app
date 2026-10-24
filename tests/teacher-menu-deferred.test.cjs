const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {test}=require('node:test');
const source=fs.readFileSync('shared.js','utf8');
function harness(){
  const c={console,Map,Promise,Math,teacherMenuDataEpoch:0,teacherMenuDataLoads:new Map(),state:{examAnswers:[{id:'old'}]},teacherAuth:{authenticated:true},
    teacherBaseDataLoaded:true,isRemoteLoading:false,currentRoute:'weekly-exams',calls:[],renderAppIfReady(){},
    normalizeLoadedWeeklySectionScores:()=>null,persistNormalizedWeeklySectionScores:async()=>{},
    isMissingRelationError:()=>false,isMissingColumnError:(error,col)=>error?.column===col,
    renderDataLoadingState:()=> 'loading',el:(tag,props,children)=>({tag,children}),button:(text,cls,type,click)=>({text,click})};
  for(const name of ['Exam','ExamSection','ExamAnswer','ExamFile','ExamSubjectSetting','FinalExamScore','StudentRegistrationEvent']) c['map'+name+'FromRemote']=x=>({...x});
  c.tables={exam_answers:Array.from({length:1103},(_,i)=>({id:String(i)}))};
  c.remoteStore={from(table){let start=0,end=499,columns='';return {select(cols){columns=cols;return this;},order(){return this;},range(a,b){start=a;end=b;return this;},
    async then(resolve,reject){try{c.calls.push({table,start,end,columns});if(c.hold)await c.hold;
      if(c.fail===table)return resolve({error:Error('fixture failure')});
      if(c.missing && columns.split(',').includes(c.missing))return resolve({error:{column:c.missing}});
      resolve({data:(c.tables[table]||[]).slice(start,end+1),error:null});}catch(e){reject(e);}}};}};
  c.loadStudentFinalScoresFromRemote=async()=>({data:[{id:'final'}],error:null});
  vm.createContext(c);
  for(const name of ['resetTeacherMenuDataLoads','teacherDataGroupsForRoute','loadTeacherMenuRows','loadTeacherMenuDataGroup','renderTeacherDataRoute']){
    const match=source.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}`));assert.ok(match,name);vm.runInContext(match[0],c);
  }
  return c;
}
test('only required groups load, multi-page answers publish together, repeated renders deduplicate',async()=>{
  const c=harness();let release;c.hold=new Promise(r=>release=r);
  assert.equal(c.renderTeacherDataRoute(()=> 'ready'),'loading');assert.equal(c.renderTeacherDataRoute(()=> 'ready'),'loading');
  assert.equal(c.state.examAnswers[0].id,'old');
  const work=c.teacherMenuDataLoads.get('exams').promise;release();await work;
  assert.equal(c.state.examAnswers.length,1103);assert.equal(c.calls.filter(x=>x.table==='exam_answers').length,3);
  assert.equal(c.renderTeacherDataRoute(()=> 'ready'),'ready');assert.equal(c.teacherMenuDataLoads.has('finals'),false);
  c.currentRoute='home';assert.equal(c.renderTeacherDataRoute(()=> 'home'),'home');
});
test('failure keeps existing data, renders do not retry, explicit retry recovers',async()=>{
  const c=harness();c.fail='exam_files';await c.loadTeacherMenuDataGroup('exams');
  assert.equal(c.state.examAnswers[0].id,'old');const count=c.calls.length;
  c.renderTeacherDataRoute(()=> 'ready');c.renderTeacherDataRoute(()=> 'ready');assert.equal(c.calls.length,count);
  c.fail=null;await c.loadTeacherMenuDataGroup('exams');assert.equal(c.state.examAnswers.length,1103);
});
test('logout and reinitialization discard an in-flight result',async()=>{
  const c=harness();let release;c.hold=new Promise(r=>release=r);
  const work=c.loadTeacherMenuDataGroup('exams');c.teacherAuth.authenticated=false;c.resetTeacherMenuDataLoads();release();
  assert.equal(await work,false);assert.equal(c.state.examAnswers[0].id,'old');assert.equal(c.teacherMenuDataLoads.size,0);
});
test('optional legacy columns, device limit and route dependencies are preserved',async()=>{
  const c=harness();c.missing='correct_answers';await c.loadTeacherMenuDataGroup('exams');
  assert.equal(c.state.examAnswers.length,1103);assert.ok(c.calls.some(x=>x.table==='exam_answers'&&!x.columns.includes('correct_answers')));
  c.tables.student_registration_events=Array.from({length:1200},(_,i)=>({id:String(i)}));await c.loadTeacherMenuDataGroup('devices');
  assert.equal(c.state.studentRegistrationEvents.length,1000);
  assert.deepEqual(Array.from(c.teacherDataGroupsForRoute('grades')),['exams','finals']);
  assert.deepEqual(Array.from(c.teacherDataGroupsForRoute('student-preview')),['exams','finals']);
  assert.deepEqual(Array.from(c.teacherDataGroupsForRoute('device-history')),['devices']);
});
