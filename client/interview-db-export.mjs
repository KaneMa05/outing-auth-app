import {basicFields,basicFieldText} from './interview-basic-fields.js?v=20261024-school-status';
import {experienceText} from '../interview-life-graph.js?v=20261027-label-layout';

const topicTitles={self:'자기이해·강점과 약점',motivation:'지원동기·직무 준비',teamwork:'협동심·팀워크',communication:'소통·갈등 해결',leadership:'리더십·팔로워십',achievement:'도전·성취',failure:'실패·성장',responsibility:'책임감·헌신',service:'봉사·배려',integrity:'정직·청렴·공정',public:'공직관·사명감',stress:'스트레스·감정 관리',judgement:'인성 상황 판단'};
const schemas={
 qualifications:{title:'자격·어학',fields:[['type','구분'],['date','취득·예정 시기'],['name','자격·면허·어학명'],['issuer','발급기관'],['effort','취득 노력']]},
 affiliations:{title:'소속 이력',fields:[['type','소속 구분'],['name','소속명'],['period','기간'],['role','직책·역할'],['activities','주요 담당 업무·활동']]},
 awards:{title:'수상·성과',fields:[['date','시기'],['name','대회·프로젝트·성과명'],['issuer','수여 기관'],['rank','수상 등급'],['contribution','본인 기여도 (%)'],['action','본인이 직접 한 일']]}
};
const value=text=>typeof text==='string'?text.trim():typeof text==='number'&&Number.isFinite(text)?String(text):'';
const rows=items=>Array.isArray(items)?items.filter(row=>row&&typeof row==='object'&&!Array.isArray(row)):[];

function createRedactor(content,member){
 const replacements=new Map();
 const add=(text,replacement,min=2)=>{text=value(text);if(text.length>=min)replacements.set(text,replacement);};
 add(member?.name,'[이름 제외]');add(content.basicInfo?.name?.text,'[이름 제외]');
 add(member?.exam_number,'[수험번호 제외]',4);
 const birth=value(content.basicInfo?.birthDate?.text);
 if(/^\d{4}-\d{2}-\d{2}$/.test(birth)){
  const [year,month,day]=birth.split('-');
  for(const text of [birth,birth.replaceAll('-',''),birth.replaceAll('-','.'),birth.replaceAll('-','/'),`${year}년 ${Number(month)}월 ${Number(day)}일`])add(text,'[생년월일 제외]');
 }
 const organisation=(text,replacement)=>{
  text=value(text);if(!text)return;
  for(const match of text.matchAll(/[가-힣A-Za-z0-9㈜()·&]+(?:대학교|대학|고등학교|중학교|초등학교|주식회사|협회|재단|센터|동아리)/g))add(match[0],replacement);
  const first=text.split(/[\s,/\n]+/)[0];
  if(first&&first.length>=2&&first.length<=60&&/[가-힣A-Za-z]/.test(first)&&!['해당','없음','해당없음','졸업','재학','휴학'].includes(first))add(first,replacement);
 };
 organisation(content.basicInfo?.school?.text,'OO학교');
 organisation(content.basicInfo?.company?.text,'OO회사');
 organisation(content.basicInfo?.clubs?.text,'OO동아리');
 for(const row of rows(content.affiliations))add(row.name,'OO소속');
 for(const row of rows(content.awards))add(row.issuer,'OO기관');
 for(const row of rows(content.qualifications))add(row.issuer,'OO기관');
 const tokens=[...replacements].sort((a,b)=>b[0].length-a[0].length);
 return text=>{
  let result=value(text);
  for(const [token,replacement] of tokens)result=result.split(token).join(replacement);
  return result.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[이메일 제외]')
   .replace(/(?:\+82[- .]?)?(?:0?1[016789]|0[2-6][1-5]?)[- .]?\d{3,4}[- .]?\d{4}/g,'[전화번호 제외]');
 };
}

/** Explicit field allowlist: never serialize an API response, account or history. */
export function formatInterviewDbExport(life,diagnosis){
 if(!life||!Object.hasOwn(life,'profile')||!Array.isArray(diagnosis?.answers))throw Error('invalid_export_data');
 const content=life.profile?.content||{};
 const experiences=rows(content.experiences).map(experienceText).filter(row=>value(row.content));
 if(!experiences.length)return {text:'',experienceCount:0,answerCount:0};
 const redact=createRedactor(content,life.member||{}),lines=['[나의 면접 DB]'];
 const field=(label,text)=>{text=redact(text);if(text)lines.push(`${label}: ${text}`);};
 const section=(title,items)=>{if(items.length)lines.push('',`[${title}]`,...items);};
 field('지원 직렬',life.member?.track);
 const basic=[];
 for(const [key,label] of basicFields){
  const text=redact(basicFieldText(key,content.basicInfo?.[key]));
  if(text)basic.push(`${label}: ${text}`);
 }
 if(!basic.length&&value(content.background))basic.push(`이전에 작성한 소개: ${redact(content.background)}`);
 section('기본 이력',basic);
 for(const [key,schema] of Object.entries(schemas)){
  if(Array.isArray(content.none)&&content.none.includes(key)){section(schema.title,['해당 없음']);continue;}
  const exported=[];
  for(const row of rows(content[key])){
   const fields=schema.fields.flatMap(([name,label])=>value(row[name])?[`${label}: ${redact(row[name])}`]:[]);
   if(fields.length){if(exported.length)exported.push('');exported.push(...fields);}
  }
  section(schema.title,exported);
 }
 experiences.forEach((row,index)=>{
  lines.push('',`[경험 ${index+1}]`);
  if(value(row.age))field('당시 나이',`${value(row.age)}세`);
  if(value(row.satisfaction))field('만족도',`${Number(row.satisfaction)>0?'+':''}${value(row.satisfaction)}점`);
  field('키워드',row.title);field('내용',row.content);field('면접관에게 어필할 점',row.appeal);
 });
 let answerCount=0;
 const answers=[];
 for(const row of rows(diagnosis.answers)){
  if(!Object.hasOwn(topicTitles,row.topic_id)||!Array.isArray(row.prompts)||!Array.isArray(row.answers))continue;
  const pairs=[];
  row.answers.forEach((answer,index)=>{
   if(!value(answer)||!value(row.prompts[index]))return;
   if(pairs.length)pairs.push('');
   pairs.push(`질문: ${redact(row.prompts[index])}`,`답변: ${redact(answer)}`);answerCount++;
  });
  if(pairs.length){if(answers.length)answers.push('');answers.push(`항목: ${topicTitles[row.topic_id]}`,...pairs);}
 }
 section('보완 답변',answers);
 return {text:lines.join('\n'),experienceCount:experiences.length,answerCount};
}
