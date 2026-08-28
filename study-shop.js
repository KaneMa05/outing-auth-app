const STUDY_CAFE_SHOP_POINT_SECONDS = 30 * 60;
const STUDY_CAFE_SHOP_POINT_AMOUNT = 5;
const STUDY_CAFE_SHOP_LOCAL_GRANT = 20000;
const STUDY_CAFE_SHOP_LOCAL_GRANT_VERSION = 4;
const STUDY_CAFE_SHOP_FALLBACK_ITEMS = [
  ["outfit_coast_guard_uniform", "해경 정복", "해양경찰 정복입니다.", "outfit", "👮", 4000],
  ["head_navy_cap", "네이비 캡", "가볍게 눌러쓰는 기본 스터디 모자입니다.", "head", "🧢", 800],
  ["head_bucket_hat", "버킷햇", "편안한 공부 분위기를 더하는 모자입니다.", "head", "👒", 1000],
  ["head_coast_guard_dress_cap", "해경정모", "해양경찰 정모입니다.", "head", "🎖️", 2500],
  ["desk_sprout", "새싹 화분", "책상 위에 작은 생기를 더합니다.", "desk", "🪴", 500],
  ["desk_lamp", "집중 스탠드", "늦은 시간에도 따뜻한 빛을 밝혀줍니다.", "desk", "💡", 800],
  ["desk_tumbler", "미니 책 더미", "작은 책 더미가 책상에 공부 분위기를 더합니다.", "desk", "📚", 700],
  ["desk_clock", "응원 오리", "책상 위에서 오늘의 공부를 응원하는 노란 오리입니다.", "desk", "🐥", 1000],
  ["chair_navy", "네이비 의자", "차분한 네이비 패브릭 의자입니다.", "chair", "🪑", 1800],
  ["chair_mint", "민트 의자", "산뜻한 민트 컬러의 집중 의자입니다.", "chair", "🪑", 2200],
  ["chair_rose", "로즈 의자", "부드러운 로즈 컬러의 패브릭 의자입니다.", "chair", "🪑", 2500],
  ["chair_premium", "프리미엄 의자", "등받이 포인트가 있는 고급 집중 의자입니다.", "chair", "🪑", 3500],
  ["desk_coast_patrol_ship", "미니 경비함", "흰색 선체와 파란 경광등을 갖춘 경비함 모형입니다.", "desk", "🚢", 2400],
  ["desk_coast_speed_boat", "고속단정", "해상 구조 현장으로 빠르게 출동하는 고속단정입니다.", "desk", "🚤", 1800],
].map(([id, name, description, slot, icon, price]) => ({ id, name, description, slot, icon, price }));

const studyCafeShopState = {
  available: null,
  balance: 0,
  earnedToday: 0,
  totalStudySeconds: 0,
  secondsToNextPoint: STUDY_CAFE_SHOP_POINT_SECONDS,
  equipment: {},
  items: [],
  inventory: [],
  history: [],
  loaded: false,
  loading: false,
  category: "all",
  actionPending: false,
  returnRoute: "study-cafe",
  localAwardedStudyPoints: 0,
};

function resetStudyCafeShopState() {
  Object.assign(studyCafeShopState, {
    available: null,
    balance: 0,
    earnedToday: 0,
    totalStudySeconds: 0,
    secondsToNextPoint: STUDY_CAFE_SHOP_POINT_SECONDS,
    equipment: {},
    items: [],
    inventory: [],
    history: [],
    loaded: false,
    loading: false,
    category: "all",
    actionPending: false,
    returnRoute: "study-cafe",
    localAwardedStudyPoints: 0,
  });
}

function openStudyCafeShop(returnRoute = currentRoute) {
  studyCafeShopState.returnRoute = returnRoute === "study-character" ? "study-character" : "study-cafe";
  navigate("study-shop");
}

function renderStudyCafeShopBackButton() {
  const returnRoute = studyCafeShopState.returnRoute === "study-character" ? "study-character" : "study-cafe";
  const label = returnRoute === "study-character" ? "← 캐릭터" : "← 스터디카페";
  return button(label, "study-character-back-button", "button", () => navigate(returnRoute));
}

