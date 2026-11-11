'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{randomUUID}=require('node:crypto');
const {createHandler}=require('../api/interview-live');
const usage={confirmedUsd:0.2,estimatedUsd:0,unconfirmedEvents:0,fullyConfirmed:true,totalUsd:0.2,events:[{kind:'voice',model:'gpt-live-1',usage:{seconds:240},usd:0.2,status:'reported'}]};
test('student record API omits cost and never reads the ledger; only admin_get includes it',async()=>{
 let reads=0;
 const handler=createHandler({config:{enabled:true,transport:'vercel'},authenticateWeb:async()=>({id:'student'}),authenticateAdmin:async()=>({id:'admin'}),requireMockAccess:async()=>{},invoke:async()=>({ok:true,run:{state:'completed'},usage:{shouldBeRemoved:true}}),usage:async actor=>{reads++;assert.equal(actor.type,'admin');return usage;}});
 async function call(action){let status,data;await handler({method:'POST',headers:{host:'localhost',origin:'http://localhost'},body:{action,runId:randomUUID()}},{setHeader(){},status(n){status=n;return this;},json(v){data=v;}});assert.equal(status,200);return data;}
 assert.equal((await call('get')).usage,undefined);assert.equal(reads,0);
 assert.equal((await call('admin_get')).usage.calculatedTotalUsd,0.2);assert.equal(reads,1);
});
function element(){const nodes=new Map(),listeners=new Map();return {nodes,listeners,innerHTML:'',disabled:false,isConnected:true,dataset:{},hasAttribute(){return false;},closest(){return this;},querySelector(key){if(!nodes.has(key))nodes.set(key,element());return nodes.get(key);},addEventListener(k,v){listeners.set(k,v);},removeEventListener(k){listeners.delete(k);},replaceChildren(){this.innerHTML='';}};}
function moduleContext(){const context={};vm.createContext(context);vm.runInContext(fs.readFileSync('interview-live-ui.js','utf8').replace(/^export \{mountLive\}.*$/m,'').replaceAll('export async function','async function').replaceAll('export function','function'),context);return context;}
for(const admin of [true,false])test('history renders usage only for administrator (admin='+admin+')',async()=>{
 const context=moduleContext(),host=element(),button=element();button.dataset.liveRecord='run';const calls=[];
 await context.mountLiveHistory(host,{admin,request:async action=>{calls.push(action);return action.endsWith('list')?{runs:[],hasMore:false}:{run:{state:'completed',turns:[],retain_until:'2027-01-01'},usage};}});
 await host.listeners.get('click')({target:button});
 const html=host.querySelector('[data-live-detail]').innerHTML;
 assert.equal(html.includes('data-live-admin-usage'),admin);assert.equal(calls.at(-1),admin?'admin_get':'get');
 if(admin){assert.match(html,/gpt-live-1/);assert.match(html,/240/);assert.match(html,/\$0.200000/);}
});
test('administrator usage renderer escapes provider labels and preserves unknown amounts',()=>{
 const context=moduleContext(),html=context.renderLiveUsage({events:[{kind:'backend',model:'<img src=x>',usage:{},usd:null,status:'unconfirmed'}]});
 assert(!html.includes('<img'));assert(html.includes('&lt;img'));assert(html.includes('미확정'));
});
