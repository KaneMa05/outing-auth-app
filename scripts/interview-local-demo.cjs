// Synthetic local preview only. Never import into a production database.
const crypto=require('node:crypto');
const experiences=[
 {id:'demo-project',period:'2023년 9월~12월',title:'조별 과제 일정과 역할 정리',affiliation:'가상대학교 수업',
  situation:'조별 과제에서 역할이 겹쳐 일부 작업이 지연되었습니다.',
  role:'팀의 자료 취합과 일정 관리를 맡았습니다.',
  action:'팀원들의 진행 상황을 확인하고 역할과 마감 일정을 표로 정리했습니다. 공동 과제의 마감을 지키기 위해 주말 개인 휴식 시간 두 시간을 줄여 일정이 어려운 팀원의 자료 정리를 도왔고 마지막에는 서로 결과물을 확인했습니다.',
  result:'팀원들이 맡은 일을 확인할 수 있었고 과제를 기한 안에 제출했습니다. 수업 담당 교수님은 진행표를 공유하고 누락된 자료를 끝까지 확인한 점을 보고 책임감 있게 일정을 관리했다는 평가를 해주셨습니다.',
  learning:'협력에는 공동 목표, 명확한 역할, 진행 상황을 나누는 소통이 필요하다는 것을 배웠습니다.'},
 {id:'demo-volunteer',period:'2024년 5월',title:'지역 행사 접수 안내 봉사',affiliation:'가상마을 봉사모임',
  situation:'지역 행사 안내 봉사 중 방문객들이 접수 장소를 혼동했습니다.',
  role:'입구에서 방문객을 안내하는 봉사자였습니다.',
  action:'담당자에게 동선을 확인한 뒤 방문객에게 접수 위치와 이동 순서를 설명했습니다. 이동이 불편한 방문객에게는 원하는 도움을 먼저 물었습니다.',
  result:'안내를 받은 방문객들이 접수 장소로 이동했습니다.',
  learning:'도움은 상대방의 입장에서 불편을 확인하는 것부터 시작하며 모르는 정보는 확인한 뒤 안내해야 한다고 느꼈습니다.'},
 {id:'demo-study',period:'2025년 3월~6월',title:'과목별 학습 모임 운영',affiliation:'가상 수험 스터디',
  situation:'학습 모임에서 구성원마다 취약한 과목과 원하는 학습 방식이 달랐습니다.',
  role:'모임 진행과 문제 선정 담당이었습니다.',
  action:'각자가 어려워하는 부분을 모아 함께 풀 문제를 정하고 풀이를 설명하는 시간을 마련했습니다. 의견이 다를 때에는 이유를 듣고 주차별로 방식을 번갈아 적용했습니다.',
  result:'구성원들이 자신의 풀이를 공유하고 이해하지 못한 부분을 다시 질문했습니다.',
  learning:'리더는 혼자 정답을 정하기보다 구성원이 참여할 수 있도록 역할과 기회를 나누어야 한다고 배웠습니다.'},
 {id:'demo-swim',period:'2025년 7월~9월',title:'수영 기초 체력 훈련',affiliation:'가상 생활체육 수영반',
  situation:'처음에는 호흡이 불안정해 쉬지 않고 200미터를 수영하기 어려웠습니다.',
  role:'안전수칙을 지키며 정해진 훈련을 수행하는 수강생이었습니다.',
  action:'강사에게 호흡 자세를 확인받고 주 3회 기초 훈련을 기록했습니다. 무리하게 거리를 늘리지 않고 충분히 휴식했습니다.',
  result:'9월에는 중간에 쉬지 않고 200미터를 수영했습니다.',
  learning:'작은 목표를 꾸준히 실행하고 안전을 지키는 과정이 성취를 만든다는 것을 배웠습니다.'},
 {id:'demo-mistake',period:'2024년 9월',title:'동아리 준비물 누락과 점검표 개선',affiliation:'가상대학교 봉사동아리',
  situation:'행사 준비물 중 안내문을 챙기지 못해 동료가 추가로 가져와야 했습니다.',
  role:'준비물 확인 담당으로 누락을 확인할 책임이 있었습니다.',
  action:'제 실수를 먼저 알리고 동료에게 사과했습니다. 이후 준비물, 담당자, 확인 시간을 적은 점검표를 만들어 출발 전 서로 확인했습니다.',
  result:'다음 행사에서는 준비물을 빠짐없이 확인하고 출발했습니다.',
  learning:'혼자 머릿속으로 확인하는 것이 제 약점임을 알았고 기록과 교차 점검으로 보완했습니다.'},
 {id:'demo-stress',period:'2025년 10월',title:'시험 준비 중 일정과 감정 관리',affiliation:'가상 수험 스터디',
  situation:'모의시험 점수가 떨어지고 계획이 밀려 조급함과 스트레스를 느꼈습니다.',
  role:'학습 계획과 생활 습관을 스스로 관리하는 수험생이었습니다.',
  action:'감정을 바로 다른 사람에게 표현하기보다 잠시 걷고 원인을 기록했습니다. 하루 목표를 줄여 우선순위를 정하고 틀린 문제를 다시 풀었습니다.',
  result:'미룬 과제를 나누어 처리했고 정해진 취침 시간과 학습 시간을 다시 지켰습니다.',
  learning:'화를 무조건 참거나 쏟아내기보다 감정을 진정시킨 뒤 사실과 필요한 요청을 차분히 전달하려고 합니다.'}
];
const values={
 motivation:{
  position:'지역 행사에서 작은 안내로도 시민의 불편을 줄일 수 있음을 느꼈고, 바다에서 국민의 생명과 안전을 돕는 해양경찰이 되고 싶습니다.',
  reason:'봉사에서 확인하고 안내하는 책임의 중요성을 배웠습니다. 힘든 근무와 보수만으로 직업을 결정하기보다 국민에게 필요한 역할을 수행하는 데 의미를 두고 있습니다.',
  application:'공채 필기 과목을 스터디에서 공부하고 주 3회 수영으로 기초 체력을 준비하고 있습니다. 입직 후 예상과 다른 업무도 먼저 배우고 맡은 책임을 수행하겠습니다. 10년 뒤에는 기본 절차와 협업을 성실히 실천하는 동료가 되고 싶습니다. 가족이 걱정하면 이유를 듣고 준비 과정과 직업 선택 이유를 설명하겠습니다.'},
 integrity:{
  position:'친분이나 개인적 이익보다 동일한 기준과 사실 확인을 우선하는 정직하고 공정한 사람이 되고 싶습니다.',
  reason:'동아리 행사에서 제 준비물 누락을 먼저 인정하고 사과한 뒤 점검표를 개선하면서 실수를 숨기지 않는 태도가 신뢰의 시작임을 배웠습니다.',
  application:'부당한 지시는 의도와 사실을 먼저 확인하고 적법한 절차에 따라 의견을 말씀드리겠습니다. 직무와 관련된 선물은 받지 않고 기관의 기준을 확인하겠습니다. 친분 있는 사람이나 동료의 잘못도 은폐하지 않고 확인한 사실을 정해진 절차로 보고하겠습니다. 공개가 금지된 면접 내용은 친구에게도 전달하지 않겠습니다.'},
 public:{
  position:'제가 중요하게 생각하는 공직 가치는 국민의 안전에 대한 책임, 공정한 태도, 상대방을 존중하는 자세입니다.',
  reason:'봉사 중 방문객의 어려움을 먼저 확인하고 담당자에게 정확한 정보를 확인해 안내하면서 작은 행동에도 책임이 따른다고 느꼈습니다.',
  application:'국민을 대할 때 성별과 외모에 대한 고정관념을 경계하고 상대방이 원하는 도움을 먼저 확인하겠습니다. 모르는 것은 확인하고 실수는 보고하겠습니다. 음주로 판단과 책임 수행에 지장이 생기지 않도록 생활을 관리하겠습니다. 안전 안내를 쉽게 설명하고 확인된 정보로 소통하는 공무원이 되고 싶습니다.'},
 judgement:{
  criteria:'급한 상황일수록 사람의 안전을 먼저 고려하고 확인된 사실, 업무의 우선순위, 정해진 절차를 기준으로 판단하겠습니다.',
  steps:'위험이나 기기 이상을 발견하면 주변에 알리고 안전을 확보한 뒤 담당자와 상급자에게 상황을 보고하겠습니다. 인력이나 예산이 부족하면 필요한 일과 가능한 자원을 확인해 우선순위와 대안을 제안하겠습니다.',
  caution:'확인하지 않은 내용을 단정하거나 혼자 무리하게 처리하지 않겠습니다. 교대가 늦거나 가족에게 급한 일이 생겨도 공백이 생기지 않도록 먼저 보고하고 인수인계를 요청하겠습니다. 결과가 좋아도 안전과 공정한 절차를 생략하지 않겠습니다.'}
};
module.exports=async({db,invoke,aiInvoke,admin,studentId,bundleHash,token})=>{
 const actor={type:'student',id:studentId};
 const bootstrap=await invoke('bootstrap',actor);
 const map={self:0,teamwork:0,communication:2,leadership:2,achievement:3,failure:4,responsibility:4,service:1,stress:5};
 for(const topic of bootstrap.topics){
  const source=experiences[map[topic.id]];
  const fields=values[topic.id]||source&&Object.fromEntries(['situation','role','action','result','learning'].map(k=>[k,source[k]]));
  if(!fields)throw Error('Missing synthetic topic: '+topic.id);
  const prior=bootstrap.notes.find(n=>n.topic_id===topic.id);
  await invoke('note_save',actor,{topicId:topic.id,topicRevision:topic.revision,revision:prior?.revision||0,status:'draft',fields});
 }
 const profile=(await invoke('life_get',actor)).profile;
 await invoke('life_save',actor,{revision:profile?.revision||0,status:'draft',content:{
  background:'로컬 검증을 위한 가상 학생입니다. 가상대학교에서 행정 관련 과목을 공부하고 조별 과제와 봉사동아리에 참여했습니다. 현재 해양경찰 공채를 준비하며 수영과 과목별 스터디를 하고 있습니다. 최근 읽은 책은 어린 왕자이며 상대를 이해하려는 태도가 기억에 남았습니다. 존경하는 사람은 봉사모임 담당 선생님으로, 모르는 내용을 확인하고 방문객에게 차분히 설명하는 태도를 배우고 싶습니다.',
  basicInfo:{school:{text:'가상대학교 (로컬 검증용 가상 이력)',none:false},major:{text:'행정 관련 과목을 공부했습니다.',none:false},clubs:{text:'봉사동아리에서 활동했습니다.',none:false},volunteering:{text:'지역 행사 접수를 안내했습니다.',none:false},internships:{text:'',none:true},company:{text:'',none:true},role:{text:'',none:true},achievements:{text:'조별 과제에서 일정과 역할을 정리했습니다.',none:false}},
  qualifications:[{id:'demo-cert',type:'자격',date:'2024년 11월',name:'가상 안전교육 수료',issuer:'가상 안전교육기관',effort:'안전교육에 참여하고 상황별 확인 순서를 복습했습니다.'},
   {id:'demo-language',type:'어학',date:'2025년 2월',name:'가상 영어 평가',issuer:'가상 어학교육기관',effort:'매일 듣기와 기초 표현을 복습하고 학습 기록을 작성했습니다.'}],
  affiliations:[{id:'demo-club',type:'동아리',name:'가상대학교 봉사동아리',period:'2023년~2024년',role:'준비물 확인과 안내 담당',activities:'지역 행사 안내와 준비물 점검을 수행했습니다.'}],
  awards:[{id:'demo-award',date:'2023년 12월',name:'가상 수업 과제 발표상',issuer:'가상대학교 수업',rank:'팀 우수상',action:'역할과 일정을 정리하고 팀원의 자료 취합을 도왔습니다.',contribution:'25'}],
  experiences:experiences.map((e,i)=>({id:e.id,title:e.title,age:String(Number(e.period.slice(0,4))-2001),satisfaction:String([15,20,-15,25,-5,10][i%6]),content:[e.situation,e.action,e.result].join('\n\n'),appeal:e.learning,competencyIds:[]})),none:[]
 }});
 const items=(await db.query("select question_id,kind,position from ip_collection_items where collection_id='core-personality-30' order by position")).rows;
 const main=items.filter(i=>i.kind==='main'),appendix=items.filter(i=>i.kind==='appendix');
 if(main.length!==25||appendix.length<5)throw Error('Expected 25 main and at least 5 appendix questions');
 // Draw once and persist the exact list; retries and reconnects use its snapshot.
 for(let i=appendix.length-1;i>0;i--){const j=crypto.randomInt(i+1);[appendix[i],appendix[j]]=[appendix[j],appendix[i]];}
 const selected=[...main,...appendix.slice(0,5)],ids=selected.map(i=>i.question_id);
 // A prompt already present in the general corpus may retain its former category.
 // In this isolated preview, the explicit core-personality collection is authoritative.
 await db.query("update ip_questions set status='published',category='personality',tracks='{}' where id=any($1::text[])",[ids]);
 await aiInvoke('admin_configure',admin,{enabled:true,bundleHash,coreQuestionIds:ids,dailyCallLimit:100});
 await aiInvoke('admin_register_worker',admin,{label:'Local preview CLI',studentIds:[studentId],tokenHash:crypto.createHash('sha256').update(token).digest('hex')});
 for(const kind of ['self_intro','motivation','public_service','core30']){
  const ready=await aiInvoke('prepare',actor,{kind});
  if(!ready.enabled||!ready.dbReady||!ready.ready)throw Error('Local demo is incomplete: '+kind);
 }
 return {mainCount:25,appendixPositions:selected.slice(25).map(i=>i.position)};
};
