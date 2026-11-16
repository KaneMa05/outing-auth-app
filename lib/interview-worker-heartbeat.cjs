'use strict';
async function withHeartbeat(run,heartbeat,onUnavailable=()=>{},{schedule=setInterval,cancel=clearInterval}={}){
 let busy=false,stopped=false;
 const timer=schedule(async()=>{
  if(busy||stopped)return;
  busy=true;
  try{await heartbeat();}catch{if(!stopped)onUnavailable();}finally{busy=false;}
 },15000);
 timer?.unref?.();
 try{return await run();}finally{stopped=true;cancel(timer);}
}
module.exports={withHeartbeat};
