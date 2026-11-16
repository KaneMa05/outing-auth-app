const {test}=require('node:test'),assert=require('node:assert/strict');
const {practiceCatalog:readCatalog}=require('../lib/interview-practice-catalog.cjs');
const practiceCatalog=(read,options)=>readCatalog(read,{...options,testOnly:false});
const {fields}=require('../lib/interview-taxonomy.json');
const question=(id,extra={})=>({id,prompt:'항법을 설명하세요.',category:'job',status:'published',tracks:['공채'],
 taxonomy:{primary_field:'navigation',related_fields:['domestic_maritime_law'],review_status:'classified',source_prompt:'항법을 설명하세요.',source_category:'job'},
 occurrences:[{region:'서해',source:{track:'공채'}},{region:'서해',source:{track:'공채'}},{region:'제주',source:{track:'항해'}},{region:'본청',source:{track:'공채'}}],...extra});
test('practice reads existing reviewed content definitions and source regions without exposing private fields',async()=>{
 const result=await practiceCatalog(async()=>[
  question('valid',{answer:'private',rationale:'private'}),
  question('stale',{prompt:'원문 변경'}),
  question('pending',{taxonomy:{...question().taxonomy,review_status:'needs_context'}}),
  question('draft',{status:'draft'}),question('other-track',{tracks:['기관']}),question('personality',{category:'personality'})
 ],{track:'공채',mode:'job'});
 assert.deepEqual(result.fields,fields.filter(f=>['navigation','domestic_maritime_law'].includes(f.id)));assert.equal(result.questions.length,3);
 assert.deepEqual(result.questions[0].fieldIds,['navigation','domestic_maritime_law']);
 assert.deepEqual(result.questions[0].regions,['본청','서해']);
 assert.deepEqual(result.questions[1].fieldIds,[]);assert.deepEqual(result.questions[2].fieldIds,[]);
 assert(!JSON.stringify(result).includes('private'));assert.equal(result.fields.length,2);
});
test('field choices exclude fields found only in unavailable or unreviewed questions',async()=>{
 const withField=(id,field,extra={})=>question(id,{taxonomy:{...question().taxonomy,primary_field:field,related_fields:[]},...extra});
 const result=await practiceCatalog(async()=>[
  withField('valid','navigation'),
  withField('stale','engineering_maintenance',{prompt:'원문 변경'}),
  withField('pending','rescue_diving',{taxonomy:{...question().taxonomy,primary_field:'rescue_diving',related_fields:[],review_status:'needs_context'}}),
  withField('draft','special_operations',{status:'draft'}),
  withField('other-track','marine_environment',{tracks:['기관']}),
  withField('personality','emergency_care',{category:'personality'}),
  withField('unknown','invented')
 ],{track:'공채',mode:'job'});
 assert.deepEqual(result.fields,[fields.find(f=>f.id==='navigation')]);
 assert.deepEqual(result.questions.map(q=>q.id),['valid','stale','pending','unknown']);
});

test('an empty or unclassified pool has no content field choices and retains its questions',async()=>{
 for(const pool of [[],[question('unclassified',{taxonomy:null})]]){
  const result=await practiceCatalog(async()=>pool,{track:'공채',mode:'job'});
  assert.deepEqual(result.fields,[]);assert.equal(result.questions.length,pool.length);
 }
});

test('practice catalog loads beyond first page and preserves member track scope in every query',async()=>{
 const calls=[];const result=await practiceCatalog(async(method,path)=>{
  const q=new URL('https://local/'+path).searchParams;calls.push(q);
  assert.equal(method,'GET');assert.equal(q.get('or'),'(tracks.cs.{공채},tracks.eq.{})');
  assert(!q.get('select').includes('answer'));
  return q.get('offset')==='0'?Array.from({length:500},(_,i)=>question('q-'+i)):[question('last',{taxonomy:{...question().taxonomy,primary_field:'engineering_maintenance',related_fields:[]}})];
 },{track:'공채',mode:'job'});
 assert.equal(result.questions.length,501);assert.equal(result.questions[500].id,'last');assert.equal(calls.length,2);
 assert.deepEqual(result.fields.map(f=>f.id),['navigation','domestic_maritime_law','engineering_maintenance']);
});
test('personality scope and unknown modes do not gain job definitions or wider enrollment access',async()=>{
 const result=await practiceCatalog(async()=>[],{track:'공채',mode:'personality'});assert.deepEqual(result.fields,[]);
 await assert.rejects(practiceCatalog(async()=>{throw Error('must not read');},{track:'forged',mode:'job'}),/invalid_request/);
});

test('personality topics are active, track-scoped, used by published questions, and loaded across all pages',async()=>{
 const p=(id,topic_ids=['failure'],extra={})=>({id,prompt:'실패 경험',category:'personality',status:'published',tracks:[],topic_ids,answer:'private',...extra});
 const calls=[];
 const result=await practiceCatalog(async(method,path)=>{
  assert.equal(method,'GET');const query=new URL('https://local/'+path).searchParams;calls.push(path);assert.equal(query.get('or'),'(tracks.cs.{공채},tracks.eq.{})');
  if(path.startsWith('ip_topics?'))return [
   {id:'failure',title:'실패·성장',active:true,tracks:[]},
   {id:'teamwork',title:'협동심·팀워크',active:true,tracks:['공채']},
   {id:'unused',title:'연결 문항 없음',active:true,tracks:[]},
   {id:'inactive',title:'비활성',active:false,tracks:[]},
   {id:'foreign',title:'다른 직렬',active:true,tracks:['기관']}];
  assert.equal(query.get('category'),'eq.personality');assert(!query.get('select').includes('answer'));assert(!query.get('select').includes('notes'));
  return query.get('offset')==='0'?Array.from({length:500},(_,i)=>p('p'+i)):[p('last',['teamwork','teamwork','inactive','foreign','unknown']),p('unclassified',[]),p('draft',['unused'],{status:'draft'}),p('other',['unused'],{tracks:['기관']}),p('job',['unused'],{category:'job'})];
 },{mode:'personality',track:'공채'});
 assert.equal(result.questions.length,502);assert.deepEqual(result.fields,[{id:'failure',label:'실패·성장'},{id:'teamwork',label:'협동심·팀워크'}]);
 assert.deepEqual(result.questions[500].fieldIds,['teamwork']);assert.deepEqual(result.questions[501].fieldIds,[]);assert.equal(calls.length,3);assert(!JSON.stringify(result).includes('private'));
});
