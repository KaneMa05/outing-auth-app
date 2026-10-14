const { test } = require('node:test');
const assert = require('node:assert/strict');
const response = (body, status = 200) => ({ ok: status < 400, status,
  json: async () => body, text: async () => JSON.stringify(body) });
const rows = { subjects: [], todos: [], subjectGoals: [], profiles: [], ownPresence: [], activeSessions: [], sessions: [], presence: [], onlineStudents: [] };
const student = { id: '20001', name: 'Test', student_category: 'lecture', is_active: true };

test('snapshot bundle preserves API output, settlements and authentication with two fewer DB calls', async () => {
  const oldFetch = global.fetch;
  const saved = Object.fromEntries(['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','STUDY_CAFE_SNAPSHOT_BUNDLE_ENABLED'].map(k => [k,process.env[k]]));
  process.env.SUPABASE_URL = 'https://bundle-test.invalid';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test';
  const all = [];
  let allow = true, missing = false, failure = false, equipment = [];
  global.fetch = async (url, options) => {
    const path = new URL(url).pathname.split('/').at(-1);
    all.push({ path, method: options.method });
    if (path === 'validate_student_device') return response({ valid: allow });
    if (path === 'students') return response([student]);
    if (path === 'study_cafe_presence' || path === 'study_cafe_sessions') return response([]);
    if (path === 'get_study_cafe_snapshot_bundle') {
      if (missing) return response({ code: 'PGRST202' },404);
      if (failure) return response({ code: '57014' },500);
      return response({ snapshot: rows, equipment, botAppearances: [] });
    }
    if (path === 'get_study_cafe_snapshot_data') return response(rows);
    if (path === 'award_study_cafe_time_points') return response({ ok: true, balance: 10, totalSeconds: 3600 });
    if (path === 'study_cafe_equipment') return response(equipment);
    if (path === 'study_cafe_bot_appearance') return response([]);
    throw Error('Unexpected path ' + path);
  };
  function fresh() { delete require.cache[require.resolve('../api/study-cafe')]; return require('../api/study-cafe'); }
  async function invoke(handler) {
    all.length = 0;
    const res = { setHeader() {}, status(code) { this.code=code; return this; }, json(body) { this.body=body; } };
    await handler({ method:'POST',body:{ action:'load',studentId:student.id,deviceToken:'secret' } },res);
    return res;
  }
  try {
    process.env.STUDY_CAFE_SNAPSHOT_BUNDLE_ENABLED = 'false';
    const legacy = await invoke(fresh()), legacyCount = all.length;
    assert.equal(legacy.code,200);
    process.env.STUDY_CAFE_SNAPSHOT_BUNDLE_ENABLED = 'true';
    const handler = fresh();
    const bundled = await invoke(handler);
    assert.equal(bundled.code,200);
    assert.deepEqual({ ...bundled.body, serverNow:'' }, { ...legacy.body, serverNow:'' });
    assert.equal(all.length,legacyCount-2);
    assert.equal(all.filter(x=>x.path==='award_study_cafe_time_points').length,1);
    assert.equal(all.filter(x=>x.path==='validate_student_device').length,1);
    console.log(`Snapshot DB requests: ${legacyCount} -> ${all.length}`);
    student.student_category='online_managed';
    assert.equal((await invoke(handler)).code,200,'managed students keep access');
    student.student_category='offline';
    assert.equal((await invoke(handler)).code,403,'offline access rules stay unchanged');
    assert.equal(all.some(x=>x.path==='get_study_cafe_snapshot_bundle'),false);
    student.student_category='lecture';
    // No cross-user cache: every request sees the equipment just changed.
    equipment = [{ slot:'chair',item_id:'chair_premium',equipped_at:'2026-10-14T00:00:00Z' }];
    const equipped = await invoke(handler);
    assert.notDeepEqual(equipped.body.shop.equipment,bundled.body.shop.equipment);
    allow=false;
    assert.equal((await invoke(handler)).code,403);
    assert.deepEqual(all.map(x=>x.path),['validate_student_device']);
    allow=true; missing=true;
    assert.equal((await invoke(handler)).code,200,'old schema uses the compatible path');
    assert.equal(all.filter(x=>x.path==='award_study_cafe_time_points').length,1,'settlement is not replayed on fallback');
    await invoke(handler);
    assert.equal(all.some(x=>x.path==='get_study_cafe_snapshot_bundle'),false,'missing RPC is backed off');
    missing=false; failure=true;
    const failed=await invoke(fresh());
    assert.equal(failed.code,502);
    assert.equal(all.some(x=>x.path==='get_study_cafe_snapshot_data'),false,'timeouts do not fan out');
    assert.equal(all.filter(x=>x.path==='award_study_cafe_time_points').length,1);
  } finally {
    global.fetch=oldFetch;
    for (const [key,value] of Object.entries(saved)) value===undefined ? delete process.env[key] : process.env[key]=value;
  }
});
