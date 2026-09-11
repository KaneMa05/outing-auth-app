const studentRewardsState = {
  studentId: "", eligible: null, balance: 0, welcomePoints: 100, challengePoints: null,
  completed: false, notifications: [], pending: false, lastChecked: 0, timer: null,
  scheduled: false, modal: null, modalCleanup: null, acknowledged: new Set(), welcomeChecked: false,
  toastShown: new Set(), presentationTimer: null, scheduledForce: false, resync: false,
};

function getRewardStudent() {
  const student = getAuthedStudent();
  return APP_MODE !== "teacher" && student && !isTeacherAppAccount(student)
    && student.className !== "스터디카페 운영계정" ? student : null;
}

async function requestStudentRewards(action, payload = {}) {
  const student = getRewardStudent();
  if (!student) return { ok: false };
  if (isStudyCafeLocalPreview()) return requestLocalStudentRewards(student, action, payload);
  const profile = getStudentProfile(student?.id);
  if (!profile?.deviceToken) return { ok: false };
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch("/api/student-rewards", {
      method: "POST", credentials: "same-origin", signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload, studentId: student.id, deviceToken: profile.deviceToken,
        client: { displayMode: isStandaloneStudentApp() ? "standalone" : "browser", userAgent: navigator.userAgent || "" } }),
    });
    const data = await response.json();
    return { ...data, ok: response.ok && data.ok === true };
  } catch (_) { return { ok: false }; }
  finally { window.clearTimeout(timeout); }
}

function scheduleStudentRewardsSync(options = {}) {
  if (!getRewardStudent()) return;
  if (!studentRewardsState.timer) {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") scheduleStudentRewardsSync({ force: true });
    });
    studentRewardsState.timer = window.setInterval(() => {
      if (document.visibilityState === "hidden" || !getRewardStudent()) return;
      showPendingStudentReward();
      const studying = typeof studyCafePreviewState !== "undefined" && studyCafePreviewState.running;
      if (studentRewardsState.eligible !== false && (studentRewardsState.eligible === null
        || (!studentRewardsState.completed && studying) || studentRewardsState.notifications.length)) {
        syncStudentRewards();
      }
    }, 60000);
  }
  studentRewardsState.scheduledForce ||= options.force === true;
  if (studentRewardsState.scheduled) return;
  studentRewardsState.scheduled = true;
  window.setTimeout(() => {
    studentRewardsState.scheduled = false;
    const force = studentRewardsState.scheduledForce;
    studentRewardsState.scheduledForce = false;
    syncStudentRewards({ force });
  }, 0);
}

async function syncStudentRewards(options = {}) {
  const student = getRewardStudent();
  if (!student || document.visibilityState === "hidden") return;
  const rewards = studentRewardsState;
  if (rewards.studentId !== student.id) {
    rewards.modalCleanup?.();
    if (rewards.modal?.isConnected) rewards.modal.remove();
    Object.assign(rewards, { studentId: student.id, eligible: null, completed: false, notifications: [],
      balance: 0, welcomePoints: 100, challengePoints: null, pending: false, lastChecked: 0, modal: null, modalCleanup: null,
      acknowledged: new Set(), toastShown: new Set(), welcomeChecked: false, resync: false });
  }
  const welcome = currentRoute === "home";
  if (rewards.pending) {
    rewards.resync ||= options.force === true;
    showPendingStudentReward();
    return;
  }
  if (!options.force && !(welcome && !rewards.welcomeChecked) && Date.now() - rewards.lastChecked < 60000) {
    showPendingStudentReward();
    return;
  }
  // Grant the welcome gift only on a home visit. Other pages may retry an earned bonus.
  rewards.pending = true;
  rewards.lastChecked = Date.now();
  const result = await requestStudentRewards("sync", { welcome });
  if (getRewardStudent()?.id !== student.id || rewards.studentId !== student.id) return;
  rewards.pending = false;
  if (rewards.resync) {
    rewards.resync = false;
    scheduleStudentRewardsSync({ force: true });
  }
  if (!result.ok) return;
  if (welcome) rewards.welcomeChecked = true;
  const needsRender = rewards.eligible !== result.eligible;
  const previousBalance = rewards.balance;
  Object.assign(rewards, {
    eligible: result.eligible === true, balance: Number(result.balance) || 0,
    welcomePoints: Number(result.welcomePoints) || 100, challengePoints: Number(result.challengePoints) || null,
    completed: result.completed === true, notifications: Array.isArray(result.notifications) ? result.notifications : [],
  });
  if (rewards.eligible && previousBalance !== rewards.balance && typeof studyCafeShopState !== "undefined") {
    studyCafeShopState.balance = rewards.balance;
    studyCafeShopState.loaded = false;
  }
  if (needsRender && ["mypage", "study-shop"].includes(currentRoute)) render();
  showPendingStudentReward();
}

