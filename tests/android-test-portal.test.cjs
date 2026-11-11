'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync('native/android/interview/src/debug/assets/interview-test-portal.js','utf8');
function setup({origin='https://outing-auth-app.vercel.app',frame=false}={}){
 const calls=[],messages=[];
 const context={URL,Request,Headers,navigator:{},location:{origin,href:origin+'/interview?app=1'},ronparkTestBridge:{postMessage:x=>messages.push(JSON.parse(x))}};
 context.window=context;context.top=frame?{}:context;context.fetch=async(...args)=>{calls.push(args);return {ok:true};};vm.runInNewContext(source,context);return {context,calls,messages};
}
test('test headers accompany only same-origin interview API requests and retain Request properties',async()=>{
 const {context,calls}=setup();const request=new Request('https://outing-auth-app.vercel.app/api/interview-native',{method:'POST',headers:{Authorization:'Bearer fixture'},body:'{"action":"launch"}'});
 await context.fetch(request);assert.equal(calls[0][0],request);assert.equal(calls[0][1].headers.get('X-Interview-Test-App'),'1');assert.equal(calls[0][1].headers.get('Authorization'),'Bearer fixture');assert.equal(await request.text(),'{"action":"launch"}');
 await context.fetch('/api/other');await context.fetch('https://external.test/api/interview-native');assert.equal(calls[1][1].headers,undefined);assert.equal(calls[2][1].headers,undefined);
});
test('native test capability is absent on other origins and child frames',()=>{
 for(const config of [{origin:'https://external.test'},{origin:'https://kauth.kakao.com'},{origin:'https://accounts.kakao.com'},{frame:true}]){const {context}=setup(config);assert.equal(context.__ronparkMockTestApp,undefined);assert.equal(context.webkit,undefined);}
});
test('authenticated portal emits the same native live and practice payloads as iPhone',()=>{
 const {context,messages}=setup();assert.equal(context.__ronparkMockTestApp,true);assert.equal(context.__ronparkOpenAIPractice,true);assert.equal(context.__ronparkPracticeNative,true);assert.equal(context.navigator.standalone,true);
 context.webkit.messageHandlers.interviewNative.postMessage({code:'fixture'});context.webkit.messageHandlers.interviewPractice.postMessage({mode:'job'});
 assert.deepEqual(messages,[{kind:'live',body:{code:'fixture'}},{kind:'practice',body:{mode:'job'}}]);
});
