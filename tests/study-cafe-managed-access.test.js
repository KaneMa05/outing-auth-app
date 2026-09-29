const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');
const app = fs.readFileSync('app.js', 'utf8').replace(/\r\n/g, '\n');
const extract = name => {
  const start = app.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  return app.slice(start).match(/^function [\s\S]*?\n}/)[0];
};

test('both online types can enter character/shop via My; offline and disabled managed cafe retain their existing menus', () => {
  let category = 'online_managed', target;
  const el = (tag, props = {}, children = []) => ({ tag, ...props, children });
  const c = vm.createContext({
    state: { settings: { onlineManagedStudyCafeEnabled: true } },
    getAuthedStudent: () => ({ id: 'test', name: 'Test' }), getStudentCategory: () => category,
    getStudentProfile: () => ({}), getStudentCategoryLabel: () => category,
    normalizeCoastGuardTrack: () => '', isStudyCafeLocalPreview: () => false,
    isCurriculumQuestEnabled: () => false, el, profileItem: () => null,
    button: (label, className, type, onclick, children) => el('button', { className, onclick }, children),
    navigate: route => { target = route; },
  });
  for (const name of ['renderStudentOutingHistoryButton','renderStudentPenaltyHistoryButton','renderStudentPushNotificationCard',
    'renderStudentOtherSettingsCard','renderStudentDeviceRegistrationCard','renderHomeScreenInstallCard']) c[name] = () => null;
  vm.runInContext(app.match(/const STUDENT_CATEGORY_ROUTES = \{[\s\S]*?\n};/)[0] + '\n' +
    ['getAllowedStudentRoutes','isOnlineManagedStudyCafeEnabled','isOnlineStudentExperience','renderStudentMypage'].map(extract).join('\n'), c);
  for (const type of ['online_managed', 'lecture', 'offline']) {
    category = type;
    const enabled = type !== 'offline';
    const routes = c.getAllowedStudentRoutes(type);
    assert.equal(routes.has('study-character'), enabled);
    assert.equal(routes.has('study-shop'), enabled);
    const link = c.renderStudentMypage().children.find(node => node?.className?.includes('student-character-card'));
    assert.equal(Boolean(link), enabled);
    if (link) { link.onclick(); assert.equal(target, 'study-character'); }
  }
  category = 'online_managed'; c.state.settings.onlineManagedStudyCafeEnabled = false;
  assert.equal(c.getAllowedStudentRoutes(category).has('study-character'), false);
  assert.equal(c.getAllowedStudentRoutes(category).has('study-shop'), false);
  assert.equal(c.renderStudentMypage().children.some(node => node?.className?.includes('student-character-card')), false);
});

test('both online categories load the real shop client; offline causes no request', async () => {
  let category, calls = 0;
  const c = vm.createContext({
    getAuthedStudent: () => ({ id: 'test' }), getStudentCategory: () => category,
    StudyCharacterStyles: require('../study-character'),
    studyCafeRemoteState: { available: true }, studyCafePreviewState: {},
    isStudyCafeLocalPreview: () => false, currentRoute: 'home',
    requestStudyCafeAction: async action => { assert.equal(action, 'shop_load'); calls++; return { ok: true, wallet: { balance: 100 }, inventory: ['hair_sport'], equipment: { hair: 'hair_sport' } }; },
    notify() {}, renderStudyCafeStateUpdate() {}, console,
  });
  vm.runInContext(fs.readFileSync('study-shop.js', 'utf8') + '\nglobalThis.shop = studyCafeShopState;', c);
  for (const type of ['online_managed', 'lecture']) {
    category = type; c.resetStudyCafeShopState();
    assert.equal(await c.ensureStudyCafeShopLoaded(), true);
    assert.equal(c.shop.balance, 100);
    assert.equal(c.shop.equipment.hair, 'hair_sport');
  }
  category = 'offline'; c.resetStudyCafeShopState();
  assert.equal(await c.ensureStudyCafeShopLoaded(), false);
  assert.equal(calls, 2);
});

test('shop API authenticates both types for every shop action and rejects invalid devices, inactive and offline accounts', async () => {
  const handler = require('../api/study-cafe');
  const previous = { fetch: global.fetch, url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
  process.env.SUPABASE_URL = 'https://test.invalid'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only';
  let category = 'online_managed', valid = true, active = true, insufficient = false;
  const mutations = [];
  const reply = data => ({ ok: true, status: 200, json: async () => data, text: async () => '' });
  global.fetch = async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : {};
    if (url.endsWith('/rpc/validate_student_device')) return reply({ valid });
    if (url.includes('/students?id=')) return reply(active ? [{ id: 'managed-1', name: 'Test', is_active: true, student_category: category }] : []);
    const rpc = url.match(/\/rpc\/(award_study_cafe_time_points|purchase_study_cafe_item|equip_study_cafe_item|unequip_study_cafe_item)$/)?.[1];
    if (rpc) {
      assert.equal(body.p_student_id, 'managed-1'); mutations.push(rpc);
      if (rpc === 'purchase_study_cafe_item' && insufficient) return reply({ ok: false, error: 'insufficient_points', balance: 0 });
      return reply({ ok: true, balance: 100, slot: 'head', itemId: 'head_navy_cap' });
    }
    if (options.method === 'GET') return reply([]);
    throw new Error(`Unexpected request ${options.method} ${url}`);
  };
  const invoke = async action => {
    const res = { statusCode: 200, setHeader() {}, status(n) { this.statusCode = n; return this; }, json(body) { this.payload = body; } };
    await handler({ method: 'POST', headers: {}, body: { action, studentId: 'managed-1', deviceToken: 'test-token', itemId: 'head_navy_cap', slot: 'head' } }, res);
    return res;
  };
  try {
    for (const type of ['online_managed', 'lecture']) {
      category = type;
      for (const action of ['shop_load', 'shop_purchase', 'shop_equip', 'shop_unequip']) {
        const res = await invoke(action);
        assert.equal(res.statusCode, 200, `${type}: ${action}`); assert.equal(res.payload.ok, true);
      }
    }
    category = 'online_managed'; insufficient = true;
    assert.equal((await invoke('shop_purchase')).statusCode, 409);
    const count = mutations.length;
    for (const mode of ['offline', 'inactive', 'invalid-device']) {
      category = mode === 'offline' ? 'offline' : 'online_managed'; active = mode !== 'inactive'; valid = mode !== 'invalid-device';
      for (const action of ['shop_load', 'shop_purchase', 'shop_equip', 'shop_unequip']) assert.equal((await invoke(action)).statusCode, 403);
    }
    assert.equal(mutations.length, count, 'rejected users must never access shop RPCs');
  } finally {
    global.fetch = previous.fetch;
    if (previous.url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previous.url;
    if (previous.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = previous.key;
  }
});