function hydrateStudyCafeShopSummary(shop) {
  if (!shop) {
    studyCafeShopState.available = false;
    return;
  }
  studyCafeShopState.available = true;
  studyCafeShopState.balance = Math.max(0, Number(shop.balance) || 0);
  studyCafeShopState.earnedToday = Math.max(0, Number(shop.earnedToday) || 0);
  studyCafeShopState.totalStudySeconds = Math.max(0, Number(shop.totalStudySeconds) || 0);
  studyCafeShopState.secondsToNextPoint = Math.min(
    STUDY_CAFE_SHOP_POINT_SECONDS,
    Math.max(1, Number(shop.secondsToNextPoint) || STUDY_CAFE_SHOP_POINT_SECONDS)
  );
  studyCafeShopState.equipment = normalizeStudyCafeShopEquipment(shop.equipment || studyCafeShopState.equipment);
  if (Number(shop.awardedNow) > 0) notify(`순공시간으로 ${Number(shop.awardedNow)}P를 자동 획득했습니다.`);
}

function hydrateStudyCafeShop(data) {
  hydrateStudyCafeShopSummary(data.wallet || {});
  studyCafeShopState.items = Array.isArray(data.items) && data.items.length ? data.items : STUDY_CAFE_SHOP_FALLBACK_ITEMS;
  studyCafeShopState.inventory = Array.isArray(data.inventory) ? data.inventory : [];
  studyCafeShopState.equipment = normalizeStudyCafeShopEquipment(data.equipment || {});
  studyCafeShopState.history = Array.isArray(data.history) ? data.history : [];
  studyCafeShopState.loaded = true;
}

async function ensureStudyCafeShopLoaded(options = {}) {
  const student = getAuthedStudent();
  if (getStudentCategory(student) !== "lecture" || studyCafeShopState.loading) return false;
  if (studyCafeShopState.loaded && options.force !== true) return true;
  studyCafeShopState.loading = true;
  try {
    if (studyCafeRemoteState.available == null) await ensureStudyCafeRemoteLoaded({ render: false });
    if (isStudyCafeLocalPreview()) {
      hydrateLocalStudyCafeShop(student);
      studyCafeShopState.available = true;
      studyCafeShopState.loaded = true;
      return true;
    }
    const result = await requestStudyCafeAction("shop_load");
    if (!result.ok) {
      studyCafeShopState.available = false;
      return false;
    }
    hydrateStudyCafeShop(result);
    return true;
  } catch (error) {
    console.error(error);
    studyCafeShopState.available = false;
    return false;
  } finally {
    studyCafeShopState.loading = false;
    if (["study-shop", "study-cafe", "study-character"].includes(currentRoute)) {
      renderStudyCafeStateUpdate();
    }
  }
}

function localStudyCafeShopKey(student = getAuthedStudent()) {
  return `ronpark-study-cafe-shop:${student?.id || "preview"}`;
}

function calculateStudyCafePointsForSeconds(totalSeconds) {
  return Math.floor(Math.max(0, Number(totalSeconds) || 0) / STUDY_CAFE_SHOP_POINT_SECONDS) * STUDY_CAFE_SHOP_POINT_AMOUNT;
}

function formatStudyCafeShopPoints(value) {
  return `${Math.max(0, Number(value) || 0).toLocaleString("ko-KR")}P`;
}

