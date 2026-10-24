const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {createDb}=require('./helpers/interview-db.cjs');
const engine=require('../lib/interview-life-followup-engine');
const {createHandler}=require('../api/interview-life-followup');
(async()=>{
 const {db,invoke}=await createDb(),a={type:'student',id:'ip-a'},b={type:'student',id:'ip-b'},admin={type:'admin',id:'qa'};
 const rpc=async(action,actor,body={})=>(await db.query('select ip_life_followup_service($1,$2::jsonb,$3::jsonb) r',[action,JSON.stringify(actor),JSON.stringify(body)])).rows[0].r;
 const call=(action,body={})=>rpc(action,a,body);
 try{
  await invoke('admin_enabled',admin,{enabled:true});for(const id of ['ip-a','ip-b'])await invoke('admin_member_save',admin,{targetStudentId:id,track:'공채',examNumber:id,enabled:true});
  const basicInfo=Object.fromEntries(['school','major','clubs','volunteering','internships','company','role','achievements'].map(k=>[k,{text:'',none:true}]));basicInfo.school={text:'가상대학교',none:false};
  const content={background:'기존 소개는 유지합니다',basicInfo,none:['qualifications','affiliations','awards'],qualifications:[],affiliations:[],awards:[],experiences:[{id:'exp-1',age:'22',title:'어학연수',satisfaction:'18',content:'혼자 준비해서 어학연수를 갔다. 힘들었다.',appeal:'',competencyIds:[]}]};
  let profile=(await invoke('life_save',a,{revision:0,status:'draft',content})).profile;
  assert.equal((await db.query('select ip_basic_complete($1::jsonb) r',[content])).rows[0].r,true);
  assert((await db.query('select ip_basic_text($1::jsonb) r',[content])).rows[0].r.includes('회사 경력: 해당 없음'));
  assert.equal((await invoke('admin_life_get',admin,{targetStudentId:a.id})).profile.content.basicInfo.school.text,'가상대학교');
  for(const bad of [{school:{text:'x',none:'true'}},{...basicInfo,unknown:{}},{...basicInfo,school:{text:'a'.repeat(2001),none:false}}])await assert.rejects(invoke('life_save',a,{revision:profile.revision,status:'draft',content:{...content,basicInfo:bad}}),/invalid_request/);
  const incomplete=structuredClone(content);incomplete.basicInfo.school.text='';assert.equal((await db.query('select ip_basic_complete($1::jsonb) r',[incomplete])).rows[0].r,false);
  assert.equal((await call('availability')).enabled,false);await assert.rejects(call('start',{experienceId:'exp-1'}),/automation_disabled/);
  await db.exec("update ip_life_followup_config set enabled=true,student_ids=array['ip-a','ip-b']");
  let state=await call('start',{experienceId:'exp-1'});const sessionId=state.session.id;
  assert.equal((await call('availability')).sessions[0].summary_ready,false);
  assert.equal(state.experience.appeal,'','Empty appeal and otherwise unfinished profile can start');
  await assert.rejects(rpc('get',b,{sessionId}),/not_found/);await assert.rejects(rpc('start',b,{experienceId:'exp-1'}),/not_found/);
  const requestGeneration=async kind=>{
   const requestKey=crypto.randomUUID(),payload={sessionId,sourceHash:state.sourceHash,answerRevision:state.session.answer_revision,kind,requestKey};
   const claimed=await call('claim',payload);assert(claimed.claimed);
   assert.equal((await call('claim',payload)).claimed,false);
   const generated=await engine.generate(state,kind);state=await call('finish',{sessionId,requestId:claimed.request.id,...generated});
   assert.equal((await call('claim',payload)).claimed,false,'Same key after completion is not charged or generated twice');return state;
  };
  await requestGeneration('generate_questions');assert.equal(state.questions.length,3);assert(state.questions.some(q=>q.topic==='obstacle'));
  let qs=state.questions;
  state=await call('save_answers',{sessionId,answerRevision:0,answers:qs.map((q,i)=>({questionId:q.id,text:i?'':'학교 홈페이지에서 프로그램을 비교했다. 비용을 고려해 선택했다. 제가 직접 신청서를 제출했다.',status:i===0?'answered':i===1?'unknown':'skipped'}))});
  assert.equal(state.session.answer_revision,1);
  await assert.rejects(call('save_answers',{sessionId,answerRevision:0,answers:[]}),/revision_conflict/);
  const saved=state.questions.find(q=>q.answer.status==='answered');
  assert.equal((await call('get',{sessionId})).questions.find(q=>q.id===saved.id).answer.text,saved.answer.text);
  await requestGeneration('generate_questions');
  assert(!state.questions.filter(q=>q.batch===2).some(q=>['trigger','choice','action'].includes(q.topic)),'Cross-answer facts are not asked again');
  const laterIds=state.questions.filter(q=>q.batch===2).map(q=>q.id);
  state=await call('save_answers',{sessionId,answerRevision:state.session.answer_revision,answers:[{questionId:saved.id,status:'answered',text:'정정합니다. 프로그램 신청은 친구가 도와줬고 저는 제출 자료를 정리했습니다.'}]});
  assert(state.questions.filter(q=>laterIds.includes(q.id)).every(q=>q.stale));
  await requestGeneration('summarize');let output=state.outputs[0];assert.equal(output.engine,'basic_extract');
  assert.equal((await call('availability')).sessions[0].summary_ready,true,'Current unadopted summary is discoverable on re-entry');
  assert.deepEqual((await rpc('availability',b)).sessions,[],'Other students cannot discover the summary');
  assert(!output.result.content.includes('성공'),'No invented success');assert(output.result.facts.every(f=>f.refs.length));
  assert(!output.result.content.includes('정정합니다')||saved.kind==='fact');
  const before=structuredClone(state.experience),beforeRevision=state.profileRevision;
  state=await call('apply',{sessionId,outputId:output.id,sourceHash:state.sourceHash,answerRevision:state.session.answer_revision,profileRevision:state.profileRevision,fields:{content:output.result.content+'\n학생이 검토한 문장'}});
  assert.equal(state.experience.appeal,before.appeal);assert.equal(state.experience.satisfaction,'18');assert.equal(state.profileRevision,beforeRevision+1);
  assert.equal((await call('availability')).sessions[0].summary_ready,false,'Applied summary no longer prompts review');
  profile=(await invoke('life_get',a)).profile;assert.equal(profile.status,'draft');
  const applied=state.outputs.find(o=>o.applied_at);
  state=await call('restore',{sessionId,outputId:applied.id,sourceHash:state.sourceHash,profileRevision:state.profileRevision});assert.equal(state.experience.content,before.content);
  // Unrelated experience changes do not stale the source, but revision still protects apply.
  const hash=state.sourceHash,revision=state.profileRevision;
  profile=(await invoke('life_get',a)).profile;profile.content.experiences.push({...profile.content.experiences[0],id:'exp-other',title:'다른 사건'});
  profile=(await invoke('life_save',a,{revision:profile.revision,status:'draft',content:profile.content})).profile;
  state=await call('get',{sessionId});assert.equal(state.sourceHash,hash);
  await assert.rejects(call('apply',{sessionId,sourceHash:hash,profileRevision:revision,answerRevision:state.session.answer_revision,fields:{content:'오래된 수정'}}),/revision_conflict/);
  // Late completion is recorded stale, never applied.
  const pending=await call('claim',{sessionId,sourceHash:hash,answerRevision:state.session.answer_revision,kind:'summarize',requestKey:crypto.randomUUID()});
  if(!pending.claimed){await call('save_answers',{sessionId,answerRevision:state.session.answer_revision,answers:[{questionId:saved.id,status:'answered',text:'새 답변'}]});state=await call('get',{sessionId});}
  const pending2=pending.claimed?pending:await call('claim',{sessionId,sourceHash:hash,answerRevision:state.session.answer_revision,kind:'summarize',requestKey:crypto.randomUUID()});
  profile.content.experiences[0].content='다른 기기에서 원문 수정';profile=(await invoke('life_save',a,{revision:profile.revision,status:'draft',content:profile.content})).profile;
  state=await call('finish',{sessionId,requestId:pending2.request.id,...await engine.generate(state,'summarize')});assert.equal(state.requests.find(r=>r.id===pending2.request.id).state,'stale');
  await assert.rejects(call('apply',{sessionId,sourceHash:hash,profileRevision:profile.revision,answerRevision:state.session.answer_revision,fields:{content:'충돌'}}),/source_changed/);
  await assert.rejects(call('apply',{sessionId,sourceHash:state.sourceHash,profileRevision:profile.revision,answerRevision:state.session.answer_revision,fields:{content:'가'.repeat(12001)}}),/invalid_request/);
  await db.exec('update ip_life_followup_config set daily_limit=1');
  await assert.rejects(call('claim',{sessionId,sourceHash:state.sourceHash,answerRevision:state.session.answer_revision,kind:'summarize',requestKey:crypto.randomUUID()}),/daily_limit/);
  state=await call('save_answers',{sessionId,answerRevision:state.session.answer_revision,answers:[]});assert(state.ok,'Answer saving works at generation limit');
  // Service role only, direct browser calls cannot bypass authenticated ownership.
  for(const table of ['sessions','questions','answers','outputs','requests','config']){
   assert.equal((await db.query('select relrowsecurity r from pg_class where relname=$1',['ip_life_followup_'+table])).rows[0].r,true);
   assert.equal((await db.query("select has_table_privilege('authenticated',$1,'SELECT') r",['ip_life_followup_'+table])).rows[0].r,false);
  }
  assert.equal((await db.query("select has_function_privilege('anon','ip_life_followup_service(text,jsonb,jsonb)','execute') r")).rows[0].r,false);
  // API identity comes from the authenticated portal, never supplied studentId.
  let seen;const handler=createHandler({enabled:()=>true,authenticateWeb:async()=>({id:'ip-a'}),invoke:async(action,actor,body)=>{seen=actor;return rpc(action,actor,body);}});
  const res={setHeader(){},status(n){this.code=n;return this;},json(data){this.body=data;return this;}};
  await handler({method:'POST',headers:{host:'localhost',origin:'http://localhost'},body:{action:'get',sessionId,studentId:'ip-b'}},res);assert.equal(res.code,200);assert.equal(seen.id,'ip-a');
  await handler({method:'POST',headers:{host:'localhost'},body:{action:'finish',sessionId}},res);assert.equal(res.code,400,'Clients cannot commit engine output');
  profile.content.experiences=profile.content.experiences.filter(e=>e.id!=='exp-1');await invoke('life_save',a,{revision:profile.revision,status:'draft',content:profile.content});
  for(const action of ['get','status','save_answers','apply'])await assert.rejects(call(action,{sessionId}),/not_found/);
  await db.exec("delete from students where id='ip-a'");assert.equal(Number((await db.query('select count(*) n from ip_life_followup_sessions')).rows[0].n),0);
  console.log('PASS structured basic fields and follow-up: ownership, explicit none, restoration, evidence, duplicate requests, source/answer/profile conflicts, limits, deletion, grants and API identity.');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
