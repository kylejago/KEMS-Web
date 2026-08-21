const CACHE_NAME = "kems-alpha7-web33-shell-v1";
const APP_SHELL = [
  "/",
  "/index.html",
  "/agile.html",
  "/compare.html",
  "/performance.html",
  "/settings.html",
  "/remote-access.html",
  "/styles.css?v=alpha7web33",
  "/brand.css?v=alpha7web33",
  "/agile.css?v=alpha7web33",
  "/compare.css?v=alpha7web33",
  "/web21.css?v=alpha7web33",
  "/web26.css?v=alpha7web33",
  "/mobile-pwa.css?v=alpha7web33",
  "/pwa-bootstrap.js?v=alpha7web33",
  "/pwa-settings.js?v=alpha7web33",
  "/live-page.js?v=alpha7web33",
  "/panel-widget.js?v=alpha7web33",
  "/agile-page.js?v=alpha7web33",
  "/web21-agile.js?v=alpha7web33",
  "/compare-page.js?v=alpha7web33",
  "/product-model.js?v=alpha7web33",
  "/performance-page.js?v=alpha7web33",
  "/settings-page.js?v=alpha7web33",
  "/brand-lockup.svg?v=alpha7web33",
  "/logo.svg?v=alpha7web33",
  "/icons/kems-192.png?v=alpha7web33",
  "/icons/kems-512.png?v=alpha7web33",
  "/icons/kems-maskable-512.png?v=alpha7web33",
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
