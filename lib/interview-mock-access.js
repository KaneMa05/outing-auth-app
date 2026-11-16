'use strict';
async function requireMockAccess(studentId) {
 const {requestSupabase}=require('../api/curriculum')._private;
 const data=await requestSupabase('POST','rpc/ip_mock_access_service',{
  p_action:'mock_status',p_actor:{type:'student',id:studentId},p_body:{}
 });
 if(data?.allowed!==true)throw Object.assign(Error('forbidden'),{status:403});
}
module.exports={requireMockAccess};
