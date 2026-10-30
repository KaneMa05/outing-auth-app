const {keywordRule}=require('../lib/interview-keyword-rules.cjs');
const {validateConceptCriteria}=require('../lib/interview-concept-rules.cjs');
const auth = require('./teacher-auth-utils');
const { requestSupabase } = require('./curriculum')._private;
const { authenticateStudent } = require('./criminal-law-ox')._private;
const { isPreviewStudent } = require('../lib/interview-preview-access');
const { authenticatePortal } = require('../lib/interview-web-auth');
const actions = new Set(['admin_assignment_detail','admin_ai_usage','admin_assignment_overview','status','bootstrap','questions','question_detail','note_save','history',
  'admin_catalog','admin_enabled','admin_members','admin_member_save','admin_questions',
  'admin_question_detail','admin_question_save','admin_question_delete','admin_question_publish','admin_question_publication','admin_topic_save','admin_feedback','admin_history','admin_note_detail',
  'admin_analysis_catalog','admin_analysis_questions','admin_analysis_detail','admin_analysis_save','admin_core_questions','core_questions',
  'life_get','life_save','diagnosis_get','diagnosis_save','admin_life_get','admin_life_feedback','admin_applications','admin_application_decide',
  'admin_writing_board','writing_list','writing_save','writing_history','admin_writing_history','admin_writing_list','admin_writing_feedback','admin_review_students','admin_review_detail',
  'admin_rubric_list','admin_rubric_detail','admin_rubric_save']);
const reads = new Set(['admin_assignment_detail','admin_ai_usage','admin_assignment_overview','admin_writing_board','admin_writing_history','admin_catalog','admin_members','admin_questions','admin_question_detail','admin_history','admin_note_detail',
  'admin_analysis_catalog','admin_analysis_questions','admin_analysis_detail','admin_core_questions','admin_life_get','admin_applications','admin_writing_list','admin_review_students','admin_review_detail','admin_rubric_list','admin_rubric_detail']);
