const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const modulePromise=import('../client/interview-aptitude-grades.mjs');
const students=[
  {studentId:'a',name:'동명 학생',state:'submitted',correctCount:75,subjectCorrectCounts:[15,15,15,15,15],accuracy:100,rank:1,submittedAt:'2026-11-12T16:30:00Z'},
  {studentId:'b',name:'동명 학생',state:'submitted',correctCount:75,accuracy:100,rank:1,submittedAt:'2026-11-13T01:00:00Z'},
  {studentId:'c',name:'다음 학생',state:'submitted',correctCount:0,subjectCorrectCounts:[0,0,0,0,0],accuracy:0,rank:3,submittedAt:'2026-11-13T02:00:00Z'},
  {studentId:'draft-id',name:'임시 학생',state:'draft',correctCount:null,accuracy:null,rank:null},
  {studentId:'missing-id',name:'미제출 학생',state:'not_submitted',correctCount:null,accuracy:null,rank:null}
];
test('grade summaries count every state and average submitted results including zero scores',async()=>{
  const {summarizeGrades}=await modulePromise;
  const summary=summarizeGrades(students);
  assert.equal(summary.total,5);assert.equal(summary.submitted,3);assert.equal(summary.draft,1);assert.equal(summary.notSubmitted,1);
  assert.equal(summary.averageAccuracy,200/3);assert.equal(summary.highestCorrect,75);
  assert.equal(summarizeGrades(students.slice(3)).averageAccuracy,null);assert.equal(summarizeGrades([]).highestCorrect,null);
});
test('search and state filters preserve tied ranks and disambiguate identical student names',async()=>{
  const {filterGrades}=await modulePromise;
  assert.deepEqual(filterGrades(students,{query:'동명'}).map(s=>s.rank),[1,1]);
  assert.deepEqual(filterGrades(students,{query:' DRAFT-ID ',state:'draft'}).map(s=>s.studentId),['draft-id']);
  assert.deepEqual(filterGrades(students,{query:'미제출',state:'submitted'}),[]);
  assert.equal(filterGrades(students,{state:'submitted'})[2].rank,3);
});
test('CSV uses Korean-time dates, preserves zero scores, quotes delimiters, and neutralizes formulas',async()=>{
  const {aptitudeGradesCsv}=await modulePromise;
  const round={kind:'half',roundNo:1,title:'하프, "첫 회"',questionCount:75};
  const csv=aptitudeGradesCsv(round,[{...students[0],name:' =HYPERLINK("test")'},students[2],{...students[3],correctCount:44,rank:2}]);
  assert(csv.startsWith('\uFEFF'));assert(csv.includes('"하프, ""첫 회"""'));assert(csv.includes('"\' =HYPERLINK(""test"")"'));
  assert(csv.includes('2026-11-13 01:30:00'));assert(csv.includes('"0","75","0","3"'));
  assert(!csv.includes('"44"'));assert.equal(csv.split('\r\n').length,5);
  for(const name of ['+SUM(1)','-2+3','@SUM(1)','\t=1','\r=1','\n=1'])assert(aptitudeGradesCsv(round,[{...students[0],name}]).includes('"\''+name+'"'));
});
test('CSV places five subject counts before the total and leaves unsubmitted or unavailable subject scores blank',async()=>{
  const {aptitudeGradesCsv}=await modulePromise;
  const csv=aptitudeGradesCsv({kind:'full',roundNo:1,title:'본시험',questionCount:150},[
    {...students[0],correctCount:75,subjectCorrectCounts:[0,1,15,29,30]},
    {...students[3],subjectCorrectCounts:[30,30,30,30,30]},students[1]
  ]);
  const rows=csv.trim().split('\r\n').map(line=>line.replace(/^\uFEFF/,'').split(',').map(cell=>cell.slice(1,-1)));
  assert.deepEqual(rows[0].slice(6,12),['언어이해 정답 수','언어비판 정답 수','수열추리 정답 수','도형추리 정답 수','문제해결 정답 수','정답 수']);
  assert.deepEqual(rows[1].slice(6,12),['0','1','15','29','30','75']);
  assert.deepEqual(rows[2].slice(6,12),['','','','','','']);
  assert.deepEqual(rows[3].slice(6,12),['','','','','','75']);
  assert(rows.every(row=>row.length===16));
});

test('teacher deep links and saved navigation recognize the dedicated grade section',()=>{
  const source=fs.readFileSync('interview-prep.js','utf8');
  const start=source.indexOf('const interviewAdminSections='),end=source.indexOf('function restoreInterviewAdminRoute',start);
  assert.equal(vm.runInNewContext(source.slice(start,end)+';getInterviewAdminSection()',{URLSearchParams,location:{hash:'#interview-prep-admin?section=aptitude_grades'}}),'aptitude_grades');
  assert(fs.readFileSync('teacher.html','utf8').includes('data-interview-section="aptitude_grades"'));
});
