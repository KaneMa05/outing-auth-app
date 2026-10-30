import {mountRubrics} from '/interview-rubric-ui.js';
const request=async(action,body={})=>{
 const r=await fetch('/prep-api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...body})});
 const data=await r.json();if(!r.ok||!data.ok)throw Object.assign(Error(data.error),{code:data.error});return data;
};
mountRubrics(document.querySelector('#app'),{request,canWrite:true,initialQuestionId:'qa-ais'});
