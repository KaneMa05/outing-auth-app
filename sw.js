const CACHE_NAME = "outing-auth-app-v430-my-seat-time-contrast";
const APP_SHELL = [
  "/",
  "/index.html",
  "/teacher",
  "/teacher.html",
  "/manifest.webmanifest?v=20260512-weekly-detail-flow",
  "/app-icon.png",
  "/apple-touch-icon.png",
  "/styles.css?v=20260911-my-seat-time-contrast",
  "/study-character-fire.css?v=20260911-study-fire-guide-icon",
  "/supabase.js?v=20260514-return-photo-time",
  "/shared.js?v=20260911-study-cafe-visibility",
  "/student.js?v=20260911-attendance-settings",
  "/question-board.js?v=20260902-question-board-skeleton-ui",
  "/inquiry-board.js?v=20260902-inquiry-prefetch",
  "/study-character.js?v=20260911-character-hair-fire",
  "/study-shop.js?v=20260911-hair-shop-rewards",
  "/student-rewards.js?v=20260911-reward-break-celebration",
  "/final-scope-data.js?v=20260908-final-scope-plan",
  "/feedback-hub.js?v=20260911-feedback-free-only",
  "/app.js?v=20260911-hair-shop-bot-admin-reward-break-fire-guide-icon",
  "/manifest.webmanifest?v=20260513-student-attendance-exclude",
  "/styles.css?v=20260911-hair-shop-bot-admin",
  "/teacher.js?v=20260911-admin-dashboard-retry",
  "/study-character.js?v=20260911-character-hair",
  "/study-cafe-bot-admin.js?v=20260911-bot-admin",
  "/teacher-grades.js?v=20260903-weekly-exams-14-button",
  "/teacher-fitness.js?v=20260714-grade-report-print-setup",
  "/teacher-students.js?v=20260901-student-exam-numbers",
  "/teacher-settings.js?v=20260806-learner-board-copy",
  "/teacher-penalties.js?v=20260716-penalty-reason-edit",
  "/teacher-seats.js?v=20260826-add-seats-117-118",
  "/question-board.js?v=20260819-attendance-board-review",
  "/inquiry-board.js?v=20260828-independent-inquiries",
  "/curriculum-data.js?v=20260812-admin-builder",
  "/curriculum-admin.js?v=20260828-editable-stage-title",
  "/app.js?v=20260911-hair-shop-bot-admin",
  "/fonts/GongGothicLight.woff",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/notification-icon.png",
  "/notification-badge.png",
  "/coast-guard-eagle-emblem.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/_vercel/")
  ) return;
  if (url.pathname === "/config.js" || url.pathname === "/sw.js") {
    event.respondWith(fetch(event.request, { cache: "no-store" }));
    return;
  }

  const isNavigation = event.request.mode === "navigate";
  const isStaticAsset = ["style", "script", "font", "image", "manifest"].includes(
    event.request.destination
  );
  if (isStaticAsset) {
    event.respondWith(
      caches.match(event.request).then(async (cached) => {
        if (cached) return cached;
        const response = await fetch(event.request);
        if (response.ok) {
          const copy = response.clone();
          const cache = await caches.open(CACHE_NAME);
          await cache.put(event.request, copy);
        }
        return response;
      })
    );
    return;
  }

  if (!isNavigation) return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(self.registration.showNotification(data.title || "등록 신청 결과", {
    body: data.body || "검수 결과를 앱에서 확인해주세요.",
    icon: "/notification-icon.png",
    badge: "/notification-badge.png",
    tag: data.tag || "lecture-application-review",
    data: { url: data.url || "/" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
      const client = clients.find((item) => new URL(item.url).origin === self.location.origin);
      if (client) {
        if ("navigate" in client) await client.navigate(targetUrl);
        return client.focus();
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
