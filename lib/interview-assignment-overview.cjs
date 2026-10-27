const kinds=['introduction','motivation','public_service'];
const hasText=value=>typeof value==='string'&&Boolean(value.trim());
function summarize(student,profile,writings,drafts){
 const content=profile?.content||{};
 const basic=hasText(content.background)||Object.values(content.basicInfo||{}).some(v=>v?.none||hasText(v?.text))||['qualifications','affiliations','awards'].some(k=>content[k]?.length||content.none?.includes(k));
 const life=content.experiences?.length>0;
 const result={...student,basic:basic?'saved':'empty',life:life?'saved':'empty'};
 for(const kind of kinds){
  const rows=writings.filter(w=>w.kind===kind);
  const submitted=rows.filter(w=>w.submitted_at).length;
  const saved=rows.filter(w=>hasText(w.body)).length;
  result[kind]={status:submitted?'submitted':saved?'saved':'empty',saved,submitted};
 }
 const core=drafts.filter(d=>/^core-/.test(d.unit_id));
 result.core={saved:core.filter(d=>d.revision>0).length,submitted:core.filter(d=>d.latest_id).length,total:25};
 return result;
}
async function overview(body,actor,invoke,read){
 const roster=await invoke('admin_review_students',actor,{search:body.search||'',track:body.track||'',page:body.page||0});
 if(!roster.students.length)return {...roster,students:[]};
 const ids=roster.students.map(s=>'"'+s.id.replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"');
 const filter='student_id=in.'+encodeURIComponent('('+ids.join(',')+')');
 async function rows(table,select){
  const all=[];
  for(let offset=0;;offset+=1000){
   const batch=await read('GET',`${table}?${filter}&select=${select}&order=student_id&limit=1000&offset=${offset}`);
   all.push(...batch);if(batch.length<1000)return all;
  }
 }
 const [profiles,writings,drafts]=await Promise.all([
  rows('ip_life_profiles','student_id,content'),
  rows('ip_writings','student_id,kind,body,submitted_at'),
  rows('ip_pa_drafts','student_id,unit_id,revision,latest_id')
 ]);
 return {ok:true,total:roster.total,pageSize:roster.pageSize,students:roster.students.map(s=>summarize(s,profiles.find(p=>p.student_id===s.id),writings.filter(w=>w.student_id===s.id),drafts.filter(d=>d.student_id===s.id)))};
}
module.exports={overview,summarize};
