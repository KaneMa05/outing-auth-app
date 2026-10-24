const assert=require('node:assert/strict');
module.exports=async({db,invoke,admin,newStudentId,ev,wait,click,fill,submit,screenshot})=>{
 const rows=(await invoke('writing_list',{type:'student',id:'18120'})).writings;
 await invoke('writing_save',{type:'student',id:'18120'},{
  kind:'public_service',itemId:'',revision:rows.find(w=>w.kind==='public_service')?.revision||0,status:'draft',
  text:'공익을 위한 판단입니다.\n<img src=x onerror="window.__reviewXss=true">학생 원문은 텍스트로만 표시합니다.'
 });
 for(let i=0;i<31;i++){
  const id='review-page-'+String(i).padStart(2,'0');
  await db.query("insert into ip_owners(id,name) values($1,$2)",[id,'목록 테스트 '+i]);
  await db.query("insert into ip_members(student_id,track,exam_number) values($1,'공채',$1)",[id]);
 }
 await click('[data-interview-section=review]');
 await wait("document.querySelectorAll('[data-review-student]').length===30");
 assert.equal(await ev("document.querySelector('#app h2').textContent"),'수강생 작성 내용');
 await screenshot('admin-review-list-desktop',1200);
 await click('[data-review-action=next]');await wait("document.querySelectorAll('[data-review-student]').length===3");
 await click('[data-review-action=prev]');await wait("document.querySelectorAll('[data-review-student]').length===30");
 await fill('search','2026-001');await submit('[data-review-filter]');
 await wait("document.querySelectorAll('[data-review-student]').length===1");
 await click('[data-review-action=student]');await wait("!!document.querySelector('.ip-review-reader')");
 await click('[data-review-action=expand]');
 assert((await ev("document.querySelector('[data-review-records]').textContent")).includes('전공'));
 assert((await ev("document.querySelector('[data-review-records]').textContent")).includes('공익을 위한 판단'));
 assert.equal(await ev("document.querySelectorAll('[data-review-records] img').length"),0);
 assert.equal(await ev("window.__reviewXss===true"),false);
 assert.equal(await ev("document.querySelectorAll('.ip-review [data-write],.ip-review textarea').length"),0);
 await screenshot('admin-review-detail-desktop',1200);
 await click('[data-review-action=area][data-area=public_service]');await click('[data-review-action=expand]');
 await ev("document.querySelector('.ip-review-reader').scrollIntoView({block:'start',behavior:'instant'})");
 await screenshot('admin-review-answer-mobile',390);
 assert((await ev("document.querySelector('[data-review-records]').textContent")).includes('제출 후 수정한 내용'));
 const current=(await invoke('writing_list',{type:'student',id:'18120'})).writings.find(w=>w.kind==='public_service');
 await click('[data-review-action=feedback]');await wait("!!document.querySelector('[data-writing-feedback]')");
 assert.equal(await ev("document.querySelector('[data-review-writing] .ip-writing-text').textContent"),current.submitted_body,'Teacher reads submitted snapshot, not later edits');
 await ev("document.querySelector('[data-writing-feedback]').value='제출 답변의 실천 방법을 조금 더 구체적으로 작성해주세요.';document.querySelector('[data-writing-feedback]').dispatchEvent(new Event('input',{bubbles:true}))");
 await ev("document.querySelector('[data-writing-review]').value='needs_revision';document.querySelector('[data-writing-review]').dispatchEvent(new Event('change',{bubbles:true}))");
 await click('[data-writing-save=feedback]');await wait("document.querySelector('[data-writing-message]').textContent==='피드백을 저장했습니다.'");
 const reviewed=(await invoke('writing_list',{type:'student',id:'18120'})).writings.find(w=>w.kind==='public_service');
 assert.equal(reviewed.body,current.body);assert.equal(reviewed.submission_status,'needs_revision');
 assert.equal(reviewed.feedback_revision,current.submitted_revision);
 assert.equal(reviewed.submission_round,current.submission_round,'Editing feedback stays in the same round');
 await click('[data-review-writing] .ip-writing-history>summary');
 await wait("!!document.querySelector('[data-review-writing] .ip-writing-round')");
 assert((await ev("document.querySelector('[data-review-writing] .ip-writing-round').textContent")).includes('1차 교사 피드백'));
 await screenshot('admin-submission-feedback-mobile',390);
 await click('[data-review-action=close-feedback]');await click('[data-review-action=expand]');
 assert((await ev("document.querySelector('[data-review-records]').textContent")).includes('실천 방법'));
 await click('[data-review-rounds] .ip-writing-history>summary');
 await wait("!!document.querySelector('[data-review-rounds] .ip-writing-round')");
 assert((await ev("document.querySelector('[data-review-rounds] .ip-writing-round').textContent")).includes('실천 방법'));
 await click('[data-review-action=area][data-area=db]');await click('[data-review-action=expand]');
 assert((await ev("document.querySelector('[data-review-records]').textContent")).includes('전공'));
 await fill('search',newStudentId);await submit('[data-review-filter]');
 await wait("document.querySelectorAll('[data-review-student]').length===1 && !document.querySelector('.ip-review-reader')");
 await click('[data-review-action=student]');await wait("!!document.querySelector('.ip-review-reader')");await click('[data-review-action=expand]');
 const newText=await ev("document.querySelector('[data-review-records]').textContent");
 assert(newText.includes('신규 계정에만 저장'));assert(!newText.includes('공익을 위한 판단'));
 await fill('search','not-found-review');await submit('[data-review-filter]');await wait("document.querySelector('[data-review-roster]').textContent.includes('검색 조건에 맞는 수강생이 없습니다')");
 await click('[data-review-action=reset]');await wait("document.querySelectorAll('[data-review-student]').length===30");
 await ev("document.querySelector('[data-review-filter] [name=status]').value='empty'");
 await submit('[data-review-filter]');await wait("document.querySelector('[data-review-roster]').textContent.includes('31')");
 assert.equal(await ev("document.querySelector('[data-review-student=\"18120\"]')===null"),true);
 await screenshot('admin-review-list-mobile',390);
 console.log('PASS review browser: pagination/search/filter, all student records, drafts, public-service answers, new-account isolation, XSS escaping, read-only controls, desktop/mobile layout.');
};
