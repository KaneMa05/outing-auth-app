import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createInputActivity} from '../client/interview-input-activity.mjs';
function feed(activity,until,level,from=100,available=true){let state;for(let now=from;now<=until;now+=100)state=activity.sample(now,typeof level==='function'?level(now):level,available);return state;}
test('silent and near-silent input never completes an answer after four seconds',()=>{
 for(const level of [0,.000158,.000088,.000022]){const activity=createInputActivity({startedAt:0});const state=feed(activity,12000,level);assert.equal(state.advance,false);assert.equal(state.confirmed,false);assert.equal(state.warning,true);}
});
test('a short tap does not count as the beginning of an answer',()=>{
 const state=feed(createInputActivity({startedAt:0}),10000,now=>now===500?.05:0);assert.equal(state.confirmed,false);assert.equal(state.advance,false);
});
test('sustained input starts the four-second silence timer; renewed input resets it',()=>{
 const activity=createInputActivity({startedAt:0});assert.equal(feed(activity,500,.02).confirmed,true);assert.equal(feed(activity,4400,0,600).advance,false);assert.equal(activity.sample(4500,0).advance,true);
 assert.equal(activity.sample(4600,.03).advance,false);assert.equal(feed(activity,8500,0,4700).advance,false);assert.equal(activity.sample(8600,0).advance,true);
});
test('suspended or unavailable input cannot trigger completion',()=>{
 const activity=createInputActivity({startedAt:0});feed(activity,500,.02);assert.equal(feed(activity,10000,0,600,false).advance,false);
});
test('question replay time does not count toward the silence deadline',()=>{
 const activity=createInputActivity({startedAt:0});feed(activity,500,.02);activity.resume(10000);assert.equal(feed(activity,13900,0,10100).advance,false);assert.equal(activity.sample(14000,0).advance,true);
});
test('a delayed timer tick cannot count as sustained microphone input',()=>{
 const activity=createInputActivity({startedAt:0});assert.equal(activity.sample(8000,.1).confirmed,false);assert.equal(activity.sample(8100,0).confirmed,false);
});
