'use strict';
const server=require('node:http').createServer((_req,res)=>{res.writeHead(426,{'Cache-Control':'no-store'});res.end();});
require('../lib/interview-live-socket').attach(server,{waitUntil:require('@vercel/functions').waitUntil});
module.exports=server;
