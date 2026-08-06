const CACHE_NAME = "outing-auth-app-v311-learner-board-copy";
const APP_SHELL = [
  "/",
  "/index.html",
  "/teacher",
  "/teacher.html",
  "/styles.css",
  "/supabase.js",
  "/shared.js",
  "/student.js",
  "/question-board.js",
  "/teacher.js",
  "/teacher-grades.js",
  "/teacher-students.js",
  "/teacher-settings.js",
  "/teacher-penalties.js",
  "/teacher-seats.js",
  "/app.js",
  "/manifest.webmanifest",
  "/app-icon.png",
  "/icon-192.png",
  "/icon-512.png",
  "/notification-icon.png",
  "/notification-badge.png",
  "/apple-touch-icon.png"
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
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (url.pathname === "/config.js" || url.pathname === "/sw.js") {
    event.respondWith(fetch(event.request, { cache: "no-store" }));
    return;
  }

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
