const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const hair = require('../study-character');
const handler = require('../api/study-cafe');

test('six hairstyles include the unchanged default and exact approved preview geometry', () => {
  assert.deepEqual(hair.styles.map(s => s.id), ['default', 'sport', 'spiky', 'mushroom', 'wave', 'ponytail']);
  const preview = fs.readFileSync('docs/character-hair-preview/preview.js', 'utf8');
  const designs = vm.runInNewContext(preview.slice(0, preview.indexOf('const colors')) + '\nstyles;');
  for (const design of designs) {
    const item = hair.styles.find(s => s.id === design.id);
    for (const key of ['path', 'shine', 'ties']) assert.equal(item[key], design[key]);
  }
  assert.equal(hair.styles[0].path, undefined);
  for (const value of [undefined, null, '', 'deleted-style', '<svg>']) assert.equal(hair.normalize(value), 'default');
});

test('profile API blocks free hairstyle changes and still loads hair and preserves other profile fields', async () => {
  const oldFetch = global.fetch;
  const oldUrl = process.env.SUPABASE_URL;
  const oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = 'https://test.invalid';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  const profile = { student_id: 'hair-test', avatar_tone: 'rose', nickname: '테스터', status_message: '공부 중' };
  const writes = [];
  let category = 'lecture';
  let authenticated = true;
  const response = payload => ({ ok: true, status: 200, json: async () => payload, text: async () => JSON.stringify(payload) });
  global.fetch = async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : {};
    if (url.includes('/rpc/validate_student_device')) return response({ valid: authenticated });
    if (url.includes('/students?id=')) return response([{ id: 'hair-test', name: '테스트', student_category: category, is_active: true }]);
    if (url.includes('/study_cafe_profiles?') && options.method === 'POST') {
      writes.push(body);
      Object.assign(profile, body);
      return response([]);
    }
    if (url.includes('/rpc/get_study_cafe_snapshot_data')) return response({
      subjects: [], todos: [], subjectGoals: [], profiles: [profile, { student_id: 'other', hair_style: 'wave' }],
      ownPresence: [], activeSessions: [], sessions: [],
      presence: [{ student_id: 'other', seat_number: 2, status: 'seated' }], onlineStudents: [],
    });
    return response([]);
  };
  async function invoke(payload) {
    const res = { statusCode: 200, setHeader() {}, status(code) { this.statusCode = code; return this; }, json(value) { this.payload = value; } };
    await handler({ method: 'POST', headers: {}, body: { studentId: 'hair-test', deviceToken: 'test-token', ...payload } }, res);
    return res;
  }
  try {
    for (const style of hair.styles) {
      const saved = await invoke({ action: 'save_profile', hairStyle: style.id });
      assert.equal(saved.statusCode, 409);
      assert.equal(saved.payload.error, 'hair_style_shop_only');
      assert.equal(writes.length, 0);
      profile.hair_style = style.id; // A shop-equipped style is returned by the snapshot.
      assert.equal(profile.avatar_tone, 'rose');
      assert.equal(profile.nickname, '테스터');
      assert.equal(profile.status_message, '공부 중');
      const loaded = await invoke({ action: 'load' });
      assert.equal(loaded.statusCode, 200);
      assert.equal(loaded.payload.profile.hairStyle, style.id);
      assert.equal(loaded.payload.room[0].hairStyle, 'wave');
    }
    const before = writes.length;
    assert.equal((await invoke({ action: 'save_profile', hairStyle: '<svg onload=x>' })).statusCode, 400);
    assert.equal(writes.length, before);
    await invoke({ action: 'save_profile', avatarTone: 'mint' });
    assert.equal(profile.hair_style, 'ponytail', 'old clients changing color must retain hairstyle');
    delete profile.hair_style;
    assert.equal((await invoke({ action: 'load' })).payload.profile.hairStyle, 'default', 'existing profiles retain the old default hair');
    category = 'offline';
    assert.equal((await invoke({ action: 'save_profile', hairStyle: 'wave' })).statusCode, 403);
    category = 'lecture'; authenticated = false;
    assert.equal((await invoke({ action: 'save_profile', hairStyle: 'wave' })).statusCode, 403);
  } finally {
    global.fetch = oldFetch;
    if (oldUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey;
  }
});

test('hair shop charges once, requires ownership, preserves hats, and restores equipped hair after reload', async () => {
  const storage = new Map();
  let preview = true;
  const state = { hairStyle: 'default' };
  const context = vm.createContext({
    StudyCharacterStyles: hair, studyCafePreviewState: state,
    getAuthedStudent: () => ({ id: 'hair-shop-test' }),
    getStudySubjectTotalElapsedMs: () => 0,
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    isStudyCafeLocalPreview: () => preview,
    confirm: () => true, notify() {}, renderStudyCafeStateUpdate() {}, requestStudyCafeRemoteRefresh() {},
    createId: () => 'test-ledger', requestStudyCafeAction: async () => ({ ok: false }),
  });
  const source = fs.readFileSync('study-shop.js', 'utf8');
  vm.runInContext(source + '\nglobalThis.shopState = studyCafeShopState;', context);
  context.hydrateLocalStudyCafeShop({ id: 'hair-shop-test' });
  const items = context.shopState.items.filter(item => item.slot === 'hair');
  assert.deepEqual(Array.from(items, item => item.price), [50, 80, 100, 150, 200]);
  const initialBalance = context.shopState.balance;
  const wave = items.find(item => item.id === 'hair_wave');
  context.shopState.equipment.head = 'head_navy_cap';
  await context.equipStudyCafeShopItem(wave);
  assert.equal(state.hairStyle, 'default', 'unowned hair cannot be worn');
  context.shopState.balance = 49;
  await context.purchaseStudyCafeShopItem(items[0]);
  assert.equal(context.shopState.inventory.length, 0);
  assert.equal(context.shopState.balance, 49);
  context.shopState.balance = initialBalance;
  await context.purchaseStudyCafeShopItem(wave);
  await context.purchaseStudyCafeShopItem(wave);
  assert.equal(context.shopState.balance, initialBalance - 150);
  assert.equal(context.shopState.inventory.length, 1);
  await context.equipStudyCafeShopItem(wave);
  assert.equal(state.hairStyle, 'wave');
  assert.equal(context.shopState.equipment.head, 'head_navy_cap');
  context.resetStudyCafeShopState();
  context.hydrateLocalStudyCafeShop({ id: 'hair-shop-test' });
  assert.equal(state.hairStyle, 'wave');
  await context.unequipStudyCafeShopItem(wave);
  assert.equal(state.hairStyle, 'default');
  await context.equipStudyCafeShopItem(wave);
  assert.equal(state.hairStyle, 'wave');
  assert.equal(context.shopState.balance, initialBalance - 150, 're-equipping is free');
  preview = false;
  await context.unequipStudyCafeShopItem(wave);
  assert.equal(state.hairStyle, 'wave', 'failed unequip retains hair');
  assert.equal(context.shopState.actionPending, false);
  const app = fs.readFileSync('app.js', 'utf8');
  assert.doesNotMatch(app, /renderStudyCafeHairOptions|updateStudyCafeHairSelection|outing:study-hair-preview/);
});
