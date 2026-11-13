'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('returning interview bookmark keeps the same palette through shared index and does not restore lecture bars',()=>{
 for(const explicitStudent of [false,true]){
  const classes=new Set(),theme={value:'#f3f7fb',getAttribute(){return this.value;},setAttribute(_,v){this.value=v;}},viewport={value:'width=device-width, initial-scale=1',getAttribute(){return this.value;},setAttribute(_,v){this.value=v;}},bar={value:'default',getAttribute(){return this.value;},setAttribute(_,v){this.value=v;}};let imagesAdded=0;
  const saved={settings:{studentAuthId:'20001',studentProfiles:{'20001':{passwordHash:'fixture',deviceToken:'fixture'}}},students:[{id:'20001',studentCategory:'lecture'}]};
  const context={URLSearchParams,navigator:{standalone:true,userAgent:'iPhone'},location:{search:explicitStudent?'?entry=student':''},sessionStorage:{getItem(){}},localStorage:{getItem:key=>key==='outing-interview-web-app'?'1':key==='ronpark_outing_auth_v2'?JSON.stringify(saved):null},window:{matchMedia:()=>({matches:true}),setTimeout(){},clearTimeout(){}},document:{currentScript:{dataset:{startupPage:'student'}},referrer:'',documentElement:{classList:{add:k=>classes.add(k),toggle:(k,on)=>on?classes.add(k):classes.delete(k)}},querySelector:s=>s.includes('theme-color')?theme:s.includes('viewport')?viewport:bar,getElementById:()=>({content:{cloneNode:()=>({})}}),head:{appendChild(){imagesAdded++;}},addEventListener(){}}};
  vm.runInNewContext(fs.readFileSync('app-startup.js','utf8'),context);
  assert.equal(classes.has('interview-stable-startup'),!explicitStudent);assert.equal(classes.has('student-lecture-ios-standalone'),explicitStudent);assert.equal(imagesAdded,explicitStudent?0:1);assert.equal(theme.value,explicitStudent?'#0b2746':'#f2f5f7');assert.equal(bar.value,explicitStudent?'black-translucent':'default');
  // If authentication falls back to the lecture app, its normal theme can still be restored.
  context.window.__studentViewport.update('lecture');assert(classes.has('student-lecture-ios-standalone'));
 }
});
test('startup worker refreshes an existing stale script online and falls back to cached startup while offline',async()=>{
 const handlers={},cached=new Map();let offline=false,fetches=0;const request={method:'GET',url:'https://app.test/app-startup.js?v=old',destination:'script'};cached.set(request.url,new Response('old cached startup'));
 vm.runInNewContext(fs.readFileSync('sw.js','utf8'),{URL,self:{location:{origin:'https://app.test'},addEventListener:(n,f)=>handlers[n]=f},caches:{match:async r=>cached.get(r.url),open:async()=>({put:async(r,response)=>cached.set(r.url,response)})},fetch:async(r,options)=>{fetches++;assert.equal(options.cache,'no-cache');if(offline)throw Error('offline');return new Response('fresh startup');}});
 let response;handlers.fetch({request,respondWith:p=>response=p});assert.equal(await(await response).text(),'fresh startup');assert.equal(fetches,1);
 offline=true;handlers.fetch({request,respondWith:p=>response=p});assert.equal(await(await response).text(),'fresh startup');assert.equal(fetches,2);
 let intercepted=false;handlers.fetch({request:{...request,url:'https://app.test/api/interview-auth'},respondWith:()=>{intercepted=true;}});assert.equal(intercepted,false);
});
test('both PWA entry documents use fresh startup files and interview launch images are valid PNG resources',()=>{
 for(const file of ['index.html','interview.html']){const html=fs.readFileSync(file,'utf8');for(const ext of ['css','js'])assert(html.includes('app-startup.'+ext+'?v=20261113-pwa-cold-start'));}
 const html=fs.readFileSync('interview.html','utf8'),links=[...html.matchAll(/rel="apple-touch-startup-image" href="([^\"]+)" media="([^\"]+)"/g)];assert.equal(links.length,24);
 for(const [,url,media]of links){const image=fs.readFileSync('.'+url);assert.equal(image.subarray(1,4).toString(),'PNG');const dimensions=url.match(/(\d+)x(\d+)\.png/);assert.equal(image.readUInt32BE(16),Number(dimensions[1]));assert.equal(image.readUInt32BE(20),Number(dimensions[2]));assert(media.includes('orientation:'));}
 assert(fs.readFileSync('index.html','utf8').includes('<template id="interview-startup-images">'));
});
