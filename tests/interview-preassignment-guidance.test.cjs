const assert=require('node:assert/strict');
const {setup}=require('./interview-preassignments.test.cjs');
(async()=>{
 const {db,call,admin,a}=await setup({withDiagnosis:false});
 try{
  const listing=await call('admin_guidance_list',admin);assert.equal(listing.guidelines.length,26);assert(listing.guidelines.every(g=>!g.has_instructions));
  for(const action of ['admin_guidance_list','admin_guidance_detail','admin_guidance_save','admin_guidance_history'])await assert.rejects(call(action,a,{unitId:'core-01',revision:0,instructions:'공격'}),/forbidden/);
  const initial=await call('admin_guidance_detail',admin,{unitId:'core-01'});assert.equal(initial.guidance.revision,0);assert.equal(initial.guidance.instructions,'');
  const payload={unitId:'core-01',revision:0,instructions:'구체적인 본인의 행동과 결과를 확인한다.\n경험이 모호하면 보완 방향을 제시한다. <script>not executable</script>'};
  const first=await call('admin_guidance_save',admin,payload);assert.equal(first.guidance.revision,1);assert.equal(first.guidance.updated_by,'qa');assert.equal(first.guidance.instructions,payload.instructions);
  assert.deepEqual(await call('admin_guidance_save',admin,payload),first,'Retry should not duplicate history');
  assert.equal((await call('admin_guidance_detail',admin,{unitId:'core-02'})).guidance.instructions,'');
  await assert.rejects(call('admin_guidance_save',admin,{...payload,instructions:'오래된 탭에서 덮어쓰기'}),/revision_conflict/);
  const results=await Promise.allSettled(['A 수정','B 수정'].map(instructions=>call('admin_guidance_save',admin,{...payload,revision:1,instructions})));assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  const history=await call('admin_guidance_history',admin,{unitId:'core-01'});assert.equal(history.total,2);assert.equal(history.versions[1].instructions,payload.instructions);
  await call('admin_guidance_save',admin,{unitId:'other',revision:0,instructions:'기타질문의 지침'});assert.equal((await call('admin_guidance_list',admin)).guidelines.filter(g=>g.has_instructions).length,2);
  await call('admin_guidance_save',admin,{unitId:'other',revision:1,instructions:''});assert.equal((await call('admin_guidance_list',admin)).guidelines.filter(g=>g.has_instructions).length,1);assert.equal((await call('admin_guidance_history',admin,{unitId:'other'})).versions[1].instructions,'기타질문의 지침');
  await assert.rejects(call('admin_guidance_save',admin,{...payload,revision:2,instructions:'가'.repeat(10001)}),/invalid_request/);
  await assert.rejects(call('admin_guidance_save',admin,{...payload,revision:2,instructions:null}),/invalid_request/);
  await assert.rejects(call('admin_guidance_detail',admin,{unitId:'core-26'}),/not_found/);
  await call('admin_settings',admin,{revision:(await call('admin_list',admin)).settings.revision,enabled:true,dueAt:'2099-01-01T00:00:00Z',revisionDueAt:'2099-01-02T00:00:00Z',allowLate:true});
  for(const response of [await call('bootstrap',a),await call('detail',a,{unitId:'core-01'}),await call('history',a,{unitId:'core-01'})]){assert(!JSON.stringify(response).includes('instructions'));assert(!JSON.stringify(response).includes('A 수정'));assert(!JSON.stringify(response).includes('B 수정'));}
  assert.equal((await db.query('select count(*)::int as n from ip_pa_drafts')).rows[0].n,0,'Instructions do not create student answers');
  await db.exec('set role anon');await assert.rejects(db.query('select * from ip_pa_guidance'),/permission denied/);await assert.rejects(db.query("select ip_pa_guidance_service('admin_guidance_list','{}','{}')"),/permission denied/);await db.exec('reset role');
  await db.exec('set role authenticated');await assert.rejects(db.query('select * from ip_pa_guidance_versions'),/permission denied/);await db.exec('reset role');
  await db.exec('set role service_role');assert.equal((await call('admin_guidance_list',admin)).guidelines.length,26);await assert.rejects(db.query("update ip_pa_guidance_versions set instructions='changed'"),/permission denied/);await db.exec('reset role');
  console.log('PASS guidance DB: 26 independent questions, admin only, persistent versioned instructions, concurrent-edit protection, retry, clear history, bounds, no student leakage, immutable history.');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