function studentRewardAcknowledgementKey(studentId, reward) {
  return `student-reward-seen:${studentId}:${reward.key}:${reward.awardedAt}`;
}

function hasSeenStudentReward(studentId, reward) {
  const key = studentRewardAcknowledgementKey(studentId, reward);
  if (studentRewardsState.acknowledged.has(key)) return true;
  try { return localStorage.getItem(key) === "1"; } catch (_) { return false; }
}

function acknowledgeStudentReward(studentId, reward) {
  const key = studentRewardAcknowledgementKey(studentId, reward);
  studentRewardsState.acknowledged.add(key);
  try { localStorage.setItem(key, "1"); } catch (_) { /* Server receipt is authoritative across devices. */ }
  if (getRewardStudent()?.id === studentId) {
    requestStudentRewards("acknowledge", { rewardKey: reward.key }).then((result) => {
      if (result.ok && studentRewardsState.studentId === studentId) {
        studentRewardsState.notifications = studentRewardsState.notifications.filter((item) => item.key !== reward.key);
      }
    });
  }
}

function renderStudentRewardRules() {
  const rewards = studentRewardsState;
  return el("div", { className: "student-reward-copy" }, [
    el("section", { className: "student-reward-method" }, [
      el("div", { className: "student-reward-method-heading" }, [
        el("strong", {}, "① 매일 공부"),
        el("span", { className: "student-reward-method-points" }, "30분마다 5P"),
      ]),
      el("p", {}, "스터디카페 순공시간 30분마다 자동 적립"),
      el("p", { className: "student-reward-method-note" }, "매일 반복 적립 · 일시정지 시간 제외"),
    ]),
    el("section", { className: "student-reward-method" }, [
      el("div", { className: "student-reward-method-heading" }, [
        el("strong", {}, "② 첫 홈 방문"),
        el("span", { className: "student-reward-method-points" }, `${rewards.welcomePoints.toLocaleString("ko-KR")}P`),
      ]),
      el("p", {}, "가입 후 홈에 처음 들어오면 지급"),
      el("p", { className: "student-reward-method-note" }, "신규 수강생 · 계정당 1회 자동 지급"),
    ]),
    rewards.challengePoints ? el("section", { className: "student-reward-method" }, [
      el("div", { className: "student-reward-method-heading" }, [
        el("strong", {}, "③ 3일 공부 루틴"),
        el("span", { className: "student-reward-method-points" }, `${rewards.challengePoints.toLocaleString("ko-KR")}P`),
      ]),
      el("p", {}, "스터디카페에서 하루 5시간 × 3일 연속"),
      el("p", { className: "student-reward-method-note" }, "신규 수강생 · 계정당 1회 자동 지급"),
      el("details", { className: "student-reward-method-details" }, [
        el("summary", {}, "세부 조건"),
        el("ul", {}, [
          el("li", {}, "별도 신청 없이 자동 참여"),
          el("li", {}, "공부 타이머 합산 · 일시정지 제외"),
          el("li", {}, "하루 기준: 한국 시간 0시~24시"),
          el("li", {}, "하루를 놓치면 다음 5시간 달성일부터 재시작"),
          el("li", {}, "기한 없이 재도전 가능"),
        ]),
      ]),
    ]) : null,
  ]);
}

