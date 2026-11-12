'use strict';
const labels={recognition_uncertain:'음성 인식 불확실',evaluation_uncertain:'내용 판정 불확실',evaluation_disagreement:'전사별 판정 불일치',evidence_invalid:'판정 근거 검증 실패',legacy_unclassified:'상세 원인 미기록'};
function hold(row,cause,detail){return {...row,status:'uncertain',quote:'',holdReason:cause,reason:labels[cause]+': '+detail};}
function classify(rows,raw){return rows.map(row=>{
 if(row.status!=='uncertain')return {...row,holdReason:null};
 const found=Array.isArray(raw)?raw.filter(r=>r?.index===row.index):[],r=found[0];
 const invalid=found.length!==1||r.status!=='uncertain'||!['recognition_uncertain','evaluation_uncertain'].includes(r.uncertaintyReason)||row.reason==='판정 근거를 확인하지 못했습니다.';
 return hold(row,invalid?'evidence_invalid':r.uncertaintyReason,invalid?'유효한 판정 또는 답변 인용을 확인하지 못했습니다.':row.reason);
 });}
function decorateSaved(value,testApp){
 if(!testApp||value?.report?.assessmentBasis!=='source_answer'||!Array.isArray(value.report.assessment))return value;
 const assessment=value.report.assessment.map(r=>r.status==='uncertain'&&!r.holdReason?hold(r,'legacy_unclassified','기존 기록에는 상세 보류 원인이 저장되지 않았습니다. 판정은 유지합니다.'):r);
 const legacy=assessment.filter(r=>r.holdReason==='legacy_unclassified').length;
 const analysis=value.report.analysis;
 return {...value,report:{...value.report,assessment,...(legacy&&analysis?{analysis:{...analysis,summary:`기존 판정은 유지합니다. 보류 ${legacy}개 항목은 상세 원인이 저장되지 않아 구분할 수 없습니다. 각 항목의 사유를 확인해 주세요.`}}:{})}};
}
const instructions=' uncertain이면 uncertaintyReason을 recognition_uncertain(전사 자체가 의심됨) 또는 evaluation_uncertain(전사는 읽히지만 기준 충족 판단이 어려움)으로 구분하세요. 확정 판정 O/partial/X이면 none을 쓰세요. 인용 검증 실패를 음성 인식 문제로 추측하지 마세요.';
function schema(base){const properties={...base.properties,uncertaintyReason:{type:'string',enum:['none','recognition_uncertain','evaluation_uncertain']}};return {...base,properties,required:Object.keys(properties)};}
module.exports={hold,classify,decorateSaved,instructions,schema,labels};
