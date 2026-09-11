const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
function el(tag,props={},children=[]) {
  return { tag,...props,isConnected:true,disabled:!!props.disabled,children:(Array.isArray(children)?children:[children]).filter(x=>x!=null),
    append(...nodes){this.children.push(...nodes);}, appendChild(n){this.children.push(n);},
    replaceChildren(...nodes){this.children=nodes;},setAttribute(k,v){this[k]=v;},
    addEventListener(k,fn){this[k]=fn;},
    querySelectorAll(selector){const tags=selector.split(',').map(s=>s.trim());return this.children.filter(n=>n&&typeof n==='object').flatMap(n=>[...(tags.includes(n.tag)?[n]:[]),...n.querySelectorAll(selector)]);},
  };
}
function extract(file,name){return fs.readFileSync(file,'utf8').match(new RegExp(`function ${name}\\([^]*?\\n}`))[0];}
function harness(){
  const bot={student_id:'29999701',name:'기존 봇',enabled:true,avatar_tone:'navy',admin_version:0,track:'공채',subjects:['형사법'],preferred_seat:7,start_1:158,end_1:450,start_2:505,end_2:828,start_3:900,end_3:1135};
  const data={bot,wallet:{balance:500},items:[{id:'hair_sport',name:'스포츠 컷',slot:'hair',icon:'✂',price:50,is_active:true},{id:'chair_mint',name:'민트 의자',slot:'chair',icon:'🪑',price:2200,is_active:true}],inventory:[],equipment:[],history:[],actions:[]};
  const context={el,crypto,AbortSignal,teacherAuth:{user:{username:'admin'}},isTeacherAdmin:()=>true,
    button:(label,className,type,click)=>el('button',{label,className,type,click}),
    renderStudyCafeHair:style=>el('i',{hairStyle:style}),
    renderStudyCafeShopCosmetic:()=>el('i',{own:true}),renderStudyCafeDeskCosmetics:()=>el('i',{own:true}),
    getStudyCafeEquippedOutfitClass:()=> 'own-outfit',getStudyCafeEquippedChairClass:()=> 'own-chair',studyCafePreviewState:{hairStyle:'wave'},
    requests:[],async fetch(url,options){const body=JSON.parse(options.body);context.requests.push(body);let result={ok:true};
      if(body.action==='bot_list')result={ok:true,bots:[{...bot,balance:data.wallet.balance,today_seconds:1800,earned_today:5}]};
      else if(body.action==='bot_detail')result={ok:true,...structuredClone(data)};
      else if(context.mutate)result=await context.mutate(body);
      else if(body.action==='bot_purchase'){data.wallet.balance-=50;data.inventory.push('hair_sport');data.equipment=[{item_id:'hair_sport',slot:'hair'}];}
      return {ok:result.ok,status:result.ok?200:409,json:async()=>result};},
  };
  vm.createContext(context);
  vm.runInContext(['renderStudyCafeAvatar','renderStudyCafeSeatedVisual','renderStudyCafeFire','isStudyCafeFireEnabled','renderStudyCafeChairBack','renderStudyCafeWritingArms','getStudyCafePublicEquipmentClass','renderStudyCafePublicCosmetics'].map(n=>extract('app.js',n)).join('\n')+'\n'+fs.readFileSync('study-cafe-bot-admin.js','utf8'),context);
  const hub=context.createStudyCafeBotAdmin();
  const click=async label=>{const node=hub.element.querySelectorAll('button').find(n=>n.label===label);assert(node,`button ${label}`);assert(!node.disabled,`enabled ${label}`);await node.click();};
  return {context,hub,click,data};
}
(async()=>{
  let h=harness();await h.hub.start();await h.click('상점 · 봇 관리');
  const buys=h.hub.element.querySelectorAll('button').filter(n=>n.label==='구매하기');assert.equal(buys[1].disabled,true,'insufficient funds disabled');
  await h.click('구매하기');
  assert(h.hub.element.querySelectorAll('p').some(n=>n.children.includes('500P − 50P = 구매 후 450P')));
  let finish;
  h.context.mutate=()=>new Promise(resolve=>finish=resolve);
  const saving=h.click('구매 후 착용');
  assert(h.hub.element.querySelectorAll('button').every(n=>n.disabled),'all operations blocked while request in flight');
  const node=h.hub.element.querySelectorAll('button').find(n=>n.label==='구매 후 착용');await node.click();
  assert.equal(h.context.requests.filter(r=>r.action==='bot_purchase').length,1,'duplicate click ignored');
  finish({ok:false,error:'request_failed'});await saving;
  h.context.mutate=async()=>({ok:true});await h.click('구매 후 착용');
  const requests=h.context.requests.filter(r=>r.action==='bot_purchase');
  assert.equal(requests[0].requestId,requests[1].requestId,'same request ID retained after uncertain response');
  assert.equal(requests[0].studentId,'29999701');assert.equal(requests[0].payload.equip,true);
  h=harness();await h.hub.start();await h.click('상점 · 봇 관리');await h.click('구매하기');await h.click('구매 후 착용');await h.click('보관함');
  assert(h.hub.element.querySelectorAll('button').some(n=>n.label==='착용 해제'),'purchased item can be unequipped');
  await h.click('운영 설정');
  const inputs=h.hub.element.querySelectorAll('input');
  assert.equal(inputs.find(n=>n.type==='time').value,'06:38','stored 04:00-based schedule displayed in KST');
  const form=h.hub.element.querySelectorAll('form')[0];
  const before=h.context.requests.length;
  inputs.filter(n=>n.type==='time')[1].value='06:00';await form.submit({preventDefault(){}});
  assert.equal(h.context.requests.length,before,'overlapping/reversed schedule blocked');
  h=harness();await h.hub.start();let resolve;
  h.context.fetch=()=>new Promise(r=>resolve=r);
  const stale=h.click('상점 · 봇 관리');h.context.teacherAuth.user.username='other-admin';
  resolve({ok:true,json:async()=>({ok:true,...h.data})});await stale;
  assert.equal(h.hub.element.querySelectorAll('nav').length,0,'late response cannot show another account data');
  h=harness();
  const gear=[{id:'outfit_coast_guard_uniform',slot:'outfit',icon:'👮'},{id:'head_navy_cap',slot:'head',icon:'🧢'},{id:'chair_mint',slot:'chair',icon:'🪑'},{id:'desk_sprout',slot:'desk',icon:'🪴'}];
  const publicScene=h.context.renderStudyCafeSeatedVisual('mint',false,{equipment:gear,hairStyle:'sport'});
  assert(publicScene.className.includes('shop-outfit-coast-guard-uniform'));
  assert(publicScene.querySelectorAll('span').some(n=>n.className?.includes('shop-chair-mint')));
  assert(publicScene.querySelectorAll('span').some(n=>n.className?.includes('item-head-navy-cap')));
  assert(publicScene.querySelectorAll('i').some(n=>n.className?.includes('item-desk-sprout')));
  assert(h.context.renderStudyCafeSeatedVisual('navy',true,{equipment:gear}).className.includes('own-outfit'),'own student equipment unchanged');
  assert(!h.context.renderStudyCafeSeatedVisual('navy',false,{}).className.includes('shop-'),'unaffected students have default appearance');
  console.log('Bot UI: checkout, insufficient funds, duplicate requests, retries, inventory, schedules, account switching and public equipment passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