function showPendingStudentReward() {
  const student = getRewardStudent();
  const rewards = studentRewardsState;
  if (!student || student.id !== rewards.studentId || !rewards.eligible
    || document.visibilityState === "hidden"
    || !["home", "study-cafe", "study-timer", "study-shop", "mypage", "study-character"].includes(currentRoute)) return;
  for (const notification of rewards.notifications) {
    if (hasSeenStudentReward(student.id, notification)) {
      acknowledgeStudentReward(student.id, notification);
      continue;
    }
    if (notification.key === "welcome" && currentRoute !== "home") continue;
    if (notification.key === "routine3" && isStudentRewardStudyBusy()) {
      showStudentChallengeRewardToast(student.id, notification);
      continue;
    }
    if (hasOpenAppModal()) {
      retryStudentRewardPresentation();
      return;
    }
    const welcome = notification.key === "welcome";
    const content = el("div", { className: "student-reward-copy" }, [
      renderStudentRewardCelebration(notification, welcome),
      el("p", { className: "student-reward-message" }, welcome
        ? `웰컴포인트 ${notification.amount.toLocaleString("ko-KR")}P를 드렸어요.`
        : `하루 5시간씩, 3일 연속 공부했어요. 달성 보너스 ${notification.amount.toLocaleString("ko-KR")}P가 지급됐어요.`),
      welcome && rewards.challengePoints ? el("section", { className: "student-reward-challenge-copy" }, [
        el("strong", {}, "🌱 3일 공부 루틴 챌린지"),
        el("p", {}, `스터디카페에서 하루 5시간씩, 3일 연속 공부하면 추가 보너스 ${rewards.challengePoints.toLocaleString("ko-KR")}P를 드려요.`),
        el("p", {}, "별도 신청 없이 자동으로 참여됩니다."),
      ]) : null,
    ]);
    const previousFocus = document.activeElement;
    let dismissed = false;
    let stopAnimation = () => {};
    const dismiss = () => {
      if (dismissed) return;
      dismissed = true;
      stopAnimation();
      if (!modal.isConnected || getRewardStudent()?.id !== student.id) {
        document.removeEventListener("keydown", escape, true);
        return;
      }
      acknowledgeStudentReward(student.id, notification);
      closeInfoModal();
      document.removeEventListener("keydown", escape, true);
      rewards.modal = null;
      rewards.modalCleanup = null;
      if (previousFocus?.isConnected) previousFocus.focus();
      window.setTimeout(showPendingStudentReward, 250);
    };
    const escape = (event) => { if (event.key === "Escape") dismiss(); };
    const { modal, confirmButton } = openInfoModal({
      title: welcome ? "가입을 환영해요!" : "3일 공부 루틴 챌린지 달성!",
      content, className: `student-reward-modal student-reward-celebration ${welcome ? "reward-welcome" : "reward-routine"}`,
      confirmLabel: "좋아요!", onConfirm: dismiss,
    });
    rewards.modal = modal;
    stopAnimation = animateStudentRewardAmount(modal, notification.amount);
    rewards.modalCleanup = () => {
      stopAnimation();
      document.removeEventListener("keydown", escape, true);
    };
    modal.setAttribute("aria-label", welcome ? "가입 환영 포인트" : "챌린지 달성 보상");
    modal.querySelector(".info-modal-backdrop").addEventListener("click", dismiss, true);
    document.addEventListener("keydown", escape, true);
    confirmButton?.focus();
    return;
  }
}

function isStudentRewardStudyBusy() {
  return (typeof studyCafePreviewState !== "undefined" && studyCafePreviewState.running === true)
    || (typeof studyCafeTimerActionPending !== "undefined" && studyCafeTimerActionPending)
    || (typeof isStudyCafeTimerRecoveryRequired === "function" && isStudyCafeTimerRecoveryRequired());
}

function showStudentChallengeRewardToast(studentId, receipt) {
  // A toast does not acknowledge the receipt: the celebration remains pending
  // on the server until the student sees and closes its modal during a break.
  const key = `student-reward-toast:${studentId}:${receipt.key}:${receipt.awardedAt}`;
  if (studentRewardsState.toastShown.has(key)) return;
  try { if (localStorage.getItem(key) === "1") return; } catch (_) { /* Session deduplication still works. */ }
  if (typeof notify !== "function") return;
  notify(`🎉 3일 챌린지 달성! +${receipt.amount.toLocaleString("ko-KR")}P가 적립됐어요.`);
  studentRewardsState.toastShown.add(key);
  try { localStorage.setItem(key, "1"); } catch (_) { /* Retry only in a new session. */ }
}

function retryStudentRewardPresentation() {
  if (studentRewardsState.presentationTimer) return;
  // A pause/recovery dialog may close without another render. Retry presentation
  // only; this timer never polls the reward API or modifies the study timer.
  studentRewardsState.presentationTimer = window.setTimeout(() => {
    studentRewardsState.presentationTimer = null;
    showPendingStudentReward();
  }, 500);
}

function renderStudentRewardHelp() {
  if (studentRewardsState.studentId !== getRewardStudent()?.id || !studentRewardsState.eligible) return null;
  return el("details", { className: "study-shop-history student-reward-help" }, [
    el("summary", {}, "포인트 받는 방법"), renderStudentRewardRules(),
  ]);
}