const fail = (code,status=400) => { throw Object.assign(new Error(code),{status}); };
function validate(body) {
  if (!body || Array.isArray(body) || !actions.has(body.action)) fail('unsupported_action');
  if(body.text!==undefined&&(typeof body.text!=='string'||body.text.length>10000))fail('invalid_request');
  if(body.itemId!==undefined&&(typeof body.itemId!=='string'||body.itemId.length>120))fail('invalid_request');
  for(const key of ['studentId','deviceToken','id','topicId','targetStudentId','search','prompt','title','guidance','feedback','examNumber','track','expiresOn','status','noteStatus','kind','category','elementId','disposition','analysisStatus','answerForm','rationale','coreKind','reviewNote']) {
    if(body[key]!==undefined && (typeof body[key]!=='string' || body[key].length>({prompt:4000,guidance:4000,rationale:4000,feedback:8000,reviewNote:2000,deviceToken:256,search:200}[key] || 120))) fail('invalid_request');
  }
  for(const key of ['revision','topicRevision','questionRevision','page','sortOrder'])
    if(body[key]!==undefined && (!Number.isInteger(body[key]) || body[key]<0 || body[key]>100000)) fail('invalid_request');
  for(const key of ['enabled','required','active','registeredOnly','approved'])
    if(body[key]!==undefined && typeof body[key]!=='boolean') fail('invalid_request');
  for(const key of ['topicIds','tracks','elementIds'])
    if(body[key]!==undefined && (!Array.isArray(body[key]) || body[key].length>50 || body[key].some(v=>typeof v!=='string'||v.length>120))) fail('invalid_request');
  const required={
    writing_history:['kind','itemId'],admin_writing_history:['targetStudentId','kind','itemId'],
    admin_review_detail:['targetStudentId'],admin_ai_usage:['targetStudentId'],admin_assignment_detail:['targetStudentId'],
    writing_save:['kind','itemId','text','status','revision'],admin_writing_list:['targetStudentId'],
    admin_writing_feedback:['targetStudentId','kind','itemId','revision','status','feedback'],
    admin_application_decide:['id','revision','status','reviewNote'],
    life_save:['revision','content','status'],admin_life_get:['targetStudentId'],
    diagnosis_save:['topicId','revision','prompts','answers'],
    admin_life_feedback:['targetStudentId','revision','status','feedback'],
    note_save:['topicId','topicRevision','revision','fields','status'],
    admin_question_save:['prompt','category','topicIds','tracks','status','revision'],
    admin_question_delete:['id','revision'],
    admin_question_publication:['id','revision','approved'],
    admin_topic_save:['title','kind','guidance','required','active','tracks','sortOrder','revision'],
    admin_member_save:['targetStudentId','track','examNumber','enabled'],
    admin_feedback:['targetStudentId','topicId','revision','status','feedback'],
    admin_enabled:['enabled'],admin_note_detail:['targetStudentId','topicId'],
    admin_analysis_save:['id','revision','questionRevision','elementIds','disposition','answerForm','rationale','status'],
    admin_analysis_detail:['id'],
  };
  if((required[body.action]||[]).some(key=>body[key]===undefined||body[key]===null))fail('invalid_request');
  if(body.annotations!==undefined&&(!Array.isArray(body.annotations)||body.annotations.length>100||body.annotations.some(m=>!m||!['underline','strike','bracket','comment','color'].includes(m.type)||!Number.isInteger(m.start)||!Number.isInteger(m.end)||m.start<0||(m.type==='comment'?m.start>m.end:m.start>=m.end)||m.end>10000||typeof m.note!=='string'||m.note.length>1000||(m.type==='comment'&&!m.note.trim())||((m.color!==undefined||m.type==='color')&&(typeof m.color!=='string'||!/^#[0-9a-f]{6}$/i.test(m.color))))))fail('invalid_request');
  if(body.action==='note_save' && (!body.fields || typeof body.fields!=='object'||Array.isArray(body.fields)))fail('invalid_request');
  if(body.action==='life_save' && (!body.content || typeof body.content!=='object'||Array.isArray(body.content)))fail('invalid_request');
  if(body.action==='diagnosis_save'&&(!Array.isArray(body.answers)||body.answers.length!==5||body.answers.some(v=>typeof v!=='string'||[...v].length>2000)||!Array.isArray(body.prompts)||body.prompts.length!==5||body.prompts.some(v=>typeof v!=='string'||!v.trim()||[...v].length>600)))fail('invalid_request');
  if(body.action.startsWith('admin_rubric_')){
    if(body.originDisposition!==undefined&&!['job_source','knowledge_review','context_needed'].includes(body.originDisposition))fail('invalid_request');
    if(body.action!=='admin_rubric_list'&&(typeof body.id!=='string'||!body.id))fail('invalid_request');
    if(body.action==='admin_rubric_save'){
      if(!Number.isInteger(body.revision)||!Number.isInteger(body.questionRevision)||
        !['job_knowledge','personality_experience','personality_opinion','profile','followup','practical','hold'].includes(body.kind)||
        !['draft','reviewed'].includes(body.status)||typeof body.rationale!=='string'||body.rationale.trim().length<10||
        typeof body.verificationNote!=='string'||body.verificationNote.length>4000||
        !Array.isArray(body.criteria)||body.criteria.length>20||!Array.isArray(body.criticalErrors)||body.criticalErrors.length>20)fail('invalid_request');
      const text=(v,n)=>typeof v==='string'&&v.trim().length>0&&v.length<=n;
      for(const c of body.criteria)if(!c||!text(c.label,200)||!text(c.context,2000)||!text(c.reject_context,2000)||
        !Array.isArray(c.terms)||c.terms.length<1||c.terms.length>30||c.terms.some(t=>!text(t,120)))fail('invalid_request');
      try { body.criteria.forEach(keywordRule);validateConceptCriteria(body.criteria);if(body.kind!=='job_knowledge'&&body.criteria.some(c=>c.assessment!==undefined))fail('invalid_request'); } catch { fail('invalid_request'); }
      if(body.criticalErrors.some(t=>!text(t,2000)))fail('invalid_request');
      if(body.scoreMap!==null){const s=body.scoreMap;if(!s||!['O','partial','X'].every(k=>Number.isFinite(s[k]))||!(s.O>s.partial&&s.partial>s.X&&s.X>=0&&s.O<=10000))fail('invalid_request');}
    }
  }
  if(body.category!==undefined && !['personality','job'].includes(body.category))fail('invalid_request');
  if(body.action==='admin_question_publication'&&(!body.id||body.revision<1))fail('invalid_request');
  if(body.action==='admin_question_publish' && (!Array.isArray(body.items)||body.items.length<1||body.items.length>30||
    body.items.some(q=>!q||typeof q.id!=='string'||q.id.length>120||!Number.isInteger(q.revision)||q.revision<1)))fail('invalid_request');
}
function createHandler({authenticate=authenticateStudent, previewAllowed=isPreviewStudent,authenticateWeb=authenticatePortal,read=requestSupabase,
  invoke=(action,actor,body)=>requestSupabase('POST',action==='admin_question_publication'?'rpc/ip_question_publication_service':action==='admin_writing_board'?'rpc/ip_writing_board_service':action.startsWith('diagnosis_')?'rpc/ip_diagnosis_service':['writing_history','admin_writing_history'].includes(action)?'rpc/ip_writing_history_service':action.startsWith('admin_rubric_')?'rpc/ip_rubric_service':action.startsWith('admin_review_')?'rpc/ip_review_service':/^(admin_)?writing_/.test(action)?'rpc/ip_writing_service':action.startsWith('admin_application')?'rpc/ip_portal_service':/^(admin_)?life_/.test(action)?'rpc/ip_life_service':action.startsWith('admin_analysis_')?'rpc/ip_analysis_service':['core_questions','admin_core_questions'].includes(action)?'rpc/ip_core_service':'rpc/ip_service',{p_action:action,p_actor:actor,p_body:body})}={}) {
  return async (req,res) => {
    res.setHeader('Cache-Control','no-store');
    try {
      if(req.method!=='POST'){res.setHeader('Allow','POST');fail('method_not_allowed',405);}
      if(req.headers.origin && new URL(req.headers.origin).host!==req.headers.host) fail('forbidden',403);
      let body=req.body;
      if(!body){let raw='';for await(const c of req){raw+=c;if(Buffer.byteLength(raw)>400000)fail('request_too_large',413);}body=JSON.parse(raw||'{}');}
      if(typeof body==='string')body=JSON.parse(body);
      if(Buffer.byteLength(JSON.stringify(body))>(body?.action==='admin_writing_feedback'?400000:body?.action==='life_save'?180000:body?.action==='admin_rubric_save'?200000:40000))fail('request_too_large',413);
      validate(body);
      let actor;
      if(body.action.startsWith('admin_')) {
        const session=auth.readSessionToken(auth.readCookie(req,auth.COOKIE_NAME),auth.getConfig().secret);
        if(!session)fail('unauthorized',401);
        if(session.role!=='admin' || !auth.hasPermission(session,reads.has(body.action)?'interview.read':'interview.write'))fail('forbidden',403);
        actor={type:'admin',id:session.username};
      } else {
        const webStudent=await authenticateWeb(req);
        if(webStudent){
          actor={type:'student',id:webStudent.id};
        }else{
        // Deny non-test accounts before any device/DB query. Browser hints are
        // never authorization, including on direct URL/API requests.
        if(!previewAllowed(body.studentId)) {
          if(body.action==='status')return res.status(200).json({ok:true,enabled:false});
          fail('forbidden',403);
        }
        const student=await authenticate(body);
        if(!student)fail('unauthorized',401);
        if(!previewAllowed(student.id))fail('forbidden',403);
        actor={type:'student',id:student.id};
        }
      }
      const payload={...body};
      for(const key of ['action','studentId','deviceToken','actor','client'])delete payload[key];
      res.status(200).json(body.action==='admin_assignment_detail'
        ?await require('../lib/interview-assignment-detail.cjs').assignmentDetail(payload,actor,invoke,read)
        :body.action==='admin_ai_usage'
        ?await require('../lib/interview-ai-usage.cjs').usage(payload,actor,read)
        :body.action==='admin_assignment_overview'
        ?await require('../lib/interview-assignment-overview.cjs').overview(payload,actor,invoke,read)
        :await invoke(body.action,actor,payload));
    } catch(error) {
      const known=['unauthorized','forbidden','not_enrolled','revision_conflict','topic_changed','topic_in_use','invalid_topic','invalid_request','incomplete_note','incomplete_life','help_reason_required','not_submitted','question_unavailable','student_unavailable','unsupported_action','method_not_allowed','request_too_large','review_note_required'];
      known.push('rubric_incomplete');
      known.push('invalid_experience_date','incomplete_experience_date');
      known.push('invalid_satisfaction');
      const code=known.find(c=>error.message===c || error.message?.includes(`"message":"${c}"`));
      const status=error.status || (['revision_conflict','topic_changed','topic_in_use'].includes(code)?409:
        ['forbidden','not_enrolled'].includes(code)?403:code==='unauthorized'?401:code?400:503);
      res.status(status).json({ok:false,error:code||'interview_unavailable'});
    }
  };
}
module.exports=createHandler();
module.exports.createHandler=createHandler;
module.exports._private={validate};
