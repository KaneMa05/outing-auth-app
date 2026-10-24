export const basicFields=[['school','최종학력'],['major','전공·학과'],['clubs','동아리'],['volunteering','봉사 경험'],['internships','인턴 경험'],['company','회사 경력'],['role','담당 직무']];
export const identityFields=[['name','이름'],['birthDate','생년월일'],['gender','성별']];
export const identityGenders=[['male','남성'],['female','여성'],['undisclosed','응답하지 않음']];
export const emptyBasic=()=>Object.fromEntries(basicFields.map(([key])=>[key,{text:'',none:false}]));

export const schoolStatuses=[['graduated','졸업'],['enrolled','재학'],['leave','휴학']];
export function basicFieldText(key,value){
 if(value?.none)return '해당 없음';
 const text=value?.text||'',status=key==='school'?schoolStatuses.find(([id])=>id===value?.status)?.[1]:'';
 return [text,status].filter(Boolean).join(' · ');
}

export function normalizeBirthDate(value){
 const text=String(value||'').trim();
 return /^\d{8}$/.test(text)?text.slice(0,4)+'-'+text.slice(4,6)+'-'+text.slice(6):text;
}
export function validBirthDate(value,today=new Date()){
 const text=normalizeBirthDate(value);if(!text)return true;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(text))return false;
 const [y,m,d]=text.split('-').map(Number);
 const leap=y%4===0&&(y%100!==0||y%400===0),days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
 const max=[today.getFullYear(),String(today.getMonth()+1).padStart(2,'0'),String(today.getDate()).padStart(2,'0')].join('-');
 return y>=1&&m>=1&&m<=12&&d>=1&&d<=days[m-1]&&text<=max;
}
