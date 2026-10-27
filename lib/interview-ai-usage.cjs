const kinds=['self_intro','motivation','public_service','core30'];
async function usage(body,actor,read){
 if(actor?.type!=='admin'||!actor.id)throw Error('forbidden');
 const student=encodeURIComponent('eq.'+JSON.stringify(body.targetStudentId));
 const rows=await Promise.all(kinds.map(kind=>read('GET',`ip_ai_requests?student_id=${student}&kind=eq.${kind}&select=created_at,ip_ai_jobs(status)&order=created_at.desc,id.desc&limit=1`)));
 return {ok:true,items:kinds.map((kind,i)=>({kind,requested:rows[i].length>0,requestedAt:rows[i][0]?.created_at||null,statuses:(rows[i][0]?.ip_ai_jobs||[]).map(j=>j.status)}))};
}
module.exports={usage};
