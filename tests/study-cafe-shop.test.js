const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const handler = require("../api/study-cafe");
const { normalizeShopItemId, normalizeShopSlot } = handler._private;

assert.equal(normalizeShopItemId("head_navy_cap"), "head_navy_cap");
assert.throws(() => normalizeShopItemId("../glasses"), /invalid_shop_item_id/);
assert.throws(() => normalizeShopItemId("Head Glasses"), /invalid_shop_item_id/);
assert.equal(normalizeShopSlot("chair"), "chair");
assert.equal(normalizeShopSlot("outfit"), "outfit");

const sql = fs.readFileSync("supabase/add-study-cafe-shop.sql", "utf8");
const api = fs.readFileSync("api/study-cafe.js", "utf8");
const app = fs.readFileSync("app.js", "utf8");
const shop = fs.readFileSync("study-shop.js", "utf8");
const index = fs.readFileSync("index.html", "utf8");
const styles = fs.readFileSync("styles.css", "utf8");

const shopRuntime = {};
vm.runInNewContext(`${shop}
studyCafeShopState.equipment.chair = "chair_premium";
studyCafeShopState.equipment.outfit = "outfit_coast_guard_uniform";
result = [
  getStudyCafeShopItemCssClass("chair_premium"),
  getStudyCafeEquippedChairClass(),
  [0, 1799, 1800, 3599, 3600].map(calculateStudyCafePointsForSeconds),
  Object.fromEntries(["outfit", "desk", "head", "chair"].map((slot) => {
    const prices = STUDY_CAFE_SHOP_FALLBACK_ITEMS.filter((item) => item.slot === slot).map((item) => item.price);
    return [slot, [Math.min(...prices), Math.max(...prices)]];
  })),
  formatStudyCafeShopPoints(20000),
  getStudyCafeEquippedOutfitClass(),
];`, shopRuntime);
assert.equal(shopRuntime.result[0], "chair-premium");
assert.equal(shopRuntime.result[1], "shop-chair-premium");
assert.deepEqual(Array.from(shopRuntime.result[2]), [0, 0, 5, 5, 10]);
assert.deepEqual(JSON.parse(JSON.stringify(shopRuntime.result[3])), {
  outfit: [4000, 4000],
  desk: [500, 2400],
  head: [800, 2500],
  chair: [1800, 3500],
});
assert.equal(shopRuntime.result[4], "20,000P");
assert.equal(shopRuntime.result[5], "shop-outfit-coast-guard-uniform");

