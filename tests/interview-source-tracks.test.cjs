const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {buildSourceTrackReview}=require('../scripts/prepare-interview-source-tracks.cjs');
const {sourceTrackSql}=require('../scripts/interview-source-tracks.cjs');
const {createPublicationFixture}=require('./helpers/interview-publication-fixture.cjs');
const corpus=require('../supabase/seeds/interview-corpus.json'),evidence=require('../scripts/data/interview-source-track-sections.json'),options=require('../lib/interview-tracks.json');
const migration='supabase/migrations/20261102055745_interview_original_source_tracks.sql';
const md5=s=>crypto.createHash('md5').update(s).digest('hex');
(async()=>{
 const {interviewTracks}=await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('client/interview-tracks.js','utf8')).toString('base64'));
 assert.deepEqual(interviewTracks,options);assert.equal(new Set(options).size,19);assert.equal(evidence.sections.length,13);
 const native=require('../api/interview-native').createHandler;
 for(const track of [...options,'unrecognized']){
  let response;const handler=native({enabled:true,secret:'n'.repeat(64),requireMockAccess:async()=>{},invoke:async()=>({studentId:'ip-a'}),readTrack:async()=>track});
  await handler({method:'POST',headers:{host:'localhost',origin:'http://localhost'},body:{action:'exchange',code:'a'.repeat(43)}},{setHeader(){},status(code){assert.equal(code,200);return this;},json(data){response=data;}});
  assert.equal(response.track,options.includes(track)?track:'','Native launch retains each named track');
 }
 const snapshot={sources:corpus.sources,questions:corpus.questions.map(q=>({...q,revision:1,sources_md5:'local-review'})),occurrences:corpus.occurrences.filter(o=>o.source_id===evidence.source.id)};
 const review=buildSourceTrackReview(snapshot);assert.equal(review.changes.length,373);assert.equal(review.occurrences.length,393);assert.deepEqual(review.report.unmapped_legacy_questions,[]);
 for(const link of review.occurrences){assert(review.changes.find(q=>q.id===link.question_id).to.includes(link.track));assert(link.heading_paragraph<Number(link.locator.split(':').at(-1)));}
 const trackFor=prompt=>{const o=snapshot.occurrences.find(o=>o.original_prompt.includes(prompt));assert(o,prompt);return review.occurrences.find(x=>x.id===o.id).track;};
 assert.equal(trackFor('응급구조사 지원동기'),'구급(응급구조)');
 assert.equal(trackFor('수상구조법에 의거해서 현장지휘관'),'특공(전술)','Use the original heading, not the word 구조 in the question');
 assert.equal(trackFor('전복된 어선에 사람이 있는데'),'특임');
 assert.equal(trackFor('김00씨가 대우조선'),'함정정비');
 assert(review.changes.some(q=>q.to.filter(t=>evidence.sections.some(s=>s.track===t)).length>1),'Shared wording retains every source track');
 const edited=structuredClone(snapshot);edited.occurrences[0].original_prompt+=' altered';assert.throws(()=>buildSourceTrackReview(edited),/Original occurrence changed/);
 const renamed=structuredClone(snapshot);renamed.sources.find(s=>s.id===evidence.source.id).sha256='different';assert.throws(()=>buildSourceTrackReview(renamed),/fingerprint/);
 const changedQuestion=structuredClone(snapshot);changedQuestion.questions.find(q=>q.id===review.changes[0].id).prompt+=' changed';assert.throws(()=>buildSourceTrackReview(changedQuestion),/Question text changed/);
 const f=await createPublicationFixture(),{db,invoke,admin,student}=f;
 try{
  for(const name of ['20261020063234_interview_ai_pipeline.sql','20261020073140_interview_ai_readiness.sql','20261020074446_interview_ai_load_protection.sql','20261020081526_interview_ai_single_question.sql','20261021060740_interview_live_sessions.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+name,'utf8'));
  await db.exec(fs.readFileSync(migration,'utf8'));
  await db.exec("update students set password_hash='local-track-fixture' where id='ip-c'");
  const server={type:'server',id:'track-test'},sessionHash='a'.repeat(64);
  await invoke('legacy_login',server,{studentId:'ip-c',passwordHash:'local-track-fixture',newHash:sessionHash});
  let applicationRevision=0;
  for(const track of options){const app=await invoke('apply',server,{sessionHash,name:'Local applicant',track,examNumber:'track-qa',revision:applicationRevision});assert.equal(app.application.track,track);applicationRevision=app.application.revision;}
  await assert.rejects(invoke('apply',server,{sessionHash,name:'Local applicant',track:'unrecognized',examNumber:'track-qa',revision:applicationRevision}),/invalid_request/);
  await invoke('admin_member_save',admin,{targetStudentId:'ip-a',track:'기타',examNumber:'legacy',enabled:true,expiresOn:'2099-01-01'});
  for(const track of options)await invoke('admin_member_save',admin,{targetStudentId:'ip-b',track,examNumber:'named',enabled:true,expiresOn:'2099-01-01'});
  await assert.rejects(invoke('admin_member_save',admin,{targetStudentId:'ip-b',track:'unrecognized',examNumber:'bad',enabled:true,expiresOn:'2099-01-01'}),/check|invalid/);
  for(const track of options){const a=await db.query('select public.ip_track_matches($1,$2::text[]) ok',[track,[]]);assert.equal(a.rows[0].ok,true);}
  assert.equal((await db.query("select public.ip_track_matches('기타',array['구조']) ok")).rows[0].ok,true);
  assert.equal((await db.query("select public.ip_track_matches('구조',array['기타']) ok")).rows[0].ok,true);
  assert.equal((await db.query("select public.ip_track_matches('구조',array['구급(응급구조)']) ok")).rows[0].ok,false);
  assert.equal((await db.query("select has_function_privilege('anon','public.ip_track_matches(text,text[])','execute') ok")).rows[0].ok,false);
  assert.equal((await db.query("select has_function_privilege('service_role','public.ip_track_matches(text,text[])','execute') ok")).rows[0].ok,true);
  // Publication, source data and existing student work must survive a track-only edit.
  await db.exec("update ip_questions set tracks=array['공채','기타'] where id='publication-existing';update ip_questions set tracks=array['기타'] where id in('publication-job','publication-archived');");
  let existing=(await db.query("select * from ip_questions where id='publication-existing'")).rows[0];await f.publication(existing.id,existing.revision,true);
  await db.exec("insert into ip_collection_items(collection_id,question_id,kind,position,analysis_note) values('core-personality-30','publication-existing','main',2,'Existing source question')");
  const writing={kind:'core',itemId:'publication-existing',revision:0,text:'Existing student answer',status:'draft'};
  await invoke('writing_save',student,writing);
  const writingBefore=(await db.query('select * from ip_writings')).rows;
  const coreBefore=(await invoke('core_questions',student)).questions.map(q=>q.id);
  await db.exec("insert into ip_sources(id,filename,sha256,track) values('track-source','fixture.hwpx','fixture','기타');insert into ip_occurrences(id,source_id,question_id,number,locator,original_prompt,answer) select 'occ-'||id,'track-source',id,'1','Contents/section0.xml:paragraph:10',prompt,'Source answer unchanged' from ip_questions where id<>'publication-personality';insert into ip_notes(student_id,topic_id,fields) values('ip-a','teamwork','{\"action\":\"Student work unchanged\"}');");
  await db.exec("insert into ip_question_rubrics(question_id,source_prompt,source_category,kind,rationale,status,reviewer,reviewed_at) select id,prompt,category,'personality_experience','Existing reviewed rubric','reviewed','qa',now() from ip_questions where id='publication-existing';");
  await db.exec("insert into ip_question_analysis(question_id,source_prompt,source_category,disposition,answer_form,method,rationale,status,reviewer,reviewed_at) select id,prompt,category,'personal','experience','test','Existing analysis','reviewed','qa',now() from ip_questions where id='publication-existing';");
  const before=(await db.query('select * from ip_questions order by id')).rows;
  const protectedBefore=(await db.query("select (select jsonb_agg(to_jsonb(x)) from ip_notes x) notes,(select jsonb_agg(to_jsonb(x)) from ip_question_rubrics x) rubrics,(select jsonb_agg(to_jsonb(x)) from ip_question_analysis x) analysis")).rows[0];
  const legacyBefore=(await invoke('questions',student,{category:'personality'})).questions.map(q=>q.id);
  const targets={'publication-existing':['공채','구조'],'publication-job':['구급(응급구조)'],'publication-archived':['특공(전술)']};
  const changes=before.filter(q=>targets[q.id]).map(q=>({id:q.id,to:targets[q.id],status:q.status,revision:q.revision,question_md5:md5([q.prompt,q.category,q.tracks.join('\x1e'),q.topic_ids.join('\x1e'),q.status,String(q.revision)].join('\x1f')),sources_md5:md5(['occ-'+q.id,'track-source','기타','',q.prompt,'Source answer unchanged','1',''].join('\x1f'))}));
  const fixtureReview={source:{id:'track-source',sha256:'fixture'},changes,occurrences:[]};
  const sql=sourceTrackSql(fixtureReview,{runId:'track-test',actorId:'qa'});
  await db.exec("update ip_occurrences set answer='Changed source' where question_id='publication-job'");
  await assert.rejects(db.exec(sql),/provenance_conflict/);await db.exec('rollback');
  assert.equal(Number((await db.query("select count(*) n from ip_history where entity='question_track_classification'")).rows[0].n),0);
  await db.exec("update ip_occurrences set answer='Source answer unchanged' where question_id='publication-job'");
  await db.exec("update ip_questions set revision=revision+1 where id='publication-job'");
  await assert.rejects(db.exec(sql),/revision_conflict/);await db.exec('rollback');
  await db.query("update ip_questions set revision=$1 where id='publication-job'",[before.find(q=>q.id==='publication-job').revision]);
  await db.exec(sql);
  const after=(await db.query('select * from ip_questions order by id')).rows;
  for(const b of before){const a=after.find(q=>q.id===b.id);if(!targets[b.id]){assert.deepEqual(a,b);continue;}assert.deepEqual(a.tracks,targets[b.id]);assert.equal(a.revision,b.revision+(b.status==='published'?2:1));for(const key of ['prompt','category','status','topic_ids'])assert.deepEqual(a[key],b[key]);}
  assert.deepEqual((await invoke('questions',student,{category:'personality'})).questions.map(q=>q.id),legacyBefore,'Existing 기타 student keeps the same visible questions');
  assert.deepEqual((await invoke('core_questions',student)).questions.map(q=>q.id),coreBefore,'Core collection access survives a legacy track split');
  assert.deepEqual((await db.query('select * from ip_writings')).rows,writingBefore,'Existing answers retain their saved source snapshots');
  await invoke('admin_member_save',admin,{targetStudentId:'ip-b',track:'구조',examNumber:'named',enabled:true,expiresOn:'2099-01-01'});
  assert((await invoke('questions',{type:'student',id:'ip-b'},{category:'personality'})).questions.some(q=>q.id==='publication-existing'));
  assert.equal((await invoke('question_detail',{type:'student',id:'ip-b'},{id:'publication-existing'})).question.id,'publication-existing');
  await invoke('admin_member_save',admin,{targetStudentId:'ip-b',track:'구급(응급구조)',examNumber:'named',enabled:true,expiresOn:'2099-01-01'});
  await assert.rejects(invoke('question_detail',{type:'student',id:'ip-b'},{id:'publication-existing'}),/question_unavailable/);
  assert.deepEqual((await db.query("select (select jsonb_agg(to_jsonb(x)) from ip_notes x) notes,(select jsonb_agg(to_jsonb(x)) from ip_question_rubrics x) rubrics,(select jsonb_agg(to_jsonb(x)) from ip_question_analysis x) analysis")).rows[0],protectedBefore);
  assert.equal((await invoke('writing_save',student,{...writing,revision:1,text:'Student can continue writing'})).writing.revision,2);
  await db.exec(sql);assert.deepEqual((await db.query('select * from ip_questions order by id')).rows,after);
  assert.equal(Number((await db.query("select count(*) n from ip_history where entity='question_track_classification'")).rows[0].n),3);
 }finally{await db.close();}
 console.log('PASS 393 exact source occurrences -> 373 questions across 13 headings; shared tracks, legacy access, named-track isolation, publication preservation, audit, rollback, protected student work and idempotence.');
})().catch(e=>{console.error(e);process.exitCode=1;});
