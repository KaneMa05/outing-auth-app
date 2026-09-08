const CACHE_NAME = "outing-auth-app-v391-study-cafe-admin-sync";
const APP_SHELL = [
  "/",
  "/index.html",
  "/teacher",
  "/teacher.html",
  "/styles.css?v=20260908-final-scope-plan",
  "/styles.css?v=20260908-study-cafe-admin-sync",
  "/fonts/GongGothicLight.woff",
  "/supabase.js?v=20260514-return-photo-time",
  "/shared.js?v=20260819-teacher-reason-photo",
  "/student.js?v=20260819-attendance-photo-feedback",
  "/question-board.js?v=20260902-question-board-skeleton-ui",
  "/question-board.js?v=20260819-attendance-board-review",
  "/inquiry-board.js?v=20260902-inquiry-prefetch",
  "/inquiry-board.js?v=20260828-independent-inquiries",
  "/study-shop.js?v=20260828-local-grant-20000",
  "/final-scope-data.js?v=20260908-final-scope-plan",
  "/teacher.js?v=20260908-study-cafe-admin-sync",
  "/teacher-grades.js?v=20260903-weekly-exams-14-button",
  "/teacher-fitness.js?v=20260714-grade-report-print-setup",
  "/teacher-students.js?v=20260901-student-exam-numbers",
  "/teacher-settings.js?v=20260806-learner-board-copy",
  "/teacher-penalties.js?v=20260716-penalty-reason-edit",
  "/teacher-seats.js?v=20260826-add-seats-117-118",
  "/curriculum-data.js?v=20260812-admin-builder",
  "/curriculum-admin.js?v=20260828-editable-stage-title",
  "/app.js?v=20260908-cost-safety",
  "/manifest.webmanifest",
  "/app-icon.png",
  "/icon-192.png",
  "/icon-512.png",
  "/notification-icon.png",
  "/notification-badge.png",
  "/apple-touch-icon.png",
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