for (const table of [
  "study_cafe_shop_items",
  "study_cafe_point_wallets",
  "study_cafe_point_ledger",
  "study_cafe_inventory",
  "study_cafe_equipment",
]) {
  assert.match(sql, new RegExp(`create table if not exists public\\.${table}`));
  assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
}
assert.match(sql, /5 points per completed 30 verified focus minutes = 10 points per hour/);
assert.match(sql, /floor\(v_total_seconds \/ 1800\.0\)::integer \* 5/);
assert.match(sql, /'secondsToNextPoint', 1800 - \(v_total_seconds % 1800\)/);
assert.match(sql, /for update/);
assert.match(sql, /unique \(student_id, source_key\)/);
assert.match(sql, /on conflict \(student_id, item_id\) do nothing|primary key \(student_id, item_id\)/);
assert.match(sql, /security invoker/g);
assert.doesNotMatch(sql, /security definer/i);
assert.match(sql, /revoke execute on function public\.award_study_cafe_time_points[\s\S]*from public, anon, authenticated/);
assert.match(sql, /create or replace function public\.unequip_study_cafe_item/);
assert.match(sql, /primary key \(student_id, slot, item_id\)/);
assert.match(sql, /v_item\.slot = 'desk'[\s\S]*?v_desk_count >= 4/);
assert.match(sql, /delete from public\.study_cafe_equipment[\s\S]*slot = p_slot[\s\S]*item_id = p_item_id/);
assert.match(sql, /revoke execute on function public\.unequip_study_cafe_item\(text, text, text\) from public, anon, authenticated/);
assert.equal((sql.match(/\('(?:outfit|head|desk|chair)_[a-z0-9_]+',/g) || []).length, 14);
assert.match(sql, /slot in \('outfit', 'head', 'desk', 'chair'\)/);
assert.match(sql, /if p_slot not in \('outfit', 'head', 'desk', 'chair'\)/);
assert.match(sql, /v_desk_count integer := 0/);

assert.match(api, /"shop_load"/);
assert.match(api, /"shop_purchase"/);
assert.match(api, /"shop_equip"/);
assert.match(api, /"shop_unequip"/);
assert.match(api, /rpc\/unequip_study_cafe_item/);
assert.match(api, /function hasStudyCafeShopAccess\(student\)[\s\S]*student_category[\s\S]*=== "lecture"/);
assert.match(api, /await awardStudyCafeTimePoints\(studentId, now\)/);
assert.match(api, /Study cafe shop is not ready/);
assert.match(api, /\["outfit", "head", "desk", "chair"\]\.includes\(row\.slot\)/);
assert.match(api, /\["outfit", "head", "chair"\]\.includes\(row\.slot\)/);

assert.match(app, /"study-shop": \(\) => requireStudentAuth\(renderStudentStudyShop\)/);
assert.match(app, /renderStudyCafeShopChip\(student\)/);
assert.match(app, /hydrateStudyCafeShopSummary\(snapshot\.shop\)/);
assert.match(shop, /const STUDY_CAFE_SHOP_POINT_SECONDS = 30 \* 60/);
assert.match(shop, /const STUDY_CAFE_SHOP_POINT_AMOUNT = 5/);
assert.match(shop, /const STUDY_CAFE_SHOP_LOCAL_GRANT = 20000/);
assert.match(shop, /const STUDY_CAFE_SHOP_LOCAL_GRANT_VERSION = 4/);
assert.match(shop, /const needsLocalGrant = savedGrantVersion !== STUDY_CAFE_SHOP_LOCAL_GRANT_VERSION/);
assert.match(shop, /const shouldResetLocalItems = savedGrantVersion < 3/);
assert.match(shop, /studyCafeShopState\.inventory = shouldResetLocalItems \? \[\]/);
assert.match(shop, /studyCafeShopState\.equipment = shouldResetLocalItems \? normalizeStudyCafeShopEquipment\(\{\}\)/);
assert.match(shop, /studyCafeShopState\.balance = needsLocalGrant\s*\? STUDY_CAFE_SHOP_LOCAL_GRANT/);
assert.match(shop, /studyCafeShopState\.history = shouldResetLocalItems \? \[\]/);
assert.doesNotMatch(shop, /STUDY_CAFE_SHOP_PREVIOUS_LOCAL_GRANT/);
assert.match(shop, /pointGrantVersion: STUDY_CAFE_SHOP_LOCAL_GRANT_VERSION/);
assert.match(shop, /순공시간 30분마다 5P · 1시간마다 10P가 자동으로 쌓여요\. 30분 미만은 포인트가 지급되지 않아요/);
assert.match(shop, /다음 5P까지/);
assert.match(shop, /function calculateStudyCafePointsForSeconds\(totalSeconds\)/);
assert.match(shop, /const newlyAwardedPoints = needsLocalGrant \? 0 : Math\.max\(0, earnedPoints - savedAwardedStudyPoints\)/);
assert.match(shop, /awardedStudyPoints: studyCafeShopState\.localAwardedStudyPoints/);
assert.match(api, /secondsToNextPoint: Math\.min\(1800, Math\.max\(1, Number\(value\?\.secondsToNextPoint\) \|\| 1800\)\)/);
assert.match(shop, /requestStudyCafeAction\("shop_purchase"/);
assert.match(shop, /requestStudyCafeAction\("shop_equip"/);
assert.match(shop, /requestStudyCafeAction\("shop_unequip", \{ slot: item\.slot, itemId: item\.id \}\)/);
assert.match(shop, /function renderStudyCafeDeskCosmetics\(\)/);
assert.match(shop, /function isStudyCafeShopItemEquipped\(item\)/);
assert.doesNotMatch(shop, /isStudyCafeCoastGuardItem|\["coast", "해양경찰"\]|study-shop-coast-banner|study-shop-collection-badge/);
assert.match(shop, /equipped \? "착용 해제"/);
assert.match(shop, /\["outfit", "의상"\], \["desk", "책상 소품"\], \["chair", "의자"\], \["head", "모자"\]/);
assert.match(shop, /function getStudyCafeEquippedChairClass\(\)/);
assert.match(shop, /function getStudyCafeEquippedOutfitClass\(\)/);
assert.match(shop, /function openStudyCafeShop\(returnRoute = currentRoute\)/);
assert.match(shop, /returnRoute === "study-character" \? "study-character" : "study-cafe"/);
assert.match(shop, /function renderStudyCafeShopBackButton\(\)/);
assert.match(shop, /returnRoute === "study-character" \? "← 캐릭터" : "← 스터디카페"/);
assert.equal((shop.match(/renderStudyCafeShopBackButton\(\)/g) || []).length, 3);
assert.match(app, /button\("상점 가기", "study-character-shop-button", "button", \(\) => openStudyCafeShop\("study-character"\)\)/);
assert.match(shop, /function getStudyCafeShopItemCssClass\(itemId\)/);
assert.match(shop, /\.replace\(\/_\+\/g, "-"\)/);
assert.match(shop, /item-\$\{getStudyCafeShopItemCssClass\(item\.id\)\}/);
assert.match(shop, /shop-\$\{getStudyCafeShopItemCssClass\(itemId\)\}/);
assert.match(shop, /\["study-shop", "study-cafe", "study-character"\]\.includes\(currentRoute\)/);
assert.match(shop, /\["outfit_coast_guard_uniform", "해경 정복", "해양경찰 정복입니다\.", "outfit", "👮", 4000\]/);
assert.match(index, /styles\.css\?v=20260828-coast-guard-eagle-emblem/);
assert.match(index, /study-shop\.js\?v=20260828-local-grant-20000/);
assert.match(index, /app\.js\?v=20260828-coast-guard-uniform-detail/);
assert.doesNotMatch(shop, /head_classic_hat|head_graduation_cap|desk_coast_helicopter|desk_coast_rescue_buoy|desk_coast_lighthouse|head_coast_vessel_cap|head_coast_rescue_helmet|chair_coast_captain/);
assert.match(shop, /\["desk_coast_patrol_ship", "미니 경비함", [^\n]*, "desk", "🚢", 2400\]/);
assert.match(shop, /\["desk_coast_speed_boat", "고속단정", [^\n]*, "desk", "🚤", 1800\]/);
assert.match(shop, /\["head_coast_guard_dress_cap", "해경정모", "해양경찰 정모입니다\.", "head", "🎖️", 2500\]/);
assert.match(sql, /'head_classic_hat'[\s\S]*?'chair_coast_captain'/);
assert.match(sql, /\('desk_coast_patrol_ship', '미니 경비함', [^\n]*, 'desk', '🚢', 2400/);
assert.match(sql, /\('desk_coast_speed_boat', '고속단정', [^\n]*, 'desk', '🚤', 1800/);
assert.match(shop, /\["desk_sprout", [^\n]*, 500\]/);
assert.match(shop, /\["chair_premium", [^\n]*, 3500\]/);
assert.match(shop, /function formatStudyCafeShopPoints\(value\)/);
assert.match(shop, /formatStudyCafeShopPoints\(item\.price\)/);
assert.match(shop, /\["desk_tumbler", "미니 책 더미", "작은 책 더미가 책상에 공부 분위기를 더합니다\.", "desk", "📚", 700\]/);
assert.match(shop, /\["desk_clock", "응원 오리", "책상 위에서 오늘의 공부를 응원하는 노란 오리입니다\.", "desk", "🐥", 1000\]/);
assert.doesNotMatch(shop, /스터디 머그|목표 시계/);
assert.match(sql, /\('desk_tumbler', '미니 책 더미',[^\n]*'📚'/);
assert.match(sql, /\('desk_clock', '응원 오리',[^\n]*'🐥'/);
assert.match(styles, /\.study-cafe-shop-chip/);
assert.match(styles, /\.study-shop-grid/);
assert.match(styles, /\.study-cafe-cosmetic/);
assert.match(styles, /\.study-cafe-desk-cosmetics \.study-cafe-cosmetic:nth-child\(4\)/);
assert.match(styles, /\.study-cafe-desk:has\(\.study-cafe-desk-cosmetics\) \.study-cafe-desk-cup \{ opacity: 1; \}/);
assert.match(styles, /\.study-cafe-desk-cosmetics \.study-cafe-cosmetic[\s\S]*?bottom: 15px[\s\S]*?font-size: 0/);
assert.match(styles, /\.study-cafe-desk-cosmetics \.item-desk-sprout::before/);
assert.match(styles, /\.study-cafe-desk-cosmetics \.item-desk-lamp::after/);
assert.match(styles, /\.study-cafe-desk-cosmetics \.item-desk-tumbler::after/);
assert.match(styles, /\.study-cafe-desk-cosmetics \.item-desk-clock::before/);
assert.match(styles, /\.study-cafe-desk-cosmetics \.study-cafe-cosmetic\[class\*="item-desk-"\][\s\S]*?font-size: 18px/);
assert.match(styles, /\.study-cafe-desk-cosmetics \.study-cafe-cosmetic\[class\*="item-desk-"\]::before,[\s\S]*?content: none/);
assert.match(styles, /\.study-cafe-chair-back\.shop-chair-premium/);
assert.match(styles, /\.study-cafe-chair-back\.shop-chair-premium[\s\S]*?top: auto[\s\S]*?bottom: 34px[\s\S]*?width: min\(96px, 70%\)[\s\S]*?aspect-ratio: 48 \/ 43/);
assert.doesNotMatch(styles, /study-character-preview-scene/);
assert.match(app, /study-character-preview-avatar study-cafe-member-avatar-stage/);
assert.match(app, /className: "study-cafe-member-seat-scene"/);
assert.match(styles, /\.study-cafe-chair-back\[class\*="shop-chair-"\][\s\S]*?width: 41px[\s\S]*?height: 47px/);
assert.match(styles, /\.study-shop-item-preview\.item-chair-navy/);
assert.match(styles, /\.study-shop-item-preview\.item-chair-mint/);
assert.match(styles, /\.study-shop-item-preview\.item-chair-rose/);
assert.match(styles, /\.study-shop-item-preview\.item-chair-premium/);
assert.match(styles, /\.study-shop-item-preview\.item-outfit-coast-guard-uniform::before/);
assert.match(styles, /\.study-shop-item-preview\.item-head-coast-guard-dress-cap::before/);
assert.match(styles, /\.study-cafe-avatar \.study-cafe-cosmetic\.head\.item-head-coast-guard-dress-cap::after/);
assert.match(styles, /url\("\.\/coast-guard-eagle-emblem\.svg"\)/);
assert.match(styles, /\.study-cafe-avatar\.shop-outfit-coast-guard-uniform \.study-cafe-avatar-body/);
assert.match(styles, /\.study-cafe-seat-visual\.shop-outfit-coast-guard-uniform \.study-cafe-writing-arms \.study-cafe-avatar-arm/);
assert.match(app, /wearsCoastGuardDressUniform[\s\S]*?study-cafe-uniform-lapels[\s\S]*?study-cafe-uniform-ribbons[\s\S]*?study-cafe-uniform-medal/);
assert.match(styles, /\.study-cafe-uniform-nameplate/);
assert.match(styles, /\.study-cafe-uniform-pockets/);
assert.match(styles, /\.study-cafe-uniform-buttons/);
assert.doesNotMatch(styles, /study-shop-coast-banner|study-shop-collection-badge|item-chair-coast-captain|shop-chair-coast-captain|item-head-classic-hat|item-head-graduation-cap/);
assert.match(styles, /\.study-shop-item-preview\.slot-chair::before/);
assert.match(styles, /\.study-shop-item-preview\.slot-chair::after/);
assert.match(styles, /\.study-shop-item-preview\.item-chair-mint::before/);
assert.match(styles, /\.study-shop-item-preview\.item-chair-rose::before/);
assert.match(app, /function renderStudentStudyCafe\(\)[\s\S]*?ensureStudyCafeShopLoaded\(\)/);
assert.match(app, /function renderStudyCafeAvatar[\s\S]*?getStudyCafeEquippedOutfitClass\(\)/);
assert.match(app, /"study-cafe-seat-visual"[\s\S]*?isMine \? getStudyCafeEquippedOutfitClass\(\) : ""/);

function response() {
  return {
    statusCode: 200,
    payload: null,
    setHeader() {},
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

const originalFetch = global.fetch;
const originalUrl = process.env.SUPABASE_URL;
const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

(async () => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
  global.fetch = async (url, options) => {
    if (url.endsWith("/rpc/validate_student_device")) {
      return { ok: true, status: 200, json: async () => ({ valid: true }), text: async () => "" };
    }
    if (url.includes("/students?")) {
      return {
        ok: true,
        status: 200,
        json: async () => [{ id: "20001", name: "관리반", student_category: "online_managed", is_active: true }],
        text: async () => "",
      };
    }
    if (url.includes("last_heartbeat_at=lt.")) {
      return { ok: true, status: 200, json: async () => [], text: async () => "" };
    }
    if (url.includes("study_cafe_sessions?student_id=eq.20001") && url.includes("status=in.")) {
      return { ok: true, status: 200, json: async () => [], text: async () => "" };
    }
    throw new Error(`unexpected request: ${options.method} ${url}`);
  };

  const res = response();
  await handler({
    method: "POST",
    body: { action: "shop_load", studentId: "20001", deviceToken: "device-secret" },
    headers: {},
  }, res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.payload.error, "lecture_student_only");
  console.log("study cafe shop tests passed");
})().finally(() => {
  global.fetch = originalFetch;
  if (originalUrl === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = originalUrl;
  if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
});
