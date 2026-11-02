'use strict';
// Cover every enrolled student's request allowance plus 25% execution headroom.
// Round up for predictable operator-facing limits; never lower a configured cap.
function planCapacity({students,requestsPerDay,currentDailyLimit}){
 if(!Number.isSafeInteger(students)||students<0||!Number.isInteger(requestsPerDay)||requestsPerDay<1||requestsPerDay>1000||!Number.isInteger(currentDailyLimit)||currentDailyLimit<1||currentDailyLimit>10000)throw Error('invalid_capacity_settings');
 const requestAllowance=students*requestsPerDay;
 const dailyCallLimit=Math.max(currentDailyLimit,1000,Math.ceil(requestAllowance*1.25/1000)*1000);
 if(dailyCallLimit>10000)throw Error('capacity_exceeds_supported_limit');
 return {students,requestsPerStudentPerDay:requestsPerDay,requestAllowance,dailyCallLimit};
}
module.exports={planCapacity};
