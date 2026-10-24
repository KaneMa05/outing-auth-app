'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
(async()=>{
 const source=fs.readFileSync('client/interview-live-client.js','utf8').replace('export async function connectLive','async function connectLive')+'\nglobalThis.connectLive=connectLive;';
 let micStops=0,peerCloses=0,peer,failures=0;const sent=[],calls=[];
 class Peer{constructor(){peer=this;this.iceGatheringState='complete';this.connectionState='new';}addTrack(){}createDataChannel(name){assert.equal(name,'oai-events');return this.channel={readyState:'open',send:e=>sent.push(JSON.parse(e)),close(){}};}async createOffer(){return {type:'offer',sdp:'v=0 test'};}async setLocalDescription(d){this.localDescription=d;}async setRemoteDescription(d){assert.equal(d.type,'answer');this.channel.onmessage({data:JSON.stringify({type:'session.started'})});}close(){peerCloses++;}}
 const context={console,setTimeout,clearTimeout,crypto:require('node:crypto').webcrypto,Date,AbortController};vm.createContext(context);vm.runInContext(source,context);
 const track={enabled:true,stop(){micStops++;}},mediaDevices={getUserMedia:async()=>({getTracks:()=>[track],getAudioTracks:()=>[track]})},audio={pause(){},srcObject:null,play:async()=>{}};
 const request=async(action,payload)=>{calls.push({action,payload});if(action==='start')return {runId:'run',sdp:'answer',deadline:new Date(Date.now()+60000).toISOString(),question:'질문'};return {ok:true};};
 const c=await context.connectLive({request,audio,onEvent(){},onFailure(){failures++;},mediaDevices,Peer});
 assert.deepEqual(calls.map(c=>c.action),['start','begin']);assert.equal(sent.length,0);
 c.setMuted(true);assert.equal(track.enabled,false);c.setMuted(false);assert.equal(track.enabled,true);
 await c.stop();assert(micStops>=1);assert(peerCloses>=1);assert.equal(sent[0].type,'session.close');assert.equal(calls.at(-1).action,'finish');assert.equal(failures,0);
 const aborted=new AbortController();aborted.abort();const before=calls.length;
 await assert.rejects(context.connectLive({request,audio,onEvent(){},onFailure(){},signal:aborted.signal,mediaDevices,Peer}),/cancelled/);assert.equal(calls.length,before);
 await assert.rejects(context.connectLive({request:async()=>{throw Error('offline');},audio,onEvent(){},onFailure(){},mediaDevices,Peer}),/offline/);assert(micStops>=3);
 console.log('PASS WebRTC startup order, server-only commands, microphone cleanup, cancellation and failure cleanup.');
})().catch(e=>{console.error(e);process.exitCode=1;});