function hydrateLocalStudyCafeShop(student) {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(localStudyCafeShopKey(student)) || "{}");
  } catch (error) {
    saved = {};
  }
  const totalSeconds = Math.floor(getStudySubjectTotalElapsedMs() / 1000);
  const earnedPoints = calculateStudyCafePointsForSeconds(totalSeconds);
  const savedBalance = Number(saved.balance);
  const savedGrantVersion = Number(saved.pointGrantVersion) || 0;
  const needsLocalGrant = savedGrantVersion !== STUDY_CAFE_SHOP_LOCAL_GRANT_VERSION;
  const shouldResetLocalItems = savedGrantVersion < 3;
  const savedAwardedStudyPoints = Math.max(0, Number(saved.awardedStudyPoints) || 0);
  const newlyAwardedPoints = needsLocalGrant ? 0 : Math.max(0, earnedPoints - savedAwardedStudyPoints);
  studyCafeShopState.items = STUDY_CAFE_SHOP_FALLBACK_ITEMS;
  studyCafeShopState.inventory = shouldResetLocalItems ? [] : Array.isArray(saved.inventory) ? saved.inventory : [];
  studyCafeShopState.equipment = shouldResetLocalItems ? normalizeStudyCafeShopEquipment({}) : normalizeStudyCafeShopEquipment(saved.equipment || {});
  studyCafeShopState.balance = needsLocalGrant
    ? STUDY_CAFE_SHOP_LOCAL_GRANT
    : Math.max(0, Number.isFinite(savedBalance)
      ? savedBalance + newlyAwardedPoints
      : STUDY_CAFE_SHOP_LOCAL_GRANT + earnedPoints);
  studyCafeShopState.earnedToday = earnedPoints;
  studyCafeShopState.localAwardedStudyPoints = earnedPoints;
  studyCafeShopState.totalStudySeconds = totalSeconds;
  studyCafeShopState.secondsToNextPoint = STUDY_CAFE_SHOP_POINT_SECONDS - (totalSeconds % STUDY_CAFE_SHOP_POINT_SECONDS);
  studyCafeShopState.history = shouldResetLocalItems ? [] : Array.isArray(saved.history) ? saved.history : [];
  if (newlyAwardedPoints > 0) {
    studyCafeShopState.history.unshift({
      id: createId(),
      amount: newlyAwardedPoints,
      balanceAfter: studyCafeShopState.balance,
      itemId: "",
      description: "순공시간 자동 적립",
      createdAt: new Date().toISOString(),
    });
    notify(`순공시간으로 ${newlyAwardedPoints}P를 자동 획득했습니다.`);
  }
  if (needsLocalGrant || newlyAwardedPoints > 0) saveLocalStudyCafeShop();
}

function saveLocalStudyCafeShop() {
  try {
    localStorage.setItem(localStudyCafeShopKey(), JSON.stringify({
      pointGrantVersion: STUDY_CAFE_SHOP_LOCAL_GRANT_VERSION,
      balance: studyCafeShopState.balance,
      inventory: studyCafeShopState.inventory,
      equipment: studyCafeShopState.equipment,
      history: studyCafeShopState.history,
      awardedStudyPoints: studyCafeShopState.localAwardedStudyPoints,
    }));
  } catch (error) {
    // Local preview remains usable when storage is unavailable.
  }
}

function renderStudyCafeShopChip(student = getAuthedStudent()) {
  if (getStudentCategory(student) !== "lecture" || studyCafeShopState.available === false) return null;
  const label = studyCafeShopState.available === true ? `${studyCafeShopState.balance.toLocaleString("ko-KR")}P` : "상점";
  return el("button", {
    className: "study-cafe-shop-chip",
    type: "button",
    ariaLabel: `스터디 상점 열기, 보유 포인트 ${label}`,
    onclick: () => openStudyCafeShop(currentRoute),
  }, [el("span", { ariaHidden: "true" }, "P"), el("strong", {}, label)]);
}

function getStudyCafeShopItem(itemId) {
  return [...studyCafeShopState.items, ...STUDY_CAFE_SHOP_FALLBACK_ITEMS].find((item) => item.id === itemId) || null;
}

