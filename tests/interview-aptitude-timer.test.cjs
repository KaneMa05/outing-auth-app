const {test}=require('node:test');
const assert=require('node:assert/strict');
const load=()=>import('../client/interview-aptitude-timer.mjs');
function memory(){const data=new Map();return {data,getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};}

test('section limits match the papers and countdowns keep fractional seconds through pauses',async()=>{
 const {APTITUDE_MINUTES,createAptitudeTimer,formatAptitudeTime}=await load();let now=1000000;
 assert.deepEqual(APTITUDE_MINUTES.half,[8,10,5,8,15]);assert.deepEqual(APTITUDE_MINUTES.full,[15,20,10,15,30]);
 const timer=createAptitudeTimer({now:()=>now});timer.start();now+=1250;
 assert.equal(formatAptitudeTime(timer.snapshot().remainingMs),'07:59');
 timer.pause();now+=50000;assert.equal(timer.snapshot().remainingMs,478750);
 timer.start();now+=478749;assert.equal(formatAptitudeTime(timer.snapshot().remainingMs),'00:01');
 now++;assert.equal(timer.snapshot().status,'finished');assert.equal(formatAptitudeTime(timer.snapshot().remainingMs),'00:00');
 assert.equal(timer.snapshot().section,0);timer.select('full',4);assert.equal(formatAptitudeTime(timer.snapshot().remainingMs),'30:00');
});

test('reload and long background suspension use the original deadline',async()=>{
 const {createAptitudeTimer}=await load(),storage=memory();let now=1000000;
 const options={storage,storageKey:'account-a',now:()=>now};createAptitudeTimer(options).start();now+=61000;
 const restored=createAptitudeTimer(options);assert.equal(restored.snapshot().remainingMs,419000);
 now+=3600000;assert.equal(restored.snapshot().status,'finished');
 assert.equal(JSON.parse(storage.getItem('account-a')).status,'finished');
 restored.reset();assert.equal(restored.snapshot().remainingMs,480000);assert.equal(restored.snapshot().status,'idle');
});

test('another tab can pause or reset a timer without an older tab overwriting it',async()=>{
 const {createAptitudeTimer}=await load(),storage=memory();let now=1000000;
 const options={storage,storageKey:'account-a',now:()=>now},first=createAptitudeTimer(options),second=createAptitudeTimer(options);
 first.start();now+=20000;assert.equal(second.snapshot().remainingMs,460000);second.pause();
 now+=600000;assert.equal(first.snapshot().status,'paused');assert.equal(first.snapshot().remainingMs,460000);
 second.select('full',1);second.start();assert.equal(first.snapshot().kind,'full');assert.equal(first.snapshot().remainingMs,1200000);
 first.reset();assert.equal(second.snapshot().status,'idle');
});

test('account storage is isolated and invalid saved values are rejected',async()=>{
 const {createAptitudeTimer}=await load(),storage=memory(),now=()=>1000000;
 createAptitudeTimer({storage,storageKey:'account-a',now}).start();
 assert.equal(createAptitudeTimer({storage,storageKey:'account-b',now}).snapshot().status,'idle');
 for(const raw of ['bad json','null',JSON.stringify({version:1,kind:'half',section:99}),JSON.stringify({version:1,kind:'half',section:0,status:'running',remainingMs:480000,endAt:9999999999999})]){
  storage.setItem('account-b',raw);const timer=createAptitudeTimer({storage,storageKey:'account-b',now});assert.equal(timer.snapshot().status,'idle');assert.equal(timer.snapshot().remainingMs,480000);
 }
 assert.throws(()=>createAptitudeTimer().select('other',0),/invalid_timer_selection/);
});

test('storage failure keeps the live clock usable and reports lost persistence',async()=>{
 const {createAptitudeTimer}=await load();let now=1000000;
 const timer=createAptitudeTimer({storageKey:'account-a',now:()=>now,storage:{getItem(){throw Error('blocked');},setItem(){throw Error('quota');}}});
 timer.start();now+=1000;assert.equal(timer.snapshot().remainingMs,479000);assert.equal(timer.snapshot().persistent,false);
 timer.pause();now+=10000;assert.equal(timer.snapshot().remainingMs,479000);
});
