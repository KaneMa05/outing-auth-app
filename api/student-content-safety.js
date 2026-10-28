const crypto=require('node:crypto');
const {contentRef,requestStore,loadContentBlocks,fail}=require('../lib/student-content-safety');
const teacherAuth=require('./teacher-auth-utils');
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
function createHandler({request=requestStore,enabled=process.env.STUDENT_CONTENT_SAFETY_ENABLED==='true'}={}) {return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({ok:false,error:'method_not_allowed'});}
  try {
    if(!enabled)throw fail('content_safety_unavailable',503);
    if(req.headers?.origin&&new URL(req.headers.origin).host!==req.headers.host)throw fail('forbidden',403);
    const body=await readBody(req);
    if(['admin_list','admin_review'].includes(body.action)) {
      const session=teacherAuth.readSessionToken(teacherAuth.readCookie(req,teacherAuth.COOKIE_NAME),teacherAuth.getConfig().secret);
      if(!session)throw fail('unauthorized',401);
      if(!teacherAuth.hasPermission(session,body.action==='admin_list'?'inquiries.read':'inquiries.write'))throw fail('forbidden',403);
      if(body.action==='admin_list')return res.status(200).json({ok:true,reports:await request('GET','student_content_reports?status=eq.pending&select=id,surface,target_id,context_id,snapshot,reason,created_at&order=created_at.asc&limit=100')});
      if(!uuid(body.reportId)||!['removed','dismissed'].includes(body.status))throw fail('invalid_request');
      const reports=await request('GET',`student_content_reports?id=eq.${body.reportId}&status=eq.pending&select=*&limit=1`);
      const report=reports?.[0];if(!report)throw fail('report_not_found',404);
      if(body.status==='removed')await removeReportedContent(report,request);
      await request('PATCH',`student_content_reports?id=eq.${report.id}&status=eq.pending`,{status:body.status,reviewed_by:session.username,reviewed_at:new Date().toISOString()});
      return res.status(200).json({ok:true});
    }
    if(!['list','block','unblock','report'].includes(body.action))throw fail('unsupported_action');
    const id=typeof body.studentId==='string'?body.studentId.trim():'',token=typeof body.deviceToken==='string'?body.deviceToken:'';
    if(!id||id.length>64||!token||token.length>256)throw fail('unauthorized',401);
    const [validation,students]=await Promise.all([
      request('POST','rpc/validate_student_device',{p_student_id:id,p_device_token_hash:crypto.createHash('sha256').update(token).digest('hex'),p_client_display_mode:null,p_client_user_agent:null}),
      request('GET',`students?id=eq.${encodeURIComponent(id)}&is_active=eq.true&select=id,student_category&limit=1`),
    ]);
    const student=students?.find(s=>s.id===id);
    if(validation?.valid!==true||!student)throw fail('unauthorized',401);
    if(!['online_managed','lecture'].includes(student.student_category))throw fail('forbidden',403);
    const blocks=await loadContentBlocks(id,request);
    if(body.action==='list')return res.status(200).json({ok:true,blocks:(blocks||[]).map(row=>({authorRef:contentRef(row.blocked_student_id),createdAt:row.created_at}))});
    if(body.action==='unblock') {
      const block=(blocks||[]).find(row=>contentRef(row.blocked_student_id)===body.authorRef);
      if(!block)throw fail('block_not_found',404);
      await request('DELETE',`student_content_blocks?student_id=eq.${encodeURIComponent(id)}&blocked_student_id=eq.${encodeURIComponent(block.blocked_student_id)}`);
      return res.status(200).json({ok:true});
    }
    const target=await resolveTarget(body,student,request);
    if(!target.author||target.author===id)throw fail('invalid_target');
    if(body.action==='block') {
      if((blocks||[]).some(row=>row.blocked_student_id===target.author))return res.status(200).json({ok:true,authorRef:contentRef(target.author)});
      if((blocks||[]).length>=200)throw fail('block_limit',429);
      await request('POST','student_content_blocks?on_conflict=student_id,blocked_student_id',{student_id:id,blocked_student_id:target.author},{Prefer:'resolution=ignore-duplicates,return=minimal'});
      return res.status(200).json({ok:true,authorRef:contentRef(target.author)});
    }
    const reason=typeof body.reason==='string'?body.reason.trim():'';
    if(reason.length<2||reason.length>300)throw fail('invalid_report_reason');
    const since=new Date(Date.now()-24*60*60*1000).toISOString();
    const recent=await request('GET',`student_content_reports?reporter_student_id=eq.${encodeURIComponent(id)}&created_at=gte.${since}&select=id&limit=21`);
    if((recent||[]).length>=20)throw fail('report_rate_limited',429);
    await request('POST','student_content_reports',{reporter_student_id:id,reported_student_id:target.author,surface:body.surface,target_id:body.targetId,context_id:target.contextId||null,snapshot:target.snapshot.slice(0,6000),reason});
    return res.status(201).json({ok:true});
  }catch(error){return res.status(error.status||503).json({ok:false,error:error.status?error.message:'content_safety_unavailable'});}
};}
async function resolveTarget(body,student,request) {
  const {surface,targetId}=body;
  const one=async(path)=>{const row=(await request('GET',path))?.[0];if(!row)throw fail('content_not_found',404);return row;};
  if(['post','feedback','comment','reply'].includes(surface)) {
    if(!uuid(targetId))throw fail('invalid_target');
    const comment=['comment','reply'].includes(surface);
    const row=await one(`question_${comment?'comments':'posts'}?id=eq.${targetId}&deleted_at=is.null&is_hidden=eq.false&select=*&limit=1`);
    const post=comment?await one(`question_posts?id=eq.${row.post_id}&deleted_at=is.null&is_hidden=eq.false&select=*&limit=1`):row;
    const feedback=['feedback','reply'].includes(surface);
    if(feedback ? post.board_type!=='free'||!['스터디카페 의견','스터디카페 비공개 의견'].includes(post.subject)||post.subject==='스터디카페 비공개 의견'&&post.student_id!==student.id : post.board_type!=='subject'||student.student_category!=='lecture')throw fail('content_not_found',404);
    if(comment&&row.author_type!=='student')throw fail('invalid_target');
    if(feedback&&post.feature_preview_id)await one(`study_cafe_feature_previews?id=eq.${post.feature_preview_id}&is_published=eq.true&select=id&limit=1`);
    return {author:row.student_id,contextId:post.id,snapshot:(row.title||'')+'\n'+(row.body||'')};
  }
  if(surface==='message') {
    if(!uuid(targetId))throw fail('invalid_target');
    const row=await one(`study_cafe_room_messages?id=eq.${targetId}&message_type=eq.chat&deleted_at=is.null&select=*&limit=1`);
    await one(`study_cafe_room_members?room_id=eq.${row.room_id}&student_id=eq.${encodeURIComponent(student.id)}&select=student_id&limit=1`);
    return {author:row.student_id,snapshot:row.message_text||''};
  }
  if(surface==='room') {
    if(!uuid(targetId))throw fail('invalid_target');
    const row=await one(`study_cafe_rooms?id=eq.${targetId}&is_active=eq.true&select=*&limit=1`);
    return {author:row.host_student_id,snapshot:row.name+'\n'+(row.description||'')};
  }
  if(surface==='profile') {
    if(!/^[1-9]\d?$/.test(String(targetId)))throw fail('invalid_target');
    const row=await one(`study_cafe_presence?seat_number=eq.${targetId}&select=student_id&limit=1`);
    if(!body.authorRef||contentRef(row.student_id)!==body.authorRef)throw fail('content_changed',409);
    const profile=(await request('GET',`study_cafe_profiles?student_id=eq.${encodeURIComponent(row.student_id)}&select=nickname,status_message&limit=1`))?.[0]||{};
    return {author:row.student_id,snapshot:(profile.nickname||'')+'\n'+(profile.status_message||'')};
  }
  if(surface==='member') {
    if(typeof targetId!=='string'||!uuid(targetId.slice(0,36))||targetId[36]!==':')throw fail('invalid_target');
    const roomId=targetId.slice(0,36),ref=targetId.slice(37);
    await one(`study_cafe_room_members?room_id=eq.${roomId}&student_id=eq.${encodeURIComponent(student.id)}&select=student_id&limit=1`);
    const members=await request('GET',`study_cafe_room_members?room_id=eq.${roomId}&select=student_id&limit=100`);
    const member=(members||[]).find(row=>contentRef(row.student_id)===ref);
    if(!member)throw fail('content_not_found',404);
    const profile=(await request('GET',`study_cafe_profiles?student_id=eq.${encodeURIComponent(member.student_id)}&select=nickname,status_message&limit=1`))?.[0]||{};
    return {author:member.student_id,snapshot:(profile.nickname||'')+'\n'+(profile.status_message||'')};
  }
  throw fail('invalid_target');
}
async function removeReportedContent(report,request) {
  const id=report.target_id,now=new Date().toISOString();
  if(['post','feedback','comment','reply','message','room'].includes(report.surface)&&!uuid(id))throw fail('invalid_target');
  if(['post','feedback','comment','reply'].includes(report.surface))return request('PATCH',`question_${['comment','reply'].includes(report.surface)?'comments':'posts'}?id=eq.${id}`,{is_hidden:true,hidden_reason:'운영자 신고 검토'});
  if(report.surface==='message')return request('PATCH',`study_cafe_room_messages?id=eq.${id}`,{deleted_at:now});
  if(report.surface==='room')return request('PATCH',`study_cafe_rooms?id=eq.${id}`,{name:'운영자가 숨긴 스터디룸',description:''});
  if(['profile','member'].includes(report.surface)&&report.reported_student_id){
    await request('PATCH',`study_cafe_profiles?student_id=eq.${encodeURIComponent(report.reported_student_id)}`,{nickname:null,status_message:null});
    return request('PATCH',`study_cafe_presence?student_id=eq.${encodeURIComponent(report.reported_student_id)}`,{display_name:null});
  }
  throw fail('invalid_target');
}
async function readBody(req) {
  let body=req.body;
  if(body===undefined){let raw='';for await(const part of req){raw+=part;if(Buffer.byteLength(raw)>8192)throw fail('payload_too_large',413);}try{body=JSON.parse(raw||'{}');}catch{throw fail('invalid_request');}}
  if(!body||typeof body!=='object'||Array.isArray(body)||Buffer.byteLength(JSON.stringify(body))>8192)throw fail('invalid_request');
  return body;
}
module.exports=createHandler();module.exports.createHandler=createHandler;
