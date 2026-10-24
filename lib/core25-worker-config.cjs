'use strict';
const {VERSION}=require('./preassignment-diagnosis.cjs');
// Keep model/effort and the cache identity identical on the PC and server.
const MODEL='gpt-6-astra', EFFORT='high';
const ENGINE_VERSION=VERSION+':pc-v1:'+MODEL+':'+EFFORT;
module.exports={MODEL,EFFORT,ENGINE_VERSION};
