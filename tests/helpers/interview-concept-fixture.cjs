'use strict';
const {detail}=require('../interview-exam.test.cjs');
const correct='같은 힘을 좁은 곳에 모으면 단위 넓이당 받는 힘이 커집니다.';
const wrong='같은 힘이면 면적이 넓을수록 압력이 커집니다.';
const partial='같은 힘이라도 닿는 넓이가 달라지면 누르는 정도가 달라집니다.';
function conceptDetail(){
 const d=detail();d.question.prompt='같은 힘이 작용할 때 면적과 압력의 관계를 설명하세요.';d.rubric.source_prompt=d.question.prompt;
 d.rubric.criteria=[{label:'면적과 압력의 관계',terms:['압력','면적'],match:'all',keywords:[{term:'압력',aliases:[]},{term:'면적',aliases:[]}],context:'같은 힘에서 면적이 줄면 압력이 증가한다.',reject_context:'같은 힘인데 면적이 커지면 압력이 커진다고 설명한다.',assessment:{mode:'concept',match:'all',concepts:[{claim:'같은 힘에서 면적이 줄면 압력이 증가한다.',relation:'힘이 일정하다는 조건과 면적·압력의 반대 방향 관계를 설명한다.',partial:'힘이 같은 조건에서 면적에 따라 압력이 달라짐은 알지만 방향을 설명하지 않았다.',reject:'힘이 같은 조건에서 면적이 넓을수록 압력이 증가한다고 주장한다.'}],acceptedExamples:[correct],rejectedExamples:[wrong]}}];
 d.rubric.critical_errors=['힘이 일정하다는 조건에서 면적이 넓어지면 압력이 증가한다고 단정한다.'];return d;
}
function conceptJudgment(status='accepted',quote=correct,{error='absent',uncertainties=[]}={}){
 return {criteria:[],concepts:[{index:0,status,quote:status==='absent'?'':quote,reason:status==='accepted'?'같은 힘이라는 조건과 넓이에 대한 반대 관계를 설명했다.':status==='rejected'?'넓이가 커질수록 압력이 커진다고 반대로 설명했다.':status==='partial'?'넓이에 따른 변화는 설명했으나 방향은 빠졌다.':'설명을 확인할 수 없다.'}],errors:[{index:0,status:error,quote:error==='present'?quote:'',reason:error==='present'?'명시된 핵심 오류에 해당한다.':'확인된 핵심 오류가 없다.'}],uncertainties};
}
module.exports={conceptDetail,conceptJudgment,correct,wrong,partial};