function renderStudentRewardCelebration(notification, welcome) {
  const confetti = Array.from({ length: 12 }, (_, i) => {
    const side = i % 2 ? 1 : -1;
    return el("i", { className: "student-reward-confetti", style:
      `--x:${side * (44 + Math.floor(i / 2) * 15)}px;--y:${-60 + (i % 6) * 28}px;--turn:${side * (110 + i * 27)}deg;--delay:${100 + (i % 4) * 65}ms;--confetti-color:${["#e5b747", "#529c8b", "#a8cbb5", "#edb68e"][i % 4]}` });
  });
  return el("section", { className: "student-reward-hero" }, [
    el("div", { className: "student-reward-art", "aria-hidden": "true" }, [
      el("div", { className: "student-reward-halo" }), ...confetti,
      el("span", { className: "student-reward-spark spark-left" }, "✦"),
      el("span", { className: "student-reward-spark spark-right" }, "✦"),
      el("div", { className: "student-reward-coin" }, [el("span", {}, "P")]),
      !welcome ? el("span", { className: "student-reward-medal" }, "✓") : null,
    ]),
    el("span", { className: "student-reward-kicker" }, welcome ? "첫 시작을 위한 선물" : "꾸준함으로 얻은 보너스"),
    el("div", { className: "student-reward-amount", role: "img", ariaLabel: `${notification.amount.toLocaleString("ko-KR")}포인트 지급 완료` }, [
      el("span", { "aria-hidden": "true" }, "+"),
      el("span", { "data-reward-count": String(notification.amount), "aria-hidden": "true" }, notification.amount.toLocaleString("ko-KR")),
      el("span", { className: "student-reward-unit", "aria-hidden": "true" }, "P"),
    ]),
    el("span", { className: "student-reward-received" }, [el("span", { "aria-hidden": "true" }, "✓"), " 내 포인트에 적립됐어요"]),
  ]);
}

