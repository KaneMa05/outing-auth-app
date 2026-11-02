const categories=['job','personality'];

export function indexQuestionAudioCatalog(data){
  if(data?.version!==1||!Array.isArray(data.clips))throw Error('invalid_audio_catalog');
  return new Map(data.clips.filter(clip=>
    /^q-[a-f0-9]+$/.test(clip.id)&&typeof clip.prompt==='string'&&
    new RegExp('^'+clip.id+'-[a-f0-9]{16}\\.mp3$').test(clip.file)
  ).map(clip=>[clip.id,clip]));
}

// The question ID and exact text retain their recording after reclassification.
export function resolveQuestionAudio(question,catalogs){
  if(!categories.includes(question.category))return {state:'missing'};
  const ordered=[question.category,...categories.filter(category=>category!==question.category)];
  for(const category of ordered){
    const clip=catalogs[category]?.get(question.id);
    if(clip?.prompt===question.prompt)return {
      state:'matched',clip,category,url:'./assets/interview-'+category+'-audio/'+clip.file
    };
  }
  if(ordered.some(category=>catalogs[category]?.has(question.id)))return {state:'stale'};
  return {state:catalogs[question.category]?'missing':'unavailable'};
}
