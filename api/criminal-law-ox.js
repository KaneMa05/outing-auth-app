const crypto = require('crypto');
const auth = require('./teacher-auth-utils');
const { requestSupabase } = require('./curriculum')._private;
const actions = new Set(['status','bootstrap','questions','detail','submit','note','admin_catalog','admin_list','admin_history','admin_save','admin_enabled','admin_members','admin_member_set','admin_book_set','admin_member_history']);
const bookIds = ['criminal-law','criminal-procedure-investigation-evidence','criminal-procedure-trial'];
const fail = (message, status=400) => { throw Object.assign(new Error(message),{status}); };
const DEVICE_SESSION_COOKIE = 'outing_ox_device_session';
const DEVICE_SESSION_SECONDS = 12 * 60 * 60;
const deviceHash = token => crypto.createHash('sha256').update(token).digest('hex');
const deviceSessionSecret = () => process.env.OX_SESSION_SECRET || process.env.TEACHER_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
// Domain separation prevents these credentials being used as teacher sessions.
const signDeviceSession = (payload, secret) => crypto.createHmac('sha256',secret).update('ox-device-session-v1:'+payload).digest('base64url');
function readDeviceSession(req, body, secret, now) {
  const token=auth.readCookie(req,DEVICE_SESSION_COOKIE);
  if (!secret || !token || token.length>2048 || !body.studentId || !body.deviceToken) return null;
  const parts=token.split('.');
  if (parts.length!==2) return null;
  const [payload,signature]=parts, expected=signDeviceSession(payload,secret);
  const actual=Buffer.from(signature), target=Buffer.from(expected);
  if (actual.length!==target.length || !crypto.timingSafeEqual(actual,target)) return null;
  try {
    const session=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));
    if (session.studentId!==body.studentId || session.device!==deviceHash(body.deviceToken)
      || !Number.isInteger(session.exp) || session.exp<=now || session.exp>now+DEVICE_SESSION_SECONDS) return null;
    return {id:session.studentId};
  } catch { return null; }
}
function deviceSessionCookie(req, body, studentId, secret, now) {
  const payload=Buffer.from(JSON.stringify({studentId,device:deviceHash(body.deviceToken),exp:now+DEVICE_SESSION_SECONDS})).toString('base64url');
  const secure=req.headers['x-forwarded-proto']==='https' || req.socket?.encrypted || process.env.VERCEL==='1';
  return `${DEVICE_SESSION_COOKIE}=${payload}.${signDeviceSession(payload,secret)}; HttpOnly; SameSite=Strict; Path=/api/criminal-law-ox; Max-Age=${DEVICE_SESSION_SECONDS}${secure?'; Secure':''}`;
}
async function authenticateStudent(body, request=requestSupabase) {
  if (!body.studentId || !body.deviceToken) return null;
  const validation = await request('POST','rpc/validate_student_device', {
    p_student_id:body.studentId,p_device_token_hash:crypto.createHash('sha256').update(body.deviceToken).digest('hex'),
    p_client_display_mode:String(body.client?.displayMode || '').slice(0,40) || null,
    p_client_user_agent:String(body.client?.userAgent || '').slice(0,500) || null
  });
  if (validation?.valid !== true) return null;
  // Device validation already checks the active student. ox_service checks it
  // again along with account type and current enrollment on every request.
  return {id:body.studentId};
}
function compactBootstrap(data) {
  if (!data?.catalog?.questions) return data;
  return {...data,catalog:{...data.catalog,questions:data.catalog.questions.map(q=>{
    const item={id:q.id,chapter_id:q.chapter_id,prompt:q.prompt,context:q.context,version:q.version};
    // Only keep answers the database already authorized for solved questions.
    if (q.correct_answer !== undefined) item.correct_answer=q.correct_answer;
    return item;
  })}};
}
function validate(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || !actions.has(body.action)) fail('unsupported_action');
  if (body.studentId !== undefined && (typeof body.studentId !== 'string' || body.studentId.length>120)) fail('invalid_request');
  if (body.deviceToken !== undefined && (typeof body.deviceToken !== 'string' || body.deviceToken.length>256)) fail('invalid_request');
  const action=body.action;
  if (action==='bootstrap' && body.summaryOnly!==undefined && typeof body.summaryOnly!=='boolean') fail('invalid_request');
  if (action==='questions' && (!Array.isArray(body.questions) || body.questions.length<1 || body.questions.length>50
    || body.questions.some(q=>!q || typeof q.id!=='string' || !q.id || q.id.length>120 || !Number.isInteger(q.version) || q.version<1)
    || new Set(body.questions.map(q=>q.id)).size!==body.questions.length)) fail('invalid_request');
  if (['submit','note','detail'].includes(action)) {
    if (typeof body.questionId!=='string' || body.questionId.length>120 || !Number.isInteger(body.version) || body.version<1) fail('invalid_request');
  }
  if (action==='submit' && (!['O','X'].includes(body.answer) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.submissionId || ''))) fail('invalid_answer');
  if (action==='note') {
    if ('memo' in body && (typeof body.memo!=='string' || body.memo.length>5000)) fail('invalid_memo');
    for (const key of ['bookmark','mastered']) if (key in body && typeof body[key]!=='boolean') fail('invalid_request');
  }
  if (action==='admin_enabled' && typeof body.enabled!=='boolean') fail('invalid_request');
  if (action==='admin_member_set' && (typeof body.memberId!=='string' || !body.memberId.trim() || body.memberId.length>120 || typeof body.allowed!=='boolean')) fail('invalid_request');
  if (['admin_book_set','admin_member_history'].includes(action) && (typeof body.memberId!=='string' || !body.memberId.trim() || body.memberId.length>120)) fail('invalid_request');
  if ((action==='admin_book_set' || (action==='admin_member_set' && body.revision!==undefined)) && (!Number.isInteger(body.revision) || body.revision<0)) fail('invalid_request');
  if (action==='admin_book_set') {
    if (typeof body.active!=='boolean' || !Array.isArray(body.collectionIds) || !body.collectionIds.length || body.collectionIds.length>3
      || body.collectionIds.some(id=>!bookIds.includes(id)) || new Set(body.collectionIds).size!==body.collectionIds.length
      || typeof body.reason!=='string' || !body.reason.trim() || body.reason.length>500) fail('invalid_request');
    if (body.active) {
      const date=typeof body.purchaseDate==='string' && /^\d{4}-\d{2}-\d{2}$/.test(body.purchaseDate) ? new Date(body.purchaseDate+'T00:00:00Z') : null;
      const koreanToday=new Date(Date.now()+9*60*60*1000).toISOString().slice(0,10);
      if (!date || !Number.isFinite(date.getTime()) || date.toISOString().slice(0,10)!==body.purchaseDate || body.purchaseDate>koreanToday) fail('invalid_request');
    }
  }
  if (action==='admin_members' && ((body.collectionId!==undefined && body.collectionId!=='' && !bookIds.includes(body.collectionId))
    || (body.bookStatus!==undefined && !['','active','stopped'].includes(body.bookStatus)))) fail('invalid_request');
  if (action==='admin_members' && body.registeredOnly!==undefined && typeof body.registeredOnly!=='boolean') fail('invalid_request');
  if (action==='admin_save') {
    const q=body.question;
    if (!q || !Number.isInteger(body.revision) || body.revision<0 || typeof body.reviewed!=='boolean' || !['draft','published','archived'].includes(body.status)) fail('invalid_question');
    for (const [key,max] of [['id',120],['chapter_id',120],['prompt',15000],['explanation_html',30000]]) {
      if (typeof q[key]!=='string' || !q[key].trim() || q[key].length>max) fail('invalid_question');
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(q.id) || typeof q.context!=='string' || q.context.length>15000 || !['O','X'].includes(q.correct_answer)) fail('invalid_question');
    if (/<(?!\/?u>)[^>]*>/i.test(q.explanation_html)) fail('invalid_html');
    if (body.revision===0) body.question={id:q.id,chapter_id:q.chapter_id,prompt:q.prompt,context:q.context,correct_answer:q.correct_answer,explanation_html:q.explanation_html,explanation:q.explanation_html.replace(/<\/?u>/g,''),origin_type:'manual',source_question_number:'0',source_option_label:'',source_page:null};
  }
  if (['admin_list','admin_members'].includes(action)) {
    if (body.page!==undefined && (!Number.isInteger(body.page) || body.page<0 || body.page>10000)) fail('invalid_request');
    for (const key of ['search','chapterId','status']) if (body[key]!==undefined && (typeof body[key]!=='string' || body[key].length>500)) fail('invalid_request');
  }
}
async function invokeLearning(action,actor,body,request=requestSupabase) {
  const progressive=action==='questions' || (action==='bootstrap' && body.summaryOnly===true);
  try {
    return await request('POST',progressive?'rpc/ox_learning_data':'rpc/ox_service',{p_action:action,p_actor:actor,p_body:body});
  } catch(error) {
    // Safe rolling deployment: an older DB can still serve the full bootstrap.
    if (action==='bootstrap' && progressive && error.storeStatus===404) {
      return request('POST','rpc/ox_service',{p_action:action,p_actor:actor,p_body:{}});
    }
    throw error;
  }
}
function createHandler({ invoke=invokeLearning, authenticate=authenticateStudent, sessionSecret=deviceSessionSecret, now=()=>Math.floor(Date.now()/1000) }={}) {
  return async (req,res)=> {
    res.setHeader('Cache-Control','no-store');
    try {
      if (req.method!=='POST') { res.setHeader('Allow','POST'); fail('method_not_allowed',405); }
      if (req.headers.origin && new URL(req.headers.origin).host!==req.headers.host) fail('forbidden',403);
      let body=req.body;
      if (!body) { let raw=''; for await(const chunk of req) { raw+=chunk; if(Buffer.byteLength(raw)>100000) fail('request_too_large',413); } body=JSON.parse(raw || '{}'); }
      if(typeof body==='string') body=JSON.parse(body);
      if(Buffer.byteLength(JSON.stringify(body))>100000) fail('request_too_large',413);
      validate(body);
      let actor, newDeviceCookie;
      if(body.action.startsWith('admin_')) {
        const session=auth.readSessionToken(auth.readCookie(req,auth.COOKIE_NAME),auth.getConfig().secret);
        if(!session) fail('unauthorized',401);
        const permission=['admin_save','admin_enabled','admin_member_set','admin_book_set'].includes(body.action)?'criminal_ox.write':'criminal_ox.read';
        if(!auth.hasPermission(session,permission)) fail('forbidden',403);
        actor={type:'admin',id:session.username};
      } else {
        const secret=sessionSecret(), timestamp=now();
        const cached=readDeviceSession(req,body,secret,timestamp);
        const student=cached || await authenticate(body);
        if(!student) fail('unauthorized',401);
        actor={type:'student',id:student.id};
        // Fixed expiry: answering questions never extends a revoked device's session.
        // Without a signing secret, keep the existing authenticated request path.
        if (!cached && secret && body.deviceToken) newDeviceCookie=deviceSessionCookie(req,body,student.id,secret,timestamp);
      }
      // Device credentials and client-supplied identities never enter the OX database function.
      const payload={...body}; delete payload.deviceToken; delete payload.studentId; delete payload.actor; delete payload.client; delete payload.action;
      const data=await invoke(body.action,actor,payload);
      if (newDeviceCookie && data?.ok) res.setHeader('Set-Cookie',newDeviceCookie);
      res.status(200).json(body.action==='bootstrap'?compactBootstrap(data):data);
    } catch(error) {
      const known=['access_conflict','book_already_active','book_selection_required','ox_book_required','revision_conflict','question_changed','submission_conflict','question_unavailable','ox_disabled','ox_not_registered','student_unavailable','invalid_question','invalid_answer','invalid_memo','invalid_request','invalid_html','answer_required','unsupported_action','unauthorized','forbidden','method_not_allowed','request_too_large'];
      const code=known.find(code=>error.message===code || error.message?.includes(`"message":"${code}"`));
      const status=code?.includes('conflict') || ['question_changed','book_already_active'].includes(code)?409:code==='unauthorized'?401:['forbidden','ox_not_registered','ox_book_required'].includes(code)?403:['ox_disabled','question_unavailable','student_unavailable'].includes(code)?404:code==='method_not_allowed'?405:code==='request_too_large'?413:code?400:503;
      res.status(status).json({ok:false,error:code || 'ox_unavailable'});
    }
  };
}
module.exports=createHandler();
module.exports.createHandler=createHandler;
module.exports._private={validate,authenticateStudent,compactBootstrap,invokeLearning};
