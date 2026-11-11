'use strict';
// Server-owned test scope. Browser flags and submitted question IDs cannot widen it.
const bank=require('./interview-test-question-scope.json');
function questionsFor(mode){return bank.questions.filter(q=>q.modes.includes(mode)).sort((a,b)=>a.order-b.order);}
function allows(mode,q){return questionsFor(mode).some(t=>t.id===q.id&&t.prompt===q.prompt&&t.category===q.category);}
module.exports={questionsFor,allows,version:bank.version};
