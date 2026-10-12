/* Service Worker for Kkary Driver PWA */

const CACHE_NAME = "kkary-driver-v1";
const ASSETS_TO_CACHE = [
  "/",
  "/index.html",
  "/manifest-driver.json",
  "/icons/driver-192.png",
  "/icons/driver-512.png",
  "/icons/kkary-target.svg",
  "/images/driver-landing.png",
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(ASSETS_TO_CACHE).catch(() => {
        console.log("Some driver assets could not be cached during install");
      }),
    ),
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(cacheNames =>
      Promise.all(cacheNames.filter(name => name !== CACHE_NAME).map(name => caches.delete(name))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  if (event.request.url.includes("/api") || event.request.url.includes("trpc")) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(JSON.stringify({ error: "Offline" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (!response || response.status !== 200 || response.type === "error") return response;
        const responseClone = response.clone();
        void caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
        return response;
      })
      .catch(() =>
        caches.match(event.request).then(response => {
          if (response) return response;
          if (event.request.destination === "document") return caches.match("/index.html");
          return undefined;
        }),
      ),
  );
});

self.addEventListener("message", event => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});