function getStudyCafeShopItemCssClass(itemId) {
  return String(itemId || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/_+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeStudyCafeShopEquipment(equipment = {}) {
  const deskItems = Array.isArray(equipment.desk)
    ? equipment.desk
    : equipment.desk
      ? [equipment.desk]
      : [];
  return {
    ...(equipment.outfit ? { outfit: equipment.outfit } : {}),
    ...(equipment.head ? { head: equipment.head } : {}),
    ...(equipment.chair ? { chair: equipment.chair } : {}),
    desk: [...new Set(deskItems.filter(Boolean))].slice(0, 4),
  };
}

function renderStudyCafeShopCosmetic(slot, className = "") {
  const item = getStudyCafeShopItem(studyCafeShopState.equipment?.[slot]);
  return item ? el("span", {
    className: `study-cafe-cosmetic ${slot} item-${getStudyCafeShopItemCssClass(item.id)} ${className}`.trim(),
    ariaHidden: "true",
  }, item.icon) : null;
}

function renderStudyCafeDeskCosmetics() {
  const itemIds = Array.isArray(studyCafeShopState.equipment?.desk)
    ? studyCafeShopState.equipment.desk
    : [];
  const items = itemIds.map(getStudyCafeShopItem).filter((item) => item?.slot === "desk").slice(0, 4);
  return items.length
    ? el("span", { className: "study-cafe-desk-cosmetics", ariaHidden: "true" }, items.map((item) =>
        el("i", { className: `study-cafe-cosmetic desk item-${getStudyCafeShopItemCssClass(item.id)}` }, item.icon)
      ))
    : null;
}

function isStudyCafeShopItemEquipped(item) {
  return item?.slot === "desk"
    ? (studyCafeShopState.equipment?.desk || []).includes(item.id)
    : studyCafeShopState.equipment?.[item?.slot] === item?.id;
}

function getStudyCafeEquippedChairClass() {
  const itemId = studyCafeShopState.equipment?.chair;
  return getStudyCafeShopItem(itemId)?.slot === "chair" ? `shop-${getStudyCafeShopItemCssClass(itemId)}` : "";
}

function getStudyCafeEquippedOutfitClass() {
  const itemId = studyCafeShopState.equipment?.outfit;
  return getStudyCafeShopItem(itemId)?.slot === "outfit" ? `shop-${getStudyCafeShopItemCssClass(itemId)}` : "";
}

async function purchaseStudyCafeShopItem(item) {
  if (!item || studyCafeShopState.actionPending) return;
  if (studyCafeShopState.balance < item.price) {
    notify(`${formatStudyCafeShopPoints(item.price - studyCafeShopState.balance)}가 더 필요합니다.`);
    return;
  }
  if (!confirm(`${item.name}을(를) ${formatStudyCafeShopPoints(item.price)}로 구매할까요?\n구매 후 ${formatStudyCafeShopPoints(studyCafeShopState.balance - item.price)}가 남습니다.`)) return;
  studyCafeShopState.actionPending = true;
  if (isStudyCafeLocalPreview()) {
    studyCafeShopState.balance -= item.price;
    studyCafeShopState.inventory.unshift({ itemId: item.id, purchasedAt: new Date().toISOString() });
    studyCafeShopState.history.unshift({
      id: createId(),
      amount: -item.price,
      balanceAfter: studyCafeShopState.balance,
      itemId: item.id,
      description: `${item.name} 구매`,
      createdAt: new Date().toISOString(),
    });
    saveLocalStudyCafeShop();
  } else {
    const result = await requestStudyCafeAction("shop_purchase", { itemId: item.id });
    if (!result.ok) {
      studyCafeShopState.actionPending = false;
      notify(result.error === "insufficient_points" ? "포인트가 부족합니다." : "상품을 구매하지 못했습니다.");
      renderStudyCafeStateUpdate();
      return;
    }
    await ensureStudyCafeShopLoaded({ force: true });
  }
  studyCafeShopState.actionPending = false;
  notify(`${item.name}을(를) 구매했습니다.`);
  renderStudyCafeStateUpdate();
}

async function equipStudyCafeShopItem(item) {
  if (!item || studyCafeShopState.actionPending) return;
  studyCafeShopState.actionPending = true;
  if (isStudyCafeLocalPreview()) {
    if (item.slot === "desk") {
      const deskItems = studyCafeShopState.equipment.desk || [];
      studyCafeShopState.equipment.desk = [...new Set([...deskItems, item.id])].slice(0, 4);
    } else {
      studyCafeShopState.equipment[item.slot] = item.id;
    }
    saveLocalStudyCafeShop();
  } else {
    const result = await requestStudyCafeAction("shop_equip", { itemId: item.id });
    if (!result.ok) {
      studyCafeShopState.actionPending = false;
      notify("아이템을 착용하지 못했습니다.");
      return;
    }
    if (result.equipment.slot === "desk") {
      const deskItems = studyCafeShopState.equipment.desk || [];
      studyCafeShopState.equipment.desk = [...new Set([...deskItems, result.equipment.itemId])].slice(0, 4);
    } else {
      studyCafeShopState.equipment[result.equipment.slot] = result.equipment.itemId;
    }
  }
  studyCafeShopState.actionPending = false;
  notify(`${item.name}을(를) 착용했습니다.`);
  renderStudyCafeStateUpdate();
}

async function unequipStudyCafeShopItem(item) {
  if (!item || studyCafeShopState.actionPending) return;
  studyCafeShopState.actionPending = true;
  if (isStudyCafeLocalPreview()) {
    if (item.slot === "desk") {
      studyCafeShopState.equipment.desk = (studyCafeShopState.equipment.desk || []).filter((itemId) => itemId !== item.id);
    } else {
      delete studyCafeShopState.equipment[item.slot];
    }
    saveLocalStudyCafeShop();
  } else {
    const result = await requestStudyCafeAction("shop_unequip", { slot: item.slot, itemId: item.id });
    if (!result.ok) {
      studyCafeShopState.actionPending = false;
      notify("아이템 착용을 해제하지 못했습니다.");
      return;
    }
    if (item.slot === "desk") {
      studyCafeShopState.equipment.desk = (studyCafeShopState.equipment.desk || []).filter((itemId) => itemId !== item.id);
    } else {
      delete studyCafeShopState.equipment[item.slot];
    }
  }
  studyCafeShopState.actionPending = false;
  notify(`${item.name} 착용을 해제했습니다.`);
  renderStudyCafeStateUpdate();
}

function renderStudyCafeShopAccessDenied() {
  return el("div", { className: "grid student-view student-study-cafe-access" }, [
    el("section", { className: "student-study-cafe-access-card" }, [
      el("span", { className: "study-cafe-access-icon", ariaHidden: "true" }, "🛍️"),
      el("h2", {}, "인터넷 수강생 전용 상점입니다"),
      el("p", {}, "스터디 상점은 인터넷 수강생 화면에서만 이용할 수 있습니다."),
      button("홈으로", "btn secondary", "button", () => navigate("home")),
    ]),
  ]);
}

function renderStudyCafeShopStatus(loading) {
  return el("div", { className: "student-study-shop-page" }, [
    el("header", { className: "study-shop-page-head" }, [
      renderStudyCafeShopBackButton(),
      el("strong", {}, "스터디 상점"),
    ]),
    el("section", { className: "study-shop-status-card" }, [
      el("span", { ariaHidden: "true" }, loading ? "⏳" : "🛠️"),
      el("strong", {}, loading ? "상점을 불러오고 있습니다" : "상점 준비가 아직 완료되지 않았습니다"),
      el("p", {}, loading ? "잠시만 기다려주세요." : "스터디카페와 타이머는 기존처럼 이용할 수 있습니다."),
    ]),
  ]);
}

function renderStudentStudyShop() {
  const student = getAuthedStudent();
  if (getStudentCategory(student) !== "lecture") return renderStudyCafeShopAccessDenied();
  ensureStudyCafeShopLoaded();
  const loading = studyCafeShopState.loading && !studyCafeShopState.loaded;
  if (loading || studyCafeShopState.available === false) return renderStudyCafeShopStatus(loading);

  const categories = [["all", "전체"], ["outfit", "의상"], ["desk", "책상 소품"], ["chair", "의자"], ["head", "모자"], ["owned", "보유"]];
  const ownedIds = new Set(studyCafeShopState.inventory.map((entry) => entry.itemId));
  const items = (studyCafeShopState.items.length ? studyCafeShopState.items : STUDY_CAFE_SHOP_FALLBACK_ITEMS)
    .filter((item) => studyCafeShopState.category === "all" || (
      studyCafeShopState.category === "owned"
        ? ownedIds.has(item.id)
        : item.slot === studyCafeShopState.category
    ));
  const secondsIntoPoint = (STUDY_CAFE_SHOP_POINT_SECONDS - studyCafeShopState.secondsToNextPoint) % STUDY_CAFE_SHOP_POINT_SECONDS;
  const progress = Math.max(0, Math.min(100, secondsIntoPoint / STUDY_CAFE_SHOP_POINT_SECONDS * 100));

  return el("div", { className: "student-study-shop-page" }, [
    el("header", { className: "study-shop-page-head" }, [
      renderStudyCafeShopBackButton(),
      el("div", {}, [
        el("span", {}, "MY STUDY POINT"),
        el("strong", {}, `${studyCafeShopState.balance.toLocaleString("ko-KR")}P`),
      ]),
    ]),
    el("section", { className: "study-shop-point-card" }, [
      el("div", {}, [el("span", {}, "오늘 자동 획득"), el("strong", {}, `${studyCafeShopState.earnedToday}P`)]),
      el("p", {}, "순공시간 30분마다 5P가 쌓여요. 30분 미만은 포인트가 지급되지 않아요."),
      el("div", { className: "study-shop-point-progress", ariaLabel: "다음 포인트 진행률" }, [
        el("i", { style: `width:${progress}%` }),
      ]),
      el("small", {}, `다음 5P까지 ${Math.ceil(studyCafeShopState.secondsToNextPoint / 60)}분`),
    ]),
    el("nav", { className: "study-shop-category-tabs", ariaLabel: "상점 카테고리" }, categories.map(([value, label]) =>
      button(label, `study-shop-category-button ${studyCafeShopState.category === value ? "active" : ""}`, "button", () => {
        studyCafeShopState.category = value;
        renderStudyCafeStateUpdate();
      })
    )),
    items.length
      ? el("section", { className: "study-shop-grid", ariaLabel: "상점 상품" }, items.map((item) => renderStudyCafeShopItemCard(item, ownedIds)))
      : el("section", { className: "study-shop-empty" }, [
          el("strong", {}, "아직 보유한 아이템이 없습니다"),
          el("p", {}, "순공시간으로 포인트를 모아 첫 아이템을 구매해보세요."),
        ]),
    renderStudyCafePointHistory(),
  ]);
}

function renderStudyCafeShopItemCard(item, ownedIds) {
  const owned = ownedIds.has(item.id);
  const equipped = isStudyCafeShopItemEquipped(item);
  const insufficient = !owned && studyCafeShopState.balance < item.price;
  return el("article", { className: `study-shop-item-card ${equipped ? "equipped" : ""}`.trim() }, [
    el("div", { className: `study-shop-item-preview slot-${item.slot} item-${getStudyCafeShopItemCssClass(item.id)}`, ariaHidden: "true" }, item.icon),
    el("div", { className: "study-shop-item-copy" }, [
      el("span", {}, { outfit: "의상", head: "모자", desk: "책상 소품", chair: "의자" }[item.slot] || "아이템"),
      el("strong", {}, item.name),
      el("p", {}, item.description),
    ]),
    el("button", {
      className: `study-shop-item-button ${equipped ? "unequip" : ""}`.trim(),
      type: "button",
      disabled: studyCafeShopState.actionPending,
      onclick: equipped
        ? () => unequipStudyCafeShopItem(item)
        : owned
          ? () => equipStudyCafeShopItem(item)
          : () => purchaseStudyCafeShopItem(item),
    }, equipped ? "착용 해제" : owned ? "착용하기" : `${formatStudyCafeShopPoints(item.price)} 구매`),
    insufficient ? el("small", { className: "study-shop-item-shortage" }, `${formatStudyCafeShopPoints(item.price - studyCafeShopState.balance)} 부족`) : null,
  ]);
}

function renderStudyCafePointHistory() {
  return el("details", { className: "study-shop-history" }, [
    el("summary", {}, `최근 포인트 내역${studyCafeShopState.history.length ? ` (${studyCafeShopState.history.length})` : ""}`),
    studyCafeShopState.history.length
      ? el("div", { className: "study-shop-history-list" }, studyCafeShopState.history.map((entry) => el("div", {}, [
          el("span", {}, [
            el("strong", {}, entry.description || (entry.amount > 0 ? "순공시간 자동 적립" : "아이템 구매")),
            el("small", {}, formatStudyShopHistoryDate(entry.createdAt)),
          ]),
          el("b", { className: entry.amount > 0 ? "earned" : "spent" }, `${entry.amount > 0 ? "+" : ""}${entry.amount}P`),
        ])))
      : el("p", {}, "아직 포인트 내역이 없습니다."),
  ]);
}

function formatStudyShopHistoryDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
