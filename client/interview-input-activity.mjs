// Silence advances an answer only after sustained microphone input is observed.
// This checks input level, not speech recognition or answer quality.
export function createInputActivity({startedAt=Date.now(),silenceMs=4000,warningMs=8000,threshold=.008,minimumInputMs=300}={}){
 let previous=startedAt,continuous=0,confirmed=false,lastInput=startedAt;
 return {
  sample(now,level,available=true){
   const elapsed=Math.max(0,Math.min(200,now-previous));previous=now;
   if(available&&Number.isFinite(level)&&level>=threshold){continuous+=elapsed;lastInput=now;if(continuous>=minimumInputMs)confirmed=true;}
   else continuous=0;
   return {confirmed,advance:available&&confirmed&&now-lastInput>=silenceMs,warning:!confirmed&&now-startedAt>=warningMs};
  },
  resume(now){previous=now;continuous=0;if(confirmed)lastInput=now;}
 };
}
