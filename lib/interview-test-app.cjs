'use strict';
// Routing marker only: login, enrollment and mock_test_enabled are still mandatory.
function testAppFields(req){return req.headers?.['x-interview-test-app']==='1'?{testApp:true}:{};}
module.exports={testAppFields};
