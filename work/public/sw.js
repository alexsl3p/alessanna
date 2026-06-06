// Minimal service worker — makes the app installable on Android/iOS.
// No caching strategy: every request goes to network. This avoids
// serving stale CRM data from cache while still enabling the PWA
// install prompt and offline-capable shell on iOS Safari.

const CACHE_NAME = "alessanna-pwa-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(["/", "/login"])
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first: always try network, fall back to cache only for navigation
self.addEventListener("fetch", (event) => {
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match("/").then((r) => r || Response.error())
      )
    );
  }
  // All other requests (API, assets): pass through without interference
});