function animateStudentRewardAmount(modal, amount) {
  const counter = modal.querySelector("[data-reward-count]");
  if (!counter?.dataset || typeof window.requestAnimationFrame !== "function"
    || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return () => {};
  let frame = null;
  let startedAt = null;
  let cancelled = false;
  const finish = () => { counter.textContent = amount.toLocaleString("ko-KR"); };
  counter.textContent = "0";
  const tick = (time) => {
    if (cancelled) return;
    if (!modal.isConnected || document.visibilityState === "hidden") { finish(); return; }
    startedAt ??= time;
    const progress = Math.min(1, (time - startedAt) / 900);
    counter.textContent = Math.round(amount * (1 - (1 - progress) ** 3)).toLocaleString("ko-KR");
    if (progress < 1) frame = window.requestAnimationFrame(tick);
    else finish();
  };
  frame = window.requestAnimationFrame(tick);
  return () => {
    cancelled = true;
    if (frame !== null) window.cancelAnimationFrame(frame);
    finish();
  };
}

function renderStudentRewardAccountLink() {
  if (studentRewardsState.studentId !== getRewardStudent()?.id || !studentRewardsState.eligible) return null;
  return button("", "student-history-button-card student-settings-link", "button", openStudentRewardHistory, [
    el("div", { className: "student-history-head" }, [el("h2", {}, "포인트"), el("span", {}, "적립 내역 · 포인트 받는 방법")]),
    el("span", { className: "student-settings-chevron", ariaHidden: "true" }, "›"),
  ]);
}

async function openStudentRewardHistory() {
  const studentId = getRewardStudent()?.id;
  const history = el("div", { className: "study-shop-history-list" }, "내역을 불러오는 중이에요.");
  const { modal } = openInfoModal({ title: "내 포인트", className: "student-reward-modal", content: el("div", { className: "student-reward-copy" }, [
    el("strong", {}, `보유 ${studentRewardsState.balance.toLocaleString("ko-KR")}P`),
    renderStudentRewardHelp(), history,
    renderLocalStudentRewardControls(),
  ]) });
  const result = await requestStudentRewards("history");
  if (!modal.isConnected || getRewardStudent()?.id !== studentId) return;
  history.replaceChildren();
  if (!result.ok) { history.textContent = "내역을 불러오지 못했어요. 잠시 후 다시 확인해주세요."; return; }
  if (!result.history?.length) { history.textContent = "아직 포인트 내역이 없어요."; return; }
  result.history.forEach((entry) => history.appendChild(el("div", {}, [
    el("span", {}, [el("strong", {}, entry.description), el("small", {}, formatStudyShopHistoryDate(entry.created_at))]),
    el("b", { className: entry.amount > 0 ? "earned" : "spent" }, `${entry.amount > 0 ? "+" : ""}${entry.amount}P`),
  ])));
}

const localStudentRewardCache = new Map();

function requestLocalStudentRewards(student, action, payload = {}) {
  // This branch is reachable only through the existing localhost preview gate.
  // It never calls the server, even when the preview account has no device token.
  if (!isStudyCafeLocalPreview() || !getRewardStudent() || student.id !== getRewardStudent().id) return { ok: false };
  const storageKey = `ronpark-student-rewards-local:v1:${student.id}`;
  let saved = localStudentRewardCache.get(storageKey) || { receipts: {} };
  try { saved = JSON.parse(localStorage.getItem(storageKey) || "null") || saved; } catch (_) { /* In-memory preview remains available. */ }
  if (!saved.receipts || typeof saved.receipts !== "object") saved.receipts = {};
  hydrateLocalStudyCafeShop(student);
  const award = (key) => {
    if (saved.receipts[key]) return;
    const id = `local-reward:${key}:v1`;
    // If storage was interrupted after the wallet write, recover the receipt
    // from the ledger instead of crediting the same gift a second time.
    let entry = studyCafeShopState.history.find((item) => item.id === id);
    if (!entry) {
      const amount = key === "welcome" ? 100 : 300;
      studyCafeShopState.balance += amount;
      entry = { id, amount, balanceAfter: studyCafeShopState.balance, itemId: "",
        description: key === "welcome" ? "웰컴포인트" : "3일 공부 루틴 달성 보너스",
        createdAt: new Date().toISOString() };
      studyCafeShopState.history.unshift(entry);
      saveLocalStudyCafeShop();
    }
    saved.receipts[key] = { key, amount: entry.amount, awardedAt: entry.createdAt, acknowledged: false };
  };
  if (action === "sync" && payload.welcome === true) award("welcome");
  if (action === "preview" && ["welcome", "routine3"].includes(payload.rewardKey)) {
    award(payload.rewardKey);
    const receipt = saved.receipts[payload.rewardKey];
    receipt.acknowledged = false;
    const seenKey = studentRewardAcknowledgementKey(student.id, receipt);
    studentRewardsState.acknowledged.delete(seenKey);
    try { localStorage.removeItem(seenKey); } catch (_) { /* Optional browser cache. */ }
    const toastKey = `student-reward-toast:${student.id}:${receipt.key}:${receipt.awardedAt}`;
    studentRewardsState.toastShown.delete(toastKey);
    try { localStorage.removeItem(toastKey); } catch (_) { /* Local replay only. */ }
  }
  if (action === "acknowledge" && saved.receipts[payload.rewardKey]) saved.receipts[payload.rewardKey].acknowledged = true;
  localStudentRewardCache.set(storageKey, saved);
  try { localStorage.setItem(storageKey, JSON.stringify(saved)); } catch (_) { /* Local-only state. */ }
  if (action === "history") return { ok: true, history: studyCafeShopState.history.map((entry) => ({
    amount: entry.amount, description: entry.description, created_at: entry.createdAt,
  })) };
  return { ok: true, eligible: true, welcomePoints: 100, challengePoints: 300,
    balance: studyCafeShopState.balance, completed: Boolean(saved.receipts.routine3),
    notifications: Object.values(saved.receipts).filter((receipt) => !receipt.acknowledged) };
}

function renderLocalStudentRewardControls() {
  if (!isStudyCafeLocalPreview() || !getRewardStudent()) return null;
  return el("details", { className: "study-shop-history" }, [
    el("summary", {}, "로컬 보상 미리보기"),
    el("div", { className: "student-reward-copy" }, [
      el("p", {}, "실제 서버 포인트에 영향을 주지 않는 미리보기예요. 같은 보상을 다시 보아도 포인트는 중복 적립되지 않아요."),
      button("웰컴 안내 다시 보기", "btn secondary", "button", () => previewLocalStudentReward("welcome")),
      button("챌린지 달성 미리보기", "btn secondary", "button", () => previewLocalStudentReward("routine3")),
    ]),
  ]);
}

async function previewLocalStudentReward(rewardKey) {
  if (!isStudyCafeLocalPreview() || !getRewardStudent()) return;
  const result = await requestStudentRewards("preview", { rewardKey });
  if (!result.ok) return;
  closeInfoModal();
  if (rewardKey === "welcome") navigate("home");
  await syncStudentRewards({ force: true });
}
