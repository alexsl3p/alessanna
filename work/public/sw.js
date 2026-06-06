// Pass-through service worker.
//
// Its ONLY job is to make the app installable (Android/iOS "Add to home
// screen"). It deliberately does NOT cache the app shell or assets: caching
// the shell caused masters to get stuck on an old build even after clearing
// the browser cache. Every request goes straight to the network, so the
// latest Vercel deploy always loads.
//
// Bump CACHE_NAME whenever you want to force-purge any caches a previous
// service-worker version may have created.
const CACHE_NAME = "alessanna-pwa-v3";

self.addEventListener("install", () => {
  // Activate the new worker immediately instead of waiting for old tabs to close.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Network-only: never intercept with a cached response, so users can't get
// pinned to a stale shell. (A fetch listener is still required for the PWA
// install prompt to appear.)
self.addEventListener("fetch", () => {
  // intentionally empty — let the browser handle every request via the network
});
