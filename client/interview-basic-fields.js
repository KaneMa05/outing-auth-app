export const basicFields=[['school','최종학력'],['major','전공·학과'],['clubs','동아리'],['volunteering','봉사 경험'],['internships','인턴 경험'],['company','회사 경력'],['role','담당 직무'],['achievements','성과·역량']];
export const identityFields=[['name','이름'],['birthDate','생년월일'],['gender','성별']];
export const identityGenders=[['male','남성'],['female','여성'],['undisclosed','응답하지 않음']];
export const emptyBasic=()=>Object.fromEntries(basicFields.map(([key])=>[key,{text:'',none:false}]));
