'use strict';
const fs=require('node:fs');
const {createDb}=require('./interview-db.cjs');
const migration='supabase/migrations/20261030071418_interview_question_publication_approval.sql';
const admin={type:'admin',id:'publication-qa'},student={type:'student',id:'ip-a'};
async function createPublicationFixture(){
 const {db,invoke:base}=await createDb();
 await db.exec(fs.readFileSync(migration,'utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261031054439_interview_optional_personality_topics.sql','utf8'));
 const invoke=async(action,actor,body={})=>action==='admin_question_publication'
  ?(await db.query('select public.ip_question_publication_service($1,$2::jsonb,$3::jsonb) result',[action,JSON.stringify(actor),JSON.stringify(body)])).rows[0].result
  :base(action,actor,body);
 await invoke('admin_member_save',admin,{targetStudentId:'ip-a',track:'공채',examNumber:'publication-qa',enabled:true,expiresOn:'2099-01-01'});
 await invoke('admin_enabled',admin,{enabled:true});
 await db.exec(`insert into ip_questions(id,prompt,category,topic_ids,tracks,status) values
 ('publication-personality','팀원과 협업했던 경험을 말해주세요.','personality',array['teamwork'],array['공채'],'draft'),
 ('publication-job','안전속력의 판단 기준을 설명해주세요.','job','{}',array['공채'],'draft'),
 ('publication-existing','이미 검토하여 공개한 질문입니다.','personality',array['self'],array['공채'],'published'),
 ('publication-archived','보관 중인 질문입니다.','job','{}','{}','archived');
 insert into ip_collections(id,title,description) values('core-personality-30','핵심인성 30제','공개 승인 테스트 자료');
 insert into ip_collection_items(collection_id,question_id,kind,position,analysis_note)
 values('core-personality-30','publication-personality','main',1,'협업 경험의 역할과 행동을 확인합니다.');`);
 return {db,invoke,admin,student,migration,question:async id=>(await invoke('admin_question_detail',admin,{id})).question,
  publication:(id,revision,approved,actor=admin)=>invoke('admin_question_publication',actor,{id,revision,approved})};
}
module.exports={createPublicationFixture,migration};
