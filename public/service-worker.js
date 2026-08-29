const CACHE_NAME = "kems-web-shell-build3";
const APP_SHELL = [
  "/",
  "/index.html",
  "/kems.html",
  "/agile.html",
  "/compare.html",
  "/performance.html",
  "/settings.html",
  "/remote-access.html",
  "/styles.css?v=build1",
  "/brand.css?v=build1",
  "/agile.css?v=build3",
  "/compare.css?v=build1",
  "/web21.css?v=build1",
  "/web26.css?v=build1",
  "/mobile-pwa.css?v=build1",
  "/pwa-bootstrap.js?v=build1",
  "/pwa-settings.js?v=build1",
  "/panel-state.js?v=build1",
  "/live-page.js?v=build1",
  "/panel-widget.js?v=build1",
  "/kems-page.js?v=build3",
  "/agile-page.js?v=build3",
  "/flow-presentation-model.js?v=build3",
  "/ev-policy-model.js?v=build1",
  "/ev-policy-parity.js?v=build1",
  "/compare-page.js?v=build1",
  "/product-model.js?v=build1",
  "/performance-page.js?v=build1",
  "/settings-page.js?v=build1",
  "/brand-lockup.svg?v=build1",
  "/logo.svg?v=build1",
  "/icons/kems-192.png?v=build1",
  "/icons/kems-512.png?v=build1",
  "/icons/kems-maskable-512.png?v=build1",
];

function isSameOriginResponse(response) {
  if (!response?.ok || response.redirected || response.type === "opaqueredirect") return false;
  try {
    return new URL(response.url).origin === self.location.origin;
  } catch {
    return false;
  }
}

function isAccessRedirect(response) {
  if (!response || (!response.redirected && response.type !== "opaqueredirect")) return false;
  if (response.type === "opaqueredirect") return true;
  try {
    return new URL(response.url).origin !== self.location.origin;
  } catch {
    return true;
  }
}

async function notifyAuthRequired() {
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of windows) client.postMessage({ type: "KEMS_AUTH_REQUIRED" });
}

function authRequiredResponse() {
  return new Response(
    JSON.stringify({
      error: "KEMS property authentication is required",
      authRequired: true,
    }),
    {
      status: 401,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    },
  );
}

async function fetchWithAccessGuard(request, { api = false } = {}) {
  const response = await fetch(request);
  if (!isAccessRedirect(response)) return response;

  await notifyAuthRequired();
  return api ? authRequiredResponse() : response;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      for (const path of APP_SHELL) {
        try {
          const response = await fetch(path, { cache: "reload" });
          if (isSameOriginResponse(response)) await cache.put(path, response);
        } catch {
          // A temporary network/auth failure must not prevent the new worker installing.
        }
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("kems-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetchWithAccessGuard(request, { api: true }));
    return;
  }

  if (url.pathname === "/site.webmanifest") {
    event.respondWith(fetchWithAccessGuard(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetchWithAccessGuard(request);
          if (isSameOriginResponse(response)) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(url.pathname, response.clone());
          }
          return response;
        } catch {
          return (await caches.match(url.pathname)) || (await caches.match("/"));
        }
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      if (cached) return cached;

      const response = await fetchWithAccessGuard(request);
      if (isSameOriginResponse(response)) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    })(),
  );
});
