async function assignmentDetail(body,actor,invoke,read){
 const detail=await invoke('admin_review_detail',actor,{targetStudentId:body.targetStudentId});
 const student=encodeURIComponent('eq.'+JSON.stringify(body.targetStudentId));
 const [units,drafts]=await Promise.all([
  read('GET','ip_pa_units?select=id,title,prompt,fields&order=position&limit=100'),
  read('GET',`ip_pa_drafts?student_id=${student}&select=unit_id,fields,revision,updated_at,ip_pa_submissions!ip_pa_drafts_latest_fk(fields,definition,submitted_at,round,feedback)&limit=100`)
 ]);
 return {...detail,assignments:units.filter(u=>/^core-/.test(u.id)).map(u=>({...u,draft:drafts.find(d=>d.unit_id===u.id)||null}))};
}
module.exports={assignmentDetail};
