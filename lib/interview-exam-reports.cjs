'use strict';
const {digest}=require('./interview-exam-scoring');
function createReportRepository({invoke}) {
 return {
  async reserve(actor,{id,questionId,questionRevision,rubricRevision,audioHash}){
   const snapshot={questionId,questionRevision,rubricRevision,audioHash};
   return invoke('reserve',actor,{id,...snapshot,requestHash:digest(snapshot)});
  },
  complete:(actor,id,report)=>invoke('complete',actor,{id,report}),
  fail:(actor,id)=>invoke('fail',actor,{id}),
  get:(actor,id)=>invoke('get',actor,{id}),
  list:(actor,{questionId,page=0})=>invoke('list',actor,{questionId,page})
 };
}
module.exports={createReportRepository};
