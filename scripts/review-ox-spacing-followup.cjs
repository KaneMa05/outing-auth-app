const fs = require('fs');
const path = require('path');
const { loadBank } = require('./prepare-ox-spacing-fix.cjs');
const first = require('../docs/criminal-law-ox-spacing-audit-20260920.json');
const review = {
  source: first.source, source_sha256: first.source_sha256,
  baseline_audit_file: 'docs/criminal-law-ox-spacing-audit-20260920.json',
  actor: 'spacing-correction-followup-20260920',
  output_directory: 'ox-spacing-followup-20260920'
};
// Reviewed ordinary phrases, optional compounds, and forms needing individual context.
const retain = new Set(`
고 한|그 중|만 원을|만 원|수 개의|경찰관 직무집행법|경위 공채|다음 날|중 한|위 법|하는 데|경장 승진
자진 출석하여|실해 발생의|정당화 요소에|있는 바|양 죄는|이용 촉진|터 잡아|부정수표 단속법|공정증서 원본
증거 인멸죄로|수사 기관이|인과 관계가|경사 승진|정당화 요소가|말하는 데|억 원|남아 있는|만 한|문제 된
동 행사죄의|수사 기관의|정원 초과운항확인서를|심 법원이|천만 원|초과 주관적|자기책임 원칙에|결과 발생에
수 회|현금자동 지급기에서|정당화 요소를|교통 사고를|위법성 조각사유의|범죄구성 요건의|해경 수사|착수 시기는
있는 데|범죄 실현과|효과 없는|명의신탁 받아|사회 관념상|되는 데|는 데|직무 수행에|자기 결정권을|해경 공채
사법 경찰관이|피의자신문 조서와|범죄 혐의의|수사 기관은|전문 법칙이|해경 학과|법원 합의부가|판결 이유에
교통사고처리 특례법|만 원의|유추해석 금지의|유추 해석하는|여신전문금융업 법|해석 방법에|형벌 법규를
직무 유기죄는|건축 자재를|조업 지시를|어로저지 선을|구성 요건적|살인 미수와|안전 조치를|예견 가능성이
뿐 만|동시존재 원칙을|유선 비디오|교통 사고|구성 요|위법성조각 사유가|구성요건 표지이론은|위법성조각 사유의
누설 받은|형법 총칙|상호 간에|조세범 처벌법|작성 권자의|법익 침해를|근저당권 설정등기를|자격 정지
존속 살해죄가|처벌 불원의|폭력 행위|사회 상규에|생활 관계|자기 결정권에|정보 통신망|사회 집단에
종중 회장의|점용 허가를|본 원|본 죄가|평온 상태를|열어 주지|주거 침입죄의|주거 침입죄와|법리 오해의
발급 받은|국민건강보험 공단으로부터|기망 행위임을|금융 기관에|현금 카드를|카드 회사의|반환거부 행위가
불법 영득의사를|투자금 반환채무의|업무상 배임죄를|근저당권설정 등기를|실행행위 자의|재물 손괴죄가
권리행사 방해죄가|보전 처분의|강제집행 면탈죄가|역할 분담에|모아 놓고|현주건조물 방화치사상죄는
일반 공중의|일반교통 방해죄가|동 행사죄에|동행 사죄에|허위 공문서작성죄의|주취 운전자
공정증서원본 불실기재죄가|공동 정범으로|보호 법익으로|상대방 측에서|공무집행 방해죄가
범인도피 교사죄가|범인 도피죄에|범인도피 교사죄에|증언 거부권|증언 거부권을|징계 처분을|보완 수사를
고위공직자범죄 수사처|신분위장 수사에|의사 표시가|공소기각 판결을|혐의 사실이|통신 제한조치의
통신 비밀보호법|통신 제한조치를|전기 통신을|통신제한 조치를|통화 내용을|현행범 체포의|피의자 심문을
인도 받아|구속영장 청구서|혐의 사실과|전자 정보를|형사 소송법에|주취 운전|범행 직후의|제출 받아
기소 중지|재정 신청|증거 능력을|진술 조서를|진실 발견이라는|증거 능력은|본래 증거이지|문제 되는
피의자 신문조서의|형사 소송법은|피의자 신문조서|수사 기록|증거 자료가|치료 감호의|성명 모용사실이
공소 기각|직위 해제처분을|도로 교통법|교통 질서의|토지 관할이|심 법원은|재심대상 판결의|전심 재판에
국선변호인선임 청구를|천 만원|공소장 변경이|위 세|파기 환송|공판 기일|형사소송 규칙|선서 없이
간이공판 절차에|국민 참여재판으로|순경 수사|국민 참여재판을|간이 공판절차에|심 판결에|심 판결을
판결선고 시를|약식 명령|상소 취하에|상소 제기기간|상소 권회복청구를|불이익변경금지 원칙에
소송기록 접수통지를|소송기록접수 통지를|소송기록 접수통지서를|재심 청구인의|양형 부당을|절차 법|즉결 심판에
`.trim().split(/[|\n]/).map(x => x.trim()).filter(Boolean));
const approved = new Set(first.findings.filter(f => f.classification === 'context_review_required' && !retain.has(f.before)).map(f => f.before));
for (const form of `이 의제기를|수 갑|절도교사 죄|인 정자료로도|장 소에서도|제출한다 는|진술들 은|절 대적인|수사한다 고|범죄 다|테 러|서울고등법원 에|검 사장이|거 절하였음에도|유발되었 다|사 용한다는|함 정수사로|심 을|문 언을|충족되 며|아니하였다거 나|질서유지 를|협 력이|제도적으로 는|표 명한|촬 영행위가|실시간으 로|사인에게 는|송신인 과|녹 음자에|전기통신으 로|나누면 서|진 행되어야|유 출할|후방착석요구행위 의|보존하여 야|체 포로서|재량 의|작 성시부터|체포시점 과|체 포하였더라도|절 차이다|인정되는데 도|국가안전기획부에 서|송 달되기|관련된다 고|구하더라 도|표 지에|영 장원본을|존 부나|압 수영장을|예외로 서|위법하 나|계정 에|관 리처분권을|정보주체 에|작성하였으 나|진실발견 을|증거보전절차 는|불응하거 나|판시하 고|칙적으 로|원 칙적으로|통 제하기|행 하여지지|간접증거들 에|판 단되면|정도여 야|파괴하 는|보 전하고|공식 을|증 거조사방법을|압수수색 을|진술거부권이 고|증인신문절차 에|성매매행위 나|기 재하였고|진위 를|심리되어 야|불 합리를|특수성 에|기 록하게|범행재연 의|촉 탁하여|녹 음자의|불출정으 로|않 을만한|사 유만으로도|있었는지 를|기 술|규 명하는|불 러일으킬|사 용하였는바|처 리되었음의|원 심판결`.split('|')) approved.add(form);
const extraFile = path.join(__dirname, '../docs/criminal-law-ox-spacing-extra-reviewed.json');
if (fs.existsSync(extraFile)) for (const form of JSON.parse(fs.readFileSync(extraFile, 'utf8'))) approved.add(form);
const bank = loadBank(review);
const wordCounts = new Map();
for (const q of bank.questions) for (const field of ['prompt','context','explanation']) for (const word of (q[field] || '').match(/[가-힣]+/g) || []) wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
const findings = [];
const candidates = [];
for (const q of bank.questions) for (const field of ['prompt','context','explanation']) {
  const original = q[field] || '';
  let value = original;
  let offsets = Array.from({length:original.length},(_,i)=>i);
  let changed;
  do {
    changed = false;
    const removed = new Set();
    for (const m of value.matchAll(/(?=([가-힣]+) ([가-힣]+))/g)) {
      if (m.index > 0 && /[가-힣]/.test(value[m.index - 1])) continue;
      const form = m[1]+' '+m[2];
      if (!approved.has(form) || retain.has(form)) continue;
      const start=offsets[m.index], end=offsets[m.index+form.length-1]+1;
      const before=original.slice(start,end);
      findings.push({question_id:q.id,chapter_id:q.chapter_id,source_page:q.source_page,field,offset:start,before,suggestion:before.replace(/ /g,''),classification:'reviewed_broken_form',
        excerpt:original.slice(Math.max(0,start-30),start)+'['+before+']'+original.slice(end,end+30)});
      removed.add(m.index+m[1].length);
    }
    if (removed.size) {
      changed=true;
      value=value.split('').filter((_,i)=>!removed.has(i)).join('');
      offsets=offsets.filter((_,i)=>!removed.has(i));
    }
  } while(changed);
  for (const m of value.matchAll(/(?=([가-힣]+) ([가-힣]+))/g)) {
    if (m.index > 0 && /[가-힣]/.test(value[m.index - 1])) continue;
    const before = m[1] + ' ' + m[2];
    const after = m[1] + m[2];
    if (retain.has(before)) continue;
    const found = {question_id:q.id,chapter_id:q.chapter_id,source_page:q.source_page,field,offset:m.index,before,suggestion:after,
      excerpt:value.slice(Math.max(0,m.index-30),m.index)+'['+before+']'+value.slice(m.index+before.length,m.index+before.length+30)};
    if (wordCounts.has(after) && (m[1].length===1 || m[2].length===1 || (wordCounts.get(m[1])||0)<10 || (wordCounts.get(m[2])||0)<10)) candidates.push(found);
  }
}
const output = path.join(__dirname,'../docs/criminal-law-ox-spacing-followup-20260920.json');
fs.writeFileSync(output,JSON.stringify({...review,retained_forms:[...retain],approved_forms:[...approved],findings},null,2));
const scratch=path.join(__dirname,'../.tmp/ox-spacing-followup-20260920');
fs.mkdirSync(scratch,{recursive:true});
fs.writeFileSync(path.join(scratch,'additional-candidates.json'),JSON.stringify(candidates,null,2));
const unique = [...new Set(candidates.map(f=>f.before))];
fs.writeFileSync(path.join(scratch,'additional-forms.json'),JSON.stringify(unique,null,2));
console.log(JSON.stringify({questions:new Set(findings.map(f=>f.question_id)).size,occurrences:findings.length,
  investigation_questions:new Set(findings.filter(f=>f.question_id.startsWith('criminal-procedure-investigation-evidence-')).map(f=>f.question_id)).size,
  additional_forms:unique.length,additional_occurrences:candidates.length},null,2));
