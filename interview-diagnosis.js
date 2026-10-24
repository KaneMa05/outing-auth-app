import {experienceText} from './interview-life-graph.js?v=20261021-life-save-fix';
import {topicQuestions,elementQuestions} from './interview-prep-prompts.js';

export const diagnosisAreas=[
 ['self','자기이해·강점과 약점',['장점','강점','약점','단점','나의 성격','자기이해']],
 ['motivation','지원동기·직무 준비',['지원동기','지원 동기','지원 계기','진로','해양경찰','직무']],
 ['teamwork','협동심·팀워크',['협동','협력','협업','팀워크','팀원','공동 목표','역할 분담']],
 ['communication','소통·갈등 해결',['소통','갈등','경청','설득','의견 차이','합의','중재']],
 ['leadership','리더십·팔로워십',['리더','팀장','조장','회장','팔로워','구성원','팀을 이끌']],
 ['achievement','도전·성취',['도전','성취','목표','달성','꾸준','개선']],
 ['failure','실패·성장',['실패','실수','좌절','반성','피드백','재도전']],
 ['responsibility','책임감·헌신',['책임','헌신','약속','기한','완수','끝까지']],
 ['service','봉사·배려',['봉사','배려','도움','도왔','돕','존중']],
 ['integrity','정직·청렴·공정',['정직','청렴','공정','부당','규정','원칙']],
 ['public','공직관·사명감',['공직','사명','공익','국민','인권','공공']],
 ['stress','스트레스·감정 관리',['스트레스','감정','화가','회복','마음','불안']],
 ['judgement','인성 상황 판단',['판단','우선순위','우선 순위','딜레마','대안','상황 대처']],
];
export const diagnosisStages=['관련 경험 찾기','관련 경험 확인','경험 보완','근거 보완','경험 근거 확인'];
const length=value=>[...String(value||'').trim()].length;

export function diagnosisQuestions(id){
 const definition=topicQuestions[id];
 if(definition.kind==='experience')return definition.fields.map(([,question])=>question);
 const openings={motivation:'지원할 진로나 직무에 관심을 갖게 된 실제 경험은 무엇인가요?',integrity:'정직함·공정함을 지키기 위해 선택해야 했던 실제 경험은 무엇인가요?',public:'다른 사람이나 공동체를 위해 개인의 편의보다 공익을 선택한 실제 경험은 무엇인가요?',judgement:'두 가지 요구가 충돌해 우선순위를 판단해야 했던 실제 경험은 무엇인가요?'};
 return [openings[id],'당시 어떤 상황이었고, 본인이 맡은 역할은 무엇이었나요?','어떤 기준으로 판단하고 본인이 직접 무엇을 했나요?','그 행동 뒤 실제로 어떤 결과나 변화가 있었나요?','그 경험에서 배운 점과 면접관에게 어필하고 싶은 점은 무엇인가요?'];
}

function evidenceChecks(row){
 const text=String(row.content||'');
 // Inspect only current life-graph text, including adapted legacy records.
 const action=/(?:행동|실행|조치)\s*[:：]\s*[^\n]{10,}|역할을?\s*(?:나누|분담)|경청|조율|제안|실행|설득|중재|도왔|도와주|연습|수정했|보고했|확인했|계획을?\s*(?:세|수립)/.test(text);
 const result=/(?:결과|성과)\s*[:：]\s*[^\n]{10,}|완수|달성|완료|성공|실패|해결되|해결했|합의|개선되|줄었|늘었|높아졌|낮아졌|마무리|변화가|반응은|반응을/.test(text);
 return [{key:'experience',label:'관련 경험 내용',found:length(text)>0},{key:'action',label:'본인의 행동 표현',found:action},{key:'result',label:'결과·변화 표현',found:result},{key:'appeal',label:'어필할 점 10자 이상',found:length(row.appeal)>=10}];
}

// This is a reproducible writing-coverage check, not a personality/ability assessment.
// Satisfaction and age never contribute to coverage. Keyword links are suggestions.
export function diagnoseExperiences(experiences=[],competencies=[]){
 return diagnosisAreas.map(([id,title,keywords])=>{
  const evidence=experiences.map(experienceText).map(row=>{
   const text=[row.title,row.content,row.appeal].filter(Boolean).join(' ');
   const matches=keywords.filter(word=>text.includes(word));
   const elements=elementQuestions.filter(item=>item[0]===id).map(item=>item[1]);
   const linkedIds=competencies.filter(c=>(c.element_ids||[]).some(element=>elements.includes(element))).map(c=>c.id);
   const tagged=Array.isArray(row.competencyIds)&&row.competencyIds.some(key=>key===id||linkedIds.includes(key));
   const checks=evidenceChecks(row);
   return {...row,matches,tagged,checks,level:checks.filter(check=>check.found).length};
  }).filter(row=>(row.tagged||row.matches.length)&&length(row.content)>0);
  const level=Math.max(0,...evidence.map(row=>row.level));
  return {id,title,level,evidence,questions:diagnosisQuestions(id)};
 });
}

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderDiagnosisChart(items){
 const cx=320,cy=275,radius=175;
 const point=(i,r)=>{const angle=-Math.PI/2+i*2*Math.PI/13;return [cx+Math.cos(angle)*r,cy+Math.sin(angle)*r];};
 const polygon=r=>items.map((_,i)=>point(i,r).join(',')).join(' ');
 return `<svg class="ip-diagnosis-chart" viewBox="0 0 640 550" role="img" aria-label="인생그래프 경험만으로 진단한 13개 항목의 근거 확인 단계. 아래 항목 버튼에서 근거와 보완 질문을 확인할 수 있습니다.">
 ${[1,2,3,4].map(n=>`<polygon points="${polygon(radius*n/4)}" class="ip-diagnosis-grid"/>`).join('')}
 ${items.map((_,i)=>{const [x,y]=point(i,radius);return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" class="ip-diagnosis-grid"/>`;}).join('')}
 <polygon points="${items.map((item,i)=>point(i,radius*item.level/4).join(',')).join(' ')}" class="ip-diagnosis-shape"/>
 ${items.map((item,i)=>{const [x,y]=point(i,radius*item.level/4),[tx,ty]=point(i,radius+39);const words=item.title.split('·');return `<circle cx="${x}" cy="${y}" r="4" class="ip-diagnosis-dot"/><text class="ip-diagnosis-label" x="${tx}" y="${ty-5}" text-anchor="middle">${words.map((word,j)=>`<tspan x="${tx}" dy="${j?17:0}">${esc(word)}</tspan>`).join('')}<tspan x="${tx}" dy="17" class="ip-diagnosis-chart-level">${item.level}/4</tspan></text><text class="ip-diagnosis-short-label" x="${tx}" y="${ty}" text-anchor="middle">${esc(item.id==='judgement'?'상황 판단':words[0])}<tspan x="${tx}" dy="24">${item.level}/4</tspan></text>`;}).join('')}</svg>`;
}
