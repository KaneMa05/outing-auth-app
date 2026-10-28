const crypto = require('node:crypto');
const { AsyncLocalStorage } = require('node:async_hooks');
const context = new AsyncLocalStorage();
const fail = (message, status=400) => Object.assign(new Error(message), {status});
function contentRef(id) {
  if (!id) return '';
  return crypto.createHmac('sha256', process.env.SUPABASE_SERVICE_ROLE_KEY || 'local-test-only').update('student-content:'+id).digest('base64url');
}
function assertAcceptableText(...values) {
  const text=values.filter(v=>typeof v==='string').join(' ').normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g,'');
  // Specific abusive expressions, rather than legal/medical terms used in study material.
  if (/(?:씨\s*발|개\s*새\s*끼|병\s*신|니\s*애\s*미|죽여\s*버릴|rape\s+you|kill\s+you)/iu.test(text)) throw fail('inappropriate_content');
}
async function withStudentContentSafety(studentId, request, fn, enabled=true) {
  if (!enabled || process.env.STUDENT_CONTENT_SAFETY_ENABLED !== 'true') return fn();
  const rows=await loadContentBlocks(studentId,request);
  const ids=new Set((rows||[]).map(r=>r.blocked_student_id));
  return context.run(ids,fn);
}
async function loadContentBlocks(studentId,request) {
  const rows=[];
  for(let offset=0;offset<10000;offset+=1000){
    const page=await request('GET',`student_content_blocks?student_id=eq.${encodeURIComponent(studentId)}&select=blocked_student_id,created_at&order=blocked_student_id.asc&limit=1000&offset=${offset}`);
    rows.push(...(page||[]));
    if((page||[]).length<1000)return rows;
  }
  throw fail('content_safety_unavailable',503);
}
function contentSafePath(method,path) {
  const ids=context.getStore();
  if (method!=='GET'||!ids?.size||!/^question_(?:posts|comments)\?/.test(path)) return path;
  const list=[...ids].map(id=>'"'+String(id).replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"').join(',');
  const clause=`or(student_id.is.null,student_id.not.in.${encodeURIComponent('('+list+')')})`;
  const existing=/([?&])and=([^&]+)/.exec(path);
  return existing ? path.replace(existing[0],`${existing[1]}and=(${existing[2].slice(1,-1)},${clause})`) : path+`&and=(${clause})`;
}
function contentSafeResult(value) {
  const ids=context.getStore();
  if (!ids?.size) return value;
  function clean(item) {
    if(Array.isArray(item)) return item.filter(row=>!(row?.message_type==='chat'&&ids.has(row.student_id))).map(clean);
    if(!item||typeof item!=='object') return item;
    const result=Object.fromEntries(Object.entries(item).map(([k,v])=>[k,clean(v)]));
    if(ids.has(item.student_id)||ids.has(item.id)) {
      for(const key of ['nickname','status_message','display_name']) if(key in result)result[key]=null;
      if('name' in result)result.name='차단한 사용자';
    }
    if(ids.has(item.host_student_id)) {result.name='차단한 사용자의 스터디룸';result.description='';}
    return result;
  }
  return clean(value);
}
async function requestStore(method,path,body,headers={}) {
  const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw fail('content_safety_unavailable',503);
  const response=await fetch(`${url.replace(/\/$/,'')}/rest/v1/${contentSafePath(method,path)}`,{
    method,signal:AbortSignal.timeout(10000),headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body),
  });
  if(!response.ok)throw fail(response.status===409?'already_reported':'content_safety_unavailable',response.status===409?409:503);
  if(response.status===204)return null;
  // PostgREST writes default to return=minimal, including empty 201 responses.
  const text=await response.text();
  return text.trim()?contentSafeResult(JSON.parse(text)):null;
}
module.exports={contentRef,assertAcceptableText,withStudentContentSafety,contentSafePath,contentSafeResult,requestStore,loadContentBlocks,fail};
