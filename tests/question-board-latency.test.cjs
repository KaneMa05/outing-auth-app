const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

test('opening a home-preview post never starts a second list request or replaces the loaded detail with a spinner',async()=>{
 let listLoads=0;
 const box={getAuthedStudent:()=>({id:'viewer'}),getStudentCategory:()=> 'lecture',currentRoute:'question-board',scrollAppToTop(){}};
 vm.createContext(box);vm.runInContext(fs.readFileSync('question-board.js','utf8'),box);
 vm.runInContext(`
   resetQuestionBoardState('viewer');
   syncQuestionWriteButton=()=>{};
   renderQuestionPostDetail=()=>questionBoardState.loading?'spinner':'detail';
   renderQuestionPostList=()=> 'list';
 `,box);
 box.loadQuestionBoardHome=()=>{listLoads++;vm.runInContext('questionBoardState.loading=true',box);};
 box.render=()=>box.renderQuestionBoard();
 box.requestQuestionBoard=async(action)=>{assert.equal(action,'detail');return{post:{id:'post'},comments:[]};};
 await box.openQuestionPost('post');
 assert.equal(listLoads,0);
 assert.equal(box.renderQuestionBoard(),'detail');
 vm.runInContext('questionBoardState.mode="list"',box);
 assert.equal(box.renderQuestionBoard(),'list');assert.equal(listLoads,1,'first list visit must still load its data');
});

test('post attachments are signed while comments load, with block filtering and hidden-post access preserved',async()=>{
 const handler=require('../api/question-board');
 const saved={fetch:global.fetch,url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY,flag:process.env.STUDENT_CONTENT_SAFETY_ENABLED,error:console.error};
 const postId='550e8400-e29b-41d4-a716-446655440000';
 let hidden=false,signCalls=0,releaseComments,timer;
 try{
  process.env.SUPABASE_URL='https://safety-test.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='test-only-key';process.env.STUDENT_CONTENT_SAFETY_ENABLED='true';console.error=()=>{};
  global.fetch=async(url)=>{
   const u=new URL(url),path=u.pathname;
   if(path.endsWith('/validate_student_device'))return Response.json({valid:true});
   if(path.endsWith('/students'))return Response.json([{id:'viewer',name:'본인',student_category:'lecture'}]);
   if(path.endsWith('/student_content_blocks'))return Response.json([{blocked_student_id:'blocked'}]);
   if(path.endsWith('/increment_question_view_count'))return new Response(null,{status:204});
   if(path.endsWith('/question_posts')){
    assert.match(decodeURIComponent(url),/student_id\.not\.in\.\("blocked"\)/);
    return Response.json([{id:postId,student_id:'author',board_type:'subject',title:'test',body:'test',image_paths:['author/image.jpg'],is_hidden:hidden}]);
   }
   if(path.endsWith('/question_comments')){
    assert.match(decodeURIComponent(url),/student_id\.not\.in\.\("blocked"\)/);
    return new Promise(resolve=>{releaseComments=()=>resolve(Response.json([]));});
   }
   if(path.endsWith('/study_cafe_profiles'))return Response.json([]);
   if(path.includes('/storage/v1/object/sign/')){
    signCalls++;assert.ok(releaseComments,'comment fetch must already be running');releaseComments();
    return Response.json({signedURL:'/object/sign/test?token=fake'});
   }
   assert.fail('Unexpected HTTP request');
  };
  const invoke=async()=>{const res={setHeader(){},status(code){this.code=code;return this;},json(data){this.data=data;return this;}};await handler({method:'POST',body:{action:'detail',studentId:'viewer',deviceToken:'test-token',postId}},res);return res;};
  const res=await Promise.race([invoke(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('image signing waited for comments instead of running concurrently')),1000);})]);
  clearTimeout(timer);assert.equal(res.code,200);assert.equal(res.data.post.images.length,1);assert.equal(signCalls,1);
  hidden=true;const denied=await invoke();assert.equal(denied.code,404);assert.equal(signCalls,1,'hidden posts must never have image URLs signed');
 }finally{
  clearTimeout(timer);global.fetch=saved.fetch;console.error=saved.error;
  for(const [name,value] of [['SUPABASE_URL',saved.url],['SUPABASE_SERVICE_ROLE_KEY',saved.key],['STUDENT_CONTENT_SAFETY_ENABLED',saved.flag]])if(value===undefined)delete process.env[name];else process.env[name]=value;
 }
});

test('only the board and safety endpoints gain database-local regions',()=>{
 const config=JSON.parse(fs.readFileSync('vercel.json','utf8'));
 assert.deepEqual(config.functions['api/question-board.js'],{regions:['syd1']});
 assert.deepEqual(config.functions['api/student-content-safety.js'],{regions:['syd1']});
 assert.equal(config.regions,undefined);
});
