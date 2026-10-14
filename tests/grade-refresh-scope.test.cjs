const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source=fs.readFileSync('shared.js','utf8').replace(/\r\n/g,'\n');
const plain=value=>JSON.parse(JSON.stringify(value));
function extract(name, text=source) {
  const start=text.search(new RegExp(`^(?:async )?function ${name}\\(`,'m'));
  assert.ok(start>=0,name);
  const next=text.slice(start+1).search(/^(?:async )?function /m);
  return next<0?text.slice(start):text.slice(start,start+next+1);
}
function harness() {
  const calls=[], control={ fail:'', draft:false, logout:false };
  const tables={ students:[{id:'18001',cohort:'18',track:'A',student_category:'offline'},{id:'18002',cohort:'18',track:'B'}],
    exams:[{id:'e18',cohort:'18'},{id:'e19',cohort:'19'},{id:'common',cohort:''}],
    exam_sections:[{id:'s18',exam_id:'e18'},{id:'s19',exam_id:'e19'},{id:'sc',exam_id:'common'}],
    exam_answers:[{id:'a',exam_section_id:'s18',question_number:1},{id:'b',exam_section_id:'s19',question_number:1},{id:'c',exam_section_id:'sc',question_number:1}],
    exam_submissions:[], fitness_scores:[], final_exam_scores:[{id:'f',student_id:'18001',round:1,cohort:'18'}] };
  const c={ console, Date, APP_MODE:'student', currentRoute:'grades', attendanceHolidayRevision:0,
    studentExamDataLastLoadedAt:1, STUDENT_EXAM_DATA_REFRESH_INTERVAL_MS:30000, STUDENT_SCOPED_REFRESH_ENABLED:true,
    isRemoteLoading:false, state:{ settings:{studentAuthId:'18001',trackOptions:[]},
      students:plain(tables.students), outings:[{id:'keep-outing'}],deletedOutings:[{id:'keep-deleted'}],
      attendanceChecks:[{id:'keep-attendance'}], penalties:[{id:'keep-penalty'}],notices:[],
      examAnswers:[{id:'previous-answer'}],finalExamScores:[{id:'previous-final'}] },
    chunkArray:(rows,size)=>Array.from({length:Math.ceil(rows.length/size)},(_,i)=>rows.slice(i*size,(i+1)*size)),
    getStudentCohort:row=>String(row?.cohort||''),getStudentCategory:row=>row?.studentCategory||row?.student_category||'offline',
    normalizeStudentCategory:x=>x, normalizeCoastGuardTrack:x=>x||'', isSameGradeRankingGroup:(a,b)=>a===b||[a,b].every(x=>['A','B'].includes(x)),
    inferLegacyStudentCohort:()=>'',collectStudentPendingOutingPhotoDrafts:()=>[],
    hasActiveStudentExamDraft:()=>control.draft, isMissingColumnError:()=>false,isMissingRelationError:()=>false,
    isAttendanceManagerPermissionError:()=>false,createLocalDevStoreUrl:()=>false,applyRemoteAppSettingsFromNotices:()=>true,
    migrateLocalSeatAssignmentsToRemoteIfNeeded:async()=>{},removeLegacySampleNotices:x=>x,
    normalizeLoadedWeeklySectionScores:()=>({}),mergeLocalSubmissionAnswersAfterRemoteLoad:()=>{},
    reconcileLoadedExamSubmissionGrades:()=>({}),mapRemoteOutings:x=>x,mergePendingOutingPhotoDrafts:x=>x,
    applyRemoteAttendanceHolidays:()=>{},normalizeTrackOptionList:x=>x,
    loadAttendanceHolidaysFromRemote:async()=>{calls.push({table:'attendance_holidays'});return {data:[],error:null};},
    loadSubmissionAnswersBySubmissionIds:async()=>({data:[],error:null}),
    scheduleStudentLocalSnapshotSave:()=>{},saveStateToLocalStorage:()=>{},render:()=>{},reconcileStudentRegistrationFromRemote:()=>false,
  };
  for (const name of ['Manager','AttendanceCheck','Penalty','Notice','Exam','ExamSection','ExamAnswer','ExamSubmission','SubmissionAnswer','ExamFile','ExamSubjectSetting','FinalExamScore','FitnessScore','StudentRegistrationEvent']) c['map'+name+'FromRemote']=x=>({...x});
  c.remoteStore={from(table){
    let ids=null,idColumn=null,or='',limit=Infinity,start=0,end=Infinity;
    const query={select(){return this;},order(){return this;},eq(){return this;},limit(n){limit=n;return this;},
      in(column,values){idColumn=column;ids=values;return this;},or(value){or=value;return this;},
      range(a,b){start=a;end=b;return this;},
      then(resolve,reject){
        calls.push({table,ids:ids&&[...ids],or,start,end});
        if(control.logout)c.state.settings.studentAuthId='other';
        let rows=tables[table]||[];
        if(ids)rows=rows.filter(row=>ids.includes(row[idColumn]));
        if(or){
          const cohort=JSON.parse(or.match(/cohort\.eq\.("[^"]+")/)[1]);
          const peers=JSON.parse('['+or.match(/student_id\.in\.\((.*)\)/)[1]+']');
          rows=rows.filter(row=>row.cohort==null||row.cohort===''||row.cohort===cohort||peers.includes(row.student_id));
        }
        return Promise.resolve(control.fail===table?{error:new Error('fixture failure')}:{data:rows.slice(start,Math.min(end+1,limit)),error:null}).then(resolve,reject);
      }};
    return query;
  }};
  vm.createContext(c);
  for(const name of ['getStudentGradeAnswerSectionIds','loadStudentFinalScoresFromRemote','loadExamAnswersFromRemote','loadStudentScopedRows','getStudentRemotePeerIds','loadStateFromRemote','shouldUseStudentGradesScopedRefresh','refreshStudentGradesStateFromRemote'])vm.runInContext(extract(name),c);
  return {c,calls,control,tables};
}

test('scheduled grades refresh stays scoped at the exact 30s deadline, keeps metadata fresh and preserves other tabs',async()=>{
  const h=harness();
  h.c.Date={now:()=>30001};
  assert.equal(h.c.shouldUseStudentGradesScopedRefresh(),true);
  assert.equal(h.c.shouldUseStudentGradesScopedRefresh(true),false);
  const before=plain(h.c.state);
  await h.c.refreshStudentGradesStateFromRemote();
  for(const key of ['outings','deletedOutings','attendanceChecks','penalties'])assert.deepEqual(plain(h.c.state[key]),before[key],key);
  for(const table of ['outings','outing_photos','attendance_checks','penalties','attendance_holidays'])assert.equal(h.calls.some(x=>x.table===table),false,table);
  for(const table of ['students','notices','exams','exam_sections','exam_files','exam_subject_settings'])assert.ok(h.calls.some(x=>x.table===table),table);
  assert.deepEqual(plain(h.c.state.examAnswers).map(x=>x.id),['a','c']);
  assert.equal(h.c.isRemoteLoading,false);
  // New publications and edited answer keys are read on the next deadline.
  h.tables.exams.push({id:'new-exam',cohort:'18'});h.tables.exam_sections.push({id:'new-section',exam_id:'new-exam'});
  h.tables.exam_answers.push({id:'new-answer',exam_section_id:'new-section',question_number:2});
  h.tables.exam_answers[0].correct_answer=4;h.c.studentExamDataLastLoadedAt=1;
  await h.c.refreshStudentGradesStateFromRemote();
  assert.ok(h.c.state.examAnswers.some(x=>x.id==='new-answer'));
  assert.equal(h.c.state.examAnswers.find(x=>x.id==='a').correct_answer,4);
  console.log('Grade refresh excludes 4 ancillary table reads plus outing-photo lookup when outings exist.');
});

test('failure, logout and answer entry during refresh never replace existing grades',async()=>{
  for(const failure of ['exam_answers','final_exam_scores','fitness_scores','students']){
    const h=harness(), before=plain(h.c.state);h.control.fail=failure;
    await assert.rejects(h.c.loadStateFromRemote({gradesOnly:true,forceExamData:true}));
    assert.deepEqual(plain(h.c.state),before);assert.equal(h.c.studentExamDataLastLoadedAt,1);
  }
  for(const field of ['draft','logout']){
    const h=harness(), before=plain(h.c.state);h.control[field]=true;
    await h.c.loadStateFromRemote({gradesOnly:true,forceExamData:true});
    assert.deepEqual(plain(h.c.state.examAnswers),before.examAnswers);
    assert.deepEqual(plain(h.c.state.finalExamScores),before.finalExamScores);
    assert.equal(h.c.studentExamDataLastLoadedAt,1);
  }
});

test('answer scope preserves common and historical exams, every track, empty scopes and pagination',async()=>{
  const h=harness();
  assert.equal(h.c.getStudentGradeAnswerSectionIds([], 'missing',[],[]),null);
  assert.deepEqual(plain(h.c.getStudentGradeAnswerSectionIds(h.tables.students,'18001',h.tables.exams,h.tables.exam_sections)),['s18','sc']);
  h.tables.exam_answers=Array.from({length:2100},(_,i)=>({id:String(i).padStart(5,'0'),exam_section_id:i<1100?'s18':'s19',question_number:i+1}));
  assert.equal((await h.c.loadExamAnswersFromRemote('id',['s18','s18'])).data.length,1100);
  assert.equal(h.calls.filter(x=>x.table==='exam_answers').length,2);
  h.calls.length=0;assert.equal((await h.c.loadExamAnswersFromRemote('id',[])).data.length,0);assert.equal(h.calls.length,0);
  assert.equal((await h.c.loadExamAnswersFromRemote('id')).data.length,2100);
  h.calls.length=0;
  h.tables.exam_answers=Array.from({length:161},(_,i)=>({id:String(i),exam_section_id:'s'+i,question_number:i+1}));
  const chunked=await h.c.loadExamAnswersFromRemote('id',h.tables.exam_answers.map(x=>x.exam_section_id));
  assert.equal(chunked.data.length,161);assert.equal(h.calls.length,3);
  assert.ok(h.calls.every(x=>x.ids.length<=80));
});

test('final scores retain external/null-cohort and mismatched historical peer records; large groups avoid query amplification',async()=>{
  const h=harness();
  h.tables.students=Array.from({length:20},(_,i)=>({id:String(18001+i),cohort:'18',track:i%2?'B':'A'}));
  h.tables.final_exam_scores=[
    {id:'self',student_id:'18001',cohort:'18',round:2},
    {id:'peer-old',student_id:'18002',cohort:'17',round:1},
    {id:'external',student_id:'external',cohort:'18',round:2},
    {id:'legacy',student_id:'legacy',cohort:'',round:1},
    {id:'null',student_id:'null',cohort:null,round:1},
    {id:'other',student_id:'other',cohort:'19',round:1},
  ];
  const result=await h.c.loadStudentFinalScoresFromRemote('id',h.tables.students,'18001');
  assert.deepEqual(new Set(result.data.map(x=>x.id)),new Set(['self','peer-old','external','legacy','null']));
  assert.equal(result.data.length,5);assert.equal(h.calls.length,1);
  h.calls.length=0;
  h.tables.students=Array.from({length:90},(_,i)=>({id:String(18001+i),cohort:'18',track:i%2?'B':'A'}));
  assert.equal((await h.c.loadStudentFinalScoresFromRemote('id',h.tables.students,'18001')).data.length,6);
  assert.equal(h.calls.length,1,'large groups use a single complete query');
  h.calls.length=0;
  h.tables.final_exam_scores=Array.from({length:2100},(_,i)=>({id:String(i),student_id:'18001',cohort:'18',round:1}));
  assert.equal((await h.c.loadStudentFinalScoresFromRemote('id',h.tables.students,'18001')).data.length,2100);
  assert.equal(h.calls.length,3,'all pages are retained');
  h.control.fail='final_exam_scores';assert.ok((await h.c.loadStudentFinalScoresFromRemote('id',h.tables.students,'18001')).error);
});

test('actual final-grade totals, ranks and previous rounds match the full query',async()=>{
  const h=harness();
  const studentSource=fs.readFileSync('student.js','utf8').replace(/\r\n/g,'\n');
  Object.assign(h.c,{getStudentProfile:()=>null,getFinalGradeSubjectHeaders:()=>[],getFinalGradeSubjectHeadersForTrack:()=>[]});
  for(const name of ['getStudentRegisteredTrack','getStudentFinalGradeSummary','getStudentFinalScoreRecords',
    'normalizeStudentFinalSubjectScores','applyStudentFinalSubjectRanks','calculateStudentTopPercent']){
    vm.runInContext(extract(name,studentSource),h.c);
  }
  h.tables.final_exam_scores=[1,2].flatMap(round=>[
    {student_id:'18001',cohort:'18',track:'A',score:round*30},
    {student_id:'18002',cohort:'17',track:'B',score:55},
    {student_id:'external',cohort:'18',track:'B',score:50},
    {student_id:'legacy',cohort:'',track:'A',score:60},
    {student_id:'null',cohort:null,track:'A',score:60},
    {student_id:'unrelated',cohort:'19',track:'A',score:90},
  ].map((row,i)=>({...row,id:`${round}-${i}`,round,max_score:100,wrong_count:2})));
  h.c.state.finalExamScores=plain(h.tables.final_exam_scores);
  const before=plain(h.c.getStudentFinalGradeSummary(h.c.state.students[0],2));
  assert.equal(before.total,5);assert.ok(before.previousRank>0);
  h.c.state.finalExamScores=(await h.c.loadStudentFinalScoresFromRemote('*',h.tables.students,'18001')).data;
  assert.equal(h.c.state.finalExamScores.length,10);
  assert.deepEqual(plain(h.c.getStudentFinalGradeSummary(h.c.state.students[0],2)),before);
});
