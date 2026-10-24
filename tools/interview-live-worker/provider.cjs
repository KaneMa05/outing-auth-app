'use strict';
const provider=require('../../lib/interview-live-provider');
module.exports={createProvider:options=>provider.createProvider({WebSocket:require('ws'),...options})};
