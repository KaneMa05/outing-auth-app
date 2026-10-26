// Only an explicit request spends inference usage. Cache hits are free of model calls.
export function createDraftQuestions({request,show,pollMs=2000}){
 const states=new Map(),cache=new Map();let dead=false;
 const publish=(id,s,qs,message,ready=false)=>{Object.assign(s,{questions:qs,message,ready});if(!dead&&states.get(id)===s)show(id,qs,message,ready);};
 function update(id,experience){
  const signature=JSON.stringify(experience);let s=states.get(id);
  if(s?.signature===signature){show(id,s.questions||[],s.message||'',!!s.ready);return;}
  if(s)clearTimeout(s.timer);
  s={signature,experience};states.set(id,s);
  if(experience.content.replace(/^질문:.*$/gm,'').replace(/\s/g,'').length<10){publish(id,s,[],'');return;}
  if(cache.has(signature)){publish(id,s,cache.get(signature),'답변을 적은 뒤 저장해주세요.');return;}
  publish(id,s,[],'작성한 내용을 바탕으로 질문 2개를 받을 수 있습니다.',true);
 }
 async function generate(id){
  const s=states.get(id);if(dead||!s?.ready||s.busy)return;
  s.busy=true;publish(id,s,[],'내용에 맞는 질문 2개를 준비하고 있습니다…');
  const current=()=>!dead&&states.get(id)===s;
  let tries=0;
  const accept=async(result)=>{
   if(!current())return;
   if(result.state==='queued'||result.state==='running'){
    if(++tries>100)throw Error('questions_unavailable');
    s.timer=setTimeout(async()=>{try{await accept(await request('draft_status',{id:result.id}));}catch(e){failed(e);}},pollMs);return;
   }
   if(result.state==='failed'||!Array.isArray(result.questions)||result.questions.length!==2||result.questions.some(q=>typeof q!=='string'))throw Error('invalid_output');
   cache.set(s.signature,result.questions);s.busy=false;publish(id,s,result.questions,'답변을 적은 뒤 저장해주세요.');
  };
  const failed=e=>{if(!current())return;s.busy=false;const message={daily_limit:'오늘 질문 생성 한도(10회)에 도달했습니다.',questions_unavailable:'질문 생성기가 연결되지 않았습니다. 잠시 후 다시 시도해주세요.',admission_busy:'앞서 요청한 질문을 준비 중입니다. 잠시 후 다시 시도해주세요.',queue_full:'질문 요청이 많습니다. 잠시 후 다시 시도해주세요.'}[e.code||e.message]||'질문을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.';publish(id,s,[],message+' 내용 작성과 저장은 계속할 수 있습니다.',true);};
  try{if(!request)throw Error('questions_unavailable');await accept(await request('draft_questions',{experience:s.experience}));}catch(e){failed(e);}
 }
 return {update,generate,destroy(){dead=true;for(const s of states.values())clearTimeout(s.timer);states.clear();cache.clear();}};
}
