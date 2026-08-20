const CACHE_NAME = "kems-alpha7-web17-shell-v1";
const APP_SHELL = [
  "/",
  "/index.html",
  "/products.html",
  "/agile.html",
  "/compare.html",
  "/remote-access.html",
  "/styles.css?v=alpha7web17",
  "/brand.css?v=alpha7web17",
  "/products.css?v=alpha7web17",
  "/agile.css?v=alpha7web17",
  "/compare.css?v=alpha7web17",
  "/app.js?v=alpha7web17",
  "/platform-label.js?v=alpha7web17",
  "/remote-access.js?v=alpha7web17",
  "/agile-page.js?v=alpha7web17",
  "/compare-page.js?v=alpha7web17",
  "/product-model.js?v=alpha7web17",
  "/brand-lockup.svg?v=alpha7web17",
  "/logo.svg?v=alpha7web17",
  "/icons/kems-192.png?v=alpha7web17",
  "/icons/kems-512.png?v=alpha7web17",
  "/icons/kems-maskable-512.png?v=alpha7web17"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("kems-") && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/api/") || url.pathname === "/site.webmanifest") {
    event.respondWith(fetch(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(url.pathname, copy));
          }
          return response;
        })
        .catch(async () => (await caches.match(url.pathname)) || caches.match("/"))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      }
      return response;
    }))
  );
});
